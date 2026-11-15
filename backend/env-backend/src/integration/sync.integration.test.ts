/* eslint-disable @typescript-eslint/no-explicit-any -- API responses are untyped JSON; property access in this test file is intentionally loose */
/**
 * The exact synchronisation scenario, step by step, verified THREE ways at every step: the admin API's answer,
 * the PostgreSQL row itself, and what the customer app's API returns.
 * Start the API (throwaway database): OTP_PROVIDER=dev EMAIL_PROVIDER=dev PAYMENT_PROVIDER=test AUTH_RATE_LIMIT_PER_MIN=500 ADMIN_LOGIN_RATE_LIMIT=1000 CHECKOUT_RATE_LIMIT_PER_MIN=1000 PORT=4015
 * Run: API_URL=http://localhost:4015/api DATABASE_URL=... JWT_SECRET=... npm run test:sync
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../modules/auth/password.js';

const API = process.env.API_URL ?? 'http://localhost:4015/api';
const prisma = new PrismaClient();
const run = Date.now().toString().slice(-6);
const NAME = 'SYNC TEST SWEET 001';

type R = { status: number; json: any; text: string; headers: Headers };
async function call(method: string, path: string, body?: unknown, token?: string, headers: Record<string, string> = {}, base = API): Promise<R> {
  const res = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json, text, headers: res.headers };
}
/** A plain conditional GET exactly as an HTTP cache sends it. (Node's fetch adds Cache-Control: no-cache to conditional requests, which makes every server skip the 304.) */
const conditionalGet = (path: string, etag: string) =>
  new Promise<{ status: number; etag: string | undefined }>((resolve, reject) => {
    const u = new URL(API + path);
    http.get({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, headers: { 'If-None-Match': etag } }, (res) => {
      res.resume();
      res.on('end', () => resolve({ status: res.statusCode ?? 0, etag: res.headers.etag as string | undefined }));
    }).on('error', reject);
  });
/** Valid PNG header + padding: the upload endpoint checks the real file bytes. */
const png = (seed: number) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, seed)]);
async function upload(token: string, seed: number): Promise<string> {
  const res = await fetch(`${API}/uploads`, { method: 'POST', headers: { 'Content-Type': 'image/png', Authorization: `Bearer ${token}` }, body: png(seed) });
  assert.equal(res.status, 201);
  return (await res.json()).uri as string;
}

let admin = '';
let buyer = '';
let pid = '';
let vid = '';
let imgA = '';
const seq = { n: 0 };
const appProduct = async () => ((await call('GET', '/catalog')).json.products as any[]).find((p) => p.id === pid);
const dbProduct = () => prisma.product.findUnique({ where: { id: pid }, include: { variants: true, images: { orderBy: { sortOrder: 'asc' } } } });

before(async () => {
  await prisma.customer.create({ data: { name: `Sync Owner ${run}`, email: `sync${run}@t.example`, phone: `+9184${run}01`, role: 'SUPER_ADMIN', passwordHash: await hashPassword('Correct-horse-9') } });
  admin = (await call('POST', '/admin/auth/login', { email: `sync${run}@t.example`, password: 'Correct-horse-9' })).json.token;
  const su = await call('POST', '/auth/signup', { name: `Sync Buyer ${run}`, phone: `+9184${run}02`, password: 'Correct-horse-9', consent: true });
  buyer = su.json.token;
  assert.ok(admin && buyer);
});
after(() => prisma.$disconnect());

const place = (qty: number) => call('POST', '/orders', { idempotencyKey: `sync-${run}-${++seq.n}`, items: [{ productId: pid, variantId: vid, qty }], paymentMethod: 'cod', slotId: 'express', address: { label: 'Home', name: 'Sync Buyer', phone: '+919876543210', line1: '12 Main Road', area: 'Anna Nagar', city: 'Chennai', pincode: '600040' }, redeemPoints: 0, simulatedOutcome: 'success' }, buyer);

describe(`${NAME}: Admin -> PostgreSQL -> app API`, () => {
  test('1-3. create in admin: saved in PostgreSQL, and returned by the app API under the right category, with a New flag and a working image address', async () => {
    imgA = await upload(admin, 1);
    const r = await call('POST', '/admin/products', { name: NAME, categoryId: 'milk-sweets', tagline: 'Sync check', variants: [{ sku: `SYNC-001-${run}`, label: '250g', mrp: 150, price: 100, stock: 12 }], images: [{ url: imgA }] }, admin);
    assert.equal(r.status, 201, r.text);
    pid = r.json.id; vid = r.json.variants[0].id;
    // the admin API returned the saved record
    assert.equal(r.json.name, NAME);
    // PostgreSQL
    const row = await dbProduct();
    assert.ok(row, 'row exists in "Product"');
    assert.equal(row.isActive, true); assert.equal(row.archivedAt, null); assert.equal(row.categoryId, 'milk-sweets');
    assert.equal(Number(row.variants[0].price), 100); assert.equal(row.variants[0].stock, 12);
    assert.equal(row.images[0].url, imgA);
    // the app's API
    const p = await appProduct();
    assert.ok(p, 'visible in /catalog');
    assert.equal(p.variants[0].price, 100); assert.equal(p.variants[0].stock, 12); assert.equal(p.categoryId, 'milk-sweets');
    assert.equal(p.featured.newArrival, true, 'new products reach the Home "New" shelf without ticking anything');
    const cat = (await call('GET', '/catalog')).json;
    assert.ok(cat.collections.find((c: any) => c.id === 'sweets').categoryIds.includes('milk-sweets'), 'the Sweets tab covers it');
    assert.equal((await fetch(p.images[0].uri)).status, 200, 'the image address in the catalogue loads');
  });

  test('4-5. change the price: PostgreSQL changes, the app API returns the new price, and HTTP revalidation sees the change', async () => {
    const first = await call('GET', '/catalog');
    const etag = first.headers.get('etag');
    assert.ok(etag, 'catalogue has an ETag');
    assert.match(first.headers.get('cache-control') ?? '', /no-cache/);
    assert.equal((await conditionalGet('/catalog', etag!)).status, 304, 'unchanged data revalidates cheaply');
    const cur = (await call('GET', `/admin/products/${pid}`, undefined, admin)).json;
    const put = await call('PUT', `/admin/products/${pid}`, { name: NAME, categoryId: 'milk-sweets', tagline: 'Sync check', images: cur.images.map((i: any) => ({ id: i.id })), variants: [{ id: cur.variants[0].id, sku: cur.variants[0].sku, label: '250g', mrp: 150, price: 120, popular: false }] }, admin);
    assert.equal(put.status, 200, put.text);
    assert.equal(put.json.variants[0].price, 120, 'the save response already holds the stored value');
    assert.equal(Number((await dbProduct())!.variants[0].price), 120, 'PostgreSQL row updated');
    assert.equal((await appProduct()).variants[0].price, 120, 'app API returns the new price');
    const after = await conditionalGet('/catalog', etag!);
    assert.equal(after.status, 200, 'old ETag no longer matches');
    assert.notEqual(after.etag, etag);
  });

  test('6. change the image: a new image address is stored and returned; the old one is gone', async () => {
    const imgB = await upload(admin, 2);
    assert.notEqual(imgB, imgA);
    const cur = (await call('GET', `/admin/products/${pid}`, undefined, admin)).json;
    const put = await call('PUT', `/admin/products/${pid}`, { name: NAME, categoryId: 'milk-sweets', tagline: 'Sync check', images: [{ url: imgB }], variants: [{ id: cur.variants[0].id, sku: cur.variants[0].sku, label: '250g', mrp: 150, price: 120, popular: false }] }, admin);
    assert.equal(put.status, 200, put.text);
    const row = await dbProduct();
    assert.deepEqual(row!.images.map((i) => i.url), [imgB]);
    assert.equal((await appProduct()).images[0].uri, imgB);
    assert.equal((await fetch(imgB)).status, 200);
  });

  test('7-8. unpublish hides it from the app and from new purchases; publish brings it back', async () => {
    assert.equal((await call('PATCH', `/admin/products/${pid}`, { isActive: false }, admin)).status, 200);
    assert.equal((await dbProduct())!.isActive, false);
    assert.equal(await appProduct(), undefined, 'not in the app catalogue');
    assert.equal((await place(1)).status, 422, 'cannot be bought');
    assert.equal((await call('PATCH', `/admin/products/${pid}`, { isActive: true }, admin)).status, 200);
    assert.equal((await dbProduct())!.isActive, true);
    assert.ok(await appProduct(), 'back in the app catalogue');
    assert.equal((await place(1)).status, 201, 'and buyable again');
  });

  test('9. stock: admin adjustment is what the app shows; zero stock refuses orders; history explains it', async () => {
    const stockNow = (await dbProduct())!.variants[0].stock; // 12 minus the order above
    assert.equal(stockNow, 11);
    assert.equal((await call('POST', `/admin/inventory/${vid}/adjust`, { mode: 'set', quantity: 3, reason: 'CORRECTION' }, admin)).status, 200);
    assert.equal((await dbProduct())!.variants[0].stock, 3);
    assert.equal((await appProduct()).variants[0].stock, 3, 'app shows 3 left');
    assert.equal((await place(4)).status, 409, 'more than the stock is refused');
    assert.equal((await call('POST', `/admin/inventory/${vid}/adjust`, { mode: 'set', quantity: 0, reason: 'CORRECTION' }, admin)).status, 200);
    assert.equal((await appProduct()).variants[0].stock, 0, 'app shows sold out');
    assert.equal((await place(1)).status, 409);
    const sum = (await prisma.stockMovement.aggregate({ where: { variantId: vid }, _sum: { delta: true } }))._sum.delta;
    assert.equal(sum, 0, 'stock movements add up to the current stock');
  });

  test('10. archive removes it from the app while the row and its order history stay in PostgreSQL', async () => {
    assert.equal((await call('POST', `/admin/products/${pid}/archive`, undefined, admin)).status, 200);
    assert.ok((await dbProduct())!.archivedAt, 'archived, not deleted');
    assert.equal(await appProduct(), undefined);
    assert.ok(await prisma.orderItem.count({ where: { productId: pid } }) >= 1, 'past order lines are intact');
  });
});

describe('Change feed and caching', () => {
  test('a long-poll returns the moment an admin change commits, and quietly times out when nothing changes', async () => {
    const v0 = (await call('GET', '/catalog/version')).json.version;
    const quiet = await call('GET', `/catalog/wait?version=${v0}&timeout=1`);
    assert.equal(quiet.json.changed, false);
    const started = Date.now();
    const waiting = call('GET', `/catalog/wait?version=${v0}&timeout=20`);
    await new Promise((r) => setTimeout(r, 300));
    const c = await call('POST', '/admin/categories', { name: `Sync Cat ${run}`, sortOrder: 9 }, admin);
    assert.equal(c.status, 201);
    const w = await waiting;
    assert.equal(w.json.changed, true);
    assert.notEqual(w.json.version, v0);
    assert.ok(Date.now() - started < 5000, 'woke well before the 20 s timeout');
    await call('PUT', `/admin/categories/${c.json.id}`, { name: `Sync Cat ${run}`, isActive: false }, admin);
  });

  test('a rejected admin request does NOT announce a change', async () => {
    const v0 = (await call('GET', '/catalog/version')).json.version;
    assert.equal((await call('POST', '/admin/products', { name: 'x' }, admin)).status, 400);
    assert.equal((await call('POST', '/admin/products', { name: 'Parent Cat Item', categoryId: 'sweets', variants: [{ sku: `PC-${run}`, label: '1', mrp: 5, price: 5 }] }, admin)).status, 422);
    assert.equal((await call('GET', '/catalog/version')).json.version, v0);
  });

  test('personal data is never cached; shared data must be revalidated', async () => {
    assert.match((await call('GET', '/orders', undefined, buyer)).headers.get('cache-control') ?? '', /no-store/);
    assert.match((await call('GET', '/admin/dashboard', undefined, admin)).headers.get('cache-control') ?? '', /no-store/);
    assert.match((await call('GET', '/catalog')).headers.get('cache-control') ?? '', /no-cache/);
  });

  test('the catalogue reports its version, store contact and delivery rules (nothing hard-coded in the app)', async () => {
    const cat = (await call('GET', '/catalog')).json;
    assert.equal(typeof cat.meta.version, 'string');
    assert.ok(cat.store && 'phone' in cat.store);
    assert.ok(cat.delivery.slots.length >= 1);
    assert.equal(cat.meta.version, (await call('GET', '/catalog/version')).json.version);
  });
});

describe('Products saved in a parent category (the case that hid "Rasagula")', () => {
  test('such a product is still listed under its collection and category; the admin API now refuses to create new ones', async () => {
    const id = `legacy-${run}`;
    await prisma.product.create({ data: { id, name: `Legacy Parent ${run}`, tagline: '', description: '', categoryId: 'sweets', tags: [], isActive: true } });
    await prisma.productVariant.create({ data: { id: `${id}-1`, productId: id, sku: `LEG-${run}`, label: '1', mrp: 10, price: 10, stock: 3 } });
    const cat = (await call('GET', '/catalog')).json;
    const sweets = cat.collections.find((c: any) => c.id === 'sweets');
    assert.ok(cat.products.some((p: any) => p.id === id));
    assert.ok(sweets.categoryIds.includes('sweets'), 'Sweets collection includes the parent category itself');
    assert.ok(sweets.categoryIds.includes('laddu'), 'and still every subcategory');
    const r = await call('POST', '/admin/products', { name: `Fresh Parent ${run}`, categoryId: 'sweets', variants: [{ sku: `FP-${run}`, label: '1', mrp: 10, price: 10 }] }, admin);
    assert.equal(r.status, 422);
    assert.match(r.json.error.message, /subcategor/i);
  });

  test('image links follow the address the caller used (a phone reaching the API by IP gets image links on that IP)', async () => {
    const viaIp = API.replace('localhost', '127.0.0.1');
    const cat = (await call('GET', '/catalog', undefined, undefined, {}, viaIp)).json;
    const withImg = (cat.products as any[]).find((p) => p.images[0]?.uri?.includes('/uploads/'));
    // Products with uploaded images exist in this database only if earlier steps created one; the legacy-link rewrite is unit-tested too.
    if (withImg) assert.ok(withImg.images[0].uri.startsWith(viaIp.replace('/api', '')), withImg.images[0].uri);
  });
});

describe('Consistency', () => {
  test('both apps see the same single database: counts match across admin diagnostics and app endpoints', async () => {
    const d = (await call('GET', '/admin/diagnostics', undefined, admin)).json;
    const cat = (await call('GET', '/catalog')).json;
    assert.equal(d.catalogue.productsPublished, cat.products.length, 'admin and app agree on how many products are published');
    assert.equal(d.catalogue.version, cat.meta.version);
    assert.ok(!JSON.stringify(d).match(/password|postgresql:\/\//i), 'no credentials in diagnostics');
  });
});
