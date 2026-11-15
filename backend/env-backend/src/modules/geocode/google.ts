import { AppError } from '../../utils/errors.js';

export type GeocodedAddress = { line1?: string; area?: string; city?: string; state?: string; pincode?: string; formatted?: string };

type Component = { long_name: string; short_name: string; types: string[] };
type GoogleResponse = { status: string; error_message?: string; results?: { formatted_address: string; address_components: Component[] }[] };

const pick = (cs: Component[], ...types: string[]) => cs.find((c) => types.some((t) => c.types.includes(t)))?.long_name;

/** Pure mapper (unit-tested with fixtures): Google Geocoding API response -> our address fields. */
export function mapGoogleResult(body: GoogleResponse): GeocodedAddress {
  if (body.status === 'ZERO_RESULTS') {
    throw new AppError(404, 'No address was found for this location. Please enter it manually.', 'GEOCODE_NO_RESULT');
  }
  if (body.status !== 'OK') {
    // REQUEST_DENIED, OVER_QUERY_LIMIT, INVALID_REQUEST... arrive with an empty result list: they are provider failures, not "no address".
    throw new AppError(502, 'The address lookup service is unavailable right now. Please enter the address manually.', 'GEOCODER_UNAVAILABLE');
  }
  if (!body.results?.length) {
    throw new AppError(404, 'No address was found for this location. Please enter it manually.', 'GEOCODE_NO_RESULT');
  }
  const r = body.results[0];
  const c = r.address_components;
  const house = pick(c, 'street_number', 'premise', 'subpremise');
  const street = pick(c, 'route');
  return {
    line1: [house, street].filter(Boolean).join(', ') || undefined,
    area: pick(c, 'sublocality_level_1', 'sublocality', 'neighborhood'),
    city: pick(c, 'locality', 'administrative_area_level_2'),
    state: pick(c, 'administrative_area_level_1'),
    pincode: pick(c, 'postal_code'),
    formatted: r.formatted_address,
  };
}

/** Server-side call. The API key lives only in the backend environment. `fetchImpl` is injectable for tests. */
export async function googleReverseGeocode(lat: number, lon: number, apiKey: string, fetchImpl: typeof fetch = fetch): Promise<GeocodedAddress> {
  let body: GoogleResponse;
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lon}&language=en&key=${encodeURIComponent(apiKey)}`;
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(String(res.status));
    body = (await res.json()) as GoogleResponse;
  } catch {
    throw new AppError(502, 'The address lookup service is unavailable right now. Please enter the address manually.', 'GEOCODER_UNAVAILABLE');
  }
  return mapGoogleResult(body);
}
