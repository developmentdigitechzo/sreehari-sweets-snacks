import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isValidEmail, isValidPhone, normalizeIndianPhone, normalizePhone, phoneInput, validateEmail, validateIdentifier, validateName, validatePhone, validatePincode } from './validation';

// The same cases are in the backend (src/modules/auth/validators.test.ts) and the admin panel (lib/validate.test.ts).
const GOOD_PHONES: [string, string][] = [
  ['9876543210', '+919876543210'], ['+919876543210', '+919876543210'], ['+91 98765 43210', '+919876543210'], ['91 9876543210', '+919876543210'],
  ['919876543210', '+919876543210'], ['09876543210', '+919876543210'], ['+91-98765-43210', '+919876543210'], ['0091 98765 43210', '+919876543210'],
  ['6123456789', '+916123456789'], ['7000000000', '+917000000000'], ['9123456789', '+919123456789'], ['9198765432', '+919198765432'], ['8123456789', '+918123456789'],
];
const BAD_PHONES = ['5876543210', '987654321', '98765432101', '+9198765432', 'abcdefghij', '', '1234567890', '+449876543210', '+91 5876543210', '98765 4321O', '0000000000', '+91 98765 432 10 99'];
const GOOD_EMAILS = ['a@b.co', 'john.doe+tag@example.com', 'user_name@sub.domain.in', 'UPPER@EXAMPLE.COM', 'a-b@c-d.com', 'x@y.museum', "o'brien@example.com", '  padded@example.com  ', 'a@xn--p1ai.xn--p1ai'];
const BAD_EMAILS = ['a@b', 'a@b.', 'a@.com', '@b.com', 'a@b..com', 'a..b@c.com', '.a@b.com', 'a.@b.com', 'a b@c.com', 'a@b c.com', 'a@-b.com', 'a@b-.com', 'a@b.c', 'a@b.c0m', 'a@@b.com', 'a@b.com.', 'plain', 'a@b.com,c@d.com', `${'x'.repeat(65)}@example.com`, `a@${'d'.repeat(250)}.com`, ''];

test('phone: every common way of writing an Indian mobile is valid and sent as +91XXXXXXXXXX', () => {
  for (const [input, want] of GOOD_PHONES) {
    assert.equal(normalizeIndianPhone(input), want, input);
    assert.equal(normalizePhone(input), want, input);
    assert.equal(isValidPhone(input), true, input);
    assert.equal(validatePhone(input), undefined, input);
  }
});

test('phone: wrong length, wrong first digit, letters and foreign numbers are refused with a message', () => {
  for (const input of BAD_PHONES) {
    assert.equal(isValidPhone(input), false, JSON.stringify(input));
    assert.match(String(validatePhone(input)), /10-digit/, JSON.stringify(input));
  }
});

test('phone: a ten-digit number that starts with 91 is a normal number, not a country code (was rejected before)', () => {
  assert.equal(isValidPhone('9123456789'), true);
  assert.equal(isValidPhone('9198765432'), true);
  assert.equal(isValidPhone('09876543210'), true);
});

test('phone field: digits only, at most ten, and a pasted +91 / 0 prefix is dropped', () => {
  assert.equal(phoneInput('98765432101234'), '9876543210');
  assert.equal(phoneInput('+91 98765-43210'), '9876543210');
  assert.equal(phoneInput('09876543210'), '9876543210');
  assert.equal(phoneInput('98a7b6'), '9876');
  assert.equal(phoneInput('91'), '91'); // still typing a number that starts with 91
  assert.equal(phoneInput('9123456789'), '9123456789');
});

test('email: valid addresses pass, malformed ones are refused', () => {
  for (const e of GOOD_EMAILS) { assert.equal(isValidEmail(e), true, e); assert.equal(validateEmail(e), undefined, e); }
  for (const e of BAD_EMAILS) assert.equal(isValidEmail(e), false, JSON.stringify(e));
  assert.equal(validateEmail('', false), undefined); // optional on signup
  assert.equal(validateEmail('', true), 'Enter your email address'); // required on forgot password
  assert.match(String(validateEmail('a@b..com')), /valid email/);
});

test('login identifier: a phone or an email, nothing else', () => {
  assert.equal(validateIdentifier('9123456789'), undefined);
  assert.equal(validateIdentifier('asha@example.com'), undefined);
  assert.equal(validateIdentifier('asha@'), 'Enter a valid mobile number or email');
  assert.equal(validateIdentifier(''), 'Enter your mobile number or email');
});

test('name needs a letter (Tamil works); pincode is six digits and never starts with 0', () => {
  assert.equal(validateName('Asha Rao'), undefined);
  assert.equal(validateName('குமார்'), undefined);
  assert.equal(validateName('12'), 'Enter your full name');
  assert.equal(validateName('!!'), 'Enter your full name');
  assert.equal(validateName('A'), 'Enter your full name');
  assert.equal(validatePincode('600040'), undefined);
  assert.equal(validatePincode('110001'), undefined);
  assert.match(String(validatePincode('000000')), /pincode/);
  assert.match(String(validatePincode('60004')), /pincode/);
  assert.match(String(validatePincode('6000401')), /pincode/);
});
