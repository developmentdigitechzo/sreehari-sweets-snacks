import type { Prisma } from '@prisma/client';

export type StockReason = 'ORDER' | 'CANCEL' | 'RETURN' | 'ADJUSTMENT' | 'RESTOCK' | 'CORRECTION' | 'EXPIRY';

/**
 * The only way stock changes. Decrements are conditional (never below zero, so two buyers cannot take the last unit),
 * and every change writes an append-only StockMovement row inside the same transaction.
 * Returns the new stock, or null when a decrement would go below zero (nothing is changed).
 */
export async function changeStock(
  tx: Prisma.TransactionClient,
  where: { id: string } | { sku: string },
  delta: number,
  meta: { reason: StockReason; actor: string; orderId?: string; note?: string },
): Promise<number | null> {
  if (!Number.isInteger(delta) || delta === 0) throw new Error('Stock delta must be a non-zero integer');
  const r =
    delta < 0
      ? await tx.productVariant.updateMany({ where: { ...where, stock: { gte: -delta } }, data: { stock: { decrement: -delta } } })
      : await tx.productVariant.updateMany({ where, data: { stock: { increment: delta } } });
  if (r.count !== 1) return null;
  const v = await tx.productVariant.findFirstOrThrow({ where, select: { id: true, sku: true, stock: true } });
  await tx.stockMovement.create({ data: { variantId: v.id, sku: v.sku, delta, stockAfter: v.stock, reason: meta.reason, actor: meta.actor, orderId: meta.orderId, note: meta.note } });
  return v.stock;
}
