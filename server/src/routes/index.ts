import { Router } from 'express';
import * as authController from '../controllers/authController.js';
import { insightsController } from '../controllers/insightsController.js';
import { monitorController } from '../controllers/monitorController.js';
import { requireSchedulerSecret, schedulerController } from '../controllers/schedulerController.js';
import { websiteController } from '../controllers/websiteController.js';
import type { AppDeps } from '../deps.js';
import { requireAuth } from '../middleware/auth.js';
import { authLimiter, emailTestLimiter, manualRunLimiter, schedulerLimiter } from '../middleware/rateLimits.js';
import { PROVIDER_CATALOG } from '@wt/shared';

export function internalRoutes(deps: AppDeps): Router {
  const router = Router();
  const scheduler = schedulerController(deps);
  router.post('/scheduler/tick', schedulerLimiter(), requireSchedulerSecret, scheduler.tick);
  return router;
}

export function authRoutes(): Router {
  const router = Router();
  const limiter = authLimiter();
  router.get('/setup-status', authController.setupStatus);
  router.post('/setup', limiter, authController.setup);
  router.post('/register', limiter, authController.register);
  router.post('/login', limiter, authController.login);
  router.post('/logout', authController.logout);
  router.post('/logout-all', requireAuth, authController.logoutAll);
  router.get('/me', requireAuth, authController.me);
  router.put('/password', requireAuth, limiter, authController.changePassword);
  return router;
}

/** Everything here requires an authenticated session. */
export function protectedRoutes(deps: AppDeps): Router {
  const router = Router();
  router.use(requireAuth);

  const monitors = monitorController(deps);
  const insights = insightsController(deps);
  const websites = websiteController(deps);

  router.patch('/account', authController.updateAccount);

  router.get('/websites', websites.list);
  router.get('/websites/tags', websites.tags);
  router.post('/websites', websites.create);
  router.get('/websites/:id', websites.get);
  router.put('/websites/:id', websites.update);
  router.delete('/websites/:id', websites.remove);

  router.get('/monitors/:id', monitors.get);
  router.patch('/monitors/:id', monitors.patch);
  router.post('/monitors/:id/run', manualRunLimiter(), monitors.run);

  router.get('/dashboard', insights.dashboard);
  router.get('/logs', insights.logs);
  router.get('/stats/summary', insights.statsSummary);
  router.get('/stats/timeseries', insights.statsTimeseries);

  router.get('/settings', insights.getSettings);
  router.put('/settings', insights.putSettings);
  router.post('/settings/notifications/test', emailTestLimiter(), insights.testEmail);
  router.get('/notifications', insights.notifications);

  router.get('/meta/providers', (_req, res) => {
    res.json({ data: PROVIDER_CATALOG });
  });
  return router;
}
