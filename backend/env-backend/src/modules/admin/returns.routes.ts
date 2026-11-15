import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { requireActive, requireAuth } from '../../middleware/auth.js';
import { AppError, notFound } from '../../utils/errors.js';
import { changeStock } from '../inventory/stock.js';
import { activeProvider } from '../payments/providers.js';
import { pushOrderEvent } from '../notify/transactionalPush.js';
import { requirePermission } from './guard.js';
import { cancelOrderTx } from './orders.admin.routes.js';
import { getSetting } from './settings.service.js';
import { audit, num, paged, parsePage } from './util.js';

export const returnsRouter = Router();

/* ---------- Customer side ---------- */
const requestSchema = z.object({
  kind: z.enum(['RETURN', 'CANCELLATION']),
  reason: z.string().trim().min(3).max(120),
  details: z.string().trim().max(500).optional(),
  itemIds: z.array(z.string()).max(50).optional(),
});

returnsRouter.post('/orders/:id/return-requests', requireAuth, requireActive, async (req, res) => {
  const d = requestSchema.parse(req.body);
  const order = await prisma.order.findFirst({ where: { id: String(req.params.id), customerId: req.user!.id }, include: { events: true, items: true } });
  if (!order) throw notFound('Order');
  if (d.kind === 'CANCELLATION' && !['PLACED', 'CONFIRMED', 'PREPARING', 'PACKED'].includes(order.status)) {
    throw new AppError(409, 'This order is already out for delivery or finished, so it can no longer be cancelled.', 'BAD_STATE');
  }
  if (d.kind === 'RETURN') {
    if (order.status !== 'DELIVERED') throw new AppError(409, 'Only delivered orders can be returned.', 'BAD_STATE');
    const deliveredAt = order.events.find((e) => e.status === 'DELIVERED')?.at ?? order.createdAt;
    const days = (await getSetting('store')).returnWindowDays;
    if (Date.now() - deliveredAt.getTime() > days * 86_400_000) throw new AppError(409, `Returns are accepted within ${days} day(s) of delivery.`, 'RETURN_WINDOW');
  }
  if (d.itemIds?.some((id) => !order.items.some((i) => i.id === id))) throw new AppError(422, 'Unknown item', 'VALIDATION_ERROR');
  const open = await prisma.returnRequest.findFirst({ where: { orderId: order.id, status: { in: ['REQUESTED', 'APPROVED'] } } });
  if (open) throw new AppError(409, 'There is already an open request for this order.', 'CONFLICT');
  const r = await prisma.returnRequest.create({ data: { orderId: order.id, customerId: req.user!.id, kind: d.kind, reason: d.reason, details: d.details, items: d.itemIds ?? undefined } });
  res.status(201).json({ id: r.id, status: r.status });
});

returnsRouter.get('/me/return-requests', requireAuth, requireActive, async (req, res) => {
  const rows = await prisma.returnRequest.findMany({ where: { customerId: req.user!.id }, include: { order: { select: { number: true } } }, orderBy: { createdAt: 'desc' }, take: 50 });
  res.json({ items: rows.map((r) => ({ id: r.id, orderNumber: r.order.number, kind: r.kind, status: r.status, reason: r.reason, refundAmount: num(r.refundAmount), createdAt: r.createdAt })) });
});

/* ---------- Admin side ---------- */
const view = (r: Awaited<ReturnType<typeof load>>[number]) => ({
  id: r.id, kind: r.kind, status: r.status, reason: r.reason, details: r.details, items: r.items, refundAmount: num(r.refundAmount), refundMode: r.refundMode, refundReference: r.refundReference,
  adminNote: r.adminNote, decidedAt: r.decidedAt, createdAt: r.createdAt,
  order: { id: r.order.id, number: r.order.number, total: num(r.order.total), status: r.order.status },
  customer: r.customer,
  payment: r.order.payment && { method: r.order.payment.method, status: r.order.payment.status, amount: num(r.order.payment.amount), provider: r.order.payment.provider, simulated: r.order.payment.simulated },
});
const load = (where: object, opts: { skip?: number; take?: number } = {}) =>
  prisma.returnRequest.findMany({ where, include: { order: { include: { payment: true } }, customer: { select: { id: true, name: true, phone: true } } }, orderBy: { createdAt: 'desc' }, ...opts });

returnsRouter.get('/admin/returns', requirePermission('returns'), async (req, res) => {
  const p = parsePage(req);
  const f = z.object({ status: z.enum(['REQUESTED', 'APPROVED', 'REJECTED', 'REFUNDED', 'CLOSED']).optional(), kind: z.enum(['RETURN', 'CANCELLATION']).optional() }).parse(req.query);
  const where = { status: f.status, kind: f.kind, OR: p.q ? [{ order: { number: { contains: p.q, mode: 'insensitive' as const } } }, { customer: { name: { contains: p.q, mode: 'insensitive' as const } } }] : undefined };
  const [total, rows, counts] = await Promise.all([prisma.returnRequest.count({ where }), load(where, { skip: p.skip, take: p.take }), prisma.returnRequest.groupBy({ by: ['status'], _count: true })]);
  res.json({ ...paged(rows.map(view), total, p), counts: Object.fromEntries(counts.map((c) => [c.status, c._count])) });
});

returnsRouter.get('/admin/returns/:id', requirePermission('returns'), async (req, res) => {
  const [r] = await load({ id: String(req.params.id) });
  if (!r) throw notFound('Request');
  res.json(view(r));
});

returnsRouter.post('/admin/returns/:id/decision', requirePermission('returns'), async (req, res) => {
  const id = String(req.params.id);
  const d = z
    .object({ decision: z.enum(['approve', 'reject']), note: z.string().trim().max(300).optional(), refundAmount: z.number().min(0).max(1_000_000).optional(), restock: z.boolean().default(false) })
    .parse(req.body);
  if (d.decision === 'reject' && !d.note) throw new AppError(422, 'Explain why the request is rejected', 'VALIDATION_ERROR', 'note');
  const actor = `admin:${req.staff!.id}`;
  await prisma.$transaction(async (tx) => {
    const r = await tx.returnRequest.findUnique({ where: { id }, include: { order: { include: { payment: true, items: true } } } });
    if (!r) throw notFound('Request');
    // Guarded: only a REQUESTED row can be decided, once.
    const claimed = await tx.returnRequest.updateMany({ where: { id, status: 'REQUESTED' }, data: { status: d.decision === 'approve' ? 'APPROVED' : 'REJECTED', adminNote: d.note, decidedBy: actor, decidedAt: new Date() } });
    if (claimed.count !== 1) throw new AppError(409, 'This request was already decided', 'BAD_STATE');
    if (d.decision === 'approve') {
      const paid = r.order.payment?.status === 'PAID';
      const max = Number(r.order.total);
      const amount = paid ? Math.min(d.refundAmount ?? max, max) : 0;
      if (r.kind === 'CANCELLATION') {
        if (['DELIVERED', 'CANCELLED'].includes(r.order.status)) throw new AppError(409, 'The order can no longer be cancelled', 'BAD_STATE');
        await cancelOrderTx(tx, r.orderId, actor, `Customer request: ${r.reason}`);
      } else if (d.restock) {
        for (const it of r.order.items) await changeStock(tx, { sku: it.sku }, it.qty, { reason: 'RETURN', actor, orderId: r.orderId, note: 'Returned goods restocked' });
      }
      await tx.returnRequest.update({ where: { id }, data: { refundAmount: amount > 0 ? amount : null } });
      // Nothing to refund (COD not collected / unpaid): the case is finished.
      if (amount === 0) await tx.returnRequest.update({ where: { id }, data: { status: 'CLOSED' } });
    }
    if (!(d.decision === 'approve' && r.kind === 'CANCELLATION')) {
      await tx.notification.create({ data: { customerId: r.customerId, kind: 'return_decision', title: `Order ${r.order.number}: request ${d.decision === 'approve' ? 'approved' : 'not approved'}`, body: d.decision === 'approve' ? 'Your return request was approved. Any refund is processed by the store.' : `The store could not approve this request${d.note ? ': ' + d.note : '.'}`, channel: 'in_app', simulated: false } });
    }
    await audit(req, { action: `return.${d.decision}`, entity: 'ReturnRequest', entityId: id, summary: `${d.decision === 'approve' ? 'Approved' : 'Rejected'} ${r.kind.toLowerCase()} request for order ${r.order.number}`, meta: { note: d.note ?? null } }, tx);
  });
  // After commit: tell the customer's phone. Best effort; the inbox row is the record.
  const decided = await prisma.returnRequest.findUnique({ where: { id }, select: { customerId: true, kind: true, orderId: true, order: { select: { number: true } } } }).catch(() => null);
  if (decided) {
    const approved = d.decision === 'approve';
    void pushOrderEvent(decided.customerId, approved && decided.kind === 'CANCELLATION'
      ? { kind: 'order_cancelled', title: `Order ${decided.order.number} cancelled`, body: 'Your cancellation request was approved.', orderId: decided.orderId }
      : { kind: 'return_decision', title: `Order ${decided.order.number}: request ${approved ? 'approved' : 'not approved'}`, body: approved ? 'Your request was approved. Any refund is processed by the store.' : 'Open the app for details.', orderId: decided.orderId });
  }
  const [r] = await load({ id });
  res.json(view(r));
});

/**
 * Pay the refund. Super admin only. provider = refund through the payment gateway (needs a connected provider);
 * manual = money was returned outside the system (cash/UPI/bank) and a reference is recorded.
 */
returnsRouter.post('/admin/returns/:id/refund', requirePermission('refunds'), async (req, res) => {
  const id = String(req.params.id);
  const d = z.object({ mode: z.enum(['provider', 'manual']), reference: z.string().trim().max(120).optional(), amount: z.number().positive().max(1_000_000).optional() }).parse(req.body);
  const r = await prisma.returnRequest.findUnique({ where: { id }, include: { order: { include: { payment: true } } } });
  if (!r) throw notFound('Request');
  const pay = r.order.payment;
  if (r.status !== 'APPROVED' || !pay || pay.status !== 'PAID') throw new AppError(409, 'Only an approved request with a paid order can be refunded', 'BAD_STATE');
  const amount = d.amount ?? Number(r.refundAmount ?? pay.amount);
  if (amount > Number(pay.amount)) throw new AppError(422, 'Refund cannot exceed the amount paid', 'VALIDATION_ERROR', 'amount');
  let reference = d.reference;
  if (d.mode === 'provider') {
    const provider = activeProvider();
    if (!provider?.refund || pay.simulated || !pay.providerPaymentId) {
      throw new AppError(409, 'Gateway refunds are not available for this payment (no connected payment provider, or the payment was not made through one). Record a manual refund instead.', 'PROVIDER_NOT_CONNECTED');
    }
    // Claim first so a double click cannot send two refunds; undo the claim if the gateway fails.
    const claimed = await prisma.returnRequest.updateMany({ where: { id, status: 'APPROVED' }, data: { status: 'CLOSED' } });
    if (claimed.count !== 1) throw new AppError(409, 'This refund is already being processed', 'BAD_STATE');
    try {
      reference = (await provider.refund({ providerPaymentId: pay.providerPaymentId, amountPaise: Math.round(amount * 100), receipt: `rr_${id.slice(0, 8)}` })).refundId;
    } catch (e) {
      await prisma.returnRequest.update({ where: { id }, data: { status: 'APPROVED' } });
      throw e;
    }
  } else if (!reference) {
    throw new AppError(422, 'Enter where the money was returned (receipt, UPI or bank reference)', 'VALIDATION_ERROR', 'reference');
  }
  await prisma.$transaction(async (tx) => {
    await tx.returnRequest.update({ where: { id }, data: { status: 'REFUNDED', refundMode: d.mode, refundReference: reference, refundAmount: amount } });
    if (amount >= Number(pay.amount)) await tx.payment.update({ where: { id: pay.id }, data: { status: 'REFUNDED' } });
    await tx.notification.create({ data: { customerId: r.customerId, kind: 'refund_paid', title: `Refund for order ${r.order.number}`, body: `₹${amount} was refunded.`, channel: 'in_app', simulated: false } });
    await audit(req, { action: 'refund.pay', entity: 'ReturnRequest', entityId: id, summary: `Refunded ₹${amount} for order ${r.order.number} (${d.mode})`, meta: { reference: reference ?? null, amount } }, tx);
  });
  void pushOrderEvent(r.customerId, { kind: 'refund_paid', title: `Refund for order ${r.order.number}`, body: `₹${amount} was refunded.`, orderId: r.orderId });
  res.json({ ok: true, reference, amount });
});

returnsRouter.post('/admin/returns/:id/close', requirePermission('returns'), async (req, res) => {
  const id = String(req.params.id);
  const { note } = z.object({ note: z.string().trim().max(300).optional() }).parse(req.body);
  const r = await prisma.returnRequest.updateMany({ where: { id, status: { in: ['APPROVED', 'REJECTED'] } }, data: { status: 'CLOSED', adminNote: note } });
  if (r.count !== 1) throw new AppError(409, 'Only approved or rejected requests can be closed', 'BAD_STATE');
  await audit(req, { action: 'return.close', entity: 'ReturnRequest', entityId: id, summary: 'Closed request without refund' });
  res.json({ ok: true });
});
