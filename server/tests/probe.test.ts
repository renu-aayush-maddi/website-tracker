import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { classifyError, createProber } from '../src/services/probe/httpProbe.js';
import { anyValidAddress } from '../src/services/probe/ssrf.js';
import { closedPort, startTargetServer, type TargetServer } from './targetServer.js';

let target: TargetServer;
const prober = createProber({ addressPolicy: anyValidAddress, allowLocalHostnames: true });
const probe = (path: string, timeoutMs = 3000, method: 'GET' | 'HEAD' | 'POST' = 'GET') =>
  prober.probe({ url: `${target.url}${path}`, method, timeoutMs });

beforeAll(async () => {
  target = await startTargetServer();
});
afterAll(async () => {
  await target.close();
});

describe('HTTP probe — responses', () => {
  it.each([200, 201, 204, 400, 401, 403, 404, 429, 500, 503])('reports HTTP %i with a response time', async (code) => {
    const result = await probe(`/status/${code}`);
    expect(result.statusCode).toBe(code);
    expect(result.errorCode).toBeNull();
    expect(result.responseMs).toBeGreaterThanOrEqual(0);
    expect(result.completedAt.getTime()).toBeGreaterThanOrEqual(result.startedAt.getTime());
  });

  it.each([301, 302, 303, 307, 308])('follows a %i redirect', async (code) => {
    const result = await probe(`/redirect/${code}`);
    expect(result.statusCode).toBe(200);
    expect(result.redirects).toBe(1);
    expect(result.finalUrl).toBe(`${target.url}/status/200`);
  });

  it('stops redirect loops', async () => {
    const result = await probe('/loop');
    expect(result.errorCode).toBe('TOO_MANY_REDIRECTS');
    expect(result.redirects).toBe(5);
  });

  it('supports HEAD and POST', async () => {
    expect((await probe('/status/200', 3000, 'HEAD')).statusCode).toBe(200);
    expect((await probe('/status/201', 3000, 'POST')).statusCode).toBe(201);
  });

  it('measures slow responses', async () => {
    const result = await probe('/slow/300');
    expect(result.statusCode).toBe(200);
    expect(result.responseMs).toBeGreaterThanOrEqual(250);
  });
});

describe('HTTP probe — failures', () => {
  it('times out', async () => {
    const result = await probe('/hang', 500);
    expect(result.errorCode).toBe('TIMEOUT');
    expect(result.statusCode).toBeNull();
    expect(result.responseMs).toBeNull();
  });

  it('reports connection refused', async () => {
    const port = await closedPort();
    const result = await prober.probe({ url: `http://127.0.0.1:${port}/`, method: 'GET', timeoutMs: 3000 });
    expect(result.errorCode).toBe('CONNECTION_REFUSED');
  });

  it('reports a reset connection', async () => {
    expect((await probe('/reset')).errorCode).toBe('CONNECTION_RESET');
  });

  it('reports DNS failures', async () => {
    const failingDns = createProber({
      addressPolicy: anyValidAddress,
      resolve: async (hostname) => {
        throw Object.assign(new Error(`getaddrinfo ENOTFOUND ${hostname}`), { code: 'ENOTFOUND' });
      },
    });
    const result = await failingDns.probe({ url: 'https://does-not-exist.example.com/', method: 'GET', timeoutMs: 3000 });
    expect(result.errorCode).toBe('DNS_FAILURE');
  });

  it('reports TLS failures', async () => {
    // Speaking TLS to a plain-HTTP port fails the handshake.
    const result = await prober.probe({ url: `https://127.0.0.1:${target.port}/`, method: 'GET', timeoutMs: 3000 });
    expect(result.errorCode).toBe('TLS_ERROR');
  });

  it.each(['not a url', 'ftp://example.com/file', 'https://user:pw@example.com/'])('rejects invalid URL %s', async (url) => {
    const result = await prober.probe({ url, method: 'GET', timeoutMs: 1000 });
    expect(result.errorCode).toBe('INVALID_URL');
  });

  it('classifies unknown errors without throwing', () => {
    expect(classifyError(new Error('weird'))).toEqual({ code: 'UNKNOWN', message: 'weird' });
    expect(classifyError('not an error').code).toBe('UNKNOWN');
  });
});
