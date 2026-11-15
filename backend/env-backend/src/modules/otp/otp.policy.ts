import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

export type OtpConfig = { ttlSeconds: number; resendCooldownSeconds: number; maxAttempts: number; hourlyLimit: number };

/** Cryptographically secure 6-digit code (uniform, uses crypto.randomInt, never Math.random). */
export const generateCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0');

/** Keyed hash: a leaked table cannot be brute-forced offline without the server secret. The code itself is never stored. */
export const hashCode = (secret: string, phone: string, code: string) => createHmac('sha256', secret).update(`${phone}:${code}`).digest('hex');

export const codesMatch = (aHex: string, bHex: string) => {
  const a = Buffer.from(aHex, 'hex');
  const b = Buffer.from(bHex, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
};

export type RequestDecision = { ok: true } | { ok: false; reason: 'cooldown' | 'hourly_limit'; retryAfterSeconds: number };

/** Resend cooldown + per-number hourly cap. `now` is injected so tests are deterministic. */
export function canRequestOtp(input: { now: Date; lastCreatedAt?: Date | null; countLastHour: number }, cfg: OtpConfig): RequestDecision {
  if (input.lastCreatedAt) {
    const wait = cfg.resendCooldownSeconds - (input.now.getTime() - input.lastCreatedAt.getTime()) / 1000;
    if (wait > 0) return { ok: false, reason: 'cooldown', retryAfterSeconds: Math.ceil(wait) };
  }
  if (input.countLastHour >= cfg.hourlyLimit) return { ok: false, reason: 'hourly_limit', retryAfterSeconds: 3600 };
  return { ok: true };
}

export type AttemptResult =
  | { result: 'ok' }
  | { result: 'expired' | 'used' | 'locked' }
  | { result: 'wrong'; attemptsLeft: number };

/**
 * Decide the outcome of one verification attempt for a challenge.
 * Order matters: used > expired > locked > compare. A wrong guess consumes an attempt.
 */
export function evaluateAttempt(
  input: { now: Date; code: string; challenge: { codeHash: string; attempts: number; expiresAt: Date; consumedAt?: Date | null } },
  cfg: Pick<OtpConfig, 'maxAttempts'>,
  hash: (code: string) => string,
): AttemptResult {
  const c = input.challenge;
  if (c.consumedAt) return { result: 'used' };
  if (c.expiresAt.getTime() <= input.now.getTime()) return { result: 'expired' };
  if (c.attempts >= cfg.maxAttempts) return { result: 'locked' };
  if (codesMatch(hash(input.code), c.codeHash)) return { result: 'ok' };
  return { result: 'wrong', attemptsLeft: Math.max(0, cfg.maxAttempts - c.attempts - 1) };
}
