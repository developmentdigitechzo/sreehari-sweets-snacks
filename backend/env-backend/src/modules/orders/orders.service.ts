import { Prisma } from '@prisma/client';
import { indianPhoneSchema, nameSchema, pincodeSchema } from '../auth/validators.js';
import { z } from 'zod';
import { getSetting } from '../admin/settings.service.js';
import { changeStock } from '../inventory/stock.js';
import { prisma } from '../../database/prisma.js';
import { AppError, notFound } from '../../utils/errors.js';
import { activeProvider } from '../payments/providers.js';
import { cancelUnpaidOrder } from '../payments/payments.service.js';
import { pushOrderEvent } from '../notify/transactionalPush.js';
import { cancelOrderTx } from './cancel.js';
import { SLOTS, checkDelivery, resolveSlot } from './slots.js';
import { computeTotals, type CouponRule } from '../pricing/pricing.js';

export { SLOTS } from './slots.js';

export const placeOrderSchema = z.object({
  idempotencyKey: z.string().min(8).max(80),
  items: z.array(z.object({ productId: z.string(), variantId: z.string(), qty: z.number().int().min(1).max(20), options: z.object({ flavour: z.string().max(40).optional(), message: z.string().max(60).optional() }).optional() })).min(1).max(50),
  couponCode: z.string().max(40).nullish(),
  slotId: z.string(),
  /** Delivery date (YYYY-MM-DD, India). Omitted = today. */
  deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  address: z.object({
    id: z.string().optional(),
    label: z.enum(['Home', 'Office', 'Other']),
    name: nameSchema,
    phone: indianPhoneSchema,
    line1: z.string().min(3).max(160),
    area: z.string().min(2).max(80),
    city: z.string().min(2).max(60),
    pincode: pincodeSchema,
    state: z.string().max(60).optional(),
    landmark: z.string().max(120).optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    instructions: z.string().max(240).optional(),
    isDefault: z.boolean().optional(),
  }),
  paymentMethod: z.enum(['upi', 'card', 'wallet', 'netbanking', 'cod']),
  /** SIMULATION ONLY. Real payments must be verified server-side via signed provider webhooks. */
  simulatedOutcome: z.enum(['success', 'failure', 'pending']).default('success'),
  /** Rupees of reward balance to apply. Capped server-side by the customer's ledger balance. */
  redeemPoints: z.number().int().min(0).default(0),
});
export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;

const orderInclude = { items: true, events: { orderBy: { at: 'asc' as const } }, payment: true };
type OrderRow = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

const n = (d: { toString(): string }) => Number(d.toString());

export function toClientOrder(o: OrderRow) {
  return {
    id: o.id,
    number: o.number,
    idempotencyKey: o.idempotencyKey,
    createdAt: o.createdAt.toISOString(),
    status: o.status.toLowerCase(),
    events: o.events.map((e) => ({ status: e.status.toLowerCase(), at: e.at.toISOString() })),
    items: o.items.map((i) => ({
      productId: i.productId, name: i.name, sku: i.sku, variantLabel: i.variantLabel,
      unitPrice: n(i.unitPrice), mrp: n(i.mrp), qty: i.qty, imageKey: i.imageKey ?? undefined, imageUri: i.imageUrl ?? undefined, options: (i.options as object | null) ?? undefined,
    })),
    totals: o.totalsSnapshot,
    couponCode: o.couponCode ?? undefined,
    address: o.addressSnapshot,
    slot: o.slotSnapshot,
    payment: o.payment
      ? { method: o.payment.method.toLowerCase(), status: o.payment.status.toLowerCase(), reference: o.payment.reference, simulated: o.payment.simulated, provider: o.payment.provider }
      : undefined,
    isDemo: o.isDemo,
  };
}

type PaymentRow = NonNullable<OrderRow['payment']>;
/** What the app needs to open the provider's checkout. The provider key id is public by design; secrets never leave the server. */
function paymentInfo(p: PaymentRow) {
  return { provider: p.provider, providerOrderId: p.providerOrderId ?? undefined, keyId: p.provider === 'razorpay' ? process.env.RAZORPAY_KEY_ID : 'rzp_test_double', amount: Math.round(Number(p.amount.toString()) * 100), currency: 'INR' };
}

const methodEnum = { upi: 'UPI', card: 'CARD', wallet: 'WALLET', netbanking: 'NETBANKING', cod: 'COD' } as const;

async function rewardBalance(tx: Prisma.TransactionClient | typeof prisma, customerId: string) {
  const r = await tx.rewardLedger.aggregate({ where: { customerId }, _sum: { points: true } });
  return r._sum.points ?? 0;
}

export async function placeOrder(customerId: string, input: PlaceOrderInput) {
  // 1. Idempotency: the same key always returns the same order (never a second charge/order).
  const existing = await prisma.order.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: orderInclude });
  if (existing) {
    if (existing.customerId !== customerId) throw new AppError(409, 'Idempotency key already used', 'CONFLICT');
    if (existing.payment && !existing.payment.simulated && existing.payment.status === 'PENDING') return { outcome: 'requires_payment', order: toClientOrder(existing), payment: paymentInfo(existing.payment) } as const;
    return { outcome: existing.payment?.status === 'PENDING' ? 'pending' : 'success', order: toClientOrder(existing) } as const;
  }

  // 2. Serviceability — an undeliverable address can never be paid for.
  const pin = await prisma.serviceablePincode.findUnique({ where: { pincode: input.address.pincode } });
  if (!pin?.isActive) throw new AppError(422, 'This address is outside our delivery area.', 'NOT_SERVICEABLE');

  const owner = await prisma.customer.findUnique({ where: { id: customerId }, select: { isDemo: true } });
  const delivery = await getSetting('delivery');
  const baseSlot = SLOTS.find((s) => s.id === input.slotId);
  const resolved = baseSlot ? resolveSlot(baseSlot, delivery.slots[baseSlot.id]) : null;
  if (!resolved || !resolved.enabled) throw new AppError(422, 'Unknown delivery slot.', 'BAD_SLOT');
  // The delivery date and the slot's clock time are checked here, on the server, in India time.
  const when = checkDelivery({ date: input.deliveryDate, slot: resolved, now: new Date(), timing: { maxAdvanceDays: delivery.maxAdvanceDays, cutoffMinutes: delivery.cutoffMinutes } });
  if (!when.ok) throw new AppError(422, when.message, when.code);
  const { enabled: _enabled, ...slotBase } = resolved;
  const slot = { ...slotBase, date: when.date };

  // 3. Re-read prices and stock from the database. The client never supplies a price.
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: input.items.map((i) => i.variantId) }, product: { isActive: true, archivedAt: null } },
    include: { product: { include: { images: { orderBy: { sortOrder: 'asc' }, take: 1 } } } },
  });
  const lines = input.items.map((it) => {
    const v = variants.find((x) => x.id === it.variantId && x.productId === it.productId);
    if (!v) throw new AppError(422, 'An item in your cart is no longer available.', 'ITEM_UNAVAILABLE');
    const wanted = input.items.filter((x) => x.variantId === it.variantId).reduce((sum, x) => sum + x.qty, 0);
    if (v.stock < wanted) throw new AppError(409, `${v.product.name} ${v.label} is out of stock.`, 'OUT_OF_STOCK');
    return { v, qty: it.qty, options: it.options, mrp: n(v.mrp), price: n(v.price) };
  });

  const couponRow = input.couponCode ? await prisma.coupon.findUnique({ where: { code: input.couponCode } }) : null;
  const rule: CouponRule | null = couponRow
    ? { code: couponRow.code, type: couponRow.type, value: n(couponRow.value), minOrder: n(couponRow.minOrder), maxDiscount: couponRow.maxDiscount ? n(couponRow.maxDiscount) : null, startsAt: couponRow.startsAt, expiresAt: couponRow.expiresAt, usageLimit: couponRow.usageLimit, usedCount: couponRow.usedCount, isActive: couponRow.isActive }
    : null;

  const rw = await getSetting('rewards');
  const balance = await rewardBalance(prisma, customerId);
  const maxRedeemRupees = Math.floor(balance * rw.pointsToRupee);
  // A coupon restricted to categories/products only counts the matching lines.
  const restricted = !!couponRow && (couponRow.categoryIds.length > 0 || couponRow.productIds.length > 0);
  // A category the admin picked also covers its subcategories (products sit in subcategories).
  const allowedCats = restricted ? await withDescendants(couponRow!.categoryIds) : new Set<string>();
  const couponBase = restricted ? lines.filter((l) => couponRow!.productIds.includes(l.v.productId) || allowedCats.has(l.v.product.categoryId)).reduce((s, l) => s + l.price * l.qty, 0) : undefined;
  const totals = computeTotals(lines, { coupon: rule, couponBase, freeDeliveryThreshold: delivery.freeDeliveryThreshold, slotFee: slot.fee, redeemRupees: Math.min(input.redeemPoints, maxRedeemRupees) });

  if (input.paymentMethod === 'cod' && totals.total > delivery.codLimit) {
    throw new AppError(422, `COD is available up to ₹${delivery.codLimit}.`, 'COD_LIMIT');
  }

  // 4. Simulated gateway failure creates nothing: no false confirmed order, no stock held.
  // Real online payment when a provider is configured: the client's simulatedOutcome is ignored entirely.
  const provider = activeProvider();
  // No payment gateway is connected: an online payment can never be confirmed, so it is refused instead of being recorded as Paid.
  if (!provider && input.paymentMethod !== 'cod') {
    throw new AppError(503, 'Online payment is not available right now. Please choose Cash on Delivery.', 'PAYMENT_NOT_CONFIGURED');
  }
  const online = !!provider && input.paymentMethod !== 'cod';
  if (!online && input.simulatedOutcome === 'failure' && input.paymentMethod !== 'cod') {
    return { outcome: 'failure', message: 'Simulated payment failed. No money was charged. Please retry.' } as const;
  }
  const pending = online || (input.simulatedOutcome === 'pending' && input.paymentMethod !== 'cod');
  const payStatus = input.paymentMethod === 'cod' ? 'COD_DUE' : pending ? 'PENDING' : 'PAID';

  try {
    const orderId = await prisma.$transaction(async (tx) => {
      // Oversell guard: conditional decrement; zero rows updated => someone else took the last unit.
      for (const l of lines) {
        const after = await changeStock(tx, { id: l.v.id }, -l.qty, { reason: 'ORDER', actor: `customer:${customerId}` });
        if (after === null) throw new AppError(409, `${l.v.product.name} ${l.v.label} is out of stock.`, 'OUT_OF_STOCK');
      }
      // Usage-cap guard at the row level (prevents over-redemption under concurrency).
      if (rule && totals.coupon?.eligible) {
        const r = await tx.$executeRaw`UPDATE "Coupon" SET "usedCount" = "usedCount" + 1 WHERE "code" = ${rule.code} AND ("usageLimit" IS NULL OR "usedCount" < "usageLimit")`;
        if (r !== 1) throw new AppError(409, 'This coupon has reached its usage limit.', 'COUPON_CAP');
      }
      if (totals.rewardDiscount > 0 && (await rewardBalance(tx, customerId)) < Math.ceil(totals.rewardDiscount / rw.pointsToRupee)) {
        throw new AppError(409, 'Not enough reward points.', 'REWARDS');
      }
      const [{ nextval }] = await tx.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('order_number_seq')`;
      const created = await tx.order.create({
        data: {
          number: `SH${nextval}`,
          isDemo: owner?.isDemo ?? false,
          idempotencyKey: input.idempotencyKey,
          customerId,
          couponCode: totals.coupon?.eligible ? rule?.code : null,
          mrpTotal: totals.mrpTotal, itemDiscount: totals.itemDiscount, subtotal: totals.subtotal,
          couponDiscount: totals.couponDiscount, rewardDiscount: totals.rewardDiscount, deliveryFee: totals.deliveryFee, total: totals.total,
          totalsSnapshot: totals as unknown as Prisma.InputJsonValue,
          addressSnapshot: input.address as unknown as Prisma.InputJsonValue,
          slotSnapshot: slot as unknown as Prisma.InputJsonValue,
          items: {
            create: lines.map((l) => ({
              productId: l.v.productId, name: l.v.product.name, sku: l.v.sku, variantLabel: l.v.label,
              unitPrice: l.price, mrp: l.mrp, qty: l.qty,
              imageKey: l.v.product.images[0]?.key ?? null, imageUrl: l.v.product.images[0]?.url ?? null,
              options: l.options ?? undefined,
            })),
          },
          events: { create: [{ status: 'PLACED', actor: 'system' }] },
          payment: { create: { method: methodEnum[input.paymentMethod], status: payStatus, amount: totals.total, reference: `${online ? 'PAY' : 'COD'}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, provider: online ? provider!.name : 'cash', simulated: false } }, // cash on delivery is a real order, not a simulation
        },
      });
      if (rule && totals.coupon?.eligible) {
        await tx.couponRedemption.create({ data: { couponCode: rule.code, orderId: created.id, customerId, discount: totals.couponDiscount } });
      }
      if (totals.rewardDiscount > 0) {
        await tx.rewardLedger.create({ data: { customerId, orderId: created.id, points: -Math.round(totals.rewardDiscount / rw.pointsToRupee), note: `Redeemed on order SH${nextval}` } });
      }
      // Points are earned when money is really settled: online orders when the provider confirms the payment (confirmPayment),
      // Cash on Delivery orders when the order is delivered (admin status route). Only a simulated, already-paid order earns here.
      if (payStatus === 'PAID') {
        await tx.rewardLedger.create({ data: { customerId, orderId: created.id, points: Math.floor(totals.total * rw.earnPerRupee), note: `Earned on order SH${nextval}` } });
      }
      await tx.notification.create({ data: { customerId, kind: 'order_placed', title: 'Order placed', body: `Order SH${nextval} was placed.`, channel: 'in_app', simulated: false } });
      return created.id;
    });
    if (online) {
      // Create the payment at the provider for the amount THIS SERVER calculated. If it fails, undo the order (stock, coupon, rewards).
      try {
        const po = await provider!.createOrder({ amountPaise: Math.round(totals.total * 100), receipt: orderId });
        await prisma.payment.update({ where: { orderId }, data: { providerOrderId: po.providerOrderId } });
      } catch (e) {
        await cancelUnpaidOrder(orderId, 'FAILED', 'provider-order-failed');
        throw e;
      }
      const placed = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude });
      return { outcome: 'requires_payment', order: toClientOrder(placed), payment: paymentInfo(placed.payment!) } as const;
    }
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude });
    // Best-effort service push after the order is saved. A card payment still waiting for the provider is not announced yet.
    if (!pending) void pushOrderEvent(customerId, { kind: 'order_placed', title: 'Order placed', body: `Order ${order.number} was placed.`, orderId: order.id });
    return { outcome: pending ? 'pending' : 'success', order: toClientOrder(order) } as const;
  } catch (e) {
    // Two concurrent requests with the same key: the loser returns the winner's order.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const winner = await prisma.order.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: orderInclude });
      if (winner && winner.customerId === customerId) return { outcome: winner.payment?.status === 'PENDING' ? 'pending' : 'success', order: toClientOrder(winner) } as const;
    }
    throw e;
  }
}

async function withDescendants(ids: string[]) {
  const cats = await prisma.category.findMany({ select: { id: true, parentId: true } });
  const out = new Set(ids);
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of cats) if (c.parentId && out.has(c.parentId) && !out.has(c.id)) { out.add(c.id); grew = true; }
  }
  return out;
}

export async function listOrders(customerId: string) {
  const rows = await prisma.order.findMany({ where: { customerId }, include: orderInclude, orderBy: { createdAt: 'desc' }, take: 50 });
  return rows.map(toClientOrder);
}

/** Ownership enforced in the query itself: another customer's order is indistinguishable from "not found". */
export async function getOwnOrder(customerId: string, id: string) {
  const o = await prisma.order.findFirst({ where: { id, customerId }, include: orderInclude });
  if (!o) throw notFound('Order');
  return o;
}

export async function reconcilePayment(customerId: string, id: string) {
  const rw = await getSetting('rewards');
  const o = await getOwnOrder(customerId, id);
  if (o.payment?.status !== 'PENDING') return { status: o.payment?.status === 'PAID' ? 'paid' : 'failed' } as const;
  // A real provider payment is confirmed ONLY by the provider (signed webhook / verified checkout). A customer must never be able to
  // mark their own real payment as paid, so this simulator-only shortcut leaves it pending.
  if (!o.payment.simulated) return { status: 'pending' } as const;
  await prisma.$transaction([
    prisma.payment.update({ where: { orderId: o.id }, data: { status: 'PAID' } }),
    prisma.rewardLedger.create({ data: { customerId, orderId: o.id, points: Math.floor(n(o.total) * rw.earnPerRupee), note: `Earned on order ${o.number}` } }),
  ]);
  return { status: 'paid' } as const;
}

const FLOW = ['PLACED', 'CONFIRMED', 'PREPARING', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED'] as const;

/** Allowed transitions only; used by the (admin-only) status route. */
export async function advanceStatus(id: string, actor: string) {
  const o = await prisma.order.findUnique({ where: { id } });
  if (!o) throw notFound('Order');
  const i = FLOW.indexOf(o.status as (typeof FLOW)[number]);
  const next = i >= 0 ? FLOW[i + 1] : undefined;
  if (!next) throw new AppError(409, 'No further status is allowed from here.', 'BAD_TRANSITION');
  await prisma.$transaction([
    prisma.order.update({ where: { id }, data: { status: next } }),
    prisma.orderEvent.create({ data: { orderId: id, status: next, actor } }),
  ]);
  return { status: next.toLowerCase() };
}

/**
 * The customer cancels their own order. Allowed only while the store has not started on it (status PLACED) and nothing has been
 * paid online, so no money has to move. Anything else (confirmed, preparing, or already paid) stays a request the store decides on.
 */
export async function cancelOwnOrder(customerId: string, id: string) {
  const o = await getOwnOrder(customerId, id);
  // Paid first: a confirmed online payment also moves the order to CONFIRMED, and the customer should hear "paid", not "the store started".
  if (!o.payment || !['COD_DUE', 'PENDING', 'PROCESSING'].includes(o.payment.status)) {
    throw new AppError(409, 'This order is already paid, so it needs a cancellation request and a refund.', 'BAD_STATE');
  }
  if (o.status !== 'PLACED') throw new AppError(409, 'The store has already started on this order. Please send a cancellation request instead.', 'BAD_STATE');
  await prisma.$transaction(async (tx) => {
    // Take the row lock and re-check: if the store confirmed it a moment ago, this changes nothing and we stop.
    const held = await tx.order.updateMany({ where: { id, customerId, status: 'PLACED' }, data: { status: 'PLACED' } });
    if (held.count !== 1) throw new AppError(409, 'The store just updated this order. Please refresh.', 'BAD_STATE');
    await cancelOrderTx(tx, id, `customer:${customerId}`, 'Cancelled by you');
  });
  void pushOrderEvent(customerId, { kind: 'order_cancelled', title: `Order ${o.number} cancelled`, body: 'Your order was cancelled. Nothing was charged.', orderId: id });
  return toClientOrder(await prisma.order.findUniqueOrThrow({ where: { id }, include: orderInclude }));
}
