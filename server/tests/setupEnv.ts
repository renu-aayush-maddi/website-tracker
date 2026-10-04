import { randomUUID } from 'node:crypto';
import { inject } from 'vitest';

// Runs before each test file's imports, so src/config/env.ts sees these values.
const base = new URL(inject('mongoUri'));
base.pathname = `/wt_test_${randomUUID().slice(0, 8)}`;

Object.assign(process.env, {
  NODE_ENV: 'test',
  MONGODB_URI: base.toString(),
  FRONTEND_URL: 'http://localhost:5173',
  SCHEDULER_SECRET: 'test-scheduler-secret-0123456789abcdef',
  SETUP_TOKEN: 'test-setup-token-123456',
  ALLOW_REGISTRATION: 'false',
  ALLOW_PRIVATE_TARGETS: 'false',
  EMAIL_PROVIDER: 'none',
});
