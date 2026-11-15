import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateEnv } from './envSchema.js';

const base = { DATABASE_URL: 'postgresql://u:p@localhost:5432/db', JWT_SECRET: 'a-sufficiently-long-secret-123' };
const problems = (e: Record<string, string>) => {
  const r = validateEnv({ ...base, ...e } as NodeJS.ProcessEnv);
  return r.ok ? [] : r.problems;
};

test('minimal config is valid and safe by default (everything optional is off)', () => {
  const r = validateEnv(base as NodeJS.ProcessEnv);
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.env.OTP_PROVIDER, 'none');
    assert.equal(r.env.EMAIL_PROVIDER, 'none');
    assert.equal(r.env.PAYMENT_PROVIDER, 'none');
    assert.equal(r.env.GEOCODER_PROVIDER, 'none');
  }
});

test('missing required values are reported by name', () => {
  const r = validateEnv({} as NodeJS.ProcessEnv);
  assert.equal(r.ok, false);
  assert.ok(!r.ok && r.problems.some((p) => p.startsWith('DATABASE_URL')) && r.problems.some((p) => p.startsWith('JWT_SECRET')));
});

test('a selected provider must have its credentials', () => {
  assert.match(problems({ GEOCODER_PROVIDER: 'google' }).join(), /GOOGLE_MAPS_API_KEY/);
  assert.match(problems({ OTP_PROVIDER: 'twilio', TWILIO_ACCOUNT_SID: 'AC1' }).join(), /TWILIO_AUTH_TOKEN/);
  assert.match(problems({ EMAIL_PROVIDER: 'resend' }).join(), /RESEND_API_KEY/);
  assert.match(problems({ PAYMENT_PROVIDER: 'razorpay', RAZORPAY_KEY_ID: 'k' }).join(), /RAZORPAY_KEY_SECRET.*RAZORPAY_WEBHOOK_SECRET/);
  assert.deepEqual(problems({ PAYMENT_PROVIDER: 'razorpay', RAZORPAY_KEY_ID: 'k', RAZORPAY_KEY_SECRET: 's', RAZORPAY_WEBHOOK_SECRET: 'w' }), []);
});

test('production refuses development doubles and demo login', () => {
  const prod = problems({ NODE_ENV: 'production', OTP_PROVIDER: 'dev', EMAIL_PROVIDER: 'dev', PAYMENT_PROVIDER: 'test', ENABLE_DEMO_LOGIN: 'true' }).join('\n');
  assert.match(prod, /ENABLE_DEMO_LOGIN/);
  assert.match(prod, /OTP_PROVIDER=dev/);
  assert.match(prod, /EMAIL_PROVIDER=dev/);
  assert.match(prod, /PAYMENT_PROVIDER=test/);
  assert.deepEqual(problems({ NODE_ENV: 'production', ENABLE_DEMO_LOGIN: 'false' }), []);
});

test('error messages never contain secret values', () => {
  const out = problems({ JWT_SECRET: 'short-secret', PAYMENT_PROVIDER: 'razorpay', RAZORPAY_KEY_ID: 'VERY-SECRET-KEY-ID' }).join('\n');
  assert.ok(!out.includes('short-secret') && !out.includes('VERY-SECRET-KEY-ID'));
});
