import type { Request, Response } from 'express';
import { websiteInputSchema, websiteListQuerySchema } from '@wt/shared';
import type { AppDeps } from '../deps.js';
import { currentUser } from '../middleware/auth.js';
import * as websites from '../services/websiteService.js';
import { parseId } from '../utils/ids.js';
import { parse } from '../utils/validate.js';

export const websiteController = (deps: AppDeps) => ({
  async list(req: Request, res: Response) {
    res.json({ data: await websites.listWebsites(currentUser(req)._id, parse(websiteListQuerySchema, req.query)) });
  },

  async tags(req: Request, res: Response) {
    res.json({ data: await websites.listTags(currentUser(req)._id) });
  },

  async get(req: Request, res: Response) {
    res.json({ data: await websites.getWebsite(currentUser(req)._id, parseId(req.params.id, 'Website')) });
  },

  async create(req: Request, res: Response) {
    const input = parse(websiteInputSchema, req.body);
    res.status(201).json({ data: await websites.createWebsite(currentUser(req)._id, input, deps.checkTarget) });
  },

  async update(req: Request, res: Response) {
    const id = parseId(req.params.id, 'Website');
    const input = parse(websiteInputSchema, req.body);
    res.json({ data: await websites.updateWebsite(currentUser(req)._id, id, input, deps.checkTarget) });
  },

  async remove(req: Request, res: Response) {
    await websites.deleteWebsite(currentUser(req)._id, parseId(req.params.id, 'Website'));
    res.status(204).end();
  },
});
