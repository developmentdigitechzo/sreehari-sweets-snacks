export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'gray' | 'violet' | 'gold';

/** Order status labels/colours, matching the reference screens. */
export const STATUS: Record<string, { label: string; tone: Tone }> = {
  PLACED: { label: 'Pending', tone: 'gray' },
  CONFIRMED: { label: 'Confirmed', tone: 'info' },
  PREPARING: { label: 'Preparing', tone: 'warn' },
  PACKED: { label: 'Packed', tone: 'info' },
  OUT_FOR_DELIVERY: { label: 'Out for Delivery', tone: 'violet' },
  DELIVERED: { label: 'Delivered', tone: 'ok' },
  CANCELLED: { label: 'Cancelled', tone: 'bad' },
};

export const PAY: Record<string, { label: string; tone: Tone }> = {
  PAID: { label: 'Paid', tone: 'ok' },
  PENDING: { label: 'Pending', tone: 'warn' },
  PROCESSING: { label: 'Processing', tone: 'info' },
  FAILED: { label: 'Failed', tone: 'bad' },
  CANCELLED: { label: 'Cancelled', tone: 'bad' },
  REFUNDED: { label: 'Refunded', tone: 'gray' },
  COD_DUE: { label: 'COD', tone: 'gold' },
};

export const METHOD: Record<string, string> = { UPI: 'UPI', CARD: 'Card', WALLET: 'Wallet', NETBANKING: 'Net Banking', COD: 'Cash on Delivery' };

export const RETURN_STATUS: Record<string, { label: string; tone: Tone }> = {
  REQUESTED: { label: 'Needs decision', tone: 'warn' },
  APPROVED: { label: 'Approved', tone: 'info' },
  REJECTED: { label: 'Rejected', tone: 'bad' },
  REFUNDED: { label: 'Refunded', tone: 'ok' },
  CLOSED: { label: 'Closed', tone: 'gray' },
};
