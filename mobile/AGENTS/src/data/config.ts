import type { DeliverySlot } from '../types';

/**
 * DEMO CONFIGURATION.
 * Delivery areas, fees, slots, thresholds and rewards rules are "business to confirm"
 * items in the BRD. Nothing here is an approved commercial policy.
 */
export const DEMO_CONFIG = {
  currency: 'INR',
  freeDeliveryThreshold: 1499,
  codLimit: 2000,
  pointsPerRupee: 0.1, // earn: 1 point per ₹10 (demo)
  pointsToRupee: 0.1, // redeem: 10 points = ₹1 (demo)
  serviceablePincodes: ['600040', '600032', '600001', '600017', '600028', '600083', '600102'],
  referralPoints: 100,
  referralCode: 'RAMESH100',
};

export const DELIVERY_SLOTS: DeliverySlot[] = [
  { id: 'express', title: 'Express', window: '30 – 45 mins', fee: 40, kind: 'express' },
  { id: 'slot-1', title: 'Afternoon', window: '1:00 PM - 3:00 PM', fee: 30, kind: 'scheduled', start: '13:00', end: '15:00' },
  { id: 'slot-2', title: 'Evening', window: '4:00 PM - 6:00 PM', fee: 30, kind: 'scheduled', start: '16:00', end: '18:00' },
];

export const PAYMENT_METHODS = [
  { id: 'upi', title: 'Pay via UPI', subtitle: 'Google Pay, PhonePe, Paytm & more', recommended: true },
  { id: 'card', title: 'Debit / Credit Card', subtitle: 'Visa, Mastercard, RuPay & more' },
  { id: 'wallet', title: 'Wallets', subtitle: 'Paytm, Amazon Pay, Mobikwik' },
  { id: 'netbanking', title: 'Net Banking', subtitle: 'All major banks' },
  { id: 'cod', title: 'Cash on Delivery (COD)', subtitle: 'Pay when you receive your order' },
] as const;

/** Map provider for the address pin preview: only 'none' is implemented (see services/maps.ts). */
export const MAP_PROVIDER = process.env.EXPO_PUBLIC_MAP_PROVIDER ?? 'none';

export const USE_MOCK_API = (process.env.EXPO_PUBLIC_USE_MOCK ?? 'true') !== 'false';
