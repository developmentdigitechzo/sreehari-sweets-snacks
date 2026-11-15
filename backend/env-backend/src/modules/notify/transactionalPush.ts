import { prisma } from '../../database/prisma.js';
import { senderFor, type Sender } from '../admin/broadcast.senders.js';

export type OrderEvent = 'order_placed' | 'order_status' | 'order_cancelled' | 'return_decision' | 'refund_paid';

/**
 * Pushes a service message about the customer's OWN order to their registered phones.
 *
 * - Service messages are not marketing: they ignore marketingOptIn. The customer controls them with the phone's notification permission.
 * - Best effort, after the database change has committed. A push failure never fails or rolls back the order. The in-app inbox row is the record.
 * - Does nothing when no push provider is connected or the customer has no registered phone.
 */
export async function pushOrderEvent(
  customerId: string,
  m: { kind: OrderEvent; title: string; body: string; orderId?: string },
  deps: { sender?: Sender | null; tokensFor?: (customerId: string) => Promise<string[]> } = {},
): Promise<{ sent: boolean; reason?: string }> {
  try {
    const sender = deps.sender === undefined ? senderFor('push') : deps.sender;
    if (!sender) return { sent: false, reason: 'push_not_connected' };
    const tokens = deps.tokensFor ? await deps.tokensFor(customerId) : (await prisma.deviceToken.findMany({ where: { customerId }, select: { token: true } })).map((t) => t.token);
    if (tokens.length === 0) return { sent: false, reason: 'no_device' };
    const r = await sender.send({ customerId, phone: '', pushTokens: tokens }, { title: m.title, message: m.body, data: { kind: m.kind, ...(m.orderId ? { orderId: m.orderId } : {}) } });
    return r.ok ? { sent: true } : { sent: false, reason: r.error };
  } catch {
    return { sent: false, reason: 'error' };
  }
}
