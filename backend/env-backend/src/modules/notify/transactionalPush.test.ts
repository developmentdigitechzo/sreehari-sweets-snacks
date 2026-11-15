import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pushSender } from '../admin/broadcast.senders.js';
import { pushOrderEvent } from './transactionalPush.js';

type Sent = { url: string; body: any[] };
const fakeFetch = (sent: Sent[], reply: unknown = { data: [{ status: 'ok', id: 't1' }] }, ok = true) =>
  (async (url: string, init: { body: string }) => { sent.push({ url, body: JSON.parse(init.body) }); return { ok, status: ok ? 200 : 500, json: async () => reply }; }) as unknown as typeof fetch;

test('order event is pushed with routing data and the orders channel', async () => {
  const sent: Sent[] = [];
  const r = await pushOrderEvent('c1', { kind: 'order_status', title: 'Order SH1: Packed', body: 'Your order is now packed.', orderId: 'o1' }, { sender: pushSender(fakeFetch(sent)), tokensFor: async () => ['ExponentPushToken[abc1234567]'] });
  assert.equal(r.sent, true);
  assert.equal(sent[0].body[0].to, 'ExponentPushToken[abc1234567]');
  assert.deepEqual(sent[0].body[0].data, { kind: 'order_status', orderId: 'o1' });
  assert.equal(sent[0].body[0].channelId, 'orders');
});

test('does nothing without a connected provider or a registered phone', async () => {
  assert.deepEqual(await pushOrderEvent('c1', { kind: 'order_placed', title: 't', body: 'b' }, { sender: null }), { sent: false, reason: 'push_not_connected' });
  const sent: Sent[] = [];
  assert.deepEqual(await pushOrderEvent('c1', { kind: 'order_placed', title: 't', body: 'b' }, { sender: pushSender(fakeFetch(sent)), tokensFor: async () => [] }), { sent: false, reason: 'no_device' });
  assert.equal(sent.length, 0);
});

test('a failing push service never throws', async () => {
  const bad = (async () => { throw new Error('network'); }) as unknown as typeof fetch;
  const r = await pushOrderEvent('c1', { kind: 'refund_paid', title: 't', body: 'b' }, { sender: pushSender(bad), tokensFor: async () => ['ExponentPushToken[abc1234567]'] });
  assert.equal(r.sent, false);
  const r2 = await pushOrderEvent('c1', { kind: 'refund_paid', title: 't', body: 'b' }, { sender: pushSender(fakeFetch([], { data: [{ status: 'error', message: 'DeviceNotRegistered' }] }, true)), tokensFor: async () => ['ExponentPushToken[abc1234567]'] });
  assert.deepEqual(r2, { sent: false, reason: 'DeviceNotRegistered' });
  assert.equal((await pushOrderEvent('c1', { kind: 'order_placed', title: 't', body: 'b' }, { tokensFor: async () => { throw new Error('db'); }, sender: pushSender(fakeFetch([])) })).sent, false);
});

test('high priority is requested and tokens the device no longer accepts are pruned', async () => {
  const sent: Sent[] = [];
  const pruned: string[][] = [];
  const reply = { data: [{ status: 'ok', id: 'a' }, { status: 'error', message: 'The recipient device is not registered', details: { error: 'DeviceNotRegistered' } }] };
  const r = await pushSender(fakeFetch(sent, reply), async (t) => { pruned.push(t); }).send(
    { customerId: 'c1', phone: '', pushTokens: ['ExponentPushToken[live000000]', 'ExponentPushToken[dead000000]'] },
    { title: 't', message: 'm', data: { kind: 'order_status' } },
  );
  assert.equal(r.ok, true); // one phone received it
  assert.equal(sent[0].body[0].priority, 'high');
  assert.deepEqual(pruned, [['ExponentPushToken[dead000000]']]);
});
