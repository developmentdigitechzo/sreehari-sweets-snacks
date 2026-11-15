import { Router } from 'express';
import { categoryImageKey } from './imageUrls.js';
import { prisma } from '../../database/prisma.js';
import { notFound } from '../../utils/errors.js';
import { getSetting } from '../admin/settings.service.js';
import { SLOTS, resolveSlot } from '../orders/slots.js';
import { catalogVersion } from '../sync/changes.js';

const NEW_DAYS = 14;

/** A collection named like a root category also covers that category's whole branch, so new subcategories and parent-category products are never left out. */
function expandCollection(ids: string[], collectionId: string, cats: { id: string; parentId: string | null }[]) {
  const out = new Set(ids);
  if (cats.some((x) => x.id === collectionId && !x.parentId)) {
    out.add(collectionId);
    for (let grew = true; grew; ) {
      grew = false;
      for (const x of cats) if (x.parentId && out.has(x.parentId) && !out.has(x.id)) { out.add(x.id); grew = true; }
    }
  }
  return [...out];
}

export const catalogRouter = Router();

const num = (d: { toString(): string } | null | undefined) => (d == null ? undefined : Number(d.toString()));

/** Shapes match mobile/src/types so the app can swap mock -> live without UI changes. */
catalogRouter.get('/catalog', async (_req, res) => {
  const now = new Date();
  const delivery = await getSetting('delivery');
  const store = await getSetting('store');
  const [products, categories, collections, banners, popups, sections, campaigns, coupons] = await Promise.all([
    prisma.product.findMany({
      where: { isActive: true, archivedAt: null },
      include: { variants: { orderBy: { mrp: 'asc' } }, images: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.category.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.collection.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.banner.findMany({
      where: { isActive: true, placement: 'home_slider', OR: [{ startsAt: null }, { startsAt: { lte: now } }], AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }] },
      orderBy: { sortOrder: 'asc' },
    }),
    // Offer popups: only the ones that are on and within their schedule. The app shows each at most once per session.
    prisma.banner.findMany({
      where: { isActive: true, placement: 'popup', OR: [{ startsAt: null }, { startsAt: { lte: now } }], AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }] },
      orderBy: { sortOrder: 'asc' },
      take: 3,
    }),
    // Promotional sections: highlighted cards on Home.
    prisma.banner.findMany({
      where: { isActive: true, placement: 'section', OR: [{ startsAt: null }, { startsAt: { lte: now } }], AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }] },
      orderBy: { sortOrder: 'asc' },
      take: 4,
    }),
    // Campaigns that are on and inside their dates. Shown as offer cards; the linked coupon is applied from the Offers screen.
    prisma.campaign.findMany({
      where: { isActive: true, OR: [{ startsAt: null }, { startsAt: { lte: now } }], AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }] },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    prisma.coupon.findMany({ where: { isActive: true } }),
  ]);
  const toBanner = (b: (typeof banners)[number]) => ({
    id: b.id,
    eyebrow: b.eyebrow,
    title: b.title,
    accent: b.accent ?? undefined,
    cta: b.cta,
    imageKey: b.imageKey,
    imageUri: b.imageUrl ?? undefined,
    target: b.targetType === 'collection' ? { type: 'collection', id: b.targetId } : b.targetType === 'offers' ? { type: 'offers' } : { type: 'search', q: b.targetId ?? '' },
  });

  res.json({
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      tagline: p.tagline,
      description: p.description,
      categoryId: p.categoryId,
      badge: p.badge ?? undefined,
      images: p.images.map((i) => ({ id: i.id, key: i.key ?? undefined, uri: i.url ?? undefined })),
      variants: p.variants.map((v) => ({ id: v.id, sku: v.sku, label: v.label, mrp: num(v.mrp), price: num(v.price), stock: v.stock, popular: v.popular })),
      tags: p.tags,
      demoRating: num(p.demoRating),
      demoRatingCount: p.demoRatingCount ?? undefined,
      highlights: p.highlights,
      // Products added in the last two weeks also appear in Home's "New" shelf without anyone having to tick a flag (computed, not stored).
      featured: { ...(p.featured as object), newArrival: (p.featured as { newArrival?: boolean }).newArrival || now.getTime() - p.createdAt.getTime() < NEW_DAYS * 86_400_000 },
      cake: p.cake ?? undefined,
    })),
    categories: categories.map((c) => ({ id: c.id, name: c.name, parentId: c.parentId, imageKey: categoryImageKey(c, new Map(categories.map((x) => [x.id, x]))), imageUri: c.imageUrl ?? undefined })),
    collections: collections.map((c) => ({ id: c.id, name: c.name, subtitle: c.subtitle, imageKey: c.imageKey, tone: c.tone, categoryIds: expandCollection(c.categoryIds, c.id, categories) })),
    banners: banners.map(toBanner),
    popups: popups.map(toBanner),
    sections: sections.map(toBanner),
    campaigns: campaigns.map((c) => ({ id: c.id, name: c.name, kind: c.kind, offerText: c.offerText, couponCode: c.couponCode ?? undefined, endsAt: c.endsAt ?? undefined, recurrence: c.recurrence ?? undefined })),
    // Usage counters and caps stay server-side; eligibility is re-evaluated at order placement.
    coupons: coupons.map((c) => ({
      code: c.code,
      title: c.title,
      description: c.description,
      type: c.type.toLowerCase(),
      value: num(c.value),
      minOrder: num(c.minOrder),
      maxDiscount: num(c.maxDiscount),
      expiresAt: c.expiresAt?.toISOString(),
      startsAt: c.startsAt?.toISOString(),
      categoryIds: c.categoryIds,
      productIds: c.productIds,
    })),
    // No timestamps in the body: an unchanged catalogue must produce identical bytes so HTTP revalidation (ETag / 304) works.
    meta: { version: catalogVersion() },
    store: { name: store.storeName, phone: store.contactPhone, email: store.contactEmail, returnWindowDays: store.returnWindowDays },
    // Reward rules the admin can edit (points earned per ₹1, ₹ value of one point). The server re-applies them at checkout.
    rewards: await getSetting('rewards'),
    // Delivery rules the admin can edit. The app uses them for its price preview; the server re-applies them when the order is placed.
    delivery: {
      freeDeliveryThreshold: delivery.freeDeliveryThreshold,
      codLimit: delivery.codLimit,
      maxAdvanceDays: delivery.maxAdvanceDays,
      cutoffMinutes: delivery.cutoffMinutes,
      slots: SLOTS.map((s) => resolveSlot(s, delivery.slots[s.id])).filter((s) => s.enabled).map(({ enabled: _on, ...s }) => s),
    },
  });
});

catalogRouter.get('/products/:id', async (req, res) => {
  const p = await prisma.product.findFirst({
    where: { id: req.params.id, isActive: true, archivedAt: null },
    include: { variants: true, images: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!p) throw notFound('Product');
  res.json({ id: p.id, name: p.name, variants: p.variants.map((v) => ({ id: v.id, label: v.label, price: num(v.price), stock: v.stock })) });
});
