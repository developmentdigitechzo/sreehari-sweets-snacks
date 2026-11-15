import { env } from '../../config/env.js';
import { pruneDeadTokens } from '../notify/pruneTokens.js';

export type Channel = 'in_app' | 'push' | 'sms' | 'whatsapp';
export type Recipient = { customerId: string; phone: string; pushTokens: string[] };
export type Message = { title: string; message: string; imageUrl?: string | null; /** Opaque routing data the app reads when the notification is tapped (for example orderId). */ data?: Record<string, string> };
export type SendResult = { ok: true; id?: string } | { ok: false; error: string };

/** One adapter per channel. `fetchImpl` is injectable so tests never touch the network. */
export interface Sender {
  channel: Exclude<Channel, 'in_app'>;
  send(to: Recipient, msg: Message): Promise<SendResult>;
}

const twilioAuth = () => 'Basic ' + Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64');

async function twilioSend(fetchImpl: typeof fetch, from: string, to: string, body: string, mediaUrl?: string | null): Promise<SendResult> {
  const form = new URLSearchParams({ From: from, To: to, Body: body });
  if (mediaUrl) form.set('MediaUrl', mediaUrl);
  try {
    const res = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: twilioAuth(), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
      signal: AbortSignal.timeout(10_000),
    });
    const json = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
    return res.ok && json.sid ? { ok: true, id: json.sid } : { ok: false, error: (json.message ?? `HTTP ${res.status}`).slice(0, 200) };
  } catch {
    return { ok: false, error: 'Message service unreachable' };
  }
}

export const smsSender = (fetchImpl: typeof fetch = fetch): Sender => ({
  channel: 'sms',
  send: (to, m) => twilioSend(fetchImpl, env.TWILIO_FROM_NUMBER!, to.phone, `${m.title}: ${m.message}`.slice(0, 320)),
});

/** WhatsApp via Twilio. Business-initiated messages outside the 24h window need a template approved by WhatsApp. */
export const whatsappSender = (fetchImpl: typeof fetch = fetch): Sender => ({
  channel: 'whatsapp',
  send: (to, m) => twilioSend(fetchImpl, env.TWILIO_WHATSAPP_FROM!, `whatsapp:${to.phone}`, `*${m.title}*\n${m.message}`, m.imageUrl),
});

/** Expo Push service. Reaches only customers whose app registered a device token. */
export const pushSender = (fetchImpl: typeof fetch = fetch, onDeadTokens?: (tokens: string[]) => Promise<void>): Sender => ({
  channel: 'push',
  async send(to, m) {
    if (to.pushTokens.length === 0) return { ok: false, error: 'No registered device' };
    try {
      const res = await fetchImpl('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(to.pushTokens.map((token) => ({ to: token, title: m.title, body: m.message, sound: 'default', priority: 'high', channelId: m.data?.kind === 'promo' ? 'offers' : 'orders', ...(m.data ? { data: m.data } : {}), ...(m.imageUrl ? { richContent: { image: m.imageUrl } } : {}) }))),
        signal: AbortSignal.timeout(10_000),
      });
      const json = (await res.json().catch(() => ({}))) as { data?: { status?: string; id?: string; message?: string; details?: { error?: string } }[] };
      // One ticket per token, in the same order: tokens the device no longer accepts are removed so they are not tried again.
      const dead = to.pushTokens.filter((_, i) => json.data?.[i]?.status === 'error' && (json.data[i].details?.error === 'DeviceNotRegistered' || /DeviceNotRegistered/.test(json.data[i].message ?? '')));
      if (dead.length && onDeadTokens) await onDeadTokens(dead).catch(() => { /* best effort */ });
      const first = json.data?.find((d) => d.status === 'ok');
      if (res.ok && first) return { ok: true, id: first.id };
      return { ok: false, error: (json.data?.[0]?.message ?? `HTTP ${res.status}`).slice(0, 200) };
    } catch {
      return { ok: false, error: 'Push service unreachable' };
    }
  },
});

/** The sender for a channel, or null when that provider is not connected. In-app is handled in the database, not here. */
export function senderFor(channel: Channel): Sender | null {
  if (channel === 'push' && env.NOTIFY_PUSH_PROVIDER === 'expo') return pushSender(fetch, pruneDeadTokens);
  if (channel === 'sms' && env.NOTIFY_SMS_PROVIDER === 'twilio') return smsSender();
  if (channel === 'whatsapp' && env.NOTIFY_WHATSAPP_PROVIDER === 'twilio') return whatsappSender();
  return null;
}

export const channelConnected = (c: Channel) => c === 'in_app' || senderFor(c) !== null;
