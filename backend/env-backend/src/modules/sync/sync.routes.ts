import { Router } from 'express';
import { z } from 'zod';
import { catalogVersion, waitForChange } from './changes.js';

export const syncRouter = Router();

/** Cheap "has anything changed?" check. */
syncRouter.get('/catalog/version', (_req, res) => {
  res.json({ version: catalogVersion() });
});

/**
 * Long poll: returns as soon as the catalogue version differs from `version`, or after `timeout` seconds (max 25) with
 * changed=false. Plain HTTP so it works in the phone app and the browser; the client simply asks again.
 */
syncRouter.get('/catalog/wait', async (req, res) => {
  const q = z.object({ version: z.string().max(40).default(''), timeout: z.coerce.number().min(1).max(25).default(25) }).parse(req.query);
  let gone = false;
  req.on('close', () => { gone = true; });
  const r = await waitForChange(q.version, q.timeout * 1000, { on: (cb) => req.on('close', cb) });
  if (!gone) res.json(r);
});
