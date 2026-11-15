/* eslint-disable @typescript-eslint/no-explicit-any -- API responses are untyped JSON; property access in this test file is intentionally loose */
/**
 * End-to-end business workflows across BOTH clients against one real API + PostgreSQL (throwaway database):
 * the customer app's calls (the same endpoints liveApi.ts uses) and the admin panel's calls.
 * Start the API with: OTP_PROVIDER=dev EMAIL_PROVIDER=dev PAYMENT_PROVIDER=test AUTH_RATE_LIMIT_PER_MIN=500 ADMIN_LOGIN_RATE_LIMIT=1000 CHECKOUT_RATE_LIMIT_PER_MIN=1000 PORT=4014
 * Run: API_URL=http://localhost:4014/api DATABASE_URL=... JWT_SECRET=... npm run test:workflows
 */
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../modules/auth/password.js';

const API = process.env.API_URL ?? 'http://localhost:4014/api';
const prisma = new PrismaClient();
const run = Date.now().toString().slice(-6);
const PW = 'Correct-horse-9';
type R = { status: number; json: any; text: string };

async function call(method: string, path: string, body?: unknown, token?: string, extra: Record<string, string> = {}): Promise<R> {
  const res = await fetch(`${API}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json, text };
}

let admin = '';
let seq = 0;
const phone = () => `+9187${run}${String(++seq).padStart(2, '0')}`;
const address = { label: 'Home', name: 'Test Buyer', phone: '+919876543210', line1: '12 Main Road', area: 'Anna Nagar', city: 'Chennai', pincode: '600040' };

/** What the app does at sign-up. */
async function signup(tag: string) {
  const r = await call('POST', '/auth/signup', { name: `Buyer ${tag} ${run}`, phone: phone(), email: `${tag}${run}@wf.example`, password: PW, consent: true });
  assert.equal(r.status, 201, r.text);
  return { token: r.json.token as string, id: r.json.user.id as string, email: `${tag}${run}@wf.example` };
}
/** What the app does at checkout. */
const order = (token: string, items: { productId: string; variantId: string; qty: number }[], extra: Record<string, unknown> = {}, key = `wf-${run}-${Math.random()}`) =>
  call('POST', '/orders', { idempotencyKey: key, items, paymentMethod: 'cod', slotId: 'express', address, redeemPoints: 0, simulatedOutcome: 'success', ...extra }, token);
const orderId = (r: R) => r.json.order?.id as string;
const catalog = async () => (await call('GET', '/catalog')).json;

async function newProduct(name: string, opts: { categoryId?: string; price?: number; stock?: number; sku?: string } = {}) {
  const sku = opts.sku ?? `WF-${run}-${++seq}`;
  const r = await call('POST', '/admin/products', { name: `${name} ${run}`, categoryId: opts.categoryId ?? 'milk-sweets', variants: [{ sku, label: '250g', mrp: (opts.price ?? 100) + 20, price: opts.price ?? 100, stock: opts.stock ?? 10 }] }, admin);
  assert.equal(r.status, 201, r.text);
  return { id: r.json.id as string, variantId: r.json.variants[0].id as string, sku };
}

before(async () => {
  await prisma.customer.create({ data: { name: `WF Owner ${run}`, email: `owner${run}@wf.example`, phone: phone(), role: 'SUPER_ADMIN', passwordHash: await hashPassword(PW) } });
  admin = (await call('POST', '/admin/auth/login', { email: `owner${run}@wf.example`, password: PW })).json.token;
  assert.ok(admin);
  // A previous interrupted run may have left edited delivery rules behind.
  await call('PUT', '/admin/delivery', { freeDeliveryThreshold: 1499, codLimit: 2000, slots: {} }, admin);
});
after(() => prisma.$disconnect());

describe('Workflow 1: product synchronisation (admin -> app)', () => {
  test('a new product appears in the app catalogue; price and availability changes follow; archiving removes it but history stays', async () => {
    const buyer = await signup('w1');
    const p = await newProduct('Sync Barfi', { price: 90, stock: 10 });
    let item = (await catalog()).products.find((x: any) => x.id === p.id);
    assert.ok(item, 'published product is in /catalog');
    assert.equal(item.variants[0].price, 90);
    assert.equal(item.variants[0].stock, 10);

    // price change
    const cur = (await call('GET', `/admin/products/${p.id}`, undefined, admin)).json;
    const put = await call('PUT', `/admin/products/${p.id}`, { name: cur.name, categoryId: cur.categoryId, variants: [{ id: cur.variants[0].id, sku: p.sku, label: '250g', mrp: 150, price: 120, popular: false }] }, admin);
    assert.equal(put.status, 200, put.text);
    item = (await catalog()).products.find((x: any) => x.id === p.id);
    assert.equal(item.variants[0].price, 120);

    // a customer orders it, then it is archived
    const placed = await order(buyer.token, [{ productId: p.id, variantId: p.variantId, qty: 1 }]);
    assert.equal(placed.status, 201, placed.text);
    assert.equal((await call('POST', `/admin/products/${p.id}/archive`, undefined, admin)).status, 200);
    assert.equal((await catalog()).products.some((x: any) => x.id === p.id), false, 'archived product leaves the catalogue');
    const blocked = await order(buyer.token, [{ productId: p.id, variantId: p.variantId, qty: 1 }]);
    assert.equal(blocked.status, 422, 'archived product cannot be bought');
    const history = await call('GET', `/orders/${orderId(placed)}`, undefined, buyer.token);
    assert.equal(history.status, 200);
    assert.equal(history.json.items[0].name, `Sync Barfi ${run}`, 'past order keeps its item snapshot');
    assert.equal(history.json.items[0].unitPrice, 120, 'and the price it was bought at');
  });

  test('category and cake changes show up in the app catalogue', async () => {
    const c = await call('POST', '/admin/categories', { name: `WF Cat ${run}`, sortOrder: 3 }, admin);
    assert.equal(c.status, 201);
    assert.ok((await catalog()).categories.some((x: any) => x.id === c.json.id));
    await call('PUT', `/admin/categories/${c.json.id}`, { name: `WF Cat ${run}`, isActive: false }, admin);
    assert.equal((await catalog()).categories.some((x: any) => x.id === c.json.id), false, 'hidden category leaves the app');
    const cake = await call('POST', '/admin/products', { name: `WF Cake ${run}`, categoryId: 'birthday-cakes', cake: { flavours: ['Vanilla', 'Choco'], allowsMessage: true, messageMaxLength: 25, notice: 'Order a day ahead' }, variants: [{ sku: `WF-CK-${run}`, label: '500g', mrp: 600, price: 550, stock: 4 }] }, admin);
    assert.equal(cake.status, 201, cake.text);
    const inApp = (await catalog()).products.find((x: any) => x.id === cake.json.id);
    assert.deepEqual(inApp.cake.flavours, ['Vanilla', 'Choco']);
    assert.equal(inApp.cake.messageMaxLength, 25);
    assert.equal((await call('GET', '/admin/cakes', undefined, admin)).json.subcategories.length >= 9, true);
  });
});

describe('Workflow 2: order management (app -> admin -> app)', () => {
  test('an order placed in the app is visible to admin; admin status changes reach the app with history and an inbox message', async () => {
    const buyer = await signup('w2');
    const p = await newProduct('Order Peda', { price: 80, stock: 6 });
    const placed = await order(buyer.token, [{ productId: p.id, variantId: p.variantId, qty: 2 }]);
    assert.equal(placed.status, 201, placed.text);
    const id = orderId(placed);

    const list = await call('GET', `/admin/orders?q=${encodeURIComponent(placed.json.order.number)}`, undefined, admin);
    assert.equal(list.json.total, 1);
    const detail = await call('GET', `/admin/orders/${id}`, undefined, admin);
    assert.equal(detail.json.customer.id, buyer.id);
    assert.equal(detail.json.items[0].qty, 2);
    assert.equal(detail.json.payment.method, 'COD');
    assert.equal(detail.json.address.pincode, '600040');

    for (const s of ['CONFIRMED', 'PREPARING', 'PACKED', 'OUT_FOR_DELIVERY']) assert.equal((await call('POST', `/admin/orders/${id}/status`, { status: s }, admin)).status, 200, s);
    const seen = await call('GET', `/orders/${id}`, undefined, buyer.token);
    assert.equal(seen.json.status, 'out_for_delivery');
    assert.deepEqual(seen.json.events.map((e: any) => e.status), ['placed', 'confirmed', 'preparing', 'packed', 'out_for_delivery']);
    const mine = await call('GET', '/orders', undefined, buyer.token);
    assert.equal(mine.json.find((o: any) => o.id === id).status, 'out_for_delivery');
    const inbox = (await call('GET', '/me/notifications', undefined, buyer.token)).json.items.map((n: any) => n.title);
    assert.ok(inbox.some((t: string) => /Out for Delivery/.test(t)), inbox.join('|'));

    assert.equal((await call('POST', `/admin/orders/${id}/status`, { status: 'DELIVERED' }, admin)).status, 200);
    const rewards = await call('GET', '/me/rewards', undefined, buyer.token);
    assert.ok(rewards.json.balance > 0, 'delivery earns points the app can read');
  });

  test('another customer can neither see nor change this order', async () => {
    const a = await signup('w2a');
    const b = await signup('w2b');
    const p = await newProduct('Private Ladoo', { stock: 3 });
    const id = orderId(await order(a.token, [{ productId: p.id, variantId: p.variantId, qty: 1 }]));
    assert.equal((await call('GET', `/orders/${id}`, undefined, b.token)).status, 404);
    assert.equal((await call('GET', '/orders', undefined, b.token)).json.some((o: any) => o.id === id), false);
    assert.equal((await call('POST', `/admin/orders/${id}/status`, { status: 'CONFIRMED' }, b.token)).status, 403);
  });
});

describe('Workflow 3: inventory synchronisation', () => {
  test('stock is deducted once per order, repeated checkout creates one order, admin adjustments reach the app, overselling is refused', async () => {
    const buyer = await signup('w3');
    const p = await newProduct('Stock Jangiri', { stock: 5 });
    const key = `dup-${run}`;
    const first = await order(buyer.token, [{ productId: p.id, variantId: p.variantId, qty: 2 }], {}, key);
    const again = await order(buyer.token, [{ productId: p.id, variantId: p.variantId, qty: 2 }], {}, key);
    assert.equal(first.status, 201, first.text);
    assert.equal(orderId(again), orderId(first), 'same key returns the same order');
    const stock = async () => (await catalog()).products.find((x: any) => x.id === p.id).variants[0].stock;
    assert.equal(await stock(), 3, 'deducted once');
    assert.equal((await prisma.order.count({ where: { idempotencyKey: key } })), 1);

    assert.equal((await call('POST', `/admin/inventory/${p.variantId}/adjust`, { mode: 'set', quantity: 8, reason: 'CORRECTION' }, admin)).status, 200);
    assert.equal(await stock(), 8, 'admin adjustment is what the app shows');
    const tooMany = await order(buyer.token, [{ productId: p.id, variantId: p.variantId, qty: 9 }]);
    assert.equal(tooMany.status, 409);
    assert.equal(await stock(), 8, 'a refused order changes nothing');
  });

  test('the last units cannot be oversold under concurrent checkouts; stock never goes negative; history explains the numbers', async () => {
    const p = await newProduct('Race Mysore', { stock: 3 });
    const buyers = await Promise.all(['a', 'b', 'c', 'd', 'e'].map((t) => signup(`w3${t}`)));
    const results = await Promise.all(buyers.map((b) => order(b.token, [{ productId: p.id, variantId: p.variantId, qty: 1 }])));
    const ok = results.filter((r) => r.status === 201).length;
    assert.equal(ok, 3, results.map((r) => r.status).join(','));
    assert.equal(results.filter((r) => r.status === 409).length, 2);
    assert.equal((await prisma.productVariant.findUniqueOrThrow({ where: { id: p.variantId } })).stock, 0);
    const mv = await prisma.stockMovement.findMany({ where: { variantId: p.variantId }, orderBy: { createdAt: 'asc' } });
    assert.equal(mv.reduce((n, m) => n + m.delta, 0), 0, 'opening +3, then three orders -1 each');
    assert.ok(mv.every((m) => m.stockAfter >= 0));
  });

  test('cancelling an order puts the stock back exactly once', async () => {
    const buyer = await signup('w3x');
    const p = await newProduct('Cancel Kheer', { stock: 4 });
    const id = orderId(await order(buyer.token, [{ productId: p.id, variantId: p.variantId, qty: 3 }]));
    assert.equal((await prisma.productVariant.findUniqueOrThrow({ where: { id: p.variantId } })).stock, 1);
    assert.equal((await call('POST', `/admin/orders/${id}/status`, { status: 'CANCELLED', reason: 'Customer asked' }, admin)).status, 200);
    assert.equal((await call('POST', `/admin/orders/${id}/status`, { status: 'CANCELLED', reason: 'again' }, admin)).status, 409);
    assert.equal((await prisma.productVariant.findUniqueOrThrow({ where: { id: p.variantId } })).stock, 4);
    const inbox = (await call('GET', '/me/notifications', undefined, buyer.token)).json.items.map((n: any) => n.title);
    assert.ok(inbox.some((x: string) => /cancelled/.test(x)), 'customer is told the order was cancelled');
  });
});

describe('Workflow 4: customer synchronisation', () => {
  test('registration, profile edits and addresses made in the app show up in admin', async () => {
    const buyer = await signup('w4');
    const seen = await call('GET', `/admin/customers?q=${encodeURIComponent(buyer.email)}`, undefined, admin);
    assert.equal(seen.json.total, 1, 'registered customer is listed');

    assert.equal((await call('PATCH', '/me', { name: `Renamed ${run}`, email: buyer.email }, buyer.token)).status, 200);
    const saved = await call('POST', '/me/addresses', { ...address, label: 'Office', pincode: '600032', isDefault: true }, buyer.token);
    assert.equal(saved.status, 201, saved.text);
    const detail = (await call('GET', `/admin/customers/${buyer.id}`, undefined, admin)).json;
    assert.equal(detail.name, `Renamed ${run}`);
    assert.ok(detail.addresses.some((a: any) => a.pincode === '600032'));
  });

  test('a customer blocked in admin cannot keep using an old token', async () => {
    const buyer = await signup('w4b');
    const p = await newProduct('Blocked Halwa', { stock: 3 });
    assert.equal((await order(buyer.token, [{ productId: p.id, variantId: p.variantId, qty: 1 }])).status, 201);
    assert.equal((await call('PATCH', `/admin/customers/${buyer.id}`, { isBlocked: true, reason: 'test' }, admin)).status, 200);
    const r = await order(buyer.token, [{ productId: p.id, variantId: p.variantId, qty: 1 }]);
    assert.equal(r.status, 403);
    assert.equal(r.json.error.code, 'ACCOUNT_BLOCKED');
    assert.equal((await call('GET', '/orders', undefined, buyer.token)).status, 403);
    assert.equal((await call('PATCH', '/me', { name: 'Hacker' }, buyer.token)).status, 403);
    await call('PATCH', `/admin/customers/${buyer.id}`, { isBlocked: false }, admin);
    assert.equal((await call('GET', '/orders', undefined, buyer.token)).status, 200, 'unblocking restores access');
  });
});

describe('Workflow 5: offers and pricing (server decides)', () => {
  test('a coupon limited to a parent category discounts only matching lines, including subcategories; the client cannot influence totals', async () => {
    const buyer = await signup('w5');
    const code = `WF${run}`;
    const cc = await call('POST', '/admin/coupons', { code, title: 'Cakes ₹60 off', type: 'FLAT', value: 60, minOrder: 0, categoryIds: ['cakes'] }, admin);
    assert.equal(cc.status, 201, cc.text);
    const inApp = (await catalog()).coupons.find((c: any) => c.code === code);
    assert.deepEqual(inApp.categoryIds, ['cakes'], 'eligibility reaches the app');

    const sweet = await newProduct('Offer Sweet', { price: 200, stock: 5 });
    const cake = await call('POST', '/admin/products', { name: `Offer Cake ${run}`, categoryId: 'birthday-cakes', cake: { allowsMessage: true, messageMaxLength: 20, notice: 'n' }, variants: [{ sku: `WF-OC-${run}`, label: '500g', mrp: 600, price: 500, stock: 5 }] }, admin);
    const cakeItem = { productId: cake.json.id, variantId: cake.json.variants[0].id, qty: 1 };

    const onSweet = await order(buyer.token, [{ productId: sweet.id, variantId: sweet.variantId, qty: 1 }], { couponCode: code });
    assert.equal(Number((await prisma.order.findUniqueOrThrow({ where: { id: orderId(onSweet) } })).couponDiscount), 0, 'sweets are not eligible');
    const onCake = await order(buyer.token, [cakeItem], { couponCode: code });
    assert.equal(Number((await prisma.order.findUniqueOrThrow({ where: { id: orderId(onCake) } })).couponDiscount), 60, 'cake (in a subcategory) is eligible');

    // Sending our own totals is ignored: the API has no price fields to trust.
    const forged = await order(buyer.token, [{ productId: sweet.id, variantId: sweet.variantId, qty: 1 }], { total: 1, totals: { total: 1 }, unitPrice: 1 });
    const row = await prisma.order.findUniqueOrThrow({ where: { id: orderId(forged) } });
    assert.ok(Number(row.total) >= 200, `server total ${row.total}`);

    await call('PUT', `/admin/coupons/${code}`, { title: 'off', type: 'FLAT', value: 60, minOrder: 0, categoryIds: ['cakes'], isActive: false }, admin);
    const off = await order(buyer.token, [cakeItem], { couponCode: code });
    assert.equal(off.status, 201, off.text);
    assert.equal(Number((await prisma.order.findUniqueOrThrow({ where: { id: orderId(off) } })).couponDiscount), 0, 'a switched-off coupon gives nothing');
  });

  test('delivery rules edited in admin reach the app catalogue and the next order; a disabled slot is refused', async () => {
    const buyer = await signup('w5d');
    const p = await newProduct('Rule Mixture', { price: 100, stock: 9 });
    const before = (await catalog()).delivery;
    assert.ok(before.slots.length >= 1);
    assert.equal((await call('PUT', '/admin/delivery', { freeDeliveryThreshold: 5000, codLimit: before.codLimit, slots: { express: { fee: 77 }, 'slot-1': { enabled: false } } }, admin)).status, 200);
    // settings are cached for a few seconds inside the API process; the cache is cleared on save
    const after = (await catalog()).delivery;
    assert.equal(after.freeDeliveryThreshold, 5000);
    assert.equal(after.slots.find((s: any) => s.id === 'express').fee, 77);
    assert.equal(after.slots.some((s: any) => s.id === 'slot-1'), false);
    const o = await order(buyer.token, [{ productId: p.id, variantId: p.variantId, qty: 1 }]);
    assert.equal(Number((await prisma.order.findUniqueOrThrow({ where: { id: orderId(o) } })).deliveryFee), 77);
    assert.equal((await order(buyer.token, [{ productId: p.id, variantId: p.variantId, qty: 1 }], { slotId: 'slot-1' })).status, 422);
    await call('PUT', '/admin/delivery', { freeDeliveryThreshold: before.freeDeliveryThreshold, codLimit: before.codLimit, slots: {} }, admin);
  });

  test('COD limit is enforced by the server using the admin value', async () => {
    const buyer = await signup('w5c');
    const p = await newProduct('Big Box', { price: 900, stock: 5 });
    const d = (await catalog()).delivery;
    await call('PUT', '/admin/delivery', { freeDeliveryThreshold: d.freeDeliveryThreshold, codLimit: 500, slots: {} }, admin);
    try {
      const r = await order(buyer.token, [{ productId: p.id, variantId: p.variantId, qty: 1 }]);
      assert.equal(r.status, 422);
      assert.equal(r.json.error.code, 'COD_LIMIT');
    } finally {
      await call('PUT', '/admin/delivery', { freeDeliveryThreshold: d.freeDeliveryThreshold, codLimit: d.codLimit, slots: {} }, admin);
    }
  });
});

describe('Cross-cutting', () => {
  test('returns: a customer request from the app is decided and refunded in admin, and the app sees the result', async () => {
    const buyer = await signup('w6');
    const p = await newProduct('Return Rasgulla', { price: 150, stock: 3 });
    const id = orderId(await order(buyer.token, [{ productId: p.id, variantId: p.variantId, qty: 1 }]));
    for (const s of ['CONFIRMED', 'PREPARING', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED']) await call('POST', `/admin/orders/${id}/status`, { status: s }, admin);
    const rr = await call('POST', `/orders/${id}/return-requests`, { kind: 'RETURN', reason: 'Item damaged or spoiled' }, buyer.token);
    assert.equal(rr.status, 201, rr.text);
    assert.equal((await call('GET', '/me/return-requests', undefined, buyer.token)).json.items[0].status, 'REQUESTED');
    await call('POST', `/admin/returns/${rr.json.id}/decision`, { decision: 'approve', refundAmount: 100 }, admin);
    await call('POST', `/admin/returns/${rr.json.id}/refund`, { mode: 'manual', reference: 'UPI-WF-1' }, admin);
    const seen = (await call('GET', '/me/return-requests', undefined, buyer.token)).json.items[0];
    assert.equal(seen.status, 'REFUNDED');
    assert.equal(seen.refundAmount, 100);
    const titles = (await call('GET', '/me/notifications', undefined, buyer.token)).json.items.map((n: any) => n.title);
    assert.ok(titles.some((x: string) => /request approved/.test(x)), titles.join('|'));
    assert.ok(titles.some((x: string) => /^Refund for order/.test(x)), titles.join('|'));
  });

  test('admin reports and dashboard count what the app ordered; authorisation holds both ways', async () => {
    const d = await call('GET', '/admin/dashboard?days=1', undefined, admin);
    assert.ok(d.json.stats.orders >= 5);
    const sales = await call('GET', '/admin/reports?type=sales&days=1&format=csv', undefined, admin);
    assert.ok(sales.text.split('\r\n').length >= 2);
    const buyer = await signup('w7');
    assert.equal((await call('GET', '/admin/dashboard', undefined, buyer.token)).status, 403);
    assert.equal((await call('GET', '/orders')).status, 401);
    assert.equal((await call('GET', '/catalog')).status, 200, 'the catalogue is public');
    assert.equal((await call('GET', '/serviceability/600040')).status, 200, 'pincode check is public');
  });

  test('database consistency: no negative stock, every order has a payment and items, ledger and movements add up', async () => {
    assert.equal(await prisma.productVariant.count({ where: { stock: { lt: 0 } } }), 0);
    assert.equal(await prisma.order.count({ where: { payment: null } }), 0);
    assert.equal(await prisma.order.count({ where: { items: { none: {} } } }), 0);
    const variants = await prisma.productVariant.findMany({ where: { sku: { startsWith: `WF-${run}` } }, select: { id: true, stock: true } });
    for (const v of variants) {
      const sum = (await prisma.stockMovement.aggregate({ where: { variantId: v.id }, _sum: { delta: true } }))._sum.delta ?? 0;
      assert.equal(sum, v.stock, `movements explain stock of ${v.id}`);
    }
  });
});
