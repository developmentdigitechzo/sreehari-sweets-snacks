import { getRewardRules, getRules } from './rules';
import type { Coupon, CouponEvaluation, DeliverySlot, PricedLine, Totals } from '../types';
import { rupee } from '../utils/format';

/** Coupons listed to customers are only the live ones: already started and not yet expired. */
export const isCouponActive = (c: Coupon, now = new Date()) =>
  (!c.startsAt || new Date(c.startsAt) <= now) && (!c.expiresAt || new Date(c.expiresAt) >= now);

/**
 * Client-side PREVIEW of price maths. The server is the source of truth
 * (backend/src/modules/pricing) and re-validates everything at order placement.
 */
export function evaluateCoupon(coupon: Coupon, subtotal: number, now = new Date()): CouponEvaluation {
  const base = { code: coupon.code, discount: 0, freeShipping: false };
  if (coupon.startsAt && new Date(coupon.startsAt) > now) {
    return { ...base, eligible: false, reason: 'This coupon is not active yet.' };
  }
  if (coupon.expiresAt && new Date(coupon.expiresAt) < now) {
    return { ...base, eligible: false, reason: 'This coupon has expired.' };
  }
  if (subtotal < coupon.minOrder) {
    return {
      ...base,
      eligible: false,
      reason: `Add ${rupee(coupon.minOrder - subtotal)} more to use ${coupon.code} (min order ${rupee(coupon.minOrder)}).`,
    };
  }
  if (coupon.type === 'freeship') return { ...base, eligible: true, freeShipping: true };
  let discount = coupon.type === 'percent' ? (subtotal * coupon.value) / 100 : coupon.value;
  if (coupon.maxDiscount) discount = Math.min(discount, coupon.maxDiscount);
  return { ...base, eligible: true, discount: Math.round(Math.min(discount, subtotal)) };
}

export function computeTotals(
  lines: PricedLine[],
  opts: { coupon?: Coupon | null; slot?: DeliverySlot; redeemPoints?: number; /** Subtotal of the lines a restricted coupon applies to. */ couponBase?: number },
): Totals {
  const itemCount = lines.reduce((n, l) => n + l.qty, 0); // total units, matches the cart badge
  const mrpTotal = lines.reduce((n, l) => n + l.lineMrp, 0);
  const subtotal = lines.reduce((n, l) => n + l.linePrice, 0);
  const itemDiscount = mrpTotal - subtotal;
  const coupon = opts.coupon ? evaluateCoupon(opts.coupon, opts.couponBase ?? subtotal) : undefined;
  const couponDiscount = coupon?.eligible ? coupon.discount : 0;
  const afterCoupon = subtotal - couponDiscount;
  const rewardDiscount = Math.min(opts.redeemPoints ?? 0, Math.max(0, afterCoupon));

  const baseFee = opts.slot?.fee ?? 0;
  const threshold = getRules().freeDeliveryThreshold;
  const freeByThreshold = subtotal >= threshold;
  const deliveryFee = itemCount === 0 || freeByThreshold || coupon?.freeShipping ? 0 : baseFee;
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
    savings: itemDiscount + couponDiscount + rewardDiscount + (baseFee > deliveryFee ? baseFee - deliveryFee : 0),
    freeDeliveryRemaining: Math.max(0, threshold - subtotal),
    coupon,
  };
}

export const pointsToRupees = (points: number) => Math.floor(points * getRewardRules().pointsToRupee);
