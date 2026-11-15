import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { USE_MOCK_API } from '../data/config';
import { resolveApiUrl } from './apiUrl';

/** The computer serving the app's JavaScript while developing (its LAN address), so a phone finds the local backend on any Wi-Fi. */
function devServerHost(): string | null {
  if (Platform.OS === 'web') return typeof window !== 'undefined' ? window.location.hostname : null;
  const hostUri = Constants.expoConfig?.hostUri; // for example "192.168.1.3:8081"
  return hostUri ? hostUri.split(':')[0] ?? null : null;
}

/**
 * The backend address, chosen by environment: see ./apiUrl.ts and docs/ENVIRONMENTS.md.
 * Expo only inlines EXPO_PUBLIC_* variables written exactly like this, so each one is read by name.
 * Kept apart from data/config.ts, which must stay free of React Native imports so unit tests can load it.
 */
function chooseApiUrl(): string {
  try {
    // When running in production on the web (e.g. Vercel), route through the same-origin proxy (/api-proxy).
    // This completely bypasses any cPanel/hosting preflight CORS restrictions while communicating directly with cPanel.
    if (Platform.OS === 'web' && !__DEV__ && typeof window !== 'undefined') {
      return `${window.location.origin}/api-proxy`;
    }

    const r = resolveApiUrl({
      isDev: __DEV__,
      override: process.env.EXPO_PUBLIC_API_URL,
      local: process.env.EXPO_PUBLIC_API_URL_LOCAL,
      production: process.env.EXPO_PUBLIC_API_URL_PRODUCTION,
      port: process.env.EXPO_PUBLIC_API_PORT,
      devHost: devServerHost(),
    });
    if (r.warning) console.warn(`[config] ${r.warning}`);
    return r.url;
  } catch (e) {
    // Demo mode never calls the backend, so a missing address must not stop it. With a live backend, fail loudly.
    if (USE_MOCK_API) return '';
    throw e;
  }
}

export const API_URL = chooseApiUrl();
