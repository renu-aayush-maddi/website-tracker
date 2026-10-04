import type { Request, Response } from 'express';
import { changePasswordSchema, loginSchema, registerSchema, setupSchema, accountUpdateSchema } from '@wt/shared';
import { currentUser, sessionToken } from '../middleware/auth.js';
import * as auth from '../services/authService.js';
import { SESSION_COOKIE, revokeAllSessions, revokeSession, sessionCookieOptions } from '../services/sessionService.js';
import { parse } from '../utils/validate.js';

function setSessionCookie(res: Response, token: string, expires: Date) {
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions(expires));
}

export async function setupStatus(_req: Request, res: Response) {
  res.json({ data: await auth.getSetupStatus() });
}

export async function setup(req: Request, res: Response) {
  const result = await auth.setupAdmin(parse(setupSchema, req.body), req.get('user-agent'));
  setSessionCookie(res, result.token, result.cookieExpires);
  res.status(201).json({ data: result.user });
}

export async function register(req: Request, res: Response) {
  const result = await auth.register(parse(registerSchema, req.body), req.get('user-agent'));
  setSessionCookie(res, result.token, result.cookieExpires);
  res.status(201).json({ data: result.user });
}

export async function login(req: Request, res: Response) {
  const result = await auth.login(parse(loginSchema, req.body), req.get('user-agent'));
  setSessionCookie(res, result.token, result.cookieExpires);
  res.json({ data: result.user });
}

export async function logout(req: Request, res: Response) {
  const token = sessionToken(req);
  if (token) await revokeSession(token);
  res.clearCookie(SESSION_COOKIE, sessionCookieOptions());
  res.status(204).end();
}

export async function logoutAll(req: Request, res: Response) {
  await revokeAllSessions(currentUser(req)._id);
  res.clearCookie(SESSION_COOKIE, sessionCookieOptions());
  res.status(204).end();
}

export async function me(req: Request, res: Response) {
  res.json({ data: auth.toUserDto(currentUser(req)) });
}

export async function changePassword(req: Request, res: Response) {
  const input = parse(changePasswordSchema, req.body);
  const session = await auth.changePassword(currentUser(req)._id, input.currentPassword, input.newPassword, req.get('user-agent'));
  setSessionCookie(res, session.token, session.cookieExpires);
  res.status(204).end();
}

export async function updateAccount(req: Request, res: Response) {
  res.json({ data: await auth.updateAccount(currentUser(req)._id, parse(accountUpdateSchema, req.body)) });
}
