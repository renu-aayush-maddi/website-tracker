import { Schema, model } from 'mongoose';

/** Singleton documents for application-wide state, keyed by name. */
export interface SystemStateDoc {
  _id: 'scheduler' | 'setup';
  lastTickAt?: Date;
  lastTickSource?: string;
  lastTickCompletedAt?: Date;
  lastTickDurationMs?: number;
  lastTickJobs?: number;
  lastTickErrors?: number;
  completedAt?: Date;
}

const systemStateSchema = new Schema<SystemStateDoc>(
  {
    _id: { type: String, required: true },
    lastTickAt: Date,
    lastTickSource: String,
    lastTickCompletedAt: Date,
    lastTickDurationMs: Number,
    lastTickJobs: Number,
    lastTickErrors: Number,
    completedAt: Date,
  },
  { versionKey: false, collection: 'system' },
);

export const SystemState = model<SystemStateDoc>('SystemState', systemStateSchema);
