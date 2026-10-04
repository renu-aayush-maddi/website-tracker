import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Session, User } from '../src/models/index.js';
import { PASSWORD, browser, clearDb, closeTestDb, connectTestDb, createTestApp, createUser, loggedInAgent, ORIGIN } from './helpers.js';

const app = createTestApp();

beforeAll(connectTestDb);
afterAll(closeTestDb);
beforeEach(clearDb);

describe('initial setup', () => {
  it('reports that setup is needed on an empty database', async () => {
    const res = await request(app).get('/api/auth/setup-status');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ needsSetup: true, setupEnabled: true, registrationOpen: false });
  });

  it('rejects a wrong setup token with 403', async () => {
    const res = await browser(app)
      .post('/api/auth/setup')
      .send({ setupToken: 'wrong-token-000000', name: 'Admin', email: 'admin@example.com', password: PASSWORD });
    expect(res.status).toBe(403);
    expect(await User.countDocuments()).toBe(0);
  });

  it('creates the first admin (201), signs them in and then refuses a second setup (409)', async () => {
    const agent = browser(app);
    const res = await agent
      .post('/api/auth/setup')
      .send({ setupToken: 'test-setup-token-123456', name: 'Admin', email: 'Admin@Example.com', password: PASSWORD });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ email: 'admin@example.com', role: 'admin' });
    expect(res.body.data.passwordHash).toBeUndefined();
    expect((await agent.get('/api/auth/me')).status).toBe(200);

    const again = await browser(app)
      .post('/api/auth/setup')
      .send({ setupToken: 'test-setup-token-123456', name: 'X', email: 'x@example.com', password: PASSWORD });
    expect(again.status).toBe(409);
  });

  it('validates setup input (400) with field errors', async () => {
    const res = await browser(app).post('/api/auth/setup').send({ setupToken: 'x', name: '', email: 'nope', password: 'short' });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error.fields)).toEqual(expect.arrayContaining(['name', 'email', 'password']));
  });

  it('keeps registration closed (403) unless enabled', async () => {
    const res = await browser(app).post('/api/auth/register').send({ name: 'A', email: 'a@example.com', password: PASSWORD });
    expect(res.status).toBe(403);
  });
});

describe('login / session', () => {
  it('stores only an Argon2id hash', async () => {
    await createUser();
    const user = await User.findOne({ email: 'owner@example.com' }).select('+passwordHash').lean();
    expect(user?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user?.passwordHash).not.toContain(PASSWORD);
  });

  it('logs in with an httpOnly SameSite=Strict cookie and stores only a token hash', async () => {
    await createUser();
    const res = await browser(app).post('/api/auth/login').send({ email: 'owner@example.com', password: PASSWORD });
    expect(res.status).toBe(200);
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/wt_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    const token = /wt_session=([^;]+)/.exec(cookie)![1]!;
    const session = await Session.findOne().lean();
    expect(session?.tokenHash).not.toBe(token);
    expect(session?.tokenHash).toHaveLength(64);
  });

  it('rejects bad credentials with a generic 401', async () => {
    await createUser();
    const wrongPassword = await browser(app).post('/api/auth/login').send({ email: 'owner@example.com', password: 'nope-nope-nope' });
    const unknownUser = await browser(app).post('/api/auth/login').send({ email: 'ghost@example.com', password: 'nope-nope-nope' });
    expect(wrongPassword.status).toBe(401);
    expect(unknownUser.status).toBe(401);
    expect(wrongPassword.body.error.message).toBe(unknownUser.body.error.message);
  });

  it('requires authentication (401) for protected routes', async () => {
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    expect((await request(app).get('/api/websites')).status).toBe(401);
    expect((await request(app).get('/api/dashboard')).status).toBe(401);
    const forged = await request(app).get('/api/websites').set('Cookie', 'wt_session=forged-token');
    expect(forged.status).toBe(401);
  });

  it('logout revokes the session server-side', async () => {
    const { agent } = await loggedInAgent(app);
    expect((await agent.post('/api/auth/logout')).status).toBe(204);
    expect((await agent.get('/api/auth/me')).status).toBe(401);
    expect(await Session.countDocuments()).toBe(0);
  });

  it('rate-limits repeated failed logins (429)', async () => {
    const limitedApp = createTestApp();
    await createUser();
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      const res = await browser(limitedApp).post('/api/auth/login').send({ email: 'owner@example.com', password: 'wrong-password!' });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  });

  it('locks the account after repeated failures', async () => {
    await createUser();
    await User.updateOne({ email: 'owner@example.com' }, { failedLoginAttempts: 9 });
    await browser(createTestApp()).post('/api/auth/login').send({ email: 'owner@example.com', password: 'wrong-password!' });
    const res = await browser(createTestApp()).post('/api/auth/login').send({ email: 'owner@example.com', password: PASSWORD });
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('ACCOUNT_LOCKED');
  });
});

describe('CSRF origin check', () => {
  it('rejects state-changing requests without an allowed Origin (403)', async () => {
    await createUser();
    const noOrigin = await request(app).post('/api/auth/login').send({ email: 'owner@example.com', password: PASSWORD });
    expect(noOrigin.status).toBe(403);
    const evil = await request(app)
      .post('/api/auth/login')
      .set('Origin', 'https://evil.example')
      .send({ email: 'owner@example.com', password: PASSWORD });
    expect(evil.status).toBe(403);
  });

  it('allows the configured frontend origin with credentials via CORS', async () => {
    const res = await request(app).options('/api/websites').set('Origin', ORIGIN).set('Access-Control-Request-Method', 'POST');
    expect(res.headers['access-control-allow-origin']).toBe(ORIGIN);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    const other = await request(app).options('/api/websites').set('Origin', 'https://evil.example');
    expect(other.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('account management', () => {
  it('changes the password, revoking other sessions but keeping the caller signed in', async () => {
    const { agent } = await loggedInAgent(app);
    const other = (await loggedInAgent(app)).agent;
    const res = await agent.put('/api/auth/password').send({ currentPassword: PASSWORD, newPassword: 'a-brand-new-password' });
    expect(res.status).toBe(204);
    expect((await agent.get('/api/auth/me')).status).toBe(200);
    expect((await other.get('/api/auth/me')).status).toBe(401);
    const login = await browser(app).post('/api/auth/login').send({ email: 'owner@example.com', password: 'a-brand-new-password' });
    expect(login.status).toBe(200);
  });

  it('rejects a wrong current password (400)', async () => {
    const { agent } = await loggedInAgent(app);
    const res = await agent.put('/api/auth/password').send({ currentPassword: 'wrong-wrong-wrong', newPassword: 'a-brand-new-password' });
    expect(res.status).toBe(400);
    expect(res.body.error.fields.currentPassword).toBeDefined();
  });

  it('requires the current password to change email', async () => {
    const { agent } = await loggedInAgent(app);
    const missing = await agent.patch('/api/account').send({ name: 'New Name', email: 'new@example.com' });
    expect(missing.status).toBe(400);
    const ok = await agent.patch('/api/account').send({ name: 'New Name', email: 'new@example.com', currentPassword: PASSWORD });
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ name: 'New Name', email: 'new@example.com' });
  });

  it('rejects oversized and malformed bodies', async () => {
    const big = await browser(app).post('/api/auth/login').set('content-type', 'application/json').send(`{"email":"${'a'.repeat(200_000)}"}`);
    expect(big.status).toBe(413);
    const bad = await browser(app).post('/api/auth/login').set('content-type', 'application/json').send('{bad json');
    expect(bad.status).toBe(400);
  });

  it('ignores operator injection attempts', async () => {
    await createUser();
    const res = await browser(app).post('/api/auth/login').send({ email: { $ne: null }, password: { $ne: null } });
    expect(res.status).toBe(400);
  });
});
