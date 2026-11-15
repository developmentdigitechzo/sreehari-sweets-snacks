import { z } from 'zod';

/**
 * Field rules shared by every endpoint. The phone app (src/utils/validation.ts) and the admin panel (lib/validate.ts) keep the same
 * rules and the same test cases, so a value one side accepts is never refused by another.
 */

/**
 * An Indian mobile number in any way people write it: 9876543210, 09876543210, 91 98765 43210, +91-98765-43210, 0091...
 * Returns "+91XXXXXXXXXX", or null when it is not a valid Indian mobile (first digit 6-9, ten digits).
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

export const emailSchema = z.string().trim().max(254).refine(isValidEmail, 'Enter a valid email address');
export const nameSchema = z.string().trim().min(2, 'Enter your full name').max(80).refine(hasLetter, 'Enter your full name');
/** Indian PIN codes are six digits and never start with 0. */
export const pincodeSchema = z.string().regex(/^[1-9]\d{5}$/, 'Enter a valid 6-digit pincode');
export const indianPhoneSchema = z
  .string()
  .refine((v) => normalizeIndianPhone(v) !== null, 'Enter a valid 10-digit Indian mobile number')
  .transform((v) => normalizeIndianPhone(v)!);
