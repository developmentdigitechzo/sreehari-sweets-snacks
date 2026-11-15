import { Router } from 'express';
import { isValidEmail } from '../auth/validators.js';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { prisma } from '../../database/prisma.js';
import { AppError, notFound } from '../../utils/errors.js';
import { SLOTS, resolveSlot, toMinutes } from '../orders/slots.js';
import { catalogVersion } from '../sync/changes.js';
import { requirePermission } from './guard.js';
import { getSetting, saveSetting } from './settings.service.js';
import { audit, num, paged, parsePage, toCsv } from './util.js';

export const adminSettingsRouter = Router();

/* ---------- Delivery: charges, COD limit, slots, PIN codes ---------- */
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a 24-hour time like 13:00');
const slotOverride = z.object({
  fee: z.number().int().min(0).max(1000).optional(),
  enabled: z.boolean().optional(),
  title: z.string().trim().min(1).max(24).optional(),
  window: z.string().trim().min(1).max(30).optional(),
  start: hhmm.optional(),
  end: hhmm.optional(),
});
const deliverySchema = z.object({
  freeDeliveryThreshold: z.number().int().min(0).max(100000),
  codLimit: z.number().int().min(0).max(100000),
  slots: z.record(z.string(), slotOverride),
  maxAdvanceDays: z.number().int().min(0).max(14).optional(),
  cutoffMinutes: z.number().int().min(0).max(720).optional(),
});

adminSettingsRouter.get('/admin/delivery', requirePermission('delivery'), async (_req, res) => {
  const d = await getSetting('delivery');
  res.json({
    freeDeliveryThreshold: d.freeDeliveryThreshold,
    codLimit: d.codLimit,
    maxAdvanceDays: d.maxAdvanceDays,
    cutoffMinutes: d.cutoffMinutes,
    slots: SLOTS.map((s) => {
      const r = resolveSlot(s, d.slots[s.id]);
      return { id: s.id, kind: s.kind, title: r.title, window: r.window, start: r.start ?? '', end: r.end ?? '', defaultTitle: s.title, defaultWindow: s.window, defaultStart: s.start ?? '', defaultEnd: s.end ?? '', defaultFee: s.fee, fee: r.fee, enabled: r.enabled };
    }),
    pincodes: (await prisma.serviceablePincode.findMany({ orderBy: { pincode: 'asc' } })).map((p) => ({ pincode: p.pincode, isActive: p.isActive })),
  });
});

adminSettingsRouter.put('/admin/delivery', requirePermission('delivery'), async (req, res) => {
  const d = deliverySchema.parse(req.body);
  const known = new Set<string>(SLOTS.map((s) => s.id));
  for (const id of Object.keys(d.slots)) if (!known.has(id)) throw new AppError(422, `Unknown slot ${id}`, 'BAD_SLOT');
  if (SLOTS.every((s) => d.slots[s.id]?.enabled === false)) throw new AppError(422, 'At least one delivery slot must stay enabled', 'BAD_SLOT');
  for (const s of SLOTS) {
    const r = resolveSlot(s, d.slots[s.id]);
    if (r.kind === 'scheduled' && r.start && r.end && toMinutes(r.end) <= toMinutes(r.start)) throw new AppError(422, `${r.title}: the end time must be after the start time`, 'BAD_SLOT');
  }
  const cur = await getSetting('delivery');
  await saveSetting('delivery', { ...d, maxAdvanceDays: d.maxAdvanceDays ?? cur.maxAdvanceDays, cutoffMinutes: d.cutoffMinutes ?? cur.cutoffMinutes }, req.staff!.id);
  await audit(req, { action: 'delivery.update', entity: 'Setting', entityId: 'delivery', summary: 'Updated delivery charges, slots and limits', meta: d });
  res.json({ ok: true });
});

const pin = z.string().trim().regex(/^[1-9]\d{5}$/, 'Enter a 6-digit PIN code');
adminSettingsRouter.post('/admin/delivery/pincodes', requirePermission('delivery'), async (req, res) => {
  const { pincode } = z.object({ pincode: pin }).parse(req.body);
  const row = await prisma.serviceablePincode.upsert({ where: { pincode }, update: { isActive: true }, create: { pincode } });
  await audit(req, { action: 'pincode.add', entity: 'ServiceablePincode', entityId: pincode, summary: `Serviceable PIN ${pincode} enabled` });
  res.status(201).json({ pincode: row.pincode, isActive: row.isActive });
});
adminSettingsRouter.patch('/admin/delivery/pincodes/:pincode', requirePermission('delivery'), async (req, res) => {
  const pincode = pin.parse(req.params.pincode);
  const { isActive } = z.object({ isActive: z.boolean() }).parse(req.body);
  const r = await prisma.serviceablePincode.updateMany({ where: { pincode }, data: { isActive } });
  if (r.count !== 1) throw notFound('PIN code');
  await audit(req, { action: 'pincode.toggle', entity: 'ServiceablePincode', entityId: pincode, summary: `PIN ${pincode} ${isActive ? 'enabled' : 'disabled'}` });
  res.json({ pincode, isActive });
});
adminSettingsRouter.delete('/admin/delivery/pincodes/:pincode', requirePermission('delivery'), async (req, res) => {
  const pincode = pin.parse(req.params.pincode);
  const r = await prisma.serviceablePincode.deleteMany({ where: { pincode } });
  if (r.count !== 1) throw notFound('PIN code');
  await audit(req, { action: 'pincode.remove', entity: 'ServiceablePincode', entityId: pincode, summary: `PIN ${pincode} removed` });
  res.json({ ok: true });
});

/* ---------- Business settings ---------- */
const storeSchema = z.object({
  storeName: z.string().trim().min(2).max(80),
  // The shop's public number may be a mobile or a landline: 7 to 15 digits, with only spaces, dashes, brackets and a leading + around them.
  contactPhone: z.string().trim().max(20).refine((v) => v === '' || (/^\+?[\d\s()-]+$/.test(v) && v.replace(/\D/g, '').length >= 7 && v.replace(/\D/g, '').length <= 15), 'Enter a valid phone number'),
  contactEmail: z.string().trim().max(120).refine((v) => v === '' || isValidEmail(v), 'Enter a valid email'),
  address: z.string().trim().max(300),
  lowStockThreshold: z.number().int().min(0).max(10000),
  returnWindowDays: z.number().int().min(0).max(60),
});
adminSettingsRouter.get('/admin/settings', requirePermission('settings'), async (_req, res) => res.json(await getSetting('store')));
adminSettingsRouter.put('/admin/settings', requirePermission('settings'), async (req, res) => {
  const d = storeSchema.parse(req.body);
  await saveSetting('store', d, req.staff!.id);
  await audit(req, { action: 'settings.update', entity: 'Setting', entityId: 'store', summary: 'Updated business settings', meta: d });
  res.json({ ok: true });
});

/* ---------- Audit log ---------- */
adminSettingsRouter.get('/admin/audit', requirePermission('audit'), async (req, res) => {
  const p = parsePage(req);
  const f = z.object({ entity: z.string().max(40).optional(), actor: z.string().max(80).optional(), from: z.string().optional(), to: z.string().optional(), format: z.enum(['json', 'csv']).default('json') }).parse(req.query);
  const where = {
    entity: f.entity || undefined,
    actorName: f.actor ? { contains: f.actor, mode: 'insensitive' as const } : undefined,
    summary: p.q ? { contains: p.q, mode: 'insensitive' as const } : undefined,
    createdAt: f.from || f.to ? { gte: f.from ? new Date(f.from) : undefined, lte: f.to ? new Date(f.to) : undefined } : undefined,
  };
  if (f.format === 'csv') {
    const rows = await prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: 5000 });
    res.type('text/csv').send(toCsv(['When', 'Who', 'Role', 'Action', 'Entity', 'Entity id', 'Summary'], rows.map((r) => [r.createdAt.toISOString(), r.actorName, r.actorRole, r.action, r.entity, r.entityId, r.summary])));
    return;
  }
  const [total, rows] = await Promise.all([prisma.auditLog.count({ where }), prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.take })]);
  res.json(paged(rows, total, p));
});

/* ---------- Payments (read-only; money movement happens through returns/refunds) ---------- */
adminSettingsRouter.get('/admin/payments', requirePermission('payments'), async (req, res) => {
  const p = parsePage(req);
  const f = z
    .object({ status: z.enum(['PAID', 'PENDING', 'PROCESSING', 'FAILED', 'CANCELLED', 'REFUNDED', 'COD_DUE']).optional(), method: z.enum(['UPI', 'CARD', 'WALLET', 'NETBANKING', 'COD']).optional() })
    .parse(req.query);
  const where = {
    status: f.status,
    method: f.method,
    OR: p.q
      ? [{ reference: { contains: p.q, mode: 'insensitive' as const } }, { order: { number: { contains: p.q, mode: 'insensitive' as const } } }, { providerPaymentId: { contains: p.q } }]
      : undefined,
  };
  const [total, rows, byStatus] = await Promise.all([
    prisma.payment.count({ where }),
    prisma.payment.findMany({ where, include: { order: { select: { number: true, customer: { select: { name: true, phone: true } } } } }, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.take }),
    prisma.payment.groupBy({ by: ['status'], _count: true, _sum: { amount: true } }),
  ]);
  const items = rows.map((r) => ({
    id: r.id, orderId: r.orderId, orderNumber: r.order.number, customer: r.order.customer.name, phone: r.order.customer.phone,
    method: r.method, status: r.status, amount: num(r.amount), provider: r.provider, simulated: r.simulated,
    reference: r.reference, providerPaymentId: r.providerPaymentId, createdAt: r.createdAt,
  }));
  res.json({ ...paged(items, total, p), summary: byStatus.map((s) => ({ status: s.status, count: s._count, amount: num(s._sum.amount) ?? 0 })) });
});

/**
 * What this API is connected to, so you can prove the admin panel and the app are on the same backend and database:
 * compare the database name and the catalogue version here with the app's Account → About screen. No password is ever shown.
 */
adminSettingsRouter.get('/admin/diagnostics', requirePermission('settings'), async (req, res) => {
  const u = new URL(env.DATABASE_URL);
  const [db, mig, products, published, orders, customers] = await Promise.all([
    prisma.$queryRaw<{ name: string; tz: string }[]>`select current_database() as name, current_setting('TimeZone') as tz`,
    prisma.$queryRaw<{ n: bigint }[]>`select count(*)::bigint as n from _prisma_migrations where finished_at is not null`,
    prisma.product.count(),
    prisma.product.count({ where: { isActive: true, archivedAt: null } }),
    prisma.order.count(),
    prisma.customer.count({ where: { role: 'CUSTOMER' } }),
  ]);
  res.json({
    database: { name: db[0].name, host: u.hostname, port: u.port || '5432', timeZone: db[0].tz, migrationsApplied: Number(mig[0].n) },
    api: { publicUrl: env.PUBLIC_URL, seenAs: `${req.protocol}://${req.get('host')}`, environment: env.NODE_ENV },
    catalogue: { version: catalogVersion(), productsTotal: products, productsPublished: published },
    counts: { orders, customers },
    serverTime: new Date().toISOString(),
  });
});

/** Which payment/message/map providers are connected. Names and booleans only, never keys. */
adminSettingsRouter.get('/admin/integrations', requirePermission('payments'), (_req, res) => {
  res.json({
    payments: { provider: env.PAYMENT_PROVIDER, connected: env.PAYMENT_PROVIDER === 'razorpay' || env.PAYMENT_PROVIDER === 'test', live: env.PAYMENT_PROVIDER === 'razorpay' },
    sms: { provider: env.OTP_PROVIDER, connected: env.OTP_PROVIDER === 'twilio' },
    email: { provider: env.EMAIL_PROVIDER, connected: env.EMAIL_PROVIDER === 'resend' },
    geocoding: { provider: env.GEOCODER_PROVIDER, connected: env.GEOCODER_PROVIDER === 'google' },
    push: { provider: env.NOTIFY_PUSH_PROVIDER, connected: env.NOTIFY_PUSH_PROVIDER === 'expo' },
    smsMarketing: { provider: env.NOTIFY_SMS_PROVIDER, connected: env.NOTIFY_SMS_PROVIDER === 'twilio' },
    whatsapp: { provider: env.NOTIFY_WHATSAPP_PROVIDER, connected: env.NOTIFY_WHATSAPP_PROVIDER === 'twilio' },
  });
});
