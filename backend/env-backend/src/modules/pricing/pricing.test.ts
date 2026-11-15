import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeTotals, evaluateCoupon } from './pricing.js';

const lines = [
  { mrp: 200, price: 180, qty: 1 },
  { mrp: 360, price: 320, qty: 1 },
  { mrp: 140, price: 120, qty: 2 },
];
const SHREE10 = { code: 'SHREE10', type: 'PERCENT' as const, value: 10, minOrder: 499, maxDiscount: 100 };

test('demo cart totals reconcile: 840 - 100 - 74 + 40 = 706', () => {
  const t = computeTotals(lines, { coupon: SHREE10, slotFee: 40 });
  assert.equal(t.mrpTotal, 840);
  assert.equal(t.itemDiscount, 100);
  assert.equal(t.subtotal, 740);
  assert.equal(t.couponDiscount, 74);
  assert.equal(t.deliveryFee, 40);
  assert.equal(t.total, 706);
});

test('coupon below minimum explains why', () => {
  const r = evaluateCoupon(SHREE10, 300);
  assert.equal(r.eligible, false);
  assert.match(r.reason ?? '', /Add ₹199 more/);
});

test('expired coupon is rejected', () => {
  const r = evaluateCoupon({ ...SHREE10, expiresAt: new Date('2020-01-01') }, 740);
  assert.equal(r.eligible, false);
  assert.match(r.reason ?? '', /expired/);
});

test('usage cap blocks over-redemption', () => {
  const r = evaluateCoupon({ ...SHREE10, usageLimit: 5, usedCount: 5 }, 740);
  assert.equal(r.eligible, false);
});

test('percent discount is capped by maxDiscount', () => {
  assert.equal(evaluateCoupon(SHREE10, 5000).discount, 100);
});

test('free delivery at the threshold and with FREESHIP', () => {
  assert.equal(computeTotals([{ mrp: 1600, price: 1500, qty: 1 }], { slotFee: 40 }).deliveryFee, 0);
  const free = { code: 'FREESHIP', type: 'FREESHIP' as const, value: 0, minOrder: 100 };
  assert.equal(computeTotals([{ mrp: 200, price: 180, qty: 1 }], { coupon: free, slotFee: 40 }).deliveryFee, 0);
});

test('rewards never push the total below zero', () => {
  assert.equal(computeTotals([{ mrp: 50, price: 50, qty: 1 }], { slotFee: 0, redeemRupees: 500 }).total, 0);
});
