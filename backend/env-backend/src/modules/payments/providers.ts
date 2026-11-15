import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/errors.js';

export type ParsedWebhook = {
  eventId: string;
  type: 'payment.captured' | 'payment.failed' | 'refund.processed' | 'ignored';
  providerOrderId?: string;
  providerPaymentId?: string;
  amountPaise?: number;
};

export interface PaymentProvider {
  name: 'razorpay' | 'test';
  /** Creates the order at the provider for the amount the SERVER calculated. */
  createOrder(input: { amountPaise: number; receipt: string }): Promise<{ providerOrderId: string; keyId: string }>;
  /** Checkout success callback check: HMAC(order_id|payment_id). A client claim alone never marks an order paid. */
  verifyPaymentSignature(input: { providerOrderId: string; paymentId: string; signature: string }): boolean;
  /** Webhook authenticity: HMAC of the exact raw body. */
  verifyWebhookSignature(rawBody: Buffer, signature: string | undefined): boolean;
  parseWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): ParsedWebhook | null;
  /** Refund a captured payment (full or partial). The authoritative result still arrives as a refund.processed webhook. */
  refund?(input: { providerPaymentId: string; amountPaise: number; receipt: string }): Promise<{ refundId: string }>;
}

const hmacHex = (secret: string, data: string | Buffer) => createHmac('sha256', secret).update(data).digest('hex');
export const safeEqualHex = (a: string, b: string) => {
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  return x.length === y.length && timingSafeEqual(x, y);
};

type Secrets = { keyId: string; paymentSecret: string; webhookSecret: string };

/** Razorpay-style signature rules shared by the real provider and the test double. */
function hmacProvider(name: PaymentProvider['name'], s: Secrets, createOrder: PaymentProvider['createOrder']): PaymentProvider {
  return {
    name,
    createOrder,
    verifyPaymentSignature: ({ providerOrderId, paymentId, signature }) => safeEqualHex(hmacHex(s.paymentSecret, `${providerOrderId}|${paymentId}`), signature),
    verifyWebhookSignature: (raw, signature) => !!signature && safeEqualHex(hmacHex(s.webhookSecret, raw), signature),
    parseWebhook(raw, headers) {
      let body: { event?: string; payload?: { payment?: { entity?: { id?: string; order_id?: string; amount?: number } }; refund?: { entity?: { payment_id?: string; amount?: number } } } };
      try { body = JSON.parse(raw.toString('utf8')); } catch { return null; }
      const eventId = String(headers['x-razorpay-event-id'] ?? '');
      if (!eventId) return null;
      const pay = body.payload?.payment?.entity;
      const ref = body.payload?.refund?.entity;
      if (body.event === 'payment.captured') return { eventId, type: 'payment.captured', providerOrderId: pay?.order_id, providerPaymentId: pay?.id, amountPaise: pay?.amount };
      if (body.event === 'payment.failed') return { eventId, type: 'payment.failed', providerOrderId: pay?.order_id, providerPaymentId: pay?.id };
      if (body.event === 'refund.processed') return { eventId, type: 'refund.processed', providerPaymentId: ref?.payment_id, amountPaise: ref?.amount };
      return { eventId, type: 'ignored' };
    },
  };
}

/** Real Razorpay (use TEST-mode keys for the sandbox; live keys only with explicit authorisation). `fetchImpl` is injectable. */
export function razorpayProvider(cfg: Secrets, fetchImpl: typeof fetch = fetch): PaymentProvider {
  const provider = hmacProvider('razorpay', cfg, async ({ amountPaise, receipt }) => {
    let res: Response;
    try {
      res = await fetchImpl('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: { Authorization: 'Basic ' + Buffer.from(`${cfg.keyId}:${cfg.paymentSecret}`).toString('base64'), 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amountPaise, currency: 'INR', receipt }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new AppError(502, 'The payment service is unavailable right now. Please try again.', 'PAYMENT_PROVIDER_UNAVAILABLE');
    }
    if (!res.ok) throw new AppError(502, 'The payment service could not start this payment. Please try again.', 'PAYMENT_PROVIDER_ERROR');
    const json = (await res.json()) as { id?: string };
    if (!json.id) throw new AppError(502, 'The payment service returned an unexpected response.', 'PAYMENT_PROVIDER_ERROR');
    return { providerOrderId: json.id, keyId: cfg.keyId };
  });
  provider.refund = async ({ providerPaymentId, amountPaise, receipt }) => {
    let res: Response;
    try {
      res = await fetchImpl(`https://api.razorpay.com/v1/payments/${encodeURIComponent(providerPaymentId)}/refund`, {
        method: 'POST',
        headers: { Authorization: 'Basic ' + Buffer.from(`${cfg.keyId}:${cfg.paymentSecret}`).toString('base64'), 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amountPaise, receipt }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new AppError(502, 'The payment service is unavailable right now. Try the refund again shortly.', 'PAYMENT_PROVIDER_UNAVAILABLE');
    }
    if (!res.ok) throw new AppError(502, 'The payment service rejected this refund. Check the payment in the provider dashboard.', 'PAYMENT_PROVIDER_ERROR');
    const json = (await res.json()) as { id?: string };
    if (!json.id) throw new AppError(502, 'The payment service returned an unexpected response.', 'PAYMENT_PROVIDER_ERROR');
    return { refundId: json.id };
  };
  return provider;
}

/**
 * AUTOMATED-TEST DOUBLE ONLY (PAYMENT_PROVIDER=test, refused in production). It creates fake provider order ids and uses the
 * same signature verification code as Razorpay, with fixed test secrets. It never "completes" a payment by itself: a test must
 * sign the callback/webhook, exactly as the real provider would.
 */
export const TEST_SECRETS: Secrets = { keyId: 'rzp_test_double', paymentSecret: 'test-payment-secret', webhookSecret: 'test-webhook-secret' };
export const testProvider = (): PaymentProvider =>
  hmacProvider('test', TEST_SECRETS, async ({ receipt }) => ({ providerOrderId: `order_test_${receipt.replace(/\W/g, '')}_${Date.now().toString(36)}`, keyId: TEST_SECRETS.keyId }));

export const signPayment = (secrets: Secrets, orderId: string, paymentId: string) => hmacHex(secrets.paymentSecret, `${orderId}|${paymentId}`);
export const signWebhook = (secrets: Secrets, raw: string | Buffer) => hmacHex(secrets.webhookSecret, raw);

export function activeProvider(): PaymentProvider | null {
  if (env.PAYMENT_PROVIDER === 'test') return testProvider();
  if (env.PAYMENT_PROVIDER === 'razorpay' && env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET && env.RAZORPAY_WEBHOOK_SECRET) {
    return razorpayProvider({ keyId: env.RAZORPAY_KEY_ID, paymentSecret: env.RAZORPAY_KEY_SECRET, webhookSecret: env.RAZORPAY_WEBHOOK_SECRET });
  }
  return null;
}
