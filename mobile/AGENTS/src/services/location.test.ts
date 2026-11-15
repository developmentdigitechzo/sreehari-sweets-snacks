import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectCurrentLocation, LOCATION_MESSAGES, type LocationApi, type ReverseFn } from './locationCore';

const granted = { status: 'granted', canAskAgain: true };
const mk = (over: Partial<LocationApi> = {}): LocationApi => ({
  hasServicesEnabledAsync: async () => true,
  getForegroundPermissionsAsync: async () => granted,
  requestForegroundPermissionsAsync: async () => granted,
  getCurrentPositionAsync: async () => ({ coords: { latitude: 13.0827, longitude: 80.2707, accuracy: 18 } }),
  ...over,
});
const okReverse: ReverseFn = async () => ({ address: { line1: '12, 3rd Street', city: 'Chennai', pincode: '600040' }, source: 'device' });

test('1. permission not requested yet: it is asked only now, after the user action', async () => {
  let asked = 0;
  const r = await detectCurrentLocation(mk({
    getForegroundPermissionsAsync: async () => ({ status: 'undetermined', canAskAgain: true }),
    requestForegroundPermissionsAsync: async () => { asked++; return granted; },
  }), okReverse);
  assert.equal(asked, 1);
  assert.equal(r.status, 'ok');
});

test('2/10. granted: real coordinates are returned exactly as measured, with the detected address', async () => {
  const r = await detectCurrentLocation(mk(), okReverse);
  assert.equal(r.status, 'ok');
  if (r.status === 'ok') {
    assert.equal(r.latitude, 13.0827);
    assert.equal(r.longitude, 80.2707);
    assert.equal(r.accuracy, 18);
    assert.equal(r.address?.pincode, '600040');
    assert.equal(r.addressProblem, undefined);
  }
});

test('already-granted permission is not asked again', async () => {
  let asked = 0;
  await detectCurrentLocation(mk({ requestForegroundPermissionsAsync: async () => { asked++; return granted; } }), okReverse);
  assert.equal(asked, 0);
});

test('3. denied (can ask again) -> retry is possible', async () => {
  const r = await detectCurrentLocation(mk({
    getForegroundPermissionsAsync: async () => ({ status: 'undetermined', canAskAgain: true }),
    requestForegroundPermissionsAsync: async () => ({ status: 'denied', canAskAgain: true }),
  }), okReverse);
  assert.deepEqual(r, { status: 'denied', message: LOCATION_MESSAGES.denied });
});

test('4. permanently blocked (cannot ask again) -> tells the user to use Settings', async () => {
  const r = await detectCurrentLocation(mk({
    getForegroundPermissionsAsync: async () => ({ status: 'denied', canAskAgain: false }),
    requestForegroundPermissionsAsync: async () => ({ status: 'denied', canAskAgain: false }),
  }), okReverse);
  assert.deepEqual(r, { status: 'blocked', message: LOCATION_MESSAGES.blocked });
});

test('5. device location services disabled -> no permission prompt is shown at all', async () => {
  let asked = 0;
  const r = await detectCurrentLocation(mk({ hasServicesEnabledAsync: async () => false, requestForegroundPermissionsAsync: async () => { asked++; return granted; } }), okReverse);
  assert.equal(r.status, 'disabled');
  assert.equal(asked, 0);
});

test('6. GPS unavailable (no signal / provider error)', async () => {
  const r = await detectCurrentLocation(mk({ getCurrentPositionAsync: async () => { throw Object.assign(new Error('Location provider is unavailable'), { code: 'E_LOCATION_UNAVAILABLE' }); } }), okReverse);
  assert.deepEqual(r, { status: 'unavailable', message: LOCATION_MESSAGES.unavailable });
});

test('7. location request timeout', async () => {
  const r = await detectCurrentLocation(mk({ getCurrentPositionAsync: () => new Promise(() => undefined) }), okReverse, { timeoutMs: 30 });
  assert.deepEqual(r, { status: 'timeout', message: LOCATION_MESSAGES.timeout });
});

test('8. no network during address lookup: coordinates are kept, address problem is "network"', async () => {
  const r = await detectCurrentLocation(mk(), async () => ({ problem: 'network' }));
  assert.equal(r.status, 'ok');
  if (r.status === 'ok') {
    assert.equal(r.latitude, 13.0827);
    assert.equal(r.address, undefined);
    assert.equal(r.addressProblem, 'network');
  }
});

test('9. reverse geocoding throws or finds nothing: coordinates kept, never a made-up address', async () => {
  const thrown = await detectCurrentLocation(mk(), async () => { throw new Error('boom'); });
  assert.equal(thrown.status === 'ok' && thrown.addressProblem, 'unavailable');
  assert.equal(thrown.status === 'ok' && thrown.address, undefined);
  const none = await detectCurrentLocation(mk(), async () => ({ problem: 'no_result' }));
  assert.equal(none.status === 'ok' && none.addressProblem, 'no_result');
});

test('unexpected errors become a generic, safe message', async () => {
  const r = await detectCurrentLocation(mk({ getForegroundPermissionsAsync: async () => { throw new Error('native crash'); } }), okReverse);
  assert.deepEqual(r, { status: 'error', message: LOCATION_MESSAGES.error });
});

test('web has no "services enabled" API: the check can be skipped', async () => {
  const r = await detectCurrentLocation(mk({ hasServicesEnabledAsync: async () => { throw new Error('unsupported'); } }), okReverse, { checkServices: false });
  assert.equal(r.status, 'ok');
});

test('CHK-04 fallback: no precise fix -> the last known position is used', async () => {
  let current = 0;
  const r = await detectCurrentLocation(mk({
    getCurrentPositionAsync: async () => { current++; throw Object.assign(new Error('Location provider is unavailable'), { code: 'E_LOCATION_UNAVAILABLE' }); },
    getLastKnownPositionAsync: async () => ({ coords: { latitude: 12.97, longitude: 77.59, accuracy: 120 } }),
  }), okReverse);
  assert.equal(current, 1); // no second GPS attempt needed
  assert.equal(r.status, 'ok');
  if (r.status === 'ok') { assert.equal(r.latitude, 12.97); assert.equal(r.longitude, 77.59); }
});

test('CHK-04 fallback: no last known position -> a coarse (low accuracy) attempt succeeds', async () => {
  const accuracies: number[] = [];
  const r = await detectCurrentLocation(mk({
    getLastKnownPositionAsync: async () => null,
    getCurrentPositionAsync: async (o) => {
      accuracies.push(o.accuracy);
      if (accuracies.length === 1) throw Object.assign(new Error('unavailable'), { code: 'E_LOCATION_UNAVAILABLE' });
      return { coords: { latitude: 13.08, longitude: 80.27, accuracy: 900 } };
    },
  }), okReverse, { accuracy: 3 });
  assert.deepEqual(accuracies, [3, 2]); // balanced first, then low
  assert.equal(r.status, 'ok');
});

test('CHK-04 fallback: every attempt fails -> still a truthful status, never made-up coordinates', async () => {
  const r = await detectCurrentLocation(mk({
    getLastKnownPositionAsync: async () => null,
    getCurrentPositionAsync: async () => { throw Object.assign(new Error('Location provider is unavailable'), { code: 'E_LOCATION_UNAVAILABLE' }); },
  }), okReverse);
  assert.deepEqual(r, { status: 'unavailable', message: LOCATION_MESSAGES.unavailable });
});

test('CHK-04 fallback: a timed-out first attempt falls back too and reports timeout only if the fallbacks fail', async () => {
  const slow = () => new Promise<never>(() => undefined); // never resolves
  const r = await detectCurrentLocation(mk({ getLastKnownPositionAsync: async () => null, getCurrentPositionAsync: slow }), okReverse, { timeoutMs: 15 });
  assert.equal(r.status, 'timeout');
});
