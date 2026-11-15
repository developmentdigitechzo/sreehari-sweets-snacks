import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { prisma } from '../database/prisma.js';
import { AppError, unauthorized } from '../utils/errors.js';

export type AuthUser = { id: string; role: 'CUSTOMER' | 'SUPER_ADMIN' | 'MANAGER' };

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

export const signToken = (user: AuthUser) => jwt.sign(user, env.JWT_SECRET, { expiresIn: '12h' });

/** Verifies the bearer token. Ownership / role are checked again inside each module. */
export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) return next(unauthorized());
  try {
    const payload = jwt.verify(header.slice(7), env.JWT_SECRET) as AuthUser;
    req.user = { id: payload.id, role: payload.role };
    next();
  } catch {
    next(unauthorized('Invalid or expired token'));
  }
};

export const requireRole =
  (...roles: AuthUser['role'][]): RequestHandler =>
  (req, _res, next) =>
    req.user && roles.includes(req.user.role) ? next() : next(unauthorized('Insufficient role'));

/** Like requireAuth, but anonymous callers are allowed (a bad token is treated as anonymous). */
export const optionalAuth: RequestHandler = (req, _res, next) => {
  const header = req.header('authorization');
  if (header?.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(header.slice(7), env.JWT_SECRET) as AuthUser;
      req.user = { id: payload.id, role: payload.role };
    } catch {
      /* anonymous */
    }
  }
  next();
};

/**
 * Blocks accounts the store has suspended, even when their token is still valid.
 * Use after requireAuth on every customer route that reads or changes account data.
 */
export const requireActive: RequestHandler = async (req, _res, next) => {
  try {
    const me = await prisma.customer.findUnique({ where: { id: req.user!.id }, select: { isBlocked: true } });
    if (!me) return next(unauthorized('Account not found'));
    if (me.isBlocked) return next(new AppError(403, 'This account has been suspended. Please contact the store.', 'ACCOUNT_BLOCKED'));
    next();
  } catch (e) {
    next(e);
  }
};
