import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { AppError } from '../../utils/errors.js';
import { changeStock } from '../inventory/stock.js';
import { isOwnUpload } from '../sync/publicUrl.js';
import { CATEGORY_TEMPLATE, PRODUCT_TEMPLATE, parseCsv, validateCategories, validateProducts, type ItemResult } from './csvImport.js';
import { requirePermission } from './guard.js';
import { audit, toCsv } from './util.js';

/**
 * Bulk import of categories and products from a CSV file.
 *
 *   POST /admin/import/categories   { csv, commit? }
 *   POST /admin/import/products     { csv, commit? }
 *   GET  /admin/import/template?type=categories|products
 *
 * Without `commit` the file is only checked (a preview: nothing is written). With `commit: true` the file is checked again
 * on the server and every row that passes is written, one product or category at a time, so one bad row never blocks the
 * others. Existing categories and products are skipped, never changed.
 */
export const adminImportRouter = Router();

const body = z.object({ csv: z.string().min(1, 'The file is empty').max(2_000_000, 'The file is over 2 MB'), commit: z.boolean().default(false) });

const summarise = (rows: ItemResult<unknown>[], created: number) => ({
  total: rows.length,
  ready: rows.filter((r) => r.status === 'ok').length,
  skipped: rows.filter((r) => r.status === 'skip').length,
  errors: rows.filter((r) => r.status === 'error').length,
  created,
});

function read(csv: string) {
  try {
    return parseCsv(csv);
  } catch (e) {
    throw new AppError(422, (e as Error).message, 'VALIDATION_ERROR');
  }
}

const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

adminImportRouter.get('/admin/import/template', requirePermission('catalog'), (req, res) => {
  const type = z.enum(['categories', 'products']).parse(req.query.type);
  const t = type === 'categories' ? CATEGORY_TEMPLATE : PRODUCT_TEMPLATE;
  res.type('text/csv').send(toCsv(t.headers, t.rows));
});

adminImportRouter.post('/admin/import/categories', requirePermission('catalog'), async (req, res) => {
  const { csv, commit } = body.parse(req.body);
  const { headers, rows } = read(csv);
  const existing = await prisma.category.findMany({ select: { id: true, name: true, parentId: true } });
  const checked = validateCategories(rows, headers, existing);
  if (checked.fileError) throw new AppError(422, checked.fileError, 'VALIDATION_ERROR');

  let created = 0;
  if (commit) {
    for (const r of checked.creationOrder) {
      const d = r.data!;
      try {
        await prisma.category.create({ data: { id: d.id, name: d.name, parentId: d.parentId, imageKey: 'generic', imageUrl: null, sortOrder: d.sortOrder, isActive: d.isActive } });
        r.message = 'Imported.';
        created++;
      } catch (e) {
        if (!isUnique(e)) throw e;
        r.status = 'skip'; r.message = 'Already exists.'; // created by someone else while the file was being checked
      }
    }
    await audit(req, { action: 'category.import', entity: 'Category', summary: `Imported ${created} categories from CSV (${checked.results.length} rows)`, meta: { rows: checked.results.length, created } });
  }
  res.json({ committed: commit, summary: summarise(checked.results, created), rows: checked.results.map(({ data: _d, ...r }) => r) });
});

adminImportRouter.post('/admin/import/products', requirePermission('catalog'), async (req, res) => {
  const { csv, commit } = body.parse(req.body);
  const { headers, rows } = read(csv);
  const [categories, products, variants] = await Promise.all([
    prisma.category.findMany({ select: { id: true, name: true, parentId: true, isActive: true } }),
    prisma.product.findMany({ select: { id: true, name: true } }),
    prisma.productVariant.findMany({ select: { sku: true } }),
  ]);
  const checked = validateProducts(rows, headers, {
    categories,
    productIds: new Set(products.map((p) => p.id)),
    productNames: new Set(products.map((p) => p.name.toLowerCase())),
    skus: new Set(variants.map((v) => v.sku.toUpperCase())),
    isAllowedImage: (u) => isOwnUpload(u) || /^https:\/\/[^\s]{1,480}$/.test(u),
  });
  if (checked.fileError) throw new AppError(422, checked.fileError, 'VALIDATION_ERROR');

  let created = 0;
  if (commit) {
    for (const r of checked.results) {
      const d = r.data;
      if (r.status !== 'ok' || !d) continue;
      try {
        await prisma.$transaction(async (tx) => {
          await tx.product.create({
            data: {
              id: d.id, name: d.name, tagline: d.tagline, description: d.description, categoryId: d.categoryId, badge: d.badge, tags: d.tags,
              highlights: [], featured: d.featured, isActive: d.isActive,
              cake: d.isCake ? { allowsMessage: true, messageMaxLength: 30, notice: '' } : undefined,
            },
          });
          for (const v of d.variants) {
            await tx.productVariant.create({ data: { id: v.id, productId: d.id, sku: v.sku, label: v.label, mrp: v.mrp, price: v.price, popular: false, stock: 0 } });
            if (v.stock > 0) await changeStock(tx, { id: v.id }, v.stock, { reason: 'RESTOCK', actor: `admin:${req.staff!.id}`, note: 'Opening stock (CSV import)' });
          }
          if (d.imageUrl) await tx.productImage.create({ data: { productId: d.id, url: d.imageUrl, sortOrder: 0 } });
        });
        r.message = 'Imported.';
        created++;
      } catch (e) {
        if (!isUnique(e)) throw e;
        r.status = 'error'; r.message = 'A product or SKU with this name was added while the file was being checked. Review the product list.';
      }
    }
    await audit(req, { action: 'product.import', entity: 'Product', summary: `Imported ${created} products from CSV (${checked.results.length} products)`, meta: { products: checked.results.length, created } });
  }
  res.json({ committed: commit, summary: summarise(checked.results, created), rows: checked.results.map(({ data: _d, ...r }) => r) });
});
