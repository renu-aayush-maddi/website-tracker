import {
  ENVIRONMENT_TYPES,
  type EnvironmentDto,
  type EnvironmentType,
  type ExpectedStatus,
  type HttpMethod,
  type LifecycleStatus,
  type MonitorDto,
  type UserSettings,
  type WebsiteDto,
} from '@wt/shared';

/** Form state mirrors WebsiteInput but uses '' for empty text so inputs stay controlled. */
export interface MonitorFormValues {
  enabled: boolean;
  url: string;
  method: HttpMethod;
  intervalSeconds: number;
  timeoutMs: number;
  failureThreshold: number;
  degradedThresholdMs: number;
  expectedStatus: ExpectedStatus;
}

export interface HostingFormValues {
  provider: string;
  customProvider: string;
  url: string;
  region: string;
}

export interface DatabaseFormValues {
  provider: string;
  customProvider: string;
  databaseName: string;
  projectName: string;
  cluster: string;
  region: string;
  accountProvider: string;
  accountIdentifier: string;
  dashboardUrl: string;
  notes: string;
}

export interface EnvironmentFormValues {
  /** Local key for React lists; stripped by the schema before submitting. */
  key: string;
  id?: string;
  type: EnvironmentType;
  label: string;
  websiteUrl: string;
  backendUrl: string;
  branch: string;
  frontendHosting: HostingFormValues;
  backendHosting: HostingFormValues;
  database: DatabaseFormValues;
  healthCheck: MonitorFormValues;
  wakeUp: MonitorFormValues;
}

export interface WebsiteFormValues {
  name: string;
  description: string;
  lifecycleStatus: LifecycleStatus;
  tags: string[];
  repository: { provider: string; customProvider: string; url: string; defaultBranch: string };
  notes: string;
  environments: EnvironmentFormValues[];
}

type Defaults = UserSettings['monitoringDefaults'];

const newKey = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));

function monitorDefaults(defaults: Defaults): MonitorFormValues {
  return {
    enabled: false,
    url: '',
    method: 'GET',
    intervalSeconds: defaults.intervalSeconds,
    timeoutMs: defaults.timeoutMs,
    failureThreshold: defaults.failureThreshold,
    degradedThresholdMs: defaults.degradedThresholdMs,
    expectedStatus: '2xx',
  };
}

const emptyHosting = (): HostingFormValues => ({ provider: '', customProvider: '', url: '', region: '' });

export function emptyEnvironment(defaults: Defaults, type: EnvironmentType = 'PRODUCTION'): EnvironmentFormValues {
  return {
    key: newKey(),
    type,
    label: '',
    websiteUrl: '',
    backendUrl: '',
    branch: '',
    frontendHosting: emptyHosting(),
    backendHosting: emptyHosting(),
    database: {
      provider: '',
      customProvider: '',
      databaseName: '',
      projectName: '',
      cluster: '',
      region: '',
      accountProvider: '',
      accountIdentifier: '',
      dashboardUrl: '',
      notes: '',
    },
    healthCheck: monitorDefaults(defaults),
    wakeUp: monitorDefaults(defaults),
  };
}

export function nextEnvironmentType(used: EnvironmentType[]): EnvironmentType {
  return ENVIRONMENT_TYPES.find((t) => t !== 'OTHER' && !used.includes(t)) ?? 'OTHER';
}

export function emptyWebsite(defaults: Defaults): WebsiteFormValues {
  return {
    name: '',
    description: '',
    lifecycleStatus: 'ACTIVE',
    tags: [],
    repository: { provider: '', customProvider: '', url: '', defaultBranch: '' },
    notes: '',
    environments: [emptyEnvironment(defaults)],
  };
}

const text = (v: string | undefined | null) => v ?? '';

function monitorFromDto(m: MonitorDto, defaults: Defaults): MonitorFormValues {
  return {
    enabled: m.enabled,
    url: text(m.url),
    method: m.method,
    intervalSeconds: m.intervalSeconds,
    timeoutMs: m.timeoutMs,
    failureThreshold: m.failureThreshold,
    degradedThresholdMs: m.degradedThresholdMs ?? defaults.degradedThresholdMs,
    expectedStatus: m.expectedStatus ?? '2xx',
  };
}

function environmentFromDto(env: EnvironmentDto, defaults: Defaults): EnvironmentFormValues {
  const hosting = (h: EnvironmentDto['frontendHosting']): HostingFormValues => ({
    provider: text(h.provider),
    customProvider: text(h.customProvider),
    url: text(h.url),
    region: text(h.region),
  });
  const db = env.database;
  return {
    key: env.id,
    id: env.id,
    type: env.type,
    label: text(env.label),
    websiteUrl: text(env.websiteUrl),
    backendUrl: text(env.backendUrl),
    branch: text(env.branch),
    frontendHosting: hosting(env.frontendHosting),
    backendHosting: hosting(env.backendHosting),
    database: {
      provider: text(db.provider),
      customProvider: text(db.customProvider),
      databaseName: text(db.databaseName),
      projectName: text(db.projectName),
      cluster: text(db.cluster),
      region: text(db.region),
      accountProvider: text(db.accountProvider),
      accountIdentifier: text(db.accountIdentifier),
      dashboardUrl: text(db.dashboardUrl),
      notes: text(db.notes),
    },
    healthCheck: monitorFromDto(env.healthCheck, defaults),
    wakeUp: monitorFromDto(env.wakeUp, defaults),
  };
}

export function websiteToForm(site: WebsiteDto, defaults: Defaults): WebsiteFormValues {
  return {
    name: site.name,
    description: text(site.description),
    lifecycleStatus: site.lifecycleStatus,
    tags: site.tags,
    repository: {
      provider: text(site.repository.provider),
      customProvider: text(site.repository.customProvider),
      url: text(site.repository.url),
      defaultBranch: text(site.repository.defaultBranch),
    },
    notes: text(site.notes),
    environments: site.environments.map((e) => environmentFromDto(e, defaults)),
  };
}
