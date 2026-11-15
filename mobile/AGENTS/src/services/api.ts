import { USE_MOCK_API } from '../data/config';
import type { Address, Banner, Campaign, CartLine, Category, Collection, Coupon, DeliverySlot, LedgerEntry, Order, PaymentMethod, Product } from '../types';
import { liveApi } from './liveApi';
import { mockApi } from './mockApi';

export type Catalog = {
  products: Product[];
  categories: Category[];
  collections: Collection[];
  banners: Banner[];
  /** Offer popups that are on and in schedule. Live backend only. */
  popups?: Banner[];
  /** Promotional sections for Home. Live backend only. */
  sections?: Banner[];
  /** Running campaigns. Live backend only. */
  campaigns?: Campaign[];
  coupons: Coupon[];
  /** Live backend only: catalogue version, store contact and the current delivery rules. */
  meta?: { version: string; generatedAt: string };
  store?: { name: string; phone: string; email: string; returnWindowDays?: number };
  delivery?: { freeDeliveryThreshold: number; codLimit: number; slots: DeliverySlot[]; maxAdvanceDays?: number; cutoffMinutes?: number };
  rewards?: { earnPerRupee: number; pointsToRupee: number };
};

export type SimulatedOutcome = 'success' | 'failure' | 'pending';

export type PlaceOrderInput = {
  idempotencyKey: string;
  items: { productId: string; variantId: string; qty: number; options?: { flavour?: string; message?: string } }[];
  couponCode?: string | null;
  slotId: string;
  /** Delivery date (YYYY-MM-DD, India). Omitted = today. */
  deliveryDate?: string;
  address: Address;
  paymentMethod: PaymentMethod;
  /** SIMULATION ONLY: drives the demo payment result. There is no real gateway. */
  simulatedOutcome: SimulatedOutcome;
  redeemPoints: number;
};

export type OnlinePaymentInfo = { provider: string; providerOrderId?: string; keyId?: string; amount: number; currency: string };

export type PlaceOrderResult =
  | { outcome: 'success' | 'pending'; order: Order }
  | { outcome: 'requires_payment'; order: Order; payment: OnlinePaymentInfo }
  | { outcome: 'failure'; message: string };

export type PincodeCheck = { serviceable: boolean; message: string };

/** What the connected backend can really do. The app only offers features that are switched on. */
export type Capabilities = {
  otp: 'none' | 'development' | 'sms';
  passwordReset: boolean;
  payments: 'none' | 'test' | 'razorpay';
  reverseGeocoding: boolean;
};
export const NO_CAPABILITIES: Capabilities = { otp: 'none', passwordReset: false, payments: 'none', reverseGeocoding: false };

export type ReverseGeocodeResult =
  | { kind: 'ok'; address: { line1?: string; area?: string; city?: string; state?: string; pincode?: string } }
  | { kind: 'not_configured' | 'no_result' | 'unavailable' | 'network' };

/** Per-customer data kept on the server. Implemented by the live API only; the mock keeps everything on the device. */
export interface AccountApi {
  addresses(): Promise<Address[]>;
  saveAddress(a: Address, existingServerId?: string): Promise<Address>;
  deleteAddress(id: string): Promise<void>;
  cart(): Promise<CartLine[]>;
  saveCart(lines: CartLine[]): Promise<void>;
  reverseGeocode(latitude: number, longitude: number): Promise<ReverseGeocodeResult>;
  paymentStatus(orderId: string): Promise<{ status: string }>;
  cancelPayment(orderId: string): Promise<{ cancelled: boolean; status: string }>;
  /** Cancels the customer's own order while the store has not started on it and nothing was paid online. Otherwise the server refuses (409). */
  cancelOrder(orderId: string): Promise<Order>;
  /** The customer's orders as the server holds them (status, payment and history set by the store). */
  orders(): Promise<Order[]>;
  order(id: string): Promise<Order>;
  updateProfile(p: { name: string; email?: string }): Promise<void>;
  profile(): Promise<{ name: string; phone: string; email?: string; marketingOptIn?: boolean }>;
  rewards(): Promise<{ balance: number; entries: LedgerEntry[] }>;
  notifications(): Promise<InboxItem[]>;
  markNotificationRead(id: string): Promise<void>;
  setMarketingOptIn(optIn: boolean): Promise<void>;
  /** Links this phone's push token to the signed-in customer. Sent only after the customer allowed notifications. */
  registerDevice(token: string, platform: 'ios' | 'android'): Promise<void>;
  /** Unlinks a push token (sign-out), so the next person on the phone never receives this customer's updates. */
  unregisterDevice(token: string): Promise<void>;
  requestReturn(orderId: string, input: { kind: 'RETURN' | 'CANCELLATION'; reason: string; details?: string }): Promise<void>;
  returnRequests(): Promise<ReturnItem[]>;
}

export type InboxItem = { id: string; title: string; body: string; kind: string; readAt: string | null; createdAt: string };
export type ReturnItem = { id: string; orderNumber: string; kind: 'RETURN' | 'CANCELLATION'; status: string; reason: string; refundAmount?: number; createdAt: string };

/** Everything the UI needs from a backend. Mock and live implementations are interchangeable. */
export interface ShopApi {
  /** Present only when a real backend is connected. */
  account?: AccountApi;
  getCatalog(): Promise<Catalog>;
  capabilities(): Promise<Capabilities>;
  checkPincode(pincode: string): Promise<PincodeCheck>;
  placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult>;
  /** Simulated reconciliation of a pending payment. */
  reconcilePayment(orderId: string): Promise<{ status: 'paid' | 'failed' | 'pending' }>;
  uploadImage(uri: string): Promise<{ uri: string }>;
}

export const api: ShopApi = USE_MOCK_API ? mockApi : liveApi;
export const API_MODE = USE_MOCK_API ? 'mock' : 'live';
