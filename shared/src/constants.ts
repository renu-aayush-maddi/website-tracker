export const ENVIRONMENT_TYPES = ['PRODUCTION', 'STAGING', 'TESTING', 'DEVELOPMENT', 'OTHER'] as const;
export type EnvironmentType = (typeof ENVIRONMENT_TYPES)[number];

export const ENVIRONMENT_LABELS: Record<EnvironmentType, string> = {
  PRODUCTION: 'Production',
  STAGING: 'Staging',
  TESTING: 'Testing',
  DEVELOPMENT: 'Development',
  OTHER: 'Other',
};

/** Lifecycle of the project itself — independent of whether it is currently healthy. */
export const LIFECYCLE_STATUSES = ['ACTIVE', 'IN_DEVELOPMENT', 'MAINTENANCE', 'PAUSED', 'ARCHIVED'] as const;
export type LifecycleStatus = (typeof LIFECYCLE_STATUSES)[number];

export const LIFECYCLE_LABELS: Record<LifecycleStatus, string> = {
  ACTIVE: 'Active',
  IN_DEVELOPMENT: 'In development',
  MAINTENANCE: 'Maintenance',
  PAUSED: 'Paused',
  ARCHIVED: 'Archived',
};

export const MONITOR_TYPES = ['HEALTH_CHECK', 'WAKE_UP'] as const;
export type MonitorType = (typeof MONITOR_TYPES)[number];

export const MONITOR_TYPE_LABELS: Record<MonitorType, string> = {
  HEALTH_CHECK: 'Health check',
  WAKE_UP: 'Wake-up',
};

export const HTTP_METHODS = ['GET', 'HEAD', 'POST'] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

/** Which HTTP status codes count as a successful health check. */
export const EXPECTED_STATUS_OPTIONS = ['2xx', '2xx-3xx'] as const;
export type ExpectedStatus = (typeof EXPECTED_STATUS_OPTIONS)[number];

/**
 * UP        — latest check succeeded within the response-time threshold
 * DEGRADED  — succeeded but slow, or failing but below the failure threshold
 * DOWN      — failed `failureThreshold` times in a row
 * UNKNOWN   — enabled but no check has run yet
 * PAUSED    — monitor disabled
 */
export const HEALTH_STATUSES = ['UP', 'DEGRADED', 'DOWN', 'UNKNOWN', 'PAUSED'] as const;
export type HealthStatus = (typeof HEALTH_STATUSES)[number];

export const DEGRADED_REASONS = ['SLOW', 'FAILING'] as const;
export type DegradedReason = (typeof DEGRADED_REASONS)[number];

export const CHECK_TRIGGERS = ['SCHEDULED', 'MANUAL'] as const;
export type CheckTrigger = (typeof CHECK_TRIGGERS)[number];

export const PROBE_ERROR_CODES = [
  'TIMEOUT',
  'DNS_FAILURE',
  'CONNECTION_REFUSED',
  'CONNECTION_RESET',
  'CONNECTION_FAILED',
  'TLS_ERROR',
  'HTTP_STATUS',
  'TOO_MANY_REDIRECTS',
  'BLOCKED_TARGET',
  'INVALID_URL',
  'UNKNOWN',
] as const;
export type ProbeErrorCode = (typeof PROBE_ERROR_CODES)[number];

export const PROBE_ERROR_LABELS: Record<ProbeErrorCode, string> = {
  TIMEOUT: 'Timed out',
  DNS_FAILURE: 'DNS lookup failed',
  CONNECTION_REFUSED: 'Connection refused',
  CONNECTION_RESET: 'Connection reset',
  CONNECTION_FAILED: 'Connection failed',
  TLS_ERROR: 'TLS/SSL error',
  HTTP_STATUS: 'Unexpected HTTP status',
  TOO_MANY_REDIRECTS: 'Too many redirects',
  BLOCKED_TARGET: 'Blocked target',
  INVALID_URL: 'Invalid URL',
  UNKNOWN: 'Unknown error',
};

export const NOTIFICATION_EVENTS = ['MONITOR_DOWN', 'MONITOR_RECOVERED', 'WAKE_UP_FAILING'] as const;
export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

export const NOTIFICATION_STATUSES = ['PENDING', 'SENDING', 'SENT', 'FAILED'] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

export const LIMITS = {
  intervalSeconds: { min: 60, max: 86_400 },
  timeoutMs: { min: 1_000, max: 60_000 },
  failureThreshold: { min: 1, max: 20 },
  degradedThresholdMs: { min: 100, max: 60_000 },
  environmentsPerWebsite: 10,
  tagsPerWebsite: 20,
  tagLength: 32,
  websitesPerUser: 500,
  passwordMin: 12,
  passwordMax: 128,
  urlLength: 2048,
  logsPageSizeMax: 100,
  statsRangeMaxDays: 400,
} as const;

export const INTERVAL_PRESETS = [
  { seconds: 60, label: 'Every minute' },
  { seconds: 300, label: 'Every 5 minutes' },
  { seconds: 600, label: 'Every 10 minutes' },
  { seconds: 900, label: 'Every 15 minutes' },
  { seconds: 1800, label: 'Every 30 minutes' },
  { seconds: 3600, label: 'Every hour' },
] as const;

/** Log retention in days; 0 means unlimited. */
export const RETENTION_OPTIONS = [7, 30, 90, 365, 0] as const;
export type RetentionDays = (typeof RETENTION_OPTIONS)[number];

export const DATE_FORMATS = ['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY', 'DD MMM YYYY'] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];

export const TIME_FORMATS = ['24h', '12h'] as const;
export type TimeFormat = (typeof TIME_FORMATS)[number];

export const THEMES = ['system', 'light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

export const DEFAULT_SETTINGS = {
  timezone: 'Asia/Kolkata',
  dateFormat: 'DD MMM YYYY' as DateFormat,
  timeFormat: '24h' as TimeFormat,
  theme: 'system' as Theme,
  logRetentionDays: 30 as RetentionDays,
  monitoringDefaults: {
    intervalSeconds: 600,
    timeoutMs: 30_000,
    failureThreshold: 3,
    degradedThresholdMs: 2_000,
  },
  notifications: {
    emailEnabled: false,
    recipient: '',
    onDown: true,
    onRecovery: true,
    onWakeUpFailure: true,
  },
};

/** Approximate stored size of one monitoring log including index overhead. */
export const ESTIMATED_LOG_BYTES = 500;
