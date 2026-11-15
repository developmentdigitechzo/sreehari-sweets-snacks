import assert from 'node:assert/strict';
import { test } from 'node:test';
import { IMAGE_RULES, imageProblem, routeForNotification, toState } from './logic';

test('permission states map from the OS answer', () => {
  assert.equal(toState({ status: 'granted', granted: true, canAskAgain: true }), 'granted');
  assert.equal(toState({ status: 'undetermined', granted: false, canAskAgain: true }), 'undetermined');
  assert.equal(toState({ status: 'denied', granted: false, canAskAgain: true }), 'denied');
  assert.equal(toState({ status: 'denied', granted: false, canAskAgain: false }), 'blocked');
  assert.equal(toState({ status: 'restricted', granted: false, canAskAgain: false }), 'restricted');
});

test('tapping a notification opens the right screen', () => {
  assert.deepEqual(routeForNotification({ kind: 'order_status', orderId: 'o1' }), { name: 'OrderTracking', params: { orderId: 'o1' } });
  assert.deepEqual(routeForNotification({ kind: 'promo' }), { name: 'Offers' });
  assert.deepEqual(routeForNotification({ orderId: 42 }), { name: 'Inbox' });
  assert.deepEqual(routeForNotification({ orderId: '' }), { name: 'Inbox' });
  assert.deepEqual(routeForNotification(undefined), { name: 'Inbox' });
});

test('image validation: format, size and dimensions', () => {
  assert.equal(imageProblem({ mimeType: 'image/jpeg', fileSize: 1_000_000, width: 800, height: 800 }), null);
  assert.equal(imageProblem({}), null);
  assert.match(imageProblem({ mimeType: 'image/gif' })!, /JPG, PNG or WebP/);
  assert.match(imageProblem({ fileSize: IMAGE_RULES.maxBytes + 1 })!, /5 MB/);
  assert.equal(imageProblem({ fileSize: IMAGE_RULES.maxBytes }), null);
  assert.match(imageProblem({ width: 200, height: 900 })!, /too small/);
});
