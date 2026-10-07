import { describe, expect, it } from 'vitest';
import type { WebsiteDto } from '@wt/shared';
import { fitWithin } from './image';
import { applyQuickEdit, buildQuickCreateInput, cardAriaLabel, displayHost, initialOf, normalizeUrl, placeholderGradient } from './launchpad';

const defaults = { intervalSeconds: 600, timeoutMs: 30_000, failureThreshold: 3, degradedThresholdMs: 2000 };

describe('normalizeUrl', () => {
  it.each([
    ['github.com', 'https://github.com'],
    ['  github.com/me  ', 'https://github.com/me'],
    ['www.example.com', 'https://www.example.com'],
    ['localhost:3000', 'https://localhost:3000'],
    ['//cdn.example.com/x', 'https://cdn.example.com/x'],
    ['http://example.com', 'http://example.com'],
    ['HTTPS://Example.com', 'HTTPS://Example.com'],
    ['', ''],
    ['   ', ''],
  ])('%j → %j', (input, expected) => {
    expect(normalizeUrl(input)).toBe(expected);
  });

  it.each(['javascript:alert(1)', 'data:text/html,hi', 'ftp://example.com', 'mailto:me@example.com'])(
    'leaves %s untouched so validation can reject it',
    (input) => {
      expect(normalizeUrl(input)).toBe(input);
    },
  );
});

describe('displayHost', () => {
  it('shows the bare hostname', () => {
    expect(displayHost('https://www.github.com/me/repo?x=1')).toBe('github.com');
    expect(displayHost('http://localhost:3000')).toBe('localhost');
  });
  it('returns null for missing or unsafe URLs', () => {
    expect(displayHost(null)).toBeNull();
    expect(displayHost('javascript:alert(1)')).toBeNull();
    expect(displayHost('https://user:pw@example.com')).toBeNull();
  });
});

describe('placeholders', () => {
  it('is stable per name, differs between names, and stays dark enough for white text', () => {
    expect(placeholderGradient('GitHub')).toBe(placeholderGradient('  github '));
    expect(placeholderGradient('GitHub')).not.toBe(placeholderGradient('YouTube'));
    for (const name of ['a', 'GitHub', 'Expense Tracker', '日本語']) {
      for (const [, lightness] of placeholderGradient(name).matchAll(/hsl\(\d+ \d+% (\d+)%\)/g)) {
        expect(Number(lightness)).toBeLessThanOrEqual(36);
      }
    }
  });
  it('uses the first character as the initial', () => {
    expect(initialOf('  github')).toBe('G');
    expect(initialOf('😀 fun')).toBe('😀');
    expect(initialOf('')).toBe('?');
  });
});

describe('cardAriaLabel', () => {
  it('describes where the card goes, or that a URL is missing', () => {
    expect(cardAriaLabel('GitHub', 'https://github.com')).toBe('Open GitHub (github.com) in a new tab');
    expect(cardAriaLabel('Notes', null)).toBe('Notes has no URL yet. Add one');
  });
});

describe('fitWithin', () => {
  it.each([
    [4000, 3000, 1280, { width: 1280, height: 960 }],
    [3000, 4000, 1280, { width: 960, height: 1280 }],
    [800, 600, 1280, { width: 800, height: 600 }],
    [1, 5000, 1280, { width: 1, height: 1280 }],
  ])('%ix%i → fits %i', (w, h, max, expected) => {
    expect(fitWithin(w, h, max)).toEqual(expected);
  });
});

describe('buildQuickCreateInput', () => {
  it('creates a single Production environment with monitoring off', () => {
    const input = buildQuickCreateInput({ name: 'GitHub', url: 'https://github.com' }, defaults);
    expect(input).toMatchObject({ name: 'GitHub', lifecycleStatus: 'ACTIVE', tags: [] });
    expect(input.environments).toHaveLength(1);
    expect(input.environments[0]).toMatchObject({
      type: 'PRODUCTION',
      websiteUrl: 'https://github.com',
      healthCheck: { enabled: false, intervalSeconds: 600 },
      wakeUp: { enabled: false },
    });
  });

  it.each([
    ['an empty name', { name: '', url: 'https://github.com' }],
    ['a javascript: URL', { name: 'x', url: 'javascript:alert(1)' }],
    ['a URL with credentials', { name: 'x', url: 'https://u:p@github.com' }],
  ])('rejects %s', (_label, values) => {
    expect(() => buildQuickCreateInput(values, defaults)).toThrow();
  });
});

describe('applyQuickEdit', () => {
  const monitor = (type: 'HEALTH_CHECK' | 'WAKE_UP', enabled: boolean) => ({
    id: `m-${type}`,
    websiteId: 'w1',
    environmentId: 'e',
    type,
    enabled,
    url: enabled ? 'https://api.example.com/health' : null,
    method: 'GET' as const,
    intervalSeconds: 300,
    timeoutMs: 10_000,
    failureThreshold: 2,
    degradedThresholdMs: type === 'HEALTH_CHECK' ? 1500 : null,
    expectedStatus: type === 'HEALTH_CHECK' ? ('2xx' as const) : null,
    nextRunAt: null,
    state: {} as never,
  });
  const env = (id: string, type: 'PRODUCTION' | 'STAGING', url: string) => ({
    id,
    type,
    websiteUrl: url,
    frontendHosting: { provider: 'vercel' },
    backendHosting: { provider: 'render', region: 'Singapore' },
    database: { provider: 'supabase', accountIdentifier: 'me@example.com' },
    healthCheck: monitor('HEALTH_CHECK', true),
    wakeUp: monitor('WAKE_UP', false),
  });
  const site: WebsiteDto = {
    id: 'w1',
    name: 'Old name',
    description: 'keep me',
    lifecycleStatus: 'MAINTENANCE',
    tags: ['AI', 'MERN'],
    repository: { provider: 'github', url: 'https://github.com/me/x' },
    environments: [env('0123456789abcdef01234567', 'STAGING', 'https://staging.example.com'), env('76543210fedcba9876543210', 'PRODUCTION', 'https://old.example.com')],
    healthStatus: 'UP',
    coverVersion: null,
    createdAt: '',
    updatedAt: '',
  };

  it('changes only the name and the chosen environment’s URL, preserving everything else', () => {
    const input = applyQuickEdit(site, '76543210fedcba9876543210', { name: 'New name', url: 'https://new.example.com' }, defaults);
    expect(input).toMatchObject({ name: 'New name', description: 'keep me', lifecycleStatus: 'MAINTENANCE', tags: ['AI', 'MERN'] });
    expect(input.repository).toMatchObject({ provider: 'github', url: 'https://github.com/me/x' });
    const [staging, production] = input.environments;
    expect(staging).toMatchObject({ id: '0123456789abcdef01234567', websiteUrl: 'https://staging.example.com' });
    expect(production).toMatchObject({
      id: '76543210fedcba9876543210',
      websiteUrl: 'https://new.example.com',
      frontendHosting: { provider: 'vercel' },
      backendHosting: { provider: 'render', region: 'Singapore' },
      database: { provider: 'supabase', accountIdentifier: 'me@example.com' },
      healthCheck: { enabled: true, url: 'https://api.example.com/health', intervalSeconds: 300, failureThreshold: 2, degradedThresholdMs: 1500 },
      wakeUp: { enabled: false },
    });
  });

  it('can clear the URL of a website that has none', () => {
    const input = applyQuickEdit(site, null, { name: 'Renamed', url: '' }, defaults);
    expect(input.environments[0]!.websiteUrl).toBeUndefined();
  });
});
