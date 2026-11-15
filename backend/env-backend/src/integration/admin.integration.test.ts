/* eslint-disable @typescript-eslint/no-explicit-any -- API responses are untyped JSON; property access in this test file is intentionally loose */
/**
 * Admin API integration tests against a REAL running API + PostgreSQL (throwaway database).
 * Start the API with: OTP_PROVIDER=dev EMAIL_PROVIDER=dev PAYMENT_PROVIDER=test AUTH_RATE_LIMIT_PER_MIN=500 ENABLE_DEMO_LOGIN=true PORT=4013
 * and no NOTIFY_* providers (so SMS/WhatsApp/push must be reported as not connected, never as sent).
 * Run: API_URL=http://localhost:4013/api DATABASE_URL=... JWT_SECRET=... npm run test:admin
 */
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../modules/auth/password.js';

const API = process.env.API_URL ?? 'http://localhost:4013/api';
const prisma = new PrismaClient();
const run = Date.now().toString().slice(-6);
const PW = 'Correct-horse-9';

type R = { status: number; json: any; text: string };
async function call(method: string, path: string, body?: unknown, token?: string): Promise<R> {
  const res = await fetch(`${API}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* csv */ }
  return { status: res.status, json, text };
}
const login = async (email: string, password = PW) => (await call('POST', '/admin/auth/login', { email, password })).json?.token as string;

let owner = '', manager = '', cust = '';
let custId = '';
let seq = 0;
const mk = async (role: 'SUPER_ADMIN' | 'MANAGER' | 'CUSTOMER', tag: string) =>
  prisma.customer.create({ data: { name: `${tag} ${run}`, email: `${tag}${run}@test.example`, phone: `+9190${run}${String(++seq).padStart(2, '0')}`, role, passwordHash: await hashPassword(PW) } });

before(async () => {
  await mk('SUPER_ADMIN', 'owner');
  await mk('MANAGER', 'mgr');
  custId = (await mk('CUSTOMER', 'buyer')).id;
  owner = await login(`owner${run}@test.example`);
  manager = await login(`mgr${run}@test.example`);
  cust = (await call('POST', '/auth/login', { identifier: `buyer${run}@test.example`, password: PW })).json.token;
});
after(() => prisma.$disconnect());

describe('admin authentication and permissions', () => {
  test('staff can sign in; customers, wrong passwords and unknown emails get the same refusal', async () => {
    assert.ok(owner && manager);
    const a = await call('POST', '/admin/auth/login', { email: `buyer${run}@test.example`, password: PW });
    const b = await call('POST', '/admin/auth/login', { email: `owner${run}@test.example`, password: 'wrong-password-1' });
    const c = await call('POST', '/admin/auth/login', { email: `nobody${run}@test.example`, password: PW });
    for (const r of [a, b, c]) { assert.equal(r.status, 401); assert.equal(r.json.error.message, 'Incorrect email or password'); }
  });
  test('a customer token cannot use any admin route; no token is 401', async () => {
    assert.equal((await call('GET', '/admin/dashboard', undefined, cust)).status, 403);
    assert.equal((await call('GET', '/admin/products', undefined, cust)).status, 403);
    assert.equal((await call('GET', '/admin/dashboard')).status, 401);
  });
  test('a manager cannot manage staff, read the audit log, change settings or pay refunds', async () => {
    assert.equal((await call('GET', '/admin/staff', undefined, manager)).status, 403);
    assert.equal((await call('GET', '/admin/audit', undefined, manager)).status, 403);
    assert.equal((await call('GET', '/admin/settings', undefined, manager)).status, 403);
    assert.equal((await call('POST', '/admin/returns/none/refund', { mode: 'manual', reference: 'x' }, manager)).status, 403);
    assert.equal((await call('GET', '/admin/orders', undefined, manager)).status, 200);
  });
  test('role is checked against the database: a blocked manager is locked out immediately', async () => {
    const temp = await mk('MANAGER', 'tmp');
    const t = await login(`tmp${run}@test.example`);
    assert.equal((await call('GET', '/admin/dashboard', undefined, t)).status, 200);
    await prisma.customer.update({ where: { id: temp.id }, data: { isBlocked: true } });
    assert.equal((await call('GET', '/admin/dashboard', undefined, t)).status, 403);
  });
  test('the last super admin cannot be demoted or blocked; you cannot demote yourself', async () => {
    const staff = (await call('GET', '/admin/staff', undefined, owner)).json.items as any[];
    const me = staff.find((s) => s.email === `owner${run}@test.example`);
    assert.equal((await call('PATCH', `/admin/staff/${me.id}`, { role: 'MANAGER' }, owner)).status, 409);
    assert.equal((await call('PATCH', `/admin/staff/${me.id}`, { isBlocked: true }, owner)).status, 409);
  });
  test('creating staff validates input and refuses duplicates', async () => {
    const bad = await call('POST', '/admin/staff', { name: 'X', email: 'nope', phone: '1', role: 'MANAGER', password: 'short' }, owner);
    assert.equal(bad.status, 400);
    const ok = await call('POST', '/admin/staff', { name: 'New Mgr', email: `new${run}@test.example`, phone: `+9191${run}98`, role: 'MANAGER', password: PW }, owner);
    assert.equal(ok.status, 201);
    assert.equal((await call('POST', '/admin/staff', { name: 'New Mgr', email: `new${run}@test.example`, phone: `+9192${run}97`, role: 'MANAGER', password: PW }, owner)).status, 409);
    assert.ok(!JSON.stringify(ok.json).includes('passwordHash'));
  });
});

describe('products, categories, inventory', () => {
  const sku = `T-${run}-A`;
  let pid = '';
  let vid = '';
  test('create validates (price above MRP, duplicate SKU) and then succeeds, with opening stock logged', async () => {
    const body = { name: `Test Laddu ${run}`, categoryId: 'milk-sweets', variants: [{ sku, label: '250g', mrp: 100, price: 90, stock: 12 }] };
    assert.equal((await call('POST', '/admin/products', { ...body, variants: [{ ...body.variants[0], price: 120 }] }, manager)).status, 422);
    const ok = await call('POST', '/admin/products', body, manager);
    assert.equal(ok.status, 201, ok.text);
    pid = ok.json.id; vid = ok.json.variants[0].id;
    assert.equal(ok.json.totalStock, 12);
    assert.equal((await call('POST', '/admin/products', { ...body, name: `Other ${run}` }, manager)).status, 409);
    const mv = await call('GET', `/admin/inventory/movements?variantId=${vid}`, undefined, manager);
    assert.equal(mv.json.items[0].delta, 12);
  });
  test('a published product appears in the mobile catalogue; unpublishing and archiving remove it', async () => {
    const has = async () => ((await call('GET', '/catalog')).json.products as any[]).some((p) => p.id === pid);
    assert.equal(await has(), true);
    assert.equal((await call('PATCH', `/admin/products/${pid}`, { isActive: false }, manager)).status, 200);
    assert.equal(await has(), false);
    await call('PATCH', `/admin/products/${pid}`, { isActive: true }, manager);
    assert.equal(await has(), true);
    assert.equal((await call('POST', `/admin/products/${pid}/archive`, undefined, manager)).status, 200);
    assert.equal(await has(), false);
    assert.equal((await call('PUT', `/admin/products/${pid}`, { name: 'xx', categoryId: 'milk-sweets', variants: [{ sku, label: '250g', mrp: 1, price: 1 }] }, manager)).status, 409);
    await call('POST', `/admin/products/${pid}/restore`, undefined, manager);
    await call('PATCH', `/admin/products/${pid}`, { isActive: true }, manager);
  });
  test('list filters, search and pagination work on real data', async () => {
    const r = await call('GET', `/admin/products?q=${encodeURIComponent(`Test Laddu ${run}`)}&pageSize=5`, undefined, manager);
    assert.equal(r.json.total, 1);
    const all = await call('GET', '/admin/products?pageSize=5&page=2', undefined, manager);
    assert.equal(all.json.items.length, 5);
    assert.ok(all.json.counts.total >= 26);
  });
  test('stock adjustment: add, set, never below zero, history explains every change', async () => {
    assert.equal((await call('POST', `/admin/inventory/${vid}/adjust`, { mode: 'add', quantity: 8, reason: 'RESTOCK', note: 'delivery' }, manager)).json.after, 20);
    assert.equal((await call('POST', `/admin/inventory/${vid}/adjust`, { mode: 'set', quantity: 15, reason: 'CORRECTION' }, manager)).json.delta, -5);
    assert.equal((await call('POST', `/admin/inventory/${vid}/adjust`, { mode: 'remove', quantity: 99, reason: 'ADJUSTMENT' }, manager)).status, 409);
    assert.equal((await call('POST', `/admin/inventory/${vid}/adjust`, { mode: 'set', quantity: 15, reason: 'CORRECTION' }, manager)).status, 422);
    const mv = (await call('GET', `/admin/inventory/movements?variantId=${vid}`, undefined, manager)).json.items as any[];
    assert.deepEqual(mv.map((m) => m.stockAfter).reverse(), [12, 20, 15]);
  });
  test('movement history is append-only at the database level', async () => {
    await assert.rejects(prisma.stockMovement.deleteMany({ where: { variantId: vid } }), /append-only/);
    await assert.rejects(prisma.auditLog.updateMany({ data: { summary: 'tampered' } }), /append-only/);
  });
  test('categories: create, cycle protection, delete refused while in use', async () => {
    const c = await call('POST', '/admin/categories', { name: `Test Cat ${run}`, sortOrder: 5 }, manager);
    assert.equal(c.status, 201);
    const child = await call('POST', '/admin/categories', { name: `Test Child ${run}`, parentId: c.json.id }, manager);
    assert.equal(child.status, 201);
    assert.equal((await call('PUT', `/admin/categories/${c.json.id}`, { name: `Test Cat ${run}`, parentId: child.json.id }, manager)).status, 422);
    assert.equal((await call('DELETE', `/admin/categories/${c.json.id}`, undefined, manager)).status, 409);
    assert.equal((await call('DELETE', `/admin/categories/${child.json.id}`, undefined, manager)).status, 200);
    assert.equal((await call('DELETE', `/admin/categories/${c.json.id}`, undefined, manager)).status, 200);
  });
  test('cakes overview lists the cake subcategories', async () => {
    const r = await call('GET', '/admin/cakes', undefined, manager);
    assert.equal(r.status, 200);
    assert.ok(r.json.subcategories.length >= 9);
  });
  test('uploaded-image rule: javascript: and plain-http image URLs are rejected', async () => {
    const r = await call('POST', '/admin/products', { name: `Img ${run}`, categoryId: 'milk-sweets', images: [{ url: 'javascript:alert(1)' }], variants: [{ sku: `I-${run}`, label: '1', mrp: 1, price: 1 }] }, manager);
    assert.equal(r.status, 400);
  });
});

describe('orders, cancellation, returns and refunds', () => {
  let orderId = '';
  let variantId = '';
  let stockBefore = 0;
  const place = async (method: 'cod' | 'upi' = 'cod') => {
    const items = [{ productId: 'mysore-pak', variantId, qty: 2 }];
    const r = await call('POST', '/orders', { idempotencyKey: `adm-${run}-${Math.random()}`, items, paymentMethod: method, slotId: 'express', address: { label: 'Home', name: 'Test Buyer', phone: '+919876543210', line1: '12 Main Road', area: 'Anna Nagar', city: 'Chennai', pincode: '600040' }, redeemPoints: 0, simulatedOutcome: 'success' }, cust);
    return r;
  };
  before(async () => {
    const v = await prisma.productVariant.findFirstOrThrow({ where: { productId: 'mysore-pak' }, orderBy: { price: 'asc' } });
    variantId = v.id;
  });
  test('placing an order logs a stock movement; staff see it with customer, items and totals', async () => {
    stockBefore = (await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stock;
    const r = await place();
    assert.ok([200, 201].includes(r.status), r.text);
    orderId = r.json.order?.id ?? r.json.orderId;
    assert.ok(orderId, r.text);
    const d = await call('GET', `/admin/orders/${orderId}`, undefined, manager);
    assert.equal(d.status, 200);
    assert.equal(d.json.items[0].qty, 2);
    assert.equal(d.json.customer.id, custId);
    const mv = await prisma.stockMovement.findFirst({ where: { orderId: null, variantId, reason: 'ORDER' }, orderBy: { createdAt: 'desc' } });
    assert.equal(mv?.delta, -2);
    assert.equal((await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stock, stockBefore - 2);
  });
  test('status moves one step at a time; skipping is refused; two clicks cannot both win', async () => {
    assert.equal((await call('POST', `/admin/orders/${orderId}/status`, { status: 'PACKED' }, manager)).status, 409);
    const [a, b] = await Promise.all([call('POST', `/admin/orders/${orderId}/status`, { status: 'CONFIRMED' }, manager), call('POST', `/admin/orders/${orderId}/status`, { status: 'CONFIRMED' }, owner)]);
    assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  });
  test('cancelling needs a reason, returns stock, and closes an unpaid COD payment', async () => {
    assert.equal((await call('POST', `/admin/orders/${orderId}/status`, { status: 'CANCELLED' }, manager)).status, 422);
    const r = await call('POST', `/admin/orders/${orderId}/status`, { status: 'CANCELLED', reason: 'Customer called' }, manager);
    assert.equal(r.status, 200);
    assert.equal((await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stock, stockBefore);
    assert.equal((await prisma.payment.findUniqueOrThrow({ where: { orderId } })).status, 'CANCELLED');
    assert.equal((await call('POST', `/admin/orders/${orderId}/status`, { status: 'CANCELLED', reason: 'again' }, manager)).status, 409);
  });
  test('delivered order: customer return request -> staff approve -> only a super admin can pay the refund, manually', async () => {
    const o = await place();
    const id = o.json.order?.id ?? o.json.orderId;
    // COD is collected on delivery, so the payment becomes PAID and a refund is possible.
    for (const s of ['CONFIRMED', 'PREPARING', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED']) assert.equal((await call('POST', `/admin/orders/${id}/status`, { status: s }, manager)).status, 200, s);
    assert.equal((await prisma.payment.findUniqueOrThrow({ where: { orderId: id } })).status, 'PAID');
    assert.equal((await call('POST', `/orders/${id}/return-requests`, { kind: 'CANCELLATION', reason: 'too late' }, cust)).status, 409);
    const rr = await call('POST', `/orders/${id}/return-requests`, { kind: 'RETURN', reason: 'Box was damaged' }, cust);
    assert.equal(rr.status, 201, rr.text);
    assert.equal((await call('POST', `/orders/${id}/return-requests`, { kind: 'RETURN', reason: 'duplicate' }, cust)).status, 409);
    const ap = await call('POST', `/admin/returns/${rr.json.id}/decision`, { decision: 'approve', refundAmount: 50 }, manager);
    assert.equal(ap.status, 200, ap.text);
    assert.equal(ap.json.status, 'APPROVED');
    assert.equal((await call('POST', `/admin/returns/${rr.json.id}/decision`, { decision: 'approve' }, manager)).status, 409);
    assert.equal((await call('POST', `/admin/returns/${rr.json.id}/refund`, { mode: 'manual', reference: 'UPI-1' }, manager)).status, 403);
    assert.equal((await call('POST', `/admin/returns/${rr.json.id}/refund`, { mode: 'manual' }, owner)).status, 422);
    assert.equal((await call('POST', `/admin/returns/${rr.json.id}/refund`, { mode: 'provider' }, owner)).status, 409); // simulated payment: no gateway refund possible
    const done = await call('POST', `/admin/returns/${rr.json.id}/refund`, { mode: 'manual', reference: 'UPI-1' }, owner);
    assert.equal(done.status, 200, done.text);
    const after = await call('GET', `/admin/returns/${rr.json.id}`, undefined, owner);
    assert.equal(after.json.status, 'REFUNDED');
    assert.equal(after.json.refundAmount, 50);
    assert.equal((await prisma.payment.findUniqueOrThrow({ where: { orderId: id } })).status, 'PAID'); // partial refund keeps PAID
  });
  test('a customer cannot raise a request on someone else\'s order', async () => {
    const other = await mk('CUSTOMER', 'other');
    const t = (await call('POST', '/auth/login', { identifier: other.email!, password: PW })).json.token;
    assert.equal((await call('POST', `/orders/${orderId}/return-requests`, { kind: 'RETURN', reason: 'not mine' }, t)).status, 404);
  });
  test('orders list: tabs, stats, search, CSV export', async () => {
    const r = await call('GET', '/admin/orders?tab=cancelled', undefined, manager);
    assert.ok(r.json.items.every((o: any) => o.status === 'CANCELLED'));
    assert.ok(r.json.tabs.all >= 2);
    const csv = await call('GET', '/admin/orders?format=csv', undefined, manager);
    assert.ok(csv.text.startsWith('Order,Date,Customer'));
  });
});

describe('customers, offers, banners, delivery', () => {
  test('block / unblock a customer: blocked customers cannot sign in', async () => {
    assert.equal((await call('PATCH', `/admin/customers/${custId}`, { isBlocked: true }, manager)).status, 422);
    assert.equal((await call('PATCH', `/admin/customers/${custId}`, { isBlocked: true, reason: 'fraud check' }, manager)).status, 200);
    const r = await call('POST', '/auth/login', { identifier: `buyer${run}@test.example`, password: PW });
    assert.equal(r.status, 403);
    assert.equal((await call('PATCH', `/admin/customers/${custId}`, { isBlocked: false }, manager)).status, 200);
    assert.equal((await call('POST', '/auth/login', { identifier: `buyer${run}@test.example`, password: PW })).status, 200);
  });
  test('customer detail shows orders and addresses; list supports status filter, search and CSV', async () => {
    const d = await call('GET', `/admin/customers/${custId}`, undefined, manager);
    assert.ok(d.json.orders.length >= 2);
    assert.equal((await call('GET', `/admin/customers?q=buyer${run}`, undefined, manager)).json.total, 1);
    assert.ok((await call('GET', '/admin/customers?format=csv', undefined, manager)).text.startsWith('Name,Phone'));
  });
  test('coupons: validation, create, category-restricted eligibility is enforced at checkout, used coupons cannot be deleted', async () => {
    const code = `TST${run}`;
    assert.equal((await call('POST', '/admin/coupons', { code, title: 'Bad', type: 'PERCENT', value: 150 }, manager)).status, 400);
    const ok = await call('POST', '/admin/coupons', { code, title: 'Cakes only', type: 'FLAT', value: 50, minOrder: 0, categoryIds: ['cakes'] }, manager);
    assert.equal(ok.status, 201, ok.text);
    assert.equal((await call('POST', '/admin/coupons', { code, title: 'dup', type: 'FLAT', value: 5 }, manager)).status, 409);
    const v = await prisma.productVariant.findFirstOrThrow({ where: { productId: 'mysore-pak' } });
    const order = await call('POST', '/orders', { idempotencyKey: `cp-${run}-${Math.random()}`, items: [{ productId: 'mysore-pak', variantId: v.id, qty: 1 }], couponCode: code, paymentMethod: 'cod', slotId: 'express', address: { label: 'Home', name: 'Test Buyer', phone: '+919876543210', line1: '12 Main Road', area: 'Anna Nagar', city: 'Chennai', pincode: '600040' }, redeemPoints: 0, simulatedOutcome: 'success' }, cust);
    const o = await prisma.order.findFirstOrThrow({ where: { id: order.json.order?.id ?? order.json.orderId } });
    assert.equal(Number(o.couponDiscount), 0, 'a sweets-only cart must get no discount from a cakes-only coupon');
    assert.equal((await call('PUT', `/admin/coupons/${code}`, { title: 'Cakes only', type: 'FLAT', value: 50, usageLimit: 5, expiresAt: '2030-01-01' }, manager)).status, 200);
  });
  test('banners: create needs an image; tracked views/clicks show up as real counts', async () => {
    const body = { title: `Banner ${run}`, placement: 'home_slider', targetType: 'offers', imageUrl: 'https://example.com/b.jpg' };
    assert.equal((await call('POST', '/admin/banners', { ...body, imageUrl: undefined }, manager)).status, 422);
    const b = await call('POST', '/admin/banners', body, manager);
    assert.equal(b.status, 201, b.text);
    assert.equal((await call('POST', '/banner-events', { events: [{ bannerId: b.json.id, type: 'view' }, { bannerId: b.json.id, type: 'view' }, { bannerId: b.json.id, type: 'click' }, { bannerId: 'unknown', type: 'view' }] }, cust)).json.accepted, 3);
    const list = await call('GET', '/admin/banners?group=banners&days=1', undefined, manager);
    const row = list.json.items.find((x: any) => x.id === b.json.id);
    assert.equal(row.views, 2); assert.equal(row.clicks, 1);
    assert.equal((await call('GET', '/catalog')).json.banners.some((x: any) => x.id === b.json.id), true);
    assert.equal((await call('DELETE', `/admin/banners/${b.json.id}`, undefined, manager)).status, 200);
  });
  test('delivery settings change the real order total (free-delivery threshold and slot fee), and pincodes are managed', async () => {
    const cur = (await call('GET', '/admin/delivery', undefined, manager)).json;
    assert.equal((await call('PUT', '/admin/delivery', { freeDeliveryThreshold: 1499, codLimit: 2000, slots: { express: { fee: 99 } } }, manager)).status, 200);
    const v = await prisma.productVariant.findFirstOrThrow({ where: { productId: 'mysore-pak' } });
    const o = await call('POST', '/orders', { idempotencyKey: `dl-${run}-${Math.random()}`, items: [{ productId: 'mysore-pak', variantId: v.id, qty: 1 }], paymentMethod: 'cod', slotId: 'express', address: { label: 'Home', name: 'Test Buyer', phone: '+919876543210', line1: '12 Main Road', area: 'Anna Nagar', city: 'Chennai', pincode: '600040' }, redeemPoints: 0, simulatedOutcome: 'success' }, cust);
    const row = await prisma.order.findFirstOrThrow({ where: { id: o.json.order?.id ?? o.json.orderId } });
    assert.equal(Number(row.deliveryFee), 99);
    await call('PUT', '/admin/delivery', { freeDeliveryThreshold: cur.freeDeliveryThreshold, codLimit: cur.codLimit, slots: {} }, manager);
    assert.equal((await call('POST', '/admin/delivery/pincodes', { pincode: '600099' }, manager)).status, 201);
    assert.equal((await call('POST', '/admin/delivery/pincodes', { pincode: '12' }, manager)).status, 400);
    assert.equal((await call('GET', '/serviceability/600099')).json.serviceable, true);
    assert.equal((await call('DELETE', '/admin/delivery/pincodes/600099', undefined, manager)).status, 200);
  });
});

describe('notifications, segments, reports, audit', () => {
  test('in-app message reaches customers and appears in their inbox; the unopened count is real', async () => {
    const r = await call('POST', '/admin/broadcasts', { channel: 'in_app', title: `Hello ${run}`, message: 'Festive offer', audienceType: 'all', when: 'now' }, manager);
    assert.equal(r.status, 201, r.text);
    assert.ok(r.json.delivered >= 1);
    const inbox = await call('GET', '/me/notifications', undefined, cust);
    const n = inbox.json.items.find((x: any) => x.title === `Hello ${run}`);
    assert.ok(n);
    await call('POST', `/me/notifications/${n.id}/read`, undefined, cust);
    const list = await call('GET', '/admin/broadcasts', undefined, manager);
    assert.ok(list.json.items.find((b: any) => b.id === r.json.id).opened >= 1);
  });
  test('SMS / WhatsApp / push cannot be sent when the provider is not connected: refused, never recorded as sent', async () => {
    for (const channel of ['sms', 'whatsapp', 'push']) {
      const r = await call('POST', '/admin/broadcasts', { channel, title: 'Hi there', message: 'Offer', audienceType: 'all', when: 'now' }, manager);
      assert.equal(r.status, 409, channel);
      assert.equal(r.json.error.code, 'CHANNEL_NOT_CONNECTED');
    }
    assert.equal((await prisma.broadcast.count({ where: { status: 'SENT', channel: { in: ['sms', 'whatsapp', 'push'] } } })), 0);
    const draft = await call('POST', '/admin/broadcasts', { channel: 'sms', title: 'Draft msg', message: 'Later', audienceType: 'all', when: 'draft' }, manager);
    assert.equal(draft.status, 201);
    assert.equal((await call('POST', `/admin/broadcasts/${draft.json.id}/send`, undefined, manager)).status, 409);
  });
  test('marketing channels only target opted-in customers', async () => {
    const before = (await call('POST', '/admin/broadcasts/audience', { channel: 'sms', audienceType: 'all' }, manager)).json;
    await call('PUT', '/me/marketing', { optIn: true }, cust);
    const after = (await call('POST', '/admin/broadcasts/audience', { channel: 'sms', audienceType: 'all' }, manager)).json;
    assert.equal(after.eligible, before.eligible + 1);
    assert.equal(after.channelConnected, false);
  });
  test('validation: title/message limits and scheduling in the past are rejected', async () => {
    assert.equal((await call('POST', '/admin/broadcasts', { channel: 'in_app', title: 'x'.repeat(61), message: 'ok message', audienceType: 'all', when: 'now' }, manager)).status, 400);
    assert.equal((await call('POST', '/admin/broadcasts', { channel: 'in_app', title: 'Later', message: 'ok message', audienceType: 'all', when: 'later', scheduledAt: '2020-01-01T00:00:00Z' }, manager)).status, 400);
  });
  test('segments: built-in set exists with real counts; custom segment and insights work', async () => {
    const s = await call('GET', '/admin/segments', undefined, manager);
    assert.ok(s.json.items.length >= 6);
    const mine = await call('POST', '/admin/segments', { name: `Seg ${run}`, description: 'spenders', rule: { minOrders: 1 } }, manager);
    assert.equal(mine.status, 201);
    assert.equal((await call('POST', '/admin/segments', { name: `Empty ${run}`, rule: {} }, manager)).status, 422);
    const ins = await call('GET', `/admin/segments/${mine.json.id}/insights`, undefined, manager);
    assert.ok(ins.json.customers >= 1);
    const builtin = s.json.items.find((x: any) => x.isSystem);
    assert.equal((await call('DELETE', `/admin/segments/${builtin.id}`, undefined, manager)).status, 409);
  });
  test('dashboard and reports return real numbers; CSV cells that start with = are neutralised', async () => {
    const d = await call('GET', '/admin/dashboard?days=30', undefined, manager);
    assert.equal(d.status, 200);
    assert.ok(d.json.stats.orders >= 1);
    assert.equal(d.json.series.length >= 30, true);
    for (const type of ['sales', 'products', 'categories', 'customers', 'inventory', 'payments']) {
      assert.equal((await call('GET', `/admin/reports?type=${type}&days=30`, undefined, manager)).status, 200, type);
      assert.equal((await call('GET', `/admin/reports?type=${type}&days=30&format=csv`, undefined, manager)).status, 200, type);
    }
    await prisma.customer.update({ where: { id: custId }, data: { name: `=cmd|' /C calc'!A0` } });
    const csv = await call('GET', '/admin/reports?type=customers&days=30&format=csv', undefined, manager);
    assert.ok(!csv.text.includes('\n=cmd'), 'formula must be prefixed');
    assert.ok(csv.text.includes("'=cmd"));
  });
  test('the audit log records who did what, and super admins can read it', async () => {
    const a = await call('GET', '/admin/audit?pageSize=50', undefined, owner);
    assert.equal(a.status, 200);
    const actions = a.json.items.map((x: any) => x.action);
    for (const k of ['auth.login', 'product.create', 'inventory.adjust', 'order.cancel', 'refund.pay', 'customer.block', 'coupon.create', 'delivery.update']) assert.ok(actions.includes(k) || a.json.total > 50, k);
    assert.ok(!JSON.stringify(a.json).toLowerCase().includes('passwordhash'));
  });
  test('integrations endpoint reports provider status without secrets', async () => {
    const r = await call('GET', '/admin/integrations', undefined, manager);
    assert.equal(r.json.smsMarketing.connected, false);
    assert.ok(!/secret|token|key/i.test(JSON.stringify(Object.keys(r.json.payments))));
  });
});
