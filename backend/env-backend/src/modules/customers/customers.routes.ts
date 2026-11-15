import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { requireActive, requireAuth } from '../../middleware/auth.js';
import { notFound } from '../../utils/errors.js';
import { addressSchema, profileSchema } from '../auth/auth.schemas.js';
import { cleanOptions, lineKey } from '../cart/lineKey.js';

export const customersRouter = Router();
customersRouter.use(requireAuth, requireActive);

const num = (d: { toString(): string } | null) => (d == null ? undefined : Number(d.toString()));
type AddressRow = Awaited<ReturnType<typeof prisma.address.findFirstOrThrow>>;
const toClient = (a: AddressRow) => ({
  id: a.id, label: a.label, name: a.name, phone: a.phone, line1: a.line1, area: a.area, city: a.city, pincode: a.pincode,
  state: a.state ?? undefined, landmark: a.landmark ?? undefined, latitude: num(a.latitude), longitude: num(a.longitude),
  instructions: a.instructions ?? undefined, isDefault: a.isDefault,
});

/* Every query below filters by the signed-in customer's id, so one customer can never read or change another's data. */

customersRouter.get('/me', async (req, res) => {
  const c = await prisma.customer.findUnique({ where: { id: req.user!.id } });
  if (!c) throw notFound('Account');
  res.json({ id: c.id, name: c.name, phone: c.phone, email: c.email ?? undefined, emailVerified: c.email ? !!c.emailVerifiedAt : undefined, marketingOptIn: c.marketingOptIn });
});

customersRouter.patch('/me', async (req, res) => {
  const data = profileSchema.parse(req.body);
  const nextEmail = data.email === undefined ? undefined : data.email?.toLowerCase() ?? null;
  const current = nextEmail === undefined ? null : await prisma.customer.findUnique({ where: { id: req.user!.id }, select: { email: true } });
  // A different address has not been proven yet: the verified flag follows the address, not the account.
  const emailChanged = nextEmail !== undefined && current?.email !== nextEmail;
  const c = await prisma.customer.update({ where: { id: req.user!.id }, data: { name: data.name, email: nextEmail, ...(emailChanged ? { emailVerifiedAt: null } : {}) } });
  res.json({ id: c.id, name: c.name, phone: c.phone, email: c.email ?? undefined, emailVerified: c.email ? !!c.emailVerifiedAt : undefined });
});

customersRouter.get('/me/addresses', async (req, res) => {
  const rows = await prisma.address.findMany({ where: { customerId: req.user!.id }, orderBy: { createdAt: 'asc' } });
  res.json(rows.map(toClient));
});

customersRouter.post('/me/addresses', async (req, res) => {
  const a = addressSchema.parse(req.body);
  const customerId = req.user!.id;
  const created = await prisma.$transaction(async (tx) => {
    const first = (await tx.address.count({ where: { customerId } })) === 0;
    const makeDefault = a.isDefault || first;
    if (makeDefault) await tx.address.updateMany({ where: { customerId }, data: { isDefault: false } });
    return tx.address.create({ data: { ...a, customerId, isDefault: makeDefault } });
  });
  res.status(201).json(toClient(created));
});

customersRouter.put('/me/addresses/:id', async (req, res) => {
  const a = addressSchema.parse(req.body);
  const customerId = req.user!.id;
  const id = String(req.params.id);
  const owned = await prisma.address.findFirst({ where: { id, customerId } });
  if (!owned) throw notFound('Address');
  const updated = await prisma.$transaction(async (tx) => {
    if (a.isDefault) await tx.address.updateMany({ where: { customerId }, data: { isDefault: false } });
    return tx.address.update({ where: { id }, data: a });
  });
  res.json(toClient(updated));
});

customersRouter.delete('/me/addresses/:id', async (req, res) => {
  const r = await prisma.address.deleteMany({ where: { id: String(req.params.id), customerId: req.user!.id } });
  if (r.count === 0) throw notFound('Address');
  res.status(204).end();
});

/* ---------- cart persistence (the server re-checks stock; the client never sets prices) ---------- */
const optionsSchema = z.object({ flavour: z.string().max(40).optional(), message: z.string().max(60).optional() }).optional();
const cartSchema = z.object({ items: z.array(z.object({ variantId: z.string(), qty: z.number().int().min(1).max(20), options: optionsSchema })).max(50) });

customersRouter.get('/me/cart', async (req, res) => {
  const rows = await prisma.cartItem.findMany({ where: { customerId: req.user!.id }, include: { variant: true } });
  res.json({ items: rows.map((r) => ({ productId: r.variant.productId, variantId: r.variantId, qty: Math.min(r.qty, Math.max(r.variant.stock, 0)), options: (r.options as object | null) ?? undefined })).filter((i) => i.qty > 0) });
});

customersRouter.put('/me/cart', async (req, res) => {
  const { items } = cartSchema.parse(req.body);
  const customerId = req.user!.id;
  const variants = await prisma.productVariant.findMany({ where: { id: { in: items.map((i) => i.variantId) }, product: { isActive: true, archivedAt: null } } });
  // Merge identical configurations, then cap each size's TOTAL across its customised lines by stock.
  const lines = new Map<string, { variantId: string; qty: number; options?: { flavour?: string; message?: string } }>();
  for (const i of items) {
    const options = cleanOptions(i.options);
    const key = lineKey({ variantId: i.variantId, options });
    const ex = lines.get(key);
    lines.set(key, { variantId: i.variantId, qty: Math.min((ex?.qty ?? 0) + i.qty, 20), options });
  }
  const used = new Map<string, number>();
  const kept: { customerId: string; variantId: string; lineKey: string; options?: object; qty: number }[] = [];
  for (const [key, l] of lines) {
    const v = variants.find((x) => x.id === l.variantId);
    if (!v) continue;
    const qty = Math.min(l.qty, Math.max(0, v.stock - (used.get(v.id) ?? 0)));
    if (qty <= 0) continue;
    used.set(v.id, (used.get(v.id) ?? 0) + qty);
    kept.push({ customerId, variantId: v.id, lineKey: key, options: l.options, qty });
  }
  await prisma.$transaction([
    prisma.cartItem.deleteMany({ where: { customerId } }),
    prisma.cartItem.createMany({ data: kept.map((k) => ({ ...k, options: k.options ?? undefined })) }),
  ]);
  res.json({ items: kept.map(({ variantId, qty, options }) => ({ variantId, qty, options })) });
});

/** Reward balance and history from the append-only ledger (the same ledger checkout uses to validate redemption). */
customersRouter.get('/me/rewards', async (req, res) => {
  const rows = await prisma.rewardLedger.findMany({ where: { customerId: req.user!.id }, orderBy: { createdAt: 'desc' }, take: 100 });
  const sum = await prisma.rewardLedger.aggregate({ where: { customerId: req.user!.id }, _sum: { points: true } });
  res.json({ balance: sum._sum.points ?? 0, entries: rows.map((r) => ({ id: r.id, at: r.createdAt.toISOString(), note: r.note, points: r.points })) });
});
