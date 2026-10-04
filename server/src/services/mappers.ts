import type { LogDto, MonitorDto } from '@wt/shared';
import type { MonitorDoc, MonitoringLogDoc } from '../models/index.js';
import { iso } from '../utils/ids.js';

export function toMonitorDto(m: MonitorDoc): MonitorDto {
  return {
    id: m._id.toString(),
    websiteId: m.websiteId.toString(),
    environmentId: m.environmentId.toString(),
    type: m.type,
    enabled: m.enabled,
    url: m.url,
    method: m.method,
    intervalSeconds: m.intervalSeconds,
    timeoutMs: m.timeoutMs,
    failureThreshold: m.failureThreshold,
    degradedThresholdMs: m.degradedThresholdMs,
    expectedStatus: m.expectedStatus,
    nextRunAt: m.enabled ? iso(m.nextRunAt) : null,
    state: {
      status: m.state.status,
      degradedReason: m.state.degradedReason,
      consecutiveFailures: m.state.consecutiveFailures,
      lastRunAt: iso(m.state.lastRunAt),
      lastSuccessAt: iso(m.state.lastSuccessAt),
      lastFailureAt: iso(m.state.lastFailureAt),
      lastStatusCode: m.state.lastStatusCode,
      lastResponseMs: m.state.lastResponseMs,
      lastErrorCode: m.state.lastErrorCode,
      lastErrorMessage: m.state.lastErrorMessage,
      statusChangedAt: iso(m.state.statusChangedAt),
    },
  };
}

export function toLogDto(
  log: MonitoringLogDoc,
  website?: { name: string; environmentLabel: string | null } | undefined,
): LogDto {
  return {
    id: log._id.toString(),
    websiteId: log.websiteId.toString(),
    websiteName: website?.name ?? null,
    environmentLabel: website?.environmentLabel ?? null,
    monitorId: log.monitorId.toString(),
    type: log.type,
    trigger: log.trigger,
    url: log.url,
    method: log.method,
    startedAt: log.startedAt.toISOString(),
    responseMs: log.responseMs,
    statusCode: log.statusCode,
    success: log.success,
    errorCode: log.errorCode,
    errorMessage: log.errorMessage,
  };
}
