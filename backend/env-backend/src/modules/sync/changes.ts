import { EventEmitter } from 'node:events';
import type { RequestHandler } from 'express';

/**
 * Catalogue change feed. Every successful (committed) change that can alter what customers see bumps a version number;
 * the app long-polls `GET /catalog/wait?version=…` and reloads when it moves. The version is only ever a hint: the
 * app always reloads the real catalogue from the database, and it also reloads on foreground and on a timer.
 *
 * In-memory: correct for one API process. With several API instances each has its own counter, so apps fall back to
 * their periodic refresh (at most ~60 s). Replace with PostgreSQL LISTEN/NOTIFY or Redis pub/sub before scaling out.
 */
let version = Date.now();
const bus = new EventEmitter();
bus.setMaxListeners(0);

export const catalogVersion = () => String(version);

export function bumpCatalog() {
  version = Math.max(version + 1, Date.now());
  bus.emit('change', version);
}

/** Resolves when the version differs from `since`, or after `ms` with changed=false. */
export function waitForChange(since: string, ms: number, aborted?: { on: (cb: () => void) => void }): Promise<{ version: string; changed: boolean }> {
  if (since !== catalogVersion()) return Promise.resolve({ version: catalogVersion(), changed: true });
  return new Promise((resolve) => {
    const done = (changed: boolean) => {
      clearTimeout(timer);
      bus.off('change', onChange);
      resolve({ version: catalogVersion(), changed });
    };
    const onChange = () => done(true);
    const timer = setTimeout(() => done(false), ms);
    bus.on('change', onChange);
    aborted?.on(() => done(false));
  });
}

/** Requests whose success can change what the app displays (products, prices, stock, banners, coupons, delivery rules…). */
const AFFECTS = /^\/(admin\/(products|categories|cakes|inventory|banners|coupons|campaigns|delivery|settings|orders|returns|payments)|orders|payments|webhooks|banner-events)/;

/**
 * Runs after the response is sent, i.e. after the handler's database work has committed. Failed requests never bump.
 * (banner-events are analytics only, so they are excluded below.)
 */
export const trackChanges: RequestHandler = (req, res, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  res.on('finish', () => {
    if (res.statusCode >= 200 && res.statusCode < 300 && AFFECTS.test(req.path) && !req.path.startsWith('/banner-events')) bumpCatalog();
  });
  next();
};
