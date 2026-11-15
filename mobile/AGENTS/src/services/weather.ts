import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Ionicons } from '@expo/vector-icons';
import { USE_MOCK_API } from '../data/config';
import { API_URL } from '../config/api';

export type Place = { label: string; latitude: number; longitude: number };
export type Weather = {
  tempC: number;
  condition: string;
  icon: keyof typeof Ionicons.glyphMap;
  place: string;
  updatedAt: string; // ISO time the data was fetched
  source: 'open-meteo' | 'backend';
};

const TTL_MS = 15 * 60 * 1000;
const cacheKey = (p: Place) => `shree-hari-weather:${p.latitude.toFixed(2)},${p.longitude.toFixed(2)}`;

/** WMO weather codes -> short label + icon. */
function describe(code: number, isDay: boolean): { condition: string; icon: keyof typeof Ionicons.glyphMap } {
  if (code === 0) return { condition: isDay ? 'Sunny' : 'Clear', icon: isDay ? 'sunny' : 'moon' };
  if (code <= 2) return { condition: 'Partly cloudy', icon: isDay ? 'partly-sunny' : 'cloudy-night' };
  if (code === 3) return { condition: 'Cloudy', icon: 'cloud' };
  if (code === 45 || code === 48) return { condition: 'Foggy', icon: 'cloud' };
  if (code >= 51 && code <= 57) return { condition: 'Drizzle', icon: 'rainy' };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { condition: 'Rain', icon: 'rainy' };
  if (code >= 71 && code <= 77) return { condition: 'Snow', icon: 'snow' };
  if (code >= 95) return { condition: 'Thunderstorm', icon: 'thunderstorm' };
  return { condition: 'Fair', icon: 'partly-sunny' };
}

async function timeoutFetch(url: string, ms = 8000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}

/**
 * Real weather only. Mock mode calls Open-Meteo directly (no API key exists, so nothing secret ships in the app).
 * With the live backend, weather goes through the backend adapter so a keyed provider can be swapped in later.
 * Results are cached for 15 minutes; a stale cached value is returned only when the network fails, and it keeps its
 * original "updated" time so it is never passed off as fresh.
 */
export async function fetchWeather(place: Place, opts?: { force?: boolean }): Promise<Weather & { stale?: boolean }> {
  const key = cacheKey(place);
  let cached: Weather | null = null;
  try {
    const raw = await AsyncStorage.getItem(key);
    cached = raw ? (JSON.parse(raw) as Weather) : null;
    if (cached && !opts?.force && Date.now() - new Date(cached.updatedAt).getTime() < TTL_MS) return cached;
  } catch { /* ignore cache errors */ }

  try {
    let w: Weather;
    if (USE_MOCK_API) {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,weather_code,is_day&timezone=auto`;
      const res = await timeoutFetch(url);
      if (!res.ok) throw new Error(`Weather service error (${res.status})`);
      const j = await res.json();
      const cur = j.current;
      if (cur?.temperature_2m == null) throw new Error('Weather data unavailable');
      const d = describe(Number(cur.weather_code), cur.is_day === 1);
      w = { tempC: Math.round(cur.temperature_2m), ...d, place: place.label, updatedAt: new Date().toISOString(), source: 'open-meteo' };
    } else {
      const res = await timeoutFetch(`${API_URL}/weather?lat=${place.latitude}&lon=${place.longitude}&label=${encodeURIComponent(place.label)}`);
      if (!res.ok) throw new Error(`Weather service error (${res.status})`);
      w = { ...(await res.json()), source: 'backend' };
    }
    AsyncStorage.setItem(key, JSON.stringify(w)).catch(() => {});
    return w;
  } catch (e) {
    if (cached) return { ...cached, stale: true };
    throw e;
  }
}

/** City name -> coordinates (Open-Meteo geocoding, keyless). Returns null when nothing matches. */
export async function searchPlace(name: string): Promise<Place | null> {
  const q = name.trim();
  if (q.length < 2) return null;
  const res = await timeoutFetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=en&format=json`);
  if (!res.ok) throw new Error('Place search is unavailable right now');
  const j = await res.json();
  const r = j.results?.[0];
  if (!r) return null;
  return { label: [r.name, r.admin1].filter(Boolean).join(', '), latitude: r.latitude, longitude: r.longitude };
}
