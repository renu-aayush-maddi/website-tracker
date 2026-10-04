import type { Types } from 'mongoose';
import { isSuccessfulStatusCode, type CheckTrigger, type ProbeErrorCode } from '@wt/shared';
import type { AppDeps } from '../deps.js';
import { Monitor, MonitoringLog, User, type MonitorDoc, type MonitoringLogDoc } from '../models/index.js';
import { badRequest } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { statusOf } from './monitorService.js';
import { enqueueTransitionNotification, type NotificationUser } from './notificationService.js';
import { retentionExpiry } from './retention.js';

export interface RunContext {
  deps: AppDeps;
  trigger: CheckTrigger;
  /** Per-tick cache so a batch of checks loads each owner once. */
  userCache?: Map<string, NotificationUser | null>;
}

export interface RunOutcome {
  log: MonitoringLogDoc;
  /** Updated monitor, or null if its state was not changed (disabled or reconfigured mid-run). */
  monitor: MonitorDoc | null;
}

async function loadUser(userId: Types.ObjectId, cache?: Map<string, NotificationUser | null>) {
  const key = userId.toString();
  if (cache?.has(key)) return cache.get(key) ?? null;
  const user = await User.findById(userId, { email: 1, settings: 1 }).lean<NotificationUser>();
  cache?.set(key, user);
  return user;
}

/**
 * Performs one request for a monitor, stores the result, updates the monitor's
 * state and queues a notification if the status crossed a threshold. Never
 * throws because of the target's behaviour — only on database errors.
 */
export async function runMonitor(monitor: MonitorDoc, ctx: RunContext): Promise<RunOutcome> {
  if (!monitor.url) throw badRequest('This monitor has no URL configured');

  const result = await ctx.deps.prober.probe({ url: monitor.url, method: monitor.method, timeoutMs: monitor.timeoutMs });

  let success = false;
  let errorCode: ProbeErrorCode | null = result.errorCode;
  let errorMessage = result.errorMessage;
  if (result.statusCode !== null && result.errorCode === null) {
    success = isSuccessfulStatusCode(monitor.type, result.statusCode, monitor.expectedStatus ?? '2xx');
    if (!success) {
      errorCode = 'HTTP_STATUS';
      errorMessage = `Unexpected HTTP status ${result.statusCode}`;
    }
  }

  const user = await loadUser(monitor.userId, ctx.userCache);
  const log = await MonitoringLog.create({
    userId: monitor.userId,
    websiteId: monitor.websiteId,
    environmentId: monitor.environmentId,
    monitorId: monitor._id,
    type: monitor.type,
    trigger: ctx.trigger,
    url: monitor.url,
    method: monitor.method,
    startedAt: result.startedAt,
    completedAt: result.completedAt,
    responseMs: result.responseMs,
    statusCode: result.statusCode,
    success,
    errorCode,
    errorMessage,
    expiresAt: retentionExpiry(result.startedAt, user?.settings.logRetentionDays ?? 30),
  });

  // A manual test of a disabled monitor is recorded but does not change its state.
  if (!monitor.enabled) return { log: log.toObject(), monitor: null };

  // Counters are updated atomically; the filter skips the update if the monitor
  // was disabled or pointed at a different URL while this request was running.
  const counted = await Monitor.findOneAndUpdate(
    { _id: monitor._id, enabled: true, url: monitor.url, method: monitor.method },
    success
      ? { $set: { 'state.consecutiveFailures': 0 }, $inc: { 'state.consecutiveSuccesses': 1 } }
      : { $set: { 'state.consecutiveSuccesses': 0 }, $inc: { 'state.consecutiveFailures': 1 } },
    { returnDocument: 'after' },
  ).lean<MonitorDoc>();
  if (!counted) return { log: log.toObject(), monitor: null };

  const state = {
    ...counted.state,
    lastRunAt: result.completedAt,
    lastStatusCode: result.statusCode,
    lastResponseMs: result.responseMs,
    lastErrorCode: errorCode,
    lastErrorMessage: errorMessage,
    ...(success ? { lastSuccessAt: result.completedAt } : { lastFailureAt: result.completedAt }),
  };
  const { status, degradedReason } = statusOf(counted, state);
  const previousStatus = counted.state.status;
  const changed = status !== previousStatus;

  const updated = await Monitor.findOneAndUpdate(
    { _id: monitor._id },
    {
      $set: {
        'state.status': status,
        'state.degradedReason': degradedReason,
        'state.lastRunAt': state.lastRunAt,
        'state.lastStatusCode': state.lastStatusCode,
        'state.lastResponseMs': state.lastResponseMs,
        'state.lastErrorCode': state.lastErrorCode,
        'state.lastErrorMessage': state.lastErrorMessage,
        'state.lastSuccessAt': state.lastSuccessAt,
        'state.lastFailureAt': state.lastFailureAt,
        ...(changed ? { 'state.statusChangedAt': result.completedAt } : {}),
      },
    },
    { returnDocument: 'after' },
  ).lean<MonitorDoc>();

  if (updated && changed && user) {
    try {
      await enqueueTransitionNotification({
        deps: ctx.deps,
        user,
        monitor: updated,
        previousStatus,
        previousStatusChangedAt: counted.state.statusChangedAt,
      });
    } catch (err) {
      logger.error({ err, monitorId: monitor._id.toString() }, 'Failed to queue notification');
    }
  }
  return { log: log.toObject(), monitor: updated };
}
