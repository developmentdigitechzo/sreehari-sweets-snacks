import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import jwt from 'jsonwebtoken';
import { readSignupToken, signSignupToken } from './signupToken.js';

const SECRET = 'unit-test-secret';

describe('signup token', () => {
  test('carries the verified phone number', () => {
    assert.deepEqual(readSignupToken(SECRET, signSignupToken(SECRET, '+919876543210')), { phone: '+919876543210' });
  });
  test('is rejected with another secret, when expired, or when tampered with', () => {
    const t = signSignupToken(SECRET, '+919876543210');
    assert.equal(readSignupToken('another-secret', t), null);
    assert.equal(readSignupToken(SECRET, signSignupToken(SECRET, '+919876543210', -10)), null);
    assert.equal(readSignupToken(SECRET, `${t}x`), null);
    assert.equal(readSignupToken(SECRET, ''), null);
  });
  test('a normal sign-in token is not a signup token, and a signup token is not a sign-in token', () => {
    const login = jwt.sign({ id: 'u1', role: 'CUSTOMER' }, SECRET, { expiresIn: '12h' });
    assert.equal(readSignupToken(SECRET, login), null);
    assert.throws(() => jwt.verify(signSignupToken(SECRET, '+919876543210'), SECRET)); // different key, so the auth middleware refuses it
  });
  test('a token for a different purpose signed with the signup key is refused', () => {
    const odd = jwt.sign({ phone: '+919876543210', purpose: 'something-else' }, `${SECRET}:signup-token`);
    assert.equal(readSignupToken(SECRET, odd), null);
  });
});
