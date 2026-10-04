import { ENVIRONMENT_LABELS, ESTIMATED_LOG_BYTES, INTERVAL_PRESETS, type EnvironmentType } from './constants.js';

export function formatInterval(seconds: number): string {
  const preset = INTERVAL_PRESETS.find((p) => p.seconds === seconds);
  if (preset) return preset.label;
  if (seconds % 3600 === 0) return `Every ${seconds / 3600} hours`;
  if (seconds % 60 === 0) return `Every ${seconds / 60} minutes`;
  return `Every ${seconds} seconds`;
}

export function formatResponseTime(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`;
}

export function formatPercent(ratio: number | null | undefined, digits = 2): string {
  if (ratio === null || ratio === undefined || Number.isNaN(ratio)) return '—';
  return `${(ratio * 100).toFixed(digits)}%`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

/** Steady-state storage used by monitoring logs for the given monitors and retention. */
export function estimateLogStorageBytes(intervalsSeconds: readonly number[], retentionDays: number): number | null {
  if (retentionDays === 0) return null;
  const checksPerDay = intervalsSeconds.reduce((sum, interval) => sum + 86_400 / interval, 0);
  return Math.round(checksPerDay * retentionDays * ESTIMATED_LOG_BYTES);
}

/**
 * Render's free plan gives a workspace 750 instance-hours per month and spins a
 * service down after ~15 minutes without traffic. A wake-up monitor hitting a
 * Render service more often than that keeps it running all month (~744 h).
 */
export const RENDER_FREE_HOURS_PER_MONTH = 750;
export const RENDER_IDLE_SPIN_DOWN_SECONDS = 15 * 60;
export const HOURS_PER_MONTH = 744;

export function keepsRenderServiceAwake(intervalSeconds: number): boolean {
  return intervalSeconds < RENDER_IDLE_SPIN_DOWN_SECONDS;
}

export function environmentDisplayName(env: { type: EnvironmentType; label?: string | null | undefined }): string {
  return env.label?.trim() || ENVIRONMENT_LABELS[env.type];
}
