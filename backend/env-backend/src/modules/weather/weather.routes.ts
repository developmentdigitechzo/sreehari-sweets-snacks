import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { AppError } from '../../utils/errors.js';

export const weatherRouter = Router();

const query = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
  label: z.string().max(80).default(''),
});

type Cached = { at: number; body: { tempC: number; condition: string; icon: string; place: string; updatedAt: string } };
const cache = new Map<string, Cached>();
const TTL_MS = 10 * 60 * 1000;

function describe(code: number, isDay: boolean): { condition: string; icon: string } {
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

/**
 * Weather adapter. Today it reads Open-Meteo (no key needed). To switch to a keyed provider, change only this file;
 * the key stays on the server and never reaches the mobile app. Results are cached for 10 minutes per ~1 km cell.
 * Never returns invented data: a provider failure is a 502, which the app shows as "weather unavailable".
 */
weatherRouter.get('/weather', rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false }), async (req, res) => {
  const { lat, lon, label } = query.parse(req.query);
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) {
    res.json({ ...hit.body, place: label || hit.body.place });
    return;
  }
  let json: { current?: { temperature_2m?: number; weather_code?: number; is_day?: number } };
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,is_day&timezone=auto`;
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(String(r.status));
    json = (await r.json()) as typeof json;
  } catch {
    throw new AppError(502, 'Weather provider is unavailable right now.', 'WEATHER_UNAVAILABLE');
  }
  const cur = json.current;
  if (cur?.temperature_2m == null) throw new AppError(502, 'Weather data unavailable.', 'WEATHER_UNAVAILABLE');
  const d = describe(Number(cur.weather_code), cur.is_day === 1);
  const body = { tempC: Math.round(cur.temperature_2m), ...d, place: label, updatedAt: new Date().toISOString() };
  cache.set(key, { at: Date.now(), body });
  res.json(body);
});
