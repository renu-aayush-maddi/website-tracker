import type { Request, Response } from 'express';
import { monitorPatchSchema, type RunResultDto } from '@wt/shared';
import type { AppDeps } from '../deps.js';
import { currentUser } from '../middleware/auth.js';
import { runMonitor } from '../services/checkService.js';
import { withWebsiteNames } from '../services/logService.js';
import { toMonitorDto } from '../services/mappers.js';
import { findOwnedMonitor, setMonitorEnabled } from '../services/monitorService.js';
import { dispatchPending } from '../services/notificationService.js';
import { parseId } from '../utils/ids.js';
import { logger } from '../utils/logger.js';
import { parse } from '../utils/validate.js';

export const monitorController = (deps: AppDeps) => ({
  async get(req: Request, res: Response) {
    const monitor = await findOwnedMonitor(currentUser(req)._id, parseId(req.params.id, 'Monitor'));
    res.json({ data: toMonitorDto(monitor) });
  },

  async patch(req: Request, res: Response) {
    const { enabled } = parse(monitorPatchSchema, req.body);
    res.json({ data: await setMonitorEnabled(currentUser(req)._id, parseId(req.params.id, 'Monitor'), enabled) });
  },

  /** "Run health check now" / "Wake up now": performed server-side, stored, returned. */
  async run(req: Request, res: Response) {
    const userId = currentUser(req)._id;
    const monitor = await findOwnedMonitor(userId, parseId(req.params.id, 'Monitor'));
    const outcome = await runMonitor(monitor, { deps, trigger: 'MANUAL' });
    const [log] = await withWebsiteNames(userId, [outcome.log]);
    const latest = outcome.monitor ?? (await findOwnedMonitor(userId, monitor._id));
    const body: RunResultDto = { log: log!, monitor: toMonitorDto(latest) };
    res.json({ data: body });
    // Deliver any notification this run triggered without delaying the response.
    dispatchPending(deps).catch((err: unknown) => logger.error({ err }, 'Notification dispatch failed'));
  },
});
