/**
 * Delivery date and slot helpers for the checkout screens. Pure (no React Native), unit-tested.
 * The server (backend/src/modules/orders/slots.ts) applies the same rules when the order is placed and has the final say;
 * this copy only decides what to show, grey out or select. All times are India time, whatever the phone's time zone is.
 */
import type { DeliverySlot } from '../types';

export type DeliveryTiming = { maxAdvanceDays: number; cutoffMinutes: number };
export const DEFAULT_TIMING: DeliveryTiming = { maxAdvanceDays: 2, cutoffMinutes: 60 };

const IST_MINUTES = 330;
const pad = (n: number) => String(n).padStart(2, '0');

export function istDate(now: Date): string {
  const d = new Date(now.getTime() + IST_MINUTES * 60_000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
export function istMinutes(now: Date): number {
  const d = new Date(now.getTime() + IST_MINUTES * 60_000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}
const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return h * 60 + m;
};

/** Dates the customer may choose, today first. */
export const dateOptions = (now: Date, timing: DeliveryTiming): string[] => {
  const today = istDate(now);
  return Array.from({ length: Math.max(0, timing.maxAdvanceDays) + 1 }, (_, i) => addDays(today, i));
};

export type Availability = { ok: true } | { ok: false; reason: string };

/** Can this slot be chosen for this date right now? */
export function slotAvailability(slot: DeliverySlot, date: string, now: Date, timing: DeliveryTiming): Availability {
  const today = istDate(now);
  if (slot.kind === 'express') return date === today ? { ok: true } : { ok: false, reason: 'Today only' };
  if (date === today && slot.start) {
    if (toMinutes(slot.start) - istMinutes(now) < timing.cutoffMinutes) return { ok: false, reason: 'Closed for today' };
  }
  return { ok: true };
}

/** The first slot that can be chosen for this date (used when the chosen slot is not available on a newly chosen date). */
export const firstAvailable = (slots: DeliverySlot[], date: string, now: Date, timing: DeliveryTiming) =>
  slots.find((s) => slotAvailability(s, date, now, timing).ok);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Today", "Tomorrow", or "Fri 14 Nov". */
export function dayLabel(date: string, today: string): string {
  if (date === today) return 'Today';
  if (date === addDays(today, 1)) return 'Tomorrow';
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return `${DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MONTHS[m - 1]}`;
}

/** One line for any screen: express = "In 30 – 45 mins", scheduled = "Tomorrow 1:00 PM - 3:00 PM". Old orders without a date read "Today ...". */
export function slotLabel(slot: Pick<DeliverySlot, 'kind' | 'title' | 'window'> & { date?: string }, now: Date = new Date()): string {
  if (slot.kind === 'express' || slot.title === 'Express') return `In ${slot.window}`;
  const day = slot.date ? dayLabel(slot.date, istDate(now)) : '';
  return [day, slot.window].filter(Boolean).join(' ');
}
