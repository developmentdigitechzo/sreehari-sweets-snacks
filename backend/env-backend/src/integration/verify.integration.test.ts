/* eslint-disable @typescript-eslint/no-explicit-any -- API responses are untyped JSON; property access in this test file is intentionally loose */
/**
 * Email verification against a REAL running API + PostgreSQL (throwaway database).
 * Start the API with: EMAIL_PROVIDER=dev AUTH_RATE_LIMIT_PER_MIN=500 PORT=4014 (and the 0006 migration applied)
 * Run: API_URL=http://localhost:4014/api npm run test:verify
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

const API = process.env.API_URL ?? 'http://localhost:4014/api';
const run = Date.now().toString().slice(-7);
const PW = 'Correct-horse-9';

async function call(method: string, path: string, body?: unknown, token?: string) {
  const res = await fetch(`${API}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json };
}

/** The newest link emailed to this address, read from the development outbox. */
async function latestToken(email: string): Promise<string | undefined> {
  const { json } = await call('GET', '/dev/outbox');
  const mail = [...(json as { to: string; subject: string; text: string }[])].reverse().find((m) => m.to === email && /verify/i.test(m.subject));
  return mail?.text.match(/token=([A-Za-z0-9_%-]+)/)?.[1];
}

describe('email verification', () => {
  const email = `verify${run}@test.example`;
  let token = '';

  test('capabilities say email verification is on', async () => {
    const { json } = await call('GET', '/capabilities');
    assert.equal(json.emailVerification, true);
  });

  test('signup with an email sends a link and the account starts unverified', async () => {
    const r = await call('POST', '/auth/signup', { name: 'Verify Me', phone: `+919${run}00`, email, password: PW, consent: true });
    assert.equal(r.status, 201);
    assert.equal(r.json.user.emailVerified, false);
    token = r.json.token;
    assert.ok(await latestToken(email), 'a verification email should be in the outbox');
  });

  test('a garbage token is rejected', async () => {
    const r = await call('POST', '/auth/email/verify', { token: 'x'.repeat(40) });
    assert.equal(r.status, 400);
    assert.equal(r.json.error.code, 'VERIFY_TOKEN_INVALID');
  });

  test('the emailed link verifies once, and cannot be replayed', async () => {
    const link = (await latestToken(email))!;
    const ok = await call('POST', '/auth/email/verify', { token: decodeURIComponent(link) });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.verified, true);
    assert.equal((await call('GET', '/auth/me', undefined, token)).json.user.emailVerified, true);
    const again = await call('POST', '/auth/email/verify', { token: decodeURIComponent(link) });
    assert.equal(again.status, 400);
  });

  test('asking again once verified says so and sends nothing new', async () => {
    const r = await call('POST', '/auth/email/send-verification', {}, token);
    assert.equal(r.status, 200);
    assert.equal(r.json.alreadyVerified, true);
  });

  test('changing the email clears the verified flag and an old link no longer works', async () => {
    const old = (await latestToken(email))!;
    const next = `verify2${run}@test.example`;
    assert.equal((await call('PATCH', '/me', { email: next }, token)).status, 200);
    assert.equal((await call('GET', '/auth/me', undefined, token)).json.user.emailVerified, false);
    assert.equal((await call('POST', '/auth/email/verify', { token: decodeURIComponent(old) })).status, 400);
    const sent = await call('POST', '/auth/email/send-verification', {}, token);
    assert.equal(sent.status, 202);
    const fresh = (await latestToken(next))!;
    assert.equal((await call('POST', '/auth/email/verify', { token: decodeURIComponent(fresh) })).status, 200);
  });

  test('sending requires a signed-in customer', async () => {
    assert.equal((await call('POST', '/auth/email/send-verification', {})).status, 401);
  });
});
