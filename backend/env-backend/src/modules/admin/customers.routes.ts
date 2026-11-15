import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import { AppError, notFound } from '../../utils/errors.js';
import { requirePermission } from './guard.js';
import { audit, num, paged, parsePage, pct, range, toCsv } from './util.js';
import { customerIdsForRule, parseRule } from './segments.js';

export const adminCustomersRouter = Router();

const base: Prisma.CustomerWhereInput = { role: 'CUSTOMER' };

adminCustomersRouter.get('/admin/customers', requirePermission('customers'), async (req, res) => {
  const p = parsePage(req);
  const f = z.object({ status: z.enum(['all', 'active', 'blocked']).default('all'), segmentId: z.string().optional(), format: z.enum(['json', 'csv']).default('json') }).parse(req.query);
  let ids: string[] | undefined;
  if (f.segmentId) {
    const seg = await prisma.segment.findUnique({ where: { id: f.segmentId } });
    if (!seg) throw notFound('Segment');
    ids = await customerIdsForRule(parseRule(seg.rule));
  }
  const where: Prisma.CustomerWhereInput = {
    ...base,
    isBlocked: f.status === 'all' ? undefined : f.status === 'blocked',
    id: ids ? { in: ids } : undefined,
    OR: p.q ? [{ name: { contains: p.q, mode: 'insensitive' } }, { phone: { contains: p.q } }, { email: { contains: p.q, mode: 'insensitive' } }] : undefined,
  };
  const r = range(req);
  const [total, rows, all, blocked, fresh, prevFresh, optIn] = await Promise.all([
    prisma.customer.count({ where }),
    prisma.customer.findMany({ where, orderBy: { createdAt: 'desc' }, skip: f.format === 'csv' ? 0 : p.skip, take: f.format === 'csv' ? 10000 : p.take, include: { _count: { select: { orders: true } } } }),
    prisma.customer.count({ where: base }),
    prisma.customer.count({ where: { ...base, isBlocked: true } }),
    prisma.customer.count({ where: { ...base, createdAt: { gte: r.from, lte: r.to } } }),
    prisma.customer.count({ where: { ...base, createdAt: { gte: r.prevFrom, lte: r.prevTo } } }),
    prisma.customer.count({ where: { ...base, marketingOptIn: true } }),
  ]);
  const spend = await prisma.order.groupBy({ by: ['customerId'], where: { customerId: { in: rows.map((c) => c.id) }, status: { not: 'CANCELLED' } }, _sum: { total: true } });
  const spent = new Map(spend.map((s) => [s.customerId, num(s._sum.total) ?? 0]));
  const items = rows.map((c) => ({ id: c.id, name: c.name, phone: c.phone, email: c.email, orders: c._count.orders, totalSpend: spent.get(c.id) ?? 0, isBlocked: c.isBlocked, marketingOptIn: c.marketingOptIn, isDemo: c.isDemo, joinedAt: c.createdAt }));
  if (f.format === 'csv') {
    res.type('text/csv').send(toCsv(['Name', 'Phone', 'Email', 'Orders', 'Total spend (INR)', 'Status', 'Marketing opt-in', 'Joined'], items.map((c) => [c.name, c.phone, c.email, c.orders, c.totalSpend, c.isBlocked ? 'Blocked' : 'Active', c.marketingOptIn ? 'Yes' : 'No', c.joinedAt.toISOString()])));
    return;
  }
  res.json({ ...paged(items, total, p), stats: { total: all, blocked, active: all - blocked, newCustomers: fresh, newDelta: pct(fresh, prevFresh), marketingOptIn: optIn } });
});

adminCustomersRouter.get('/admin/customers/:id', requirePermission('customers'), async (req, res) => {
  const id = String(req.params.id);
  const c = await prisma.customer.findFirst({ where: { id, ...base }, include: { addresses: { orderBy: { createdAt: 'desc' } }, returnRequests: { orderBy: { createdAt: 'desc' }, take: 10 } } });
  if (!c) throw notFound('Customer');
  const [orders, agg, points] = await Promise.all([
    prisma.order.findMany({ where: { customerId: id }, orderBy: { createdAt: 'desc' }, take: 20, include: { payment: true } }),
    prisma.order.aggregate({ where: { customerId: id, status: { not: 'CANCELLED' } }, _count: true, _sum: { total: true } }),
    prisma.rewardLedger.aggregate({ where: { customerId: id }, _sum: { points: true } }),
  ]);
  res.json({
    id: c.id, name: c.name, phone: c.phone, email: c.email, isBlocked: c.isBlocked, blockedAt: c.blockedAt, marketingOptIn: c.marketingOptIn, phoneVerified: !!c.phoneVerifiedAt, isDemo: c.isDemo, joinedAt: c.createdAt,
    stats: { orders: agg._count, totalSpend: num(agg._sum.total) ?? 0, avgOrder: agg._count ? Math.round((num(agg._sum.total) ?? 0) / agg._count) : 0, rewardPoints: points._sum.points ?? 0 },
    addresses: c.addresses.map((a) => ({ id: a.id, label: a.label, name: a.name, phone: a.phone, line1: a.line1, area: a.area, city: a.city, pincode: a.pincode, state: a.state, landmark: a.landmark, hasGps: a.latitude != null, isDefault: a.isDefault })),
    orders: orders.map((o) => ({ id: o.id, number: o.number, status: o.status, total: num(o.total), paymentStatus: o.payment?.status, createdAt: o.createdAt })),
    returnRequests: c.returnRequests.map((r) => ({ id: r.id, kind: r.kind, status: r.status, reason: r.reason, createdAt: r.createdAt })),
  });
});

adminCustomersRouter.patch('/admin/customers/:id', requirePermission('customers'), async (req, res) => {
  const id = String(req.params.id);
  const d = z.object({ isBlocked: z.boolean().optional(), reason: z.string().trim().max(200).optional() }).parse(req.body);
  if (d.isBlocked && !d.reason) throw new AppError(422, 'Give a reason for blocking', 'VALIDATION_ERROR', 'reason');
  const r = await prisma.customer.updateMany({ where: { id, ...base }, data: { isBlocked: d.isBlocked, blockedAt: d.isBlocked === undefined ? undefined : d.isBlocked ? new Date() : null } });
  if (r.count !== 1) throw notFound('Customer');
  await audit(req, { action: d.isBlocked ? 'customer.block' : 'customer.unblock', entity: 'Customer', entityId: id, summary: `${d.isBlocked ? 'Blocked' : 'Unblocked'} customer${d.reason ? `: ${d.reason}` : ''}` });
  res.json({ ok: true });
});

/** Manual reward adjustment: append-only ledger row with a mandatory note. */
adminCustomersRouter.post('/admin/customers/:id/points', requirePermission('customers'), async (req, res) => {
  const id = String(req.params.id);
  const d = z.object({ points: z.number().int().refine((n) => n !== 0, 'Points cannot be zero').refine((n) => Math.abs(n) <= 100000), note: z.string().trim().min(3).max(120) }).parse(req.body);
  await prisma.$transaction(async (tx) => {
    if (!(await tx.customer.findFirst({ where: { id, ...base } }))) throw notFound('Customer');
    const bal = (await tx.rewardLedger.aggregate({ where: { customerId: id }, _sum: { points: true } }))._sum.points ?? 0;
    if (bal + d.points < 0) throw new AppError(409, 'Points balance cannot go below zero', 'CONFLICT');
    await tx.rewardLedger.create({ data: { customerId: id, points: d.points, note: `Admin adjustment: ${d.note}` } });
    await audit(req, { action: 'rewards.adjust', entity: 'Customer', entityId: id, summary: `${d.points > 0 ? '+' : ''}${d.points} reward points: ${d.note}` }, tx);
  });
  res.status(201).json({ ok: true });
});
