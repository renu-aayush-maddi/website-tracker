import { describe, expect, it } from 'vitest';
import { healthCheckConfigSchema, optionalUrl, monitorUrl, websiteInputSchema } from './schemas.js';

const monitor = {
  enabled: true,
  url: 'https://api.example.com/health',
  method: 'GET',
  intervalSeconds: 600,
  timeoutMs: 30_000,
  failureThreshold: 3,
};

const environment = {
  type: 'PRODUCTION',
  frontendHosting: {},
  backendHosting: {},
  database: {},
  healthCheck: { ...monitor, degradedThresholdMs: 2000, expectedStatus: '2xx' },
  wakeUp: { ...monitor, enabled: false, url: '' },
};

const website = {
  name: 'Expense Tracker',
  lifecycleStatus: 'ACTIVE',
  tags: ['MERN', 'mern', 'Render'],
  repository: {},
  environments: [environment],
};

describe('URL schemas', () => {
  it('accepts http(s) URLs and treats empty as unset', () => {
    expect(optionalUrl.parse('https://example.com')).toBe('https://example.com');
    expect(optionalUrl.parse('')).toBeUndefined();
    expect(optionalUrl.parse('http://localhost:3000')).toBe('http://localhost:3000');
  });
  it.each(['javascript:alert(1)', 'ftp://example.com', 'not a url', 'https://user:pass@example.com'])(
    'rejects %s',
    (value) => {
      expect(optionalUrl.safeParse(value).success).toBe(false);
    },
  );
  it.each(['http://localhost:4000/health', 'http://db.internal/', 'http://printer.local', 'http://intranet/'])(
    'refuses to monitor %s',
    (value) => {
      expect(monitorUrl.safeParse(value).success).toBe(false);
    },
  );
});

describe('healthCheckConfigSchema', () => {
  it('requires a URL when enabled', () => {
    const result = healthCheckConfigSchema.safeParse({ ...environment.healthCheck, url: '' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['url']);
  });
  it('allows a missing URL when disabled', () => {
    expect(healthCheckConfigSchema.safeParse({ ...environment.healthCheck, enabled: false, url: '' }).success).toBe(true);
  });
  it('enforces interval bounds', () => {
    expect(healthCheckConfigSchema.safeParse({ ...environment.healthCheck, intervalSeconds: 30 }).success).toBe(false);
  });
});

describe('websiteInputSchema', () => {
  it('parses a valid website and de-duplicates tags case-insensitively', () => {
    const parsed = websiteInputSchema.parse(website);
    expect(parsed.tags).toEqual(['MERN', 'Render']);
  });
  it('rejects secrets in notes', () => {
    const result = websiteInputSchema.safeParse({ ...website, notes: 'db: postgres://u:pw123456@host/db' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['notes']);
  });
  it('requires at least one environment', () => {
    expect(websiteInputSchema.safeParse({ ...website, environments: [] }).success).toBe(false);
  });
});
