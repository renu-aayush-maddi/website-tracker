import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Monitor, MonitoringLog, Notification, SystemState } from '../src/models/index.js';
import { claimDueMonitor, runTick } from '../src/services/schedulerService.js';
import { dispatchPending } from '../src/services/notificationService.js';
import { startTargetServer, type TargetServer } from './targetServer.js';
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
let target: TargetServer;
const tickOptions = { source: 'test', concurrency: 4, maxJobs: 100 };

beforeAll(async () => {
  await connectTestDb();
  target = await startTargetServer();
});
afterAll(async () => {
  await target.close();
  await closeTestDb();
});
beforeEach(clearDb);

async function createMonitors(count: number) {
  const { agent } = await loggedInAgent(app);
  const environments = Array.from({ length: count }, (_, i) =>
    environmentPayload({
      type: 'OTHER',
      label: `env-${i}`,
      healthCheck: { enabled: true, url: `${target.url}/status/200`, intervalSeconds: 300 },
    }),
  );
  const res = await agent.post('/api/websites').send(websitePayload({ environments }));
  expect(res.status).toBe(201);
  return res.body.data.environments.map((e: { healthCheck: { id: string } }) => e.healthCheck.id) as string[];
}

describe('claimDueMonitor', () => {
  it('claims due monitors once, advancing nextRunAt by the interval and taking a lease', async () => {
    const [id] = await createMonitors(1);
    const now = new Date();
    const claimed = await claimDueMonitor(now);
    expect(claimed?._id.toString()).toBe(id);
    expect(claimed!.nextRunAt!.getTime()).toBe(now.getTime() + 300_000);
    expect(claimed!.lockedUntil!.getTime()).toBeGreaterThan(now.getTime());
    expect(await claimDueMonitor(now)).toBeNull();
  });

  it('skips disabled, not-yet-due and leased monitors', async () => {
    const [a, b, c] = await createMonitors(3);
    const now = new Date();
    await Monitor.updateOne({ _id: a }, { enabled: false });
    await Monitor.updateOne({ _id: b }, { nextRunAt: new Date(now.getTime() + 60_000) });
    await Monitor.updateOne({ _id: c }, { lockedUntil: new Date(now.getTime() + 60_000) });
    expect(await claimDueMonitor(now)).toBeNull();
    // An expired lease (crashed run) is reclaimable.
    await Monitor.updateOne({ _id: c }, { lockedUntil: new Date(now.getTime() - 1) });
    expect((await claimDueMonitor(now))?._id.toString()).toBe(c);
  });
});

describe('runTick', () => {
  it('runs every due monitor and records the tick', async () => {
    const ids = await createMonitors(5);
    const summary = await runTick(deps, tickOptions);
    expect(summary.jobs).toBe(5);
    expect(summary.errors).toBe(0);
    expect(await MonitoringLog.countDocuments({ trigger: 'SCHEDULED' })).toBe(5);
    const monitors = await Monitor.find({ _id: { $in: ids } }).lean();
    expect(monitors.every((m) => m.state.status === 'UP' && m.lockedUntil === null)).toBe(true);
    const state = await SystemState.findById('scheduler').lean();
    expect(state?.lastTickSource).toBe('test');
    expect(state?.lastTickJobs).toBe(5);

    // Nothing is due any more.
    expect((await runTick(deps, tickOptions)).jobs).toBe(0);
  });

  it('never runs a monitor twice when ticks overlap', async () => {
    await createMonitors(8);
    const summaries = await Promise.all([runTick(deps, tickOptions), runTick(deps, tickOptions), runTick(deps, tickOptions)]);
    expect(summaries.reduce((n, s) => n + s.jobs, 0)).toBe(8);
    const perMonitor = await MonitoringLog.aggregate([{ $group: { _id: '$monitorId', n: { $sum: 1 } } }]);
    expect(perMonitor).toHaveLength(8);
    expect(perMonitor.every((r) => r.n === 1)).toBe(true);
  });

  it('keeps going when a check throws and releases its lease', async () => {
    const [bad, good] = await createMonitors(2);
    const failingDeps = {
      ...deps,
      prober: {
        probe: vi.fn(async (req: { url: string }) => {
          if (req.url.includes('boom')) throw new Error('prober crashed');
          return deps.prober.probe(req as never);
        }),
      },
    };
    await Monitor.updateOne({ _id: bad }, { url: `${target.url}/boom` });
    const summary = await runTick(failingDeps, tickOptions);
    expect(summary).toMatchObject({ jobs: 2, errors: 1 });
    expect((await Monitor.findById(bad))!.lockedUntil).toBeNull();
    expect((await Monitor.findById(good))!.state.status).toBe('UP');
  });

  it('respects maxJobs', async () => {
    await createMonitors(6);
    expect((await runTick(deps, { ...tickOptions, concurrency: 1, maxJobs: 2 })).jobs).toBe(2);
  });
});

describe('POST /api/internal/scheduler/tick', () => {
  it('requires the scheduler secret (401)', async () => {
    expect((await request(app).post('/api/internal/scheduler/tick')).status).toBe(401);
    expect((await request(app).post('/api/internal/scheduler/tick').set('Authorization', 'Bearer wrong')).status).toBe(401);
  });

  it('accepts (202) and runs due checks in the background', async () => {
    await createMonitors(2);
    const res = await request(app)
      .post('/api/internal/scheduler/tick?source=cron-job.org')
      .set('Authorization', 'Bearer test-scheduler-secret-0123456789abcdef');
    expect(res.status).toBe(202);
    expect(res.body.data.accepted).toBe(true);
    await vi.waitFor(async () => expect(await MonitoringLog.countDocuments()).toBe(2), { timeout: 5000 });
    await vi.waitFor(async () => expect((await SystemState.findById('scheduler').lean())?.lastTickJobs).toBe(2), { timeout: 5000 });
    expect((await SystemState.findById('scheduler').lean())?.lastTickSource).toBe('cron-job.org');
  });

  it('shows the scheduler as healthy on the dashboard after a tick', async () => {
    await createMonitors(1);
    const { agent } = await loggedInAgent(app);
    expect((await agent.get('/api/dashboard')).body.data.scheduler.stale).toBe(true);
    await runTick(deps, tickOptions);
    expect((await agent.get('/api/dashboard')).body.data.scheduler.stale).toBe(false);
  });
});

describe('notification delivery', () => {
  async function queue(count = 1) {
    const { user } = await loggedInAgent(app);
    await Notification.insertMany(
      Array.from({ length: count }, () => ({
        userId: user._id,
        event: 'MONITOR_DOWN',
        recipient: 'owner@example.com',
        subject: 'DOWN',
        text: 'down',
        status: 'PENDING',
        nextAttemptAt: new Date(),
      })),
    );
  }

  it('sends pending notifications', async () => {
    await queue(2);
    const sender = fakeEmailSender();
    expect(await dispatchPending({ ...deps, emailSender: sender })).toEqual({ sent: 2, failed: 0 });
    expect(sender.sent).toHaveLength(2);
    expect(await Notification.countDocuments({ status: 'SENT' })).toBe(2);
    // Already sent — not re-sent.
    expect(await dispatchPending({ ...deps, emailSender: sender })).toEqual({ sent: 0, failed: 0 });
  });

  it('retries with backoff and gives up after 3 attempts', async () => {
    await queue(1);
    const sender = fakeEmailSender();
    sender.failNext(10);
    const d = { ...deps, emailSender: sender };
    await dispatchPending(d);
    let n = await Notification.findOne().lean();
    expect(n).toMatchObject({ status: 'PENDING', attempts: 1, lastError: 'provider unavailable' });
    expect(n!.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now());

    for (let i = 0; i < 2; i++) {
      await Notification.updateOne({}, { nextAttemptAt: new Date() });
      await dispatchPending(d);
    }
    n = await Notification.findOne().lean();
    expect(n).toMatchObject({ status: 'FAILED', attempts: 3 });
  });
});
