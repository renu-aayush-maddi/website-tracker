import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { COVER_IMAGE } from '@wt/shared';
import { Website, WebsiteCover } from '../src/models/index.js';
import { sniffImageType } from '../src/services/coverService.js';
import { clearDb, closeTestDb, connectTestDb, createTestApp, createUser, loggedInAgent, websitePayload } from './helpers.js';

const app = createTestApp();

const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1)]);
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100, 2)]);
const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x10, 0, 0, 0]), Buffer.from('WEBP'), Buffer.alloc(50, 3)]);

beforeAll(connectTestDb);
afterAll(closeTestDb);
beforeEach(clearDb);

async function setup(email?: string) {
  const ctx = await loggedInAgent(app, email);
  const site = (await ctx.agent.post('/api/websites').send(websitePayload())).body.data;
  return { ...ctx, site };
}

const upload = (agent: Awaited<ReturnType<typeof setup>>['agent'], id: string, body: Buffer, type = 'image/jpeg') =>
  agent.put(`/api/websites/${id}/cover`).set('Content-Type', type).send(body);

describe('sniffImageType', () => {
  it('identifies formats from their bytes', () => {
    expect(sniffImageType(jpeg)).toBe('image/jpeg');
    expect(sniffImageType(png)).toBe('image/png');
    expect(sniffImageType(webp)).toBe('image/webp');
  });
  it.each([['empty', Buffer.alloc(0)], ['html', Buffer.from('<html><script>alert(1)</script>')], ['svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')], ['gif', Buffer.from('GIF89a....')]])(
    'rejects %s',
    (_name, data) => {
      expect(sniffImageType(data)).toBeNull();
    },
  );
});

describe('PUT /api/websites/:id/cover', () => {
  it.each([
    ['image/jpeg', jpeg],
    ['image/png', png],
    ['image/webp', webp],
  ])('stores a %s image and exposes a cache-busting version', async (type, data) => {
    const { agent, site } = await setup();
    expect(site.coverVersion).toBeNull();
    const res = await upload(agent, site.id, data, type);
    expect(res.status).toBe(200);
    expect(res.body.data.coverVersion).toMatch(/^\d{4}-/);

    const detail = (await agent.get(`/api/websites/${site.id}`)).body.data;
    const summary = (await agent.get('/api/websites')).body.data.items[0];
    expect(detail.coverVersion).toBe(res.body.data.coverVersion);
    expect(summary.coverVersion).toBe(res.body.data.coverVersion);
  });

  it('does not change the website updatedAt, and survives later website edits', async () => {
    const { agent, site } = await setup();
    const before = (await agent.get(`/api/websites/${site.id}`)).body.data;
    const { body } = await upload(agent, site.id, jpeg);
    const after = (await agent.get(`/api/websites/${site.id}`)).body.data;
    expect(after.updatedAt).toBe(before.updatedAt);

    const env = { ...websitePayload().environments[0], id: site.environments[0].id };
    await agent.put(`/api/websites/${site.id}`).send(websitePayload({ name: 'Renamed', environments: [env] }));
    expect((await agent.get(`/api/websites/${site.id}`)).body.data.coverVersion).toBe(body.data.coverVersion);
  });

  it('replaces an existing image', async () => {
    const { agent, site } = await setup();
    await upload(agent, site.id, jpeg);
    await upload(agent, site.id, png, 'image/png');
    expect(await WebsiteCover.countDocuments()).toBe(1);
    const res = await agent.get(`/api/websites/${site.id}/cover`);
    expect(res.headers['content-type']).toBe('image/png');
  });

  it('rejects content that is not an image even if labelled as one (400)', async () => {
    const { agent, site } = await setup();
    const res = await upload(agent, site.id, Buffer.from('<html><script>alert(1)</script></html>'));
    expect(res.status).toBe(400);
    expect(await WebsiteCover.countDocuments()).toBe(0);
  });

  it('rejects SVG and other content types (415)', async () => {
    const { agent, site } = await setup();
    expect((await upload(agent, site.id, Buffer.from('<svg/>'), 'image/svg+xml')).status).toBe(415);
    expect((await upload(agent, site.id, jpeg, 'text/plain')).status).toBe(415);
    expect((await agent.put(`/api/websites/${site.id}/cover`).send({ not: 'an image' })).status).toBe(415);
  });

  it('rejects images over the size limit (413)', async () => {
    const { agent, site } = await setup();
    const big = Buffer.concat([jpeg, Buffer.alloc(COVER_IMAGE.maxBytes, 7)]);
    const res = await upload(agent, site.id, big);
    expect(res.status).toBe(413);
    expect(await WebsiteCover.countDocuments()).toBe(0);
  });

  it('requires authentication (401) and a same-origin request (403)', async () => {
    const { agent, site } = await setup();
    const anon = await request(app).put(`/api/websites/${site.id}/cover`).set('Origin', 'http://localhost:5173').set('Content-Type', 'image/jpeg').send(jpeg);
    expect(anon.status).toBe(401);
    const crossSite = await agent.put(`/api/websites/${site.id}/cover`).set('Origin', 'https://evil.example').set('Content-Type', 'image/jpeg').send(jpeg);
    expect(crossSite.status).toBe(403);
  });

  it('returns 404 for unknown ids and for other users’ websites', async () => {
    const { agent, site } = await setup('alice@example.com');
    await createUser('bob@example.com', 'Bob', 'member');
    const { agent: bob } = await loggedInAgent(app, 'bob@example.com');
    expect((await upload(agent, '000000000000000000000000', jpeg)).status).toBe(404);
    expect((await upload(agent, 'nope', jpeg)).status).toBe(404);
    expect((await upload(bob, site.id, jpeg)).status).toBe(404);
    await upload(agent, site.id, jpeg);
    expect((await bob.get(`/api/websites/${site.id}/cover`)).status).toBe(404);
    expect((await bob.delete(`/api/websites/${site.id}/cover`)).status).toBe(404);
    expect(await WebsiteCover.countDocuments()).toBe(1);
  });
});

describe('GET /api/websites/:id/cover', () => {
  it('serves the bytes with safe, cacheable headers', async () => {
    const { agent, site } = await setup();
    await upload(agent, site.id, jpeg);
    const res = await agent.get(`/api/websites/${site.id}/cover`).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/jpeg');
    expect(res.headers['cache-control']).toContain('immutable');
    expect(res.headers['cache-control']).toContain('private');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.compare(res.body as Buffer, jpeg)).toBe(0);
  });

  it('is 404 when there is no image, and 401 when signed out', async () => {
    const { agent, site } = await setup();
    expect((await agent.get(`/api/websites/${site.id}/cover`)).status).toBe(404);
    expect((await request(app).get(`/api/websites/${site.id}/cover`)).status).toBe(401);
  });
});

describe('DELETE /api/websites/:id/cover', () => {
  it('removes the image and clears the version (204)', async () => {
    const { agent, site } = await setup();
    await upload(agent, site.id, jpeg);
    expect((await agent.delete(`/api/websites/${site.id}/cover`)).status).toBe(204);
    expect(await WebsiteCover.countDocuments()).toBe(0);
    expect((await agent.get(`/api/websites/${site.id}`)).body.data.coverVersion).toBeNull();
    // Idempotent.
    expect((await agent.delete(`/api/websites/${site.id}/cover`)).status).toBe(204);
  });

  it('is removed together with the website', async () => {
    const { agent, site } = await setup();
    await upload(agent, site.id, jpeg);
    expect((await agent.delete(`/api/websites/${site.id}`)).status).toBe(204);
    expect(await WebsiteCover.countDocuments()).toBe(0);
    expect(await Website.countDocuments()).toBe(0);
  });
});
