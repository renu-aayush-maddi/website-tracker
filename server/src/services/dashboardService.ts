import type { Types } from 'mongoose';
import {
  environmentDisplayName,
  isRenderHostname,
  keepsRenderServiceAwake,
  statusSeverity,
  type DashboardDto,
} from '@wt/shared';
import { Monitor, MonitoringLog, Website, type MonitorDoc, type MonitoringLogDoc, type WebsiteDoc } from '../models/index.js';
import { iso } from '../utils/ids.js';
import { withWebsiteNames } from './logService.js';
import { getSchedulerStatus } from './schedulerService.js';
import { primaryEnvironment, summarize } from './websiteService.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export async function getDashboard(userId: Types.ObjectId): Promise<DashboardDto> {
  const since = new Date(Date.now() - DAY_MS);
  const [websites, monitors, last24hRows, recentLogs, scheduler] = await Promise.all([
    Website.find({ userId }).lean<WebsiteDoc[]>(),
    Monitor.find({ userId }).lean<MonitorDoc[]>(),
    MonitoringLog.aggregate<{ total: number; successes: number; avg: number | null }>([
      { $match: { userId, type: 'HEALTH_CHECK', startedAt: { $gte: since } } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          successes: { $sum: { $cond: ['$success', 1, 0] } },
          avg: { $avg: '$responseMs' },
        },
      },
    ]),
    MonitoringLog.find({ userId }).sort({ startedAt: -1, _id: -1 }).limit(10).lean<MonitoringLogDoc[]>(),
    getSchedulerStatus(),
  ]);

  const index = new Map(monitors.map((m) => [`${m.environmentId.toString()}:${m.type}`, m]));
  const counts: DashboardDto['counts'] = {
    websites: websites.length,
    up: 0,
    degraded: 0,
    down: 0,
    unknown: 0,
    paused: 0,
    monitoringEnabled: 0,
    wakeUpEnabled: 0,
  };
  const statusKey = { UP: 'up', DEGRADED: 'degraded', DOWN: 'down', UNKNOWN: 'unknown', PAUSED: 'paused' } as const;

  const rows: DashboardDto['websites'] = websites.map((website) => {
    const summary = summarize(website, index);
    counts[statusKey[summary.healthStatus]] += 1;
    if (summary.monitoringEnabled) counts.monitoringEnabled += 1;
    if (summary.wakeUpEnabled) counts.wakeUpEnabled += 1;

    // The environment responsible for the website's overall status (primary wins ties).
    const primary = primaryEnvironment(website);
    const ordered = primary ? [primary, ...website.environments.filter((e) => !e._id.equals(primary._id))] : [];
    let worstEnv = ordered[0];
    let worst = worstEnv ? index.get(`${worstEnv._id.toString()}:HEALTH_CHECK`) : undefined;
    for (const env of ordered) {
      const m = index.get(`${env._id.toString()}:HEALTH_CHECK`);
      if (m && (!worst || statusSeverity(m.state.status) > statusSeverity(worst.state.status))) {
        worst = m;
        worstEnv = env;
      }
    }
    return {
      id: summary.id,
      name: summary.name,
      environmentLabel: worstEnv ? environmentDisplayName(worstEnv) : null,
      status: summary.healthStatus,
      degradedReason: worst?.state.degradedReason ?? null,
      lastResponseMs: worst?.enabled ? worst.state.lastResponseMs : summary.lastResponseMs,
      lastCheckedAt: worst?.enabled ? iso(worst.state.lastRunAt) : summary.lastCheckedAt,
    };
  });
  rows.sort((a, b) => statusSeverity(b.status) - statusSeverity(a.status) || a.name.localeCompare(b.name));

  const agg = last24hRows[0];
  return {
    counts,
    last24h: {
      checks: agg?.total ?? 0,
      successRate: agg && agg.total > 0 ? agg.successes / agg.total : null,
      avgResponseMs: agg?.avg == null ? null : Math.round(agg.avg),
    },
    websites: rows,
    recentActivity: await withWebsiteNames(userId, recentLogs),
    scheduler: {
      lastTickAt: iso(scheduler.lastTickAt),
      lastTickSource: scheduler.lastTickSource,
      // Only worth flagging when something is actually scheduled.
      stale: scheduler.stale && monitors.some((m) => m.enabled),
    },
    warnings: {
      renderAlwaysOnWakeUps: monitors.filter(
        (m) => m.type === 'WAKE_UP' && m.enabled && isRenderHostname(m.url) && keepsRenderServiceAwake(m.intervalSeconds),
      ).length,
    },
  };
}
