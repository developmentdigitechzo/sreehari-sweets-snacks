import jwt from 'jsonwebtoken';

/**
 * Proof that a phone number was verified with a one-time code during sign-up. It is NOT a login token:
 * it is signed with a different key (the app secret plus a suffix), so it can never be accepted where a sign-in token is expected,
 * and it only says "this number was verified a moment ago". It lives for 15 minutes and is useless once the account exists
 * (a second account for the same number is refused).
 */
const keyFor = (appSecret: string) => `${appSecret}:signup-token`;
export const SIGNUP_TOKEN_SECONDS = 15 * 60;

export function signSignupToken(appSecret: string, phone: string, ttlSeconds = SIGNUP_TOKEN_SECONDS): string {
  return jwt.sign({ phone, purpose: 'signup' }, keyFor(appSecret), { expiresIn: ttlSeconds });
}

/** The verified phone number, or null when the token is missing, expired, tampered with, or of another kind. */
export function readSignupToken(appSecret: string, token: string): { phone: string } | null {
  try {
    const p = jwt.verify(token, keyFor(appSecret)) as { phone?: unknown; purpose?: unknown };
    return p.purpose === 'signup' && typeof p.phone === 'string' ? { phone: p.phone } : null;
  } catch {
    return null;
  }
}
