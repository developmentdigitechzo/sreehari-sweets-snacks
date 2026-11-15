import assert from 'node:assert/strict';
import { test } from 'node:test';
import { googleReverseGeocode, mapGoogleResult } from './google.js';

const ok = {
  status: 'OK',
  results: [{
    formatted_address: '12, 3rd Street, Anna Nagar, Chennai, Tamil Nadu 600040, India',
    address_components: [
      { long_name: '12', short_name: '12', types: ['street_number'] },
      { long_name: '3rd Street', short_name: '3rd St', types: ['route'] },
      { long_name: 'Anna Nagar', short_name: 'Anna Nagar', types: ['sublocality_level_1', 'sublocality'] },
      { long_name: 'Chennai', short_name: 'Chennai', types: ['locality'] },
      { long_name: 'Tamil Nadu', short_name: 'TN', types: ['administrative_area_level_1'] },
      { long_name: '600040', short_name: '600040', types: ['postal_code'] },
    ],
  }],
};

test('maps a Google result to address fields', () => {
  assert.deepEqual(mapGoogleResult(ok), { line1: '12, 3rd Street', area: 'Anna Nagar', city: 'Chennai', state: 'Tamil Nadu', pincode: '600040', formatted: ok.results[0].formatted_address });
});

test('no result is a 404, provider rejection is a 502 (never a fake success)', () => {
  assert.throws(() => mapGoogleResult({ status: 'ZERO_RESULTS', results: [] }), (e: Error & { status?: number; code?: string }) => e.status === 404 && e.code === 'GEOCODE_NO_RESULT');
  assert.throws(() => mapGoogleResult({ status: 'REQUEST_DENIED', error_message: 'key invalid', results: [] }), (e: Error & { status?: number; code?: string }) => e.status === 502 && e.code === 'GEOCODER_UNAVAILABLE');
  assert.throws(() => mapGoogleResult({ status: 'OVER_QUERY_LIMIT', results: [{ formatted_address: 'x', address_components: [] }] }), (e: Error & { status?: number; code?: string }) => e.status === 502 && e.code === 'GEOCODER_UNAVAILABLE');
});

test('network failure is a 502 and the error never contains the API key', async () => {
  await assert.rejects(
    () => googleReverseGeocode(13.08, 80.27, 'SECRET-KEY-123', (async () => { throw new Error('boom SECRET-KEY-123'); }) as typeof fetch),
    (e: Error & { status?: number }) => e.status === 502 && !e.message.includes('SECRET-KEY-123'),
  );
});

test('request is made server-side with the coordinates and key', async () => {
  let url = '';
  const r = await googleReverseGeocode(13.0827, 80.2707, 'KEY', (async (u: string) => { url = u; return new Response(JSON.stringify(ok), { status: 200 }); }) as typeof fetch);
  assert.match(url, /latlng=13\.0827,80\.2707/);
  assert.match(url, /key=KEY/);
  assert.equal(r.pincode, '600040');
});
