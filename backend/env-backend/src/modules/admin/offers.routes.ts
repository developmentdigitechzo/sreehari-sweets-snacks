import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { optionalAuth } from '../../middleware/auth.js';
import { AppError, notFound } from '../../utils/errors.js';
import { isOwnUpload } from '../sync/publicUrl.js';
import { requirePermission } from './guard.js';
import { getSetting, saveSetting } from './settings.service.js';
import { audit, num, paged, parsePage, pct, range } from './util.js';

export const adminOffersRouter = Router();

const date = z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)).transform((s) => new Date(s));
const imageUrl = z.string().trim().max(500).refine((u) => isOwnUpload(u) || /^https:\/\/[^\s]+$/.test(u), 'Use an uploaded image or an https URL');

/* ---------- Coupons ---------- */
const couponInput = z
  .object({
    code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{3,20}$/, '3–20 letters or numbers'),
    title: z.string().trim().min(2).max(80),
    description: z.string().trim().max(200).default(''),
    type: z.enum(['PERCENT', 'FLAT', 'FREESHIP']),
    value: z.number().min(0).max(100000),
    minOrder: z.number().min(0).max(1_000_000).default(0),
    maxDiscount: z.number().min(0).max(1_000_000).nullish(),
    startsAt: date.nullish(),
    expiresAt: date.nullish(),
    usageLimit: z.number().int().min(1).max(10_000_000).nullish(),
    categoryIds: z.array(z.string()).max(50).default([]),
    productIds: z.array(z.string()).max(200).default([]),
    isActive: z.boolean().default(true),
  })
  .superRefine((d, ctx) => {
    if (d.type === 'PERCENT' && (d.value <= 0 || d.value > 100)) ctx.addIssue({ code: 'custom', path: ['value'], message: 'Percentage must be between 1 and 100' });
    if (d.type === 'FLAT' && d.value <= 0) ctx.addIssue({ code: 'custom', path: ['value'], message: 'Amount must be above 0' });
    if (d.startsAt && d.expiresAt && d.expiresAt <= d.startsAt) ctx.addIssue({ code: 'custom', path: ['expiresAt'], message: 'Expiry must be after the start date' });
  });

const couponView = (c: Awaited<ReturnType<typeof prisma.coupon.findFirstOrThrow>>) => {
  const now = new Date();
  const state = !c.isActive ? 'inactive' : c.startsAt && c.startsAt > now ? 'scheduled' : c.expiresAt && c.expiresAt < now ? 'expired' : c.usageLimit != null && c.usedCount >= c.usageLimit ? 'exhausted' : 'active';
  return { code: c.code, title: c.title, description: c.description, type: c.type, value: num(c.value)!, minOrder: num(c.minOrder)!, maxDiscount: num(c.maxDiscount), startsAt: c.startsAt, expiresAt: c.expiresAt, usageLimit: c.usageLimit, usedCount: c.usedCount, categoryIds: c.categoryIds, productIds: c.productIds, isActive: c.isActive, state };
};

adminOffersRouter.get('/admin/coupons', requirePermission('offers'), async (req, res) => {
  const p = parsePage(req);
  const where = p.q ? { OR: [{ code: { contains: p.q, mode: 'insensitive' as const } }, { title: { contains: p.q, mode: 'insensitive' as const } }] } : {};
  const [total, rows] = await Promise.all([prisma.coupon.count({ where }), prisma.coupon.findMany({ where, orderBy: { code: 'asc' }, skip: p.skip, take: p.take })]);
  res.json(paged(rows.map(couponView), total, p));
});

adminOffersRouter.post('/admin/coupons', requirePermission('offers'), async (req, res) => {
  const d = couponInput.parse(req.body);
  if (await prisma.coupon.findUnique({ where: { code: d.code } })) throw new AppError(409, 'This coupon code already exists', 'CONFLICT', 'code');
  const c = await prisma.coupon.create({ data: { ...d, startsAt: d.startsAt ?? null, expiresAt: d.expiresAt ?? null, maxDiscount: d.maxDiscount ?? null, usageLimit: d.usageLimit ?? null } });
  await audit(req, { action: 'coupon.create', entity: 'Coupon', entityId: c.code, summary: `Created coupon ${c.code}` });
  res.status(201).json(couponView(c));
});

adminOffersRouter.put('/admin/coupons/:code', requirePermission('offers'), async (req, res) => {
  const code = String(req.params.code).toUpperCase();
  const d = couponInput.parse({ ...req.body, code });
  const cur = await prisma.coupon.findUnique({ where: { code } });
  if (!cur) throw notFound('Coupon');
  if (d.usageLimit != null && d.usageLimit < cur.usedCount) throw new AppError(422, `Already used ${cur.usedCount} times; the limit cannot be lower`, 'VALIDATION_ERROR', 'usageLimit');
  const { code: _c, ...data } = d;
  const c = await prisma.coupon.update({ where: { code }, data: { ...data, startsAt: d.startsAt ?? null, expiresAt: d.expiresAt ?? null, maxDiscount: d.maxDiscount ?? null, usageLimit: d.usageLimit ?? null } });
  await audit(req, { action: 'coupon.update', entity: 'Coupon', entityId: code, summary: `Updated coupon ${code}` });
  res.json(couponView(c));
});

/** Coupons that were used are kept for history: turn them off instead. Unused coupons can be deleted. */
adminOffersRouter.delete('/admin/coupons/:code', requirePermission('offers'), async (req, res) => {
  const code = String(req.params.code).toUpperCase();
  const used = await prisma.couponRedemption.count({ where: { couponCode: code } });
  if (used > 0) throw new AppError(409, 'This coupon has been used on orders. Switch it off instead of deleting it.', 'CONFLICT');
  const r = await prisma.coupon.deleteMany({ where: { code } });
  if (r.count !== 1) throw notFound('Coupon');
  await audit(req, { action: 'coupon.delete', entity: 'Coupon', entityId: code, summary: `Deleted unused coupon ${code}` });
  res.json({ ok: true });
});

/* ---------- Campaigns ---------- */
const campaignInput = z
  .object({
    name: z.string().trim().min(2).max(80),
    kind: z.enum(['festive', 'flash_deal', 'acquisition', 'loyalty', 'other']),
    offerText: z.string().trim().min(2).max(120),
    couponCode: z.string().trim().toUpperCase().max(20).nullish(),
    startsAt: date.nullish(),
    endsAt: date.nullish(),
    recurrence: z.string().trim().max(60).nullish(),
    isActive: z.boolean().default(true),
  })
  .refine((d) => !d.startsAt || !d.endsAt || d.endsAt > d.startsAt, { path: ['endsAt'], message: 'End must be after the start' });

type CampaignRow = Awaited<ReturnType<typeof prisma.campaign.findFirstOrThrow>>;
function campaignState(c: CampaignRow) {
  const now = new Date();
  return !c.isActive ? 'inactive' : c.startsAt && c.startsAt > now ? 'scheduled' : c.endsAt && c.endsAt < now ? 'ended' : 'active';
}

/** Results are real: orders that used the campaign's coupon inside its window (cancelled orders excluded). */
async function results(c: CampaignRow) {
  if (!c.couponCode) return { orders: 0, revenue: 0, newCustomers: 0, tracked: false };
  const where = { couponCode: c.couponCode, status: { not: 'CANCELLED' as const }, createdAt: { gte: c.startsAt ?? undefined, lte: c.endsAt ?? undefined } };
  const [agg, firsts] = await Promise.all([prisma.order.aggregate({ where, _count: true, _sum: { total: true } }), prisma.order.findMany({ where, select: { customerId: true, customer: { select: { createdAt: true } } } })]);
  const fresh = new Set(firsts.filter((o) => !c.startsAt || o.customer.createdAt >= c.startsAt).map((o) => o.customerId));
  return { orders: agg._count, revenue: num(agg._sum.total) ?? 0, newCustomers: fresh.size, tracked: true };
}

adminOffersRouter.get('/admin/campaigns', requirePermission('offers'), async (req, res) => {
  const p = parsePage(req);
  const where = p.q ? { name: { contains: p.q, mode: 'insensitive' as const } } : {};
  const [total, rows] = await Promise.all([prisma.campaign.count({ where }), prisma.campaign.findMany({ where, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.take })]);
  const items = await Promise.all(rows.map(async (c) => ({ ...c, state: campaignState(c), results: await results(c) })));
  res.json(paged(items, total, p));
});

adminOffersRouter.post('/admin/campaigns', requirePermission('offers'), async (req, res) => {
  const d = campaignInput.parse(req.body);
  if (d.couponCode && !(await prisma.coupon.findUnique({ where: { code: d.couponCode } }))) throw new AppError(422, 'That coupon code does not exist', 'VALIDATION_ERROR', 'couponCode');
  const c = await prisma.campaign.create({ data: { ...d, couponCode: d.couponCode || null, startsAt: d.startsAt ?? null, endsAt: d.endsAt ?? null, recurrence: d.recurrence ?? null } });
  await audit(req, { action: 'campaign.create', entity: 'Campaign', entityId: c.id, summary: `Created campaign ${c.name}` });
  res.status(201).json({ ...c, state: campaignState(c) });
});

adminOffersRouter.put('/admin/campaigns/:id', requirePermission('offers'), async (req, res) => {
  const id = String(req.params.id);
  const d = campaignInput.parse(req.body);
  if (d.couponCode && !(await prisma.coupon.findUnique({ where: { code: d.couponCode } }))) throw new AppError(422, 'That coupon code does not exist', 'VALIDATION_ERROR', 'couponCode');
  if (!(await prisma.campaign.findUnique({ where: { id } }))) throw notFound('Campaign');
  const c = await prisma.campaign.update({ where: { id }, data: { ...d, couponCode: d.couponCode || null, startsAt: d.startsAt ?? null, endsAt: d.endsAt ?? null, recurrence: d.recurrence ?? null } });
  await audit(req, { action: 'campaign.update', entity: 'Campaign', entityId: id, summary: `Updated campaign ${c.name}` });
  res.json({ ...c, state: campaignState(c) });
});

adminOffersRouter.delete('/admin/campaigns/:id', requirePermission('offers'), async (req, res) => {
  const id = String(req.params.id);
  const r = await prisma.campaign.deleteMany({ where: { id } });
  if (r.count !== 1) throw notFound('Campaign');
  await audit(req, { action: 'campaign.delete', entity: 'Campaign', entityId: id, summary: 'Deleted campaign' });
  res.json({ ok: true });
});

/* ---------- Banners (App Banners / Offer Popups / Promotional Sections) ---------- */
const PLACEMENTS = ['home_slider', 'category', 'promo', 'popup', 'section'] as const;
const bannerInput = z
  .object({
    title: z.string().trim().min(2).max(80),
    eyebrow: z.string().trim().max(40).default(''),
    accent: z.string().trim().max(40).nullish(),
    cta: z.string().trim().min(1).max(24).default('Shop now'),
    placement: z.enum(PLACEMENTS),
    imageUrl: imageUrl.nullish(),
    targetType: z.enum(['collection', 'offers', 'search']),
    targetId: z.string().trim().max(80).nullish(),
    sortOrder: z.number().int().min(0).max(1000).default(0),
    startsAt: date.nullish(),
    endsAt: date.nullish(),
    isActive: z.boolean().default(true),
  })
  .refine((d) => !d.startsAt || !d.endsAt || d.endsAt > d.startsAt, { path: ['endsAt'], message: 'End must be after the start' });

type BannerRow = Awaited<ReturnType<typeof prisma.banner.findFirstOrThrow>>;
const bannerState = (b: BannerRow) => {
  const now = new Date();
  return !b.isActive ? 'inactive' : b.startsAt && b.startsAt > now ? 'scheduled' : b.endsAt && b.endsAt < now ? 'expired' : 'active';
};

adminOffersRouter.get('/admin/banners', requirePermission('banners'), async (req, res) => {
  const p = parsePage(req);
  const f = z.object({ group: z.enum(['banners', 'popups', 'sections']).default('banners') }).parse(req.query);
  const placements = f.group === 'popups' ? ['popup'] : f.group === 'sections' ? ['section'] : ['home_slider', 'category', 'promo'];
  const r = range(req);
  const where = { placement: { in: placements }, title: p.q ? { contains: p.q, mode: 'insensitive' as const } : undefined };
  const [total, rows, groups, events, evPrev] = await Promise.all([
    prisma.banner.count({ where }),
    prisma.banner.findMany({ where, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }], skip: p.skip, take: p.take }),
    prisma.banner.groupBy({ by: ['placement'], _count: true }),
    prisma.bannerEvent.groupBy({ by: ['bannerId', 'type'], where: { createdAt: { gte: r.from, lte: r.to } }, _count: true }),
    prisma.bannerEvent.groupBy({ by: ['type'], where: { createdAt: { gte: r.prevFrom, lte: r.prevTo } }, _count: true }),
  ]);
  const ev = new Map<string, { view: number; click: number }>();
  for (const e of events) {
    const x = ev.get(e.bannerId) ?? { view: 0, click: 0 };
    x[e.type === 'click' ? 'click' : 'view'] += e._count;
    ev.set(e.bannerId, x);
  }
  const sum = (t: string) => events.filter((e) => e.type === t).reduce((n, e) => n + e._count, 0);
  const prevSum = (t: string) => evPrev.find((e) => e.type === t)?._count ?? 0;
  const g = (ps: string[]) => groups.filter((x) => ps.includes(x.placement)).reduce((n, x) => n + x._count, 0);
  res.json({
    ...paged(rows.map((b) => ({ ...b, state: bannerState(b), views: ev.get(b.id)?.view ?? 0, clicks: ev.get(b.id)?.click ?? 0 })), total, p),
    counts: { banners: g(['home_slider', 'category', 'promo']), popups: g(['popup']), sections: g(['section']), campaigns: await prisma.campaign.count() },
    stats: { views: sum('view'), viewsDelta: pct(sum('view'), prevSum('view')), clicks: sum('click'), clicksDelta: pct(sum('click'), prevSum('click')) },
  });
});

adminOffersRouter.post('/admin/banners', requirePermission('banners'), async (req, res) => {
  const d = bannerInput.parse(req.body);
  if (!d.imageUrl) throw new AppError(422, 'Upload a banner image', 'VALIDATION_ERROR', 'imageUrl');
  const b = await prisma.banner.create({ data: { id: randomUUID(), ...d, imageKey: 'generic', accent: d.accent ?? null, imageUrl: d.imageUrl, targetId: d.targetId ?? null, startsAt: d.startsAt ?? null, endsAt: d.endsAt ?? null } });
  await audit(req, { action: 'banner.create', entity: 'Banner', entityId: b.id, summary: `Created banner ${b.title}` });
  res.status(201).json({ ...b, state: bannerState(b) });
});

adminOffersRouter.put('/admin/banners/:id', requirePermission('banners'), async (req, res) => {
  const id = String(req.params.id);
  const d = bannerInput.parse(req.body);
  const cur = await prisma.banner.findUnique({ where: { id } });
  if (!cur) throw notFound('Banner');
  const b = await prisma.banner.update({ where: { id }, data: { ...d, accent: d.accent ?? null, imageUrl: d.imageUrl ?? cur.imageUrl, targetId: d.targetId ?? null, startsAt: d.startsAt ?? null, endsAt: d.endsAt ?? null } });
  await audit(req, { action: 'banner.update', entity: 'Banner', entityId: id, summary: `Updated banner ${b.title}` });
  res.json({ ...b, state: bannerState(b) });
});

adminOffersRouter.post('/admin/banners/:id/duplicate', requirePermission('banners'), async (req, res) => {
  const src = await prisma.banner.findUnique({ where: { id: String(req.params.id) } });
  if (!src) throw notFound('Banner');
  const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = src;
  const b = await prisma.banner.create({ data: { ...rest, id: randomUUID(), title: `${src.title} (copy)`, isActive: false } });
  await audit(req, { action: 'banner.duplicate', entity: 'Banner', entityId: b.id, summary: `Duplicated banner ${src.title} (inactive)` });
  res.status(201).json({ id: b.id });
});

adminOffersRouter.delete('/admin/banners/:id', requirePermission('banners'), async (req, res) => {
  const id = String(req.params.id);
  const r = await prisma.banner.deleteMany({ where: { id } });
  if (r.count !== 1) throw notFound('Banner');
  await audit(req, { action: 'banner.delete', entity: 'Banner', entityId: id, summary: 'Deleted banner' });
  res.json({ ok: true });
});

/* ---------- Customer app: real impressions and taps ---------- */
const eventLimiter = rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false });
adminOffersRouter.post('/banner-events', eventLimiter, optionalAuth, async (req, res) => {
  const d = z.object({ events: z.array(z.object({ bannerId: z.string().max(80), type: z.enum(['view', 'click']) })).min(1).max(20) }).parse(req.body);
  const known = new Set((await prisma.banner.findMany({ where: { id: { in: [...new Set(d.events.map((e) => e.bannerId))] } }, select: { id: true } })).map((b) => b.id));
  // createdAt is set here (not by the database default) so impression windows never depend on the database time zone.
  const at = new Date();
  const data = d.events.filter((e) => known.has(e.bannerId)).map((e) => ({ bannerId: e.bannerId, type: e.type, customerId: req.user?.id ?? null, createdAt: at }));
  if (data.length) await prisma.bannerEvent.createMany({ data });
  res.status(202).json({ accepted: data.length });
});

/* ---------- Rewards overview ---------- */
adminOffersRouter.get('/admin/rewards', requirePermission('offers'), async (req, res) => {
  const p = parsePage(req);
  const groups = await prisma.rewardLedger.groupBy({ by: ['customerId'], _sum: { points: true }, having: { points: { _sum: { gt: 0 } } }, orderBy: { _sum: { points: 'desc' } } });
  const slice = groups.slice(p.skip, p.skip + p.take);
  const people = await prisma.customer.findMany({ where: { id: { in: slice.map((g) => g.customerId) } }, select: { id: true, name: true, phone: true } });
  const by = new Map(people.map((c) => [c.id, c]));
  const totals = await prisma.rewardLedger.aggregate({ _sum: { points: true } });
  res.json({
    ...paged(slice.map((g) => ({ customerId: g.customerId, name: by.get(g.customerId)?.name ?? '', phone: by.get(g.customerId)?.phone ?? '', points: g._sum.points ?? 0 })), groups.length, p),
    members: groups.length, outstandingPoints: totals._sum.points ?? 0,
    rules: rulesView(await getSetting('rewards')),
  });
});

/** The rules in the words the store uses: points earned per ₹100 spent, and points needed for ₹1 off. */
const rulesView = (r: { earnPerRupee: number; pointsToRupee: number }) => {
  const earnPer100 = Math.round(r.earnPerRupee * 100 * 100) / 100;
  const pointsPerRupee = Math.round((1 / r.pointsToRupee) * 100) / 100;
  return { earnPer100, pointsPerRupee, earn: `${earnPer100} points per ₹100 on delivered/paid orders`, redeem: `${pointsPerRupee} points = ₹1` };
};
adminOffersRouter.put('/admin/rewards/rules', requirePermission('offers'), async (req, res) => {
  const d = z.object({ earnPer100: z.number().min(0).max(1000), pointsPerRupee: z.number().min(0.1).max(1000) }).parse(req.body);
  await saveSetting('rewards', { earnPerRupee: d.earnPer100 / 100, pointsToRupee: 1 / d.pointsPerRupee }, req.staff!.id);
  await audit(req, { action: 'rewards.rules', entity: 'Setting', entityId: 'rewards', summary: `Rewards: ${d.earnPer100} points per ₹100, ${d.pointsPerRupee} points = ₹1`, meta: d });
  res.json(rulesView(await getSetting('rewards')));
});
