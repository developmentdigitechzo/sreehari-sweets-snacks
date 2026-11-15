/**
 * Field validation shared by login, signup and the address form. Messages are written for customers.
 * The backend (src/modules/auth/validators.ts) and the admin panel (lib/validate.ts) apply the same rules, with the same test cases.
 */

/**
 * An Indian mobile number in any way people write it: 9876543210, 09876543210, 91 98765 43210, +91-98765-43210, 0091...
 * Returns "+91XXXXXXXXXX", or null when it is not a valid Indian mobile (ten digits, first digit 6-9).
 * A ten-digit number that happens to START with 91 (for example 9123456789) is a normal number, not a country code.
 */
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

/** What is sent to the server: +91XXXXXXXXXX when valid, otherwise just the digits typed (the server will refuse it). */
export const normalizePhone = (raw: string) => normalizeIndianPhone(raw) ?? raw.replace(/[^\d+]/g, '');

export const isValidPhone = (raw: string) => normalizeIndianPhone(raw) !== null;

/**
 * Keeps a phone field to digits only, at most ten. A pasted "+91 98765-43210" or "09876543210" becomes 9876543210, and a number that
 * simply starts with 91 is left alone while it is being typed.
 */
export function phoneInput(typed: string): string {
  const d = typed.replace(/\D/g, '');
  const n = normalizeIndianPhone(d);
  return n ? n.slice(3) : d.slice(0, 10);
}

const LOCAL_PART = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const DOMAIN_LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;
const TLD = /^(?:[A-Za-z]{2,63}|xn--[A-Za-z0-9-]{2,59})$/;

/** A practical email check: one @, no spaces, no empty or doubled dots, labels not starting/ending with a hyphen, a real TLD, sane lengths. */
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

/** A name must contain at least one letter (any script, so Tamil works): "12" and "!!" are not names. */
export const hasLetter = (v: string) => /\p{L}/u.test(v);

export function validateName(v: string) {
  const t = v.trim();
  return t.length >= 2 && hasLetter(t) ? undefined : 'Enter your full name';
}
export function validatePhone(v: string) {
  return isValidPhone(v) ? undefined : 'Enter a valid 10-digit mobile number';
}
export function validateEmail(v: string, required = false) {
  if (!v.trim()) return required ? 'Enter your email address' : undefined;
  return isValidEmail(v) ? undefined : 'Enter a valid email address, like name@example.com';
}
/** Indian PIN codes are six digits and never start with 0. */
export function validatePincode(v: string) {
  return /^[1-9]\d{5}$/.test(v.trim()) ? undefined : 'Enter a valid 6-digit pincode';
}
export function validatePassword(v: string) {
  if (v.length < 8) return 'Use at least 8 characters';
  if (!/[A-Za-z]/.test(v) || !/\d/.test(v)) return 'Include at least one letter and one number';
  return undefined;
}
export function validateConfirm(pw: string, confirm: string) {
  return pw === confirm ? undefined : 'Passwords do not match';
}
/** Login identifier: either a mobile number or an email. */
export function validateIdentifier(v: string) {
  if (!v.trim()) return 'Enter your mobile number or email';
  return isValidPhone(v) || isValidEmail(v) ? undefined : 'Enter a valid mobile number or email';
}

export const hasErrors = (e: Record<string, string | undefined>) => Object.values(e).some(Boolean);
