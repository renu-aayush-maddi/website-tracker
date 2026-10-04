import { Types } from 'mongoose';
import { environmentDisplayName, type CursorPage, type LogDto, type LogsQuery } from '@wt/shared';
import { MonitoringLog, Website, type MonitoringLogDoc, type WebsiteDoc } from '../models/index.js';
import { badRequest } from '../utils/errors.js';
import { toLogDto } from './mappers.js';

interface Cursor {
  t: string;
  id: string;
}

function encodeCursor(log: MonitoringLogDoc): string {
  return Buffer.from(JSON.stringify({ t: log.startedAt.toISOString(), id: log._id.toString() })).toString('base64url');
}

function decodeCursor(raw: string): { startedAt: Date; id: Types.ObjectId } {
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Cursor;
    const startedAt = new Date(parsed.t);
    if (Number.isNaN(startedAt.getTime()) || !Types.ObjectId.isValid(parsed.id)) throw new Error('bad cursor');
    return { startedAt, id: new Types.ObjectId(parsed.id) };
  } catch {
    throw badRequest('Invalid pagination cursor');
  }
}

/** Adds website and environment names to logs (one query per page, not per row). */
export async function withWebsiteNames(userId: Types.ObjectId, logs: MonitoringLogDoc[]): Promise<LogDto[]> {
  const ids = [...new Set(logs.map((l) => l.websiteId.toString()))].map((id) => new Types.ObjectId(id));
  const websites = await Website.find({ _id: { $in: ids }, userId }, { name: 1, environments: 1 }).lean<WebsiteDoc[]>();
  const byId = new Map(websites.map((w) => [w._id.toString(), w]));
  return logs.map((log) => {
    const website = byId.get(log.websiteId.toString());
    const env = website?.environments.find((e) => e._id.equals(log.environmentId));
    return toLogDto(log, website ? { name: website.name, environmentLabel: env ? environmentDisplayName(env) : null } : undefined);
  });
}

/** Keyset pagination on (startedAt, _id) — constant cost regardless of page depth. */
export async function listLogs(userId: Types.ObjectId, query: LogsQuery): Promise<CursorPage<LogDto>> {
  const filter: Record<string, unknown> = { userId };
  if (query.websiteId) filter.websiteId = new Types.ObjectId(query.websiteId);
  if (query.monitorId) filter.monitorId = new Types.ObjectId(query.monitorId);
  if (query.type) filter.type = query.type;
  if (query.result) filter.success = query.result === 'success';
  const range: Record<string, Date> = {};
  if (query.from) range.$gte = query.from;
  if (query.to) range.$lt = query.to;
  if (Object.keys(range).length > 0) filter.startedAt = range;
  if (query.cursor) {
    const c = decodeCursor(query.cursor);
    filter.$or = [{ startedAt: { $lt: c.startedAt } }, { startedAt: c.startedAt, _id: { $lt: c.id } }];
  }

  const logs = await MonitoringLog.find(filter)
    .sort({ startedAt: -1, _id: -1 })
    .limit(query.limit + 1)
    .lean<MonitoringLogDoc[]>();
  const hasMore = logs.length > query.limit;
  const page = hasMore ? logs.slice(0, query.limit) : logs;
  return {
    items: await withWebsiteNames(userId, page),
    nextCursor: hasMore ? encodeCursor(page[page.length - 1]!) : null,
  };
}
