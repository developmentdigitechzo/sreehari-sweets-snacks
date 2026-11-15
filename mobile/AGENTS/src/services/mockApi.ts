import { DELIVERY_SLOTS, DEMO_CONFIG } from '../data/config';
import { istDate } from './deliveryDates';
import { BANNERS, CATEGORIES, COLLECTIONS, COUPONS, PRODUCTS } from '../data/seed';
import type { Order, PricedLine } from '../types';
import { sleep } from '../utils/format';
import type { PlaceOrderInput, PlaceOrderResult, ShopApi } from './api';
import { buildOrder } from './orders';
import { computeTotals } from './pricing';

/** Idempotency: repeated placeOrder with the same key returns the first result. */
const placed = new Map<string, PlaceOrderResult>();
let orderCounter = 12457;

export const mockApi: ShopApi = {
  async capabilities() {
    return { otp: 'none', passwordReset: false, payments: 'none', reverseGeocoding: false };
  },
  async getCatalog() {
    await sleep(750);
    return { products: PRODUCTS, categories: CATEGORIES, collections: COLLECTIONS, banners: BANNERS, coupons: COUPONS };
  },

  async checkPincode(pincode) {
    await sleep(350);
    if (!/^\d{6}$/.test(pincode)) return { serviceable: false, message: 'Enter a valid 6-digit pincode.' };
    return DEMO_CONFIG.serviceablePincodes.includes(pincode)
      ? { serviceable: true, message: 'Delivery available (demo service area).' }
      : { serviceable: false, message: 'Sorry, we do not deliver to this pincode yet.' };
  },

  async placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
    await sleep(1600);
    const existing = placed.get(input.idempotencyKey);
    if (existing) return existing;

    // Server-side style revalidation: price, stock, coupon, serviceability.
    const serviceable = DEMO_CONFIG.serviceablePincodes.includes(input.address.pincode);
    if (!serviceable) return { outcome: 'failure', message: 'This address is outside our delivery area.' };

    const lines: PricedLine[] = [];
    for (const item of input.items) {
      const product = PRODUCTS.find((p) => p.id === item.productId);
      const variant = product?.variants.find((x) => x.id === item.variantId);
      if (!product || !variant) return { outcome: 'failure', message: 'An item is no longer available.' };
      const wanted = input.items.filter((i) => i.variantId === item.variantId).reduce((n, i) => n + i.qty, 0);
      if (variant.stock < wanted) return { outcome: 'failure', message: `${product.name} ${variant.label} is out of stock.` };
      lines.push({ product, variant, qty: item.qty, options: item.options, lineMrp: variant.mrp * item.qty, linePrice: variant.price * item.qty });
    }
    const baseSlot = DELIVERY_SLOTS.find((s) => s.id === input.slotId) ?? DELIVERY_SLOTS[0];
    const slot = { ...baseSlot, date: input.deliveryDate ?? istDate(new Date()) };
    const coupon = COUPONS.find((c) => c.code === input.couponCode) ?? null;
    const totals = computeTotals(lines, { coupon, slot, redeemPoints: input.redeemPoints });

    if (input.paymentMethod === 'cod' && totals.total > DEMO_CONFIG.codLimit) {
      return { outcome: 'failure', message: `COD is available up to ₹${DEMO_CONFIG.codLimit} in this demo.` };
    }

    let result: PlaceOrderResult;
    if (input.simulatedOutcome === 'failure' && input.paymentMethod !== 'cod') {
      result = { outcome: 'failure', message: 'Simulated payment failed. No money was charged. Please retry.' };
      return result; // not cached: a retry must be able to succeed with the same key
    }
    const pending = input.simulatedOutcome === 'pending' && input.paymentMethod !== 'cod';
    const order: Order = buildOrder({
      number: `SH${orderCounter++}`,
      lines,
      totals,
      address: input.address,
      slot,
      coupon,
      method: input.paymentMethod,
      paymentStatus: input.paymentMethod === 'cod' ? 'cod_due' : pending ? 'pending' : 'paid',
      idempotencyKey: input.idempotencyKey,
    });
    result = { outcome: pending ? 'pending' : 'success', order };
    placed.set(input.idempotencyKey, result);
    return result;
  },

  async reconcilePayment() {
    await sleep(1200);
    return { status: 'paid' };
  },

  async uploadImage(uri) {
    // Replaceable seam: in production this PUTs to object storage and returns a CDN URL.
    await sleep(500);
    return { uri };
  },
};
