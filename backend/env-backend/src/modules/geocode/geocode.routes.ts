import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { requireAuth } from '../../middleware/auth.js';
import { AppError } from '../../utils/errors.js';
import { googleReverseGeocode } from './google.js';

export const geocodeRouter = Router();

const query = z.object({ lat: z.coerce.number().min(-90).max(90), lon: z.coerce.number().min(-180).max(180) });

/**
 * GPS -> address. Behaviour:
 *   GEOCODER_PROVIDER=none   -> 501 GEOCODER_NOT_CONFIGURED (never an invented address)
 *   GEOCODER_PROVIDER=google -> real address, 404 when nothing is found, 502 when the provider fails
 * Coordinates are never logged.
 */
geocodeRouter.get('/geocode/reverse', requireAuth, async (req, res) => {
  const { lat, lon } = query.parse(req.query);
  if (env.GEOCODER_PROVIDER === 'google' && env.GOOGLE_MAPS_API_KEY) {
    res.json(await googleReverseGeocode(lat, lon, env.GOOGLE_MAPS_API_KEY));
    return;
  }
  throw new AppError(501, 'Address lookup from GPS is not configured on this server. Please enter the address manually.', 'GEOCODER_NOT_CONFIGURED');
});
