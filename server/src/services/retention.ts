const DAY_MS = 24 * 60 * 60 * 1000;

/** Expiry for a log written at `startedAt`; undefined keeps it forever. */
export function retentionExpiry(startedAt: Date, retentionDays: number): Date | undefined {
  return retentionDays > 0 ? new Date(startedAt.getTime() + retentionDays * DAY_MS) : undefined;
}
