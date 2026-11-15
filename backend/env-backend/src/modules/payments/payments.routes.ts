import { Router, type RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { AppError, notFound } from '../../utils/errors.js';
import { cancelUnpaidOrder, expireStalePayments, processWebhook, verifyClientPayment } from './payments.service.js';

export const paymentsRouter = Router();

/** Provider webhooks. Mounted with a RAW body parser in app.ts: the signature is computed over the exact bytes received. */
export const webhookHandler: RequestHandler = async (req, res) => {
  if (!Buffer.isBuffer(req.body)) throw new AppError(400, 'Unreadable webhook payload.', 'WEBHOOK_BAD_PAYLOAD');
  const result = await processWebhook(req.body, req.headers);
  res.status(200).json(result); // 2xx tells the provider not to retry (also for duplicates)
};

const verifySchema = z.object({ orderId: z.string(), paymentId: z.string().min(3).max(100), signature: z.string().min(10).max(200) });

paymentsRouter.post('/payments/verify', requireAuth, rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false }), async (req, res) => {
  const input = verifySchema.parse(req.body);
  res.json(await verifyClientPayment(req.user!.id, input));
});

/** Customer abandons or cancels an unpaid online payment: stock is released, nothing was charged. */
paymentsRouter.post('/payments/:orderId/cancel', requireAuth, async (req, res) => {
  const orderId = String(req.params.orderId);
  const p = await prisma.payment.findFirst({ where: { orderId, order: { customerId: req.user!.id } } });
  if (!p) throw notFound('Payment');
  const cancelled = await cancelUnpaidOrder(orderId, 'CANCELLED', 'customer');
  res.json({ cancelled, status: (await prisma.payment.findUniqueOrThrow({ where: { id: p.id } })).status.toLowerCase() });
});

/** Truthful payment state, owner only. The app polls this after checkout instead of trusting the client. */
paymentsRouter.get('/payments/:orderId/status', requireAuth, async (req, res) => {
  const p = await prisma.payment.findFirst({ where: { orderId: String(req.params.orderId), order: { customerId: req.user!.id } } });
  if (!p) throw notFound('Payment');
  res.json({ status: p.status.toLowerCase(), provider: p.provider });
});

/** Staff/cron: cancel unpaid online orders older than PAYMENT_PENDING_TTL_MINUTES and release their stock. */
paymentsRouter.post('/admin/payments/expire', requireAuth, requireRole('SUPER_ADMIN'), async (_req, res) => {
  res.json({ expired: await expireStalePayments() });
});
