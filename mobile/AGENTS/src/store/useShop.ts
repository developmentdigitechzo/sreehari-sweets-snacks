import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { DELIVERY_SLOTS } from '../data/config';
import { PRODUCTS } from '../data/seed';
import { buildOrder, nextStatus } from '../services/orders';
import { computeTotals } from '../services/pricing';
import type { Address, CartLine, ImageRef, LedgerEntry, LineOptions, Order, PricedLine, Profile, User } from '../types';
import { AddResult, addLine, lineKey, mergeAddresses, mergeCarts, setLineQty } from '../utils/cart';
import { uid } from '../utils/format';
import { api } from '../services/api';
import { session } from '../services/session';
import { toast } from './useToast';
import { useCatalog } from './useCatalog';

/* ------------------------------------------------------------------ slices */
/** Everything that belongs to one customer. Switched wholesale on login/logout. */
type UserSlice = {
  cart: CartLine[];
  wishlist: string[];
  addresses: Address[];
  selectedAddressId: string;
  slotId: string;
  /** Chosen delivery date (YYYY-MM-DD, India). null = today. A date in the past is treated as today. */
  deliveryDate: string | null;
  couponCode: string | null;
  redeemPoints: boolean;
  orders: Order[];
  profile: Profile;
  ledger: LedgerEntry[];
  notifications: { orders: boolean; offers: boolean };
};

const SLICE_KEYS: (keyof UserSlice)[] = ['cart', 'wishlist', 'addresses', 'selectedAddressId', 'slotId', 'deliveryDate', 'couponCode', 'redeemPoints', 'orders', 'profile', 'ledger', 'notifications'];

const daysAgo = (d: number) => new Date(Date.now() - d * 86400000).toISOString();

function priced(productId: string, variantLabel: string, qty: number): PricedLine {
  const product = PRODUCTS.find((p) => p.id === productId)!;
  const variant = product.variants.find((x) => x.label === variantLabel)!;
  return { product, variant, qty, lineMrp: variant.mrp * qty, linePrice: variant.price * qty };
}

const freshSlice = (user: User | null): UserSlice => ({
  cart: [],
  wishlist: [],
  addresses: [],
  selectedAddressId: '',
  slotId: 'express',
  deliveryDate: null,
  couponCode: null,
  redeemPoints: false,
  orders: [],
  profile: { name: user?.name ?? '', phone: user?.phone ?? '', email: user?.email ?? '' },
  ledger: [],
  notifications: { orders: true, offers: true },
});

/** The seeded demo customer used for client demos: has addresses, orders and reward points. */
function demoSlice(user: User): UserSlice {
  const home: Address = { id: 'addr-home', label: 'Home', name: 'Ramesh Kumar', phone: '+91 98765 43210', line1: 'No. 12, 3rd Street', area: 'Anna Nagar', city: 'Chennai', state: 'Tamil Nadu', pincode: '600040', isDefault: true };
  const office: Address = { id: 'addr-office', label: 'Office', name: 'Ramesh Kumar', phone: '+91 98765 43210', line1: 'Blue Tower, Mount Road', area: 'Guindy', city: 'Chennai', state: 'Tamil Nadu', pincode: '600032' };
  const coupon = { code: 'SHREE10', title: '', description: '', type: 'percent' as const, value: 10, minOrder: 499, maxDiscount: 100 };
  const l1 = [priced('mysore-pak', '250 g', 1), priced('motichoor-laddu', '500 g', 1), priced('mixture', '250 g', 2)];
  const live = buildOrder({
    number: 'SH12456', lines: l1, totals: computeTotals(l1, { coupon, slot: DELIVERY_SLOTS[0] }), address: home, slot: DELIVERY_SLOTS[0], coupon,
    method: 'upi', paymentStatus: 'paid', idempotencyKey: 'seed-1', createdAt: new Date(Date.now() - 25 * 60000).toISOString(), status: 'out_for_delivery',
  });
  const l0 = [priced('kaju-katli', '500 g', 1), priced('butter-murukku', '250 g', 1)];
  const old = buildOrder({
    number: 'SH12398', lines: l0, totals: computeTotals(l0, { slot: DELIVERY_SLOTS[1] }), address: office, slot: DELIVERY_SLOTS[1],
    method: 'cod', paymentStatus: 'paid', idempotencyKey: 'seed-0', createdAt: daysAgo(9), status: 'delivered',
  });
  return {
    ...freshSlice(user),
    wishlist: ['mysore-pak', 'kaju-katli', 'black-forest-cake'],
    addresses: [home, office],
    selectedAddressId: home.id,
    orders: [live, old],
    profile: { name: user.name, phone: user.phone, email: user.email ?? 'ramesh.demo@example.com' },
    ledger: [
      { id: 'l1', at: daysAgo(40), note: 'Welcome bonus (demo)', points: 100 },
      { id: 'l2', at: daysAgo(21), note: 'Earned on order SH12301 (demo)', points: 188 },
      { id: 'l3', at: daysAgo(9), note: 'Earned on order SH12398 (demo)', points: 65 },
      { id: 'l4', at: daysAgo(2), note: 'Referral bonus (demo)', points: 110 },
    ],
  };
}

const stockOf = (variantId: string) => {
  for (const p of useCatalog.getState().products) {
    const v = p.variants.find((x) => x.id === variantId);
    if (v) return v.stock;
  }
  return 20; // unknown variant: let revalidation at checkout decide
};

/* ------------------------------------------------------------------- state */
type ShopState = UserSlice & {
  hydrated: boolean;
  onboarded: boolean;
  ownerId: string; // 'guest' or a user id
  archive: Record<string, UserSlice>;
  recentSearches: string[];
  recentlyViewed: string[];
  imageOverrides: Record<string, ImageRef[]>;

  setOnboarded: () => void;
  switchOwner: (user: User | null) => void;
  /** Live mode: merge what the server already has for this customer into local state. */
  applyServerData: (d: { addresses?: Address[]; cart?: CartLine[] }) => void;
  /** Live mode: the server is the source of truth for orders, rewards and profile. */
  applyServerOrders: (orders: Order[]) => void;
  upsertOrder: (order: Order) => void;
  applyServerLedger: (entries: LedgerEntry[]) => void;
  updateProfileFromServer: (p: Partial<Profile>) => void;
  addToCart: (productId: string, variantId: string, qty?: number, options?: LineOptions) => AddResult;
  setQty: (lineKey: string, qty: number) => void;
  removeLine: (lineKey: string) => void;
  changeVariant: (oldLineKey: string, productId: string, newVariantId: string) => void;
  reorder: (orderId: string, variantLookup: (productId: string, label: string, sku?: string) => string | undefined) => number;
  cancelOrder: (id: string) => void;
  clearCart: () => void;
  toggleWishlist: (productId: string) => void;
  setCoupon: (code: string | null) => void;
  setRedeem: (on: boolean) => void;
  saveAddress: (a: Omit<Address, 'id'> & { id?: string }) => string;
  deleteAddress: (id: string) => void;
  selectAddress: (id: string) => void;
  setSlot: (id: string) => void;
  setDeliveryDate: (date: string | null) => void;
  addOrder: (o: Order) => void;
  advanceOrder: (id: string) => void;
  setOrderPayment: (id: string, status: Order['payment']['status']) => void;
  updateProfile: (p: Partial<Profile>) => void;
  addRecent: (q: string) => void;
  clearRecent: () => void;
  markViewed: (productId: string) => void;
  setImages: (productId: string, images: ImageRef[]) => void;
  setNotification: (k: 'orders' | 'offers', on: boolean) => void;
  resetDemo: () => void;
};

const sliceOf = (s: ShopState): UserSlice => Object.fromEntries(SLICE_KEYS.map((k) => [k, s[k]])) as unknown as UserSlice;

export const useShop = create<ShopState>()(
  persist(
    (set, get) => ({
      hydrated: false,
      onboarded: false,
      ownerId: 'guest',
      archive: {},
      recentSearches: ['Mysore pak', 'Laddu', 'Cake'],
      recentlyViewed: [],
      imageOverrides: {},
      ...freshSlice(null),

      setOnboarded: () => set({ onboarded: true }),

      /**
       * Sign in / out. The current slice is archived under its owner and the target slice is loaded.
       * Guest -> account merges the guest cart (no duplicate lines, stock-capped) and guest addresses.
       */
      switchOwner: (user) =>
        set((s) => {
          const archive = { ...s.archive, [s.ownerId]: sliceOf(s) };
          const targetId = user?.id ?? 'guest';
          if (targetId === s.ownerId) return s;
          let next = archive[targetId] ?? (user ? (user.isDemo && !api.account ? demoSlice(user) : freshSlice(user)) : freshSlice(null));
          if (user && s.ownerId === 'guest') {
            const guest = sliceOf(s);
            next = {
              ...next,
              cart: mergeCarts(guest.cart, next.cart, stockOf),
              addresses: mergeAddresses(next.addresses, guest.addresses),
              wishlist: [...new Set([...next.wishlist, ...guest.wishlist])],
            };
            if (!next.selectedAddressId && next.addresses[0]) next.selectedAddressId = next.addresses[0].id;
            archive.guest = freshSlice(null); // the guest cart now lives in the account
          }
          return { ...next, ownerId: targetId, archive };
        }),

      applyServerData: ({ addresses, cart }) =>
        set((s) => {
          const nextAddr = addresses ? mergeAddresses(addresses, s.addresses.filter((a) => !addresses.some((x) => x.id === a.id))) : s.addresses;
          return {
            addresses: nextAddr,
            selectedAddressId: s.selectedAddressId || nextAddr.find((a) => a.isDefault)?.id || nextAddr[0]?.id || '',
            cart: cart ? mergeCarts(s.cart, cart, stockOf, 'max') : s.cart,
          };
        }),

      applyServerOrders: (orders) => set({ orders }),
      upsertOrder: (order) => set((s) => ({ orders: s.orders.some((o) => o.id === order.id) ? s.orders.map((o) => (o.id === order.id ? order : o)) : [order, ...s.orders] })),
      applyServerLedger: (ledger) => set({ ledger }),
      updateProfileFromServer: (p) => set((s) => ({ profile: { ...s.profile, ...p } })),

      addToCart: (productId, variantId, qty = 1, options) => {
        const { lines, result } = addLine(get().cart, { productId, variantId, qty, options }, stockOf(variantId));
        if (result !== 'soldout') set({ cart: lines });
        return result;
      },
      /** key = lineKey(line): size + flavour + message. */
      setQty: (key, qty) =>
        set((s) => {
          const line = s.cart.find((l) => lineKey(l) === key);
          return line ? { cart: setLineQty(s.cart, key, qty, stockOf(line.variantId)) } : s;
        }),
      removeLine: (key) => set((s) => ({ cart: s.cart.filter((l) => lineKey(l) !== key) })),
      changeVariant: (oldKey, productId, newVariantId) =>
        set((s) => {
          const old = s.cart.find((l) => lineKey(l) === oldKey);
          if (!old || old.variantId === newVariantId) return s;
          const rest = s.cart.filter((l) => lineKey(l) !== oldKey);
          const { lines } = addLine(rest, { productId, variantId: newVariantId, qty: old.qty, options: old.options }, stockOf(newVariantId));
          return { cart: lines };
        }),
      reorder: (orderId, lookup) => {
        const order = get().orders.find((o) => o.id === orderId);
        let n = 0;
        order?.items.forEach((it) => {
          const vid = lookup(it.productId, it.variantLabel, it.sku);
          if (vid && get().addToCart(it.productId, vid, it.qty, it.options) !== 'soldout') n += 1;
        });
        return n;
      },
      cancelOrder: (id) =>
        set((s) => ({
          orders: s.orders.map((o) =>
            o.id === id && (o.status === 'placed' || o.status === 'confirmed')
              ? { ...o, status: 'cancelled' as const, events: [...o.events, { status: 'cancelled' as const, at: new Date().toISOString() }] }
              : o,
          ),
        })),
      clearCart: () => set({ cart: [], couponCode: null, redeemPoints: false }),

      toggleWishlist: (productId) =>
        set((s) => ({ wishlist: s.wishlist.includes(productId) ? s.wishlist.filter((i) => i !== productId) : [...s.wishlist, productId] })),

      setCoupon: (couponCode) => set({ couponCode }),
      setRedeem: (redeemPoints) => set({ redeemPoints }),

      saveAddress: (a) => {
        const id = a.id ?? uid('addr');
        set((s) => {
          const isFirst = s.addresses.length === 0;
          let list = s.addresses.some((x) => x.id === id) ? s.addresses.map((x) => (x.id === id ? { ...a, id } : x)) : [...s.addresses, { ...a, id, isDefault: a.isDefault || isFirst }];
          if (a.isDefault) list = list.map((x) => ({ ...x, isDefault: x.id === id }));
          return { addresses: list, selectedAddressId: id };
        });
        // Live backend: persist the confirmed address, then adopt the server's id. Failures keep the local copy.
        if (api.account && session.get()) {
          const local = get().addresses.find((x) => x.id === id);
          const serverId = a.id && !a.id.startsWith('addr') ? a.id : undefined;
          if (local) {
            api.account.saveAddress(local, serverId).then((saved) =>
              set((s) => ({
                addresses: s.addresses.map((x) => (x.id === id ? { ...saved } : x)),
                selectedAddressId: s.selectedAddressId === id ? saved.id : s.selectedAddressId,
              })),
            ).catch(() => { toast('Address saved on this phone only — we couldn’t reach the store. Please check your connection and save it again.', 'error'); });
          }
        }
        return id;
      },
      deleteAddress: (id) =>
        set((s) => {
          if (api.account && session.get() && !id.startsWith('addr')) api.account.deleteAddress(id).catch(() => { toast('Couldn’t remove this address from your account. It may reappear — please try again.', 'error'); });
          const addresses = s.addresses.filter((a) => a.id !== id);
          return { addresses, selectedAddressId: s.selectedAddressId === id ? addresses[0]?.id ?? '' : s.selectedAddressId };
        }),
      selectAddress: (selectedAddressId) => set({ selectedAddressId }),
      setSlot: (slotId) => set({ slotId }),
      setDeliveryDate: (deliveryDate) => set({ deliveryDate }),

      addOrder: (o) =>
        set((s) => {
          if (s.orders.some((x) => x.idempotencyKey === o.idempotencyKey)) return s; // never a duplicate order
          const earn = Math.floor(o.totals.total * 0.1);
          const ledger: LedgerEntry[] = [...s.ledger];
          // Live backend: rewards are recorded by the server and re-read after the order (see services/accountSync.ts).
          if (api.account) return { orders: [o, ...s.orders], cart: [], couponCode: null, redeemPoints: false };
          if (o.totals.rewardDiscount > 0) ledger.unshift({ id: uid('l'), at: o.createdAt, note: `Redeemed on order ${o.number} (demo)`, points: -o.totals.rewardDiscount * 10 });
          // Demo mode follows the server's rule: Cash on Delivery orders earn their points when delivered (see advanceOrder).
          if (o.payment.status === 'paid') ledger.unshift({ id: uid('l'), at: o.createdAt, note: `Earned on order ${o.number} (demo)`, points: earn });
          return { orders: [o, ...s.orders], ledger, cart: [], couponCode: null, redeemPoints: false };
        }),
      advanceOrder: (id) =>
        set((s) => {
          let ledger = s.ledger;
          const orders = s.orders.map((o) => {
            if (o.id !== id) return o;
            const next = nextStatus(o.status);
            if (!next) return o;
            let payment = o.payment;
            if (next === 'delivered' && o.payment.status === 'cod_due') {
              // Cash is collected at the door; points are earned on delivery (demo mode only: a live server does this itself).
              payment = { ...o.payment, status: 'paid' as const };
              if (!api.account) ledger = [{ id: uid('l'), at: new Date().toISOString(), note: `Earned on order ${o.number} (demo)`, points: Math.floor(o.totals.total * 0.1) }, ...ledger];
            }
            return { ...o, status: next, payment, events: [...o.events, { status: next, at: new Date().toISOString() }] };
          });
          return { orders, ledger };
        }),
      setOrderPayment: (id, status) => set((s) => ({ orders: s.orders.map((o) => (o.id === id ? { ...o, payment: { ...o.payment, status } } : o)) })),

      updateProfile: (p) => {
        set((s) => ({ profile: { ...s.profile, ...p } }));
        // Live backend: the store sees the same name/email. A failed save keeps the local edit and the next sign-in re-reads the server's copy.
        const { profile } = get();
        if (api.account && session.get()) api.account.updateProfile({ name: profile.name, email: profile.email || undefined }).catch(() => { toast('Profile saved on this phone only — we couldn’t reach the store. Please try again.', 'error'); });
      },
      addRecent: (q) => set((s) => ({ recentSearches: [q, ...s.recentSearches.filter((r) => r.toLowerCase() !== q.toLowerCase())].slice(0, 6) })),
      clearRecent: () => set({ recentSearches: [] }),
      markViewed: (productId) => set((s) => ({ recentlyViewed: [productId, ...s.recentlyViewed.filter((i) => i !== productId)].slice(0, 10) })),
      setImages: (productId, images) => set((s) => ({ imageOverrides: { ...s.imageOverrides, [productId]: images } })),
      setNotification: (k, on) => set((s) => ({ notifications: { ...s.notifications, [k]: on } })),

      /** Back to the demo customer's starting state (also used by "Reset demo data"). */
      resetDemo: () => {
        const demo = demoSlice({ id: 'demo-ramesh', name: 'Ramesh Kumar', phone: '+919876543210', isDemo: true });
        set((s) => (s.ownerId === 'demo-ramesh' ? { ...demo, onboarded: true } : { onboarded: true, archive: { ...s.archive, 'demo-ramesh': demo } }));
      },
    }),
    {
      name: 'shree-hari-poc-v2',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) =>
        Object.fromEntries(Object.entries(s).filter(([k, v]) => typeof v !== 'function' && k !== 'hydrated')) as unknown as ShopState,
      onRehydrateStorage: () => () => {
        useShop.setState({ hydrated: true });
      },
    },
  ),
);
