/**
 * The admin can live under a sub-path of a domain (for example https://example.com/admin).
 * Set NEXT_PUBLIC_BASE_PATH=/admin when building; leave it unset to serve from the root.
 * Next.js adds the prefix to links and router calls by itself, but not to raw fetch() calls or window.location.
 */
const raw = (process.env.NEXT_PUBLIC_BASE_PATH ?? '').trim().replace(/\/+$/, '');
export const BASE = raw && !raw.startsWith('/') ? `/${raw}` : raw;
export const COOKIE_PATH = BASE || '/';
/** A path for fetch() / location: adds the prefix. */
export const withBase = (p: string) => `${BASE}${p}`;
/** window.location.pathname without the prefix, for use with router.replace / ?next=. */
export const stripBase = (p: string) => (BASE && (p === BASE || p.startsWith(`${BASE}/`)) ? p.slice(BASE.length) || '/' : p);
