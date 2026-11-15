import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from '../api';
import { session } from '../session';
import type { PermissionAdapter } from './types';

/* ------------------------------------------------------------------------- permission */
export const notificationAdapter: PermissionAdapter = {
  isAvailable: () => Platform.OS !== 'web',
  get: () => Notifications.getPermissionsAsync(),
  request: async () => {
    await ensureAndroidChannels(); // on Android 13+ the prompt only appears once a channel exists
    return Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: true, allowSound: true } });
  },
};

/* ------------------------------------------------------------- channels and foreground behaviour */
export const CHANNELS = { orders: 'orders', offers: 'offers' } as const;

/** Order updates (essential service messages) and offers (promotional) are separate channels, so each can be managed on its own in system settings. */
export async function ensureAndroidChannels() {
  if (Platform.OS !== 'android') return;
  // AndroidImportance is a real runtime export; the lint rule cannot follow the package's `export *`.
  /* eslint-disable import/namespace */
  await Notifications.setNotificationChannelAsync(CHANNELS.orders, { name: 'Order updates', description: 'Order placed, confirmed, on the way, delivered, cancellations and refunds', importance: Notifications.AndroidImportance.HIGH });
  await Notifications.setNotificationChannelAsync(CHANNELS.offers, { name: 'Offers and news', description: 'Approved offers and campaigns. Only if you opted in.', importance: Notifications.AndroidImportance.DEFAULT });
  /* eslint-enable import/namespace */
}

/** While the app is open a notification is shown as a banner and added to the list; no sound, no badge. */
export function configureNotifications() {
  if (Platform.OS === 'web') return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
  ensureAndroidChannels().catch(() => {});
}

/* --------------------------------------------------------------------------- push token */
export function expoProjectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
}

export type TokenResult = { ok: true; token: string } | { ok: false; reason: 'permission' | 'no_project' | 'unavailable' | 'network'; message: string };

/** Reads the Expo push token. Never asks for permission: the customer must already have allowed notifications. */
export async function getPushToken(): Promise<TokenResult> {
  if (Platform.OS === 'web') return { ok: false, reason: 'unavailable', message: 'Push notifications are not available on the web.' };
  const perm = await Notifications.getPermissionsAsync();
  if (!perm.granted) return { ok: false, reason: 'permission', message: 'Notifications are not allowed on this device.' };
  const projectId = expoProjectId();
  if (!projectId) return { ok: false, reason: 'no_project', message: 'This build has no Expo project ID, so push tokens cannot be issued. Set it with `eas init` or EXPO_PUBLIC_EAS_PROJECT_ID.' };
  try {
    await ensureAndroidChannels();
    const t = await Notifications.getExpoPushTokenAsync({ projectId });
    return { ok: true, token: t.data };
  } catch (e) {
    const msg = String((e as Error).message ?? '');
    return { ok: false, reason: /network|internet|offline|timed? ?out/i.test(msg) ? 'network' : 'unavailable', message: 'Could not get a push token from this device right now.' };
  }
}

/* -------------------------------------------------------------- registering the device with the store */
const STORED_KEY = 'shree-hari-push-registration';
type Stored = { token: string; userId: string };

async function readStored(): Promise<Stored | null> {
  try { return JSON.parse((await SecureStore.getItemAsync(STORED_KEY)) ?? 'null'); } catch { return null; }
}
async function writeStored(v: Stored | null) {
  try { if (v) await SecureStore.setItemAsync(STORED_KEY, JSON.stringify(v)); else await SecureStore.deleteItemAsync(STORED_KEY); } catch { /* best effort */ }
}

export type SyncResult = 'registered' | 'unchanged' | 'skipped';

/**
 * Keeps the server's copy of this device's push token current. Runs at sign-in, at app start and whenever the app returns
 * to the foreground or the OS rotates the token. It only talks to the server when the token or the signed-in customer
 * changed, never prompts, and does nothing when notifications are not allowed. The token is sent over HTTPS to the
 * customer's own account and is never logged.
 */
export async function syncPushRegistration(userId: string | undefined): Promise<SyncResult> {
  if (!api.account || !session.get() || !userId) return 'skipped';
  const t = await getPushToken();
  if (!t.ok) return 'skipped';
  const stored = await readStored();
  if (stored?.token === t.token && stored.userId === userId) return 'unchanged';
  try {
    await api.account.registerDevice(t.token, Platform.OS === 'ios' ? 'ios' : 'android');
    await writeStored({ token: t.token, userId });
    return 'registered';
  } catch {
    return 'skipped'; // retried on the next foreground
  }
}

/** On sign-out the token stops belonging to this customer, so the next person on the phone never receives their updates. Call BEFORE the session is cleared. */
export async function unregisterPushDevice() {
  const stored = await readStored();
  if (!stored) return;
  try { if (api.account && session.get()) await api.account.unregisterDevice(stored.token); } catch { /* best effort */ }
  await writeStored(null);
}

/* tap navigation lives in logic.ts so it can be tested without a device */
export { routeForNotification } from './logic';
export type { NotificationTarget } from './logic';

export { Notifications };
