const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
export const rupee = (n: number | null | undefined) => (n == null ? '—' : `₹${inr.format(Math.round(n))}`);
export const rupee2 = (n: number | null | undefined) => (n == null ? '—' : `₹${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`);
export const num = (n: number | null | undefined) => (n == null ? '—' : inr.format(n));

const dt = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
const d = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
export const dateTime = (v: string | Date | null | undefined) => (v ? dt.format(new Date(v)) : '—');
export const date = (v: string | Date | null | undefined) => (v ? d.format(new Date(v)) : '—');

/** Converts a value from <input type="datetime-local"> / <input type="date"> to ISO (or null). */
export const toIso = (v: string) => (v ? new Date(v).toISOString() : null);
/** ISO string -> value for <input type="datetime-local">. */
export const toLocalInput = (v: string | null | undefined) => {
  if (!v) return '';
  const x = new Date(v);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}T${p(x.getHours())}:${p(x.getMinutes())}`;
};

/**
 * Input filters for number-like text fields. They keep the value a string (so a field can be emptied and the cursor
 * never jumps), and drop characters that can never be valid. The form still validates the final value on save.
 */
export const digitsOnly = (v: string) => v.replace(/\D/g, '');
export const decimalOnly = (v: string) => {
  const s = v.replace(/[^\d.]/g, '');
  const i = s.indexOf('.');
  return i === -1 ? s : `${s.slice(0, i + 1)}${s.slice(i + 1).replace(/\./g, '').slice(0, 2)}`;
};
export const signedInt = (v: string) => `${/^\s*[+-]/.test(v) ? v.trim()[0] : ''}${v.replace(/\D/g, '')}`;

export const delta =(v: number | null | undefined) => (v == null ? null : { up: v >= 0, text: `${v >= 0 ? '+' : ''}${v}%` });
