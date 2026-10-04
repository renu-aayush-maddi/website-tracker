import mongoose from 'mongoose';
import '../models/index.js';
import { logger } from '../utils/logger.js';

// Filters on paths that are not in a schema are dropped instead of passed to MongoDB.
mongoose.set('strictQuery', true);

export async function connectDatabase(uri: string): Promise<typeof mongoose> {
  const connection = await mongoose.connect(uri, {
    // Atlas M0 allows 500 connections shared by every client; stay well below.
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 15_000,
    appName: 'website-tracker',
  });
  // Build indexes (including TTL indexes) before serving traffic.
  await Promise.all(Object.values(connection.models).map((model) => model.init()));
  logger.info({ db: connection.connection.name }, 'Connected to MongoDB');
  return connection;
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}
