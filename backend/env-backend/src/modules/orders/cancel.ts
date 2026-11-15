import type { Prisma } from '@prisma/client';
import { AppError } from '../../utils/errors.js';
import { getSetting } from '../admin/settings.service.js';
import { changeStock } from '../inventory/stock.js';

/**
 * Cancel an order inside the caller's transaction (used by staff, by approved customer requests and by the customer's own cancel of a not-yet-confirmed order): stock back, coupon use released, reward redemption
 * reversed (append-only ledger), unpaid payment closed. A PAID online payment is NOT auto-refunded; a refund request is opened
 * so money only moves through the audited refund step.
 */
export async function cancelOrderTx(tx: Prisma.TransactionClient, orderId: string, actor: string, reason: string) {
  const rw = await getSetting('rewards');
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true, payment: true } });
  if (order.status === 'DELIVERED' || order.status === 'CANCELLED') throw new AppError(409, 'This order can no longer be cancelled', 'BAD_TRANSITION');
  await tx.order.update({ where: { id: orderId }, data: { status: 'CANCELLED' } });
  await tx.orderEvent.create({ data: { orderId, status: 'CANCELLED', actor } });
  for (const it of order.items) await changeStock(tx, { sku: it.sku }, it.qty, { reason: 'CANCEL', actor, orderId, note: reason });
  const red = await tx.couponRedemption.findUnique({ where: { orderId } });
  if (red) {
    await tx.$executeRaw`UPDATE "Coupon" SET "usedCount" = GREATEST("usedCount" - 1, 0) WHERE "code" = ${red.couponCode}`;
    await tx.couponRedemption.delete({ where: { orderId } });
  }
  const used = Number(order.rewardDiscount);
  if (used > 0) await tx.rewardLedger.create({ data: { customerId: order.customerId, orderId, points: Math.round(used / rw.pointsToRupee), note: `Reversal: order ${order.number} cancelled` } });
  const earned = await tx.rewardLedger.aggregate({ where: { orderId, points: { gt: 0 }, note: { startsWith: 'Earned' } }, _sum: { points: true } });
  if ((earned._sum.points ?? 0) > 0) await tx.rewardLedger.create({ data: { customerId: order.customerId, orderId, points: -(earned._sum.points ?? 0), note: `Reversal of points earned on cancelled order ${order.number}` } });
  await tx.notification.create({ data: { customerId: order.customerId, kind: 'order_cancelled', title: `Order ${order.number} cancelled`, body: reason.startsWith('Customer request') ? 'Your cancellation request was approved.' : 'The store cancelled this order. If you paid online, the store will arrange your refund.', channel: 'in_app', simulated: false } });
  let refundNeeded = false;
  if (order.payment) {
    if (order.payment.status === 'PAID') refundNeeded = true;
    else if (['PENDING', 'PROCESSING', 'COD_DUE'].includes(order.payment.status)) await tx.payment.update({ where: { id: order.payment.id }, data: { status: 'CANCELLED' } });
  }
  return { refundNeeded, orderNumber: order.number, customerId: order.customerId, total: Number(order.total) };
}
