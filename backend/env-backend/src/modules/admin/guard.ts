import type { Request, RequestHandler } from 'express';
import { prisma } from '../../database/prisma.js';
import { forbidden } from '../../utils/errors.js';
import { requireAuth } from '../../middleware/auth.js';

/**
 * Staff permissions. Enforced on the server for every /admin route; the web panel only mirrors them to hide menu items.
 * SUPER_ADMIN can do everything. MANAGER runs the shop day to day but cannot manage staff, settings, the audit log or money movement (refunds).
 */
export const PERMISSIONS = [
  'dashboard', 'catalog', 'inventory', 'orders', 'returns', 'refunds', 'customers', 'offers', 'banners',
  'broadcast', 'reports', 'delivery', 'payments', 'settings', 'admins', 'audit',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const MANAGER: Permission[] = ['dashboard', 'catalog', 'inventory', 'orders', 'returns', 'customers', 'offers', 'banners', 'broadcast', 'reports', 'delivery', 'payments'];

export const permissionsFor = (role: string): Permission[] => (role === 'SUPER_ADMIN' ? [...PERMISSIONS] : role === 'MANAGER' ? MANAGER : []);

export type Staff = { id: string; name: string; role: 'SUPER_ADMIN' | 'MANAGER'; ip?: string };

declare module 'express-serve-static-core' {
  interface Request {
    staff?: Staff;
  }
}

/**
 * Valid token AND a staff account that still exists, is not blocked and still holds the permission.
 * The role is read from the database on every request, so demoting or blocking someone takes effect immediately.
 */
export const requirePermission =
  (permission: Permission): RequestHandler =>
  (req, res, next) => {
    requireAuth(req, res, async (authErr?: unknown) => {
      if (authErr) return next(authErr);
      try {
        const me = await prisma.customer.findUnique({ where: { id: req.user!.id }, select: { id: true, name: true, role: true, isBlocked: true } });
        if (!me || me.isBlocked || (me.role !== 'SUPER_ADMIN' && me.role !== 'MANAGER')) throw forbidden('Staff access required');
        if (!permissionsFor(me.role).includes(permission)) throw forbidden('You do not have permission for this action');
        req.staff = { id: me.id, name: me.name, role: me.role, ip: req.ip };
        next();
      } catch (e) {
        next(e);
      }
    });
  };

export const staffOf = (req: Request): Staff => req.staff!;
