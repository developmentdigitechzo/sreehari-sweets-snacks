import type {
  Address,
  Coupon,
  DeliverySlot,
  Order,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PricedLine,
  Totals,
} from '../types';
import { uid } from '../utils/format';

export const ORDER_FLOW: { status: OrderStatus; title: string; subtitle: string }[] = [
  { status: 'placed', title: 'Order Placed', subtitle: 'We have received your order' },
  { status: 'confirmed', title: 'Order Confirmed', subtitle: 'The store confirmed your order' },
  { status: 'preparing', title: 'Preparing Your Order', subtitle: 'Freshly prepared with care' },
  { status: 'packed', title: 'Packed & Ready', subtitle: 'Packed and waiting for dispatch' },
  { status: 'out_for_delivery', title: 'Out for Delivery', subtitle: 'Our delivery partner is on the way' },
  { status: 'delivered', title: 'Delivered', subtitle: 'Order will be marked as delivered once you receive it' },
];

export const nextStatus = (s: OrderStatus): OrderStatus | null => {
  const i = ORDER_FLOW.findIndex((f) => f.status === s);
  return i >= 0 && i < ORDER_FLOW.length - 1 ? ORDER_FLOW[i + 1].status : null;
};

export function buildOrder(args: {
  number: string;
  lines: PricedLine[];
  totals: Totals;
  address: Address;
  slot: DeliverySlot & { date?: string };
  coupon?: Coupon | null;
  method: PaymentMethod;
  paymentStatus: PaymentStatus;
  idempotencyKey: string;
  createdAt?: string;
  status?: OrderStatus;
}): Order {
  const createdAt = args.createdAt ?? new Date().toISOString();
  const status = args.status ?? 'placed';
  const idx = ORDER_FLOW.findIndex((f) => f.status === status);
  const events = ORDER_FLOW.slice(0, Math.max(idx, 0) + 1).map((f, i) => ({
    status: f.status,
    at: new Date(new Date(createdAt).getTime() + i * 4 * 60000).toISOString(),
  }));
  return {
    id: uid('ord'),
    number: args.number,
    idempotencyKey: args.idempotencyKey,
    createdAt,
    status,
    events,
    items: args.lines.map((l) => ({
      productId: l.product.id,
      name: l.product.name,
      sku: l.variant.sku,
      variantLabel: l.variant.label,
      unitPrice: l.variant.price,
      mrp: l.variant.mrp,
      qty: l.qty,
      imageKey: l.product.images[0]?.key,
      imageUri: l.product.images[0]?.uri,
      options: l.options,
    })),
    totals: args.totals,
    couponCode: args.coupon && args.totals.coupon?.eligible ? args.coupon.code : undefined,
    address: args.address,
    slot: args.slot,
    payment: {
      method: args.method,
      status: args.paymentStatus,
      reference: `SIM-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
      simulated: true,
    },
    isDemo: true,
  };
}
