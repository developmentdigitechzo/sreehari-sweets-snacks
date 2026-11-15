import { Router } from 'express';
import { z } from 'zod';
import { Prisma, type OrderStatus } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import { AppError, notFound } from '../../utils/errors.js';
import { cancelOrderTx } from '../orders/cancel.js';
import { pushOrderEvent } from '../notify/transactionalPush.js';
import { requirePermission } from './guard.js';
import { getSetting } from './settings.service.js';
import { audit, num, paged, parsePage, pct, range, toCsv } from './util.js';

export const adminOrdersRouter = Router();

const FLOW: OrderStatus[] = ['PLACED', 'CONFIRMED', 'PREPARING', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED'];
const LABEL: Record<OrderStatus, string> = { PLACED: 'Pending', CONFIRMED: 'Confirmed', PREPARING: 'Preparing', PACKED: 'Packed', OUT_FOR_DELIVERY: 'Out for Delivery', DELIVERED: 'Delivered', CANCELLED: 'Cancelled' };
const TAB: Record<string, OrderStatus[]> = {
  pending: ['PLACED'], processing: ['CONFIRMED', 'PREPARING'], packed: ['PACKED'], transit: ['OUT_FOR_DELIVERY'], delivered: ['DELIVERED'], cancelled: ['CANCELLED'],
};

const filterSchema = z.object({
  tab: z.enum(['all', 'pending', 'processing', 'packed', 'transit', 'delivered', 'cancelled', 'returns']).default('all'),
  payment: z.enum(['PAID', 'PENDING', 'PROCESSING', 'FAILED', 'CANCELLED', 'REFUNDED', 'COD_DUE']).optional(),
  slot: z.string().max(20).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  format: z.enum(['json', 'csv']).default('json'),
});

const orderRow = (o: Prisma.OrderGetPayload<{ include: { customer: { select: { name: true; phone: true } }; payment: true; _count: { select: { items: true } } } }>) => ({
  id: o.id, number: o.number, customer: o.customer.name, phone: o.customer.phone, items: o._count.items, total: num(o.total)!, status: o.status, statusLabel: LABEL[o.status],
  payment: o.payment ? { method: o.payment.method, status: o.payment.status, simulated: o.payment.simulated } : null, createdAt: o.createdAt, isDemo: o.isDemo,
});

adminOrdersRouter.get('/admin/orders', requirePermission('orders'), async (req, res) => {
  const p = parsePage(req);
  const f = filterSchema.parse(req.query);
  const where: Prisma.OrderWhereInput = {
    status: f.tab !== 'all' && f.tab !== 'returns' ? { in: TAB[f.tab] } : undefined,
    returnRequests: f.tab === 'returns' ? { some: { kind: 'RETURN' } } : undefined,
    payment: f.payment ? { status: f.payment } : undefined,
    slotSnapshot: f.slot ? { path: ['id'], equals: f.slot } : undefined,
    createdAt: f.from || f.to ? { gte: f.from ? new Date(f.from) : undefined, lte: f.to ? new Date(f.to) : undefined } : undefined,
    OR: p.q ? [{ number: { contains: p.q, mode: 'insensitive' } }, { customer: { name: { contains: p.q, mode: 'insensitive' } } }, { customer: { phone: { contains: p.q } } }] : undefined,
  };
  const include = { customer: { select: { name: true, phone: true } }, payment: true, _count: { select: { items: true } } } as const;
  if (f.format === 'csv') {
    const rows = await prisma.order.findMany({ where, include, orderBy: { createdAt: 'desc' }, take: 10000 });
    res.type('text/csv').send(toCsv(['Order', 'Date', 'Customer', 'Phone', 'Items', 'Total (INR)', 'Status', 'Payment method', 'Payment status'], rows.map((o) => [o.number, o.createdAt.toISOString(), o.customer.name, o.customer.phone, o._count.items, num(o.total), LABEL[o.status], o.payment?.method, o.payment?.status])));
    return;
  }
  const r = range(req);
  const [total, rows, byStatus, returnsCount, cur, prev] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({ where, include, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.take }),
    prisma.order.groupBy({ by: ['status'], _count: true }),
    prisma.returnRequest.count({ where: { kind: 'RETURN' } }),
    prisma.order.aggregate({ where: { createdAt: { gte: r.from, lte: r.to }, status: { not: 'CANCELLED' } }, _count: true, _sum: { total: true } }),
    prisma.order.aggregate({ where: { createdAt: { gte: r.prevFrom, lte: r.prevTo }, status: { not: 'CANCELLED' } }, _count: true, _sum: { total: true } }),
  ]);
  const c = Object.fromEntries(byStatus.map((s) => [s.status, s._count])) as Partial<Record<OrderStatus, number>>;
  const sum = (...s: OrderStatus[]) => s.reduce((n, k) => n + (c[k] ?? 0), 0);
  const all = Object.values(c).reduce((a, b) => a + b, 0);
  res.json({
    ...paged(rows.map(orderRow), total, p),
    tabs: { all, pending: sum('PLACED'), processing: sum('CONFIRMED', 'PREPARING'), packed: sum('PACKED'), transit: sum('OUT_FOR_DELIVERY'), delivered: sum('DELIVERED'), cancelled: sum('CANCELLED'), returns: returnsCount },
    stats: {
      orders: cur._count, ordersDelta: pct(cur._count, prev._count), value: num(cur._sum.total) ?? 0, valueDelta: pct(num(cur._sum.total) ?? 0, num(prev._sum.total) ?? 0),
      delivered: sum('DELIVERED'), inTransit: sum('OUT_FOR_DELIVERY'), cancelled: sum('CANCELLED'), returns: returnsCount,
    },
  });
});

adminOrdersRouter.get('/admin/orders/:id', requirePermission('orders'), async (req, res) => {
  const o = await prisma.order.findUnique({
    where: { id: String(req.params.id) },
    include: { customer: { select: { id: true, name: true, phone: true, email: true } }, items: true, events: { orderBy: { at: 'asc' } }, payment: true, returnRequests: { orderBy: { createdAt: 'desc' } } },
  });
  if (!o) throw notFound('Order');
  const i = FLOW.indexOf(o.status);
  res.json({
    id: o.id, number: o.number, status: o.status, statusLabel: LABEL[o.status], createdAt: o.createdAt, isDemo: o.isDemo, couponCode: o.couponCode,
    customer: o.customer, address: o.addressSnapshot, slot: o.slotSnapshot,
    items: o.items.map((it) => ({ id: it.id, name: it.name, sku: it.sku, size: it.variantLabel, qty: it.qty, unitPrice: num(it.unitPrice), mrp: num(it.mrp), options: it.options, imageUrl: it.imageUrl, imageKey: it.imageKey })),
    totals: { mrpTotal: num(o.mrpTotal), itemDiscount: num(o.itemDiscount), subtotal: num(o.subtotal), couponDiscount: num(o.couponDiscount), rewardDiscount: num(o.rewardDiscount), deliveryFee: num(o.deliveryFee), total: num(o.total) },
    payment: o.payment && { method: o.payment.method, status: o.payment.status, amount: num(o.payment.amount), reference: o.payment.reference, provider: o.payment.provider, simulated: o.payment.simulated, providerPaymentId: o.payment.providerPaymentId },
    events: o.events.map((e) => ({ status: e.status, label: LABEL[e.status], actor: e.actor, at: e.at })),
    nextStatus: i >= 0 && i < FLOW.length - 1 ? { value: FLOW[i + 1], label: LABEL[FLOW[i + 1]] } : null,
    canCancel: o.status !== 'DELIVERED' && o.status !== 'CANCELLED',
    returnRequests: o.returnRequests.map((r) => ({ id: r.id, kind: r.kind, status: r.status, reason: r.reason, createdAt: r.createdAt })),
  });
});

export { cancelOrderTx } from '../orders/cancel.js';

adminOrdersRouter.post('/admin/orders/:id/status', requirePermission('orders'), async (req, res) => {
  const id = String(req.params.id);
  const d = z.object({ status: z.enum(['CONFIRMED', 'PREPARING', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED']), reason: z.string().trim().max(200).optional() }).parse(req.body);
  const actor = `admin:${req.staff!.id}`;
  const out = await prisma.$transaction(async (tx) => {
    const o = await tx.order.findUnique({ where: { id }, include: { payment: true } });
    if (!o) throw notFound('Order');
    if (d.status === 'CANCELLED') {
      if (!d.reason) throw new AppError(422, 'Give a reason for cancelling', 'VALIDATION_ERROR', 'reason');
      const r = await cancelOrderTx(tx, id, actor, d.reason);
      if (r.refundNeeded) {
        const open = await tx.returnRequest.findFirst({ where: { orderId: id, status: { in: ['REQUESTED', 'APPROVED'] } } });
        if (!open) await tx.returnRequest.create({ data: { orderId: id, customerId: r.customerId, kind: 'CANCELLATION', reason: `Cancelled by store: ${d.reason}`, status: 'APPROVED', refundAmount: r.total, decidedBy: actor, decidedAt: new Date() } });
      }
      await audit(req, { action: 'order.cancel', entity: 'Order', entityId: id, summary: `Cancelled order ${r.orderNumber}: ${d.reason}`, meta: { refundNeeded: r.refundNeeded } }, tx);
      return { status: 'CANCELLED', refundNeeded: r.refundNeeded };
    }
    const i = FLOW.indexOf(o.status);
    if (i < 0 || FLOW[i + 1] !== d.status) throw new AppError(409, `An order that is ${LABEL[o.status]} cannot move to ${LABEL[d.status]}`, 'BAD_TRANSITION');
    // Guarded update: if two staff click at once, only one transition wins.
    const r = await tx.order.updateMany({ where: { id, status: o.status }, data: { status: d.status } });
    if (r.count !== 1) throw new AppError(409, 'The order was just updated by someone else. Refresh and try again.', 'BAD_TRANSITION');
    await tx.orderEvent.create({ data: { orderId: id, status: d.status, actor } });
    if (d.status === 'DELIVERED') {
      // Cash is collected at the door for COD; reward points are earned on delivery (same rule as the customer flow).
      if (o.payment?.status === 'COD_DUE') await tx.payment.update({ where: { id: o.payment.id }, data: { status: 'PAID' } });
      const rw = await getSetting('rewards');
      const already = await tx.rewardLedger.findFirst({ where: { orderId: id, note: { startsWith: 'Earned' } } });
      if (!already) await tx.rewardLedger.create({ data: { customerId: o.customerId, orderId: id, points: Math.floor(Number(o.total) * rw.earnPerRupee), note: `Earned on order ${o.number} (delivered)` } });
    }
    // The customer sees this in the app (and their order screen shows the new status on its next refresh).
    await tx.notification.create({ data: { customerId: o.customerId, kind: 'order_status', title: `Order ${o.number}: ${LABEL[d.status]}`, body: `Your order is now ${LABEL[d.status].toLowerCase()}.`, channel: 'in_app', simulated: false } });
    await audit(req, { action: 'order.status', entity: 'Order', entityId: id, summary: `Order ${o.number}: ${LABEL[o.status]} → ${LABEL[d.status]}` }, tx);
    return { status: d.status, refundNeeded: false };
  });
  // After commit: tell the customer's phone. Best effort; the inbox row above is the record.
  const who = await prisma.order.findUnique({ where: { id }, select: { customerId: true, number: true } }).catch(() => null);
  if (who) {
    const cancelled = d.status === 'CANCELLED';
    void pushOrderEvent(who.customerId, cancelled
      ? { kind: 'order_cancelled', title: `Order ${who.number} cancelled`, body: 'The store cancelled this order. Open the app for details.', orderId: id }
      : { kind: 'order_status', title: `Order ${who.number}: ${LABEL[d.status]}`, body: `Your order is now ${LABEL[d.status].toLowerCase()}.`, orderId: id });
  }
  res.json(out);
});
