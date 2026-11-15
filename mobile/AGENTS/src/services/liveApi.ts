import { API_URL } from '../config/api';
import { session } from './session';
import type { Address, CartLine, LedgerEntry, Order } from '../types';
import { NO_CAPABILITIES, type AccountApi, type Capabilities, type Catalog, type InboxItem, type ReturnItem, type PlaceOrderInput, type PlaceOrderResult, type ShopApi } from './api';

/** The signed-in customer's token comes from the auth store (OS keychain). No token => the user must sign in. */
function ensureToken(): string {
  const token = session.get();
  if (!token) throw new Error('Please sign in to continue');
  return token;
}

async function http<T>(path: string, init?: RequestInit & { auth?: boolean }): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...((init?.headers as Record<string, string>) ?? {}) };
  if (init?.auth) headers.Authorization = `Bearer ${ensureToken()}`;
  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (res.status === 401 && init?.auth) {
    session.rejected(); // the token is no longer valid: sign the customer out cleanly instead of failing on every screen
    throw new Error('Your session ended. Please sign in again.');
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.message ?? `Request failed (${res.status})`);
  return body as T;
}

const account: AccountApi = {
  addresses: () => http<Address[]>('/me/addresses', { auth: true }),
  saveAddress: (a, serverId) =>
    http<Address>(serverId ? `/me/addresses/${serverId}` : '/me/addresses', { method: serverId ? 'PUT' : 'POST', auth: true, body: JSON.stringify({ ...a, id: undefined }) }),
  async deleteAddress(id) {
    await fetch(`${API_URL}/me/addresses/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${ensureToken()}` } });
  },
  async cart() {
    const r = await http<{ items: CartLine[] }>('/me/cart', { auth: true });
    return r.items;
  },
  async reverseGeocode(latitude, longitude) {
    try {
      const res = await fetch(`${API_URL}/geocode/reverse?lat=${latitude}&lon=${longitude}`, { headers: { Authorization: `Bearer ${ensureToken()}` } });
      if (res.ok) return { kind: 'ok', address: await res.json() };
      const code = (await res.json().catch(() => ({})))?.error?.code;
      if (res.status === 501 || code === 'GEOCODER_NOT_CONFIGURED') return { kind: 'not_configured' };
      if (res.status === 404) return { kind: 'no_result' };
      return { kind: 'unavailable' };
    } catch {
      return { kind: 'network' };
    }
  },
  paymentStatus: (orderId) => http(`/payments/${orderId}/status`, { auth: true }),
  cancelPayment: (orderId) => http(`/payments/${orderId}/cancel`, { method: 'POST', auth: true }),
  cancelOrder: (orderId) => http<Order>(`/orders/${encodeURIComponent(orderId)}/cancel`, { method: 'POST', auth: true }),
  orders: () => http<Order[]>('/orders', { auth: true }),
  order: (id) => http<Order>(`/orders/${encodeURIComponent(id)}`, { auth: true }),
  profile: () => http<{ name: string; phone: string; email?: string; marketingOptIn?: boolean }>('/me', { auth: true }),
  async updateProfile(p) {
    await http('/me', { method: 'PATCH', auth: true, body: JSON.stringify(p) });
  },
  rewards: () => http<{ balance: number; entries: LedgerEntry[] }>('/me/rewards', { auth: true }),
  async notifications() {
    return (await http<{ items: InboxItem[] }>('/me/notifications', { auth: true })).items;
  },
  async markNotificationRead(id) {
    await fetch(`${API_URL}/me/notifications/${encodeURIComponent(id)}/read`, { method: 'POST', headers: { Authorization: `Bearer ${ensureToken()}` } });
  },
  async setMarketingOptIn(optIn) {
    await http('/me/marketing', { method: 'PUT', auth: true, body: JSON.stringify({ optIn }) });
  },
  async registerDevice(token, platform) {
    await http('/me/devices', { method: 'POST', auth: true, body: JSON.stringify({ token, platform }) });
  },
  async unregisterDevice(token) {
    await http('/me/devices', { method: 'DELETE', auth: true, body: JSON.stringify({ token }) });
  },
  async requestReturn(orderId, input) {
    await http(`/orders/${encodeURIComponent(orderId)}/return-requests`, { method: 'POST', auth: true, body: JSON.stringify(input) });
  },
  async returnRequests() {
    return (await http<{ items: ReturnItem[] }>('/me/return-requests', { auth: true })).items;
  },
  async saveCart(lines) {
    await http('/me/cart', { method: 'PUT', auth: true, body: JSON.stringify({ items: lines.map((l) => ({ variantId: l.variantId, qty: l.qty, options: l.options })) }) });
  },
};

/** Talks to backend/ (Express + PostgreSQL). Enable with EXPO_PUBLIC_USE_MOCK=false. */
export const liveApi: ShopApi = {
  account,
  getCatalog: () => http<Catalog>('/catalog'),
  async capabilities(): Promise<Capabilities> {
    try {
      return await http<Capabilities>('/capabilities');
    } catch {
      return NO_CAPABILITIES; // unreachable server: offer nothing optional
    }
  },
  checkPincode: (pincode) => http(`/serviceability/${encodeURIComponent(pincode)}`),
  async placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
    try {
      const res = await fetch(`${API_URL}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ensureToken()}`, 'Idempotency-Key': input.idempotencyKey },
        body: JSON.stringify(input),
      });
      const body = await res.json().catch(() => ({}));
      if (body?.outcome === 'failure') return { outcome: 'failure', message: body.message };
      if (!res.ok) return { outcome: 'failure', message: body?.error?.message ?? `Request failed (${res.status})` };
      return body as PlaceOrderResult;
    } catch (e) {
      return { outcome: 'failure', message: (e as Error).message };
    }
  },
  reconcilePayment: (orderId) => http(`/orders/${orderId}/reconcile`, { method: 'POST', auth: true }),
  async uploadImage(uri) {
    const blob = await (await fetch(uri)).blob();
    const res = await fetch(`${API_URL}/uploads`, {
      method: 'POST',
      headers: { 'Content-Type': blob.type || 'image/jpeg', Authorization: `Bearer ${ensureToken()}` },
      body: blob,
    });
    if (!res.ok) throw new Error('Upload failed');
    return (await res.json()) as { uri: string };
  },
};
