import * as Location from 'expo-location';
import { Platform } from 'react-native';
import type { PermissionAdapter } from './types';

/** Foreground ("while using the app") location only. Background location is never requested: no feature needs it. */
export const locationAdapter: PermissionAdapter = {
  get: () => Location.getForegroundPermissionsAsync(),
  request: () => Location.requestForegroundPermissionsAsync(),
};

/** Is the device's location switch on? Separate from the app's permission: both must be true to read a position. */
export async function locationServicesEnabled(): Promise<boolean> {
  if (Platform.OS === 'web') return true;
  try { return await Location.hasServicesEnabledAsync(); } catch { return false; }
}
