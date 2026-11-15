import crypto from 'node:crypto';
import { categoryImageKey, imageSrc } from '../catalog/imageUrls.js';
import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { AppError, notFound } from '../../utils/errors.js';
import { changeStock } from '../inventory/stock.js';
import { isOwnUpload } from '../sync/publicUrl.js';
import { requirePermission } from './guard.js';
import { getSetting } from './settings.service.js';
import { audit, num, paged, parsePage } from './util.js';

export const adminCatalogRouter = Router();

const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 60);

/** Only images we host (uploads) or https images may be attached. Blocks javascript:/data: and plain-http hotlinks. */
const imageUrl = z.string().trim().max(500).refine((u) => isOwnUpload(u) || /^https:\/\/[^\s]+$/.test(u), 'Use an uploaded image or an https URL');

const cakeSchema = z.object({
  flavours: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  allowsMessage: z.boolean(),
  messageMaxLength: z.number().int().min(0).max(80),
  notice: z.string().trim().max(300),
});

const variantInput = z.object({
  id: z.string().optional(),
  sku: z.string().trim().min(3).max(40).regex(/^[A-Za-z0-9._-]+$/, 'Letters, numbers, . _ - only'),
  label: z.string().trim().min(1).max(40),
  mrp: z.number().min(0).max(1_000_000),
  price: z.number().min(0).max(1_000_000),
  popular: z.boolean().default(false),
  /** Opening stock for NEW variants only. Existing stock changes go through Inventory, so history stays complete. */
  stock: z.number().int().min(0).max(1_000_000).default(0),
});

const productInput = z.object({
  name: z.string().trim().min(2).max(100),
  tagline: z.string().trim().max(160).default(''),
  description: z.string().trim().max(2000).default(''),
  categoryId: z.string().min(1),
  badge: z.string().trim().max(24).nullish(),
  tags: z.array(z.string().trim().min(1).max(30)).max(20).default([]),
  highlights: z.array(z.object({ icon: z.string().max(40), label: z.string().max(60) })).max(8).default([]),
  featured: z.object({ bestseller: z.boolean().optional(), newArrival: z.boolean().optional(), festive: z.boolean().optional() }).default({}),
  cake: cakeSchema.nullish(),
  isActive: z.boolean().default(true),
  images: z.array(z.object({ id: z.string().optional(), url: imageUrl.optional() })).max(8).default([]),
  variants: z.array(variantInput).min(1).max(12),
});
type ProductInput = z.infer<typeof productInput>;

/** Products live in the most specific category. Saving one in a parent such as Sweets would hide it from the app's category tabs. */
async function requireLeafCategory(id: string, name: string) {
  const kids = await prisma.category.findMany({ where: { parentId: id, isActive: true }, select: { name: true }, orderBy: { sortOrder: 'asc' }, take: 4 });
  if (kids.length > 0) throw new AppError(422, `${name} has subcategories (${kids.map((k) => k.name).join(', ')}…). Choose one of them.`, 'VALIDATION_ERROR', 'categoryId');
}

function checkVariants(vs: ProductInput['variants']) {
  const skus = new Set<string>();
  for (const v of vs) {
    if (v.price > v.mrp) throw new AppError(422, `${v.label}: selling price cannot be above MRP`, 'VALIDATION_ERROR', 'price');
    const k = v.sku.toUpperCase();
    if (skus.has(k)) throw new AppError(422, `Duplicate SKU ${v.sku}`, 'VALIDATION_ERROR', 'sku');
    skus.add(k);
  }
}

const productInclude = { variants: { orderBy: { mrp: 'asc' as const } }, images: { orderBy: { sortOrder: 'asc' as const } }, category: { select: { id: true, name: true, parentId: true, imageKey: true, imageUrl: true } } };
type ProductRow = Awaited<ReturnType<typeof loadProducts>>[number];
const loadProducts = () => prisma.product.findMany({ include: productInclude, orderBy: { createdAt: 'desc' } });

function view(p: ProductRow, lowAt: number) {
  const stocks = p.variants.map((v) => v.stock);
  const total = stocks.reduce((a, b) => a + b, 0);
  const prices = p.variants.map((v) => num(v.price)!);
  // Same idea as the Inventory page, which counts per size: "out" = nothing left to sell, "low" = at least one size needs restocking.
  const stockStatus = total === 0 ? 'out' : stocks.some((s) => s <= lowAt) ? 'low' : 'ok';
  const status = p.archivedAt ? 'archived' : p.isActive ? 'active' : 'inactive';
  return {
    id: p.id, name: p.name, tagline: p.tagline, description: p.description, categoryId: p.categoryId, category: p.category.name,
    badge: p.badge, tags: p.tags, highlights: p.highlights, featured: p.featured, cake: p.cake, isActive: p.isActive, status,
    archivedAt: p.archivedAt, createdAt: p.createdAt, updatedAt: p.updatedAt,
    image: p.images[0] ? (p.images[0].url ?? null) : null,
    imageKey: p.images[0]?.key ?? null,
    // What the admin list shows: the uploaded photo, else the picture bundled with the app, else the category's picture.
    thumbUrl: p.images[0] ? imageSrc(p.images[0].url, p.images[0].key) : imageSrc(p.category.imageUrl, p.category.imageKey),
    images: p.images.map((i) => ({ id: i.id, url: i.url, key: i.key })),
    variants: p.variants.map((v) => ({ id: v.id, sku: v.sku, label: v.label, mrp: num(v.mrp)!, price: num(v.price)!, stock: v.stock, popular: v.popular })),
    sku: p.variants[0]?.sku ?? '', priceMin: Math.min(...prices), priceMax: Math.max(...prices), totalStock: total, stockStatus,
  };
}

/* ---------- Products ---------- */
adminCatalogRouter.get('/admin/products', requirePermission('catalog'), async (req, res) => {
  const p = parsePage(req);
  const f = z
    .object({
      status: z.enum(['all', 'active', 'inactive', 'low', 'out', 'archived']).default('all'),
      categoryId: z.string().optional(),
      type: z.enum(['all', 'cake']).default('all'),
      sort: z.enum(['newest', 'name', 'stock', 'price']).default('newest'),
      dir: z.enum(['asc', 'desc']).optional(),
    })
    .parse(req.query);
  const lowAt = (await getSetting('store')).lowStockThreshold;
  let rows = (await loadProducts()).map((r) => view(r, lowAt));
  const live = rows.filter((r) => r.status !== 'archived');
  const counts = {
    total: live.length, active: live.filter((r) => r.status === 'active').length, inactive: live.filter((r) => r.status === 'inactive').length,
    low: live.filter((r) => r.stockStatus === 'low').length, out: live.filter((r) => r.stockStatus === 'out').length, archived: rows.length - live.length,
  };
  rows = f.status === 'archived' ? rows.filter((r) => r.status === 'archived') : live.filter((r) => (f.status === 'all' ? true : f.status === 'low' || f.status === 'out' ? r.stockStatus === f.status : r.status === f.status));
  if (f.categoryId) rows = rows.filter((r) => r.categoryId === f.categoryId);
  if (f.type === 'cake') rows = rows.filter((r) => r.cake != null);
  if (p.q) {
    const q = p.q.toLowerCase();
    rows = rows.filter((r) => r.name.toLowerCase().includes(q) || r.category.toLowerCase().includes(q) || r.variants.some((v) => v.sku.toLowerCase().includes(q)));
  }
  const dir = f.dir ?? (f.sort === 'name' ? 'asc' : 'desc');
  const key = { newest: (r: (typeof rows)[number]) => r.createdAt.getTime(), name: (r: (typeof rows)[number]) => r.name.toLowerCase(), stock: (r: (typeof rows)[number]) => r.totalStock, price: (r: (typeof rows)[number]) => r.priceMin }[f.sort];
  rows.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0) * (dir === 'asc' ? 1 : -1));
  const total = rows.length;
  res.json({ ...paged(rows.slice(p.skip, p.skip + p.take), total, p), counts });
});

adminCatalogRouter.get('/admin/products/:id', requirePermission('catalog'), async (req, res) => {
  const row = await prisma.product.findUnique({ where: { id: String(req.params.id) }, include: productInclude });
  if (!row) throw notFound('Product');
  res.json(view(row, (await getSetting('store')).lowStockThreshold));
});

async function syncImages(tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], productId: string, images: ProductInput['images']) {
  const existing = await tx.productImage.findMany({ where: { productId } });
  const keep = new Set(images.filter((i) => i.id && existing.some((e) => e.id === i.id)).map((i) => i.id!));
  await tx.productImage.deleteMany({ where: { productId, id: { notIn: [...keep] } } });
  let order = 0;
  for (const im of images) {
    if (im.id && keep.has(im.id)) await tx.productImage.update({ where: { id: im.id }, data: { sortOrder: order++ } });
    else if (im.url) await tx.productImage.create({ data: { productId, url: im.url, sortOrder: order++ } });
  }
}

adminCatalogRouter.post('/admin/products', requirePermission('catalog'), async (req, res) => {
  const d = productInput.parse(req.body);
  checkVariants(d.variants);
  const cat = await prisma.category.findUnique({ where: { id: d.categoryId } });
  if (!cat) throw new AppError(422, 'Choose an existing category', 'VALIDATION_ERROR', 'categoryId');
  await requireLeafCategory(cat.id, cat.name);
  let id = slug(d.name);
  if (!id) throw new AppError(422, 'Name must contain letters or numbers', 'VALIDATION_ERROR', 'name');
  if (await prisma.product.findUnique({ where: { id } })) id = `${id}-${Date.now().toString(36).slice(-4)}`;
  const skuTaken = await prisma.productVariant.findFirst({ where: { sku: { in: d.variants.map((v) => v.sku) } } });
  if (skuTaken) throw new AppError(409, `SKU ${skuTaken.sku} is already used`, 'CONFLICT', 'sku');
  await prisma.$transaction(async (tx) => {
    await tx.product.create({
      data: { id, name: d.name, tagline: d.tagline, description: d.description, categoryId: d.categoryId, badge: d.badge ?? null, tags: d.tags, highlights: d.highlights, featured: d.featured, cake: d.cake ?? undefined, isActive: d.isActive },
    });
    for (const v of d.variants) {
      const vid = `${id}-${slug(v.label) || 'std'}`;
      await tx.productVariant.create({ data: { id: vid, productId: id, sku: v.sku, label: v.label, mrp: v.mrp, price: v.price, popular: v.popular, stock: 0 } });
      if (v.stock > 0) await changeStock(tx, { id: vid }, v.stock, { reason: 'RESTOCK', actor: `admin:${req.staff!.id}`, note: 'Opening stock' });
    }
    await syncImages(tx, id, d.images);
    await audit(req, { action: 'product.create', entity: 'Product', entityId: id, summary: `Created product ${d.name}` }, tx);
  });
  res.status(201).json(view(await prisma.product.findUniqueOrThrow({ where: { id }, include: productInclude }), (await getSetting('store')).lowStockThreshold));
});

adminCatalogRouter.put('/admin/products/:id', requirePermission('catalog'), async (req, res) => {
  const id = String(req.params.id);
  const d = productInput.parse(req.body);
  checkVariants(d.variants);
  const cur = await prisma.product.findUnique({ where: { id }, include: { variants: true } });
  if (!cur) throw notFound('Product');
  if (cur.archivedAt) throw new AppError(409, 'Restore the product before editing it', 'CONFLICT');
  const chosen = await prisma.category.findUnique({ where: { id: d.categoryId } });
  if (!chosen) throw new AppError(422, 'Choose an existing category', 'VALIDATION_ERROR', 'categoryId');
  // Keep an existing product where it is, but a product moved or saved into a parent category is refused.
  if (cur.categoryId !== d.categoryId) await requireLeafCategory(chosen.id, chosen.name);
  const mine = new Set(cur.variants.map((v) => v.id));
  const skuTaken = await prisma.productVariant.findFirst({ where: { sku: { in: d.variants.map((v) => v.sku) }, NOT: { id: { in: [...mine] } } } });
  if (skuTaken) throw new AppError(409, `SKU ${skuTaken.sku} is already used`, 'CONFLICT', 'sku');
  for (const v of d.variants) if (v.id && !mine.has(v.id)) throw new AppError(422, 'Unknown variant', 'VALIDATION_ERROR');
  const before = { price: cur.variants.map((v) => `${v.label}:${v.price}`).join(', '), isActive: cur.isActive };
  await prisma.$transaction(async (tx) => {
    await tx.product.update({
      where: { id },
      data: { name: d.name, tagline: d.tagline, description: d.description, categoryId: d.categoryId, badge: d.badge ?? null, tags: d.tags, highlights: d.highlights, featured: d.featured, cake: d.cake ?? Prisma.DbNull, isActive: d.isActive },
    });
    for (const v of d.variants) {
      if (v.id) await tx.productVariant.update({ where: { id: v.id }, data: { sku: v.sku, label: v.label, mrp: v.mrp, price: v.price, popular: v.popular } });
      else {
        const vid = `${id}-${slug(v.label) || 'std'}-${Date.now().toString(36).slice(-3)}`;
        await tx.productVariant.create({ data: { id: vid, productId: id, sku: v.sku, label: v.label, mrp: v.mrp, price: v.price, popular: v.popular, stock: 0 } });
        if (v.stock > 0) await changeStock(tx, { id: vid }, v.stock, { reason: 'RESTOCK', actor: `admin:${req.staff!.id}`, note: 'Opening stock' });
      }
    }
    await syncImages(tx, id, d.images);
    await audit(req, { action: 'product.update', entity: 'Product', entityId: id, summary: `Updated product ${d.name}`, meta: { before, after: { price: d.variants.map((v) => `${v.label}:${v.price}`).join(', '), isActive: d.isActive } } }, tx);
  });
  res.json(view(await prisma.product.findUniqueOrThrow({ where: { id }, include: productInclude }), (await getSetting('store')).lowStockThreshold));
});

/** Quick toggles used by list rows: publish/unpublish and featured flags. */
adminCatalogRouter.patch('/admin/products/:id', requirePermission('catalog'), async (req, res) => {
  const id = String(req.params.id);
  const d = z.object({ isActive: z.boolean().optional(), featured: z.object({ bestseller: z.boolean().optional(), newArrival: z.boolean().optional(), festive: z.boolean().optional() }).optional() }).parse(req.body);
  const cur = await prisma.product.findUnique({ where: { id } });
  if (!cur) throw notFound('Product');
  if (cur.archivedAt) throw new AppError(409, 'Archived products cannot be changed', 'CONFLICT');
  await prisma.product.update({ where: { id }, data: { isActive: d.isActive, featured: d.featured ? { ...(cur.featured as object), ...d.featured } : undefined } });
  await audit(req, { action: 'product.toggle', entity: 'Product', entityId: id, summary: `${cur.name}: ${d.isActive === undefined ? 'featured flags changed' : d.isActive ? 'published' : 'unpublished'}` });
  res.json({ ok: true });
});

adminCatalogRouter.post('/admin/products/:id/archive', requirePermission('catalog'), async (req, res) => {
  const id = String(req.params.id);
  const r = await prisma.product.updateMany({ where: { id, archivedAt: null }, data: { archivedAt: new Date(), isActive: false } });
  if (r.count !== 1) throw notFound('Product');
  await audit(req, { action: 'product.archive', entity: 'Product', entityId: id, summary: `Archived product ${id}` });
  res.json({ ok: true });
});
adminCatalogRouter.post('/admin/products/:id/restore', requirePermission('catalog'), async (req, res) => {
  const id = String(req.params.id);
  const r = await prisma.product.updateMany({ where: { id, archivedAt: { not: null } }, data: { archivedAt: null } });
  if (r.count !== 1) throw notFound('Archived product');
  await audit(req, { action: 'product.restore', entity: 'Product', entityId: id, summary: `Restored product ${id} (still unpublished)` });
  res.json({ ok: true });
});

adminCatalogRouter.post('/admin/products/:id/duplicate', requirePermission('catalog'), async (req, res) => {
  const src = await prisma.product.findUnique({ where: { id: String(req.params.id) }, include: { variants: true, images: true } });
  if (!src) throw notFound('Product');
  const tag = crypto.randomBytes(3).toString('hex'); // random, so two copies made close together never collide on id or SKU
  const id = `${slug(src.name)}-copy-${tag}`;
  await prisma.$transaction(async (tx) => {
    await tx.product.create({ data: { id, name: `${src.name} (copy)`, tagline: src.tagline, description: src.description, categoryId: src.categoryId, badge: src.badge, tags: src.tags, highlights: src.highlights ?? [], featured: src.featured ?? {}, cake: src.cake ?? undefined, isActive: false } });
    for (const v of src.variants) await tx.productVariant.create({ data: { id: `${id}-${slug(v.label) || 'std'}`, productId: id, sku: `${v.sku}-C${tag.toUpperCase()}`, label: v.label, mrp: v.mrp, price: v.price, popular: v.popular, stock: 0 } });
    for (const im of src.images) await tx.productImage.create({ data: { productId: id, key: im.key, url: im.url, sortOrder: im.sortOrder } });
    await audit(req, { action: 'product.duplicate', entity: 'Product', entityId: id, summary: `Duplicated ${src.name} (unpublished, stock 0)` }, tx);
  });
  res.status(201).json({ id });
});

/* ---------- Categories ---------- */
const categoryInput = z.object({
  name: z.string().trim().min(2).max(60),
  parentId: z.string().nullish(),
  imageUrl: imageUrl.nullish(),
  sortOrder: z.number().int().min(0).max(10000).default(0),
  isActive: z.boolean().default(true),
});

type CatRow = { id: string; name: string; parentId: string | null; imageKey: string; imageUrl: string | null; sortOrder: number; isActive: boolean };
const catView = (c: CatRow, products: number, byId: Map<string, CatRow> = new Map()) => ({ ...c, products, thumbUrl: imageSrc(c.imageUrl, categoryImageKey(c, byId)) });

adminCatalogRouter.get('/admin/categories', requirePermission('catalog'), async (_req, res) => {
  const [cats, counts] = await Promise.all([prisma.category.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }), prisma.product.groupBy({ by: ['categoryId'], where: { archivedAt: null }, _count: true })]);
  const n = new Map(counts.map((c) => [c.categoryId, c._count]));
  const byId = new Map(cats.map((c) => [c.id, c]));
  res.json({ items: cats.map((c) => catView(c, n.get(c.id) ?? 0, byId)) });
});

adminCatalogRouter.post('/admin/categories', requirePermission('catalog'), async (req, res) => {
  const d = categoryInput.parse(req.body);
  const id = slug(d.name);
  if (!id) throw new AppError(422, 'Name must contain letters or numbers', 'VALIDATION_ERROR', 'name');
  if (await prisma.category.findUnique({ where: { id } })) throw new AppError(409, 'A category with this name already exists', 'CONFLICT', 'name');
  if (d.parentId && !(await prisma.category.findUnique({ where: { id: d.parentId } }))) throw new AppError(422, 'Parent category not found', 'VALIDATION_ERROR', 'parentId');
  const c = await prisma.category.create({ data: { id, name: d.name, parentId: d.parentId ?? null, imageKey: 'generic', imageUrl: d.imageUrl ?? null, sortOrder: d.sortOrder, isActive: d.isActive } });
  await audit(req, { action: 'category.create', entity: 'Category', entityId: id, summary: `Created category ${d.name}` });
  res.status(201).json(catView(c, 0));
});

adminCatalogRouter.put('/admin/categories/:id', requirePermission('catalog'), async (req, res) => {
  const id = String(req.params.id);
  const d = categoryInput.parse(req.body);
  const cur = await prisma.category.findUnique({ where: { id } });
  if (!cur) throw notFound('Category');
  if (d.parentId === id) throw new AppError(422, 'A category cannot be its own parent', 'VALIDATION_ERROR', 'parentId');
  if (d.parentId) {
    // No cycles: the new parent must not be one of this category's descendants.
    let p = await prisma.category.findUnique({ where: { id: d.parentId } });
    if (!p) throw new AppError(422, 'Parent category not found', 'VALIDATION_ERROR', 'parentId');
    while (p) {
      if (p.id === id) throw new AppError(422, 'That parent is inside this category', 'VALIDATION_ERROR', 'parentId');
      p = p.parentId ? await prisma.category.findUnique({ where: { id: p.parentId } }) : null;
    }
  }
  const c = await prisma.category.update({ where: { id }, data: { name: d.name, parentId: d.parentId ?? null, imageUrl: d.imageUrl ?? null, sortOrder: d.sortOrder, isActive: d.isActive } });
  await audit(req, { action: 'category.update', entity: 'Category', entityId: id, summary: `Updated category ${d.name}${cur.isActive !== d.isActive ? (d.isActive ? ' (shown)' : ' (hidden)') : ''}` });
  res.json(catView(c, await prisma.product.count({ where: { categoryId: id, archivedAt: null } })));
});

adminCatalogRouter.delete('/admin/categories/:id', requirePermission('catalog'), async (req, res) => {
  const id = String(req.params.id);
  const [products, children] = await Promise.all([prisma.product.count({ where: { categoryId: id } }), prisma.category.count({ where: { parentId: id } })]);
  if (products > 0 || children > 0) throw new AppError(409, 'This category still has products or subcategories. Move them first, or hide the category instead.', 'CONFLICT');
  const r = await prisma.category.deleteMany({ where: { id } });
  if (r.count !== 1) throw notFound('Category');
  await audit(req, { action: 'category.delete', entity: 'Category', entityId: id, summary: `Deleted empty category ${id}` });
  res.json({ ok: true });
});

/* ---------- Cakes: the nine subcategories and each cake's sizes/flavours/message rules ---------- */
adminCatalogRouter.get('/admin/cakes', requirePermission('catalog'), async (_req, res) => {
  const lowAt = (await getSetting('store')).lowStockThreshold;
  const [subs, rows] = await Promise.all([prisma.category.findMany({ where: { parentId: 'cakes' }, orderBy: { sortOrder: 'asc' } }), loadProducts()]);
  const cakes = rows.filter((r) => r.cake != null && !r.archivedAt).map((r) => view(r, lowAt));
  res.json({
    subcategories: subs.map((s) => ({ id: s.id, name: s.name, isActive: s.isActive, count: cakes.filter((c) => c.categoryId === s.id).length })),
    cakes,
  });
});

/** Collections (home-screen groups). Read-only here; banners can open one when tapped. */
adminCatalogRouter.get('/admin/collections', requirePermission('banners'), async (_req, res) => {
  const rows = await prisma.collection.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, name: true, isActive: true } });
  res.json({ items: rows });
});
