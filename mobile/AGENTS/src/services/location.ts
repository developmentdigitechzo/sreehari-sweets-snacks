import * as Location from 'expo-location';
import { Linking, Platform } from 'react-native';
import { api } from './api';
import { session } from './session';
import { detectCurrentLocation as detect, type DetectedAddress, type LocationResult, type ReverseFn, type ReverseResult } from './locationCore';

export type { DetectedAddress, LocationResult } from './locationCore';

/** Device geocoder (iOS CLGeocoder / Android Geocoder). Needs a data connection; unsupported on web. */
async function deviceReverse(latitude: number, longitude: number): Promise<ReverseResult> {
  try {
    const [r] = await Location.reverseGeocodeAsync({ latitude, longitude });
    if (!r) return { problem: 'no_result', source: 'device' };
    const line1 = [r.name && r.name !== r.street ? r.name : undefined, r.street].filter(Boolean).join(', ');
    const address: DetectedAddress = {
      line1: line1 || undefined,
      area: r.district ?? r.subregion ?? undefined,
      city: r.city ?? r.subregion ?? undefined,
      state: r.region ?? undefined,
      pincode: r.postalCode ?? undefined,
    };
    return { address, source: 'device' };
  } catch (e) {
    const msg = String((e as Error).message ?? '');
    return { problem: /network|internet|offline|unreachable|timed? ?out/i.test(msg) ? 'network' : 'unavailable', source: 'device' };
  }
}

/**
 * Reverse geocoding strategy: the backend provider when a signed-in customer is on the live API and it is configured
 * (consistent results, key stays server-side); otherwise the device geocoder. A backend "not configured" or outage silently
 * falls back to the device, a backend "no result" is reported as such.
 */
const reverse: ReverseFn = async (latitude, longitude) => {
  if (api.account?.reverseGeocode && session.get()) {
    const r = await api.account.reverseGeocode(latitude, longitude);
    if (r.kind === 'ok') return { address: r.address, source: 'backend' };
    if (r.kind === 'no_result') return { problem: 'no_result', source: 'backend' };
    if (r.kind === 'network') return { problem: 'network', source: 'backend' };
    // not_configured | unavailable -> try the device
  }
  return deviceReverse(latitude, longitude);
};

export const detectCurrentLocation = (): Promise<LocationResult> =>
  detect(
    {
      hasServicesEnabledAsync: () => Location.hasServicesEnabledAsync(),
      getForegroundPermissionsAsync: () => Location.getForegroundPermissionsAsync(),
      requestForegroundPermissionsAsync: () => Location.requestForegroundPermissionsAsync(),
      getLastKnownPositionAsync: () => Location.getLastKnownPositionAsync(),
      getCurrentPositionAsync: (o) => Location.getCurrentPositionAsync({ accuracy: o.accuracy as Location.LocationAccuracy }),
    },
    reverse,
    { checkServices: Platform.OS !== 'web', accuracy: Location.Accuracy.Balanced },
  );

export const openAppSettings = () => Linking.openSettings().catch(() => {});
