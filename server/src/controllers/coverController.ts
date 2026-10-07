import type { Request, Response } from 'express';
import { currentUser } from '../middleware/auth.js';
import * as covers from '../services/coverService.js';
import { parseId } from '../utils/ids.js';

export async function put(req: Request, res: Response) {
  const version = await covers.saveCover(currentUser(req)._id, parseId(req.params.id, 'Website'), req.body);
  res.json({ data: { coverVersion: version } });
}

export async function get(req: Request, res: Response) {
  const cover = await covers.getCover(currentUser(req)._id, parseId(req.params.id, 'Website'));
  res.set({
    'Content-Type': cover.contentType,
    'Content-Length': String(cover.data.length),
    // The URL carries ?v=<coverVersion>, so a changed image is always a new URL and old ones can be cached for good.
    'Cache-Control': 'private, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': 'inline',
  });
  res.send(cover.data);
}

export async function remove(req: Request, res: Response) {
  await covers.removeCover(currentUser(req)._id, parseId(req.params.id, 'Website'));
  res.status(204).end();
}
