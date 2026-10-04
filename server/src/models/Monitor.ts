import { Schema, model, type Types } from 'mongoose';
import {
  DEGRADED_REASONS,
  EXPECTED_STATUS_OPTIONS,
  HEALTH_STATUSES,
  HTTP_METHODS,
  MONITOR_TYPES,
  PROBE_ERROR_CODES,
  type DegradedReason,
  type ExpectedStatus,
  type HealthStatus,
  type HttpMethod,
  type MonitorType,
  type ProbeErrorCode,
} from '@wt/shared';

export interface MonitorStateSub {
  status: HealthStatus;
  degradedReason: DegradedReason | null;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  lastRunAt: Date | null;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  lastStatusCode: number | null;
  lastResponseMs: number | null;
  lastErrorCode: ProbeErrorCode | null;
  lastErrorMessage: string | null;
  statusChangedAt: Date | null;
}

export interface MonitorDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  websiteId: Types.ObjectId;
  environmentId: Types.ObjectId;
  type: MonitorType;
  enabled: boolean;
  url: string | null;
  method: HttpMethod;
  intervalSeconds: number;
  timeoutMs: number;
  failureThreshold: number;
  /** HEALTH_CHECK only. */
  degradedThresholdMs: number | null;
  /** HEALTH_CHECK only. */
  expectedStatus: ExpectedStatus | null;
  state: MonitorStateSub;
  /** When the scheduler should next run this monitor; null while disabled. */
  nextRunAt: Date | null;
  /** Lease held by the run in progress; prevents overlapping runs. */
  lockedUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const initialMonitorState = (enabled: boolean): MonitorStateSub => ({
  status: enabled ? 'UNKNOWN' : 'PAUSED',
  degradedReason: null,
  consecutiveFailures: 0,
  consecutiveSuccesses: 0,
  lastRunAt: null,
  lastSuccessAt: null,
  lastFailureAt: null,
  lastStatusCode: null,
  lastResponseMs: null,
  lastErrorCode: null,
  lastErrorMessage: null,
  statusChangedAt: null,
});

const stateSchema = new Schema<MonitorStateSub>(
  {
    status: { type: String, enum: HEALTH_STATUSES, default: 'UNKNOWN' },
    degradedReason: { type: String, enum: [...DEGRADED_REASONS, null], default: null },
    consecutiveFailures: { type: Number, default: 0 },
    consecutiveSuccesses: { type: Number, default: 0 },
    lastRunAt: { type: Date, default: null },
    lastSuccessAt: { type: Date, default: null },
    lastFailureAt: { type: Date, default: null },
    lastStatusCode: { type: Number, default: null },
    lastResponseMs: { type: Number, default: null },
    lastErrorCode: { type: String, enum: [...PROBE_ERROR_CODES, null], default: null },
    lastErrorMessage: { type: String, default: null },
    statusChangedAt: { type: Date, default: null },
  },
  { _id: false },
);

const monitorSchema = new Schema<MonitorDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    websiteId: { type: Schema.Types.ObjectId, ref: 'Website', required: true },
    environmentId: { type: Schema.Types.ObjectId, required: true },
    type: { type: String, enum: MONITOR_TYPES, required: true },
    enabled: { type: Boolean, default: false },
    url: { type: String, default: null },
    method: { type: String, enum: HTTP_METHODS, default: 'GET' },
    intervalSeconds: { type: Number, required: true },
    timeoutMs: { type: Number, required: true },
    failureThreshold: { type: Number, required: true },
    degradedThresholdMs: { type: Number, default: null },
    expectedStatus: { type: String, enum: [...EXPECTED_STATUS_OPTIONS, null], default: null },
    state: { type: stateSchema, default: () => ({}) },
    nextRunAt: { type: Date, default: null },
    lockedUntil: { type: Date, default: null },
  },
  { timestamps: true },
);

monitorSchema.index({ websiteId: 1, environmentId: 1, type: 1 }, { unique: true });
// The scheduler's claim query: enabled monitors ordered by due time.
monitorSchema.index({ enabled: 1, nextRunAt: 1 }, { partialFilterExpression: { enabled: true } });

export const Monitor = model<MonitorDoc>('Monitor', monitorSchema);
