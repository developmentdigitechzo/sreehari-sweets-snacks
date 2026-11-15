import { env } from '../../config/env.js';
import { AppError } from '../../utils/errors.js';

export type Email = { to: string; subject: string; text: string };

export interface EmailSender {
  /** Must throw if the provider did not accept the message. */
  send(email: Email): Promise<void>;
}

/** In-memory outbox for development/tests only. Refused in production by env validation. */
const outbox: Email[] = [];
export const devOutbox = () => outbox;

export const devEmailSender: EmailSender = {
  async send(email) {
    outbox.push(email);
    console.warn('[email:dev] message stored in the development outbox (nothing was sent)');
  },
};

/** Transactional email through Resend's REST API (no SDK). `fetchImpl` is injectable for tests. */
export function resendEmailSender(cfg: { apiKey: string; from: string }, fetchImpl: typeof fetch = fetch): EmailSender {
  return {
    async send(email) {
      let res: Response;
      try {
        res = await fetchImpl('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: cfg.from, to: [email.to], subject: email.subject, text: email.text }),
          signal: AbortSignal.timeout(10_000),
        });
      } catch {
        throw new AppError(502, 'We could not send the email right now.', 'EMAIL_DELIVERY_FAILED');
      }
      if (!res.ok) throw new AppError(502, 'We could not send the email right now.', 'EMAIL_DELIVERY_FAILED');
    },
  };
}

export function currentEmailSender(): EmailSender | null {
  if (env.EMAIL_PROVIDER === 'dev') return devEmailSender;
  if (env.EMAIL_PROVIDER === 'resend' && env.RESEND_API_KEY) return resendEmailSender({ apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM });
  return null;
}
