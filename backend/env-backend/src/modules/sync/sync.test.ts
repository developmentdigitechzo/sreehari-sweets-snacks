/** Unit tests for the change feed and upload-link handling. No network or database. */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { bumpCatalog, catalogVersion, waitForChange } from './changes.js';
import { fixUploadUrl, rewriteUploads } from './publicUrl.js';

describe('catalogue change feed', () => {
  test('bumping changes the version and wakes a waiting client', async () => {
    const v = catalogVersion();
    const waiting = waitForChange(v, 5000);
    setTimeout(bumpCatalog, 20);
    const r = await waiting;
    assert.equal(r.changed, true);
    assert.notEqual(r.version, v);
  });
  test('an old version returns immediately; an unchanged one times out with changed=false', async () => {
    assert.equal((await waitForChange('1', 5000)).changed, true);
    const t = Date.now();
    const r = await waitForChange(catalogVersion(), 60);
    assert.equal(r.changed, false);
    assert.ok(Date.now() - t >= 50);
  });
  test('versions only ever go up', () => {
    const a = Number(catalogVersion());
    bumpCatalog();
    bumpCatalog();
    assert.ok(Number(catalogVersion()) >= a + 2);
  });
});

describe('upload links', () => {
  const base = 'http://192.168.1.3:4000';
  test('own uploads stored with localhost or a private address are moved to the address the caller used', () => {
    assert.equal(fixUploadUrl('http://localhost:4000/uploads/a.webp', base), `${base}/uploads/a.webp`);
    assert.equal(fixUploadUrl('http://127.0.0.1:4000/uploads/a.jpg', base), `${base}/uploads/a.jpg`);
    assert.equal(fixUploadUrl('http://192.168.0.9:4000/uploads/a.png', base), `${base}/uploads/a.png`);
  });
  test('images from other sites are never touched', () => {
    for (const u of ['https://cdn.example.com/uploads/a.jpg', 'https://example.com/photo.jpg', 'cake-chocolate', '']) assert.equal(fixUploadUrl(u, base), u);
  });
  test('rewriting walks nested responses and leaves other values alone', () => {
    const out = rewriteUploads({ images: [{ uri: 'http://localhost:4000/uploads/x.jpg', id: 'i1' }], n: 3, when: new Date(0), t: ['a'] }, base) as { images: { uri: string; id: string }[]; n: number; when: unknown };
    assert.equal(out.images[0].uri, `${base}/uploads/x.jpg`);
    assert.equal(out.images[0].id, 'i1');
    assert.equal(out.n, 3);
    assert.ok(out.when instanceof Date);
  });
});
