import type { NextFunction, Request, Response } from 'express';
import { config } from '../config/env.js';
import type { AppDeps } from '../deps.js';
import { startTickInBackground } from '../services/schedulerService.js';
import { safeEqual } from '../utils/crypto.js';
import { AppError, unauthorized } from '../utils/errors.js';

/** Bearer-token auth for external schedulers (cron-job.org, GitHub Actions). */
export function requireSchedulerSecret(req: Request, _res: Response, next: NextFunction) {
  if (!config.SCHEDULER_SECRET) {
    throw new AppError(503, 'SCHEDULER_DISABLED', 'SCHEDULER_SECRET is not configured on the server');
  }
  const header = req.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token || !safeEqual(token, config.SCHEDULER_SECRET)) throw unauthorized('Invalid scheduler token');
  next();
}

export const schedulerController = (deps: AppDeps) => ({
  /** Responds immediately; due checks run in the background under per-monitor leases. */
  tick(req: Request, res: Response) {
    const source = typeof req.query.source === 'string' ? req.query.source.slice(0, 40) : 'http';
    const { started } = startTickInBackground(deps, {
      source,
      concurrency: config.SCHEDULER_CONCURRENCY,
      maxJobs: config.SCHEDULER_MAX_JOBS_PER_TICK,
    });
    res.status(202).json({ data: { accepted: true, started } });
  },
});
