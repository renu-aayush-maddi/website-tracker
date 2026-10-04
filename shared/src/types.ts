import type {
  CheckTrigger,
  DateFormat,
  DegradedReason,
  EnvironmentType,
  ExpectedStatus,
  HealthStatus,
  HttpMethod,
  LifecycleStatus,
  MonitorType,
  NotificationEvent,
  NotificationStatus,
  ProbeErrorCode,
  RetentionDays,
  Theme,
  TimeFormat,
} from './constants.js';

/** All dates travel as ISO-8601 UTC strings. */
export type IsoDate = string;

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string>;
  };
}

export interface UserSettings {
  timezone: string;
  dateFormat: DateFormat;
  timeFormat: TimeFormat;
  theme: Theme;
  logRetentionDays: RetentionDays;
  monitoringDefaults: {
    intervalSeconds: number;
    timeoutMs: number;
    failureThreshold: number;
    degradedThresholdMs: number;
  };
  notifications: {
    emailEnabled: boolean;
    recipient?: string;
    onDown: boolean;
    onRecovery: boolean;
    onWakeUpFailure: boolean;
  };
}

export interface UserDto {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'member';
  createdAt: IsoDate;
}

export interface SettingsResponse {
  settings: UserSettings;
  server: {
    emailDeliveryConfigured: boolean;
    emailProvider: 'resend' | 'smtp' | 'none';
  };
  storage: {
    logCount: number;
    enabledMonitorIntervals: number[];
  };
}

export interface SetupStatus {
  needsSetup: boolean;
  setupEnabled: boolean;
  registrationOpen: boolean;
}

export interface HostingDto {
  provider?: string;
  customProvider?: string;
  url?: string;
  region?: string;
}

export interface DatabaseDto {
  provider?: string;
  customProvider?: string;
  databaseName?: string;
  projectName?: string;
  cluster?: string;
  region?: string;
  accountProvider?: string;
  accountIdentifier?: string;
  dashboardUrl?: string;
  notes?: string;
}

export interface MonitorState {
  status: HealthStatus;
  degradedReason: DegradedReason | null;
  consecutiveFailures: number;
  lastRunAt: IsoDate | null;
  lastSuccessAt: IsoDate | null;
  lastFailureAt: IsoDate | null;
  lastStatusCode: number | null;
  lastResponseMs: number | null;
  lastErrorCode: ProbeErrorCode | null;
  lastErrorMessage: string | null;
  statusChangedAt: IsoDate | null;
}

export interface MonitorDto {
  id: string;
  websiteId: string;
  environmentId: string;
  type: MonitorType;
  enabled: boolean;
  url: string | null;
  method: HttpMethod;
  intervalSeconds: number;
  timeoutMs: number;
  failureThreshold: number;
  degradedThresholdMs: number | null;
  expectedStatus: ExpectedStatus | null;
  state: MonitorState;
  nextRunAt: IsoDate | null;
}

export interface EnvironmentDto {
  id: string;
  type: EnvironmentType;
  label?: string;
  websiteUrl?: string;
  backendUrl?: string;
  branch?: string;
  frontendHosting: HostingDto;
  backendHosting: HostingDto;
  database: DatabaseDto;
  healthCheck: MonitorDto;
  wakeUp: MonitorDto;
}

export interface WebsiteDto {
  id: string;
  name: string;
  description?: string;
  lifecycleStatus: LifecycleStatus;
  tags: string[];
  repository: {
    provider?: string;
    customProvider?: string;
    url?: string;
    defaultBranch?: string;
  };
  notes?: string;
  environments: EnvironmentDto[];
  /** Worst health status across environments with monitoring enabled. */
  healthStatus: HealthStatus;
  createdAt: IsoDate;
  updatedAt: IsoDate;
}

export interface WebsiteSummaryDto {
  id: string;
  name: string;
  lifecycleStatus: LifecycleStatus;
  tags: string[];
  healthStatus: HealthStatus;
  primaryEnvironment: {
    id: string;
    type: EnvironmentType;
    label?: string;
    websiteUrl?: string;
    frontendHostingProvider?: string;
    backendHostingProvider?: string;
    databaseProvider?: string;
  } | null;
  environmentTypes: EnvironmentType[];
  monitoringEnabled: boolean;
  wakeUpEnabled: boolean;
  lastResponseMs: number | null;
  lastCheckedAt: IsoDate | null;
  /** Health monitor of the primary environment, for quick toggles. */
  primaryHealthMonitorId: string | null;
  primaryWakeUpMonitorId: string | null;
  updatedAt: IsoDate;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface LogDto {
  id: string;
  websiteId: string;
  websiteName: string | null;
  environmentLabel: string | null;
  monitorId: string;
  type: MonitorType;
  trigger: CheckTrigger;
  url: string;
  method: HttpMethod;
  startedAt: IsoDate;
  responseMs: number | null;
  statusCode: number | null;
  success: boolean;
  errorCode: ProbeErrorCode | null;
  errorMessage: string | null;
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface StatsSummary {
  total: number;
  successes: number;
  failures: number;
  /** successes / total, null when there were no checks. */
  successRate: number | null;
  avgResponseMs: number | null;
  minResponseMs: number | null;
  maxResponseMs: number | null;
  p95ResponseMs: number | null;
  from: IsoDate;
  to: IsoDate;
}

export interface TimeseriesPoint {
  bucket: IsoDate;
  total: number;
  successes: number;
  successRate: number | null;
  avgResponseMs: number | null;
  maxResponseMs: number | null;
}

export interface TimeseriesResponse {
  bucketUnit: 'minute' | 'hour' | 'day' | 'week';
  bucketSize: number;
  points: TimeseriesPoint[];
}

export interface RunResultDto {
  log: LogDto;
  monitor: MonitorDto;
}

export interface DashboardDto {
  counts: {
    websites: number;
    up: number;
    degraded: number;
    down: number;
    unknown: number;
    paused: number;
    monitoringEnabled: number;
    wakeUpEnabled: number;
  };
  last24h: {
    successRate: number | null;
    avgResponseMs: number | null;
    checks: number;
  };
  websites: Array<{
    id: string;
    name: string;
    environmentLabel: string | null;
    status: HealthStatus;
    degradedReason: DegradedReason | null;
    lastResponseMs: number | null;
    lastCheckedAt: IsoDate | null;
  }>;
  recentActivity: LogDto[];
  scheduler: {
    lastTickAt: IsoDate | null;
    lastTickSource: string | null;
    stale: boolean;
  };
  warnings: {
    /** Wake-up monitors that keep a Render free service running continuously. */
    renderAlwaysOnWakeUps: number;
  };
}

export interface NotificationDto {
  id: string;
  websiteId: string | null;
  event: NotificationEvent;
  status: NotificationStatus;
  recipient: string;
  subject: string;
  attempts: number;
  lastError: string | null;
  createdAt: IsoDate;
  sentAt: IsoDate | null;
}
