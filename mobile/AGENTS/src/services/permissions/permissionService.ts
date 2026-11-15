import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Linking, Platform } from 'react-native';
import { usePermissionPrompt } from '../../store/usePermissionPrompt';
import { cameraAdapter } from './cameraPermission';
import { locationAdapter } from './locationPermission';
import { notificationAdapter } from './notificationPermission';
import { toState } from './logic';
import type { EnsureResult, PermissionAdapter, PermissionInfo, PermissionKind } from './types';

export { toState } from './logic';
export type { EnsureResult, PermissionInfo, PermissionKind, PermissionState } from './types';

const ADAPTERS: Record<PermissionKind, PermissionAdapter> = {
  location: locationAdapter,
  camera: cameraAdapter,
  notifications: notificationAdapter,
};

/* ------------------------------------------------------------ what was granted before (to notice a revoke) */
const MEMORY_KEY = 'shree-hari-permissions-granted';
async function readMemory(): Promise<Partial<Record<PermissionKind, boolean>>> {
  try { return JSON.parse((await AsyncStorage.getItem(MEMORY_KEY)) ?? '{}'); } catch { return {}; }
}
async function remember(kind: PermissionKind, granted: boolean) {
  try {
    const m = await readMemory();
    if (!!m[kind] === granted) return;
    await AsyncStorage.setItem(MEMORY_KEY, JSON.stringify({ ...m, [kind]: granted }));
  } catch { /* the memory only improves wording; losing it is harmless */ }
}

/** The current state, read from the OS without asking. Safe to call as often as needed. */
export async function getPermission(kind: PermissionKind): Promise<PermissionInfo> {
  const adapter = ADAPTERS[kind];
  try {
    if (adapter.isAvailable && !(await adapter.isAvailable())) return { state: 'unavailable', canAskAgain: false, revoked: false };
    const raw = await adapter.get();
    const state = toState(raw);
    const mem = await readMemory();
    const revoked = state !== 'granted' && !!mem[kind];
    if (state === 'granted' && !mem[kind]) await remember(kind, true);
    return { state, canAskAgain: raw.canAskAgain !== false && state !== 'blocked', revoked };
  } catch {
    return { state: 'unavailable', canAskAgain: false, revoked: false };
  }
}

/** Shows the OS prompt. Call only after the customer has seen the explanation and chosen to continue. */
export async function requestPermission(kind: PermissionKind): Promise<PermissionInfo> {
  const adapter = ADAPTERS[kind];
  try {
    const raw = await adapter.request();
    const state = toState(raw);
    await remember(kind, state === 'granted');
    return { state, canAskAgain: raw.canAskAgain !== false && state !== 'blocked', revoked: false };
  } catch {
    return { state: 'unavailable', canAskAgain: false, revoked: false };
  }
}

export const openAppSettings = () => Linking.openSettings().catch(() => {});

/** Runs `cb` each time the app returns to the foreground (for example back from Settings). Returns an unsubscribe. */
export function onAppForeground(cb: () => void): () => void {
  const sub = AppState.addEventListener('change', (s) => s === 'active' && cb());
  return () => sub.remove();
}

/* -------------------------------------------------------------------------------- the explain-then-ask flow */
export const PERMISSION_COPY: Record<PermissionKind, { icon: 'location-outline' | 'camera-outline' | 'notifications-outline'; title: string; why: string; fallback: string; settingsFeature: string }> = {
  location: {
    icon: 'location-outline',
    title: 'Use your current location?',
    why: 'Shree Hari reads your location once, only now, to fill in your delivery address. It is never tracked in the background, and nothing is saved until you confirm.',
    fallback: 'You can always type your address instead.',
    settingsFeature: 'Location',
  },
  camera: {
    icon: 'camera-outline',
    title: 'Take a photo?',
    why: 'Shree Hari uses your camera only to take the photo you ask for. It stays on this device until you look at it and confirm.',
    fallback: 'You can choose a photo from your library instead; that needs no permission.',
    settingsFeature: 'Camera',
  },
  notifications: {
    icon: 'notifications-outline',
    title: 'Get order updates?',
    why: 'We will tell you when your order is confirmed, on its way and delivered, and about refunds. Offers are separate and stay off unless you turn them on.',
    fallback: 'You can still follow every order under Orders.',
    settingsFeature: 'Notifications',
  },
};

export const settingsPath = (kind: PermissionKind) =>
  Platform.OS === 'ios' ? `Settings › Shree Hari › ${PERMISSION_COPY[kind].settingsFeature}` : `Settings › Apps › Shree Hari › Permissions › ${PERMISSION_COPY[kind].settingsFeature}`;

let pending: Promise<EnsureResult> | null = null;

/**
 * The single entry point for a feature that needs a permission:
 * granted -> returns at once, no UI.  Not yet allowed -> a short explanation, then (only on Continue) the OS prompt.
 * Blocked -> an explanation with Open Settings; when the customer comes back from Settings the state is rechecked.
 * The customer is only ever asked because they tapped something that needs it. A second call while a prompt is open
 * joins the first one, so the same question is never shown twice.
 */
export function ensurePermission(kind: PermissionKind): Promise<EnsureResult> {
  if (pending) return pending;
  pending = (async (): Promise<EnsureResult> => {
    const info = await getPermission(kind);
    if (info.state === 'granted') return 'granted';
    if (info.state === 'unavailable' || info.state === 'restricted') return 'unavailable';
    return new Promise<EnsureResult>((resolve) => {
      usePermissionPrompt.getState().open({ kind, phase: info.state === 'blocked' ? 'settings' : 'rationale', revoked: info.revoked, busy: false, resolve });
    });
  })().finally(() => { pending = null; });
  return pending;
}

const finish = (r: EnsureResult) => {
  const p = usePermissionPrompt.getState().prompt;
  usePermissionPrompt.getState().close();
  p?.resolve(r);
};

/** The customer tapped Continue on the explanation. */
export async function acceptPrompt() {
  const p = usePermissionPrompt.getState().prompt;
  if (!p || p.busy) return;
  usePermissionPrompt.getState().patch({ busy: true });
  const info = await requestPermission(p.kind);
  if (info.state === 'granted') return finish('granted');
  if (info.state === 'unavailable') return finish('unavailable');
  finish(info.state === 'blocked' ? 'blocked' : 'denied');
}

/** Not now / closed. */
export const declinePrompt = () => finish('dismissed');

/** Open Settings, then wait for the customer to return. */
export function openSettingsFromPrompt() {
  usePermissionPrompt.getState().patch({ phase: 'waiting' });
  openAppSettings();
}

/** Called when the app returns to the foreground: if the customer turned the permission on in Settings, carry on. */
export async function recheckPrompt() {
  const p = usePermissionPrompt.getState().prompt;
  if (!p || p.phase === 'rationale') return;
  const info = await getPermission(p.kind);
  if (info.state === 'granted') finish('granted');
  else usePermissionPrompt.getState().patch({ phase: 'settings', revoked: info.revoked });
}
