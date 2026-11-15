/**
 * Integration tests for OTP, password reset and the payment lifecycle against a REAL running API + PostgreSQL.
 * The API must run with: OTP_PROVIDER=dev EMAIL_PROVIDER=dev PAYMENT_PROVIDER=test
 *   OTP_RESEND_COOLDOWN_SECONDS=1 OTP_MAX_ATTEMPTS=3 OTP_HOURLY_LIMIT=100 AUTH_RATE_LIMIT_PER_MIN=500
 * No real SMS, email or payment is made: the dev/test providers are local doubles that run the real verification logic.
 * Use a THROWAWAY database. Run: API_URL=... DATABASE_URL=... JWT_SECRET=... npm run test:flows
 */
import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { expireStalePayments } from '../modules/payments/payments.service.js';
import { signPayment, signWebhook, TEST_SECRETS } from '../modules/payments/providers.js';

const API = process.env.API_URL ?? 'http://localhost:4012/api';
const prisma = new PrismaClient();
const run = Date.now().toString().slice(-6);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Test helper: API responses are untyped JSON, so property access is intentionally loose here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = Record<string, any>;
async function call(method: string, path: string, body?: unknown, token?: string, headers: Record<string, string> = {}, raw?: string) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { ...(raw === undefined ? { 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
  const text = await res.text();
  let json: J = {};
  try { json = text ? JSON.parse(text) : {}; } catch { /* empty */ }
  return { status: res.status, json };
}

const phone = (n: number) => `+9197${run}${String(n).padStart(2, '0')}`; // +91 + 10 digits
const addr = { label: 'Home', name: 'Flow Tester', phone: '+919700000000', line1: '5 Flow Street', area: 'Anna Nagar', city: 'Chennai', pincode: '600040' };
const stockOf = async (id: string) => (await prisma.productVariant.findUniqueOrThrow({ where: { id } })).stock;

async function signup(n: number, withEmail = true) {
  const body = { name: `Flow ${n}`, phone: phone(n), email: withEmail ? `flow${n}.${run}@example.com` : undefined, password: 'Sweets2026', consent: true };
  const r = await call('POST', '/auth/signup', body);
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return { token: r.json.token as string, user: r.json.user as J, email: body.email as string, phone: body.phone };
}

after(async () => { await prisma.$disconnect(); });

describe('OTP (development provider)', () => {
  test('known number: accepted, flagged as development delivery, code stored only as a hash', async () => {
    const u = await signup(1);
    const r = await call('POST', '/auth/otp/request', { phone: u.phone, purpose: 'login' });
    assert.equal(r.status, 202);
    assert.equal(r.json.delivery, 'development'); // never claims "sms" in dev mode
    assert.match(r.json.devCode, /^\d{6}$/);
    const row = await prisma.otpChallenge.findFirstOrThrow({ where: { phone: u.phone }, orderBy: { createdAt: 'desc' } });
    assert.ok(!JSON.stringify(row).includes(r.json.devCode));
    assert.equal(row.codeHash.length, 64);
  });

  test('unknown number gets the same response shape, with no code and no challenge row', async () => {
    const r = await call('POST', '/auth/otp/request', { phone: '+919000011122', purpose: 'login' });
    assert.equal(r.status, 202);
    assert.equal(r.json.accepted, true);
    assert.equal(r.json.devCode, undefined);
    assert.equal(await prisma.otpChallenge.count({ where: { phone: '+919000011122' } }), 0);
  });

  test('correct code logs in once; the same code cannot be reused', async () => {
    const u = await signup(2);
    const req = await call('POST', '/auth/otp/request', { phone: u.phone, purpose: 'login' });
    const ok = await call('POST', '/auth/otp/verify', { phone: u.phone, purpose: 'login', code: req.json.devCode });
    assert.equal(ok.status, 200);
    assert.ok(ok.json.token);
    assert.equal((await prisma.customer.findUniqueOrThrow({ where: { phone: u.phone } })).phoneVerifiedAt !== null, true);
    const again = await call('POST', '/auth/otp/verify', { phone: u.phone, purpose: 'login', code: req.json.devCode });
    assert.equal(again.status, 401);
  });

  test('wrong codes consume attempts and then lock the challenge, even for the right code', async () => {
    const u = await signup(3);
    const req = await call('POST', '/auth/otp/request', { phone: u.phone, purpose: 'login' });
    const wrong = req.json.devCode === '000000' ? '111111' : '000000';
    const a1 = await call('POST', '/auth/otp/verify', { phone: u.phone, purpose: 'login', code: wrong });
    assert.equal(a1.status, 401);
    assert.match(a1.json.error.message, /2 attempts left/);
    await call('POST', '/auth/otp/verify', { phone: u.phone, purpose: 'login', code: wrong });
    await call('POST', '/auth/otp/verify', { phone: u.phone, purpose: 'login', code: wrong });
    const locked = await call('POST', '/auth/otp/verify', { phone: u.phone, purpose: 'login', code: req.json.devCode });
    assert.equal(locked.status, 429);
    assert.equal(locked.json.error.code, 'OTP_LOCKED');
  });

  test('resend cooldown blocks an immediate second request, then allows it', async () => {
    const u = await signup(4);
    assert.equal((await call('POST', '/auth/otp/request', { phone: u.phone, purpose: 'login' })).status, 202);
    const second = await call('POST', '/auth/otp/request', { phone: u.phone, purpose: 'login' });
    assert.equal(second.status, 429);
    assert.equal(second.json.error.code, 'OTP_RATE_LIMITED');
    await sleep(1200);
    assert.equal((await call('POST', '/auth/otp/request', { phone: u.phone, purpose: 'login' })).status, 202);
  });

  test('an expired code is rejected', async () => {
    const u = await signup(5);
    const req = await call('POST', '/auth/otp/request', { phone: u.phone, purpose: 'login' });
    await prisma.otpChallenge.updateMany({ where: { phone: u.phone }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const r = await call('POST', '/auth/otp/verify', { phone: u.phone, purpose: 'login', code: req.json.devCode });
    assert.equal(r.status, 410);
  });

  test('verify_phone needs sign-in and only works for your own number', async () => {
    const a = await signup(6);
    const b = await signup(7);
    assert.equal((await call('POST', '/auth/otp/request', { phone: a.phone, purpose: 'verify_phone' })).status, 401);
    assert.equal((await call('POST', '/auth/otp/request', { phone: a.phone, purpose: 'verify_phone' }, b.token)).status, 403);
    const req = await call('POST', '/auth/otp/request', { phone: a.phone, purpose: 'verify_phone' }, a.token);
    assert.equal(req.status, 202);
    const v = await call('POST', '/auth/otp/verify', { phone: a.phone, purpose: 'verify_phone', code: req.json.devCode }, a.token);
    assert.deepEqual(v.json, { verified: true });
  });

  test('malformed input is rejected before any work is done', async () => {
    assert.equal((await call('POST', '/auth/otp/request', { phone: '123', purpose: 'login' })).status, 400);
    assert.equal((await call('POST', '/auth/otp/verify', { phone: phone(1), purpose: 'login', code: '12' })).status, 400);
  });
});

describe('password reset (development email provider)', () => {
  const tokenFromOutbox = async (email: string) => {
    const box = (await call('GET', '/dev/outbox')).json as J[];
    const mail = [...box].reverse().find((m) => m.to === email);
    return mail ? decodeURIComponent(/token=([^\s]+)/.exec(mail.text)![1]) : undefined;
  };

  test('known and unknown emails get an identical response; only the known one gets mail', async () => {
    const u = await signup(10);
    const before = ((await call('GET', '/dev/outbox')).json as J[]).length;
    const known = await call('POST', '/auth/forgot-password', { email: u.email });
    const unknown = await call('POST', '/auth/forgot-password', { email: `nobody.${run}@example.com` });
    assert.equal(known.status, 202);
    assert.deepEqual(known.json, unknown.json);
    assert.equal(((await call('GET', '/dev/outbox')).json as J[]).length, before + 1);
  });

  test('the raw token is only in the email; the database holds a hash', async () => {
    const u = await signup(11);
    await call('POST', '/auth/forgot-password', { email: u.email });
    const token = await tokenFromOutbox(u.email);
    assert.ok(token && token.length >= 40);
    const rows = await prisma.passwordResetToken.findMany({ where: { customerId: u.user.id } });
    assert.equal(rows.length, 1);
    assert.notEqual(rows[0].tokenHash, token);
    assert.equal(rows[0].tokenHash.length, 64);
  });

  test('reset changes the password, old password stops working, token is single-use', async () => {
    const u = await signup(12);
    await call('POST', '/auth/forgot-password', { email: u.email });
    const token = (await tokenFromOutbox(u.email))!;
    assert.equal((await call('POST', '/auth/reset-password', { token, password: 'weak' })).status, 400);
    const ok = await call('POST', '/auth/reset-password', { token, password: 'NewSweets2027' });
    assert.equal(ok.status, 200);
    assert.equal((await call('POST', '/auth/login', { identifier: u.phone, password: 'Sweets2026' })).status, 401);
    assert.equal((await call('POST', '/auth/login', { identifier: u.phone, password: 'NewSweets2027' })).status, 200);
    const replay = await call('POST', '/auth/reset-password', { token, password: 'Another2028x' });
    assert.equal(replay.status, 400);
    assert.equal(replay.json.error.code, 'RESET_TOKEN_INVALID');
  });

  test('concurrent use of one token succeeds exactly once', async () => {
    const u = await signup(13);
    await call('POST', '/auth/forgot-password', { email: u.email });
    const token = (await tokenFromOutbox(u.email))!;
    const [a, b] = await Promise.all([
      call('POST', '/auth/reset-password', { token, password: 'RaceOne2027x' }),
      call('POST', '/auth/reset-password', { token, password: 'RaceTwo2027x' }),
    ]);
    assert.deepEqual([a.status, b.status].sort(), [200, 400]);
  });

  test('a newer link invalidates the older one; expired tokens are rejected', async () => {
    const u = await signup(14);
    await call('POST', '/auth/forgot-password', { email: u.email });
    const first = (await tokenFromOutbox(u.email))!;
    await call('POST', '/auth/forgot-password', { email: u.email });
    const second = (await tokenFromOutbox(u.email))!;
    assert.notEqual(first, second);
    assert.equal((await call('POST', '/auth/reset-password', { token: first, password: 'OldLink2027x' })).status, 400);
    await prisma.passwordResetToken.updateMany({ where: { customerId: u.user.id, usedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } });
    assert.equal((await call('POST', '/auth/reset-password', { token: second, password: 'Expired2027x' })).status, 400);
  });

  test('per-account throttle: the 4th request in an hour sends no further email', async () => {
    const u = await signup(15);
    for (let i = 0; i < 3; i++) await call('POST', '/auth/forgot-password', { email: u.email });
    const before = ((await call('GET', '/dev/outbox')).json as J[]).filter((m) => m.to === u.email).length;
    const fourth = await call('POST', '/auth/forgot-password', { email: u.email });
    assert.equal(fourth.status, 202); // same answer: nothing is revealed
    assert.equal(((await call('GET', '/dev/outbox')).json as J[]).filter((m) => m.to === u.email).length, before);
  });

  test('garbage tokens are rejected', async () => {
    assert.equal((await call('POST', '/auth/reset-password', { token: 'x'.repeat(50), password: 'Sweets2026x' })).status, 400);
  });
});

describe('online payments (test provider, real signature checks)', () => {
  const key = () => `pay-${run}-${Math.random().toString(36).slice(2, 10)}`;
  const online = (variantId: string, productId: string, extra: J = {}) => ({
    idempotencyKey: key(), items: [{ productId, variantId, qty: 1 }], slotId: 'express', address: addr, paymentMethod: 'upi', simulatedOutcome: 'success', redeemPoints: 0, ...extra,
  });
  const webhook = async (event: string, order: { providerOrderId: string }, paymentId: string, amountPaise: number, eventId: string, secretsOverride?: typeof TEST_SECRETS) => {
    const raw = JSON.stringify({ event, payload: { payment: { entity: { id: paymentId, order_id: order.providerOrderId, amount: amountPaise } }, refund: { entity: { payment_id: paymentId, amount: amountPaise } } } });
    return call('POST', '/webhooks/payments', undefined, undefined, { 'x-razorpay-signature': signWebhook(secretsOverride ?? TEST_SECRETS, raw), 'x-razorpay-event-id': eventId }, raw);
  };

  test('the server creates the provider order for ITS total; a client "success" claim does not mark it paid', async () => {
    const u = await signup(20);
    const before = await stockOf('murukku-250g');
    const r = await call('POST', '/orders', online('murukku-250g', 'butter-murukku', { simulatedOutcome: 'success', total: 1 }), u.token);
    assert.equal(r.status, 201);
    assert.equal(r.json.outcome, 'requires_payment');
    assert.equal(r.json.order.payment.status, 'pending');
    assert.equal(r.json.order.payment.simulated, false);
    assert.equal(r.json.payment.amount, (110 + 40) * 100); // 250 g murukku + express delivery, from the database
    assert.match(r.json.payment.providerOrderId, /^order_test_/);
    assert.equal(await stockOf('murukku-250g'), before - 1); // stock held while unpaid
    assert.equal(await prisma.rewardLedger.count({ where: { customerId: u.user.id } }), 0); // nothing earned yet
  });

  test('retrying the same checkout returns the same provider order (no duplicate order)', async () => {
    const u = await signup(21);
    const body = online('banana-chips-250g', 'banana-chips');
    const a = await call('POST', '/orders', body, u.token);
    const b = await call('POST', '/orders', body, u.token);
    assert.equal(a.json.order.id, b.json.order.id);
    assert.equal(a.json.payment.providerOrderId, b.json.payment.providerOrderId);
    assert.equal(b.json.outcome, 'requires_payment');
  });

  test('client verification: bad signature, other customer and tampered ids are refused; a valid signature pays once', async () => {
    const u = await signup(22);
    const other = await signup(23);
    const o = await call('POST', '/orders', online('rasgulla-500g', 'rasgulla'), u.token);
    const id = o.json.order.id; const po = o.json.payment.providerOrderId;
    assert.equal((await call('POST', '/payments/verify', { orderId: id, paymentId: `pay_x1_${run}`, signature: 'a'.repeat(64) }, u.token)).status, 400);
    assert.equal((await call('GET', `/payments/${id}/status`, undefined, u.token)).json.status, 'pending');
    const good = signPayment(TEST_SECRETS, po, `pay_x1_${run}`);
    assert.equal((await call('POST', '/payments/verify', { orderId: id, paymentId: `pay_x1_${run}`, signature: good }, other.token)).status, 404); // not their order
    assert.equal((await call('POST', '/payments/verify', { orderId: id, paymentId: 'pay_OTHER', signature: good }, u.token)).status, 400); // signature is bound to the payment id
    const paid = await call('POST', '/payments/verify', { orderId: id, paymentId: `pay_x1_${run}`, signature: good }, u.token);
    assert.equal(paid.status, 200);
    assert.equal(paid.json.status, 'paid');
    const again = await call('POST', '/payments/verify', { orderId: id, paymentId: `pay_x1_${run}`, signature: good }, u.token);
    assert.equal(again.json.changed, false);
    assert.equal(await prisma.rewardLedger.count({ where: { customerId: u.user.id } }), 1); // earned exactly once
    assert.equal((await prisma.order.findUniqueOrThrow({ where: { id } })).status, 'CONFIRMED');
  });

  test('webhooks: forged signature rejected; captured pays; duplicate is a no-op; wrong amount is not trusted', async () => {
    const u = await signup(24);
    const o = await call('POST', '/orders', online('kaju-katli-250g', 'kaju-katli'), u.token);
    const po = o.json.payment;
    const forged = await webhook('payment.captured', po, `pay_w1_${run}`, po.amount, 'evt_a1', { ...TEST_SECRETS, webhookSecret: 'wrong-secret' });
    assert.equal(forged.status, 401);
    assert.equal(await prisma.paymentEvent.count({ where: { providerEventId: 'evt_a1' } }), 0); // nothing stored for a forged call
    const mismatch = await webhook('payment.captured', po, `pay_w1_${run}`, 100, `evt_m_${run}`);
    assert.equal(mismatch.json.status, 'ignored');
    assert.equal((await call('GET', `/payments/${o.json.order.id}/status`, undefined, u.token)).json.status, 'pending');
    const ok = await webhook('payment.captured', po, `pay_w1_${run}`, po.amount, `evt_ok_${run}`);
    assert.equal(ok.json.status, 'processed');
    assert.equal((await call('GET', `/payments/${o.json.order.id}/status`, undefined, u.token)).json.status, 'paid');
    const dup = await webhook('payment.captured', po, `pay_w1_${run}`, po.amount, `evt_ok_${run}`);
    assert.equal(dup.json.status, 'duplicate');
    assert.equal(await prisma.rewardLedger.count({ where: { customerId: u.user.id } }), 1);
    assert.equal(await prisma.paymentEvent.count({ where: { providerEventId: `evt_ok_${run}` } }), 1); // audit row kept
  });

  test('payment.failed cancels the order and releases the stock; late "captured" for a cancelled order changes nothing', async () => {
    const u = await signup(25);
    const before = await stockOf('besan-laddu-250g');
    const o = await call('POST', '/orders', online('besan-laddu-250g', 'besan-laddu'), u.token);
    assert.equal(await stockOf('besan-laddu-250g'), before - 1);
    const f = await webhook('payment.failed', o.json.payment, `pay_f1_${run}`, o.json.payment.amount, `evt_f_${run}`);
    assert.equal(f.json.status, 'processed');
    assert.equal((await call('GET', `/payments/${o.json.order.id}/status`, undefined, u.token)).json.status, 'failed');
    assert.equal(await stockOf('besan-laddu-250g'), before);
    assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: o.json.order.id } })).status, 'CANCELLED');
    await webhook('payment.captured', o.json.payment, `pay_f1_${run}`, o.json.payment.amount, `evt_late_${run}`);
    assert.equal((await call('GET', `/payments/${o.json.order.id}/status`, undefined, u.token)).json.status, 'failed');
  });

  test('refund.processed marks the payment refunded and reverses the earned points', async () => {
    const u = await signup(26);
    const o = await call('POST', '/orders', online('chocolate-truffle-cake-500g', 'chocolate-truffle-cake'), u.token);
    const po = o.json.payment;
    await webhook('payment.captured', po, `pay_r1_${run}`, po.amount, `evt_rc_${run}`);
    const r = await webhook('refund.processed', po, `pay_r1_${run}`, po.amount, `evt_rf_${run}`);
    assert.equal(r.json.status, 'processed');
    assert.equal((await call('GET', `/payments/${o.json.order.id}/status`, undefined, u.token)).json.status, 'refunded');
    const pts = (await prisma.rewardLedger.aggregate({ where: { customerId: u.user.id }, _sum: { points: true } }))._sum.points;
    assert.equal(pts, 0);
  });

  test('customer cancelling an unpaid payment releases stock; unauthorised users cannot', async () => {
    const u = await signup(27);
    const other = await signup(28);
    const before = await stockOf('karachi-halwa-500g');
    const o = await call('POST', '/orders', online('karachi-halwa-500g', 'karachi-halwa'), u.token);
    assert.equal((await call('POST', `/payments/${o.json.order.id}/cancel`, undefined, other.token)).status, 404);
    const c = await call('POST', `/payments/${o.json.order.id}/cancel`, undefined, u.token);
    assert.deepEqual(c.json, { cancelled: true, status: 'cancelled' });
    assert.equal(await stockOf('karachi-halwa-500g'), before);
    assert.equal((await call('POST', `/payments/${o.json.order.id}/cancel`, undefined, u.token)).json.cancelled, false); // idempotent
  });

  test('stale unpaid orders are cancelled by the expiry job and stock is released', async () => {
    const u = await signup(29);
    const before = await stockOf('pista-mysore-250g');
    const o = await call('POST', '/orders', online('pista-mysore-250g', 'pista-mysore-pak'), u.token);
    await prisma.payment.updateMany({ where: { orderId: o.json.order.id }, data: { createdAt: new Date(Date.now() - 3 * 3_600_000) } });
    const n = await expireStalePayments();
    assert.ok(n >= 1);
    assert.equal((await call('GET', `/payments/${o.json.order.id}/status`, undefined, u.token)).json.status, 'cancelled');
    assert.equal(await stockOf('pista-mysore-250g'), before);
    const admin = await prisma.customer.create({ data: { phone: `+9196${run}00`.slice(0, 13), name: 'Admin', role: 'SUPER_ADMIN' } });
    const adminToken = jwt.sign({ id: admin.id, role: 'SUPER_ADMIN' }, process.env.JWT_SECRET!);
    assert.equal((await call('POST', '/admin/payments/expire', undefined, adminToken)).status, 200);
    assert.equal((await call('POST', '/admin/payments/expire', undefined, u.token)).status, 401); // customers cannot
  });

  test('cash on delivery still works without any online payment', async () => {
    const u = await signup(30);
    const r = await call('POST', '/orders', online('mixture-250g', 'mixture', { paymentMethod: 'cod' }), u.token);
    assert.equal(r.status, 201);
    assert.equal(r.json.outcome, 'success');
    assert.equal(r.json.order.payment.status, 'cod_due');
  });

  test('webhook with no body or no signature is rejected', async () => {
    assert.equal((await call('POST', '/webhooks/payments', undefined, undefined, {}, '{}')).status, 401);
  });
});
