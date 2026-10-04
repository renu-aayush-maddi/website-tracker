/**
 * Long-running scheduler loop for local development or a Render Background
 * Worker (paid). This is a separate process from the web server; it polls
 * MongoDB for due monitors using the same lease-based claim as every trigger.
 */
import { setTimeout as sleep } from 'node:timers/promises';
import { config } from '../config/env.js';
import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { createDefaultDeps } from '../deps.js';
import { runTick } from '../services/schedulerService.js';
import { logger } from '../utils/logger.js';

const POLL_MS = 15_000;
const controller = new AbortController();
process.on('SIGTERM', () => controller.abort());
process.on('SIGINT', () => controller.abort());

await connectDatabase(config.MONGODB_URI);
const deps = createDefaultDeps();
logger.info({ pollMs: POLL_MS }, 'Scheduler worker started');

while (!controller.signal.aborted) {
  const started = Date.now();
  try {
    await runTick(deps, {
      source: 'worker',
      concurrency: config.SCHEDULER_CONCURRENCY,
      maxJobs: config.SCHEDULER_MAX_JOBS_PER_TICK,
    });
  } catch (err) {
    logger.error({ err }, 'Worker tick failed');
  }
  await sleep(Math.max(0, POLL_MS - (Date.now() - started)), undefined, { signal: controller.signal }).catch(() => undefined);
}

logger.info('Scheduler worker stopping');
await disconnectDatabase();
