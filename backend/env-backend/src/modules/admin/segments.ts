import { z } from 'zod';
import { prisma } from '../../database/prisma.js';

/**
 * A segment is a saved rule over real customer data. All conditions that are set must hold (AND).
 * Only customers (role CUSTOMER) who are not blocked are ever included.
 */
export const ruleSchema = z.object({
  minSpend: z.number().min(0).optional(), // lifetime spend (non-cancelled orders), INR
  minOrders: z.number().int().min(0).optional(),
  orderedWithinDays: z.number().int().min(1).max(3650).optional(), // at least one order in the last N days
  noOrderInDays: z.number().int().min(1).max(3650).optional(), // has ordered before, but not in the last N days
  joinedWithinDays: z.number().int().min(1).max(3650).optional(),
  usedCouponAtLeast: z.number().int().min(1).optional(), // times a coupon was used
});
export type SegmentRule = z.infer<typeof ruleSchema>;
export const parseRule = (raw: unknown): SegmentRule => ruleSchema.parse(raw ?? {});

const DAY = 86_400_000;

/** Evaluates a rule in memory over per-customer aggregates. Fine for a single shop; move to SQL if the customer base grows large. */
export async function customerIdsForRule(rule: SegmentRule, opts: { marketingOnly?: boolean } = {}): Promise<string[]> {
  const now = Date.now();
  const [customers, agg, coupons] = await Promise.all([
    prisma.customer.findMany({ where: { role: 'CUSTOMER', isBlocked: false, marketingOptIn: opts.marketingOnly ? true : undefined }, select: { id: true, createdAt: true } }),
    prisma.order.groupBy({ by: ['customerId'], where: { status: { not: 'CANCELLED' } }, _sum: { total: true }, _count: true, _max: { createdAt: true } }),
    prisma.couponRedemption.groupBy({ by: ['customerId'], _count: true }),
  ]);
  const a = new Map(agg.map((x) => [x.customerId, { spend: Number(x._sum.total ?? 0), orders: x._count, last: x._max.createdAt?.getTime() ?? 0 }]));
  const cp = new Map(coupons.map((x) => [x.customerId, x._count]));
  return customers
    .filter((c) => {
      const s = a.get(c.id) ?? { spend: 0, orders: 0, last: 0 };
      if (rule.minSpend !== undefined && s.spend < rule.minSpend) return false;
      if (rule.minOrders !== undefined && s.orders < rule.minOrders) return false;
      if (rule.orderedWithinDays !== undefined && !(s.last && now - s.last <= rule.orderedWithinDays * DAY)) return false;
      if (rule.noOrderInDays !== undefined && !(s.orders > 0 && now - s.last > rule.noOrderInDays * DAY)) return false;
      if (rule.joinedWithinDays !== undefined && now - c.createdAt.getTime() > rule.joinedWithinDays * DAY) return false;
      if (rule.usedCouponAtLeast !== undefined && (cp.get(c.id) ?? 0) < rule.usedCouponAtLeast) return false;
      return true;
    })
    .map((c) => c.id);
}

/** Starter segments, created on first use. Admins can edit or add their own. */
export const SYSTEM_SEGMENTS: { name: string; description: string; rule: SegmentRule }[] = [
  { name: 'VIP Customers', description: 'High value, frequent buyers (₹5,000+ and 5+ orders)', rule: { minSpend: 5000, minOrders: 5 } },
  { name: 'Active Buyers', description: 'Purchased in last 30 days', rule: { orderedWithinDays: 30 } },
  { name: 'Inactive Customers', description: 'No purchase in last 60 days', rule: { noOrderInDays: 60 } },
  { name: 'Offer Seekers', description: 'Used coupons 3 or more times', rule: { usedCouponAtLeast: 3 } },
  { name: 'High Spenders', description: 'Total spend above ₹5,000', rule: { minSpend: 5000 } },
  { name: 'New Customers', description: 'Joined in last 30 days', rule: { joinedWithinDays: 30 } },
];

export async function ensureSystemSegments() {
  if ((await prisma.segment.count()) > 0) return;
  await prisma.segment.createMany({ data: SYSTEM_SEGMENTS.map((s) => ({ ...s, isSystem: true })), skipDuplicates: true });
}
