/**
 * One-shot scheduler run, for Render Cron Jobs (paid) or any external cron:
 *   node dist/jobs/tick.js
 */
import { config } from '../config/env.js';
import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { createDefaultDeps } from '../deps.js';
import { runTick } from '../services/schedulerService.js';
import { logger } from '../utils/logger.js';

try {
  await connectDatabase(config.MONGODB_URI);
  const summary = await runTick(createDefaultDeps(), {
    source: 'cron-job',
    concurrency: config.SCHEDULER_CONCURRENCY,
    maxJobs: config.SCHEDULER_MAX_JOBS_PER_TICK,
  });
  logger.info(summary, 'Tick complete');
} catch (err) {
  logger.fatal({ err }, 'Tick failed');
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
