import type { Types } from 'mongoose';
import {
  PROBE_ERROR_LABELS,
  environmentDisplayName,
  type HealthStatus,
  type NotificationDto,
  type NotificationEvent,
  type UserSettings,
} from '@wt/shared';
import { config } from '../config/env.js';
import type { AppDeps } from '../deps.js';
import { Notification, Website, type MonitorDoc, type NotificationDoc, type WebsiteDoc } from '../models/index.js';
import { AppError } from '../utils/errors.js';
import { iso } from '../utils/ids.js';
import { logger } from '../utils/logger.js';

const MAX_ATTEMPTS = 3;
const SEND_LEASE_MS = 2 * 60 * 1000;

export interface NotificationUser {
  _id: Types.ObjectId;
  email: string;
  settings: UserSettings;
}

export function recipientFor(user: NotificationUser): string {
  return user.settings.notifications.recipient || user.email;
}

/** Picks the event (if any) for a status transition. Only transitions notify — never every failure. */
export function transitionEvent(
  monitor: Pick<MonitorDoc, 'type'>,
  previous: HealthStatus,
  next: HealthStatus,
  prefs: UserSettings['notifications'],
): NotificationEvent | null {
  if (!prefs.emailEnabled) return null;
  const becameDown = next === 'DOWN' && previous !== 'DOWN';
  if (monitor.type === 'WAKE_UP') return becameDown && prefs.onWakeUpFailure ? 'WAKE_UP_FAILING' : null;
  if (becameDown && prefs.onDown) return 'MONITOR_DOWN';
  if (previous === 'DOWN' && (next === 'UP' || next === 'DEGRADED') && prefs.onRecovery) return 'MONITOR_RECOVERED';
  return null;
}

function formatTime(date: Date | null, timezone: string): string {
  if (!date) return 'never';
  // dateStyle/timeStyle cannot be combined with timeZoneName, so list the parts explicitly.
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'short',
  }).format(date);
}

function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return 'less than a minute';
  if (minutes < 60) return `${minutes} minute(s)`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hour(s) ${minutes % 60} minute(s)`;
}

interface MessageInput {
  event: NotificationEvent;
  monitor: MonitorDoc;
  website: Pick<WebsiteDoc, '_id' | 'name' | 'environments'>;
  /** When the monitor entered its previous status (used for downtime duration). */
  previousStatusChangedAt: Date | null;
  timezone: string;
}

export function renderMessage({ event, monitor, website, previousStatusChangedAt, timezone }: MessageInput) {
  const env = website.environments.find((e) => e._id.equals(monitor.environmentId));
  const name = env ? `${website.name} (${environmentDisplayName(env)})` : website.name;
  const s = monitor.state;
  const lastResult = s.lastStatusCode !== null ? `HTTP ${s.lastStatusCode}` : s.lastErrorCode ? PROBE_ERROR_LABELS[s.lastErrorCode] : '—';
  const link = `${config.appUrl}/websites/${website._id.toString()}`;
  const now = new Date();

  switch (event) {
    case 'MONITOR_DOWN':
      return {
        subject: `[Website Tracker] DOWN: ${name}`,
        text: [
          'Website down',
          '',
          `${name} has failed ${s.consecutiveFailures} consecutive health checks.`,
          '',
          `URL: ${monitor.url}`,
          `Last result: ${lastResult}`,
          s.lastErrorMessage ? `Error: ${s.lastErrorMessage}` : null,
          `Last successful check: ${formatTime(s.lastSuccessAt, timezone)}`,
          `Detected: ${formatTime(now, timezone)}`,
          '',
          `Details: ${link}`,
        ]
          .filter((line) => line !== null)
          .join('\n'),
      };
    case 'MONITOR_RECOVERED':
      return {
        subject: `[Website Tracker] RECOVERED: ${name}`,
        text: [
          'Website back online',
          '',
          `${name} is responding again.`,
          '',
          `URL: ${monitor.url}`,
          `Last result: ${lastResult}${s.lastResponseMs !== null ? ` in ${s.lastResponseMs} ms` : ''}`,
          previousStatusChangedAt ? `Downtime: about ${formatDuration(now.getTime() - previousStatusChangedAt.getTime())}` : null,
          `Recovered: ${formatTime(now, timezone)}`,
          '',
          `Details: ${link}`,
        ]
          .filter((line) => line !== null)
          .join('\n'),
      };
    case 'WAKE_UP_FAILING':
      return {
        subject: `[Website Tracker] Wake-up failing: ${name}`,
        text: [
          'Wake-up requests failing',
          '',
          `Wake-up requests to ${name} have failed ${s.consecutiveFailures} times in a row.`,
          'The service may be suspended, out of free hours, or down. Wake-up results do not reflect health — check the health monitor too.',
          '',
          `URL: ${monitor.url}`,
          `Last result: ${lastResult}`,
          s.lastErrorMessage ? `Error: ${s.lastErrorMessage}` : null,
          `Last successful wake-up: ${formatTime(s.lastSuccessAt, timezone)}`,
          '',
          `Details: ${link}`,
        ]
          .filter((line) => line !== null)
          .join('\n'),
      };
  }
}

export async function enqueueTransitionNotification(params: {
  deps: AppDeps;
  user: NotificationUser;
  monitor: MonitorDoc;
  previousStatus: HealthStatus;
  previousStatusChangedAt: Date | null;
}): Promise<NotificationDoc | null> {
  const { deps, user, monitor, previousStatus, previousStatusChangedAt } = params;
  if (!deps.emailSender) return null;
  const event = transitionEvent(monitor, previousStatus, monitor.state.status, user.settings.notifications);
  if (!event) return null;

  const website = await Website.findById(monitor.websiteId, { name: 1, environments: 1 }).lean<WebsiteDoc>();
  if (!website) return null;
  const { subject, text } = renderMessage({
    event,
    monitor,
    website,
    previousStatusChangedAt,
    timezone: user.settings.timezone,
  });
  return Notification.create({
    userId: user._id,
    websiteId: monitor.websiteId,
    monitorId: monitor._id,
    event,
    recipient: recipientFor(user),
    subject,
    text,
    status: 'PENDING',
    nextAttemptAt: new Date(),
  });
}

/** Delivers queued notifications with retries. Safe to run from concurrent ticks. */
export async function dispatchPending(deps: AppDeps, limit = 50): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  for (let i = 0; i < limit; i++) {
    const now = new Date();
    const item = await Notification.findOneAndUpdate(
      { status: { $in: ['PENDING', 'SENDING'] }, nextAttemptAt: { $lte: now } },
      { $set: { status: 'SENDING', nextAttemptAt: new Date(now.getTime() + SEND_LEASE_MS) }, $inc: { attempts: 1 } },
      { sort: { nextAttemptAt: 1 }, returnDocument: 'after' },
    ).lean<NotificationDoc>();
    if (!item) break;

    try {
      if (!deps.emailSender) throw new Error('Email delivery is not configured on the server');
      await deps.emailSender.send({ to: item.recipient, subject: item.subject, text: item.text });
      await Notification.updateOne({ _id: item._id }, { $set: { status: 'SENT', sentAt: new Date(), lastError: null, nextAttemptAt: null } });
      sent += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message.slice(0, 300) : 'Send failed';
      const giveUp = item.attempts >= MAX_ATTEMPTS || !deps.emailSender;
      await Notification.updateOne(
        { _id: item._id },
        {
          $set: {
            status: giveUp ? 'FAILED' : 'PENDING',
            lastError: message,
            nextAttemptAt: giveUp ? null : new Date(Date.now() + 60_000 * item.attempts ** 2),
          },
        },
      );
      if (giveUp) failed += 1;
      logger.warn({ notificationId: item._id.toString(), attempts: item.attempts, err: message }, 'Notification delivery failed');
    }
  }
  return { sent, failed };
}

export async function sendTestEmail(deps: AppDeps, user: NotificationUser): Promise<{ recipient: string }> {
  if (!deps.emailSender) {
    throw new AppError(400, 'EMAIL_NOT_CONFIGURED', 'Email delivery is not configured on the server (EMAIL_PROVIDER).');
  }
  const recipient = recipientFor(user);
  try {
    await deps.emailSender.send({
      to: recipient,
      subject: '[Website Tracker] Test notification',
      text: `This is a test email from Website Tracker.\n\nIf you received it, notifications are working.\n\nSent: ${formatTime(new Date(), user.settings.timezone)}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 300) : 'Send failed';
    throw new AppError(502, 'EMAIL_SEND_FAILED', `The email provider rejected the message: ${message}`);
  }
  return { recipient };
}

export async function listNotifications(userId: Types.ObjectId, limit = 50): Promise<NotificationDto[]> {
  const items = await Notification.find({ userId }).sort({ createdAt: -1 }).limit(limit).lean<NotificationDoc[]>();
  return items.map((n) => ({
    id: n._id.toString(),
    websiteId: n.websiteId?.toString() ?? null,
    event: n.event,
    status: n.status,
    recipient: n.recipient,
    subject: n.subject,
    attempts: n.attempts,
    lastError: n.lastError,
    createdAt: n.createdAt.toISOString(),
    sentAt: iso(n.sentAt),
  }));
}
