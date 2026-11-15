import type { Order, OrderStatus } from '../types';

/** A complete Order for component tests. Override only what the test cares about. */
export function makeOrder(over: Partial<Order> & { itemCount?: number; total?: number } = {}): Order {
  const { itemCount = 2, total = 706, ...rest } = over;
  return {
    id: 'o-1',
    number: 'SH1001',
    idempotencyKey: 'k-1',
    createdAt: '2026-11-10T08:30:00.000Z',
    status: 'placed' as OrderStatus,
    events: [{ status: 'placed', at: '2026-11-10T08:30:00.000Z' }],
    items: Array.from({ length: itemCount }, (_, i) => ({ productId: `p${i}`, name: `Sweet ${i}`, sku: `SKU-${i}`, variantLabel: '250 g', unitPrice: 100, mrp: 120, qty: 1, imageKey: 'mixture' })),
    totals: { itemCount, mrpTotal: 840, itemDiscount: 100, subtotal: 740, couponDiscount: 74, rewardDiscount: 0, deliveryFee: 40, total, savings: 174, freeDeliveryRemaining: 759 },
    address: { id: 'a1', label: 'Home', name: 'Test', phone: '+919876543210', line1: '12 Main Road', area: 'Anna Nagar', city: 'Chennai', state: 'Tamil Nadu', pincode: '600040' },
    slot: { id: 'express', title: 'Express', window: '30 – 45 mins', fee: 40, kind: 'express' },
    payment: { method: 'cod', status: 'cod_due', reference: 'COD-ABC12345', simulated: false },
    isDemo: false,
    ...rest,
  } as Order;
}
