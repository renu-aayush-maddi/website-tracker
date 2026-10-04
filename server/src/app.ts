import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import mongoose from 'mongoose';
import { config } from './config/env.js';
import type { AppDeps } from './deps.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { originCheck } from './middleware/originCheck.js';
import { apiLimiter } from './middleware/rateLimits.js';
import { requestLogger } from './middleware/requestLogger.js';
import { authRoutes, internalRoutes, protectedRoutes } from './routes/index.js';

export function createApp(deps: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.TRUST_PROXY);

  app.use(helmet());
  app.use(
    cors({
      origin: config.allowedOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['content-type'],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(requestLogger);

  // Liveness for Render's health check; does not require auth.
  app.get('/api/health', (_req, res) => {
    const dbReady = mongoose.connection.readyState === 1;
    res.status(dbReady ? 200 : 503).json({ status: dbReady ? 'ok' : 'degraded', database: dbReady ? 'up' : 'down' });
  });

  // Bearer-authenticated machine endpoints (no cookies, so no CSRF concerns).
  app.use('/api/internal', internalRoutes(deps));

  app.use('/api', apiLimiter(), originCheck);
  app.use('/api/auth', authRoutes());
  app.use('/api', protectedRoutes(deps));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
