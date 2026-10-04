import { Schema, model, type Types } from 'mongoose';
import {
  CHECK_TRIGGERS,
  HTTP_METHODS,
  MONITOR_TYPES,
  PROBE_ERROR_CODES,
  type CheckTrigger,
  type HttpMethod,
  type MonitorType,
  type ProbeErrorCode,
} from '@wt/shared';

export interface MonitoringLogDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  websiteId: Types.ObjectId;
  environmentId: Types.ObjectId;
  monitorId: Types.ObjectId;
  type: MonitorType;
  trigger: CheckTrigger;
  url: string;
  method: HttpMethod;
  startedAt: Date;
  completedAt: Date;
  responseMs: number | null;
  statusCode: number | null;
  success: boolean;
  errorCode: ProbeErrorCode | null;
  errorMessage: string | null;
  /** Set from the owner's retention setting; absent means keep forever. */
  expiresAt?: Date;
}

const logSchema = new Schema<MonitoringLogDoc>(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    websiteId: { type: Schema.Types.ObjectId, required: true },
    environmentId: { type: Schema.Types.ObjectId, required: true },
    monitorId: { type: Schema.Types.ObjectId, required: true },
    type: { type: String, enum: MONITOR_TYPES, required: true },
    trigger: { type: String, enum: CHECK_TRIGGERS, required: true },
    url: { type: String, required: true },
    method: { type: String, enum: HTTP_METHODS, required: true },
    startedAt: { type: Date, required: true },
    completedAt: { type: Date, required: true },
    responseMs: { type: Number, default: null },
    statusCode: { type: Number, default: null },
    success: { type: Boolean, required: true },
    errorCode: { type: String, enum: [...PROBE_ERROR_CODES, null], default: null },
    errorMessage: { type: String, default: null },
    expiresAt: { type: Date },
  },
  { versionKey: false, collection: 'monitoringLogs' },
);

logSchema.index({ userId: 1, startedAt: -1, _id: -1 });
logSchema.index({ websiteId: 1, startedAt: -1, _id: -1 });
logSchema.index({ monitorId: 1, startedAt: -1, _id: -1 });
// Retention: MongoDB removes each log once its expiresAt passes.
logSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const MonitoringLog = model<MonitoringLogDoc>('MonitoringLog', logSchema);
