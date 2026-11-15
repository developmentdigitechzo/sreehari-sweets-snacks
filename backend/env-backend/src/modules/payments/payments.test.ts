import assert from 'node:assert/strict';
import { test } from 'node:test';
import { razorpayProvider, signPayment, signWebhook, TEST_SECRETS, testProvider } from './providers.js';

const p = testProvider();
const body = (event: string, extra: object = {}) =>
  Buffer.from(JSON.stringify({ event, payload: { payment: { entity: { id: 'pay_1', order_id: 'order_1', amount: 70600 } }, refund: { entity: { payment_id: 'pay_1', amount: 70600 } }, ...extra } }));
const headers = (id = 'evt_1') => ({ 'x-razorpay-event-id': id });

test('payment signature: only the exact order|payment pair signed with the secret verifies', () => {
  const sig = signPayment(TEST_SECRETS, 'order_1', 'pay_1');
  assert.equal(p.verifyPaymentSignature({ providerOrderId: 'order_1', paymentId: 'pay_1', signature: sig }), true);
  assert.equal(p.verifyPaymentSignature({ providerOrderId: 'order_2', paymentId: 'pay_1', signature: sig }), false); // different order
  assert.equal(p.verifyPaymentSignature({ providerOrderId: 'order_1', paymentId: 'pay_2', signature: sig }), false); // different payment
  assert.equal(p.verifyPaymentSignature({ providerOrderId: 'order_1', paymentId: 'pay_1', signature: 'deadbeef' }), false);
  assert.equal(p.verifyPaymentSignature({ providerOrderId: 'order_1', paymentId: 'pay_1', signature: '' }), false);
});

test('webhook signature covers the exact raw bytes', () => {
  const raw = body('payment.captured');
  const sig = signWebhook(TEST_SECRETS, raw);
  assert.equal(p.verifyWebhookSignature(raw, sig), true);
  assert.equal(p.verifyWebhookSignature(Buffer.from(raw.toString().replace('70600', '1')), sig), false); // body tampered
  assert.equal(p.verifyWebhookSignature(raw, undefined), false);
  assert.equal(p.verifyWebhookSignature(raw, 'nope'), false);
  assert.equal(p.verifyWebhookSignature(raw, signPayment(TEST_SECRETS, 'a', 'b')), false); // payment secret != webhook secret
});

test('webhook parsing: captured, failed, refund, ignored, and malformed', () => {
  assert.deepEqual(p.parseWebhook(body('payment.captured'), headers()), { eventId: 'evt_1', type: 'payment.captured', providerOrderId: 'order_1', providerPaymentId: 'pay_1', amountPaise: 70600 });
  assert.equal(p.parseWebhook(body('payment.failed'), headers())?.type, 'payment.failed');
  assert.equal(p.parseWebhook(body('refund.processed'), headers())?.providerPaymentId, 'pay_1');
  assert.equal(p.parseWebhook(body('order.paid'), headers())?.type, 'ignored');
  assert.equal(p.parseWebhook(body('payment.captured'), {}), null); // no event id => cannot be made idempotent
  assert.equal(p.parseWebhook(Buffer.from('not json'), headers()), null);
});

test('razorpay createOrder sends the SERVER amount with basic auth and returns the provider order id', async () => {
  let seen: { url: string; init: RequestInit } | undefined;
  const rp = razorpayProvider({ keyId: 'rzp_test_x', paymentSecret: 's', webhookSecret: 'w' }, (async (url: string, init: RequestInit) => {
    seen = { url, init };
    return new Response(JSON.stringify({ id: 'order_ABC' }), { status: 200 });
  }) as typeof fetch);
  const r = await rp.createOrder({ amountPaise: 70600, receipt: 'rcpt1' });
  assert.deepEqual(r, { providerOrderId: 'order_ABC', keyId: 'rzp_test_x' });
  assert.equal(seen!.url, 'https://api.razorpay.com/v1/orders');
  assert.deepEqual(JSON.parse(String(seen!.init.body)), { amount: 70600, currency: 'INR', receipt: 'rcpt1' });
  assert.match(String((seen!.init.headers as Record<string, string>).Authorization), /^Basic /);
});

test('razorpay failures surface as 502 errors, never as success', async () => {
  const mk = (f: typeof fetch) => razorpayProvider({ keyId: 'k', paymentSecret: 's', webhookSecret: 'w' }, f);
  await assert.rejects(() => mk((async () => new Response('{}', { status: 400 })) as typeof fetch).createOrder({ amountPaise: 1, receipt: 'r' }), (e: Error & { status?: number }) => e.status === 502);
  await assert.rejects(() => mk((async () => new Response('{}', { status: 200 })) as typeof fetch).createOrder({ amountPaise: 1, receipt: 'r' }), (e: Error & { status?: number }) => e.status === 502);
  await assert.rejects(() => mk((async () => { throw new Error('down'); }) as typeof fetch).createOrder({ amountPaise: 1, receipt: 'r' }), (e: Error & { status?: number }) => e.status === 502);
});
