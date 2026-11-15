import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireActive, requireAuth, requireRole } from '../../middleware/auth.js';
import { advanceStatus, cancelOwnOrder, getOwnOrder, listOrders, placeOrder, placeOrderSchema, reconcilePayment, toClientOrder } from './orders.service.js';
import { env } from '../../config/env.js';
import { prisma } from '../../database/prisma.js';

export const ordersRouter = Router();

const checkoutLimiter = rateLimit({ windowMs: 60_000, limit: env.CHECKOUT_RATE_LIMIT_PER_MIN, standardHeaders: true, legacyHeaders: false });

ordersRouter.post('/orders', requireAuth, requireActive, checkoutLimiter, async (req, res) => {
  const input = placeOrderSchema.parse(req.body);
  const result = await placeOrder(req.user!.id, input);
  res.status(result.outcome === 'failure' ? 402 : 201).json(result);
});

ordersRouter.get('/orders', requireAuth, requireActive, async (req, res) => {
  res.json(await listOrders(req.user!.id));
});

ordersRouter.get('/orders/:id', requireAuth, requireActive, async (req, res) => {
  const o = await getOwnOrder(req.user!.id, String(req.params.id));
  const full = await prisma.order.findUniqueOrThrow({ where: { id: o.id }, include: { items: true, events: { orderBy: { at: 'asc' } }, payment: true } });
  res.json(toClientOrder(full));
});

/** Cancel your own order while the store has not started on it and nothing was paid online. */
ordersRouter.post('/orders/:id/cancel', requireAuth, requireActive, async (req, res) => {
  res.json(await cancelOwnOrder(req.user!.id, String(req.params.id)));
});

ordersRouter.post('/orders/:id/reconcile', requireAuth, requireActive, async (req, res) => {
  res.json(await reconcilePayment(req.user!.id, String(req.params.id)));
});

/** Staff-only. Customers can never change order status. */
ordersRouter.post('/admin/orders/:id/advance', requireAuth, requireRole('SUPER_ADMIN'), async (req, res) => {
  res.json(await advanceStatus(String(req.params.id), `admin:${req.user!.id}`));
});
