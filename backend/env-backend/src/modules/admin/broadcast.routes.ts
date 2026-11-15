import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { requireActive, requireAuth } from '../../middleware/auth.js';
import { AppError, notFound } from '../../utils/errors.js';
import { channelConnected, senderFor, type Channel, type Sender } from './broadcast.senders.js';
import { isOwnUpload } from '../sync/publicUrl.js';
import { requirePermission } from './guard.js';
import { customerIdsForRule, ensureSystemSegments, parseRule, ruleSchema } from './segments.js';
import { audit, num, paged, parsePage } from './util.js';

export const adminBroadcastRouter = Router();

const MAX_AUDIENCE = 5000;
const channel = z.enum(['in_app', 'push', 'sms', 'whatsapp']);
const imageUrl = z.string().trim().max(500).refine((u) => isOwnUpload(u) || /^https:\/\/[^\s]+$/.test(u), 'Use an uploaded image or an https URL');

/** Who would receive it. Marketing channels (push/SMS/WhatsApp) only reach customers who opted in. */
export async function audienceFor(ch: Channel, audienceType: string, segmentId?: string | null) {
  const needsOptIn = ch !== 'in_app';
  let ids: string[] | null = null;
  if (audienceType === 'segment') {
    const seg = segmentId ? await prisma.segment.findUnique({ where: { id: segmentId } }) : null;
    if (!seg) throw new AppError(422, 'Choose a segment', 'VALIDATION_ERROR', 'segmentId');
    ids = await customerIdsForRule(parseRule(seg.rule));
  }
  const where = { role: 'CUSTOMER' as const, isBlocked: false, id: ids ? { in: ids } : undefined };
  const [people, optedIn] = await Promise.all([
    prisma.customer.findMany({ where: { ...where, ...(needsOptIn ? { marketingOptIn: true } : {}) }, select: { id: true, phone: true, deviceTokens: { select: { token: true } } } }),
    needsOptIn ? prisma.customer.count({ where: { ...where, marketingOptIn: false } }) : 0,
  ]);
  return { people, excludedNoOptIn: optedIn, total: people.length + optedIn };
}

adminBroadcastRouter.post('/admin/broadcasts/audience', requirePermission('broadcast'), async (req, res) => {
  const d = z.object({ channel, audienceType: z.enum(['all', 'segment']), segmentId: z.string().nullish() }).parse(req.body);
  const a = await audienceFor(d.channel, d.audienceType, d.segmentId);
  res.json({ eligible: a.people.length, excludedNoOptIn: a.excludedNoOptIn, withoutDevice: d.channel === 'push' ? a.people.filter((p) => p.deviceTokens.length === 0).length : 0, channelConnected: channelConnected(d.channel) });
});

const broadcastInput = z
  .object({
    channel,
    title: z.string().trim().min(2).max(60),
    message: z.string().trim().min(2).max(160),
    imageUrl: imageUrl.nullish(),
    audienceType: z.enum(['all', 'segment']),
    segmentId: z.string().nullish(),
    when: z.enum(['draft', 'now', 'later']),
    scheduledAt: z.string().datetime({ offset: true }).optional(),
  })
  .superRefine((d, ctx) => {
    if (d.audienceType === 'segment' && !d.segmentId) ctx.addIssue({ code: 'custom', path: ['segmentId'], message: 'Choose a segment' });
    if (d.when === 'later' && (!d.scheduledAt || new Date(d.scheduledAt).getTime() < Date.now() + 60_000)) ctx.addIssue({ code: 'custom', path: ['scheduledAt'], message: 'Pick a time in the future' });
  });

adminBroadcastRouter.get('/admin/broadcasts', requirePermission('broadcast'), async (req, res) => {
  const p = parsePage(req);
  const f = z.object({ channel: channel.optional(), status: z.string().max(12).optional() }).parse(req.query);
  const where = { channel: f.channel, status: f.status, title: p.q ? { contains: p.q, mode: 'insensitive' as const } : undefined };
  const [total, rows, agg, segs] = await Promise.all([
    prisma.broadcast.count({ where }),
    prisma.broadcast.findMany({ where, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.take }),
    prisma.broadcast.aggregate({ _sum: { delivered: true, failed: true, targeted: true } }),
    prisma.segment.findMany({ select: { id: true, name: true } }),
  ]);
  const segName = new Map(segs.map((s) => [s.id, s.name]));
  const reads = await prisma.notification.groupBy({ by: ['broadcastId'], where: { broadcastId: { in: rows.map((r) => r.id) }, readAt: { not: null } }, _count: true });
  const readBy = new Map(reads.map((x) => [x.broadcastId, x._count]));
  const sent = agg._sum.delivered ?? 0;
  res.json({
    ...paged(rows.map((b) => ({ ...b, segmentName: b.segmentId ? segName.get(b.segmentId) ?? null : null, opened: b.channel === 'in_app' ? readBy.get(b.id) ?? 0 : null })), total, p),
    stats: { sent, failed: agg._sum.failed ?? 0, deliveryRate: sent + (agg._sum.failed ?? 0) > 0 ? Math.round((sent / (sent + (agg._sum.failed ?? 0))) * 1000) / 10 : null },
    channels: Object.fromEntries((['in_app', 'push', 'sms', 'whatsapp'] as const).map((c) => [c, channelConnected(c)])),
  });
});

/** Sends one broadcast now. Safe to call twice: only one caller can claim it, and every customer gets at most one delivery row. */
export async function runBroadcast(id: string, senderOverride?: Sender | null): Promise<{ delivered: number; failed: number; status: string }> {
  const claimed = await prisma.broadcast.updateMany({ where: { id, status: { in: ['DRAFT', 'SCHEDULED'] } }, data: { status: 'SENDING' } });
  if (claimed.count !== 1) throw new AppError(409, 'This message was already sent or is being sent', 'BAD_STATE');
  const b = await prisma.broadcast.findUniqueOrThrow({ where: { id } });
  const ch = b.channel as Channel;
  const sender = senderOverride ?? senderFor(ch);
  if (ch !== 'in_app' && !sender) {
    await prisma.broadcast.update({ where: { id }, data: { status: 'BLOCKED', error: `${ch} provider is not connected. Nothing was sent.` } });
    throw new AppError(409, `The ${ch} provider is not connected, so nothing was sent.`, 'CHANNEL_NOT_CONNECTED');
  }
  const a = await audienceFor(ch, b.audienceType, b.segmentId);
  if (a.people.length > MAX_AUDIENCE) {
    await prisma.broadcast.update({ where: { id }, data: { status: 'FAILED', error: `Audience is larger than ${MAX_AUDIENCE}. Narrow it with a segment.` } });
    throw new AppError(422, `Audience is larger than ${MAX_AUDIENCE}. Narrow it with a segment.`, 'AUDIENCE_TOO_LARGE');
  }
  let delivered = 0;
  let failed = 0;
  for (const person of a.people) {
    let status: 'SENT' | 'FAILED' = 'SENT';
    let error: string | undefined;
    let pid: string | undefined;
    if (ch === 'in_app') {
      await prisma.notification.create({ data: { customerId: person.id, kind: 'promo', title: b.title, body: b.message, channel: 'in_app', simulated: false, broadcastId: id } });
    } else {
      const r = await sender!.send({ customerId: person.id, phone: person.phone, pushTokens: person.deviceTokens.map((t) => t.token) }, { title: b.title, message: b.message, imageUrl: b.imageUrl, data: { kind: 'promo' } });
      if (r.ok) pid = r.id;
      else { status = 'FAILED'; error = r.error; }
    }
    await prisma.broadcastDelivery.upsert({ where: { broadcastId_customerId: { broadcastId: id, customerId: person.id } }, update: {}, create: { broadcastId: id, customerId: person.id, status, error, providerMessageId: pid } });
    if (status === 'SENT') delivered++; else failed++;
  }
  const final = a.people.length === 0 ? 'FAILED' : failed === 0 ? 'SENT' : delivered === 0 ? 'FAILED' : 'PARTIAL';
  await prisma.broadcast.update({ where: { id }, data: { status: final, sentAt: new Date(), targeted: a.people.length, delivered, failed, error: a.people.length === 0 ? 'No eligible customers (check opt-in and segment)' : failed > 0 ? `${failed} message(s) failed` : null } });
  return { delivered, failed, status: final };
}

adminBroadcastRouter.post('/admin/broadcasts', requirePermission('broadcast'), async (req, res) => {
  const d = broadcastInput.parse(req.body);
  if (d.when !== 'draft' && !channelConnected(d.channel)) {
    throw new AppError(409, `The ${d.channel} provider is not connected, so this cannot be sent. Save it as a draft, or connect the provider (see the setup guide).`, 'CHANNEL_NOT_CONNECTED');
  }
  const b = await prisma.broadcast.create({
    data: { channel: d.channel, title: d.title, message: d.message, imageUrl: d.imageUrl ?? null, audienceType: d.audienceType, segmentId: d.segmentId ?? null, status: d.when === 'later' ? 'SCHEDULED' : 'DRAFT', scheduledAt: d.when === 'later' ? new Date(d.scheduledAt!) : null, createdBy: req.staff!.id },
  });
  if (d.segmentId) await prisma.segment.update({ where: { id: d.segmentId }, data: { lastUsedAt: new Date() } });
  await audit(req, { action: `broadcast.${d.when}`, entity: 'Broadcast', entityId: b.id, summary: `${d.when === 'draft' ? 'Saved' : d.when === 'now' ? 'Sent' : 'Scheduled'} ${d.channel} message "${d.title}"` });
  if (d.when === 'now') {
    const r = await runBroadcast(b.id);
    res.status(201).json({ id: b.id, ...r });
    return;
  }
  res.status(201).json({ id: b.id, status: b.status });
});

adminBroadcastRouter.post('/admin/broadcasts/:id/send', requirePermission('broadcast'), async (req, res) => {
  const id = String(req.params.id);
  const b = await prisma.broadcast.findUnique({ where: { id } });
  if (!b) throw notFound('Message');
  const r = await runBroadcast(id);
  await audit(req, { action: 'broadcast.send', entity: 'Broadcast', entityId: id, summary: `Sent ${b.channel} message "${b.title}": ${r.delivered} delivered, ${r.failed} failed` });
  res.json(r);
});

adminBroadcastRouter.delete('/admin/broadcasts/:id', requirePermission('broadcast'), async (req, res) => {
  const id = String(req.params.id);
  const r = await prisma.broadcast.deleteMany({ where: { id, status: { in: ['DRAFT', 'SCHEDULED', 'BLOCKED'] } } });
  if (r.count !== 1) throw new AppError(409, 'Only drafts and scheduled messages can be deleted', 'BAD_STATE');
  await audit(req, { action: 'broadcast.delete', entity: 'Broadcast', entityId: id, summary: 'Deleted unsent message' });
  res.json({ ok: true });
});

/** Sends scheduled messages that are due. Called by the server's timer and by `npm run jobs:send-scheduled`. */
export async function processDueBroadcasts() {
  const due = await prisma.broadcast.findMany({ where: { status: 'SCHEDULED', scheduledAt: { lte: new Date() } }, select: { id: true }, take: 20 });
  for (const b of due) await runBroadcast(b.id).catch(() => undefined);
  return due.length;
}

/* ---------- Templates ---------- */
const templateInput = z.object({ name: z.string().trim().min(2).max(60), channel, title: z.string().trim().min(2).max(60), body: z.string().trim().min(2).max(160) });
adminBroadcastRouter.get('/admin/message-templates', requirePermission('broadcast'), async (_req, res) => {
  res.json({ items: await prisma.messageTemplate.findMany({ orderBy: { createdAt: 'desc' } }) });
});
adminBroadcastRouter.post('/admin/message-templates', requirePermission('broadcast'), async (req, res) => {
  const t = await prisma.messageTemplate.create({ data: templateInput.parse(req.body) });
  await audit(req, { action: 'template.create', entity: 'MessageTemplate', entityId: t.id, summary: `Saved template ${t.name}` });
  res.status(201).json(t);
});
adminBroadcastRouter.delete('/admin/message-templates/:id', requirePermission('broadcast'), async (req, res) => {
  const r = await prisma.messageTemplate.deleteMany({ where: { id: String(req.params.id) } });
  if (r.count !== 1) throw notFound('Template');
  res.json({ ok: true });
});

/* ---------- Segments ---------- */
adminBroadcastRouter.get('/admin/segments', requirePermission('customers'), async (_req, res) => {
  await ensureSystemSegments();
  const segs = await prisma.segment.findMany({ orderBy: [{ isSystem: 'desc' }, { createdAt: 'asc' }] });
  const items = await Promise.all(segs.map(async (s) => ({ id: s.id, name: s.name, description: s.description, rule: s.rule, isSystem: s.isSystem, lastUsedAt: s.lastUsedAt, customers: (await customerIdsForRule(parseRule(s.rule))).length })));
  res.json({ items, totalCustomers: await prisma.customer.count({ where: { role: 'CUSTOMER', isBlocked: false } }) });
});

const segmentInput = z.object({ name: z.string().trim().min(2).max(60), description: z.string().trim().max(160).default(''), rule: ruleSchema });
adminBroadcastRouter.post('/admin/segments', requirePermission('customers'), async (req, res) => {
  const d = segmentInput.parse(req.body);
  if (Object.keys(d.rule).length === 0) throw new AppError(422, 'Add at least one condition', 'VALIDATION_ERROR', 'rule');
  if (await prisma.segment.findUnique({ where: { name: d.name } })) throw new AppError(409, 'A segment with this name exists', 'CONFLICT', 'name');
  const s = await prisma.segment.create({ data: d });
  await audit(req, { action: 'segment.create', entity: 'Segment', entityId: s.id, summary: `Created segment ${s.name}` });
  res.status(201).json(s);
});
adminBroadcastRouter.put('/admin/segments/:id', requirePermission('customers'), async (req, res) => {
  const id = String(req.params.id);
  const d = segmentInput.parse(req.body);
  if (Object.keys(d.rule).length === 0) throw new AppError(422, 'Add at least one condition', 'VALIDATION_ERROR', 'rule');
  const cur = await prisma.segment.findUnique({ where: { id } });
  if (!cur) throw notFound('Segment');
  const s = await prisma.segment.update({ where: { id }, data: d });
  await audit(req, { action: 'segment.update', entity: 'Segment', entityId: id, summary: `Updated segment ${s.name}` });
  res.json(s);
});
adminBroadcastRouter.delete('/admin/segments/:id', requirePermission('customers'), async (req, res) => {
  const id = String(req.params.id);
  const s = await prisma.segment.findUnique({ where: { id } });
  if (!s) throw notFound('Segment');
  if (s.isSystem) throw new AppError(409, 'Built-in segments cannot be deleted. Edit the rule instead.', 'CONFLICT');
  if (await prisma.broadcast.count({ where: { segmentId: id, status: { in: ['SCHEDULED', 'SENDING'] } } })) throw new AppError(409, 'A scheduled message uses this segment', 'CONFLICT');
  await prisma.segment.delete({ where: { id } });
  await audit(req, { action: 'segment.delete', entity: 'Segment', entityId: id, summary: `Deleted segment ${s.name}` });
  res.json({ ok: true });
});

adminBroadcastRouter.get('/admin/segments/:id/insights', requirePermission('customers'), async (req, res) => {
  const s = await prisma.segment.findUnique({ where: { id: String(req.params.id) } });
  if (!s) throw notFound('Segment');
  const ids = await customerIdsForRule(parseRule(s.rule));
  const [agg, firstLast] = await Promise.all([
    prisma.order.aggregate({ where: { customerId: { in: ids }, status: { not: 'CANCELLED' } }, _count: true, _sum: { total: true } }),
    prisma.order.groupBy({ by: ['customerId'], where: { customerId: { in: ids }, status: { not: 'CANCELLED' } }, _min: { createdAt: true }, _max: { createdAt: true }, _count: true }),
  ]);
  const monthly = firstLast.map((x) => { const span = Math.max(30, ((x._max.createdAt?.getTime() ?? 0) - (x._min.createdAt?.getTime() ?? 0)) + 86_400_000) / (30 * 86_400_000); return x._count / span; });
  const lastBuy = firstLast.reduce((m, x) => Math.max(m, x._max.createdAt?.getTime() ?? 0), 0);
  res.json({
    id: s.id, name: s.name, customers: ids.length,
    avgOrderValue: agg._count ? Math.round((num(agg._sum.total) ?? 0) / agg._count) : 0,
    purchaseFrequencyPerMonth: monthly.length ? Math.round((monthly.reduce((a, b) => a + b, 0) / monthly.length) * 10) / 10 : 0,
    lastPurchase: lastBuy ? new Date(lastBuy) : null,
  });
});

/* ---------- Customer app: device registration and marketing consent ---------- */
adminBroadcastRouter.post('/me/devices', requireAuth, requireActive, async (req, res) => {
  const d = z.object({ token: z.string().trim().min(10).max(200), platform: z.enum(['ios', 'android', 'web']) }).parse(req.body);
  await prisma.deviceToken.upsert({ where: { token: d.token }, update: { customerId: req.user!.id, platform: d.platform }, create: { customerId: req.user!.id, token: d.token, platform: d.platform } });
  res.status(204).end();
});
/** Sign-out: stop pushing to this phone. Only the signed-in customer's own token row can be removed. */
adminBroadcastRouter.delete('/me/devices', requireAuth, requireActive, async (req, res) => {
  const d = z.object({ token: z.string().trim().min(10).max(200) }).parse(req.body);
  await prisma.deviceToken.deleteMany({ where: { token: d.token, customerId: req.user!.id } });
  res.status(204).end();
});
adminBroadcastRouter.put('/me/marketing', requireAuth, requireActive, async (req, res) => {
  const d = z.object({ optIn: z.boolean() }).parse(req.body);
  await prisma.customer.update({ where: { id: req.user!.id }, data: { marketingOptIn: d.optIn } });
  res.json({ marketingOptIn: d.optIn });
});
adminBroadcastRouter.get('/me/notifications', requireAuth, requireActive, async (req, res) => {
  const rows = await prisma.notification.findMany({ where: { customerId: req.user!.id }, orderBy: { createdAt: 'desc' }, take: 50 });
  res.json({ items: rows.map((n) => ({ id: n.id, title: n.title, body: n.body, kind: n.kind, readAt: n.readAt, createdAt: n.createdAt })) });
});
adminBroadcastRouter.post('/me/notifications/:id/read', requireAuth, requireActive, async (req, res) => {
  await prisma.notification.updateMany({ where: { id: String(req.params.id), customerId: req.user!.id, readAt: null }, data: { readAt: new Date() } });
  res.status(204).end();
});
