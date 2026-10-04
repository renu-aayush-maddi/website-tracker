import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Monitor, MonitoringLog, Website } from '../src/models/index.js';
import { createProber } from '../src/services/probe/httpProbe.js';
import { publicAddressesOnly } from '../src/services/probe/ssrf.js';
import { createTargetCheck } from '../src/services/probe/targetPolicy.js';
import {
  clearDb,
  closeTestDb,
  connectTestDb,
  createTestApp,
  createUser,
  environmentPayload,
  loggedInAgent,
  testDeps,
  websitePayload,
} from './helpers.js';

const app = createTestApp();

beforeAll(connectTestDb);
afterAll(closeTestDb);
beforeEach(clearDb);

describe('website CRUD', () => {
  it('creates a website (201) with one health and one wake-up monitor per environment', async () => {
    const { agent } = await loggedInAgent(app);
    const res = await agent.post('/api/websites').send(
      websitePayload({
        environments: [
          environmentPayload({ healthCheck: { enabled: true, url: 'https://expense-api.onrender.com/health' } }),
          environmentPayload({ type: 'STAGING', websiteUrl: 'https://staging-expense.example.com' }),
        ],
      }),
    );
    expect(res.status).toBe(201);
    const site = res.body.data;
    expect(site.id).toMatch(/^[a-f0-9]{24}$/);
    expect(site.environments).toHaveLength(2);
    expect(site.environments[0].database).toMatchObject({ provider: 'supabase', accountIdentifier: 'myproject@gmail.com' });
    expect(site.environments[0].healthCheck).toMatchObject({ type: 'HEALTH_CHECK', enabled: true, state: { status: 'UNKNOWN' } });
    expect(site.environments[0].healthCheck.nextRunAt).not.toBeNull();
    expect(site.environments[1].healthCheck).toMatchObject({ enabled: false, state: { status: 'PAUSED' }, nextRunAt: null });
    expect(site.healthStatus).toBe('UNKNOWN');
    expect(await Monitor.countDocuments()).toBe(4);
  });

  it('reads, updates and deletes (204) a website', async () => {
    const { agent } = await loggedInAgent(app);
    const created = (await agent.post('/api/websites').send(websitePayload())).body.data;

    const read = await agent.get(`/api/websites/${created.id}`);
    expect(read.status).toBe(200);
    expect(read.body.data.name).toBe('Expense Tracker');

    const env = { ...environmentPayload({ wakeUp: { enabled: true, url: 'https://expense-api.onrender.com/health' } }), id: created.environments[0].id };
    const updated = await agent.put(`/api/websites/${created.id}`).send(websitePayload({ name: 'Expense Tracker v2', environments: [env] }));
    expect(updated.status).toBe(200);
    expect(updated.body.data.name).toBe('Expense Tracker v2');
    expect(updated.body.data.environments[0].id).toBe(created.environments[0].id);
    expect(updated.body.data.environments[0].wakeUp).toMatchObject({ enabled: true, state: { status: 'UNKNOWN' } });

    expect((await agent.delete(`/api/websites/${created.id}`)).status).toBe(204);
    expect((await agent.get(`/api/websites/${created.id}`)).status).toBe(404);
    expect(await Monitor.countDocuments()).toBe(0);
  });

  it('removes monitors and logs of environments dropped on update', async () => {
    const { agent } = await loggedInAgent(app);
    const created = (
      await agent.post('/api/websites').send(websitePayload({ environments: [environmentPayload(), environmentPayload({ type: 'STAGING' })] }))
    ).body.data;
    const staging = created.environments[1];
    await MonitoringLog.create({
      userId: (await Website.findById(created.id))!.userId,
      websiteId: created.id,
      environmentId: staging.id,
      monitorId: staging.healthCheck.id,
      type: 'HEALTH_CHECK',
      trigger: 'MANUAL',
      url: 'https://x.example.com',
      method: 'GET',
      startedAt: new Date(),
      completedAt: new Date(),
      success: true,
    });
    const res = await agent
      .put(`/api/websites/${created.id}`)
      .send(websitePayload({ environments: [{ ...environmentPayload(), id: created.environments[0].id }] }));
    expect(res.status).toBe(200);
    expect(res.body.data.environments).toHaveLength(1);
    expect(await Monitor.countDocuments({ environmentId: staging.id })).toBe(0);
    expect(await MonitoringLog.countDocuments({ environmentId: staging.id })).toBe(0);
  });

  it('returns 404 for unknown and malformed ids', async () => {
    const { agent } = await loggedInAgent(app);
    expect((await agent.get('/api/websites/000000000000000000000000')).status).toBe(404);
    expect((await agent.get('/api/websites/not-an-id')).status).toBe(404);
    expect((await agent.delete('/api/websites/000000000000000000000000')).status).toBe(404);
  });
});

describe('validation', () => {
  it.each([
    ['missing name', { name: '' }, 'name'],
    ['javascript: URL', { repository: { url: 'javascript:alert(1)' } }, 'repository.url'],
    ['credentials in a URL', { repository: { url: 'https://user:pass@github.com/x' } }, 'repository.url'],
    ['a secret in notes', { notes: 'DATABASE_URL=postgres://admin:supersecret@db.example.com/app' }, 'notes'],
    ['no environments', { environments: [] }, 'environments'],
    ['unknown lifecycle', { lifecycleStatus: 'LIVE' }, 'lifecycleStatus'],
  ])('rejects %s (400)', async (_label, overrides, field) => {
    const { agent } = await loggedInAgent(app);
    const res = await agent.post('/api/websites').send(websitePayload(overrides));
    expect(res.status).toBe(400);
    expect(res.body.error.fields[field]).toBeDefined();
  });

  it('requires a URL for an enabled monitor', async () => {
    const { agent } = await loggedInAgent(app);
    const res = await agent.post('/api/websites').send(websitePayload({ environments: [environmentPayload({ healthCheck: { enabled: true, url: '' } })] }));
    expect(res.status).toBe(400);
    expect(res.body.error.fields['environments.0.healthCheck.url']).toBeDefined();
  });

  it('rejects secrets in the database account field', async () => {
    const { agent } = await loggedInAgent(app);
    const env = environmentPayload();
    const res = await agent
      .post('/api/websites')
      .send(websitePayload({ environments: [{ ...env, database: { ...env.database, notes: 'service_role_key: eyJhbGciOiJIUzI1NiJ9abc' } }] }));
    expect(res.status).toBe(400);
    expect(res.body.error.fields['environments.0.database.notes']).toBeDefined();
  });

  it('stores localhost URLs as metadata but refuses to monitor private targets', async () => {
    const strictApp = createTestApp(
      testDeps({ prober: createProber(), checkTarget: createTargetCheck(publicAddressesOnly, false) }),
    );
    const { agent } = await loggedInAgent(strictApp);
    const metadataOnly = await agent
      .post('/api/websites')
      .send(websitePayload({ environments: [environmentPayload({ type: 'DEVELOPMENT', websiteUrl: 'http://localhost:3000' })] }));
    expect(metadataOnly.status).toBe(201);

    for (const url of ['http://localhost:4000/health', 'http://127.0.0.1/health', 'http://169.254.169.254/', 'http://[::1]/', 'http://10.0.0.8/']) {
      const res = await agent.post('/api/websites').send(websitePayload({ environments: [environmentPayload({ healthCheck: { enabled: true, url } })] }));
      expect(res.status, url).toBe(400);
      expect(res.body.error.fields['environments.0.healthCheck.url'], url).toBeDefined();
    }
  });
});

describe('authorization', () => {
  it("hides other users' websites and monitors (404)", async () => {
    const { agent: alice } = await loggedInAgent(app, 'alice@example.com');
    await createUser('bob@example.com', 'Bob', 'member');
    const { agent: bob } = await loggedInAgent(app, 'bob@example.com');
    const site = (await alice.post('/api/websites').send(websitePayload())).body.data;
    const monitorId = site.environments[0].healthCheck.id;

    expect((await bob.get(`/api/websites/${site.id}`)).status).toBe(404);
    expect((await bob.put(`/api/websites/${site.id}`).send(websitePayload())).status).toBe(404);
    expect((await bob.delete(`/api/websites/${site.id}`)).status).toBe(404);
    expect((await bob.patch(`/api/monitors/${monitorId}`).send({ enabled: true })).status).toBe(404);
    expect((await bob.post(`/api/monitors/${monitorId}/run`)).status).toBe(404);
    expect((await bob.get('/api/websites')).body.data.total).toBe(0);
    expect((await bob.get(`/api/logs?websiteId=${site.id}`)).body.data.items).toHaveLength(0);
    expect((await alice.get(`/api/websites/${site.id}`)).status).toBe(200);
  });
});

describe('listing, search and filters', () => {
  beforeEach(async () => {
    const { agent } = await loggedInAgent(app);
    await agent.post('/api/websites').send(websitePayload());
    await agent.post('/api/websites').send(
      websitePayload({
        name: 'Portfolio',
        tags: ['Personal'],
        lifecycleStatus: 'MAINTENANCE',
        environments: [
          environmentPayload({
            websiteUrl: 'https://portfolio.dev',
            backendUrl: 'https://portfolio-api.fly.dev',
            frontendHosting: { provider: 'vercel' },
            database: { provider: 'mongodb_atlas', cluster: 'Cluster0', accountProvider: 'github' },
            healthCheck: { enabled: true, url: 'https://portfolio.dev/health' },
          }),
        ],
      }),
    );
    await agent.post('/api/websites').send(
      websitePayload({ name: 'AI Project', tags: ['AI', 'Experimental'], environments: [environmentPayload({ type: 'STAGING' })] }),
    );
  });

  const names = (body: { data: { items: Array<{ name: string }> } }) => body.data.items.map((i) => i.name);

  it.each([
    ['q=portfolio', ['Portfolio']],
    ['q=mongodb%20atlas', ['Portfolio']],
    ['q=vercel', ['Portfolio']],
    ['q=supabase', ['AI Project', 'Expense Tracker']],
    ['q=myproject%40gmail.com', ['AI Project', 'Expense Tracker']],
    ['q=expense-api.onrender', ['AI Project', 'Expense Tracker']],
    ['tags=ai', ['AI Project']],
    ['tags=Personal', ['Expense Tracker', 'Portfolio']],
    ['lifecycle=MAINTENANCE', ['Portfolio']],
    ['environment=STAGING', ['AI Project']],
    ['monitoring=enabled', ['Portfolio']],
    ['monitoring=disabled', ['AI Project', 'Expense Tracker']],
    ['wakeUp=enabled', []],
    ['health=UNKNOWN', ['Portfolio']],
    ['sort=-name', ['Portfolio', 'Expense Tracker', 'AI Project']],
  ])('GET /api/websites?%s', async (qs, expected) => {
    const { agent } = await loggedInAgent(app);
    const res = await agent.get(`/api/websites?${qs}`);
    expect(res.status).toBe(200);
    expect(names(res.body)).toEqual(expected);
  });

  it('paginates', async () => {
    const { agent } = await loggedInAgent(app);
    const res = await agent.get('/api/websites?pageSize=2&page=2');
    expect(res.body.data).toMatchObject({ total: 3, page: 2, pageSize: 2 });
    expect(names(res.body)).toEqual(['Portfolio']);
  });

  it('summarises provider and environment info per row', async () => {
    const { agent } = await loggedInAgent(app);
    const row = (await agent.get('/api/websites?q=portfolio')).body.data.items[0];
    expect(row.primaryEnvironment).toMatchObject({ type: 'PRODUCTION', frontendHostingProvider: 'Vercel', databaseProvider: 'MongoDB Atlas' });
    expect(row.monitoringEnabled).toBe(true);
    expect(row.primaryHealthMonitorId).toMatch(/^[a-f0-9]{24}$/);
  });

  it('lists distinct tags', async () => {
    const { agent } = await loggedInAgent(app);
    expect((await agent.get('/api/websites/tags')).body.data).toEqual(['AI', 'Experimental', 'MERN', 'Personal']);
  });

  it('rejects invalid filters (400)', async () => {
    const { agent } = await loggedInAgent(app);
    expect((await agent.get('/api/websites?health=SIDEWAYS')).status).toBe(400);
    expect((await agent.get('/api/websites?pageSize=1000')).status).toBe(400);
  });
});
