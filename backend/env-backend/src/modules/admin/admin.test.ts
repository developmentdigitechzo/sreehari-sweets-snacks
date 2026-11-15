/** Unit tests for admin helpers. No network, database, SMS, WhatsApp or push calls: senders get a fake fetch. */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { channelConnected, pushSender, smsSender, whatsappSender } from './broadcast.senders.js';
import { permissionsFor } from './guard.js';
import { ruleSchema } from './segments.js';
import { pct, toCsv } from './util.js';

const recipient = { customerId: 'c1', phone: '+919876543210', pushTokens: ['ExponentPushToken[abc]'] };
const msg = { title: 'Festive', message: 'Flat 15% off', imageUrl: null };
const fakeFetch = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe('permissions', () => {
  test('super admin has everything; manager cannot manage staff, settings, audit or refunds', () => {
    const sa = permissionsFor('SUPER_ADMIN');
    const mgr = permissionsFor('MANAGER');
    for (const p of ['admins', 'audit', 'settings', 'refunds']) { assert.ok(sa.includes(p as never)); assert.ok(!mgr.includes(p as never), p); }
    for (const p of ['orders', 'catalog', 'inventory', 'broadcast']) assert.ok(mgr.includes(p as never));
    assert.deepEqual(permissionsFor('CUSTOMER'), []);
  });
});

describe('csv export', () => {
  test('quotes commas, quotes and newlines', () => {
    assert.equal(toCsv(['a', 'b'], [['x,y', 'say "hi"'], ['line\nbreak', 3]]), 'a,b\r\n"x,y","say ""hi"""\r\n"line\nbreak",3');
  });
  test('neutralises spreadsheet formulas', () => {
    for (const bad of ['=SUM(A1)', '+1', '-1', '@cmd']) assert.ok(toCsv(['x'], [[bad]]).includes(`'${bad}`), bad);
    assert.equal(toCsv(['x'], [['normal']]), 'x\r\nnormal');
  });
});

describe('percentage change', () => {
  test('handles zero and growth', () => {
    assert.equal(pct(120, 100), 20);
    assert.equal(pct(50, 100), -50);
    assert.equal(pct(0, 0), 0);
    assert.equal(pct(5, 0), null);
  });
});

describe('segment rules', () => {
  test('accepts known conditions and ignores nothing unknown silently', () => {
    assert.deepEqual(ruleSchema.parse({ minSpend: 5000, minOrders: 5 }), { minSpend: 5000, minOrders: 5 });
    assert.throws(() => ruleSchema.parse({ minSpend: -1 }));
    assert.throws(() => ruleSchema.parse({ orderedWithinDays: 0 }));
  });
});

describe('message senders (fake HTTP)', () => {
  test('SMS: success returns the provider id; provider errors are reported, never swallowed', async () => {
    assert.deepEqual(await smsSender(fakeFetch(201, { sid: 'SM123' })).send(recipient, msg), { ok: true, id: 'SM123' });
    const bad = await smsSender(fakeFetch(400, { message: 'Invalid To number' })).send(recipient, msg);
    assert.equal(bad.ok, false);
    assert.match((bad as { error: string }).error, /Invalid To number/);
  });
  test('WhatsApp sends to a whatsapp: address', async () => {
    let body = '';
    const f = (async (_u: string, init: RequestInit) => { body = String(init.body); return new Response(JSON.stringify({ sid: 'SMwa' }), { status: 201 }); }) as unknown as typeof fetch;
    const r = await whatsappSender(f).send(recipient, msg);
    assert.equal(r.ok, true);
    assert.ok(decodeURIComponent(body).includes('To=whatsapp:+919876543210'));
  });
  test('push: a customer with no registered device is a failure, not a success', async () => {
    const r = await pushSender(fakeFetch(200, { data: [{ status: 'ok', id: 'x' }] })).send({ ...recipient, pushTokens: [] }, msg);
    assert.equal(r.ok, false);
    assert.equal((await pushSender(fakeFetch(200, { data: [{ status: 'ok', id: 'tk1' }] })).send(recipient, msg)).ok, true);
    assert.equal((await pushSender(fakeFetch(200, { data: [{ status: 'error', message: 'DeviceNotRegistered' }] })).send(recipient, msg)).ok, false);
  });
  test('a network failure is reported as a failure', async () => {
    const down = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    assert.equal((await smsSender(down).send(recipient, msg)).ok, false);
  });
  test('with no provider configured only in-app is connected', () => {
    assert.equal(channelConnected('in_app'), true);
    for (const c of ['sms', 'whatsapp', 'push'] as const) assert.equal(channelConnected(c), false, c);
  });
});
