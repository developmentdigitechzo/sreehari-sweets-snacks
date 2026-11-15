import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hashPassword, verifyPassword } from './password.js';
import { loginSchema, signupSchema } from './auth.schemas.js';

test('hash is salted and verifies only the right password', async () => {
  const a = await hashPassword('Sweets2026');
  const b = await hashPassword('Sweets2026');
  assert.notEqual(a, b); // different salts
  assert.ok(!a.includes('Sweets2026'));
  assert.equal(await verifyPassword('Sweets2026', a), true);
  assert.equal(await verifyPassword('sweets2026', a), false);
});

test('unknown account verifies as false without throwing', async () => {
  assert.equal(await verifyPassword('anything1', null), false);
});

test('signup requires consent, strong password and a valid phone', () => {
  const ok = { name: 'Anu', phone: '+919876543210', password: 'Sweets2026', consent: true };
  assert.equal(signupSchema.safeParse(ok).success, true);
  assert.equal(signupSchema.safeParse({ ...ok, consent: false }).success, false);
  assert.equal(signupSchema.safeParse({ ...ok, password: 'short' }).success, false);
  assert.equal(signupSchema.safeParse({ ...ok, password: 'allletters' }).success, false);
  assert.equal(signupSchema.safeParse({ ...ok, phone: '12345' }).success, false);
  assert.equal(signupSchema.safeParse({ ...ok, email: 'not-an-email' }).success, false);
});

test('login accepts a phone or an email identifier', () => {
  assert.equal(loginSchema.safeParse({ identifier: 'a@b.co', password: 'x' }).success, true);
  assert.equal(loginSchema.safeParse({ identifier: '', password: 'x' }).success, false);
});
