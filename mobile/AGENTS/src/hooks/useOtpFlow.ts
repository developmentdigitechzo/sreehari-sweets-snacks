import { useEffect, useRef, useState } from 'react';
import type { AuthError } from '../services/authApi';
import { validatePhone } from '../utils/validation';

export type OtpBanner = { tone: 'error' | 'info'; text: string };
export type OtpDelivery = { delivery: 'sms' | 'development'; devCode?: string; cooldownSeconds: number };

/** What a screen plugs in: how to ask for a code, and what verifying one gives back (a signed-in user, a sign-up proof, ...). */
export type OtpStrategy<T> = {
  request: (phone: string) => Promise<OtpDelivery>;
  verify: (phone: string, code: string) => Promise<T>;
  /** What to tell the customer when a real SMS went out (never claim it unless the provider sent one). */
  smsNote?: string;
};

/**
 * One-time-code flow shared by sign-in and sign-up: ask for a code, then verify it. Only meaningful when the server reports a
 * working SMS provider (or the clearly-labelled development mode). The wording never claims an SMS was sent unless the provider
 * really sent one. `onVerified` receives whatever `verify` returned.
 */
export function useOtpFlow<T>(strategy: OtpStrategy<T> | undefined, onVerified: (result: T) => void | Promise<void>) {
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [banner, setBanner] = useState<OtpBanner | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const lock = useRef(false); // blocks double taps before state updates land

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const reset = () => { setSent(false); setCode(''); setError(undefined); setBanner(null); setCooldown(0); };

  /** Returns true when a code was requested. */
  const send = async (phone: string): Promise<boolean> => {
    if (lock.current || !strategy) return false;
    const e = validatePhone(phone);
    if (e) { setError(e); return false; }
    lock.current = true;
    setBusy(true);
    setBanner(null);
    setError(undefined);
    try {
      const r = await strategy.request(phone);
      setSent(true);
      setCooldown(r.cooldownSeconds);
      setBanner(
        r.delivery === 'development'
          ? { tone: 'info', text: `DEVELOPMENT MODE: no SMS was sent. Your code is ${r.devCode ?? '(none: this number has no account)'}.` }
          : { tone: 'info', text: strategy.smsNote ?? 'We have sent a 6-digit code by SMS.' },
      );
      return true;
    } catch (err) {
      setBanner({ tone: 'error', text: (err as AuthError).message });
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  const verify = async (phone: string) => {
    if (lock.current || !strategy) return;
    if (!/^\d{6}$/.test(code)) { setError('Enter the 6-digit code'); return; }
    lock.current = true;
    setBusy(true);
    setBanner(null);
    try {
      await onVerified(await strategy.verify(phone, code));
    } catch (err) {
      setBanner({ tone: 'error', text: (err as AuthError).message });
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  return { sent, code, setCode: (t: string) => { setCode(t.replace(/\D/g, '').slice(0, 6)); setError(undefined); }, error, banner, busy, cooldown, send, verify, reset };
}
