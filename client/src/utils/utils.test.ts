import { describe, expect, it } from 'vitest';
import { websiteInputSchema } from '@wt/shared';
import { toQueryString } from '../services/api';
import { emptyWebsite, websiteToForm } from '../types/websiteForm';
import { zodValidate } from './forms';
import { createFormatters } from './time';

const defaults = { intervalSeconds: 600, timeoutMs: 30_000, failureThreshold: 3, degradedThresholdMs: 2000 };

describe('zodValidate', () => {
  it('maps schema issues to Mantine dot paths', () => {
    const values = emptyWebsite(defaults);
    values.environments[0]!.healthCheck.enabled = true;
    values.notes = 'password=hunter2hunter2';
    const errors = zodValidate(websiteInputSchema)(values);
    expect(errors.name).toBeDefined();
    expect(errors['environments.0.healthCheck.url']).toMatch(/required/i);
    expect(errors.notes).toMatch(/secret/);
  });

  it('accepts a complete form and strips UI-only keys', () => {
    const values = emptyWebsite(defaults);
    values.name = 'Expense Tracker';
    const parsed = websiteInputSchema.parse(values);
    expect(parsed.environments[0]).not.toHaveProperty('key');
    expect(parsed.environments[0]!.websiteUrl).toBeUndefined();
    expect(parsed.environments[0]!.wakeUp).not.toHaveProperty('degradedThresholdMs');
  });
});

describe('websiteToForm', () => {
  it('round-trips an API website through the form schema', () => {
    const monitor = {
      id: 'm1',
      websiteId: 'w1',
      environmentId: 'e1',
      enabled: true,
      url: 'https://api.example.com/health',
      method: 'GET' as const,
      intervalSeconds: 300,
      timeoutMs: 10_000,
      failureThreshold: 2,
      degradedThresholdMs: 1500,
      expectedStatus: '2xx' as const,
      nextRunAt: null,
      state: {} as never,
    };
    const form = websiteToForm(
      {
        id: 'w1',
        name: 'Site',
        lifecycleStatus: 'ACTIVE',
        tags: ['AI'],
        repository: { provider: 'github', url: 'https://github.com/x/y' },
        environments: [
          {
            id: '0123456789abcdef01234567',
            type: 'PRODUCTION',
            frontendHosting: { provider: 'vercel' },
            backendHosting: {},
            database: { provider: 'neon', accountIdentifier: 'me@example.com' },
            healthCheck: { ...monitor, type: 'HEALTH_CHECK' },
            wakeUp: { ...monitor, type: 'WAKE_UP', enabled: false, degradedThresholdMs: null, expectedStatus: null },
          },
        ],
        healthStatus: 'UP',
        coverVersion: null,
        createdAt: '',
        updatedAt: '',
      },
      defaults,
    );
    const parsed = websiteInputSchema.parse(form);
    expect(parsed.environments[0]).toMatchObject({
      id: '0123456789abcdef01234567',
      database: { provider: 'neon', accountIdentifier: 'me@example.com' },
      healthCheck: { enabled: true, intervalSeconds: 300, degradedThresholdMs: 1500 },
    });
  });
});

describe('createFormatters', () => {
  it('renders UTC timestamps in the chosen zone and format', () => {
    const ist = createFormatters({ timezone: 'Asia/Kolkata', dateFormat: 'DD MMM YYYY', timeFormat: '24h' });
    expect(ist.dateTime('2026-10-04T14:30:00Z')).toBe('04 Oct 2026 20:00:00');
    const ny = createFormatters({ timezone: 'America/New_York', dateFormat: 'MM/DD/YYYY', timeFormat: '12h' });
    expect(ny.dateTime('2026-10-04T14:30:00Z')).toBe('10/04/2026 10:30:00 AM');
    expect(ist.dateTime(null)).toBe('—');
  });
});

describe('toQueryString', () => {
  it('omits empty values and joins arrays', () => {
    expect(toQueryString({ q: '', health: 'UP', tags: ['a', 'b'], page: 2, x: undefined, y: null, z: [] })).toBe('?health=UP&tags=a%2Cb&page=2');
    expect(toQueryString({})).toBe('');
  });
});
