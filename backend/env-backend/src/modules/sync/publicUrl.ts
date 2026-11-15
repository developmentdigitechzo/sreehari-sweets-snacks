import type { Request, RequestHandler } from 'express';
import { env } from '../../config/env.js';

const LOCAL = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const privateIp = (h: string) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h);

/**
 * The address clients should use to reach this API's files. A real PUBLIC_URL wins. While PUBLIC_URL is still the
 * development default (localhost), use the address the caller actually used, so a phone that reached the API at
 * http://192.168.1.3:4000 is given image links on that same address instead of "localhost" (which is the phone itself).
 */
export function publicBase(req: Request): string {
  const cfg = new URL(env.PUBLIC_URL);
  if (!LOCAL.has(cfg.hostname)) return env.PUBLIC_URL.replace(/\/$/, '');
  return `${req.protocol}://${req.get('host') ?? cfg.host}`;
}

/** Only addresses that point at this API's own uploads are rewritten; images pasted from other sites are left alone. */
export function fixUploadUrl(value: string, base: string): string {
  const m = /^(https?):\/\/([^/]+)(\/uploads\/[^?#]+)/.exec(value);
  if (!m) return value;
  const host = m[2].replace(/:\d+$/, '');
  const cfgHost = new URL(env.PUBLIC_URL).hostname;
  return LOCAL.has(host) || privateIp(host) || host === cfgHost ? base + m[3] : value;
}

export function rewriteUploads(node: unknown, base: string): unknown {
  if (typeof node === 'string') return node.includes('/uploads/') ? fixUploadUrl(node, base) : node;
  if (Array.isArray(node)) return node.map((x) => rewriteUploads(x, base));
  if (node && typeof node === 'object' && !(node instanceof Date)) return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, rewriteUploads(v, base)]));
  return node;
}

/** Wraps res.json for customer-facing routes so stored upload links always match the address the app used. */
export const rewriteUploadLinks: RequestHandler = (req, res, next) => {
  const json = res.json.bind(res);
  res.json = (body: unknown) => json(rewriteUploads(body, publicBase(req)));
  next();
};

/** True for a link to a file in THIS API's uploads (any address the API can be reached at), so saved image links never depend on one fixed hostname. */
export const isOwnUpload = (value: string): boolean => /^https?:\/\/[^/]+\/uploads\/[^?#\s]+$/.test(value) && fixUploadUrl(value, 'http://x') !== value;
