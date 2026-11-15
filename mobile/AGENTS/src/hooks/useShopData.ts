import { useNow } from './useNow';
import { dateOptions, firstAvailable, slotAvailability } from '../services/deliveryDates';
import { useMemo } from 'react';
import { getRules } from '../services/rules';
import { computeTotals, pointsToRupees } from '../services/pricing';
import { lineKey } from '../utils/cart';
import { useCatalog } from '../store/useCatalog';
import { useShop } from '../store/useShop';
import type { Product, PricedLine } from '../types';

/** Catalogue products with any locally managed image overrides applied. */
export function useProducts(): Product[] {
  const products = useCatalog((s) => s.products);
  const overrides = useShop((s) => s.imageOverrides);
  return useMemo(
    () => products.map((p) => (overrides[p.id]?.length ? { ...p, images: overrides[p.id] } : p)),
    [products, overrides],
  );
}

export function useProduct(id: string | undefined): Product | undefined {
  const products = useProducts();
  return useMemo(() => products.find((p) => p.id === id), [products, id]);
}

export function useRewardsBalance() {
  const ledger = useShop((s) => s.ledger);
  useCatalog((s) => s.rewards); // re-render when the store changes its reward rules
  const points = useMemo(() => ledger.reduce((n, l) => n + l.points, 0), [ledger]);
  return { points, rupees: pointsToRupees(points) };
}

export function useCartView() {
  const cart = useShop((s) => s.cart);
  const couponCode = useShop((s) => s.couponCode);
  const slotId = useShop((s) => s.slotId);
  const chosenDate = useShop((s) => s.deliveryDate);
  const now = useNow();
  const redeem = useShop((s) => s.redeemPoints);
  const products = useProducts();
  const coupons = useCatalog((s) => s.coupons);
  const categories = useCatalog((s) => s.categories);
  const delivery = useCatalog((s) => s.delivery); // re-render when the store changes its delivery rules
  const { rupees } = useRewardsBalance();

  return useMemo(() => {
    const lines: PricedLine[] = [];
    for (const l of cart) {
      const product = products.find((p) => p.id === l.productId);
      const variant = product?.variants.find((v) => v.id === l.variantId);
      if (product && variant) {
        lines.push({ product, variant, qty: l.qty, options: l.options, key: lineKey(l), lineMrp: variant.mrp * l.qty, linePrice: variant.price * l.qty });
      }
    }
    const coupon = coupons.find((c) => c.code === couponCode) ?? null;
    const rules = getRules(); // equals the store's current rules once the catalogue has loaded (`delivery` above re-renders us when it changes)
    const timing = { maxAdvanceDays: rules.maxAdvanceDays, cutoffMinutes: rules.cutoffMinutes };
    // The delivery date: the customer's choice while it is still allowed, otherwise today. The slot: their choice while it is
    // bookable on that date, otherwise the first one that is (for example the evening slot after the afternoon one has closed).
    const dates = dateOptions(now, timing);
    const deliveryDate = chosenDate && dates.includes(chosenDate) ? chosenDate : dates[0]!;
    const picked = rules.slots.find((s) => s.id === slotId);
    const slot = (picked && slotAvailability(picked, deliveryDate, now, timing).ok ? picked : firstAvailable(rules.slots, deliveryDate, now, timing)) ?? picked ?? rules.slots[0]!;
    // A coupon limited to some categories/products only discounts the matching lines (the server applies the same rule).
    const restricted = !!coupon && ((coupon.categoryIds?.length ?? 0) > 0 || (coupon.productIds?.length ?? 0) > 0);
    const allowed = new Set(coupon?.categoryIds ?? []);
    for (let grew = true; grew; ) {
      grew = false;
      for (const c of categories) if (c.parentId && allowed.has(c.parentId) && !allowed.has(c.id)) { allowed.add(c.id); grew = true; }
    }
    const couponBase = restricted ? lines.filter((l) => coupon!.productIds?.includes(l.product.id) || allowed.has(l.product.categoryId)).reduce((n, l) => n + l.linePrice, 0) : undefined;
    const totals = computeTotals(lines, { coupon, slot, redeemPoints: redeem ? rupees : 0, couponBase });
    return { lines, totals, coupon, slot, deliveryDate, dates, timing, now, freeDeliveryThreshold: rules.freeDeliveryThreshold };
    // `delivery` is not read inside: it is here so the view is rebuilt when the store changes its delivery rules (getRules() then returns the new ones).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, couponCode, slotId, chosenDate, now, redeem, products, coupons, rupees, delivery, categories]);
}

export function useCartCount() {
  return useShop((s) => s.cart.reduce((n, l) => n + l.qty, 0));
}

/** The delivery slots the store currently offers (live backend: edited in the admin panel). */
export function useDeliverySlots() {
  useCatalog((s) => s.delivery);
  return getRules().slots;
}
