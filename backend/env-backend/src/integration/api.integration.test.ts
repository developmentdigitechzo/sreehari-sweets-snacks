/**
 * Integration tests against a REAL running API + PostgreSQL.
 *   API_URL=http://localhost:4011/api DATABASE_URL=postgresql://... npm run test:integration
 * The database must be migrated and seeded (npm run seed). Use a throwaway test database, never production.
 */
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { PrismaClient } from '@prisma/client';

const API = process.env.API_URL ?? 'http://localhost:4011/api';
const prisma = new PrismaClient();
const run = Date.now().toString().slice(-7);

// Test helper: API responses are untyped JSON, so property access is intentionally loose here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = Record<string, any>;
async function call(method: string, path: string, body?: unknown, token?: string, extra?: Record<string, string>) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: J = {};
  try { json = text ? JSON.parse(text) : {}; } catch { /* non-JSON (204) */ }
  return { status: res.status, json };
}

const phone = (n: number) => `+9198${run}${n}`.slice(0, 13);
const addr = (extra: J = {}) => ({ label: 'Home', name: 'Test User', phone: '+919800000000', line1: '12 Test Street', area: 'Anna Nagar', city: 'Chennai', pincode: '600040', ...extra });

let tokenA = '', tokenB = '';
let userA: J = {};

before(async () => {
  const h = await call('GET', '/health');
  assert.equal(h.status, 200, 'API must be running');
});
after(async () => { await prisma.$disconnect(); });

describe('auth', () => {
  test('weak password, missing consent and bad phone are rejected (400)', async () => {
    const base = { name: 'Anu', phone: phone(1), password: 'Sweets2026', consent: true };
    assert.equal((await call('POST', '/auth/signup', { ...base, password: 'short' })).status, 400);
    assert.equal((await call('POST', '/auth/signup', { ...base, consent: false })).status, 400);
    assert.equal((await call('POST', '/auth/signup', { ...base, phone: '12345' })).status, 400);
  });

  test('signup creates an account, never returns the password hash, and rejects duplicates', async () => {
    const body = { name: 'Anu Tester', phone: phone(1), email: `anu${run}@example.com`, password: 'Sweets2026', consent: true };
    const r = await call('POST', '/auth/signup', body);
    assert.equal(r.status, 201);
    assert.ok(r.json.token);
    assert.ok(!JSON.stringify(r.json).includes('passwordHash'));
    tokenA = r.json.token; userA = r.json.user;
    const dupPhone = await call('POST', '/auth/signup', { ...body, email: undefined });
    assert.equal(dupPhone.status, 409);
    assert.equal(dupPhone.json.error.field, 'phone');
    const dupEmail = await call('POST', '/auth/signup', { ...body, phone: phone(2) });
    assert.equal(dupEmail.status, 409);
    assert.equal(dupEmail.json.error.field, 'email');
    const b = await call('POST', '/auth/signup', { name: 'Bala Tester', phone: phone(3), password: 'Sweets2026', consent: true });
    assert.equal(b.status, 201);
    tokenB = b.json.token;
  });

  test('the stored password is a salted scrypt hash, not plain text', async () => {
    const c = await prisma.customer.findUnique({ where: { phone: phone(1) } });
    assert.ok(c?.passwordHash?.startsWith('scrypt$'));
    assert.ok(!c?.passwordHash?.includes('Sweets2026'));
  });

  test('login works by phone and by email; wrong password and unknown user get the SAME 401 message', async () => {
    assert.equal((await call('POST', '/auth/login', { identifier: phone(1), password: 'Sweets2026' })).status, 200);
    assert.equal((await call('POST', '/auth/login', { identifier: `anu${run}@example.com`, password: 'Sweets2026' })).status, 200);
    const wrong = await call('POST', '/auth/login', { identifier: phone(1), password: 'Wrong1234' });
    const unknown = await call('POST', '/auth/login', { identifier: '+919999999990', password: 'Wrong1234' });
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.equal(wrong.json.error.message, unknown.json.error.message);
  });

  test('protected routes need a token, and a bad token is rejected', async () => {
    assert.equal((await call('GET', '/me/addresses')).status, 401);
    assert.equal((await call('GET', '/me/addresses', undefined, 'not.a.token')).status, 401);
    assert.equal((await call('GET', '/auth/me', undefined, tokenA)).status, 200);
  });

  test('forgot-password with no email provider says so (503) instead of pretending it sent mail', async () => {
    const r = await call('POST', '/auth/forgot-password', { email: 'a@b.co' });
    assert.equal(r.status, 503);
    assert.equal(r.json.error.code, 'EMAIL_NOT_CONFIGURED');
  });
});

describe('catalogue (cakes)', () => {
  test('catalogue serves nine cakes with options and no sweets images', async () => {
    const r = await call('GET', '/catalog');
    assert.equal(r.status, 200);
    const cakes = (r.json.products as J[]).filter((p) => p.tags.includes('cake'));
    assert.ok(cakes.length >= 9);
    for (const c of cakes) {
      assert.ok(c.cake?.notice, `${c.id} has the delivery notice`);
      assert.ok(c.images.every((i: J) => i.key?.startsWith('cake-')));
    }
    assert.ok((r.json.categories as J[]).filter((c) => c.parentId === 'cakes').length === 9);
  });
});

describe('addresses (GPS) and ownership', () => {
  let id = '';
  test('create with confirmed GPS coordinates, then read back', async () => {
    const r = await call('POST', '/me/addresses', addr({ latitude: 13.0827, longitude: 80.2707, landmark: 'Near park', state: 'Tamil Nadu' }), tokenA);
    assert.equal(r.status, 201);
    assert.equal(r.json.latitude, 13.0827);
    assert.equal(r.json.isDefault, true); // first address becomes default
    id = r.json.id;
    const list = await call('GET', '/me/addresses', undefined, tokenA);
    assert.equal(list.json.length, 1);
  });
  test('latitude without longitude and out-of-range values are rejected', async () => {
    assert.equal((await call('POST', '/me/addresses', addr({ latitude: 13.1 }), tokenA)).status, 400);
    assert.equal((await call('POST', '/me/addresses', addr({ latitude: 95, longitude: 10 }), tokenA)).status, 400);
  });
  test('another customer cannot see, edit or delete it (404, not 403)', async () => {
    assert.equal((await call('GET', '/me/addresses', undefined, tokenB)).json.length, 0);
    assert.equal((await call('PUT', `/me/addresses/${id}`, addr(), tokenB)).status, 404);
    assert.equal((await call('DELETE', `/me/addresses/${id}`, undefined, tokenB)).status, 404);
  });
  test('owner can edit then delete', async () => {
    const u = await call('PUT', `/me/addresses/${id}`, addr({ line1: '99 Changed Road' }), tokenA);
    assert.equal(u.status, 200);
    assert.equal(u.json.line1, '99 Changed Road');
    assert.equal((await call('DELETE', `/me/addresses/${id}`, undefined, tokenA)).status, 204);
    assert.equal((await call('GET', '/me/addresses', undefined, tokenA)).json.length, 0);
  });
});

describe('cart persistence with customised cakes', () => {
  const variantId = 'chocolate-truffle-cake-1kg';
  test('differently customised lines of one size persist as separate rows', async () => {
    const put = await call('PUT', '/me/cart', {
      items: [
        { variantId, qty: 1, options: { flavour: 'Chocolate', message: 'Happy Birthday Anu' } },
        { variantId, qty: 1, options: { flavour: 'Mocha', message: 'Happy Birthday Anu' } },
        { variantId, qty: 2, options: { flavour: 'Chocolate', message: ' happy birthday anu ' } }, // same as line 1
      ],
    }, tokenA);
    assert.equal(put.status, 200);
    assert.equal(put.json.items.length, 2);
    const get = await call('GET', '/me/cart', undefined, tokenA);
    assert.equal(get.json.items.length, 2);
    assert.equal(get.json.items.find((i: J) => i.options?.flavour === 'Chocolate').qty, 3);
  });
  test('quantity per size is capped by stock across all of its lines', async () => {
    const stock = (await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stock;
    const put = await call('PUT', '/me/cart', { items: [
      { variantId, qty: 20, options: { message: 'A' } },
      { variantId, qty: 20, options: { message: 'B' } },
    ] }, tokenA);
    assert.equal(put.json.items.reduce((n: number, i: J) => n + i.qty, 0), Math.min(stock, 40));
  });
  test("one customer's cart is invisible to another", async () => {
    assert.equal((await call('GET', '/me/cart', undefined, tokenB)).json.items.length, 0);
  });
  test('sold-out sizes and unknown variants are dropped', async () => {
    // Make the size sold out here instead of relying on seed data (a fresh seed starts every size in stock).
    await prisma.productVariant.update({ where: { id: 'red-velvet-cake-2kg' }, data: { stock: 0 } });
    const put = await call('PUT', '/me/cart', { items: [{ variantId: 'red-velvet-cake-2kg', qty: 1 }, { variantId: 'nope', qty: 1 }] }, tokenA);
    assert.equal(put.json.items.length, 0);
  });
});

describe('orders', () => {
  const key = () => `itest-${run}-${Math.random().toString(36).slice(2, 10)}`;
  const order = (extra: J = {}) => ({
    idempotencyKey: key(),
    items: [{ productId: 'mysore-pak', variantId: 'mysore-pak-250g', qty: 2 }],
    // Cash on delivery: this suite runs the API with no payment gateway, where online methods are refused (see the test below).
    slotId: 'express', address: addr(), paymentMethod: 'cod', simulatedOutcome: 'success', redeemPoints: 0, ...extra,
  });

  test('unauthenticated order is rejected', async () => {
    assert.equal((await call('POST', '/orders', order())).status, 401);
  });

  test('server recalculates price: a tampered client price is ignored', async () => {
    const r = await call('POST', '/orders', { ...order(), total: 1, price: 1, items: [{ productId: 'mysore-pak', variantId: 'mysore-pak-250g', qty: 2, price: 1 }] }, tokenA);
    assert.equal(r.status, 201);
    assert.equal(r.json.order.totals.subtotal, 360); // 2 x 180 from the database
    assert.equal(r.json.order.totals.total, 400); // + 40 express delivery
  });

  test('idempotency: the same key returns the same order and stock is taken once', async () => {
    const before = (await prisma.productVariant.findUniqueOrThrow({ where: { id: 'mixture-250g' } })).stock;
    const o = order({ items: [{ productId: 'mixture', variantId: 'mixture-250g', qty: 3 }] });
    const [a, b] = await Promise.all([call('POST', '/orders', o, tokenA), call('POST', '/orders', o, tokenA)]);
    assert.ok([a.status, b.status].every((s) => s === 201));
    assert.equal(a.json.order.id, b.json.order.id);
    const count = await prisma.order.count({ where: { idempotencyKey: o.idempotencyKey } });
    assert.equal(count, 1);
    const after = (await prisma.productVariant.findUniqueOrThrow({ where: { id: 'mixture-250g' } })).stock;
    assert.equal(before - after, 3);
  });

  test('customised cake lines are stored in the order snapshot', async () => {
    const r = await call('POST', '/orders', order({ items: [
      { productId: 'black-forest-cake', variantId: 'black-forest-cake-500g', qty: 1, options: { message: 'Happy Birthday Anu' } },
      { productId: 'black-forest-cake', variantId: 'black-forest-cake-500g', qty: 1, options: { message: 'Happy Anniversary' } },
    ] }), tokenA);
    assert.equal(r.status, 201);
    const msgs = r.json.order.items.map((i: J) => i.options?.message).sort();
    assert.deepEqual(msgs, ['Happy Anniversary', 'Happy Birthday Anu']);
  });

  test('unserviceable pincode cannot be paid for (422)', async () => {
    const r = await call('POST', '/orders', order({ address: addr({ pincode: '560001' }) }), tokenA);
    assert.equal(r.status, 422);
  });

  test('with no payment gateway connected an online payment is refused: no order, no stock held, never recorded as paid', async () => {
    const o = order({ paymentMethod: 'upi' });
    const before = (await prisma.productVariant.findUniqueOrThrow({ where: { id: 'mysore-pak-250g' } })).stock;
    const r = await call('POST', '/orders', o, tokenA);
    assert.equal(r.status, 503);
    assert.equal(r.json.error.code, 'PAYMENT_NOT_CONFIGURED');
    assert.equal(await prisma.order.count({ where: { idempotencyKey: o.idempotencyKey } }), 0);
    assert.equal((await prisma.productVariant.findUniqueOrThrow({ where: { id: 'mysore-pak-250g' } })).stock, before);
  });

  test('cash on delivery is recorded as payment due (not paid); another customer cannot touch the order', async () => {
    const r = await call('POST', '/orders', order(), tokenA);
    assert.equal(r.status, 201);
    assert.equal(r.json.order.payment.status, 'cod_due');
    assert.equal((await call('POST', `/orders/${r.json.order.id}/reconcile`, undefined, tokenB)).status, 404);
  });

  test("another customer cannot read the order (IDOR)", async () => {
    const r = await call('POST', '/orders', order(), tokenA);
    assert.equal((await call('GET', `/orders/${r.json.order.id}`, undefined, tokenA)).status, 200);
    assert.equal((await call('GET', `/orders/${r.json.order.id}`, undefined, tokenB)).status, 404);
    assert.equal((await call('GET', '/orders', undefined, tokenB)).json.length, 0);
  });

  test('customers cannot change order status', async () => {
    const r = await call('POST', '/orders', order(), tokenA);
    assert.equal((await call('POST', `/admin/orders/${r.json.order.id}/advance`, undefined, tokenA)).status, 401);
  });

  test('last unit: two simultaneous buyers, exactly one wins', async () => {
    await prisma.productVariant.update({ where: { id: 'karachi-halwa-250g' }, data: { stock: 1 } });
    const mk = () => order({ items: [{ productId: 'karachi-halwa', variantId: 'karachi-halwa-250g', qty: 1 }] });
    const [a, b] = await Promise.all([call('POST', '/orders', mk(), tokenA), call('POST', '/orders', mk(), tokenB)]);
    const statuses = [a.status, b.status].sort();
    assert.deepEqual(statuses, [201, 409]);
    assert.equal((await prisma.productVariant.findUniqueOrThrow({ where: { id: 'karachi-halwa-250g' } })).stock, 0);
  });

  test('coupon usage cap prevents over-redemption', async () => {
    await prisma.coupon.update({ where: { code: 'SHREE10' }, data: { usageLimit: 1, usedCount: 0 } });
    const mk = () => order({ couponCode: 'SHREE10', items: [{ productId: 'mysore-pak', variantId: 'mysore-pak-1kg', qty: 1 }] });
    const [a, b] = await Promise.all([call('POST', '/orders', mk(), tokenA), call('POST', '/orders', mk(), tokenB)]);
    const ok = [a, b].filter((r) => r.status === 201);
    const withDiscount = ok.filter((r) => r.json.order.totals.couponDiscount > 0).length;
    assert.ok(withDiscount <= 1, 'at most one order may redeem a 1-use coupon');
    await prisma.coupon.update({ where: { code: 'SHREE10' }, data: { usageLimit: null } });
  });

  test('reward ledger is append-only at the database level', async () => {
    // Cash on Delivery orders now earn their points on delivery, so the ledger row this test needs is written directly.
    const row = await prisma.rewardLedger.create({ data: { customerId: userA.id, points: 5, note: 'append-only test row' } });
    await assert.rejects(() => prisma.rewardLedger.update({ where: { id: row.id }, data: { points: 9999 } }));
    await assert.rejects(() => prisma.rewardLedger.delete({ where: { id: row.id } }));
  });
});

describe('weather and geocoding adapters', () => {
  test('invalid coordinates are rejected (400)', async () => {
    assert.equal((await call('GET', '/weather?lat=999&lon=10')).status, 400);
    assert.equal((await call('GET', '/weather')).status, 400);
  });
  test('valid request returns real data or an honest 502, never invented data; second call is cached', async () => {
    const r = await call('GET', '/weather?lat=13.08&lon=80.27&label=Chennai');
    assert.ok([200, 502].includes(r.status), `status ${r.status}`);
    if (r.status === 200) {
      assert.equal(typeof r.json.tempC, 'number');
      const r2 = await call('GET', '/weather?lat=13.08&lon=80.27&label=Chennai');
      assert.equal(r2.json.updatedAt, r.json.updatedAt, 'served from cache');
    } else {
      assert.equal(r.json.error.code, 'WEATHER_UNAVAILABLE');
    }
  });
  test('reverse geocoding answers 501 (not configured) instead of inventing an address', async () => {
    assert.equal((await call('GET', '/geocode/reverse?lat=13.08&lon=80.27')).status, 401);
    const r = await call('GET', '/geocode/reverse?lat=13.08&lon=80.27', undefined, tokenA);
    assert.equal(r.status, 501);
    assert.equal(r.json.error.code, 'GEOCODER_NOT_CONFIGURED');
  });
});
