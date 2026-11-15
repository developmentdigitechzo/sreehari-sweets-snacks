import { Router } from 'express';
import { emailSchema, nameSchema, normalizeIndianPhone } from '../auth/validators.js';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { prisma } from '../../database/prisma.js';
import { requireAuth } from '../../middleware/auth.js';
import { AppError, notFound, forbidden } from '../../utils/errors.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { audit } from './util.js';
import { permissionsFor, requirePermission } from './guard.js';

export const adminAuthRouter = Router();

/**
 * Staff sign-in is a separate, stricter entry point from customer login: ADMIN_LOGIN_RATE_LIMIT FAILED attempts (default 8) per 15 minutes per IP.
 * Only failures count (skipSuccessfulRequests): that is what a password-guessing attack looks like, while a real person who signs in correctly
 * (or several staff behind one office address) is never locked out by their own successful sign-ins.
 */
const loginLimiter = rateLimit({ windowMs: 15 * 60_000, limit: env.ADMIN_LOGIN_RATE_LIMIT, standardHeaders: true, legacyHeaders: false, skipSuccessfulRequests: true });

const staffView = (c: { id: string; name: string; email: string | null; phone: string; role: string }) => ({
  id: c.id, name: c.name, email: c.email, phone: c.phone, role: c.role, permissions: permissionsFor(c.role),
});

adminAuthRouter.post('/admin/auth/login', loginLimiter, async (req, res) => {
  const { email, password } = z.object({ email: emailSchema.transform((v) => v.toLowerCase()), password: z.string().min(1).max(200) }).parse(req.body);
  const c = await prisma.customer.findUnique({ where: { email } });
  const ok = await verifyPassword(password, c?.passwordHash);
  const staff = c && (c.role === 'SUPER_ADMIN' || c.role === 'MANAGER');
  // One message for unknown email, wrong password, customer account, or blocked staff: nothing to probe.
  if (!c || !ok || !staff || c.isBlocked) throw new AppError(401, 'Incorrect email or password', 'INVALID_CREDENTIALS');
  const token = jwt.sign({ id: c.id, role: c.role }, env.JWT_SECRET, { expiresIn: '8h' });
  await prisma.auditLog.create({ data: { actorId: c.id, actorName: c.name, actorRole: c.role, action: 'auth.login', entity: 'Customer', entityId: c.id, summary: 'Signed in to the admin panel', ip: req.ip } });
  res.json({ token, user: staffView(c) });
});

adminAuthRouter.get('/admin/auth/me', requireAuth, async (req, res) => {
  const c = await prisma.customer.findUnique({ where: { id: req.user!.id } });
  if (!c || c.isBlocked || (c.role !== 'SUPER_ADMIN' && c.role !== 'MANAGER')) throw forbidden('Staff access required');
  res.json({ user: staffView(c) });
});

/* ---- Staff accounts (SUPER_ADMIN only) ---- */
const passwordRule = z.string().min(10, 'Use at least 10 characters').max(128);
const staffInput = z.object({
  name: nameSchema,
  email: emailSchema.transform((v) => v.toLowerCase()),
  // Indian numbers in any common form are stored as +91XXXXXXXXXX (so one person can never hold two accounts through spelling);
  // a staff member abroad can still use full international form, +<country><number>.
  phone: z.string().trim().refine((v) => normalizeIndianPhone(v) !== null || /^\+[1-9]\d{7,14}$/.test(v.replace(/[\s-]/g, '')), 'Enter a valid mobile number, like 98765 43210 or +91 98765 43210').transform((v) => normalizeIndianPhone(v) ?? v.replace(/[\s-]/g, '')),
  role: z.enum(['SUPER_ADMIN', 'MANAGER']),
  password: passwordRule,
});

adminAuthRouter.get('/admin/staff', requirePermission('admins'), async (_req, res) => {
  const rows = await prisma.customer.findMany({ where: { role: { in: ['SUPER_ADMIN', 'MANAGER'] } }, orderBy: { createdAt: 'asc' } });
  res.json({ items: rows.map((c) => ({ ...staffView(c), isBlocked: c.isBlocked, createdAt: c.createdAt })) });
});

adminAuthRouter.post('/admin/staff', requirePermission('admins'), async (req, res) => {
  const d = staffInput.parse(req.body);
  const [byEmail, byPhone] = await Promise.all([prisma.customer.findUnique({ where: { email: d.email } }), prisma.customer.findUnique({ where: { phone: d.phone } })]);
  if (byEmail) throw new AppError(409, 'This email is already in use', 'CONFLICT', 'email');
  if (byPhone) throw new AppError(409, 'This phone number is already in use', 'CONFLICT', 'phone');
  const c = await prisma.customer.create({ data: { name: d.name, email: d.email, phone: d.phone, role: d.role, passwordHash: await hashPassword(d.password) } });
  await audit(req, { action: 'staff.create', entity: 'Customer', entityId: c.id, summary: `Created ${d.role} account for ${d.email}` });
  res.status(201).json({ user: staffView(c) });
});

adminAuthRouter.patch('/admin/staff/:id', requirePermission('admins'), async (req, res) => {
  const id = String(req.params.id);
  const d = z.object({ role: z.enum(['SUPER_ADMIN', 'MANAGER']).optional(), isBlocked: z.boolean().optional(), password: passwordRule.optional() }).parse(req.body);
  const target = await prisma.customer.findUnique({ where: { id } });
  if (!target || (target.role !== 'SUPER_ADMIN' && target.role !== 'MANAGER')) throw notFound('Staff account');
  // Lock-out protection: you cannot demote or block yourself, and the last active super admin cannot be removed.
  if (id === req.staff!.id && (d.isBlocked || (d.role && d.role !== 'SUPER_ADMIN'))) throw new AppError(409, 'You cannot demote or block your own account', 'CONFLICT');
  if (target.role === 'SUPER_ADMIN' && (d.isBlocked || (d.role && d.role !== 'SUPER_ADMIN'))) {
    const others = await prisma.customer.count({ where: { role: 'SUPER_ADMIN', isBlocked: false, id: { not: id } } });
    if (others === 0) throw new AppError(409, 'There must be at least one active super admin', 'CONFLICT');
  }
  const c = await prisma.customer.update({
    where: { id },
    data: { role: d.role, isBlocked: d.isBlocked, blockedAt: d.isBlocked === undefined ? undefined : d.isBlocked ? new Date() : null, passwordHash: d.password ? await hashPassword(d.password) : undefined },
  });
  await audit(req, { action: 'staff.update', entity: 'Customer', entityId: id, summary: `Updated staff ${c.email}`, meta: { role: d.role, isBlocked: d.isBlocked, passwordChanged: !!d.password } });
  res.json({ user: staffView(c) });
});
