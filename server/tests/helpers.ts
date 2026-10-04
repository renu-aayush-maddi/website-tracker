import mongoose from 'mongoose';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent.js';
import { createApp } from '../src/app.js';
import { connectDatabase } from '../src/config/db.js';
import type { AppDeps } from '../src/deps.js';
import { User } from '../src/models/index.js';
import { hashPassword } from '../src/services/authService.js';
import type { EmailMessage, EmailSender } from '../src/services/email/emailSender.js';
import { createProber } from '../src/services/probe/httpProbe.js';
import { anyValidAddress } from '../src/services/probe/ssrf.js';
import { createTargetCheck } from '../src/services/probe/targetPolicy.js';

export const ORIGIN = 'http://localhost:5173';
export const PASSWORD = 'correct-horse-battery-staple';

export async function connectTestDb() {
  await connectDatabase(process.env.MONGODB_URI!);
}

export async function closeTestDb() {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
}

export async function clearDb() {
  const collections = await mongoose.connection.db!.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
}

export interface FakeEmailSender extends EmailSender {
  sent: EmailMessage[];
  failNext: (times: number) => void;
}

export function fakeEmailSender(): FakeEmailSender {
  let failures = 0;
  const sender: FakeEmailSender = {
    provider: 'resend',
    sent: [],
    failNext: (times) => {
      failures = times;
    },
    async send(message) {
      if (failures > 0) {
        failures -= 1;
        throw new Error('provider unavailable');
      }
      sender.sent.push(message);
    },
  };
  return sender;
}

/** Deps that allow loopback targets so checks can hit the local test server. */
export function testDeps(overrides: Partial<AppDeps> = {}): AppDeps {
  return {
    prober: createProber({ addressPolicy: anyValidAddress, allowLocalHostnames: true }),
    checkTarget: createTargetCheck(anyValidAddress, true),
    emailSender: fakeEmailSender(),
    ...overrides,
  };
}

export function createTestApp(deps: AppDeps = testDeps()) {
  return createApp(deps);
}

export async function createUser(email = 'owner@example.com', name = 'Owner', role: 'admin' | 'member' = 'admin') {
  return User.create({ name, email, passwordHash: await hashPassword(PASSWORD), role });
}

/** A supertest agent that keeps cookies and sends the allowed Origin header. */
export function browser(app: ReturnType<typeof createApp>): TestAgent {
  return request.agent(app).set('Origin', ORIGIN);
}

export async function loggedInAgent(app: ReturnType<typeof createApp>, email = 'owner@example.com') {
  const user = (await User.findOne({ email })) ?? (await createUser(email));
  const agent = browser(app);
  const res = await agent.post('/api/auth/login').send({ email, password: PASSWORD });
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { agent, user };
}

export function monitorConfig(overrides: Record<string, unknown> = {}) {
  return {
    enabled: false,
    url: '',
    method: 'GET',
    intervalSeconds: 600,
    timeoutMs: 5000,
    failureThreshold: 3,
    ...overrides,
  };
}

export function environmentPayload(overrides: Record<string, unknown> = {}) {
  const { healthCheck, wakeUp, ...rest } = overrides as { healthCheck?: Record<string, unknown>; wakeUp?: Record<string, unknown> };
  return {
    type: 'PRODUCTION',
    websiteUrl: 'https://expense.example.com',
    backendUrl: 'https://expense-api.onrender.com',
    frontendHosting: { provider: 'render' },
    backendHosting: { provider: 'render', region: 'Singapore' },
    database: {
      provider: 'supabase',
      databaseName: 'expense_tracker',
      projectName: 'Expense Tracker',
      accountProvider: 'google',
      accountIdentifier: 'myproject@gmail.com',
      dashboardUrl: 'https://supabase.com/dashboard/project/abc',
    },
    healthCheck: { ...monitorConfig({ degradedThresholdMs: 2000, expectedStatus: '2xx' }), ...healthCheck },
    wakeUp: { ...monitorConfig(), ...wakeUp },
    ...rest,
  };
}

export function websitePayload(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Expense Tracker',
    description: 'Personal expense tracking app',
    lifecycleStatus: 'ACTIVE',
    tags: ['Personal', 'MERN'],
    repository: { provider: 'github', url: 'https://github.com/example/expense-tracker', defaultBranch: 'main' },
    notes: 'Production deployment',
    environments: [environmentPayload()],
    ...overrides,
  };
}
