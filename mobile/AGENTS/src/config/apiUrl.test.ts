import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { resolveApiUrl } from './apiUrl.js';

describe('resolveApiUrl: development', () => {
  test('uses the computer running Metro, on the default port, with no editing', () => {
    const r = resolveApiUrl({ isDev: true, devHost: '192.168.1.3' });
    assert.deepEqual([r.url, r.source], ['http://192.168.1.3:4000/api', 'dev-host']);
  });
  test('a different network gives a different host automatically', () => {
    assert.equal(resolveApiUrl({ isDev: true, devHost: '10.0.0.7' }).url, 'http://10.0.0.7:4000/api');
  });
  test('custom port, and localhost when the host is unknown', () => {
    assert.equal(resolveApiUrl({ isDev: true, devHost: null, port: '5000' }).url, 'http://localhost:5000/api');
    assert.equal(resolveApiUrl({ isDev: true, port: 'abc' }).url, 'http://localhost:4000/api');
  });
  test('an explicit local URL wins, and {host} is filled in', () => {
    assert.equal(resolveApiUrl({ isDev: true, devHost: '192.168.1.3', local: 'http://{host}:4100/api/' }).url, 'http://192.168.1.3:4100/api');
    assert.equal(resolveApiUrl({ isDev: true, devHost: '192.168.1.3', local: 'http://staging.local:4000/api' }).source, 'local');
  });
  test('the production URL is ignored in development', () => {
    assert.equal(resolveApiUrl({ isDev: true, devHost: '1.2.3.4', production: 'https://shop.example.com/api' }).url, 'http://1.2.3.4:4000/api');
  });
});

describe('resolveApiUrl: production', () => {
  test('uses the production URL and trims a trailing slash', () => {
    const r = resolveApiUrl({ isDev: false, production: 'https://shop.example.com/api/', devHost: '192.168.1.3', local: 'http://x:1/api' });
    assert.deepEqual([r.url, r.source, r.warning], ['https://shop.example.com/api', 'production', undefined]);
  });
  test('never falls back to a local address: a missing production URL is an error', () => {
    assert.throws(() => resolveApiUrl({ isDev: false, devHost: '192.168.1.3' }), /EXPO_PUBLIC_API_URL_PRODUCTION is not set/);
    assert.throws(() => resolveApiUrl({ isDev: false, local: 'http://localhost:4000/api' }), /not set/);
  });
  test('warns when the production URL is not https', () => {
    assert.match(resolveApiUrl({ isDev: false, production: 'http://203.0.113.10:4000/api' }).warning ?? '', /not https/);
  });
  test('rejects malformed URLs', () => {
    assert.throws(() => resolveApiUrl({ isDev: false, production: 'shop.example.com/api' }), /not a valid/);
  });
});

describe('resolveApiUrl: override', () => {
  test('EXPO_PUBLIC_API_URL beats everything, in both modes', () => {
    assert.equal(resolveApiUrl({ isDev: true, override: 'https://test.example.com/api', devHost: '1.1.1.1' }).url, 'https://test.example.com/api');
    assert.equal(resolveApiUrl({ isDev: false, override: 'https://test.example.com/api', production: 'https://shop.example.com/api' }).source, 'override');
  });
});
