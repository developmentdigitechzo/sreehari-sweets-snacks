import type { Address } from '../types';

export type DetectedAddress = Partial<Pick<Address, 'line1' | 'area' | 'city' | 'state' | 'pincode' | 'landmark'>>;

/** Why an address could not be filled in even though coordinates were read. */
export type AddressProblem = 'network' | 'no_result' | 'unavailable';

export type LocationResult =
  | { status: 'ok'; latitude: number; longitude: number; accuracy?: number; address?: DetectedAddress; addressProblem?: AddressProblem; source?: 'backend' | 'device' }
  | { status: 'denied' | 'blocked' | 'disabled' | 'unavailable' | 'timeout' | 'error'; message: string };

/** The slice of expo-location we use. Injected so every state can be tested without a device. */
export interface LocationApi {
  hasServicesEnabledAsync(): Promise<boolean>;
  getForegroundPermissionsAsync(): Promise<{ status: string; canAskAgain: boolean }>;
  requestForegroundPermissionsAsync(): Promise<{ status: string; canAskAgain: boolean }>;
  getLastKnownPositionAsync?(): Promise<{ coords: { latitude: number; longitude: number; accuracy?: number | null } } | null>;
  getCurrentPositionAsync(opts: { accuracy: number }): Promise<{ coords: { latitude: number; longitude: number; accuracy: number | null } }>;
}

export type ReverseResult = { address?: DetectedAddress; problem?: AddressProblem; source?: 'backend' | 'device' };
export type ReverseFn = (latitude: number, longitude: number) => Promise<ReverseResult>;

export const LOCATION_MESSAGES = {
  denied: 'Location permission was not granted. You can try again, or enter your address manually.',
  blocked: 'Location access is blocked for this app. Turn it on in Settings, or enter your address manually.',
  disabled: 'Location services are turned off on this device. Turn them on in Settings, or enter your address manually.',
  unavailable: 'We could not get a GPS signal. Move to an open area and try again, or enter your address manually.',
  timeout: 'Finding your location took too long. Try again, or enter your address manually.',
  error: 'Something went wrong while finding your location. Please enter your address manually.',
} as const;

const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'TIMEOUT' })), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });

/**
 * One-shot, foreground-only location lookup, run only when the customer taps "Use current location".
 * Every outcome is a distinct, truthful state. Coordinates are returned exactly as measured and are never invented.
 * Reverse geocoding failure does NOT discard the coordinates: the customer fills in the address by hand.
 */
export async function detectCurrentLocation(
  api: LocationApi,
  reverse: ReverseFn,
  opts: { timeoutMs?: number; accuracy?: number; checkServices?: boolean } = {},
): Promise<LocationResult> {
  const { timeoutMs = 20_000, accuracy = 3, checkServices = true } = opts;
  try {
    if (checkServices && !(await api.hasServicesEnabledAsync())) return { status: 'disabled', message: LOCATION_MESSAGES.disabled };
    let perm = await api.getForegroundPermissionsAsync();
    if (perm.status !== 'granted') perm = await api.requestForegroundPermissionsAsync();
    if (perm.status !== 'granted') {
      return perm.canAskAgain ? { status: 'denied', message: LOCATION_MESSAGES.denied } : { status: 'blocked', message: LOCATION_MESSAGES.blocked };
    }
    let pos;
    try {
      try {
        pos = await withTimeout(api.getCurrentPositionAsync({ accuracy }), timeoutMs);
      } catch (first) {
        // No precise fix (indoors, emulator, cold GPS): try the last known position, then a coarse network-based fix.
        pos = (await api.getLastKnownPositionAsync?.().catch(() => null)) ?? undefined;
        if (!pos) pos = await withTimeout(api.getCurrentPositionAsync({ accuracy: Math.min(accuracy, 2) }), Math.min(timeoutMs, 10_000)).catch(() => undefined);
        if (!pos) throw first;
      }
    } catch (e) {
      const code = (e as { code?: string }).code ?? '';
      if (code === 'TIMEOUT' || /timeout|timed out/i.test((e as Error).message)) return { status: 'timeout', message: LOCATION_MESSAGES.timeout };
      if (/E_LOCATION_(UNAVAILABLE|SETTINGS_UNSATISFIED)|unavailable|provider/i.test(`${code} ${(e as Error).message}`)) return { status: 'unavailable', message: LOCATION_MESSAGES.unavailable };
      return { status: 'error', message: LOCATION_MESSAGES.error };
    }
    const { latitude, longitude, accuracy: acc } = pos.coords;
    let geo: ReverseResult;
    try {
      geo = await reverse(latitude, longitude);
    } catch {
      geo = { problem: 'unavailable' };
    }
    return { status: 'ok', latitude, longitude, accuracy: acc ?? undefined, address: geo.address, addressProblem: geo.problem, source: geo.source };
  } catch {
    return { status: 'error', message: LOCATION_MESSAGES.error };
  }
}

export const ADDRESS_PROBLEM_NOTES: Record<AddressProblem, string> = {
  network: 'We found your position but could not look up the address because the internet connection failed. Please fill in the details below.',
  no_result: 'We found your position but no street address for it. Please fill in the details below.',
  unavailable: 'Address lookup is not available right now. Your coordinates were captured; please fill in the address below.',
};
