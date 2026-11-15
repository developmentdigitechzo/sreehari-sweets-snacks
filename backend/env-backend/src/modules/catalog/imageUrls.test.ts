import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeImageResolver } from './imageUrls.js';

const known = new Map([['cake-chocolate', 'cake-chocolate.jpg'], ['laddu', 'laddu.jpg']]);
const r = makeImageResolver(known, 'http://api.test:4000');

test('a bundled picture key becomes a URL the admin browser can load', () => {
  assert.equal(r.seedImageUrl('laddu'), 'http://api.test:4000/seed-images/laddu.jpg');
  assert.equal(r.seedImageUrl('generic'), null);
  assert.equal(r.seedImageUrl(null), null);
});

test('an uploaded photo wins over the bundled picture', () => {
  assert.equal(r.imageSrc('http://x/up.jpg', 'laddu'), 'http://x/up.jpg');
  assert.equal(r.imageSrc(null, 'laddu'), 'http://api.test:4000/seed-images/laddu.jpg');
  assert.equal(r.imageSrc(null, 'generic'), null);
});

test('a category with no picture of its own (key "generic") shows its parent\'s picture, even through a chain', () => {
  const byId = new Map([
    ['cakes', { imageKey: 'cake-chocolate', parentId: null }],
    ['mid', { imageKey: 'generic', parentId: 'cakes' }],
  ]);
  assert.equal(r.categoryImageKey({ imageKey: 'generic', parentId: 'cakes' }, byId), 'cake-chocolate');
  assert.equal(r.categoryImageKey({ imageKey: 'generic', parentId: 'mid' }, byId), 'cake-chocolate');
  assert.equal(r.categoryImageKey({ imageKey: 'laddu', parentId: 'cakes' }, byId), 'laddu'); // its own picture is kept
  assert.equal(r.categoryImageKey({ imageKey: 'generic', imageUrl: 'http://x/u.jpg', parentId: 'cakes' }, byId), 'generic'); // an upload counts as its own
  assert.equal(r.categoryImageKey({ imageKey: 'generic', parentId: null }, byId), 'generic'); // nothing to fall back to
});
