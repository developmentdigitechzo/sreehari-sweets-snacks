import type { Request } from 'express';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import type { AuthUser } from './auth.js';

const WINDOW_MS = 15 * 60_000;

/** The id of the signed-in staff member, or null for anonymous callers, customers and bad or expired tokens. */
export function staffIdOf(req: Request): string | null {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  try {
    const p = jwt.verify(header.slice(7), env.JWT_SECRET) as AuthUser;
    return p.role === 'SUPER_ADMIN' || p.role === 'MANAGER' ? p.id : null;
  } catch {
    return null;
  }
}

/**
 * Two budgets instead of one shared per-IP budget:
 * - `ipLimiter`: everyone without a valid staff token (public app, customers, bots, forged tokens), counted per IP.
 * - `staffLimiter`: signed-in staff, counted per staff member.
 *
 * The admin panel forwards all staff traffic through one web server, so every staff member arrives from the same IP.
 * Counting them per IP made a few busy users share one budget and get HTTP 429. Authorisation is unchanged: this only
 * decides which counter a request is added to, and the token is verified (signature and expiry) before it counts as staff.
 */
export function createLimiters(opts: { ipLimit?: number; staffLimit?: number } = {}) {
  const base = { windowMs: WINDOW_MS, standardHeaders: true, legacyHeaders: false } as const;
  return {
    ipLimiter: rateLimit({ ...base, limit: opts.ipLimit ?? 600, skip: (req) => staffIdOf(req) !== null }),
    staffLimiter: rateLimit({ ...base, limit: opts.staffLimit ?? 3000, skip: (req) => staffIdOf(req) === null, keyGenerator: (req) => `staff:${staffIdOf(req)}` }),
  };
}
