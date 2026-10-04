import type { Types } from 'mongoose';
import {
  computeStatus,
  type HealthCheckConfigInput,
  type MonitorDto,
  type MonitorType,
  type WakeUpConfigInput,
} from '@wt/shared';
import { Monitor, initialMonitorState, type MonitorDoc, type MonitorStateSub } from '../models/index.js';
import { badRequest, notFound } from '../utils/errors.js';
import { toMonitorDto } from './mappers.js';

type MonitorConfig = HealthCheckConfigInput | WakeUpConfigInput;

export type MonitorFields = Pick<
  MonitorDoc,
  | 'enabled'
  | 'url'
  | 'method'
  | 'intervalSeconds'
  | 'timeoutMs'
  | 'failureThreshold'
  | 'degradedThresholdMs'
  | 'expectedStatus'
  | 'nextRunAt'
  | 'state'
>;

/** Whether the latest check succeeded, derived from persisted state. */
export function lastSuccessOf(state: MonitorStateSub): boolean | null {
  if (!state.lastRunAt) return null;
  return state.consecutiveFailures === 0;
}

export function statusOf(
  monitor: Pick<MonitorDoc, 'type' | 'enabled' | 'failureThreshold' | 'degradedThresholdMs'>,
  state: MonitorStateSub,
) {
  return computeStatus({
    enabled: monitor.enabled,
    lastSuccess: lastSuccessOf(state),
    lastResponseMs: state.lastResponseMs,
    consecutiveFailures: state.consecutiveFailures,
    failureThreshold: monitor.failureThreshold,
    // Wake-ups only send traffic; slowness is not a health signal for them.
    degradedThresholdMs: monitor.type === 'HEALTH_CHECK' ? monitor.degradedThresholdMs : null,
  });
}

/**
 * Computes the persisted fields for a monitor after a configuration change,
 * deciding how scheduling and state carry over from the current version.
 */
export function nextMonitorFields(
  type: MonitorType,
  config: MonitorConfig,
  current: MonitorDoc | null,
  now: Date,
): MonitorFields {
  const fields = {
    enabled: config.enabled,
    url: config.url ?? null,
    method: config.method,
    intervalSeconds: config.intervalSeconds,
    timeoutMs: config.timeoutMs,
    failureThreshold: config.failureThreshold,
    degradedThresholdMs: type === 'HEALTH_CHECK' && 'degradedThresholdMs' in config ? config.degradedThresholdMs : null,
    expectedStatus: type === 'HEALTH_CHECK' && 'expectedStatus' in config ? config.expectedStatus : null,
  };

  if (!fields.enabled) {
    const state = current ? { ...current.state } : initialMonitorState(false);
    return { ...fields, nextRunAt: null, state: { ...state, status: 'PAUSED', degradedReason: null } };
  }

  const requestChanged = !current || current.url !== fields.url || current.method !== fields.method;
  if (!current || !current.enabled || requestChanged) {
    // New target or freshly enabled: previous results no longer describe it.
    return { ...fields, nextRunAt: now, state: initialMonitorState(true) };
  }

  const nextByInterval = new Date(now.getTime() + fields.intervalSeconds * 1000);
  const nextRunAt = current.nextRunAt && current.nextRunAt < nextByInterval ? current.nextRunAt : nextByInterval;
  const { status, degradedReason } = statusOf({ type, ...fields }, current.state);
  return { ...fields, nextRunAt, state: { ...current.state, status, degradedReason } };
}

export async function findOwnedMonitor(userId: Types.ObjectId, monitorId: Types.ObjectId): Promise<MonitorDoc> {
  const monitor = await Monitor.findOne({ _id: monitorId, userId }).lean<MonitorDoc>();
  if (!monitor) throw notFound('Monitor');
  return monitor;
}

export async function setMonitorEnabled(
  userId: Types.ObjectId,
  monitorId: Types.ObjectId,
  enabled: boolean,
): Promise<MonitorDto> {
  const current = await findOwnedMonitor(userId, monitorId);
  if (enabled && !current.url) throw badRequest('Set a URL for this monitor before enabling it');
  const config = {
    enabled,
    url: current.url ?? undefined,
    method: current.method,
    intervalSeconds: current.intervalSeconds,
    timeoutMs: current.timeoutMs,
    failureThreshold: current.failureThreshold,
    degradedThresholdMs: current.degradedThresholdMs ?? 0,
    expectedStatus: current.expectedStatus ?? '2xx',
  } satisfies MonitorConfig;
  const fields = nextMonitorFields(current.type, config, current, new Date());
  const updated = await Monitor.findOneAndUpdate({ _id: monitorId, userId }, { $set: fields }, { returnDocument: 'after' }).lean<MonitorDoc>();
  if (!updated) throw notFound('Monitor');
  return toMonitorDto(updated);
}
