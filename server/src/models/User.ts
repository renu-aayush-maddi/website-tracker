import { Schema, model, type Types } from 'mongoose';
import {
  DATE_FORMATS,
  DEFAULT_SETTINGS,
  RETENTION_OPTIONS,
  THEMES,
  TIME_FORMATS,
  type UserSettings,
} from '@wt/shared';

export interface UserDoc {
  _id: Types.ObjectId;
  name: string;
  email: string;
  passwordHash: string;
  role: 'admin' | 'member';
  settings: UserSettings;
  failedLoginAttempts: number;
  lockUntil: Date | null;
  lastLoginAt: Date | null;
  passwordChangedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const d = DEFAULT_SETTINGS;

const settingsSchema = new Schema<UserSettings>(
  {
    timezone: { type: String, default: d.timezone },
    dateFormat: { type: String, enum: DATE_FORMATS, default: d.dateFormat },
    timeFormat: { type: String, enum: TIME_FORMATS, default: d.timeFormat },
    theme: { type: String, enum: THEMES, default: d.theme },
    logRetentionDays: { type: Number, enum: RETENTION_OPTIONS, default: d.logRetentionDays },
    monitoringDefaults: {
      intervalSeconds: { type: Number, default: d.monitoringDefaults.intervalSeconds },
      timeoutMs: { type: Number, default: d.monitoringDefaults.timeoutMs },
      failureThreshold: { type: Number, default: d.monitoringDefaults.failureThreshold },
      degradedThresholdMs: { type: Number, default: d.monitoringDefaults.degradedThresholdMs },
    },
    notifications: {
      emailEnabled: { type: Boolean, default: d.notifications.emailEnabled },
      recipient: { type: String },
      onDown: { type: Boolean, default: d.notifications.onDown },
      onRecovery: { type: Boolean, default: d.notifications.onRecovery },
      onWakeUpFailure: { type: Boolean, default: d.notifications.onWakeUpFailure },
    },
  },
  { _id: false },
);

const userSchema = new Schema<UserDoc>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true, unique: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['admin', 'member'], default: 'member' },
    settings: { type: settingsSchema, default: () => ({}) },
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
    passwordChangedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const User = model<UserDoc>('User', userSchema);
