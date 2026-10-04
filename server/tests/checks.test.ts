import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Monitor, MonitoringLog, Notification, User, type MonitorDoc } from '../src/models/index.js';
import { runMonitor } from '../src/services/checkService.js';
import { startTargetServer, type TargetServer } from './targetServer.js';
import {
  clearDb,
  closeTestDb,
  connectTestDb,
  createTestApp,
  environmentPayload,
  loggedInAgent,
  testDeps,
  websitePayload,
} from './helpers.js';

const deps = testDeps();
const app = createTestApp(deps);
let target: TargetServer;

beforeAll(async () => {
  await connectTestDb();
  target = await startTargetServer();
});
afterAll(async () => {
  await target.close();
  await closeTestDb();
});
beforeEach(clearDb);

async function setup(health: Record<string, unknown> = {}, wakeUp: Record<string, unknown> = {}) {
  const { agent, user } = await loggedInAgent(app);
  await User.updateOne({ _id: user._id }, { 'settings.notifications.emailEnabled': true });
  const res = await agent.post('/api/websites').send(
    websitePayload({
      environments: [
        environmentPayload({
          healthCheck: { enabled: true, url: `${target.url}/status/200`, failureThreshold: 3, ...health },
          wakeUp: { url: `${target.url}/status/200`, ...wakeUp },
        }),
      ],
    }),
  );
  expect(res.status).toBe(201);
  const env = res.body.data.environments[0];
  return { agent, user, websiteId: res.body.data.id as string, healthId: env.healthCheck.id as string, wakeId: env.wakeUp.id as string };
}

/** Points a monitor at a different path without resetting its state (as a flaky target would behave). */
async function respondWith(monitorId: string, path: string) {
  await Monitor.updateOne({ _id: monitorId }, { url: `${target.url}${path}` });
  return (await Monitor.findById(monitorId).lean<MonitorDoc>())!;
}

async function run(monitorId: string, path: string) {
  const monitor = await respondWith(monitorId, path);
  return runMonitor(monitor, { deps, trigger: 'SCHEDULED' });
}

describe('manual runs', () => {
  it('"Run health check now" performs the request server-side and stores the result', async () => {
    const { agent, healthId } = await setup();
    const res = await agent.post(`/api/monitors/${healthId}/run`);
    expect(res.status).toBe(200);
    expect(res.body.data.log).toMatchObject({ success: true, statusCode: 200, trigger: 'MANUAL', type: 'HEALTH_CHECK', websiteName: 'Expense Tracker' });
    expect(res.body.data.monitor.state).toMatchObject({ status: 'UP', lastStatusCode: 200 });
    expect(await MonitoringLog.countDocuments()).toBe(1);
  });

  it('"Wake up now" records a wake-up without touching health state', async () => {
    const { agent, healthId, wakeId } = await setup();
    await Monitor.updateOne({ _id: wakeId }, { enabled: true, nextRunAt: new Date() });
    const res = await agent.post(`/api/monitors/${wakeId}/run`);
    expect(res.status).toBe(200);
    expect(res.body.data.log.type).toBe('WAKE_UP');
    expect((await Monitor.findById(healthId))!.state.status).toBe('UNKNOWN');
  });

  it('records a manual test of a disabled monitor but keeps it paused', async () => {
    const { agent, wakeId } = await setup();
    const res = await agent.post(`/api/monitors/${wakeId}/run`);
    expect(res.status).toBe(200);
    expect(res.body.data.monitor.state.status).toBe('PAUSED');
    expect(await MonitoringLog.countDocuments({ monitorId: wakeId })).toBe(1);
  });

  it('refuses to run a monitor without a URL (400)', async () => {
    const { agent, wakeId } = await setup({}, { url: '' });
    expect((await agent.post(`/api/monitors/${wakeId}/run`)).status).toBe(400);
  });
});

describe('health status logic', () => {
  it('goes DEGRADED (failing) → DOWN at the threshold → UP, notifying only on transitions', async () => {
    const { healthId } = await setup();
    const statuses: string[] = [];
    for (let i = 0; i < 4; i++) statuses.push((await run(healthId, '/status/503')).monitor!.state.status);
    expect(statuses).toEqual(['DEGRADED', 'DEGRADED', 'DOWN', 'DOWN']);

    let notes = await Notification.find().lean();
    expect(notes.map((n) => n.event)).toEqual(['MONITOR_DOWN']);
    expect(notes[0]!.text).toContain('has failed 3 consecutive health checks');
    expect(notes[0]!.text).toContain('HTTP 503');

    const recovered = await run(healthId, '/status/200');
    expect(recovered.monitor!.state).toMatchObject({ status: 'UP', consecutiveFailures: 0 });
    notes = await Notification.find().sort({ createdAt: 1 }).lean();
    expect(notes.map((n) => n.event)).toEqual(['MONITOR_DOWN', 'MONITOR_RECOVERED']);
  });

  it('marks slow successful responses DEGRADED (SLOW)', async () => {
    const { healthId } = await setup({ degradedThresholdMs: 100 });
    const outcome = await run(healthId, '/slow/300');
    expect(outcome.log.success).toBe(true);
    expect(outcome.monitor!.state).toMatchObject({ status: 'DEGRADED', degradedReason: 'SLOW' });
  });

  it.each([
    ['/status/201', true, null],
    ['/redirect/301', true, null],
    ['/status/404', false, 'HTTP_STATUS'],
    ['/status/429', false, 'HTTP_STATUS'],
    ['/status/500', false, 'HTTP_STATUS'],
    ['/status/304', false, 'HTTP_STATUS'],
    ['/loop', false, 'TOO_MANY_REDIRECTS'],
    ['/reset', false, 'CONNECTION_RESET'],
  ])('health check of %s → success=%s (%s)', async (path, success, errorCode) => {
    const { healthId } = await setup();
    const { log } = await run(healthId, path);
    expect(log.success).toBe(success);
    expect(log.errorCode).toBe(errorCode);
  });

  it('accepts 3xx when configured for 2xx-3xx', async () => {
    const { healthId } = await setup({ expectedStatus: '2xx-3xx' });
    expect((await run(healthId, '/status/304')).log.success).toBe(true);
  });

  it('records timeouts as failures without throwing', async () => {
    const { healthId } = await setup({ timeoutMs: 1000 });
    const { log, monitor } = await run(healthId, '/hang');
    expect(log).toMatchObject({ success: false, errorCode: 'TIMEOUT', statusCode: null, responseMs: null });
    expect(monitor!.state.lastErrorCode).toBe('TIMEOUT');
  });

  it('does not notify when email notifications are off', async () => {
    const { healthId, user } = await setup({ failureThreshold: 1 });
    await User.updateOne({ _id: user._id }, { 'settings.notifications.emailEnabled': false });
    expect((await run(healthId, '/status/500')).monitor!.state.status).toBe('DOWN');
    expect(await Notification.countDocuments()).toBe(0);
  });

  it('ignores a result if the monitor was reconfigured while the request was in flight', async () => {
    const { healthId } = await setup();
    const stale = await respondWith(healthId, '/status/500');
    await Monitor.updateOne({ _id: healthId }, { url: `${target.url}/status/200` });
    const outcome = await runMonitor(stale, { deps, trigger: 'SCHEDULED' });
    expect(outcome.monitor).toBeNull();
    expect((await Monitor.findById(healthId))!.state.consecutiveFailures).toBe(0);
  });
});

describe('wake-up logic', () => {
  it.each([
    ['/status/200', true],
    ['/status/404', true],
    ['/status/401', true],
    ['/status/503', false],
  ])('wake-up of %s → success=%s', async (path, success) => {
    const { wakeId } = await setup({}, { enabled: true });
    expect((await run(wakeId, path)).log.success).toBe(success);
  });

  it('notifies once when wake-ups keep failing, and never changes health status', async () => {
    const { healthId, wakeId } = await setup({}, { enabled: true, failureThreshold: 2 });
    await run(wakeId, '/status/503');
    await run(wakeId, '/status/503');
    await run(wakeId, '/status/503');
    expect((await Notification.find().lean()).map((n) => n.event)).toEqual(['WAKE_UP_FAILING']);
    expect((await Monitor.findById(healthId))!.state.status).toBe('UNKNOWN');
  });
});

describe('enable / disable', () => {
  it('pauses and resumes a monitor', async () => {
    const { agent, healthId } = await setup();
    const off = await agent.patch(`/api/monitors/${healthId}`).send({ enabled: false });
    expect(off.status).toBe(200);
    expect(off.body.data).toMatchObject({ enabled: false, nextRunAt: null, state: { status: 'PAUSED' } });
    const on = await agent.patch(`/api/monitors/${healthId}`).send({ enabled: true });
    expect(on.body.data).toMatchObject({ enabled: true, state: { status: 'UNKNOWN' } });
    expect(on.body.data.nextRunAt).not.toBeNull();
  });

  it('cannot enable a monitor that has no URL (400)', async () => {
    const { agent, wakeId } = await setup({}, { url: '' });
    expect((await agent.patch(`/api/monitors/${wakeId}`).send({ enabled: true })).status).toBe(400);
  });

  it('keeps state when only thresholds change, but resets it when the URL changes', async () => {
    const { agent, websiteId, healthId } = await setup();
    await run(healthId, '/status/503');
    const site = (await agent.get(`/api/websites/${websiteId}`)).body.data;
    const env = site.environments[0];
    const current = await Monitor.findById(healthId).lean();
    const sameUrl = { ...environmentPayload(), id: env.id, healthCheck: { ...env.healthCheck, url: current!.url, failureThreshold: 1 } };
    let res = await agent.put(`/api/websites/${websiteId}`).send(websitePayload({ environments: [sameUrl] }));
    expect(res.body.data.environments[0].healthCheck.state).toMatchObject({ status: 'DOWN', consecutiveFailures: 1 });

    const newUrl = { ...sameUrl, healthCheck: { ...sameUrl.healthCheck, url: `${target.url}/status/204` } };
    res = await agent.put(`/api/websites/${websiteId}`).send(websitePayload({ environments: [newUrl] }));
    expect(res.body.data.environments[0].healthCheck.state).toMatchObject({ status: 'UNKNOWN', consecutiveFailures: 0 });
  });
});
