import type { DegradedReason, ExpectedStatus, HealthStatus, MonitorType } from './constants.js';

export interface StatusInput {
  enabled: boolean;
  /** Whether the most recent check succeeded; null when no check has run. */
  lastSuccess: boolean | null;
  lastResponseMs: number | null;
  consecutiveFailures: number;
  failureThreshold: number;
  /** Responses slower than this are DEGRADED; null disables the slow check. */
  degradedThresholdMs: number | null;
}

export interface StatusResult {
  status: HealthStatus;
  degradedReason: DegradedReason | null;
}

/** The single source of truth for how a monitor's status is derived. */
export function computeStatus(input: StatusInput): StatusResult {
  if (!input.enabled) return { status: 'PAUSED', degradedReason: null };
  if (input.lastSuccess === null) return { status: 'UNKNOWN', degradedReason: null };
  if (!input.lastSuccess) {
    if (input.consecutiveFailures >= input.failureThreshold) return { status: 'DOWN', degradedReason: null };
    return { status: 'DEGRADED', degradedReason: 'FAILING' };
  }
  if (
    input.degradedThresholdMs !== null &&
    input.lastResponseMs !== null &&
    input.lastResponseMs > input.degradedThresholdMs
  ) {
    return { status: 'DEGRADED', degradedReason: 'SLOW' };
  }
  return { status: 'UP', degradedReason: null };
}

/** Whether an HTTP response counts as a success for the given monitor type. */
export function isSuccessfulStatusCode(type: MonitorType, statusCode: number, expected: ExpectedStatus): boolean {
  if (type === 'WAKE_UP') return statusCode < 500;
  if (expected === '2xx-3xx') return statusCode >= 200 && statusCode < 400;
  return statusCode >= 200 && statusCode < 300;
}

const SEVERITY: Record<HealthStatus, number> = { DOWN: 4, DEGRADED: 3, UP: 2, UNKNOWN: 1, PAUSED: 0 };

/** Worst status among several monitors (e.g. a project's environments). */
export function worstStatus(statuses: readonly HealthStatus[]): HealthStatus {
  let worst: HealthStatus = 'PAUSED';
  for (const s of statuses) if (SEVERITY[s] > SEVERITY[worst]) worst = s;
  return worst;
}

export function statusSeverity(status: HealthStatus): number {
  return SEVERITY[status];
}
