import type { NextFunction, Request, Response } from 'express';
import { config } from '../config/env.js';
import { forbidden } from '../utils/errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function requestOrigin(req: Request): string | null {
  const origin = req.get('origin');
  if (origin) return origin;
  const referer = req.get('referer');
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

/**
 * CSRF defence in depth (on top of SameSite cookies): state-changing requests
 * must come from an allowed browser origin.
 */
export function originCheck(req: Request, _res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) return next();
  const origin = requestOrigin(req);
  const ownOrigin = `${req.protocol}://${req.get('host')}`;
  if (origin && (config.allowedOrigins.includes(origin) || origin === ownOrigin)) return next();
  throw forbidden('Request origin not allowed');
}
