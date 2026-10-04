import type { CookieOptions } from 'express';
import type { Types } from 'mongoose';
import { config } from '../config/env.js';
import { Session, User, type SessionDoc, type UserDoc } from '../models/index.js';
import { randomToken, sha256 } from '../utils/crypto.js';

const DAY_MS = 24 * 60 * 60 * 1000;
export const SESSION_IDLE_MS = 7 * DAY_MS;
export const SESSION_ABSOLUTE_MS = 30 * DAY_MS;
const TOUCH_INTERVAL_MS = 60 * 60 * 1000;

/** The __Host- prefix makes browsers enforce Secure, Path=/ and no Domain attribute. */
export const SESSION_COOKIE = config.isProduction ? '__Host-wt_session' : 'wt_session';

export function sessionCookieOptions(expires?: Date): CookieOptions {
  return {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: config.COOKIE_SAMESITE,
    path: '/',
    ...(expires ? { expires } : {}),
  };
}

export async function createSession(userId: Types.ObjectId, userAgent: string | undefined) {
  const token = randomToken(32);
  const now = new Date();
  const absoluteExpiresAt = new Date(now.getTime() + SESSION_ABSOLUTE_MS);
  const session = await Session.create({
    userId,
    tokenHash: sha256(token),
    createdAt: now,
    lastSeenAt: now,
    expiresAt: new Date(now.getTime() + SESSION_IDLE_MS),
    absoluteExpiresAt,
    userAgent: userAgent?.slice(0, 200) ?? null,
  });
  return { token, session, cookieExpires: absoluteExpiresAt };
}

export interface ResolvedSession {
  session: SessionDoc;
  user: UserDoc;
}

export async function resolveSession(token: string): Promise<ResolvedSession | null> {
  const now = new Date();
  const session = await Session.findOne({ tokenHash: sha256(token), expiresAt: { $gt: now } }).lean<SessionDoc>();
  if (!session) return null;
  const user = await User.findById(session.userId).lean<UserDoc>();
  if (!user) return null;

  if (now.getTime() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    const expiresAt = new Date(Math.min(now.getTime() + SESSION_IDLE_MS, session.absoluteExpiresAt.getTime()));
    await Session.updateOne({ _id: session._id }, { $set: { lastSeenAt: now, expiresAt } });
  }
  return { session, user };
}

export async function revokeSession(token: string): Promise<void> {
  await Session.deleteOne({ tokenHash: sha256(token) });
}

export async function revokeAllSessions(userId: Types.ObjectId): Promise<void> {
  await Session.deleteMany({ userId });
}
