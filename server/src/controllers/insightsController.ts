import type { Request, Response } from 'express';
import { logsQuerySchema, settingsSchema, statsQuerySchema } from '@wt/shared';
import type { AppDeps } from '../deps.js';
import { currentUser } from '../middleware/auth.js';
import { getDashboard } from '../services/dashboardService.js';
import { listLogs } from '../services/logService.js';
import { listNotifications, sendTestEmail } from '../services/notificationService.js';
import { getSettingsResponse, updateSettings } from '../services/settingsService.js';
import { getSummary, getTimeseries } from '../services/statsService.js';
import { parse } from '../utils/validate.js';

export const insightsController = (deps: AppDeps) => ({
  async dashboard(req: Request, res: Response) {
    res.json({ data: await getDashboard(currentUser(req)._id) });
  },

  async logs(req: Request, res: Response) {
    res.json({ data: await listLogs(currentUser(req)._id, parse(logsQuerySchema, req.query)) });
  },

  async statsSummary(req: Request, res: Response) {
    res.json({ data: await getSummary(currentUser(req)._id, parse(statsQuerySchema, req.query)) });
  },

  async statsTimeseries(req: Request, res: Response) {
    const user = currentUser(req);
    res.json({ data: await getTimeseries(user._id, parse(statsQuerySchema, req.query), user.settings.timezone) });
  },

  async getSettings(req: Request, res: Response) {
    res.json({ data: await getSettingsResponse(currentUser(req)._id, deps.emailSender) });
  },

  async putSettings(req: Request, res: Response) {
    await updateSettings(currentUser(req)._id, parse(settingsSchema, req.body));
    res.json({ data: await getSettingsResponse(currentUser(req)._id, deps.emailSender) });
  },

  async testEmail(req: Request, res: Response) {
    res.json({ data: await sendTestEmail(deps, currentUser(req)) });
  },

  async notifications(req: Request, res: Response) {
    res.json({ data: await listNotifications(currentUser(req)._id) });
  },
});
