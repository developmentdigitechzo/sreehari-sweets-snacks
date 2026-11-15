import { Prisma } from '@prisma/client';
import { env } from '../../config/env.js';
import { changeStock } from '../inventory/stock.js';
import { prisma } from '../../database/prisma.js';
import { AppError, notFound } from '../../utils/errors.js';
import { getSetting } from '../admin/settings.service.js';
import { activeProvider, type PaymentProvider } from './providers.js';

type Tx = Prisma.TransactionClient;
const n = (d: { toString(): string }) => Number(d.toString());

/**
 * Cancel an online order that was never paid: release stock, release the coupon use, reverse reward redemption (append-only),
 * and record the final payment + order state. Safe to call twice (the second call does nothing).
 */
export async function cancelUnpaidOrder(orderId: string, finalStatus: 'CANCELLED' | 'FAILED', reason: string): Promise<boolean> {
  const rw = await getSetting('rewards');
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { orderId } });
    if (!payment) return false;
    // Only an unpaid payment may be cancelled; this also makes the operation idempotent.
    const claimed = await tx.payment.updateMany({ where: { id: payment.id, status: { in: ['PENDING', 'PROCESSING'] } }, data: { status: finalStatus } });
    if (claimed.count !== 1) return false;
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
    for (const it of order.items) await changeStock(tx, { sku: it.sku }, it.qty, { reason: 'CANCEL', actor: `payments:${reason}`, orderId });
    const redemption = await tx.couponRedemption.findUnique({ where: { orderId } });
    if (redemption) {
      await tx.$executeRaw`UPDATE "Coupon" SET "usedCount" = GREATEST("usedCount" - 1, 0) WHERE "code" = ${redemption.couponCode}`;
      await tx.couponRedemption.delete({ where: { orderId } });
    }
    if (n(order.rewardDiscount) > 0) {
      await tx.rewardLedger.create({ data: { customerId: order.customerId, orderId, points: Math.round(n(order.rewardDiscount) / rw.pointsToRupee), note: `Reversal: order ${order.number} was not paid` } });
    }
    await tx.order.update({ where: { id: orderId }, data: { status: 'CANCELLED' } });
    await tx.orderEvent.create({ data: { orderId, status: 'CANCELLED', actor: `payments:${reason}` } });
    return true;
  });
}

/** Mark a pending/processing payment as paid (idempotent). Returns true only for the call that changed it. */
export async function confirmPayment(tx: Tx, paymentId: string, providerPaymentId?: string): Promise<boolean> {
  const rw = await getSetting('rewards');
  const claimed = await tx.payment.updateMany({ where: { id: paymentId, status: { in: ['PENDING', 'PROCESSING'] } }, data: { status: 'PAID', providerPaymentId: providerPaymentId ?? undefined } });
  if (claimed.count !== 1) return false;
  const p = await tx.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { order: true } });
  await tx.order.update({ where: { id: p.orderId }, data: { status: 'CONFIRMED' } });
  await tx.orderEvent.create({ data: { orderId: p.orderId, status: 'CONFIRMED', actor: 'payments:verified' } });
  await tx.rewardLedger.create({ data: { customerId: p.order.customerId, orderId: p.orderId, points: Math.floor(n(p.order.total) * rw.earnPerRupee), note: `Earned on order ${p.order.number}` } });
  return true;
}

/** Checkout callback: the CLIENT only reports ids + signature; the server verifies it before anything is marked paid. */
export async function verifyClientPayment(customerId: string, input: { orderId: string; paymentId: string; signature: string }, provider: PaymentProvider | null = activeProvider()) {
  if (!provider) throw new AppError(503, 'Online payments are not enabled on this server.', 'PAYMENTS_NOT_CONFIGURED');
  const payment = await prisma.payment.findFirst({ where: { orderId: input.orderId, order: { customerId } } }); // ownership in the query
  if (!payment || !payment.providerOrderId) throw notFound('Payment');
  if (!provider.verifyPaymentSignature({ providerOrderId: payment.providerOrderId, paymentId: input.paymentId, signature: input.signature })) {
    throw new AppError(400, 'Payment verification failed. If money was deducted it will be refunded automatically.', 'PAYMENT_SIGNATURE_INVALID');
  }
  // A signature proves the provider authorised this payment id; the webhook still reconciles the final captured state.
  const changed = await prisma.$transaction((tx) => confirmPayment(tx, payment.id, input.paymentId));
  const fresh = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
  return { status: fresh.status.toLowerCase(), changed };
}

export type WebhookResult = { status: 'processed' | 'duplicate' | 'ignored'; note?: string };

/** Verified, idempotent webhook processing. Throws 401 for an invalid signature (nothing is stored or changed). */
export async function processWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>, provider: PaymentProvider | null = activeProvider()): Promise<WebhookResult> {
  const rw = await getSetting('rewards');
  if (!provider) throw new AppError(503, 'Online payments are not enabled on this server.', 'PAYMENTS_NOT_CONFIGURED');
  const signature = headers['x-razorpay-signature'];
  if (!provider.verifyWebhookSignature(rawBody, Array.isArray(signature) ? signature[0] : signature)) throw new AppError(401, 'Invalid webhook signature.', 'WEBHOOK_SIGNATURE_INVALID');
  const ev = provider.parseWebhook(rawBody, headers);
  if (!ev) throw new AppError(400, 'Unreadable webhook payload.', 'WEBHOOK_BAD_PAYLOAD');

  const payment = ev.providerOrderId
    ? await prisma.payment.findUnique({ where: { providerOrderId: ev.providerOrderId } })
    : ev.providerPaymentId ? await prisma.payment.findUnique({ where: { providerPaymentId: ev.providerPaymentId } }) : null;

  // The unique providerEventId makes a replayed/duplicated delivery a no-op.
  try {
    await prisma.paymentEvent.create({ data: { provider: provider.name, providerEventId: ev.eventId, type: ev.type, paymentId: payment?.id, payload: JSON.parse(rawBody.toString('utf8')) as Prisma.InputJsonValue } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return { status: 'duplicate' };
    throw e;
  }
  const note = async (text: string) => { await prisma.paymentEvent.update({ where: { providerEventId: ev.eventId }, data: { note: text } }); };
  if (ev.type === 'ignored') return { status: 'ignored' };
  if (!payment) { await note('no matching payment'); return { status: 'ignored', note: 'no matching payment' }; }

  if (ev.type === 'payment.captured') {
    if (ev.amountPaise !== Math.round(n(payment.amount) * 100)) { await note(`amount mismatch: got ${ev.amountPaise}`); return { status: 'ignored', note: 'amount mismatch' }; }
    await prisma.$transaction((tx) => confirmPayment(tx, payment.id, ev.providerPaymentId));
    return { status: 'processed' };
  }
  if (ev.type === 'payment.failed') {
    await cancelUnpaidOrder(payment.orderId, 'FAILED', 'webhook-failed');
    return { status: 'processed' };
  }
  // refund.processed
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.payment.updateMany({ where: { id: payment.id, status: 'PAID' }, data: { status: 'REFUNDED' } });
    if (claimed.count !== 1) return;
    const order = await tx.order.findUniqueOrThrow({ where: { id: payment.orderId } });
    await tx.order.update({ where: { id: order.id }, data: { status: 'CANCELLED' } });
    await tx.orderEvent.create({ data: { orderId: order.id, status: 'CANCELLED', actor: 'payments:refund' } });
    await tx.rewardLedger.create({ data: { customerId: order.customerId, orderId: order.id, points: -Math.floor(n(order.total) * rw.earnPerRupee), note: `Reversal: order ${order.number} refunded` } });
  });
  return { status: 'processed' };
}

/** Cancels online orders that were never paid within the TTL and releases their stock. Run on a schedule. */
export async function expireStalePayments(now = new Date(), ttlMinutes = env.PAYMENT_PENDING_TTL_MINUTES): Promise<number> {
  const cutoff = new Date(now.getTime() - ttlMinutes * 60_000);
  const stale = await prisma.payment.findMany({ where: { status: { in: ['PENDING', 'PROCESSING'] }, simulated: false, createdAt: { lt: cutoff } }, select: { orderId: true } });
  let count = 0;
  for (const s of stale) if (await cancelUnpaidOrder(s.orderId, 'CANCELLED', 'expired')) count++;
  return count;
}
