/**
 * Repeatable demo seed. POC shortcut: the catalogue is imported from the mobile app's demo data so both
 * sides always show the same sample products. All of it is DEMO data, not approved Shree Hari content.
 * Run with: npm run seed   (safe to re-run; it upserts)
 */
import { PrismaClient } from '@prisma/client';
// @ts-nocheck — cross-package import of plain data; excluded from the backend tsc project on purpose.
import { BANNERS, CATEGORIES, COLLECTIONS, COUPONS, PRODUCTS } from '../../../mobile/AGENTS/src/data/seed';
import { DEMO_CONFIG } from '../../../mobile/AGENTS/src/data/config';

const prisma = new PrismaClient();

async function main() {
  // Categories: parents first, then children.
  const parents = [...new Set(CATEGORIES.map((c: any) => c.parentId).filter(Boolean))] as string[];
  for (const id of parents) {
    const col = COLLECTIONS.find((c: any) => c.id === id);
    await prisma.category.upsert({
      where: { id },
      update: {},
      create: { id, name: col?.name ?? id, imageKey: col?.imageKey ?? 'cat-sweets' },
    });
  }
  for (const [i, c] of CATEGORIES.entries()) {
    await prisma.category.upsert({
      where: { id: c.id },
      update: { name: c.name, parentId: c.parentId, imageKey: c.imageKey },
      create: { id: c.id, name: c.name, parentId: c.parentId, imageKey: c.imageKey, sortOrder: i },
    });
  }

  for (const [i, c] of COLLECTIONS.entries()) {
    const data = { name: c.name, subtitle: c.subtitle, imageKey: c.imageKey, tone: c.tone, categoryIds: c.categoryIds, sortOrder: i };
    await prisma.collection.upsert({ where: { id: c.id }, update: data, create: { id: c.id, ...data } });
  }

  for (const [i, b] of BANNERS.entries()) {
    const data = {
      eyebrow: b.eyebrow, title: b.title, accent: b.accent ?? null, cta: b.cta, imageKey: b.imageKey,
      targetType: b.target.type, targetId: b.target.type === 'collection' ? b.target.id : b.target.type === 'search' ? b.target.q : null,
      sortOrder: i,
    };
    await prisma.banner.upsert({ where: { id: b.id }, update: data, create: { id: b.id, ...data } });
  }

  for (const p of PRODUCTS) {
    const data = {
      name: p.name, tagline: p.tagline, description: p.description, categoryId: p.categoryId, badge: p.badge ?? null,
      tags: p.tags, demoRating: p.demoRating ?? null, demoRatingCount: p.demoRatingCount ?? null,
      highlights: p.highlights, featured: p.featured ?? {}, cake: p.cake ?? undefined,
    };
    await prisma.product.upsert({ where: { id: p.id }, update: data, create: { id: p.id, ...data } });
    await prisma.productImage.deleteMany({ where: { productId: p.id } });
    await prisma.productImage.createMany({ data: p.images.map((im: any, i: number) => ({ productId: p.id, key: im.key, sortOrder: i })) });
    for (const v of p.variants) {
      const vd = { productId: p.id, sku: v.sku, label: v.label, mrp: v.mrp, price: v.price, popular: !!v.popular };
      // Re-running the seed must never reset live stock: the opening stock applies only when a size is first created.
      // The store sets real counts in admin > Inventory.
      const opening = Math.max(v.stock, Number(process.env.SEED_OPENING_STOCK ?? 50));
      await prisma.productVariant.upsert({ where: { id: v.id }, update: vd, create: { id: v.id, ...vd, stock: opening } });
    }
  }

  for (const c of COUPONS) {
    const data = {
      title: c.title, description: c.description, type: c.type.toUpperCase(), value: c.value, minOrder: c.minOrder,
      maxDiscount: c.maxDiscount ?? null, expiresAt: c.expiresAt ? new Date(c.expiresAt) : null,
    };
    await prisma.coupon.upsert({ where: { code: c.code }, update: data, create: { code: c.code, ...data } });
  }

  for (const pincode of DEMO_CONFIG.serviceablePincodes) {
    await prisma.serviceablePincode.upsert({ where: { pincode }, update: { isActive: true }, create: { pincode } });
  }

  // The sample customer exists only when asked for (local testing): SEED_DEMO_CUSTOMER=true. A real store never gets one.
  if (process.env.SEED_DEMO_CUSTOMER !== 'true') {
    console.log(`Seeded ${PRODUCTS.length} products, ${COUPONS.length} coupons. No sample customer (set SEED_DEMO_CUSTOMER=true for local testing).`);
    return;
  }
  // Demo customer + opening reward ledger (append-only; only seeded once).
  const customer = await prisma.customer.upsert({
    where: { phone: '+919876543210' },
    update: {},
    create: { phone: '+919876543210', name: 'Ramesh Kumar', email: 'ramesh.demo@example.com', isDemo: true },
  });
  if ((await prisma.rewardLedger.count({ where: { customerId: customer.id } })) === 0) {
    await prisma.rewardLedger.create({ data: { customerId: customer.id, points: 463, note: 'Opening balance (demo)' } });
  }
  if ((await prisma.address.count({ where: { customerId: customer.id } })) === 0) {
    await prisma.address.createMany({
      data: [
        { customerId: customer.id, label: 'Home', name: 'Ramesh Kumar', phone: '+91 98765 43210', line1: 'No. 12, 3rd Street', area: 'Anna Nagar', city: 'Chennai', pincode: '600040', isDefault: true },
        { customerId: customer.id, label: 'Office', name: 'Ramesh Kumar', phone: '+91 98765 43210', line1: 'Blue Tower, Mount Road', area: 'Guindy', city: 'Chennai', pincode: '600032' },
      ],
    });
  }
  console.log(`Seeded ${PRODUCTS.length} products, ${COUPONS.length} coupons, demo customer ${customer.phone}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
