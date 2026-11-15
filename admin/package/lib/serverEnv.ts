/**
 * Server-side settings for the admin panel. They come from the environment: Next.js loads .env.development for `next dev`,
 * .env.production for `next start` / `next build`, and real environment variables (for example the ones set in cPanel) win over both.
 * Never import this from a client component.
 */
export function apiBase(): string | null {
  const v = (process.env.API_URL ?? '').trim().replace(/\/+$/, '');
  if (v) return v;
  // Local development works out of the box; production must be configured, so it can never talk to localhost by accident.
  return process.env.NODE_ENV === 'production' ? null : 'http://localhost:4000/api';
}

export const NOT_CONFIGURED = { error: { code: 'NOT_CONFIGURED', message: 'The admin panel is not configured: API_URL is missing on the server.' } };
