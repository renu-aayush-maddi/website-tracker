import type { Request } from 'express';
import { rateLimit } from 'express-rate-limit';

const limited = (message: string) => ({ error: { code: 'RATE_LIMITED', message } });

/** Login/setup/registration: counts failed attempts only. */
export const authLimiter = () =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: limited('Too many attempts. Please wait a few minutes and try again.'),
  });

export const apiLimiter = () =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 1500,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: limited('Too many requests. Please slow down.'),
  });

/** "Run now" sends real outbound traffic; cap it per user so the app cannot be used as a request cannon. */
export const manualRunLimiter = () =>
  rateLimit({
    windowMs: 60 * 1000,
    limit: 20,
    keyGenerator: (req: Request) => req.auth?.user._id.toString() ?? 'anonymous',
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: limited('Too many manual checks. Wait a minute and try again.'),
  });

export const schedulerLimiter = () =>
  rateLimit({
    windowMs: 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: limited('Too many scheduler triggers.'),
  });

export const emailTestLimiter = () =>
  rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 10,
    keyGenerator: (req: Request) => req.auth?.user._id.toString() ?? 'anonymous',
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: limited('Too many test emails. Try again later.'),
  });
