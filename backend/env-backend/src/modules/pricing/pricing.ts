/**
 * Server-authoritative price maths. The mobile app has a PREVIEW copy; client totals are never trusted.
 * Whole rupees are used for the demo catalogue; the database stores NUMERIC(12,2).
 */
export const DEMO_RULES = {
  freeDeliveryThreshold: 1499,
  codLimit: 2000,
  pointsToRupee: 0.1, // 10 points = ₹1 (demo)
  earnPerRupee: 0.1, // 1 point per ₹10 (demo)
} as const;

export type CouponRule = {
  code: string;
  type: 'PERCENT' | 'FLAT' | 'FREESHIP';
  value: number;
  minOrder: number;
  maxDiscount?: number | null;
  startsAt?: Date | null;
  expiresAt?: Date | null;
  usageLimit?: number | null;
  usedCount?: number;
  isActive?: boolean;
};

export type LineInput = { mrp: number; price: number; qty: number };

export type CouponResult = { code: string; eligible: boolean; reason?: string; discount: number; freeShipping: boolean };

export function evaluateCoupon(c: CouponRule, subtotal: number, now = new Date()): CouponResult {
  const base = { code: c.code, discount: 0, freeShipping: false };
  if (c.isActive === false) return { ...base, eligible: false, reason: 'This coupon is not active.' };
  if (c.startsAt && c.startsAt > now) return { ...base, eligible: false, reason: 'This coupon is not active yet.' };
  if (c.expiresAt && c.expiresAt < now) return { ...base, eligible: false, reason: 'This coupon has expired.' };
  if (c.usageLimit != null && (c.usedCount ?? 0) >= c.usageLimit) {
    return { ...base, eligible: false, reason: 'This coupon has reached its usage limit.' };
  }
  if (subtotal < c.minOrder) {
    return { ...base, eligible: false, reason: `Add ₹${c.minOrder - subtotal} more to use ${c.code}.` };
  }
  if (c.type === 'FREESHIP') return { ...base, eligible: true, freeShipping: true };
  let d = c.type === 'PERCENT' ? (subtotal * c.value) / 100 : c.value;
  if (c.maxDiscount) d = Math.min(d, c.maxDiscount);
  return { ...base, eligible: true, discount: Math.round(Math.min(d, subtotal)) };
}

export function computeTotals(
  lines: LineInput[],
  opts: { coupon?: CouponRule | null; slotFee: number; redeemRupees?: number; now?: Date; freeDeliveryThreshold?: number; /** Subtotal of the lines a restricted coupon applies to. */ couponBase?: number },
) {
  const itemCount = lines.length;
  const mrpTotal = lines.reduce((n, l) => n + l.mrp * l.qty, 0);
  const subtotal = lines.reduce((n, l) => n + l.price * l.qty, 0);
  const itemDiscount = mrpTotal - subtotal;
  const coupon = opts.coupon ? evaluateCoupon(opts.coupon, opts.couponBase ?? subtotal, opts.now) : undefined;
  const couponDiscount = coupon?.eligible ? coupon.discount : 0;
  const afterCoupon = subtotal - couponDiscount;
  const rewardDiscount = Math.min(Math.max(0, Math.floor(opts.redeemRupees ?? 0)), Math.max(0, afterCoupon));
  const threshold = opts.freeDeliveryThreshold ?? DEMO_RULES.freeDeliveryThreshold;
  const freeByThreshold = subtotal >= threshold;
  const deliveryFee = itemCount === 0 || freeByThreshold || coupon?.freeShipping ? 0 : opts.slotFee;
  const total = Math.max(0, afterCoupon - rewardDiscount + deliveryFee);
  return {
    itemCount,
    mrpTotal,
    itemDiscount,
    subtotal,
    couponDiscount,
    rewardDiscount,
    deliveryFee,
    total,
    savings: itemDiscount + couponDiscount + rewardDiscount + (opts.slotFee > deliveryFee ? opts.slotFee - deliveryFee : 0),
    freeDeliveryRemaining: Math.max(0, threshold - subtotal),
    coupon,
  };
}
