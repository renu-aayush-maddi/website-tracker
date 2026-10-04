import { Types, type PipelineStage } from 'mongoose';
import { LIMITS, type StatsQuery, type StatsSummary, type TimeseriesResponse } from '@wt/shared';
import { MonitoringLog } from '../models/index.js';
import { badRequest } from '../utils/errors.js';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export function resolveRange(query: Pick<StatsQuery, 'from' | 'to'>, now = new Date()) {
  const to = query.to ?? now;
  const from = query.from ?? new Date(to.getTime() - DAY_MS);
  if (from >= to) throw badRequest('"from" must be before "to"', { from: 'Must be before the end date' });
  if (to.getTime() - from.getTime() > LIMITS.statsRangeMaxDays * DAY_MS) {
    throw badRequest(`Range cannot exceed ${LIMITS.statsRangeMaxDays} days`);
  }
  return { from, to };
}

function matchStage(userId: Types.ObjectId, query: StatsQuery, from: Date, to: Date): PipelineStage.Match {
  const match: Record<string, unknown> = { userId, type: query.type, startedAt: { $gte: from, $lt: to } };
  if (query.websiteId) match.websiteId = new Types.ObjectId(query.websiteId);
  if (query.monitorId) match.monitorId = new Types.ObjectId(query.monitorId);
  if (query.result) match.success = query.result === 'success';
  return { $match: match };
}

interface SummaryRow {
  total: number;
  successes: number;
  avg: number | null;
  min: number | null;
  max: number | null;
  p95: Array<number | null> | null;
}

export async function getSummary(userId: Types.ObjectId, query: StatsQuery): Promise<StatsSummary> {
  const { from, to } = resolveRange(query);
  const [row] = await MonitoringLog.aggregate<SummaryRow>([
    matchStage(userId, query, from, to),
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        successes: { $sum: { $cond: ['$success', 1, 0] } },
        avg: { $avg: '$responseMs' },
        min: { $min: '$responseMs' },
        max: { $max: '$responseMs' },
        p95: { $percentile: { input: '$responseMs', p: [0.95], method: 'approximate' } },
      },
    },
  ]);
  const total = row?.total ?? 0;
  const successes = row?.successes ?? 0;
  const round = (v: number | null | undefined) => (v === null || v === undefined ? null : Math.round(v));
  return {
    total,
    successes,
    failures: total - successes,
    successRate: total > 0 ? successes / total : null,
    avgResponseMs: round(row?.avg),
    minResponseMs: round(row?.min),
    maxResponseMs: round(row?.max),
    p95ResponseMs: round(row?.p95?.[0]),
    from: from.toISOString(),
    to: to.toISOString(),
  };
}

/** Bucket size chosen so charts have roughly 30–100 points for any range. */
export function chooseBucket(spanMs: number): { unit: TimeseriesResponse['bucketUnit']; size: number } {
  if (spanMs <= 3 * HOUR_MS) return { unit: 'minute', size: 5 };
  if (spanMs <= 12 * HOUR_MS) return { unit: 'minute', size: 15 };
  if (spanMs <= 2 * DAY_MS) return { unit: 'hour', size: 1 };
  if (spanMs <= 14 * DAY_MS) return { unit: 'hour', size: 6 };
  if (spanMs <= 120 * DAY_MS) return { unit: 'day', size: 1 };
  return { unit: 'week', size: 1 };
}

interface BucketRow {
  _id: Date;
  total: number;
  successes: number;
  avg: number | null;
  max: number | null;
}

export async function getTimeseries(userId: Types.ObjectId, query: StatsQuery, timezone: string): Promise<TimeseriesResponse> {
  const { from, to } = resolveRange(query);
  const bucket = chooseBucket(to.getTime() - from.getTime());
  const rows = await MonitoringLog.aggregate<BucketRow>([
    matchStage(userId, query, from, to),
    {
      $group: {
        // Buckets align to the user's local day/hour boundaries.
        _id: { $dateTrunc: { date: '$startedAt', unit: bucket.unit, binSize: bucket.size, timezone } },
        total: { $sum: 1 },
        successes: { $sum: { $cond: ['$success', 1, 0] } },
        avg: { $avg: '$responseMs' },
        max: { $max: '$responseMs' },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  return {
    bucketUnit: bucket.unit,
    bucketSize: bucket.size,
    points: rows.map((r) => ({
      bucket: r._id.toISOString(),
      total: r.total,
      successes: r.successes,
      successRate: r.total > 0 ? r.successes / r.total : null,
      avgResponseMs: r.avg === null ? null : Math.round(r.avg),
      maxResponseMs: r.max,
    })),
  };
}
