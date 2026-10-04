import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProber } from '../src/services/probe/httpProbe.js';
import { assertSafeTarget, publicAddressesOnly } from '../src/services/probe/ssrf.js';
import { startTargetServer, type TargetServer } from './targetServer.js';

describe('publicAddressesOnly', () => {
  it.each([
    '127.0.0.1',
    '127.8.9.10',
    '10.0.0.1',
    '172.16.5.4',
    '172.31.255.255',
    '192.168.0.10',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '255.255.255.255',
    '192.0.2.1',
    '::1',
    '::',
    'fe80::1',
    'fc00::1',
    'fd00:ec2::254',
    '::ffff:127.0.0.1',
    '::ffff:169.254.169.254',
    '64:ff9b::a00:1',
    '2002:a00:1::',
    'not-an-ip',
  ])('blocks %s', (address) => {
    expect(publicAddressesOnly(address)).toBe(false);
  });

  it.each(['8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:4700:4700::1111'])('allows %s', (address) => {
    expect(publicAddressesOnly(address)).toBe(true);
  });
});

describe('assertSafeTarget', () => {
  it.each([
    'http://127.0.0.1/',
    'http://2130706433/',
    'http://0x7f.0.0.1/',
    'http://017700000001/',
    'http://[::1]:8080/',
    'http://[::ffff:7f00:1]/',
    'http://169.254.169.254/latest/meta-data/',
    'http://localhost/',
    'http://api.localhost/',
    'http://metadata.google.internal/computeMetadata/v1/',
    'http://service.internal/',
    'http://router/',
  ])('blocks %s before any network activity', (url) => {
    expect(() => assertSafeTarget(url, publicAddressesOnly, false)).toThrow();
  });

  it('allows public hostnames (DNS is checked at connect time)', () => {
    expect(assertSafeTarget('https://example.com/health', publicAddressesOnly, false).hostname).toBe('example.com');
  });
});

describe('connect-time DNS checks', () => {
  let target: TargetServer;
  beforeAll(async () => {
    target = await startTargetServer();
  });
  afterAll(async () => {
    await target.close();
  });

  it('blocks hostnames that resolve to private addresses (DNS rebinding)', async () => {
    const prober = createProber({ resolve: async () => [{ address: '10.0.0.5', family: 4 }] });
    const result = await prober.probe({ url: 'https://rebind.example.com/', method: 'GET', timeoutMs: 2000 });
    expect(result.errorCode).toBe('BLOCKED_TARGET');
  });

  it('blocks when any resolved address is private', async () => {
    const prober = createProber({
      resolve: async () => [
        { address: '93.184.216.34', family: 4 },
        { address: '127.0.0.1', family: 4 },
      ],
    });
    const result = await prober.probe({ url: 'https://mixed.example.com/', method: 'GET', timeoutMs: 2000 });
    expect(result.errorCode).toBe('BLOCKED_TARGET');
  });

  it('blocks the real localhost via the default resolver and never reaches the server', async () => {
    const prober = createProber();
    const before = target.hits();
    const literal = await prober.probe({ url: `${target.url}/status/200`, method: 'GET', timeoutMs: 2000 });
    expect(literal.errorCode).toBe('BLOCKED_TARGET');
    expect(target.hits()).toBe(before);
  });

  it('re-checks every redirect hop', async () => {
    // Policy allows only the test server's loopback address; the redirect points at the metadata endpoint.
    const prober = createProber({ addressPolicy: (ip) => ip === '127.0.0.1', allowLocalHostnames: true });
    const result = await prober.probe({
      url: `${target.url}/redirect-to?url=${encodeURIComponent('http://169.254.169.254/latest/meta-data/')}`,
      method: 'GET',
      timeoutMs: 2000,
    });
    expect(result.errorCode).toBe('BLOCKED_TARGET');
  });
});
