/* eslint-disable @typescript-eslint/no-explicit-any -- API responses are untyped JSON; property access in this test file is intentionally loose */
/**
 * Regression tests for fixes and features that must never quietly break again:
 *   - a customer cannot mark their own real payment as paid
 *   - Cash on Delivery points are earned on delivery, not on placement
 *   - orders of real customers are not stored as demo orders
 *   - a customer can cancel their own order only while it is untouched and unpaid; stock, points and payment follow
 *   - delivery dates and slot rules (India time), and the admin settings behind them
 *   - CSV bulk import of categories and products
 *
 * Run against a THROWAWAY database only: `npm run test:integration:all -- regression` (see scripts/run-integration.cjs).
 * Manual start: OTP_PROVIDER=dev EMAIL_PROVIDER=dev PAYMENT_PROVIDER=test AUTH_RATE_LIMIT_PER_MIN=500 ADMIN_LOGIN_RATE_LIMIT=1000 CHECKOUT_RATE_LIMIT_PER_MIN=1000 PORT=4017
 */
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../modules/auth/password.js';
import { signPayment, TEST_SECRETS } from '../modules/payments/providers.js';

const API = process.env.API_URL ?? 'http://localhost:4017/api';
const prisma = new PrismaClient();
const run = Date.now().toString().slice(-6);
const PW = 'Correct-horse-9';
type R = { status: number; json: any; text: string };

async function call(method: string, path: string, body?: unknown, token?: string): Promise<R> {
  const res = await fetch(`${API}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json, text };
}

let admin = '';
let seq = 0;
const phone = () => `+9186${run}${String(++seq).padStart(2, '0')}`;
const address = { label: 'Home', name: 'Regression Buyer', phone: '+919876543210', line1: '12 Main Road', area: 'Anna Nagar', city: 'Chennai', pincode: '600040' };

const signup = async (tag: string) => {
  const r = await call('POST', '/auth/signup', { name: `Reg ${tag} ${run}`, phone: phone(), password: PW, consent: true });
  assert.equal(r.status, 201, r.text);
  return { token: r.json.token as string, id: r.json.user.id as string };
};
async function newProduct(name: string, price = 100, stock = 20) {
  const sku = `RG-${run}-${++seq}`;
  const r = await call('POST', '/admin/products', { name: `${name} ${run}`, categoryId: 'milk-sweets', variants: [{ sku, label: '250g', mrp: price + 20, price, stock }] }, admin);
  assert.equal(r.status, 201, r.text);
  return { id: r.json.id as string, variantId: r.json.variants[0].id as string };
}
const place = (token: string, p: { id: string; variantId: string }, extra: Record<string, unknown> = {}) =>
  call('POST', '/orders', { idempotencyKey: `rg-${run}-${Math.random()}`, items: [{ productId: p.id, variantId: p.variantId, qty: 1 }], paymentMethod: 'cod', slotId: 'express', address, redeemPoints: 0, simulatedOutcome: 'success', ...extra }, token);
const balance = async (token: string) => (await call('GET', '/me/rewards', undefined, token)).json.balance as number;
const stockOf = async (variantId: string) => (await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stock;
const istDate = (d: Date) => new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 10);
const addDays = (s: string, n: number) => new Date(Date.parse(`${s}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const resetDelivery = () => call('PUT', '/admin/delivery', { freeDeliveryThreshold: 1499, codLimit: 2000, maxAdvanceDays: 2, cutoffMinutes: 60, slots: {} }, admin);

before(async () => {
  await prisma.customer.create({ data: { name: `Reg Owner ${run}`, email: `owner${run}@rg.example`, phone: phone(), role: 'SUPER_ADMIN', passwordHash: await hashPassword(PW) } });
  admin = (await call('POST', '/admin/auth/login', { email: `owner${run}@rg.example`, password: PW })).json.token;
  assert.ok(admin);
  await resetDelivery();
});
after(async () => {
  await resetDelivery();
  await prisma.$disconnect();
});

describe('Payments: a customer cannot pay for their own order by themselves', () => {
  test('reconcile leaves a real pending payment pending and grants nothing', async () => {
    const u = await signup('pay1');
    const p = await newProduct('Reg Payment Sweet');
    const o = await place(u.token, p, { paymentMethod: 'upi' });
    assert.equal(o.status, 201, o.text);
    assert.equal(o.json.outcome, 'requires_payment');
    const id = o.json.order.id;
    const rec = await call('POST', `/orders/${id}/reconcile`, undefined, u.token);
    assert.equal(rec.status, 200);
    assert.equal(rec.json.status, 'pending');
    const pay = await prisma.payment.findUniqueOrThrow({ where: { orderId: id } });
    assert.equal(pay.status, 'PENDING');
    assert.equal(pay.simulated, false);
    assert.equal(await balance(u.token), 0);
  });

  test('the signed provider confirmation still works, and then earns points', async () => {
    const u = await signup('pay2');
    const p = await newProduct('Reg Verified Sweet');
    const o = await place(u.token, p, { paymentMethod: 'upi' });
    const sig = signPayment(TEST_SECRETS, o.json.payment.providerOrderId, `pay_rg_${run}`);
    const ok = await call('POST', '/payments/verify', { orderId: o.json.order.id, paymentId: `pay_rg_${run}`, signature: sig }, u.token);
    assert.equal(ok.json.status, 'paid');
    assert.ok((await balance(u.token)) > 0);
  });
});

describe('Cash on Delivery: points are earned on delivery', () => {
  test('nothing at placement, points and a paid payment once it is delivered', async () => {
    const u = await signup('cod1');
    const p = await newProduct('Reg COD Sweet', 100);
    const o = await place(u.token, p);
    assert.equal(o.status, 201, o.text);
    const id = o.json.order.id;
    const total = o.json.order.totals.total as number; // 100 + 40 express fee
    assert.equal(await balance(u.token), 0);
    for (const status of ['CONFIRMED', 'PREPARING', 'PACKED', 'OUT_FOR_DELIVERY']) {
      assert.equal((await call('POST', `/admin/orders/${id}/status`, { status }, admin)).status, 200, status);
      assert.equal(await balance(u.token), 0, `no points while ${status}`);
    }
    assert.equal((await call('POST', `/admin/orders/${id}/status`, { status: 'DELIVERED' }, admin)).status, 200);
    assert.equal(await balance(u.token), Math.floor(total * 0.1));
    assert.equal((await prisma.payment.findUniqueOrThrow({ where: { orderId: id } })).status, 'PAID');
  });
});

describe('Order flags', () => {
  test('an order from a real customer is not stored as a demo order', async () => {
    const u = await signup('flag1');
    const p = await newProduct('Reg Flag Sweet');
    const o = await place(u.token, p);
    assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: o.json.order.id } })).isDemo, false);
    assert.equal(o.json.order.isDemo, false);
  });
});

describe('Customer cancels their own order', () => {
  test('a fresh Cash on Delivery order: cancelled, stock and redeemed points come back', async () => {
    const u = await signup('can1');
    const p = await newProduct('Reg Cancel Sweet', 100, 10);
    await prisma.rewardLedger.create({ data: { customerId: u.id, points: 100, note: 'regression test balance' } });
    const o = await place(u.token, p, { redeemPoints: 5 }); // Rs 5 off = 50 points
    assert.equal(o.status, 201, o.text);
    assert.equal(await stockOf(p.variantId), 9);
    assert.equal(await balance(u.token), 50);
    const c = await call('POST', `/orders/${o.json.order.id}/cancel`, undefined, u.token);
    assert.equal(c.status, 200, c.text);
    assert.equal(c.json.status, 'cancelled');
    assert.equal(c.json.payment.status, 'cancelled');
    assert.equal(await stockOf(p.variantId), 10);
    assert.equal(await balance(u.token), 100);
    assert.equal((await call('POST', `/orders/${o.json.order.id}/cancel`, undefined, u.token)).status, 409);
  });

  test("nobody can cancel someone else's order", async () => {
    const owner = await signup('can2a');
    const other = await signup('can2b');
    const o = await place(owner.token, await newProduct('Reg Private Sweet'));
    assert.equal((await call('POST', `/orders/${o.json.order.id}/cancel`, undefined, other.token)).status, 404);
    assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: o.json.order.id } })).status, 'PLACED');
  });

  test('once the store has confirmed it, it can only be requested', async () => {
    const u = await signup('can3');
    const o = await place(u.token, await newProduct('Reg Confirmed Sweet'));
    await call('POST', `/admin/orders/${o.json.order.id}/status`, { status: 'CONFIRMED' }, admin);
    const c = await call('POST', `/orders/${o.json.order.id}/cancel`, undefined, u.token);
    assert.equal(c.status, 409);
    assert.equal(c.json.error.code, 'BAD_STATE');
    assert.equal((await call('POST', `/orders/${o.json.order.id}/return-requests`, { kind: 'CANCELLATION', reason: 'Changed my mind' }, u.token)).status, 201);
  });

  test('an online order that is still unpaid can be cancelled; a paid one cannot', async () => {
    const u = await signup('can4');
    const p = await newProduct('Reg Online Sweet', 100, 10);
    const unpaid = await place(u.token, p, { paymentMethod: 'upi' });
    assert.equal((await call('POST', `/orders/${unpaid.json.order.id}/cancel`, undefined, u.token)).status, 200);
    assert.equal(await stockOf(p.variantId), 10);

    const paid = await place(u.token, p, { paymentMethod: 'upi' });
    const sig = signPayment(TEST_SECRETS, paid.json.payment.providerOrderId, `pay_rg2_${run}`);
    assert.equal((await call('POST', '/payments/verify', { orderId: paid.json.order.id, paymentId: `pay_rg2_${run}`, signature: sig }, u.token)).status, 200);
    const c = await call('POST', `/orders/${paid.json.order.id}/cancel`, undefined, u.token);
    assert.equal(c.status, 409);
    assert.match(c.json.error.message, /paid/i);
  });
});

describe('Delivery date and slots', () => {
  const today = istDate(new Date());
  const tomorrow = addDays(today, 1);

  test('the date is stored with the order; express is today only; past, far and malformed dates are refused', async () => {
    const u = await signup('dd1');
    const p = await newProduct('Reg Date Sweet', 100, 30);
    const ok = await place(u.token, p, { slotId: 'slot-2', deliveryDate: tomorrow });
    assert.equal(ok.status, 201, ok.text);
    assert.equal(ok.json.order.slot.date, tomorrow);
    assert.equal((await place(u.token, p)).json.order.slot.date, today);

    const express = await place(u.token, p, { deliveryDate: tomorrow });
    assert.equal(express.status, 422);
    assert.equal(express.json.error.code, 'EXPRESS_TODAY_ONLY');
    assert.equal((await place(u.token, p, { slotId: 'slot-1', deliveryDate: addDays(today, -1) })).json.error.code, 'BAD_DATE');
    assert.equal((await place(u.token, p, { slotId: 'slot-1', deliveryDate: addDays(today, 3) })).json.error.code, 'DATE_TOO_FAR');
    assert.equal((await place(u.token, p, { slotId: 'slot-1', deliveryDate: 'tomorrow' })).status, 400);
  });

  test('a timed slot closed for today stays bookable for tomorrow (admin sets its time to the very start of the day)', async () => {
    try {
      const put = await call('PUT', '/admin/delivery', { freeDeliveryThreshold: 1499, codLimit: 2000, maxAdvanceDays: 2, cutoffMinutes: 0, slots: { 'slot-1': { start: '00:00', end: '00:01' } } }, admin);
      assert.equal(put.status, 200, put.text);
      const u = await signup('dd2');
      const p = await newProduct('Reg Closed Sweet', 100, 10);
      const closed = await place(u.token, p, { slotId: 'slot-1' });
      assert.equal(closed.status, 422);
      assert.equal(closed.json.error.code, 'SLOT_CLOSED');
      assert.equal((await place(u.token, p, { slotId: 'slot-1', deliveryDate: tomorrow })).status, 201);
    } finally {
      await resetDelivery();
    }
  });

  test('"today only" store: no scheduling ahead', async () => {
    try {
      await call('PUT', '/admin/delivery', { freeDeliveryThreshold: 1499, codLimit: 2000, maxAdvanceDays: 0, cutoffMinutes: 60, slots: {} }, admin);
      const u = await signup('dd3');
      const r = await place(u.token, await newProduct('Reg Today Sweet'), { slotId: 'slot-2', deliveryDate: tomorrow });
      assert.equal(r.json.error.code, 'DATE_TOO_FAR');
    } finally {
      await resetDelivery();
    }
  });

  test('admin wording and times reach the app catalogue; bad times are refused; older clients keep the limits', async () => {
    try {
      const before = (await call('GET', '/admin/delivery', undefined, admin)).json;
      assert.equal(before.maxAdvanceDays, 2);
      assert.equal(before.slots.find((s: any) => s.id === 'slot-1').start, '13:00');
      const put = await call('PUT', '/admin/delivery', { freeDeliveryThreshold: 1499, codLimit: 2000, maxAdvanceDays: 3, cutoffMinutes: 30, slots: { 'slot-1': { title: 'Lunch', window: '12:00 PM - 2:00 PM', start: '12:00', end: '14:00' } } }, admin);
      assert.equal(put.status, 200, put.text);
      const cat = (await call('GET', '/catalog')).json.delivery;
      const s1 = cat.slots.find((s: any) => s.id === 'slot-1');
      assert.deepEqual([s1.title, s1.window, s1.start, s1.end, cat.maxAdvanceDays, cat.cutoffMinutes], ['Lunch', '12:00 PM - 2:00 PM', '12:00', '14:00', 3, 30]);

      assert.equal((await call('PUT', '/admin/delivery', { freeDeliveryThreshold: 1, codLimit: 1, slots: { 'slot-1': { start: '15:00', end: '14:00' } } }, admin)).status, 422);
      assert.equal((await call('PUT', '/admin/delivery', { freeDeliveryThreshold: 1, codLimit: 1, slots: { 'slot-1': { start: '25:00' } } }, admin)).status, 400);

      await call('PUT', '/admin/delivery', { freeDeliveryThreshold: 1499, codLimit: 2000, slots: {} }, admin); // an older client: no timing fields
      const kept = (await call('GET', '/admin/delivery', undefined, admin)).json;
      assert.deepEqual([kept.maxAdvanceDays, kept.cutoffMinutes], [3, 30]);
    } finally {
      await resetDelivery();
    }
  });
});

describe('CSV bulk import', () => {
  const csvCats = `name,parent,sort_order,active\nRG Dry Fruit ${run},Sweets,60,yes\nRG Hampers ${run},RG Dry Fruit ${run},,yes\nSweets,,,\nRG Orphan ${run},No Such Parent,,\n`;

  test('categories: the preview writes nothing; the import creates parents before children and skips what exists', async () => {
    const count = () => prisma.category.count({ where: { id: { startsWith: 'rg-' } } });
    const before = await count();
    const preview = await call('POST', '/admin/import/categories', { csv: csvCats }, admin);
    assert.equal(preview.status, 200, preview.text);
    assert.deepEqual([preview.json.committed, preview.json.summary.ready, preview.json.summary.skipped, preview.json.summary.errors], [false, 2, 1, 1]);
    assert.equal(await count(), before);

    const done = await call('POST', '/admin/import/categories', { csv: csvCats, commit: true }, admin);
    assert.equal(done.json.summary.created, 2);
    const child = await prisma.category.findUniqueOrThrow({ where: { id: `rg-hampers-${run}` } });
    assert.equal(child.parentId, `rg-dry-fruit-${run}`);
    assert.equal((await call('POST', '/admin/import/categories', { csv: csvCats, commit: true }, admin)).json.summary.created, 0);
  });

  test('products: sizes of one name become one product with opening stock; bad rows are reported and skipped', async () => {
    const csv = [
      'name,category,size,mrp,price,stock',
      `RG Roll ${run},RG Hampers ${run},250 g,400,380,40`,
      `RG Roll ${run},RG Hampers ${run},500 g,780,740,25`,
      `RG Overpriced ${run},RG Hampers ${run},250 g,100,150,5`,
      `RG Lost ${run},Not A Category,250 g,100,90,5`,
    ].join('\n');
    const preview = await call('POST', '/admin/import/products', { csv }, admin);
    assert.deepEqual([preview.json.summary.ready, preview.json.summary.errors], [1, 2]);
    assert.equal(await prisma.product.count({ where: { name: `RG Roll ${run}` } }), 0);

    const done = await call('POST', '/admin/import/products', { csv, commit: true }, admin);
    assert.equal(done.json.summary.created, 1);
    const prod = await prisma.product.findFirstOrThrow({ where: { name: `RG Roll ${run}` }, include: { variants: true } });
    assert.equal(prod.variants.length, 2);
    assert.deepEqual(prod.variants.map((v) => v.stock).sort(), [25, 40]);
    assert.equal(await prisma.stockMovement.count({ where: { variantId: { in: prod.variants.map((v) => v.id) }, reason: 'RESTOCK' } }), 2);
    assert.equal((await call('POST', '/admin/import/products', { csv, commit: true }, admin)).json.summary.created, 0); // already there: skipped
  });

  test('a file with the wrong columns is refused, and a customer cannot import', async () => {
    assert.equal((await call('POST', '/admin/import/products', { csv: 'title,price\nA,1' }, admin)).status, 422);
    const u = await signup('imp1');
    assert.equal((await call('POST', '/admin/import/products', { csv: 'name,category,price\nX,Y,1' }, u.token)).status, 403);
  });
});

describe('Sign up with a one-time code', () => {
  const ask = (phoneNo: string, purpose = 'signup') => call('POST', '/auth/otp/request', { phone: phoneNo, purpose });
  const check = (phoneNo: string, code: string, purpose = 'signup') => call('POST', '/auth/otp/verify', { phone: phoneNo, purpose, code });

  test('a new number: code, verification, then name creates the account, already verified and without a password', async () => {
    const number = phone();
    const sent = await ask(number);
    assert.equal(sent.status, 202, sent.text);
    assert.equal(sent.json.delivery, 'development');
    assert.match(sent.json.devCode, /^[0-9]{6}$/);

    const wrong = await check(number, sent.json.devCode === '000000' ? '111111' : '000000');
    assert.equal(wrong.json.error.code, 'OTP_WRONG');
    const ok = await check(number, sent.json.devCode);
    assert.equal(ok.status, 200, ok.text);
    assert.ok(ok.json.signupToken);
    assert.equal(await prisma.customer.count({ where: { phone: number } }), 0); // nothing is created until the name is given

    const done = await call('POST', '/auth/signup/complete', { signupToken: ok.json.signupToken, name: 'Code Customer', consent: true });
    assert.equal(done.status, 201, done.text);
    assert.equal(done.json.user.phone, number);
    const row = await prisma.customer.findUniqueOrThrow({ where: { phone: number } });
    assert.ok(row.phoneVerifiedAt);
    assert.equal(row.passwordHash, null);
    assert.equal((await call('GET', '/auth/me', undefined, done.json.token)).status, 200);
  });

  test('a number that already has an account is told to log in instead', async () => {
    const u = await signup('sc1');
    const me = (await call('GET', '/auth/me', undefined, u.token)).json.user;
    const r = await ask(me.phone);
    assert.equal(r.status, 409);
    assert.equal(r.json.error.code, 'CONFLICT');
  });

  test('the proof is single-purpose: refused when missing, forged or reused, and useless as a sign-in token', async () => {
    const number = phone();
    const code = (await ask(number)).json.devCode;
    const proof = (await check(number, code)).json.signupToken as string;
    assert.equal((await call('POST', '/auth/signup/complete', { signupToken: 'not-a-token-at-all', name: 'Someone', consent: true })).status, 401);
    assert.equal((await call('POST', '/auth/signup/complete', { signupToken: proof, name: 'Someone' })).status, 400); // no consent
    assert.equal((await call('GET', '/auth/me', undefined, proof)).status, 401); // not a login token
    assert.equal((await call('POST', '/auth/signup/complete', { signupToken: proof, name: 'Someone', consent: true })).status, 201);
    assert.equal((await call('POST', '/auth/signup/complete', { signupToken: proof, name: 'Someone', consent: true })).status, 409); // reused
  });

  test('the email, when given, must be new', async () => {
    const email = `code${run}@rg.example`;
    const numberA = phone();
    const proofA = (await check(numberA, (await ask(numberA)).json.devCode)).json.signupToken;
    const first = await call('POST', '/auth/signup/complete', { signupToken: proofA, name: 'First Owner', email, consent: true });
    assert.equal(first.status, 201, first.text);

    const numberB = phone();
    const proofB = (await check(numberB, (await ask(numberB)).json.devCode)).json.signupToken;
    const second = await call('POST', '/auth/signup/complete', { signupToken: proofB, name: 'Second Owner', email, consent: true });
    assert.equal(second.status, 409);
    assert.equal(second.json.error.field, 'email');
    // The failed attempt did not use up the proof: the same number can still finish without that email.
    assert.equal((await call('POST', '/auth/signup/complete', { signupToken: proofB, name: 'Second Owner', consent: true })).status, 201);
  });

  test('the new customer can then log in with a code, and a suspended customer cannot', async () => {
    const number = phone();
    const proof = (await check(number, (await ask(number)).json.devCode)).json.signupToken;
    const created = await call('POST', '/auth/signup/complete', { signupToken: proof, name: 'Returning Customer', consent: true });
    const login = await ask(number, 'login');
    const back = await check(number, login.json.devCode, 'login');
    assert.equal(back.status, 200, back.text);
    assert.equal(back.json.user.id, created.json.user.id);

    await prisma.customer.update({ where: { id: created.json.user.id }, data: { isBlocked: true } });
    await new Promise((r) => setTimeout(r, 1300)); // the resend cool-down is 1 second in this suite
    const again = await ask(number, 'login');
    const blocked = await check(number, again.json.devCode, 'login');
    assert.equal(blocked.status, 403);
    assert.equal(blocked.json.error.code, 'ACCOUNT_BLOCKED');
  });
});
