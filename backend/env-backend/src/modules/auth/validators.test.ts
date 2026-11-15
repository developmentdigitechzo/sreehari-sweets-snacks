import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addressSchema, phoneSchema, profileSchema, signupSchema } from './auth.schemas.js';
import { emailSchema, hasLetter, isValidEmail, normalizeIndianPhone, pincodeSchema } from './validators.js';

// The same cases are in the phone app (src/utils/validation.test.ts) and the admin panel (lib/validate.test.ts).
const GOOD_PHONES: [string, string][] = [
  ['9876543210', '+919876543210'], ['+919876543210', '+919876543210'], ['+91 98765 43210', '+919876543210'], ['91 9876543210', '+919876543210'],
  ['919876543210', '+919876543210'], ['09876543210', '+919876543210'], ['+91-98765-43210', '+919876543210'], ['0091 98765 43210', '+919876543210'],
  ['6123456789', '+916123456789'], ['7000000000', '+917000000000'], ['9123456789', '+919123456789'], ['9198765432', '+919198765432'], ['8123456789', '+918123456789'],
];
const BAD_PHONES = ['5876543210', '987654321', '98765432101', '+9198765432', 'abcdefghij', '', '1234567890', '+449876543210', '+91 5876543210', '98765 4321O', '0000000000', '+91 98765 432 10 99'];
const GOOD_EMAILS = ['a@b.co', 'john.doe+tag@example.com', 'user_name@sub.domain.in', 'UPPER@EXAMPLE.COM', 'a-b@c-d.com', 'x@y.museum', "o'brien@example.com", '  padded@example.com  ', 'a@xn--p1ai.xn--p1ai'];
const BAD_EMAILS = ['a@b', 'a@b.', 'a@.com', '@b.com', 'a@b..com', 'a..b@c.com', '.a@b.com', 'a.@b.com', 'a b@c.com', 'a@b c.com', 'a@-b.com', 'a@b-.com', 'a@b.c', 'a@b.c0m', 'a@@b.com', 'a@b.com.', 'plain', 'a@b.com,c@d.com', `${'x'.repeat(65)}@example.com`, `a@${'d'.repeat(250)}.com`, ''];

test('Indian mobile numbers: every common way of writing one is accepted and stored as +91XXXXXXXXXX', () => {
  for (const [input, want] of GOOD_PHONES) {
    assert.equal(normalizeIndianPhone(input), want, input);
    assert.equal(phoneSchema.parse(input), want, input);
  }
});

test('Indian mobile numbers: wrong length, wrong first digit, letters and foreign numbers are refused', () => {
  for (const input of BAD_PHONES) {
    assert.equal(normalizeIndianPhone(input), null, JSON.stringify(input));
    assert.equal(phoneSchema.safeParse(input).success, false, JSON.stringify(input));
  }
});

test('a ten-digit number that starts with 91 is a normal number, not a country code', () => {
  assert.equal(normalizeIndianPhone('9123456789'), '+919123456789');
  assert.equal(normalizeIndianPhone('91 9123456789'), '+919123456789');
});

test('emails: valid ones pass, malformed ones are refused', () => {
  for (const e of GOOD_EMAILS) { assert.equal(isValidEmail(e), true, e); assert.equal(emailSchema.safeParse(e).success, true, e); }
  for (const e of BAD_EMAILS) { assert.equal(isValidEmail(e), false, JSON.stringify(e)); assert.equal(emailSchema.safeParse(e).success, false, JSON.stringify(e)); }
});

test('signup: name needs a letter (Tamil works), phone is normalised, a bad email is refused, an empty email is allowed', () => {
  const base = { name: 'Asha Rao', phone: '98765 43210', password: 'Passw0rd1', consent: true };
  const ok = signupSchema.parse(base);
  assert.equal(ok.phone, '+919876543210');
  assert.equal(signupSchema.safeParse({ ...base, name: 'குமார்' }).success, true);
  assert.equal(signupSchema.safeParse({ ...base, name: '12' }).success, false);
  assert.equal(signupSchema.safeParse({ ...base, name: '!!' }).success, false);
  assert.equal(signupSchema.safeParse({ ...base, email: 'a@b..com' }).success, false);
  assert.equal(signupSchema.safeParse({ ...base, email: '' }).success, true);
  assert.equal(signupSchema.safeParse({ ...base, email: 'asha@example.com' }).success, true);
  assert.equal(profileSchema.safeParse({ email: 'a@b' }).success, false);
});

test('address: phone is normalised, pincode cannot start with 0', () => {
  const a = { label: 'Home', name: 'Asha', phone: '+91 98765 43210', line1: '12 Main Road', area: 'Adyar', city: 'Chennai', pincode: '600040' };
  assert.equal(addressSchema.parse(a).phone, '+919876543210');
  assert.equal(addressSchema.safeParse({ ...a, phone: '12345' }).success, false);
  assert.equal(addressSchema.safeParse({ ...a, pincode: '000000' }).success, false);
  assert.equal(addressSchema.safeParse({ ...a, pincode: '60004' }).success, false);
  assert.equal(pincodeSchema.safeParse('110001').success, true);
});

test('hasLetter accepts any script and rejects digits and symbols', () => {
  assert.equal(hasLetter('Asha'), true);
  assert.equal(hasLetter('குமார்'), true);
  assert.equal(hasLetter('12'), false);
  assert.equal(hasLetter('!!'), false);
});
