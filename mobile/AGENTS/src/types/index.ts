export type ImageRef = { id: string; key?: string; uri?: string };

export type Variant = {
  id: string;
  sku: string;
  label: string; // "250 g"
  mrp: number;
  price: number;
  stock: number; // 0 => out of stock
  popular?: boolean;
};

export type ProductBadge = 'Bestseller' | 'Special Offer' | 'New Arrival' | 'Family Pack';

export type Product = {
  id: string;
  name: string;
  tagline: string;
  description: string;
  categoryId: string; // sub-category id
  badge?: ProductBadge;
  images: ImageRef[]; // first = primary
  variants: Variant[];
  tags: string[];
  /** DEMO ONLY: sample rating, never real customer data */
  demoRating?: number;
  demoRatingCount?: string;
  highlights: { icon: string; label: string }[];
  featured?: { bestseller?: boolean; newArrival?: boolean; festive?: boolean };
  /** Cake-only options. Absent for sweets/snacks. Customisation support is a business decision (demo values). */
  cake?: CakeOptions;
};

export type CakeOptions = {
  flavours?: string[];
  allowsMessage: boolean;
  messageMaxLength: number;
  /** Shown clearly so nobody assumes same-day delivery or customisation. */
  notice: string;
};

export type LineOptions = { flavour?: string; message?: string };

export type Category = {
  id: string;
  name: string;
  parentId: string | null;
  imageKey: string;
  /** Uploaded by the store owner; wins over the bundled imageKey. */
  imageUri?: string;
};

export type Collection = {
  id: string;
  name: string;
  subtitle: string;
  imageKey: string;
  tone: 'burgundy' | 'cream';
  categoryIds: string[];
};

export type BannerTarget =
  | { type: 'collection'; id: string }
  | { type: 'offers' }
  | { type: 'search'; q: string };

export type Banner = {
  id: string;
  eyebrow: string;
  title: string;
  accent?: string;
  cta: string;
  imageKey: string;
  imageUri?: string;
  target: BannerTarget;
};

/** A running store campaign (created in the admin panel). Display only; the discount itself always comes from the linked coupon. */
export type Campaign = { id: string; name: string; kind: string; offerText: string; couponCode?: string; endsAt?: string; recurrence?: string };

export type Coupon = {
  code: string;
  title: string;
  description: string;
  type: 'percent' | 'flat' | 'freeship';
  value: number;
  minOrder: number;
  maxDiscount?: number;
  expiresAt?: string; // ISO
  startsAt?: string; // ISO
  /** Empty/absent = valid for the whole cart; otherwise only matching lines count. */
  categoryIds?: string[];
  productIds?: string[];
};

export type Address = {
  id: string;
  label: 'Home' | 'Office' | 'Other';
  name: string;
  phone: string;
  line1: string;
  area: string;
  city: string;
  pincode: string;
  state?: string;
  landmark?: string;
  /** Set only when the customer confirmed a detected GPS location. Never faked. */
  latitude?: number;
  longitude?: number;
  instructions?: string;
  isDefault?: boolean;
};

export type DeliverySlot = {
  id: string;
  title: string;
  window: string;
  fee: number;
  kind: 'express' | 'scheduled';
  /** Clock times (HH:mm, India) for scheduled slots: the slot closes for today a cut-off before `start`. */
  start?: string;
  end?: string;
};

export type CartLine = { productId: string; variantId: string; qty: number; options?: LineOptions };

export type PricedLine = {
  product: Product;
  variant: Variant;
  qty: number;
  options?: LineOptions;
  /** Stable cart-line identity (size + flavour + message). */
  key?: string;
  lineMrp: number;
  linePrice: number;
};

export type CouponEvaluation = {
  code: string;
  eligible: boolean;
  reason?: string;
  discount: number;
  freeShipping: boolean;
};

export type Totals = {
  itemCount: number;
  mrpTotal: number;
  itemDiscount: number;
  subtotal: number; // after item discounts
  couponDiscount: number;
  rewardDiscount: number;
  deliveryFee: number;
  total: number;
  savings: number;
  freeDeliveryRemaining: number;
  coupon?: CouponEvaluation;
};

export type OrderStatus =
  | 'placed'
  | 'confirmed'
  | 'preparing'
  | 'packed'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled';

export type PaymentMethod = 'upi' | 'card' | 'wallet' | 'netbanking' | 'cod';
export type PaymentStatus = 'paid' | 'pending' | 'processing' | 'failed' | 'cancelled' | 'refunded' | 'cod_due';

export type OrderItemSnapshot = {
  productId: string;
  name: string;
  sku: string;
  variantLabel: string;
  unitPrice: number;
  mrp: number;
  qty: number;
  imageKey?: string;
  imageUri?: string;
  options?: LineOptions;
};

export type Order = {
  id: string;
  number: string; // SH12456
  idempotencyKey: string;
  createdAt: string;
  status: OrderStatus;
  events: { status: OrderStatus; at: string }[];
  items: OrderItemSnapshot[];
  totals: Totals;
  couponCode?: string;
  address: Address;
  /** The slot as booked, with the delivery date (YYYY-MM-DD, India). Orders placed before dates existed have no date. */
  slot: DeliverySlot & { date?: string };
  payment: { method: PaymentMethod; status: PaymentStatus; reference: string; simulated: boolean; provider?: string };
  isDemo: boolean;
};

export type Profile = { name: string; phone: string; email: string; photoUri?: string };

export type LedgerEntry = { id: string; at: string; note: string; points: number };

export type User = { id: string; name: string; phone: string; email?: string; /** Live backend only: the customer opened the emailed link. */ emailVerified?: boolean; isDemo?: boolean };
