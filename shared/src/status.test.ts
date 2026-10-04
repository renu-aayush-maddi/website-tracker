import { describe, expect, it } from 'vitest';
import { computeStatus, isSuccessfulStatusCode, worstStatus } from './status.js';

const base = {
  enabled: true,
  lastSuccess: true,
  lastResponseMs: 300,
  consecutiveFailures: 0,
  failureThreshold: 3,
  degradedThresholdMs: 2000,
};

describe('computeStatus', () => {
  it('is PAUSED when disabled', () => {
    expect(computeStatus({ ...base, enabled: false }).status).toBe('PAUSED');
  });
  it('is UNKNOWN before the first check', () => {
    expect(computeStatus({ ...base, lastSuccess: null }).status).toBe('UNKNOWN');
  });
  it('is UP when the latest check succeeded quickly', () => {
    expect(computeStatus(base)).toEqual({ status: 'UP', degradedReason: null });
  });
  it('is DEGRADED (SLOW) above the response-time threshold', () => {
    expect(computeStatus({ ...base, lastResponseMs: 2500 })).toEqual({ status: 'DEGRADED', degradedReason: 'SLOW' });
  });
  it('is DEGRADED (FAILING) below the failure threshold', () => {
    expect(computeStatus({ ...base, lastSuccess: false, consecutiveFailures: 2 })).toEqual({
      status: 'DEGRADED',
      degradedReason: 'FAILING',
    });
  });
  it('is DOWN at the failure threshold', () => {
    expect(computeStatus({ ...base, lastSuccess: false, consecutiveFailures: 3 }).status).toBe('DOWN');
  });
  it('ignores slowness when no degraded threshold applies', () => {
    expect(computeStatus({ ...base, lastResponseMs: 50_000, degradedThresholdMs: null }).status).toBe('UP');
  });
});

describe('isSuccessfulStatusCode', () => {
  it('health checks accept 2xx by default', () => {
    expect(isSuccessfulStatusCode('HEALTH_CHECK', 200, '2xx')).toBe(true);
    expect(isSuccessfulStatusCode('HEALTH_CHECK', 204, '2xx')).toBe(true);
    expect(isSuccessfulStatusCode('HEALTH_CHECK', 302, '2xx')).toBe(false);
    expect(isSuccessfulStatusCode('HEALTH_CHECK', 302, '2xx-3xx')).toBe(true);
    expect(isSuccessfulStatusCode('HEALTH_CHECK', 404, '2xx-3xx')).toBe(false);
  });
  it('wake-ups succeed on any non-5xx response', () => {
    expect(isSuccessfulStatusCode('WAKE_UP', 404, '2xx')).toBe(true);
    expect(isSuccessfulStatusCode('WAKE_UP', 503, '2xx')).toBe(false);
  });
});

describe('worstStatus', () => {
  it('orders DOWN > DEGRADED > UP > UNKNOWN > PAUSED', () => {
    expect(worstStatus(['UP', 'DOWN', 'DEGRADED'])).toBe('DOWN');
    expect(worstStatus(['UP', 'UNKNOWN'])).toBe('UP');
    expect(worstStatus(['PAUSED', 'UNKNOWN'])).toBe('UNKNOWN');
    expect(worstStatus([])).toBe('PAUSED');
  });
});
