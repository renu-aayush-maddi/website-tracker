import { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Monitor, MonitoringLog, type MonitorDoc } from '../src/models/index.js';
import { renderMessage } from '../src/services/notificationService.js';
import { chooseBucket } from '../src/services/statsService.js';
import {
  clearDb,
  closeTestDb,
  connectTestDb,
  createTestApp,
  environmentPayload,
  fakeEmailSender,
  loggedInAgent,
  testDeps,
  websitePayload,
} from './helpers.js';

const deps = testDeps();
const app = createTestApp(deps);

beforeAll(connectTestDb);
afterAll(closeTestDb);
beforeEach(clearDb);

async function seedWebsite() {
  const { agent, user } = await loggedInAgent(app);
  const site = (
    await agent.post('/api/websites').send(
      websitePayload({ environments: [environmentPayload({ healthCheck: { enabled: true, url: 'https://api.example.com/health' } })] }),
    )
  ).body.data;
  const env = site.environments[0];
  return { agent, user, site, env };
}

/** Inserts logs one minute apart ending at `end`, with the given success pattern and response times. */
async function seedLogs(
  ctx: Awaited<ReturnType<typeof seedWebsite>>,
  entries: Array<{ success: boolean; ms: number | null; type?: 'HEALTH_CHECK' | 'WAKE_UP'; at?: Date }>,
  end = new Date(),
) {
  await MonitoringLog.insertMany(
    entries.map((e, i) => {
      const startedAt = e.at ?? new Date(end.getTime() - (entries.length - i) * 60_000);
      return {
        userId: ctx.user._id,
        websiteId: ctx.site.id,
        environmentId: ctx.env.id,
        monitorId: e.type === 'WAKE_UP' ? ctx.env.wakeUp.id : ctx.env.healthCheck.id,
        type: e.type ?? 'HEALTH_CHECK',
        trigger: 'SCHEDULED',
        url: 'https://api.example.com/health',
        method: 'GET',
        startedAt,
        completedAt: startedAt,
        responseMs: e.ms,
        statusCode: e.success ? 200 : e.ms === null ? null : 503,
        success: e.success,
        errorCode: e.success ? null : e.ms === null ? 'TIMEOUT' : 'HTTP_STATUS',
      };
    }),
  );
}

describe('GET /api/logs', () => {
  it('paginates with a stable cursor, newest first, without duplicates', async () => {
    const ctx = await seedWebsite();
    await seedLogs(ctx, Array.from({ length: 60 }, () => ({ success: true, ms: 100 })));
    const seen: string[] = [];
    let cursor: string | null = null;
    const pageSizes: number[] = [];
    do {
      const res = await ctx.agent.get(`/api/logs?limit=25${cursor ? `&cursor=${cursor}` : ''}`);
      expect(res.status).toBe(200);
      pageSizes.push(res.body.data.items.length);
      seen.push(...res.body.data.items.map((i: { id: string }) => i.id));
      cursor = res.body.data.nextCursor;
    } while (cursor);
    expect(pageSizes).toEqual([25, 25, 10]);
    expect(new Set(seen).size).toBe(60);
    const first = await ctx.agent.get('/api/logs?limit=2');
    const [a, b] = first.body.data.items;
    expect(new Date(a.startedAt) >= new Date(b.startedAt)).toBe(true);
    expect(a).toMatchObject({ websiteName: 'Expense Tracker', environmentLabel: 'Production', type: 'HEALTH_CHECK' });
  });

  it('filters by type, result, website and date range', async () => {
    const ctx = await seedWebsite();
    await seedLogs(ctx, [
      { success: true, ms: 100 },
      { success: false, ms: 900 },
      { success: false, ms: null },
      { success: true, ms: 80, type: 'WAKE_UP' },
      { success: true, ms: 80, at: new Date(Date.now() - 10 * 86_400_000) },
    ]);
    const count = async (qs: string) => (await ctx.agent.get(`/api/logs?${qs}`)).body.data.items.length;
    expect(await count('type=WAKE_UP')).toBe(1);
    expect(await count('type=HEALTH_CHECK&result=failure')).toBe(2);
    expect(await count(`websiteId=${ctx.site.id}`)).toBe(5);
    expect(await count(`websiteId=${new Types.ObjectId().toString()}`)).toBe(0);
    expect(await count(`from=${new Date(Date.now() - 86_400_000).toISOString()}`)).toBe(4);
  });

  it('rejects bad cursors and limits (400)', async () => {
    const { agent } = await seedWebsite();
    expect((await agent.get('/api/logs?cursor=garbage')).status).toBe(400);
    expect((await agent.get('/api/logs?limit=5000')).status).toBe(400);
  });
});

describe('stats', () => {
  it('summarises totals, uptime and response times', async () => {
    const ctx = await seedWebsite();
    await seedLogs(ctx, [
      { success: true, ms: 100 },
      { success: true, ms: 200 },
      { success: true, ms: 300 },
      { success: false, ms: 2400 },
      { success: false, ms: null },
      { success: true, ms: 50, type: 'WAKE_UP' },
    ]);
    const res = await ctx.agent.get(`/api/stats/summary?websiteId=${ctx.site.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      total: 5,
      successes: 3,
      failures: 2,
      successRate: 0.6,
      avgResponseMs: 750,
      minResponseMs: 100,
      maxResponseMs: 2400,
    });
    expect(res.body.data.p95ResponseMs).toBeGreaterThanOrEqual(300);
    const wake = await ctx.agent.get(`/api/stats/summary?type=WAKE_UP`);
    expect(wake.body.data).toMatchObject({ total: 1, successRate: 1 });
  });

  it('returns nulls when there is no data', async () => {
    const { agent } = await seedWebsite();
    const res = await agent.get('/api/stats/summary');
    expect(res.body.data).toMatchObject({ total: 0, successRate: null, avgResponseMs: null });
  });

  it('buckets the time series in the user time zone (Asia/Kolkata days start at 18:30 UTC)', async () => {
    const ctx = await seedWebsite();
    await seedLogs(ctx, [
      { success: true, ms: 100, at: new Date('2026-09-01T18:00:00Z') }, // 23:30 IST, 1 Sep
      { success: false, ms: 300, at: new Date('2026-09-01T19:00:00Z') }, // 00:30 IST, 2 Sep
      { success: true, ms: 200, at: new Date('2026-09-02T10:00:00Z') }, // 15:30 IST, 2 Sep
    ]);
    const res = await ctx.agent.get('/api/stats/timeseries?from=2026-08-20T00:00:00Z&to=2026-09-10T00:00:00Z');
    expect(res.status).toBe(200);
    expect(res.body.data.bucketUnit).toBe('day');
    expect(res.body.data.points).toEqual([
      { bucket: '2026-08-31T18:30:00.000Z', total: 1, successes: 1, successRate: 1, avgResponseMs: 100, maxResponseMs: 100 },
      { bucket: '2026-09-01T18:30:00.000Z', total: 2, successes: 1, successRate: 0.5, avgResponseMs: 250, maxResponseMs: 300 },
    ]);
  });

  it('chooses sensible bucket sizes', () => {
    expect(chooseBucket(60 * 60_000)).toEqual({ unit: 'minute', size: 5 });
    expect(chooseBucket(24 * 3_600_000)).toEqual({ unit: 'hour', size: 1 });
    expect(chooseBucket(7 * 86_400_000)).toEqual({ unit: 'hour', size: 6 });
    expect(chooseBucket(30 * 86_400_000)).toEqual({ unit: 'day', size: 1 });
    expect(chooseBucket(365 * 86_400_000)).toEqual({ unit: 'week', size: 1 });
  });

  it('validates ranges (400)', async () => {
    const { agent } = await seedWebsite();
    expect((await agent.get('/api/stats/summary?from=2026-09-02T00:00:00Z&to=2026-09-01T00:00:00Z')).status).toBe(400);
    expect((await agent.get('/api/stats/summary?from=2020-01-01T00:00:00Z&to=2026-01-01T00:00:00Z')).status).toBe(400);
  });
});

describe('settings and retention', () => {
  const settings = {
    timezone: 'Asia/Kolkata',
    dateFormat: 'DD MMM YYYY',
    timeFormat: '24h',
    theme: 'dark',
    logRetentionDays: 7,
    monitoringDefaults: { intervalSeconds: 300, timeoutMs: 20_000, failureThreshold: 2, degradedThresholdMs: 1500 },
    notifications: { emailEnabled: true, recipient: '', onDown: true, onRecovery: false, onWakeUpFailure: true },
  };

  it('defaults to Asia/Kolkata with 30-day retention', async () => {
    const { agent } = await seedWebsite();
    const res = await agent.get('/api/settings');
    expect(res.status).toBe(200);
    expect(res.body.data.settings).toMatchObject({ timezone: 'Asia/Kolkata', logRetentionDays: 30, theme: 'system' });
    expect(res.body.data.server).toEqual({ emailDeliveryConfigured: true, emailProvider: 'resend' });
    expect(res.body.data.storage.enabledMonitorIntervals).toEqual([600]);
  });

  it('updates settings and re-applies retention to existing logs', async () => {
    const ctx = await seedWebsite();
    await seedLogs(ctx, [{ success: true, ms: 100, at: new Date('2026-09-01T00:00:00Z') }]);
    expect((await MonitoringLog.findOne().lean())!.expiresAt).toBeUndefined();

    const res = await ctx.agent.put('/api/settings').send(settings);
    expect(res.status).toBe(200);
    expect(res.body.data.settings).toMatchObject({ theme: 'dark', logRetentionDays: 7 });
    expect((await MonitoringLog.findOne().lean())!.expiresAt?.toISOString()).toBe('2026-09-08T00:00:00.000Z');

    await ctx.agent.put('/api/settings').send({ ...settings, logRetentionDays: 0 });
    expect((await MonitoringLog.findOne().lean())!.expiresAt).toBeUndefined();
  });

  it('applies retention to new logs', async () => {
    const { agent, env } = await seedWebsite();
    await agent.put('/api/settings').send({ ...settings, logRetentionDays: 90 });
    const run = await agent.post(`/api/monitors/${env.wakeUp.id}/run`);
    expect(run.status).toBe(400); // wake-up has no URL; use the health monitor instead
    await Monitor.updateOne({ _id: env.healthCheck.id }, { url: 'https://unreachable.invalid/' });
    const res = await agent.post(`/api/monitors/${env.healthCheck.id}/run`);
    expect(res.status).toBe(200);
    const log = await MonitoringLog.findById(res.body.data.log.id).lean();
    expect(log!.expiresAt!.getTime() - log!.startedAt.getTime()).toBe(90 * 86_400_000);
  });

  it('has a TTL index on expiresAt', async () => {
    const indexes = await MonitoringLog.collection.indexes();
    expect(indexes.find((i) => i.key.expiresAt === 1)?.expireAfterSeconds).toBe(0);
  });

  it.each([
    ['unknown time zone', { timezone: 'Mars/Olympus' }],
    ['unsupported retention', { logRetentionDays: 45 }],
    ['interval below 1 minute', { monitoringDefaults: { ...settings.monitoringDefaults, intervalSeconds: 10 } }],
  ])('rejects %s (400)', async (_label, patch) => {
    const { agent } = await seedWebsite();
    expect((await agent.put('/api/settings').send({ ...settings, ...patch })).status).toBe(400);
  });

  it('sends a test email, or reports when email is not configured', async () => {
    const sender = fakeEmailSender();
    const withEmail = createTestApp(testDeps({ emailSender: sender }));
    const { agent } = await loggedInAgent(withEmail);
    const ok = await agent.post('/api/settings/notifications/test');
    expect(ok.status).toBe(200);
    expect(sender.sent[0]?.to).toBe('owner@example.com');

    const without = createTestApp(testDeps({ emailSender: null }));
    const res = await (await loggedInAgent(without)).agent.post('/api/settings/notifications/test');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('EMAIL_NOT_CONFIGURED');
  });
});

describe('dashboard', () => {
  it('counts websites by status and lists recent activity', async () => {
    const ctx = await seedWebsite();
    await ctx.agent.post('/api/websites').send(websitePayload({ name: 'Portfolio' }));
    await Monitor.updateOne(
      { _id: ctx.env.healthCheck.id },
      { 'state.status': 'DOWN', 'state.consecutiveFailures': 3, 'state.lastRunAt': new Date() },
    );
    await seedLogs(ctx, [{ success: true, ms: 100 }, { success: false, ms: 500 }]);
    const res = await ctx.agent.get('/api/dashboard');
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.counts).toMatchObject({ websites: 2, down: 1, paused: 1, monitoringEnabled: 1, wakeUpEnabled: 0 });
    expect(d.websites[0]).toMatchObject({ name: 'Expense Tracker', status: 'DOWN', environmentLabel: 'Production' });
    expect(d.last24h).toMatchObject({ checks: 2, successRate: 0.5, avgResponseMs: 300 });
    expect(d.recentActivity).toHaveLength(2);
  });

  it('warns about wake-ups that keep Render free services running all month', async () => {
    const { agent } = await loggedInAgent(app);
    await agent.post('/api/websites').send(
      websitePayload({
        environments: [environmentPayload({ wakeUp: { enabled: true, url: 'https://my-api.onrender.com/health', intervalSeconds: 600 } })],
      }),
    );
    expect((await agent.get('/api/dashboard')).body.data.warnings.renderAlwaysOnWakeUps).toBe(1);
  });
});

describe('notification messages', () => {
  const website = { _id: new Types.ObjectId(), name: 'Expense Tracker', environments: [{ _id: new Types.ObjectId(), type: 'PRODUCTION' as const, frontendHosting: {}, backendHosting: {}, database: {} }] };
  const monitor = {
    _id: new Types.ObjectId(),
    environmentId: website.environments[0]!._id,
    url: 'https://expense-api.onrender.com/health',
    state: {
      consecutiveFailures: 3,
      lastStatusCode: 503,
      lastErrorCode: 'HTTP_STATUS',
      lastErrorMessage: 'Unexpected HTTP status 503',
      lastSuccessAt: new Date('2026-10-04T14:20:00Z'),
      lastResponseMs: 420,
    },
  } as unknown as MonitorDoc;

  it.each(['MONITOR_DOWN', 'MONITOR_RECOVERED', 'WAKE_UP_FAILING'] as const)('renders %s in the user time zone', (event) => {
    const { subject, text } = renderMessage({
      event,
      monitor,
      website: website as never,
      previousStatusChangedAt: new Date(Date.now() - 25 * 60_000),
      timezone: 'Asia/Kolkata',
    });
    expect(subject).toContain('Expense Tracker (Production)');
    expect(text).toContain('https://expense-api.onrender.com/health');
    if (event !== 'MONITOR_RECOVERED') expect(text).toContain('04 Oct 2026, 19:50:00 GMT+5:30');
    if (event === 'MONITOR_DOWN') expect(text).toContain('has failed 3 consecutive health checks');
    if (event === 'MONITOR_RECOVERED') expect(text).toContain('Downtime: about 25 minute(s)');
  });
});
