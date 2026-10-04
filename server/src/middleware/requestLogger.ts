import type { NextFunction, Request, Response } from 'express';
import { logger } from '../utils/logger.js';

/** One line per request: method, path (no query string), status, duration. */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = performance.now();
  res.on('finish', () => {
    if (req.path === '/api/health') return;
    logger.info(
      { method: req.method, path: req.path, status: res.statusCode, ms: Math.round(performance.now() - start) },
      'request',
    );
  });
  next();
}
