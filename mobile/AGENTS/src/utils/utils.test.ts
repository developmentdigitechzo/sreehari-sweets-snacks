import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addLine, mergeAddresses, mergeCarts, lineKey, setLineQty } from './cart';
import { scoreProduct } from './search';
import { isValidPhone, normalizePhone, validateIdentifier, validatePassword } from './validation';
import { computeTotals, evaluateCoupon } from '../services/pricing';
import { PRODUCTS, CATEGORIES } from '../data/seed';

test('mergeCarts adds quantities for the same variant and never duplicates a line', () => {
  const guest = [{ productId: 'p', variantId: 'a', qty: 2 }, { productId: 'q', variantId: 'b', qty: 1 }];
  const account = [{ productId: 'p', variantId: 'a', qty: 3 }];
  const merged = mergeCarts(guest, account);
  assert.equal(merged.length, 2);
  assert.equal(merged.find((l) => l.variantId === 'a')?.qty, 5);
});

test('mergeCarts caps by stock', () => {
  const merged = mergeCarts([{ productId: 'p', variantId: 'a', qty: 5 }], [{ productId: 'p', variantId: 'a', qty: 5 }], () => 7);
  assert.equal(merged[0].qty, 7);
});

test('addLine refuses sold-out and caps at stock', () => {
  assert.equal(addLine([], { productId: 'p', variantId: 'a', qty: 1 }, 0).result, 'soldout');
  const r = addLine([{ productId: 'p', variantId: 'a', qty: 2 }], { productId: 'p', variantId: 'a', qty: 5 }, 4);
  assert.equal(r.lines[0].qty, 4);
  assert.equal(r.result, 'capped');
});

test('mergeAddresses does not duplicate the same address', () => {
  const a = { id: '1', label: 'Home' as const, name: 'A', phone: '1', line1: '12 Main', area: 'x', city: 'c', pincode: '600040', isDefault: true };
  const out = mergeAddresses([a], [{ ...a, id: '2' }, { ...a, id: '3', line1: '99 Other' }]);
  assert.equal(out.length, 2);
});

test('phone and identifier validation', () => {
  assert.equal(normalizePhone('98765 43210'), '+919876543210');
  assert.equal(isValidPhone('+91 98765 43210'), true);
  assert.equal(isValidPhone('12345'), false);
  assert.equal(validateIdentifier('a@b.co'), undefined);
  assert.ok(validateIdentifier('nope'));
});

test('password rules', () => {
  assert.ok(validatePassword('short1'));
  assert.ok(validatePassword('allletters'));
  assert.equal(validatePassword('Sweets2026'), undefined);
});

test('demo cart totals reconcile (840 - 100 - 74 + 40 = 706)', () => {
  const find = (id: string, label: string) => {
    const p = PRODUCTS.find((x) => x.id === id)!;
    return { product: p, variant: p.variants.find((v) => v.label === label)! };
  };
  const mk = (id: string, label: string, qty: number) => {
    const { product, variant } = find(id, label);
    return { product, variant, qty, lineMrp: variant.mrp * qty, linePrice: variant.price * qty };
  };
  const lines = [mk('mysore-pak', '250 g', 1), mk('motichoor-laddu', '500 g', 1), mk('mixture', '250 g', 2)];
  const coupon = { code: 'SHREE10', title: '', description: '', type: 'percent' as const, value: 10, minOrder: 499, maxDiscount: 100 };
  const t = computeTotals(lines, { coupon, slot: { id: 'express', title: 'Express', window: '', fee: 40, kind: 'express' } });
  assert.equal(t.total, 706);
  assert.equal(evaluateCoupon(coupon, 300).eligible, false);
});

test('search finds cakes and tolerates typos', () => {
  const cats = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
  const bf = PRODUCTS.find((p) => p.id === 'black-forest-cake')!;
  assert.ok(scoreProduct(bf, 'black forest', cats) > 0);
  assert.ok(scoreProduct(bf, 'blak forest', cats) > 0);
  assert.equal(scoreProduct(bf, 'mysore', cats), 0);
});

test('every cake product uses a cake image, never a sweets image', () => {
  const cakes = PRODUCTS.filter((p) => p.tags.includes('cake'));
  assert.ok(cakes.length >= 9);
  for (const c of cakes) assert.ok(c.images.every((i) => i.key?.startsWith('cake-')), c.id);
});


const L = (variantId: string, qty: number, options?: { flavour?: string; message?: string }) => ({ productId: 'p', variantId, qty, options });

test('same size with a different message or flavour stays a separate line', () => {
  let { lines } = addLine([], L('v1', 1, { flavour: 'Chocolate', message: 'Happy Birthday Anu' }), 10);
  lines = addLine(lines, L('v1', 1, { flavour: 'Chocolate', message: 'Happy Anniversary' }), 10).lines;
  lines = addLine(lines, L('v1', 1, { flavour: 'Mocha', message: 'Happy Birthday Anu' }), 10).lines;
  assert.equal(lines.length, 3);
});

test('identical configuration (case/space-insensitive message) merges into one line', () => {
  let { lines } = addLine([], L('v1', 1, { message: 'Happy Birthday' }), 10);
  lines = addLine(lines, L('v1', 2, { message: '  happy birthday ' }), 10).lines;
  assert.equal(lines.length, 1);
  assert.equal(lines[0].qty, 3);
});

test('stock is shared across all customised lines of one size', () => {
  let { lines } = addLine([], L('v1', 2, { message: 'A' }), 3);
  const r = addLine(lines, L('v1', 2, { message: 'B' }), 3);
  assert.equal(r.result, 'capped');
  assert.equal(r.lines.reduce((n, l) => n + l.qty, 0), 3);
  const again = addLine(r.lines, L('v1', 1, { message: 'C' }), 3);
  assert.equal(again.lines.reduce((n, l) => n + l.qty, 0), 3); // unchanged, nothing oversold
});

test('setLineQty respects stock used by sibling lines and 0 removes', () => {
  const lines = [L('v1', 2, { message: 'A' }), L('v1', 1, { message: 'B' })];
  const a = setLineQty(lines, lineKey(lines[0]), 9, 4);
  assert.equal(a[0].qty, 3); // 4 in stock - 1 used by line B
  assert.equal(setLineQty(lines, lineKey(lines[1]), 0, 4).length, 1);
});

test('merging carts keeps differently customised cakes and caps per-size stock', () => {
  const guest = [L('v1', 2, { message: 'A' }), L('v1', 1, { message: 'B' })];
  const account = [L('v1', 1, { message: 'A' })];
  const out = mergeCarts(guest, account, () => 4);
  assert.equal(out.length, 2);
  assert.equal(out.reduce((n, l) => n + l.qty, 0), 4);
});

test('every variant has a unique SKU and a unique id (BRD: unique SKU per sellable variant)', () => {
  const skus = PRODUCTS.flatMap((p) => p.variants.map((v) => v.sku));
  const ids = PRODUCTS.flatMap((p) => p.variants.map((v) => v.id));
  assert.equal(new Set(skus).size, skus.length);
  assert.equal(new Set(ids).size, ids.length);
});

test('merging the server copy of the SAME cart does not double quantities (max mode), while guest + account still add up', () => {
  const v = PRODUCTS[0].variants[0].id;
  const pid = PRODUCTS[0].id;
  const local = [{ productId: pid, variantId: v, qty: 2 }];
  const server = [{ productId: pid, variantId: v, qty: 2 }];
  // app restart: local and server are the same cart -> still 2, however many times it is merged
  let cart = mergeCarts(local, server, () => 20, 'max');
  cart = mergeCarts(cart, server, () => 20, 'max');
  assert.equal(cart.length, 1);
  assert.equal(cart[0].qty, 2);
  // a guest cart joining an account is two separate additions
  assert.equal(mergeCarts(local, server, () => 20)[0].qty, 4);
  // an item only one side has is kept
  const extra = [{ productId: pid, variantId: PRODUCTS[0].variants[1]?.id ?? v, qty: 1 }];
  assert.ok(mergeCarts(local, [...server, ...extra], () => 20, 'max').length >= 1);
});

test('a picture saved with a localhost address loads from the API the app talks to; other pictures are untouched', async () => {
  const { rewriteLocalUploadUrl } = await import('./imageUri');
  const api = 'http://192.168.1.3:4000/api';
  assert.equal(rewriteLocalUploadUrl('http://localhost:4000/uploads/a.jpg', api), 'http://192.168.1.3:4000/uploads/a.jpg');
  assert.equal(rewriteLocalUploadUrl('http://127.0.0.1:4000/uploads/b.webp', api), 'http://192.168.1.3:4000/uploads/b.webp');
  assert.equal(rewriteLocalUploadUrl('https://cdn.example.com/uploads/c.jpg', api), 'https://cdn.example.com/uploads/c.jpg');
  assert.equal(rewriteLocalUploadUrl('http://localhost:4000/other/d.jpg', api), 'http://localhost:4000/other/d.jpg');
  assert.equal(rewriteLocalUploadUrl('http://localhost:4000/uploads/a.jpg', 'not a url'), 'http://localhost:4000/uploads/a.jpg');
});
