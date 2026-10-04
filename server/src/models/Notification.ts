import { Schema, model, type Types } from 'mongoose';
import { NOTIFICATION_EVENTS, NOTIFICATION_STATUSES, type NotificationEvent, type NotificationStatus } from '@wt/shared';

export const NOTIFICATION_RETENTION_SECONDS = 90 * 24 * 60 * 60;

/** Outbox of notifications; the scheduler delivers pending ones with retries. */
export interface NotificationDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  websiteId: Types.ObjectId | null;
  monitorId: Types.ObjectId | null;
  event: NotificationEvent;
  channel: 'EMAIL';
  recipient: string;
  subject: string;
  text: string;
  status: NotificationStatus;
  attempts: number;
  lastError: string | null;
  nextAttemptAt: Date | null;
  sentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<NotificationDoc>(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    websiteId: { type: Schema.Types.ObjectId, default: null },
    monitorId: { type: Schema.Types.ObjectId, default: null },
    event: { type: String, enum: NOTIFICATION_EVENTS, required: true },
    channel: { type: String, enum: ['EMAIL'], default: 'EMAIL' },
    recipient: { type: String, required: true },
    subject: { type: String, required: true },
    text: { type: String, required: true },
    status: { type: String, enum: NOTIFICATION_STATUSES, default: 'PENDING' },
    attempts: { type: Number, default: 0 },
    lastError: { type: String, default: null },
    nextAttemptAt: { type: Date, default: null },
    sentAt: { type: Date, default: null },
  },
  { timestamps: true },
);

notificationSchema.index({ status: 1, nextAttemptAt: 1 });
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: NOTIFICATION_RETENTION_SECONDS });

export const Notification = model<NotificationDoc>('Notification', notificationSchema);
