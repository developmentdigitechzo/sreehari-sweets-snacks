import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isValidContactPhone, isValidEmail, isValidStaffPhone, normalizeIndianPhone } from './validate';

// The same phone and email cases are in the backend (src/modules/auth/validators.test.ts) and the phone app (src/utils/validation.test.ts).
const GOOD_PHONES: [string, string][] = [
  ['9876543210', '+919876543210'], ['+919876543210', '+919876543210'], ['+91 98765 43210', '+919876543210'], ['91 9876543210', '+919876543210'],
  ['919876543210', '+919876543210'], ['09876543210', '+919876543210'], ['+91-98765-43210', '+919876543210'], ['0091 98765 43210', '+919876543210'],
  ['6123456789', '+916123456789'], ['7000000000', '+917000000000'], ['9123456789', '+919123456789'], ['9198765432', '+919198765432'], ['8123456789', '+918123456789'],
];
const BAD_PHONES = ['5876543210', '987654321', '98765432101', '+9198765432', 'abcdefghij', '', '1234567890', '+91 5876543210', '98765 4321O', '0000000000', '+91 98765 432 10 99'];
const GOOD_EMAILS = ['a@b.co', 'john.doe+tag@example.com', 'user_name@sub.domain.in', 'UPPER@EXAMPLE.COM', 'a-b@c-d.com', 'x@y.museum', "o'brien@example.com", '  padded@example.com  ', 'a@xn--p1ai.xn--p1ai'];
const BAD_EMAILS = ['a@b', 'a@b.', 'a@.com', '@b.com', 'a@b..com', 'a..b@c.com', '.a@b.com', 'a.@b.com', 'a b@c.com', 'a@b c.com', 'a@-b.com', 'a@b-.com', 'a@b.c', 'a@b.c0m', 'a@@b.com', 'a@b.com.', 'plain', 'a@b.com,c@d.com', `${'x'.repeat(65)}@example.com`, `a@${'d'.repeat(250)}.com`, ''];

test('admin: Indian mobile numbers in every common form normalise to +91XXXXXXXXXX', () => {
  for (const [input, want] of GOOD_PHONES) assert.equal(normalizeIndianPhone(input), want, input);
  for (const input of BAD_PHONES) assert.equal(normalizeIndianPhone(input), null, JSON.stringify(input));
});

test('admin: staff phone takes an Indian mobile in any form or a full international number', () => {
  assert.equal(isValidStaffPhone('98765 43210'), true);
  assert.equal(isValidStaffPhone('+91 98765 43210'), true);
  assert.equal(isValidStaffPhone('+44 7911 123456'), true); // staff abroad
  assert.equal(isValidStaffPhone('5876543210'), false);
  assert.equal(isValidStaffPhone('12345'), false);
  assert.equal(isValidStaffPhone(''), false);
});

test("admin: the shop's contact phone may be empty, a mobile or a landline, but not text", () => {
  assert.equal(isValidContactPhone(''), true);
  assert.equal(isValidContactPhone('044 2345 6789'), true);
  assert.equal(isValidContactPhone('+91 98765 43210'), true);
  assert.equal(isValidContactPhone('123'), false);
  assert.equal(isValidContactPhone('call me'), false);
  assert.equal(isValidContactPhone('1'.repeat(16)), false);
});

test('admin: emails are checked the same way as the backend', () => {
  for (const e of GOOD_EMAILS) assert.equal(isValidEmail(e), true, e);
  for (const e of BAD_EMAILS) assert.equal(isValidEmail(e), false, JSON.stringify(e));
});
