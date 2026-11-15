import { env } from '../../config/env.js';
import { AppError } from '../../utils/errors.js';

export type OtpDelivery = { delivery: 'sms' | 'development'; devCode?: string };

export interface OtpSender {
  /** Must throw if the message was NOT accepted by the provider, so callers never report a false "sent". */
  send(phone: string, code: string): Promise<OtpDelivery>;
}

/** Development only (refused in production by env validation). The code is returned to the caller, clearly flagged. */
export const devSender: OtpSender = {
  async send(_phone, code) {
    console.warn('[otp:dev] a code was generated (development mode, no SMS sent)');
    return { delivery: 'development', devCode: code };
  },
};

/** Real SMS through Twilio's REST API (no SDK). The code is never logged. `fetchImpl` is injectable for tests. */
export function twilioSender(cfg: { accountSid: string; authToken: string; from: string }, fetchImpl: typeof fetch = fetch): OtpSender {
  return {
    async send(phone, code) {
      const body = new URLSearchParams({ To: phone, From: cfg.from, Body: `Your Shree Hari verification code is ${code}. It expires soon. Do not share it with anyone.` });
      let res: Response;
      try {
        res = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}/Messages.json`, {
          method: 'POST',
          headers: { Authorization: 'Basic ' + Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
          signal: AbortSignal.timeout(10_000),
        });
      } catch {
        throw new AppError(502, 'We could not send the SMS right now. Please try again shortly.', 'SMS_DELIVERY_FAILED');
      }
      if (!res.ok) throw new AppError(502, 'We could not send the SMS right now. Please try again shortly.', 'SMS_DELIVERY_FAILED');
      return { delivery: 'sms' };
    },
  };
}

export function currentSender(): OtpSender | null {
  if (env.OTP_PROVIDER === 'dev') return devSender;
  if (env.OTP_PROVIDER === 'twilio' && env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM_NUMBER) {
    return twilioSender({ accountSid: env.TWILIO_ACCOUNT_SID, authToken: env.TWILIO_AUTH_TOKEN, from: env.TWILIO_FROM_NUMBER });
  }
  return null;
}
