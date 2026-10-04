import { config } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/db.js';
import { createApp } from './app.js';
import { createDefaultDeps } from './deps.js';
import { logger } from './utils/logger.js';

async function main() {
  await connectDatabase(config.MONGODB_URI);
  const app = createApp(createDefaultDeps());
  const server = app.listen(config.PORT, (err?: Error) => {
    // Express 5 reports bind failures (e.g. EADDRINUSE) here instead of throwing.
    if (err) {
      logger.fatal({ err, port: config.PORT }, 'Could not start the HTTP server');
      process.exit(1);
    }
    logger.info({ port: config.PORT, env: config.NODE_ENV }, 'API listening');
    if (!config.SCHEDULER_SECRET) {
      logger.warn('SCHEDULER_SECRET is not set: the HTTP tick endpoint is disabled. Run `npm run worker` to execute checks locally.');
    }
    if (config.ALLOW_PRIVATE_TARGETS) logger.warn('ALLOW_PRIVATE_TARGETS is enabled: SSRF protection is relaxed (development only).');
  });

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Shutting down');
    server.close(() => {
      disconnectDatabase().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

process.on('unhandledRejection', (reason) => logger.error({ err: reason }, 'Unhandled promise rejection'));

main().catch((err: unknown) => {
  logger.fatal({ err }, 'Failed to start');
  process.exit(1);
});
