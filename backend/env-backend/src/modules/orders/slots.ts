/**
 * Delivery slots and delivery dates. Pure logic (no database), unit-tested.
 *
 * The three slot ids are fixed, but their wording, time window, start/end time, fee and on/off are edited in the admin panel
 * (Delivery). A customer picks a delivery DATE (today, or up to `maxAdvanceDays` ahead) and a slot. For today, a timed slot closes
 * `cutoffMinutes` before it starts. All times are Indian Standard Time, whatever time zone the server runs in.
 */
export type SlotDef = { id: string; title: string; window: string; kind: 'express' | 'scheduled'; fee: number; /** HH:mm, India time */ start?: string; end?: string };

/** Defaults. Express has no clock time: it is "as soon as possible", available for today only. */
export const SLOTS: readonly SlotDef[] = [
  { id: 'express', title: 'Express', window: '30 – 45 mins', fee: 40, kind: 'express' },
  { id: 'slot-1', title: 'Afternoon', window: '1:00 PM - 3:00 PM', fee: 30, kind: 'scheduled', start: '13:00', end: '15:00' },
  { id: 'slot-2', title: 'Evening', window: '4:00 PM - 6:00 PM', fee: 30, kind: 'scheduled', start: '16:00', end: '18:00' },
];

export type SlotOverride = { fee?: number; enabled?: boolean; title?: string; window?: string; start?: string; end?: string };
export type DeliveryTiming = { maxAdvanceDays: number; cutoffMinutes: number };

export const DEFAULT_TIMING: DeliveryTiming = { maxAdvanceDays: 2, cutoffMinutes: 60 };

/** The slot as the store currently configures it (defaults + admin overrides). */
export function resolveSlot(base: SlotDef, o: SlotOverride | undefined): SlotDef & { enabled: boolean } {
  return {
    ...base,
    fee: o?.fee ?? base.fee,
    title: o?.title?.trim() || base.title,
    window: o?.window?.trim() || base.window,
    start: base.kind === 'express' ? undefined : (o?.start ?? base.start),
    end: base.kind === 'express' ? undefined : (o?.end ?? base.end),
    enabled: o?.enabled !== false,
  };
}

const IST_MINUTES = 330;
const pad = (n: number) => String(n).padStart(2, '0');

/** Today's date in India, as YYYY-MM-DD. */
export function istDate(now: Date): string {
  const d = new Date(now.getTime() + IST_MINUTES * 60_000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Minutes since midnight in India. */
export function istMinutes(now: Date): number {
  const d = new Date(now.getTime() + IST_MINUTES * 60_000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/** YYYY-MM-DD plus n days (calendar arithmetic, no time zones involved). */
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export const isRealDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && addDays(s, 0) === s;

export const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return h * 60 + m;
};

export type DeliveryCheck = { ok: true; date: string } | { ok: false; code: 'BAD_DATE' | 'DATE_TOO_FAR' | 'EXPRESS_TODAY_ONLY' | 'SLOT_CLOSED'; message: string };

/** Can this slot be booked for this date, right now? Used by checkout on the server, and mirrored in the app for greying out slots. */
export function checkDelivery(input: { date?: string | null; slot: SlotDef; now: Date; timing: DeliveryTiming }): DeliveryCheck {
  const today = istDate(input.now);
  const date = input.date ?? today;
  if (!isRealDate(date) || date < today) return { ok: false, code: 'BAD_DATE', message: 'Choose today or a later delivery date.' };
  if (date > addDays(today, input.timing.maxAdvanceDays)) {
    return { ok: false, code: 'DATE_TOO_FAR', message: `Orders can be scheduled up to ${input.timing.maxAdvanceDays} day${input.timing.maxAdvanceDays === 1 ? '' : 's'} ahead.` };
  }
  if (input.slot.kind === 'express') {
    return date === today ? { ok: true, date } : { ok: false, code: 'EXPRESS_TODAY_ONLY', message: 'Express delivery is for today only. Choose a time slot for another day.' };
  }
  if (date === today && input.slot.start) {
    const left = toMinutes(input.slot.start) - istMinutes(input.now);
    if (left < input.timing.cutoffMinutes) return { ok: false, code: 'SLOT_CLOSED', message: `This slot is closed for today (orders close ${input.timing.cutoffMinutes} minutes before it starts). Choose a later slot or another day.` };
  }
  return { ok: true, date };
}
