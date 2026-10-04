import { z } from 'zod';
import {
  DATE_FORMATS,
  ENVIRONMENT_TYPES,
  EXPECTED_STATUS_OPTIONS,
  HEALTH_STATUSES,
  HTTP_METHODS,
  LIFECYCLE_STATUSES,
  LIMITS,
  MONITOR_TYPES,
  RETENTION_OPTIONS,
  THEMES,
  TIME_FORMATS,
} from './constants.js';
import {
  ACCOUNT_PROVIDER_VALUES,
  DATABASE_PROVIDER_VALUES,
  HOSTING_PROVIDER_VALUES,
  REPOSITORY_PROVIDER_VALUES,
} from './providers.js';
import { findSecretLikeContent, secretRejectionMessage } from './secrets.js';
import { isBlockedHostname, parseHttpUrl } from './url.js';

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

const emptyToUndefined = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const nullToUndefined = (value: unknown): unknown => (value === null ? undefined : emptyToUndefined(value));

export const objectIdSchema = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id');

/** Optional single-line text; empty strings are treated as "not set". */
export const optionalText = (max: number) =>
  z.preprocess(nullToUndefined, z.string().trim().max(max, `Must be at most ${max} characters`).optional());

/** Optional free text that must not contain anything that looks like a secret. */
export const freeText = (max: number) =>
  optionalText(max).superRefine((value, ctx) => {
    const found = findSecretLikeContent(value);
    if (found) ctx.addIssue({ code: 'custom', message: secretRejectionMessage(found) });
  });

function checkHttpUrl(value: string, ctx: z.RefinementCtx): URL | null {
  let raw: URL;
  try {
    raw = new URL(value);
  } catch {
    ctx.addIssue({ code: 'custom', message: 'Enter a full URL, e.g. https://example.com' });
    return null;
  }
  if (raw.username || raw.password) {
    ctx.addIssue({ code: 'custom', message: 'Do not put usernames or passwords in URLs' });
    return null;
  }
  const url = parseHttpUrl(value);
  if (!url) ctx.addIssue({ code: 'custom', message: 'Only http:// and https:// URLs are allowed' });
  return url;
}

/** Any http(s) URL — used for metadata such as dashboards or localhost dev URLs. */
export const optionalUrl = z.preprocess(
  nullToUndefined,
  z
    .string()
    .trim()
    .max(LIMITS.urlLength)
    .superRefine((value, ctx) => {
      checkHttpUrl(value, ctx);
    })
    .optional(),
);

/** A URL the server will send requests to: public hosts only. */
export const monitorUrl = z.preprocess(
  nullToUndefined,
  z
    .string()
    .trim()
    .max(LIMITS.urlLength)
    .superRefine((value, ctx) => {
      const url = checkHttpUrl(value, ctx);
      if (url && isBlockedHostname(url.hostname)) {
        ctx.addIssue({ code: 'custom', message: 'Local and internal hostnames cannot be monitored' });
      }
    })
    .optional(),
);

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email('Enter a valid email address'));

export const passwordSchema = z
  .string()
  .min(LIMITS.passwordMin, `Use at least ${LIMITS.passwordMin} characters`)
  .max(LIMITS.passwordMax, `Use at most ${LIMITS.passwordMax} characters`);

const nameSchema = z.string().trim().min(1, 'Required').max(100, 'Must be at most 100 characters');

const providerEnum = <T extends [string, ...string[]]>(values: T) =>
  z.preprocess(nullToUndefined, z.enum(values).optional());

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Auth & account
// ---------------------------------------------------------------------------

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Required').max(LIMITS.passwordMax),
});

export const registerSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
});

export const setupSchema = registerSchema.extend({
  setupToken: z.string().min(1, 'Required').max(256),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Required').max(LIMITS.passwordMax),
    newPassword: passwordSchema,
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    path: ['newPassword'],
    message: 'New password must be different from the current one',
  });

export const accountUpdateSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  /** Required only when the email address changes. */
  currentPassword: z.string().max(LIMITS.passwordMax).optional(),
});

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

const intervalSchema = z
  .number()
  .int()
  .min(LIMITS.intervalSeconds.min, 'Minimum interval is 1 minute')
  .max(LIMITS.intervalSeconds.max, 'Maximum interval is 24 hours');
const timeoutSchema = z
  .number()
  .int()
  .min(LIMITS.timeoutMs.min, 'Minimum timeout is 1 second')
  .max(LIMITS.timeoutMs.max, 'Maximum timeout is 60 seconds');
const failureThresholdSchema = z
  .number()
  .int()
  .min(LIMITS.failureThreshold.min)
  .max(LIMITS.failureThreshold.max);
const degradedThresholdSchema = z
  .number()
  .int()
  .min(LIMITS.degradedThresholdMs.min)
  .max(LIMITS.degradedThresholdMs.max);

export const monitoringDefaultsSchema = z.object({
  intervalSeconds: intervalSchema,
  timeoutMs: timeoutSchema,
  failureThreshold: failureThresholdSchema,
  degradedThresholdMs: degradedThresholdSchema,
});

export const notificationPreferencesSchema = z.object({
  emailEnabled: z.boolean(),
  /** Leave empty to use the account email. */
  recipient: z.preprocess(nullToUndefined, emailSchema.optional()),
  onDown: z.boolean(),
  onRecovery: z.boolean(),
  onWakeUpFailure: z.boolean(),
});

export const settingsSchema = z.object({
  timezone: z.string().min(1).max(64).refine(isValidTimeZone, 'Unknown time zone'),
  dateFormat: z.enum(DATE_FORMATS),
  timeFormat: z.enum(TIME_FORMATS),
  theme: z.enum(THEMES),
  logRetentionDays: z.literal(RETENTION_OPTIONS),
  monitoringDefaults: monitoringDefaultsSchema,
  notifications: notificationPreferencesSchema,
});

// ---------------------------------------------------------------------------
// Websites
// ---------------------------------------------------------------------------

const monitorBaseShape = {
  enabled: z.boolean(),
  url: monitorUrl,
  method: z.enum(HTTP_METHODS),
  intervalSeconds: intervalSchema,
  timeoutMs: timeoutSchema,
  failureThreshold: failureThresholdSchema,
};

function requireUrlWhenEnabled(value: { enabled: boolean; url?: string | undefined }, ctx: z.RefinementCtx) {
  if (value.enabled && !value.url) {
    ctx.addIssue({ code: 'custom', path: ['url'], message: 'A URL is required when this is enabled' });
  }
}

export const healthCheckConfigSchema = z
  .object({
    ...monitorBaseShape,
    degradedThresholdMs: degradedThresholdSchema,
    expectedStatus: z.enum(EXPECTED_STATUS_OPTIONS),
  })
  .superRefine(requireUrlWhenEnabled);

export const wakeUpConfigSchema = z.object(monitorBaseShape).superRefine(requireUrlWhenEnabled);

const hostingSchema = z.object({
  provider: providerEnum(HOSTING_PROVIDER_VALUES),
  customProvider: optionalText(60),
  url: optionalUrl,
  region: optionalText(60),
});

const databaseSchema = z.object({
  provider: providerEnum(DATABASE_PROVIDER_VALUES),
  customProvider: optionalText(60),
  databaseName: optionalText(120),
  projectName: optionalText(120),
  cluster: optionalText(120),
  region: optionalText(60),
  accountProvider: providerEnum(ACCOUNT_PROVIDER_VALUES),
  accountIdentifier: freeText(254),
  dashboardUrl: optionalUrl,
  notes: freeText(2000),
});

export const environmentInputSchema = z.object({
  /** Present when updating an existing environment; omitted for new ones. */
  id: z.preprocess(nullToUndefined, objectIdSchema.optional()),
  type: z.enum(ENVIRONMENT_TYPES),
  label: optionalText(60),
  websiteUrl: optionalUrl,
  backendUrl: optionalUrl,
  branch: optionalText(100),
  frontendHosting: hostingSchema,
  backendHosting: hostingSchema,
  database: databaseSchema,
  healthCheck: healthCheckConfigSchema,
  wakeUp: wakeUpConfigSchema,
});

const tagSchema = z
  .string()
  .trim()
  .min(1)
  .max(LIMITS.tagLength, `Tags must be at most ${LIMITS.tagLength} characters`);

export const websiteInputSchema = z.object({
  name: nameSchema,
  description: freeText(1000),
  lifecycleStatus: z.enum(LIFECYCLE_STATUSES),
  tags: z
    .array(tagSchema)
    .max(LIMITS.tagsPerWebsite, `At most ${LIMITS.tagsPerWebsite} tags`)
    .transform((tags) => {
      const seen = new Set<string>();
      return tags.filter((t) => {
        const key = t.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }),
  repository: z.object({
    provider: providerEnum(REPOSITORY_PROVIDER_VALUES),
    customProvider: optionalText(60),
    url: optionalUrl,
    defaultBranch: optionalText(100),
  }),
  notes: freeText(5000),
  environments: z
    .array(environmentInputSchema)
    .min(1, 'Add at least one environment')
    .max(LIMITS.environmentsPerWebsite, `At most ${LIMITS.environmentsPerWebsite} environments`),
});

export const monitorPatchSchema = z.object({
  enabled: z.boolean(),
});

// ---------------------------------------------------------------------------
// Query strings
// ---------------------------------------------------------------------------

const csv = z
  .string()
  .max(1000)
  .transform((v) =>
    v
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );

const toggleFilter = z.enum(['enabled', 'disabled']);

export const WEBSITE_SORTS = ['name', '-name', '-updatedAt', 'updatedAt', 'status', 'responseTime'] as const;

export const websiteListQuerySchema = z.object({
  q: optionalText(200),
  lifecycle: z.preprocess(emptyToUndefined, z.enum(LIFECYCLE_STATUSES).optional()),
  environment: z.preprocess(emptyToUndefined, z.enum(ENVIRONMENT_TYPES).optional()),
  health: z.preprocess(emptyToUndefined, z.enum(HEALTH_STATUSES).optional()),
  tags: z.preprocess(emptyToUndefined, csv.optional()),
  monitoring: z.preprocess(emptyToUndefined, toggleFilter.optional()),
  wakeUp: z.preprocess(emptyToUndefined, toggleFilter.optional()),
  sort: z.preprocess(emptyToUndefined, z.enum(WEBSITE_SORTS).default('name')),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

const dateParam = z.preprocess(emptyToUndefined, z.coerce.date().optional());

export const logsQuerySchema = z.object({
  websiteId: z.preprocess(emptyToUndefined, objectIdSchema.optional()),
  monitorId: z.preprocess(emptyToUndefined, objectIdSchema.optional()),
  type: z.preprocess(emptyToUndefined, z.enum(MONITOR_TYPES).optional()),
  result: z.preprocess(emptyToUndefined, z.enum(['success', 'failure']).optional()),
  from: dateParam,
  to: dateParam,
  cursor: z.preprocess(emptyToUndefined, z.string().max(200).optional()),
  limit: z.coerce.number().int().min(1).max(LIMITS.logsPageSizeMax).default(25),
});

export const statsQuerySchema = z.object({
  websiteId: z.preprocess(emptyToUndefined, objectIdSchema.optional()),
  monitorId: z.preprocess(emptyToUndefined, objectIdSchema.optional()),
  type: z.preprocess(emptyToUndefined, z.enum(MONITOR_TYPES).default('HEALTH_CHECK')),
  result: z.preprocess(emptyToUndefined, z.enum(['success', 'failure']).optional()),
  from: dateParam,
  to: dateParam,
});

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type SetupInput = z.infer<typeof setupSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type AccountUpdateInput = z.infer<typeof accountUpdateSchema>;
export type SettingsInput = z.infer<typeof settingsSchema>;
export type HealthCheckConfigInput = z.infer<typeof healthCheckConfigSchema>;
export type WakeUpConfigInput = z.infer<typeof wakeUpConfigSchema>;
export type EnvironmentInput = z.infer<typeof environmentInputSchema>;
export type WebsiteInput = z.infer<typeof websiteInputSchema>;
export type WebsiteListQuery = z.infer<typeof websiteListQuerySchema>;
export type WebsiteSort = (typeof WEBSITE_SORTS)[number];
export type LogsQuery = z.infer<typeof logsQuerySchema>;
export type StatsQuery = z.infer<typeof statsQuerySchema>;
