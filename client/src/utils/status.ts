import type { DegradedReason, HealthStatus, MonitorType } from '@wt/shared';

/**
 * Reserved status colours (never reused for data series). Every status is shown
 * with an icon and a text label, so colour is never the only signal.
 */
export const STATUS_COLORS = {
  good: '#0ca30c',
  warning: '#fab219',
  critical: '#d03b3b',
  neutral: '#8a8984',
} as const;

export interface StatusMeta {
  label: string;
  color: string;
  icon: 'up' | 'degraded' | 'down' | 'unknown' | 'paused';
  description: string;
}

const HEALTH: Record<HealthStatus, StatusMeta> = {
  UP: { label: 'Healthy', color: STATUS_COLORS.good, icon: 'up', description: 'Latest check succeeded' },
  DEGRADED: { label: 'Degraded', color: STATUS_COLORS.warning, icon: 'degraded', description: 'Slow or failing' },
  DOWN: { label: 'Down', color: STATUS_COLORS.critical, icon: 'down', description: 'Failed repeatedly' },
  UNKNOWN: { label: 'Unknown', color: STATUS_COLORS.neutral, icon: 'unknown', description: 'No check has run yet' },
  PAUSED: { label: 'Monitoring off', color: STATUS_COLORS.neutral, icon: 'paused', description: 'Monitoring disabled' },
};

/** Wake-ups report delivery, not health, so they use different words. */
const WAKE_UP: Record<HealthStatus, StatusMeta> = {
  UP: { label: 'Delivered', color: STATUS_COLORS.good, icon: 'up', description: 'Latest wake-up got a response' },
  DEGRADED: { label: 'Failing', color: STATUS_COLORS.warning, icon: 'degraded', description: 'Recent wake-ups failed' },
  DOWN: { label: 'Failing', color: STATUS_COLORS.critical, icon: 'down', description: 'Wake-ups keep failing' },
  UNKNOWN: { label: 'Pending', color: STATUS_COLORS.neutral, icon: 'unknown', description: 'No wake-up sent yet' },
  PAUSED: { label: 'Wake-up off', color: STATUS_COLORS.neutral, icon: 'paused', description: 'Wake-up disabled' },
};

export function statusMeta(status: HealthStatus, type: MonitorType = 'HEALTH_CHECK'): StatusMeta {
  return (type === 'WAKE_UP' ? WAKE_UP : HEALTH)[status];
}

export function degradedReasonText(reason: DegradedReason | null, consecutiveFailures: number, threshold: number): string | null {
  if (reason === 'SLOW') return 'Responding slower than the threshold';
  if (reason === 'FAILING') return `Failing (${consecutiveFailures} of ${threshold} before down)`;
  return null;
}

export function degradedReasonShort(reason: DegradedReason | null): string | null {
  if (reason === 'SLOW') return 'Responding slowly';
  if (reason === 'FAILING') return 'Recent checks failing';
  return null;
}
