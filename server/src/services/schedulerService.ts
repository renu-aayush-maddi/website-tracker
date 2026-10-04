import { Monitor, SystemState, type MonitorDoc, type SystemStateDoc } from '../models/index.js';
import type { AppDeps } from '../deps.js';
import { logger } from '../utils/logger.js';
import { runMonitor } from './checkService.js';
import { dispatchPending, type NotificationUser } from './notificationService.js';

/** Extra lease time beyond the request timeout before another tick may retry a monitor. */
const LEASE_MARGIN_MS = 30_000;
/** The dashboard warns when no tick has started for this long. */
export const SCHEDULER_STALE_MS = 3 * 60 * 1000;

export interface TickOptions {
  source: string;
  concurrency: number;
  maxJobs: number;
}

export interface TickSummary {
  source: string;
  startedAt: string;
  durationMs: number;
  jobs: number;
  errors: number;
  notificationsSent: number;
  notificationsFailed: number;
}

/**
 * Atomically claims the most overdue monitor: advances nextRunAt by its
 * interval and takes a lease, so concurrent ticks (external cron, GitHub
 * Actions backup, a worker) never run the same monitor twice. Missed runs are
 * skipped rather than replayed.
 */
export async function claimDueMonitor(now: Date): Promise<MonitorDoc | null> {
  return Monitor.findOneAndUpdate(
    { enabled: true, nextRunAt: { $lte: now }, lockedUntil: { $not: { $gt: now } } },
    [
      {
        $set: {
          lockedUntil: { $add: [now, { $add: ['$timeoutMs', LEASE_MARGIN_MS] }] },
          nextRunAt: { $add: [now, { $multiply: ['$intervalSeconds', 1000] }] },
        },
      },
    ],
    { sort: { nextRunAt: 1 }, returnDocument: 'after', updatePipeline: true },
  ).lean<MonitorDoc>();
}

export async function runTick(deps: AppDeps, options: TickOptions): Promise<TickSummary> {
  const startedAt = new Date();
  await SystemState.updateOne(
    { _id: 'scheduler' },
    { $set: { lastTickAt: startedAt, lastTickSource: options.source } },
    { upsert: true },
  );

  let jobs = 0;
  let errors = 0;
  const userCache = new Map<string, NotificationUser | null>();

  // Each worker claims a monitor only when it has capacity, so a slow target
  // never holds claimed-but-unstarted work.
  const worker = async () => {
    while (jobs < options.maxJobs) {
      const monitor = await claimDueMonitor(new Date());
      if (!monitor) return;
      jobs += 1;
      try {
        await runMonitor(monitor, { deps, trigger: 'SCHEDULED', userCache });
      } catch (err) {
        errors += 1;
        logger.error({ err, monitorId: monitor._id.toString() }, 'Scheduled check failed');
      } finally {
        await Monitor.updateOne({ _id: monitor._id, lockedUntil: monitor.lockedUntil }, { $set: { lockedUntil: null } }).catch(
          (err: unknown) => logger.error({ err }, 'Failed to release monitor lease'),
        );
      }
    }
  };
  await Promise.all(Array.from({ length: options.concurrency }, worker));

  let notifications = { sent: 0, failed: 0 };
  try {
    notifications = await dispatchPending(deps);
  } catch (err) {
    errors += 1;
    logger.error({ err }, 'Notification dispatch failed');
  }

  const durationMs = Date.now() - startedAt.getTime();
  await SystemState.updateOne(
    { _id: 'scheduler' },
    { $set: { lastTickCompletedAt: new Date(), lastTickDurationMs: durationMs, lastTickJobs: jobs, lastTickErrors: errors } },
  );
  const summary: TickSummary = {
    source: options.source,
    startedAt: startedAt.toISOString(),
    durationMs,
    jobs,
    errors,
    notificationsSent: notifications.sent,
    notificationsFailed: notifications.failed,
  };
  if (jobs > 0 || errors > 0) logger.info(summary, 'Scheduler tick finished');
  return summary;
}

let inFlight: Promise<TickSummary> | null = null;

/**
 * Starts a tick without waiting for it (used by the HTTP trigger so external
 * cron services get an immediate response). Overlapping triggers in the same
 * process are coalesced; across processes the leases keep runs exclusive.
 */
export function startTickInBackground(deps: AppDeps, options: TickOptions): { started: boolean } {
  if (inFlight) return { started: false };
  inFlight = runTick(deps, options)
    .catch((err: unknown) => {
      logger.error({ err }, 'Scheduler tick crashed');
      throw err;
    })
    .finally(() => {
      inFlight = null;
    });
  inFlight.catch(() => undefined);
  return { started: true };
}

export async function getSchedulerStatus() {
  const state = await SystemState.findById('scheduler').lean<SystemStateDoc>();
  const lastTickAt = state?.lastTickAt ?? null;
  return {
    lastTickAt,
    lastTickSource: state?.lastTickSource ?? null,
    stale: !lastTickAt || Date.now() - lastTickAt.getTime() > SCHEDULER_STALE_MS,
  };
}
