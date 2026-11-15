import type React from 'react';
import { MAP_PROVIDER } from '../data/config';

/**
 * Map integration seam. A provider renders a preview with a draggable pin and reports the moved coordinates.
 * Only 'none' exists today: the UI then says plainly that no map is configured instead of faking one.
 *
 * To add a real provider (e.g. react-native-maps with Google/Apple maps, or Mapbox):
 *   1. install it with `npx expo install`, add its API key to the build config (never in source),
 *   2. implement MapProviderComponent below,
 *   3. register it in PROVIDERS and set EXPO_PUBLIC_MAP_PROVIDER.
 * Reverse geocoding (coordinates -> address) is a separate adapter: services/location.ts (device) and backend/geocode.
 */
export type LatLng = { latitude: number; longitude: number };

export type MapProviderComponent = (props: { value: LatLng; onChange: (next: LatLng) => void }) => React.ReactElement;

export const PROVIDERS: Record<string, MapProviderComponent | undefined> = {
  none: undefined,
};

export const activeMapProvider = () => PROVIDERS[MAP_PROVIDER];
export const mapProviderName = MAP_PROVIDER;
