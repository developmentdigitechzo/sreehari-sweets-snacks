import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { DEFAULT_TIMING, SLOTS, addDays, checkDelivery, istDate, istMinutes, resolveSlot } from './slots.js';

const [express, afternoon, evening] = SLOTS as [(typeof SLOTS)[number], (typeof SLOTS)[number], (typeof SLOTS)[number]];
// 10 Nov 2026, 10:30 India time = 05:00 UTC
const at = (ist: string) => new Date(new Date(`${ist}:00+05:30`).getTime());
const now = at('2026-11-10T10:30');

describe('India date and time', () => {
  test('uses India time whatever the server time zone is', () => {
    assert.equal(istDate(new Date('2026-11-10T20:00:00Z')), '2026-11-11'); // 01:30 next day in India
    assert.equal(istMinutes(new Date('2026-11-10T05:00:00Z')), 10 * 60 + 30);
  });
  test('adds days across month and year ends', () => {
    assert.equal(addDays('2026-11-30', 1), '2026-12-01');
    assert.equal(addDays('2026-12-31', 2), '2027-01-02');
  });
});

describe('checkDelivery', () => {
  const t = DEFAULT_TIMING;
  test('today, a slot that is still open', () => {
    assert.deepEqual(checkDelivery({ slot: afternoon, now, timing: t }), { ok: true, date: '2026-11-10' });
  });
  test('a slot closes `cutoffMinutes` before it starts', () => {
    assert.equal(checkDelivery({ slot: afternoon, now: at('2026-11-10T12:00'), timing: t }).ok, true); // exactly 60 minutes before 13:00 is still allowed
    assert.equal(checkDelivery({ slot: afternoon, now: at('2026-11-10T12:01'), timing: t }).ok, false); // one minute later it is closed
    const late = checkDelivery({ slot: evening, now: at('2026-11-10T16:30'), timing: t });
    assert.equal(late.ok === false && late.code, 'SLOT_CLOSED');
  });
  test('tomorrow: any scheduled slot, even one that closed for today', () => {
    assert.deepEqual(checkDelivery({ date: '2026-11-11', slot: afternoon, now: at('2026-11-10T18:00'), timing: t }), { ok: true, date: '2026-11-11' });
  });
  test('express is today only', () => {
    assert.equal(checkDelivery({ slot: express, now, timing: t }).ok, true);
    const r = checkDelivery({ date: '2026-11-11', slot: express, now, timing: t });
    assert.equal(r.ok === false && r.code, 'EXPRESS_TODAY_ONLY');
  });
  test('past dates, bad dates and dates beyond the advance limit are refused', () => {
    for (const [date, code] of [['2026-11-09', 'BAD_DATE'], ['2026-02-30', 'BAD_DATE'], ['tomorrow', 'BAD_DATE'], ['2026-11-13', 'DATE_TOO_FAR']] as const) {
      const r = checkDelivery({ date, slot: afternoon, now, timing: t });
      assert.equal(r.ok === false && r.code, code, date);
    }
    assert.equal(checkDelivery({ date: '2026-11-12', slot: afternoon, now, timing: t }).ok, true); // today + 2
  });
  test('"today only" store (0 days ahead)', () => {
    assert.equal(checkDelivery({ date: '2026-11-11', slot: afternoon, now, timing: { maxAdvanceDays: 0, cutoffMinutes: 60 } }).ok, false);
  });
  test('a slot with no start time (custom wording only) is never closed by the clock', () => {
    assert.equal(checkDelivery({ slot: { ...afternoon, start: undefined }, now: at('2026-11-10T23:00'), timing: t }).ok, true);
  });
});

describe('resolveSlot', () => {
  test('applies admin overrides over the defaults', () => {
    const r = resolveSlot(afternoon, { fee: 25, title: ' Lunch ', window: '12:00 PM - 2:00 PM', start: '12:00', end: '14:00', enabled: false });
    assert.deepEqual([r.fee, r.title, r.window, r.start, r.end, r.enabled], [25, 'Lunch', '12:00 PM - 2:00 PM', '12:00', '14:00', false]);
  });
  test('blank wording falls back to the default; express never gets clock times', () => {
    assert.equal(resolveSlot(afternoon, { title: '  ', window: '' }).title, 'Afternoon');
    const e = resolveSlot(express, { start: '10:00', end: '11:00' });
    assert.deepEqual([e.start, e.end], [undefined, undefined]);
  });
});
