import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canRequestOtp, evaluateAttempt, generateCode, hashCode, type OtpConfig } from './otp.policy.js';
import { devSender, twilioSender } from './otp.senders.js';

const cfg: OtpConfig = { ttlSeconds: 300, resendCooldownSeconds: 30, maxAttempts: 3, hourlyLimit: 5 };
const T0 = new Date('2026-11-02T10:00:00Z');
const at = (s: number) => new Date(T0.getTime() + s * 1000);
const SECRET = 'unit-test-secret-1234567890';
const challenge = (code: string, over: Partial<{ attempts: number; expiresAt: Date; consumedAt: Date | null }> = {}) => ({
  codeHash: hashCode(SECRET, '+919876543210', code), attempts: 0, expiresAt: at(300), consumedAt: null, ...over,
});
const hash = (c: string) => hashCode(SECRET, '+919876543210', c);

test('codes are 6 digits, vary, and come from a CSPRNG-backed generator', () => {
  const codes = Array.from({ length: 500 }, generateCode);
  assert.ok(codes.every((c) => /^\d{6}$/.test(c)));
  assert.ok(new Set(codes).size > 450);
});

test('stored hash is keyed and bound to the phone number', () => {
  assert.notEqual(hashCode(SECRET, '+919876543210', '123456'), hashCode(SECRET, '+919876543211', '123456'));
  assert.notEqual(hashCode(SECRET, '+919876543210', '123456'), hashCode('another-secret-123456', '+919876543210', '123456'));
  assert.ok(!hashCode(SECRET, '+919876543210', '123456').includes('123456'));
});

test('resend cooldown and hourly cap', () => {
  assert.deepEqual(canRequestOtp({ now: at(10), lastCreatedAt: T0, countLastHour: 1 }, cfg), { ok: false, reason: 'cooldown', retryAfterSeconds: 20 });
  assert.equal(canRequestOtp({ now: at(31), lastCreatedAt: T0, countLastHour: 1 }, cfg).ok, true);
  const capped = canRequestOtp({ now: at(900), lastCreatedAt: T0, countLastHour: 5 }, cfg);
  assert.equal(capped.ok, false);
  assert.equal(capped.ok === false && capped.reason, 'hourly_limit');
});

test('correct code verifies; wrong code reports attempts left', () => {
  assert.deepEqual(evaluateAttempt({ now: at(5), code: '111111', challenge: challenge('111111') }, cfg, hash), { result: 'ok' });
  assert.deepEqual(evaluateAttempt({ now: at(5), code: '000000', challenge: challenge('111111') }, cfg, hash), { result: 'wrong', attemptsLeft: 2 });
  assert.deepEqual(evaluateAttempt({ now: at(5), code: '000000', challenge: challenge('111111', { attempts: 2 }) }, cfg, hash), { result: 'wrong', attemptsLeft: 0 });
});

test('attempt limit locks the challenge even for the correct code', () => {
  assert.deepEqual(evaluateAttempt({ now: at(5), code: '111111', challenge: challenge('111111', { attempts: 3 }) }, cfg, hash), { result: 'locked' });
});

test('expired and already-used codes are rejected (single use)', () => {
  assert.deepEqual(evaluateAttempt({ now: at(301), code: '111111', challenge: challenge('111111') }, cfg, hash), { result: 'expired' });
  assert.deepEqual(evaluateAttempt({ now: at(5), code: '111111', challenge: challenge('111111', { consumedAt: at(2) }) }, cfg, hash), { result: 'used' });
});

test('development sender flags itself and returns the code; it is never an "sms" delivery', async () => {
  const r = await devSender.send('+919876543210', '123456');
  assert.equal(r.delivery, 'development');
  assert.equal(r.devCode, '123456');
});

test('twilio sender: posts the right request and reports sms only when accepted', async () => {
  let seen: { url: string; init: RequestInit } | undefined;
  const ok = twilioSender({ accountSid: 'ACxxx', authToken: 'tok', from: '+15550001111' }, (async (url: string, init: RequestInit) => { seen = { url, init }; return new Response('{}', { status: 201 }); }) as typeof fetch);
  const r = await ok.send('+919876543210', '123456');
  assert.deepEqual(r, { delivery: 'sms' });
  assert.match(seen!.url, /Accounts\/ACxxx\/Messages\.json$/);
  assert.match(String(seen!.init.body), /To=%2B919876543210/);
  assert.match(String((seen!.init.headers as Record<string, string>).Authorization), /^Basic /);
});

test('twilio failure is an error, never a "sent" result, and the response does not leak the code', async () => {
  const bad = twilioSender({ accountSid: 'ACxxx', authToken: 'tok', from: '+1' }, (async () => new Response('{}', { status: 401 })) as typeof fetch);
  await assert.rejects(() => bad.send('+919876543210', '654321'), (e: Error & { code?: string }) => e.code === 'SMS_DELIVERY_FAILED' && !e.message.includes('654321'));
  const down = twilioSender({ accountSid: 'ACxxx', authToken: 'tok', from: '+1' }, (async () => { throw new Error('network'); }) as typeof fetch);
  await assert.rejects(() => down.send('+919876543210', '654321'), (e: Error & { code?: string }) => e.code === 'SMS_DELIVERY_FAILED');
});
