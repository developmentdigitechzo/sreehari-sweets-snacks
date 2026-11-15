import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { DeliverySlot } from '../types';
import { DEFAULT_TIMING, dateOptions, dayLabel, firstAvailable, istDate, slotAvailability, slotLabel } from './deliveryDates';

const express: DeliverySlot = { id: 'express', title: 'Express', window: '30 – 45 mins', fee: 40, kind: 'express' };
const lunch: DeliverySlot = { id: 'slot-1', title: 'Afternoon', window: '1:00 PM - 3:00 PM', fee: 30, kind: 'scheduled', start: '13:00', end: '15:00' };
const evening: DeliverySlot = { id: 'slot-2', title: 'Evening', window: '4:00 PM - 6:00 PM', fee: 30, kind: 'scheduled', start: '16:00', end: '18:00' };
const at = (ist: string) => new Date(`${ist}:00+05:30`);
const t = DEFAULT_TIMING;

describe('delivery dates (India time)', () => {
  test('today is the India date even when the phone is on another time zone', () => {
    assert.equal(istDate(new Date('2026-11-10T20:00:00Z')), '2026-11-11');
  });
  test('selectable dates: today and `maxAdvanceDays` more', () => {
    assert.deepEqual(dateOptions(at('2026-11-30T09:00'), t), ['2026-11-30', '2026-12-01', '2026-12-02']);
    assert.deepEqual(dateOptions(at('2026-11-10T09:00'), { maxAdvanceDays: 0, cutoffMinutes: 60 }), ['2026-11-10']);
  });
});

describe('slot availability', () => {
  const now = at('2026-11-10T10:30');
  test('open slots today, express today only', () => {
    assert.equal(slotAvailability(lunch, '2026-11-10', now, t).ok, true);
    assert.equal(slotAvailability(express, '2026-11-10', now, t).ok, true);
    assert.deepEqual(slotAvailability(express, '2026-11-11', now, t), { ok: false, reason: 'Today only' });
  });
  test('a slot closes one cut-off before it starts, only for today', () => {
    assert.equal(slotAvailability(lunch, '2026-11-10', at('2026-11-10T12:00'), t).ok, true);
    assert.deepEqual(slotAvailability(lunch, '2026-11-10', at('2026-11-10T12:01'), t), { ok: false, reason: 'Closed for today' });
    assert.equal(slotAvailability(lunch, '2026-11-11', at('2026-11-10T20:00'), t).ok, true);
  });
  test('picks the first slot that works when the chosen one does not', () => {
    const slots = [express, lunch, evening];
    assert.equal(firstAvailable(slots, '2026-11-10', at('2026-11-10T12:30'), t)?.id, 'express');
    assert.equal(firstAvailable(slots, '2026-11-11', at('2026-11-10T12:30'), t)?.id, 'slot-1');
    assert.equal(firstAvailable([lunch], '2026-11-10', at('2026-11-10T18:00'), t), undefined);
  });
});

describe('labels', () => {
  const now = at('2026-11-10T10:30');
  test('day labels', () => {
    assert.equal(dayLabel('2026-11-10', '2026-11-10'), 'Today');
    assert.equal(dayLabel('2026-11-11', '2026-11-10'), 'Tomorrow');
    assert.equal(dayLabel('2026-11-12', '2026-11-10'), 'Thu 12 Nov');
  });
  test('slot label for every screen', () => {
    assert.equal(slotLabel(express, now), 'In 30 – 45 mins');
    assert.equal(slotLabel({ ...lunch, date: '2026-11-11' }, now), 'Tomorrow 1:00 PM - 3:00 PM');
    assert.equal(slotLabel({ ...lunch, date: '2026-11-10' }, now), 'Today 1:00 PM - 3:00 PM');
    assert.equal(slotLabel(lunch, now), '1:00 PM - 3:00 PM'); // an older order with no date
  });
});
