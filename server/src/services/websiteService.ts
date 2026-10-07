import mongoose, { Types, type ClientSession } from 'mongoose';
import {
  LIMITS,
  MONITOR_TYPES,
  environmentDisplayName,
  providerLabel,
  statusSeverity,
  worstStatus,
  type EnvironmentDto,
  type EnvironmentInput,
  type MonitorType,
  type Paginated,
  type WebsiteDto,
  type WebsiteInput,
  type WebsiteListQuery,
  type WebsiteSummaryDto,
} from '@wt/shared';
import {
  Monitor,
  MonitoringLog,
  Notification,
  Website,
  WebsiteCover,
  type EnvironmentSub,
  type MonitorDoc,
  type WebsiteDoc,
} from '../models/index.js';
import { AppError, badRequest, notFound } from '../utils/errors.js';
import { toMonitorDto } from './mappers.js';
import { nextMonitorFields } from './monitorService.js';
import type { TargetCheck } from './probe/targetPolicy.js';

const CONFIG_KEY: Record<MonitorType, 'healthCheck' | 'wakeUp'> = { HEALTH_CHECK: 'healthCheck', WAKE_UP: 'wakeUp' };

const monitorKey = (environmentId: Types.ObjectId | string, type: MonitorType) => `${environmentId.toString()}:${type}`;

type MonitorIndex = Map<string, MonitorDoc>;

function indexMonitors(monitors: MonitorDoc[]): MonitorIndex {
  return new Map(monitors.map((m) => [monitorKey(m.environmentId, m.type), m]));
}

/** Monitor URLs that are syntactically valid but point at private/literal-IP targets. */
function assertMonitorTargets(input: WebsiteInput, checkTarget: TargetCheck) {
  const fields: Record<string, string> = {};
  input.environments.forEach((env, i) => {
    for (const type of MONITOR_TYPES) {
      const url = env[CONFIG_KEY[type]].url;
      const problem = url ? checkTarget(url) : null;
      if (problem) fields[`environments.${i}.${CONFIG_KEY[type]}.url`] = problem;
    }
  });
  if (Object.keys(fields).length > 0) throw badRequest('Some monitor URLs cannot be used', fields);
}

function environmentFields(env: EnvironmentInput, id: Types.ObjectId): EnvironmentSub {
  return {
    _id: id,
    type: env.type,
    label: env.label,
    websiteUrl: env.websiteUrl,
    backendUrl: env.backendUrl,
    branch: env.branch,
    frontendHosting: env.frontendHosting,
    backendHosting: env.backendHosting,
    database: env.database,
  };
}

function websiteFields(input: WebsiteInput) {
  return {
    name: input.name,
    description: input.description,
    lifecycleStatus: input.lifecycleStatus,
    tags: input.tags,
    repository: input.repository,
    notes: input.notes,
  };
}

// ---------------------------------------------------------------------------
// Read models
// ---------------------------------------------------------------------------

function toEnvironmentDto(env: EnvironmentSub, monitors: MonitorIndex): EnvironmentDto {
  const health = monitors.get(monitorKey(env._id, 'HEALTH_CHECK'));
  const wakeUp = monitors.get(monitorKey(env._id, 'WAKE_UP'));
  if (!health || !wakeUp) throw new AppError(500, 'INTERNAL', 'Monitor configuration is missing for an environment');
  return {
    id: env._id.toString(),
    type: env.type,
    label: env.label,
    websiteUrl: env.websiteUrl,
    backendUrl: env.backendUrl,
    branch: env.branch,
    frontendHosting: env.frontendHosting ?? {},
    backendHosting: env.backendHosting ?? {},
    database: env.database ?? {},
    healthCheck: toMonitorDto(health),
    wakeUp: toMonitorDto(wakeUp),
  };
}

function toWebsiteDto(website: WebsiteDoc, monitors: MonitorIndex): WebsiteDto {
  const environments = website.environments.map((env) => toEnvironmentDto(env, monitors));
  return {
    id: website._id.toString(),
    name: website.name,
    description: website.description,
    lifecycleStatus: website.lifecycleStatus,
    tags: website.tags,
    repository: website.repository ?? {},
    notes: website.notes,
    environments,
    healthStatus: worstStatus(environments.map((e) => e.healthCheck.state.status)),
    coverVersion: website.coverUpdatedAt?.toISOString() ?? null,
    createdAt: website.createdAt.toISOString(),
    updatedAt: website.updatedAt.toISOString(),
  };
}

export function primaryEnvironment(website: Pick<WebsiteDoc, 'environments'>): EnvironmentSub | null {
  return website.environments.find((e) => e.type === 'PRODUCTION') ?? website.environments[0] ?? null;
}

export function summarize(website: WebsiteDoc, monitors: MonitorIndex): WebsiteSummaryDto {
  const primary = primaryEnvironment(website);
  const healthMonitors = website.environments
    .map((e) => monitors.get(monitorKey(e._id, 'HEALTH_CHECK')))
    .filter((m): m is MonitorDoc => Boolean(m));
  const wakeMonitors = website.environments
    .map((e) => monitors.get(monitorKey(e._id, 'WAKE_UP')))
    .filter((m): m is MonitorDoc => Boolean(m));

  const primaryHealth = primary ? monitors.get(monitorKey(primary._id, 'HEALTH_CHECK')) : undefined;
  const primaryWake = primary ? monitors.get(monitorKey(primary._id, 'WAKE_UP')) : undefined;
  // Prefer the primary environment's latest result; fall back to the most recent enabled monitor.
  const reference =
    primaryHealth?.enabled && primaryHealth.state.lastRunAt
      ? primaryHealth
      : healthMonitors
          .filter((m) => m.enabled && m.state.lastRunAt)
          .sort((a, b) => b.state.lastRunAt!.getTime() - a.state.lastRunAt!.getTime())[0];

  return {
    id: website._id.toString(),
    name: website.name,
    lifecycleStatus: website.lifecycleStatus,
    tags: website.tags,
    healthStatus: worstStatus(healthMonitors.map((m) => m.state.status)),
    primaryEnvironment: primary
      ? {
          id: primary._id.toString(),
          type: primary.type,
          label: primary.label,
          websiteUrl: primary.websiteUrl,
          frontendHostingProvider:
            providerLabel('hosting', primary.frontendHosting?.provider, primary.frontendHosting?.customProvider) ??
            undefined,
          backendHostingProvider:
            providerLabel('hosting', primary.backendHosting?.provider, primary.backendHosting?.customProvider) ??
            undefined,
          databaseProvider:
            providerLabel('database', primary.database?.provider, primary.database?.customProvider) ?? undefined,
        }
      : null,
    environmentTypes: website.environments.map((e) => e.type),
    monitoringEnabled: healthMonitors.some((m) => m.enabled),
    wakeUpEnabled: wakeMonitors.some((m) => m.enabled),
    lastResponseMs: reference?.state.lastResponseMs ?? null,
    lastCheckedAt: reference?.state.lastRunAt?.toISOString() ?? null,
    primaryHealthMonitorId: primaryHealth?._id.toString() ?? null,
    primaryWakeUpMonitorId: primaryWake?._id.toString() ?? null,
    coverVersion: website.coverUpdatedAt?.toISOString() ?? null,
    updatedAt: website.updatedAt.toISOString(),
  };
}

/** Everything a search box should match: names, URLs, provider names, accounts, tags. */
function searchText(website: WebsiteDoc, monitors: MonitorIndex): string {
  const parts: Array<string | null | undefined> = [
    website.name,
    website.description,
    website.notes,
    ...website.tags,
    website.repository?.url,
    providerLabel('repository', website.repository?.provider, website.repository?.customProvider),
  ];
  for (const env of website.environments) {
    parts.push(
      environmentDisplayName(env),
      env.websiteUrl,
      env.backendUrl,
      env.branch,
      env.frontendHosting?.url,
      env.backendHosting?.url,
      providerLabel('hosting', env.frontendHosting?.provider, env.frontendHosting?.customProvider),
      providerLabel('hosting', env.backendHosting?.provider, env.backendHosting?.customProvider),
      providerLabel('database', env.database?.provider, env.database?.customProvider),
      providerLabel('account', env.database?.accountProvider),
      env.database?.databaseName,
      env.database?.projectName,
      env.database?.cluster,
      env.database?.accountIdentifier,
      env.database?.dashboardUrl,
      monitors.get(monitorKey(env._id, 'HEALTH_CHECK'))?.url,
      monitors.get(monitorKey(env._id, 'WAKE_UP'))?.url,
    );
  }
  return parts.filter(Boolean).join('\n').toLowerCase();
}

/**
 * A personal inventory holds at most a few hundred websites (LIMITS.websitesPerUser),
 * so listing loads the user's websites and monitors once and filters in memory —
 * this keeps provider-label search, derived-status filters and sorting simple.
 */
export async function listWebsites(userId: Types.ObjectId, query: WebsiteListQuery): Promise<Paginated<WebsiteSummaryDto>> {
  const [websites, monitorDocs] = await Promise.all([
    Website.find({ userId }).lean<WebsiteDoc[]>(),
    Monitor.find({ userId }).lean<MonitorDoc[]>(),
  ]);
  const monitors = indexMonitors(monitorDocs);
  const terms = query.q?.toLowerCase().split(/\s+/).filter(Boolean) ?? [];
  const wantedTags = query.tags?.map((t) => t.toLowerCase()) ?? [];

  let rows = websites
    .filter((w) => {
      if (terms.length > 0) {
        const text = searchText(w, monitors);
        if (!terms.every((t) => text.includes(t))) return false;
      }
      if (query.lifecycle && w.lifecycleStatus !== query.lifecycle) return false;
      if (query.environment && !w.environments.some((e) => e.type === query.environment)) return false;
      if (wantedTags.length > 0) {
        const tags = new Set(w.tags.map((t) => t.toLowerCase()));
        if (!wantedTags.every((t) => tags.has(t))) return false;
      }
      return true;
    })
    .map((w) => summarize(w, monitors))
    .filter((s) => {
      if (query.health && s.healthStatus !== query.health) return false;
      if (query.monitoring && s.monitoringEnabled !== (query.monitoring === 'enabled')) return false;
      if (query.wakeUp && s.wakeUpEnabled !== (query.wakeUp === 'enabled')) return false;
      return true;
    });

  const byName = (a: WebsiteSummaryDto, b: WebsiteSummaryDto) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  const comparators: Record<WebsiteListQuery['sort'], (a: WebsiteSummaryDto, b: WebsiteSummaryDto) => number> = {
    name: byName,
    '-name': (a, b) => byName(b, a),
    updatedAt: (a, b) => a.updatedAt.localeCompare(b.updatedAt),
    '-updatedAt': (a, b) => b.updatedAt.localeCompare(a.updatedAt),
    status: (a, b) => statusSeverity(b.healthStatus) - statusSeverity(a.healthStatus) || byName(a, b),
    responseTime: (a, b) =>
      (a.lastResponseMs ?? Number.POSITIVE_INFINITY) - (b.lastResponseMs ?? Number.POSITIVE_INFINITY) || byName(a, b),
  };
  rows = rows.sort(comparators[query.sort]);

  const start = (query.page - 1) * query.pageSize;
  return { items: rows.slice(start, start + query.pageSize), total: rows.length, page: query.page, pageSize: query.pageSize };
}

async function loadWebsite(userId: Types.ObjectId, websiteId: Types.ObjectId, session?: ClientSession) {
  const website = await Website.findOne({ _id: websiteId, userId }, null, { session }).lean<WebsiteDoc>();
  if (!website) throw notFound('Website');
  const monitors = await Monitor.find({ websiteId }, null, { session }).lean<MonitorDoc[]>();
  return { website, monitors: indexMonitors(monitors) };
}

export async function getWebsite(userId: Types.ObjectId, websiteId: Types.ObjectId): Promise<WebsiteDto> {
  const { website, monitors } = await loadWebsite(userId, websiteId);
  return toWebsiteDto(website, monitors);
}

export async function listTags(userId: Types.ObjectId): Promise<string[]> {
  const tags: string[] = await Website.distinct('tags', { userId });
  return tags.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

function buildMonitorDocs(
  userId: Types.ObjectId,
  websiteId: Types.ObjectId,
  environmentId: Types.ObjectId,
  env: EnvironmentInput,
  now: Date,
) {
  return MONITOR_TYPES.map((type) => ({
    userId,
    websiteId,
    environmentId,
    type,
    ...nextMonitorFields(type, env[CONFIG_KEY[type]], null, now),
  }));
}

export async function createWebsite(
  userId: Types.ObjectId,
  input: WebsiteInput,
  checkTarget: TargetCheck,
): Promise<WebsiteDto> {
  assertMonitorTargets(input, checkTarget);
  if ((await Website.countDocuments({ userId })) >= LIMITS.websitesPerUser) {
    throw badRequest(`You can track at most ${LIMITS.websitesPerUser} websites`);
  }
  const websiteId = new Types.ObjectId();
  const now = new Date();
  const environments = input.environments.map((env) => ({ env, id: new Types.ObjectId() }));

  await mongoose.connection.transaction(async (session) => {
    await Website.create(
      [
        {
          _id: websiteId,
          userId,
          ...websiteFields(input),
          environments: environments.map(({ env, id }) => environmentFields(env, id)),
        },
      ],
      { session },
    );
    await Monitor.insertMany(
      environments.flatMap(({ env, id }) => buildMonitorDocs(userId, websiteId, id, env, now)),
      { session },
    );
  });
  return getWebsite(userId, websiteId);
}

export async function updateWebsite(
  userId: Types.ObjectId,
  websiteId: Types.ObjectId,
  input: WebsiteInput,
  checkTarget: TargetCheck,
): Promise<WebsiteDto> {
  assertMonitorTargets(input, checkTarget);
  const now = new Date();
  let removedIds: Types.ObjectId[] = [];

  await mongoose.connection.transaction(async (session) => {
    const { website, monitors } = await loadWebsite(userId, websiteId, session);
    const existingIds = new Set(website.environments.map((e) => e._id.toString()));

    const unknown = input.environments.findIndex((e) => e.id && !existingIds.has(e.id));
    if (unknown >= 0) {
      throw badRequest('Unknown environment', { [`environments.${unknown}.id`]: 'This environment does not exist' });
    }

    const environments = input.environments.map((env) => ({
      env,
      id: env.id ? new Types.ObjectId(env.id) : new Types.ObjectId(),
      isNew: !env.id,
    }));
    const keptIds = new Set(environments.map((e) => e.id.toString()));
    removedIds = website.environments.filter((e) => !keptIds.has(e._id.toString())).map((e) => e._id);

    await Website.updateOne(
      { _id: websiteId, userId },
      {
        $set: {
          ...websiteFields(input),
          environments: environments.map(({ env, id }) => environmentFields(env, id)),
        },
      },
      { session, runValidators: true },
    );

    if (removedIds.length > 0) {
      await Monitor.deleteMany({ websiteId, environmentId: { $in: removedIds } }, { session });
    }

    for (const { env, id, isNew } of environments) {
      if (isNew) {
        await Monitor.insertMany(buildMonitorDocs(userId, websiteId, id, env, now), { session });
        continue;
      }
      for (const type of MONITOR_TYPES) {
        const current = monitors.get(monitorKey(id, type)) ?? null;
        const fields = nextMonitorFields(type, env[CONFIG_KEY[type]], current, now);
        await Monitor.updateOne(
          { websiteId, environmentId: id, type },
          { $set: fields, $setOnInsert: { userId } },
          { session, upsert: true },
        );
      }
    }
  });
  if (removedIds.length > 0) {
    // Potentially large; kept out of the transaction to stay within its size/time limits.
    await MonitoringLog.deleteMany({ websiteId, environmentId: { $in: removedIds } });
  }
  return getWebsite(userId, websiteId);
}

export async function deleteWebsite(userId: Types.ObjectId, websiteId: Types.ObjectId): Promise<void> {
  await mongoose.connection.transaction(async (session) => {
    const result = await Website.deleteOne({ _id: websiteId, userId }, { session });
    if (result.deletedCount === 0) throw notFound('Website');
    await Monitor.deleteMany({ websiteId }, { session });
  });
  // Potentially large; kept out of the transaction to stay within its size/time limits.
  await MonitoringLog.deleteMany({ websiteId });
  await Notification.deleteMany({ websiteId });
  await WebsiteCover.deleteOne({ websiteId });
}
