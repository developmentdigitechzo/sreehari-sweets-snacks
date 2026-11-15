import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decimalOnly, digitsOnly, signedInt, toIso, toLocalInput } from './format';

test('digitsOnly keeps digits and lets the field be emptied', () => {
  assert.equal(digitsOnly('a1b2c3'), '123');
  assert.equal(digitsOnly('x'), '');
  assert.equal(digitsOnly(''), '');
});

test('decimalOnly keeps one decimal point and at most two decimals', () => {
  assert.equal(decimalOnly('12.5x'), '12.5');
  assert.equal(decimalOnly('1.2.3'), '1.23');
  assert.equal(decimalOnly('10.999'), '10.99');
  assert.equal(decimalOnly('abc'), '');
  assert.equal(decimalOnly('.5'), '.5');
});

test('signedInt allows one leading sign for point adjustments', () => {
  assert.equal(signedInt('+5x0'), '+50');
  assert.equal(signedInt('-20'), '-20');
  assert.equal(signedInt('--3'), '-3');
  assert.equal(signedInt('7'), '7');
  assert.equal(signedInt('-'), '-');
});

test('datetime-local values round-trip through ISO without shifting the time', () => {
  const local = '2030-01-10T10:30';
  assert.equal(toLocalInput(toIso(local)), local);
  assert.equal(toIso(''), null);
  assert.equal(toLocalInput(null), '');
});
