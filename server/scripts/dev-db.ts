/**
 * Local development database: a persistent single-node MongoDB replica set
 * (transactions need a replica set). Data lives in server/.dev-db.
 *
 *   npm run dev:db
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

const port = Number(process.env.DEV_DB_PORT ?? 27018);
const dbPath = resolve(import.meta.dirname, '../.dev-db');
mkdirSync(dbPath, { recursive: true });

const replSet = await MongoMemoryReplSet.create({
  replSet: { count: 1, name: 'rs0', storageEngine: 'wiredTiger' },
  instanceOpts: [{ port, dbPath }],
});

process.stdout.write(
  `\nMongoDB replica set running. Put this in server/.env:\n\n  MONGODB_URI=${replSet.getUri('website_tracker')}\n\nData directory: ${dbPath}\nPress Ctrl+C to stop.\n`,
);

const stop = async () => {
  await replSet.stop({ doCleanup: false });
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
