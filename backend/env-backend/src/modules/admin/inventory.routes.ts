import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { AppError, notFound } from '../../utils/errors.js';
import { changeStock } from '../inventory/stock.js';
import { requirePermission } from './guard.js';
import { getSetting } from './settings.service.js';
import { audit, paged, parsePage, toCsv } from './util.js';

export const adminInventoryRouter = Router();

/** Stock per size (variant), with low/out flags from the configured threshold. */
adminInventoryRouter.get('/admin/inventory', requirePermission('inventory'), async (req, res) => {
  const p = parsePage(req);
  const f = z.object({ status: z.enum(['all', 'low', 'out']).default('all'), format: z.enum(['json', 'csv']).default('json') }).parse(req.query);
  const lowAt = (await getSetting('store')).lowStockThreshold;
  const variants = await prisma.productVariant.findMany({ where: { product: { archivedAt: null } }, include: { product: { select: { name: true, isActive: true, category: { select: { name: true } } } } }, orderBy: [{ stock: 'asc' }, { sku: 'asc' }] });
  const all = variants.map((v) => ({
    variantId: v.id, sku: v.sku, product: v.product.name, size: v.label, category: v.product.category.name, published: v.product.isActive, stock: v.stock,
    status: v.stock === 0 ? 'out' : v.stock <= lowAt ? 'low' : 'ok',
  }));
  const counts = { total: all.length, low: all.filter((v) => v.status === 'low').length, out: all.filter((v) => v.status === 'out').length, threshold: lowAt };
  let rows = f.status === 'all' ? all : all.filter((v) => v.status === f.status);
  if (p.q) {
    const q = p.q.toLowerCase();
    rows = rows.filter((v) => v.product.toLowerCase().includes(q) || v.sku.toLowerCase().includes(q));
  }
  if (f.format === 'csv') {
    res.type('text/csv').send(toCsv(['SKU', 'Product', 'Size', 'Category', 'Stock', 'Status'], rows.map((r) => [r.sku, r.product, r.size, r.category, r.stock, r.status])));
    return;
  }
  res.json({ ...paged(rows.slice(p.skip, p.skip + p.take), rows.length, p), counts });
});

const adjustSchema = z.object({
  mode: z.enum(['add', 'remove', 'set']),
  quantity: z.number().int().min(0).max(1_000_000),
  reason: z.enum(['RESTOCK', 'ADJUSTMENT', 'CORRECTION', 'EXPIRY']),
  note: z.string().trim().max(200).optional(),
});

/**
 * Stock adjustment. Never lets stock go below zero, and always leaves a movement row, so history explains every number.
 * `set` computes the difference from the live value inside the transaction (no lost updates).
 */
adminInventoryRouter.post('/admin/inventory/:variantId/adjust', requirePermission('inventory'), async (req, res) => {
  const variantId = String(req.params.variantId);
  const d = adjustSchema.parse(req.body);
  if (d.reason === 'RESTOCK' && d.mode === 'remove') throw new AppError(422, 'A restock cannot remove stock', 'VALIDATION_ERROR', 'reason');
  const result = await prisma.$transaction(async (tx) => {
    const v = await tx.productVariant.findUnique({ where: { id: variantId } });
    if (!v) throw notFound('Product size');
    const delta = d.mode === 'add' ? d.quantity : d.mode === 'remove' ? -d.quantity : d.quantity - v.stock;
    if (delta === 0) throw new AppError(422, 'That would not change the stock', 'VALIDATION_ERROR', 'quantity');
    const after = await changeStock(tx, { id: variantId }, delta, { reason: d.reason, actor: `admin:${req.staff!.id}`, note: d.note });
    if (after === null) throw new AppError(409, 'Stock cannot go below zero', 'OUT_OF_STOCK', 'quantity');
    await audit(req, { action: 'inventory.adjust', entity: 'ProductVariant', entityId: variantId, summary: `${v.sku}: ${v.stock} → ${after} (${d.reason})`, meta: { delta, note: d.note ?? null } }, tx);
    return { sku: v.sku, before: v.stock, after, delta };
  });
  res.json(result);
});

adminInventoryRouter.get('/admin/inventory/movements', requirePermission('inventory'), async (req, res) => {
  const p = parsePage(req);
  const f = z.object({ variantId: z.string().optional(), reason: z.string().max(20).optional(), from: z.string().optional(), to: z.string().optional(), format: z.enum(['json', 'csv']).default('json') }).parse(req.query);
  const where = {
    variantId: f.variantId, reason: f.reason,
    sku: p.q ? { contains: p.q, mode: 'insensitive' as const } : undefined,
    createdAt: f.from || f.to ? { gte: f.from ? new Date(f.from) : undefined, lte: f.to ? new Date(f.to) : undefined } : undefined,
  };
  if (f.format === 'csv') {
    const rows = await prisma.stockMovement.findMany({ where, orderBy: { createdAt: 'desc' }, take: 10000 });
    res.type('text/csv').send(toCsv(['When', 'SKU', 'Change', 'Stock after', 'Reason', 'By', 'Order', 'Note'], rows.map((r) => [r.createdAt.toISOString(), r.sku, r.delta, r.stockAfter, r.reason, r.actor, r.orderId, r.note])));
    return;
  }
  const [total, rows] = await Promise.all([prisma.stockMovement.count({ where }), prisma.stockMovement.findMany({ where, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.take })]);
  res.json(paged(rows, total, p));
});
