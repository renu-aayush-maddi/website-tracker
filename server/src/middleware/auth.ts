import type { NextFunction, Request, Response } from 'express';
import { SESSION_COOKIE, resolveSession, sessionCookieOptions } from '../services/sessionService.js';
import { unauthorized } from '../utils/errors.js';

export function sessionToken(req: Request): string | undefined {
  const value: unknown = req.cookies?.[SESSION_COOKIE];
  return typeof value === 'string' && value.length > 0 && value.length < 200 ? value : undefined;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = sessionToken(req);
  const resolved = token ? await resolveSession(token) : null;
  if (!token || !resolved) {
    if (token) res.clearCookie(SESSION_COOKIE, sessionCookieOptions());
    throw unauthorized();
  }
  req.auth = { ...resolved, token };
  next();
}

/** The authenticated user; only valid on routes behind requireAuth. */
export function currentUser(req: Request) {
  if (!req.auth) throw unauthorized();
  return req.auth.user;
}
