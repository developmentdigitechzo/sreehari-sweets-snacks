import assert from 'node:assert/strict';
import { test } from 'node:test';
import { devEmailSender, devOutbox, resendEmailSender } from './email.js';
import { hashToken, newResetToken } from '../auth/reset.routes.js';

test('reset tokens are long, random, URL-safe, and only their hash is derivable for storage', () => {
  const a = newResetToken();
  const b = newResetToken();
  assert.notEqual(a, b);
  assert.ok(a.length >= 40 && /^[A-Za-z0-9_-]+$/.test(a));
  assert.equal(hashToken(a).length, 64);
  assert.ok(!hashToken(a).includes(a));
  assert.equal(hashToken(a), hashToken(a));
});

test('dev email sender stores into the outbox only', async () => {
  const before = devOutbox().length;
  await devEmailSender.send({ to: 'a@b.co', subject: 's', text: 't' });
  assert.equal(devOutbox().length, before + 1);
});

test('resend sender: accepted => resolves; rejected or unreachable => error (never a silent success)', async () => {
  let sent: { url: string; init: RequestInit } | undefined;
  const ok = resendEmailSender({ apiKey: 're_x', from: 'Shree Hari <no-reply@example.com>' }, (async (url: string, init: RequestInit) => { sent = { url, init }; return new Response('{}', { status: 200 }); }) as typeof fetch);
  await ok.send({ to: 'a@b.co', subject: 'Hi', text: 'Body' });
  assert.equal(sent!.url, 'https://api.resend.com/emails');
  assert.equal((sent!.init.headers as Record<string, string>).Authorization, 'Bearer re_x');
  assert.deepEqual(JSON.parse(String(sent!.init.body)).to, ['a@b.co']);
  const bad = resendEmailSender({ apiKey: 'k', from: 'f' }, (async () => new Response('{}', { status: 422 })) as typeof fetch);
  await assert.rejects(() => bad.send({ to: 'a@b.co', subject: 's', text: 't' }), (e: Error & { code?: string }) => e.code === 'EMAIL_DELIVERY_FAILED');
  const down = resendEmailSender({ apiKey: 'k', from: 'f' }, (async () => { throw new Error('x'); }) as typeof fetch);
  await assert.rejects(() => down.send({ to: 'a@b.co', subject: 's', text: 't' }), (e: Error & { code?: string }) => e.code === 'EMAIL_DELIVERY_FAILED');
});
