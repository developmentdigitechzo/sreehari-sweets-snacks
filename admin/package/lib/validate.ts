/**
 * Field rules for the admin forms. They are the same rules, with the same test cases, as the backend (src/modules/auth/validators.ts)
 * and the phone app (src/utils/validation.ts), so the form never accepts what the server will refuse, or the other way round.
 */

/** An Indian mobile in any common form (9876543210, 09876543210, 91 98765 43210, +91-98765-43210) -> "+91XXXXXXXXXX", else null. */
export function normalizeIndianPhone(raw: string): string | null {
  const d = raw.replace(/\D/g, '');
  let n = d;
  if (raw.trim().startsWith('+')) {
    // An explicit + means the next digits are a country code: only +91 is accepted, and what follows must be the ten-digit number.
    if (!d.startsWith('91')) return null;
    n = d.slice(2);
  } else if (d.length === 14 && d.startsWith('0091')) n = d.slice(4);
  else if (d.length === 12 && d.startsWith('91')) n = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) n = d.slice(1);
  return /^[6-9]\d{9}$/.test(n) ? `+91${n}` : null;
}

/** Staff may be abroad: an Indian mobile in any form, or a full international number (+country number). */
export const isValidStaffPhone = (raw: string) => normalizeIndianPhone(raw) !== null || /^\+[1-9]\d{7,14}$/.test(raw.replace(/[\s-]/g, ''));

/** The shop's public number can be a mobile or a landline: 7 to 15 digits, only digits, spaces, dashes, brackets and a leading +. */
export function isValidContactPhone(raw: string): boolean {
  const v = raw.trim();
  if (v === '') return true; // optional
  const digits = v.replace(/\D/g, '').length;
  return /^\+?[\d\s()-]+$/.test(v) && digits >= 7 && digits <= 15;
}

const LOCAL_PART = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const DOMAIN_LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;
const TLD = /^(?:[A-Za-z]{2,63}|xn--[A-Za-z0-9-]{2,59})$/;

export function isValidEmail(raw: string): boolean {
  const v = raw.trim();
  if (v.length > 254) return false;
  const at = v.indexOf('@');
  if (at < 1 || at !== v.lastIndexOf('@')) return false;
  const local = v.slice(0, at);
  const domain = v.slice(at + 1);
  if (local.length > 64 || !LOCAL_PART.test(local)) return false;
  if (domain.length > 253) return false;
  const labels = domain.split('.');
  if (labels.length < 2 || !labels.every((l) => DOMAIN_LABEL.test(l))) return false;
  return TLD.test(labels[labels.length - 1]);
}
