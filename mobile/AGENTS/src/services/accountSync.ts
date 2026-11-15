import { useShop } from '../store/useShop';
import { api } from './api';
import { session } from './session';

/**
 * Live backend only: pull what the store and the server decided (order status, payments, rewards, profile) into the app.
 * All of these are safe to call at any time; when offline or signed out they do nothing.
 */
const ready = () => !!api.account && !!session.get();

export async function refreshOrders() {
  if (!ready()) return;
  useShop.getState().applyServerOrders(await api.account!.orders());
}

/** Re-read a single order (used while the tracking screen is open). */
export async function refreshOrder(id: string) {
  if (!ready()) return;
  useShop.getState().upsertOrder(await api.account!.order(id));
}

export async function refreshRewards() {
  if (!ready()) return;
  useShop.getState().applyServerLedger((await api.account!.rewards()).entries);
}

export async function refreshProfile() {
  if (!ready()) return;
  const p = await api.account!.profile();
  useShop.getState().updateProfileFromServer({ name: p.name, phone: p.phone, email: p.email ?? '' });
  // Marketing messages are opt-in: the switch shows what the server holds (off until the customer turns it on).
  if (p.marketingOptIn !== undefined) useShop.getState().setNotification('offers', p.marketingOptIn);
}

export async function refreshAll() {
  await Promise.allSettled([refreshOrders(), refreshRewards(), refreshProfile()]);
}
