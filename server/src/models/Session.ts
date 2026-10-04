import { Schema, model, type Types } from 'mongoose';

export interface SessionDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  /** SHA-256 of the cookie token; the raw token is never stored. */
  tokenHash: string;
  createdAt: Date;
  lastSeenAt: Date;
  /** Sliding idle expiry, capped at absoluteExpiresAt. MongoDB deletes the document after this. */
  expiresAt: Date;
  absoluteExpiresAt: Date;
  userAgent: string | null;
}

const sessionSchema = new Schema<SessionDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    createdAt: { type: Date, required: true },
    lastSeenAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    absoluteExpiresAt: { type: Date, required: true },
    userAgent: { type: String, default: null },
  },
  { versionKey: false },
);

sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Session = model<SessionDoc>('Session', sessionSchema);
