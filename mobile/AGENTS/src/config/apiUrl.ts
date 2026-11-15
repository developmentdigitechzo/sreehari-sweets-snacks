/**
 * Which backend the app talks to. Pure logic (no React Native imports) so it is unit-tested.
 *
 *   Development (running through Metro: `npm start`, Expo Go, a development build):
 *     1. EXPO_PUBLIC_API_URL_LOCAL if set. "{host}" in it is replaced by the computer running Metro.
 *     2. Otherwise http://<the computer running Metro>:<EXPO_PUBLIC_API_PORT, default 4000>/api
 *        The computer's address is read from the running dev server, so it is right on any Wi-Fi with no editing.
 *   Release (EAS builds, `expo export`, anything not running through Metro):
 *     EXPO_PUBLIC_API_URL_PRODUCTION. It is required: a release build never falls back to localhost.
 *   EXPO_PUBLIC_API_URL, when set, overrides both (for one-off testing or CI). Leave it unset normally.
 *
 * The values come from .env.development / .env.production (Expo loads the matching file automatically), see docs/ENVIRONMENTS.md.
 */
export type ApiUrlInput = {
  /** true when running through the Metro dev server. */
  isDev: boolean;
  override?: string;
  local?: string;
  production?: string;
  port?: string;
  /** Host (no port) of the machine serving the bundle: from Expo's dev server, or window.location on web. */
  devHost?: string | null;
};

export type ApiUrl = { url: string; source: 'override' | 'local' | 'dev-host' | 'production'; warning?: string };

const clean = (v: string | undefined) => (v ?? '').trim().replace(/\/+$/, '');

/** Throws with a plain-language message when a release build has no production URL or a URL is malformed. */
export function resolveApiUrl(i: ApiUrlInput): ApiUrl {
  const override = clean(i.override);
  const check = (url: string, source: ApiUrl['source']): ApiUrl => {
    if (!/^https?:\/\/[^\s/]+(:\d+)?(\/\S*)?$/.test(url)) throw new Error(`The API address "${url}" is not a valid http(s) URL. Check your .env files (docs/ENVIRONMENTS.md).`);
    const warning = !i.isDev && url.startsWith('http://') ? 'The production API address is not https. Android blocks plain http in release builds and customer data would travel unencrypted.' : undefined;
    return { url, source, warning };
  };
  if (override) return check(override, 'override');

  if (i.isDev) {
    const host = (i.devHost ?? '').trim() || 'localhost';
    const local = clean(i.local);
    if (local) return check(local.replace('{host}', host), 'local');
    const port = /^\d{2,5}$/.test((i.port ?? '').trim()) ? (i.port ?? '').trim() : '4000';
    return check(`http://${host}:${port}/api`, 'dev-host');
  }

  const production = clean(i.production);
  if (!production) throw new Error('EXPO_PUBLIC_API_URL_PRODUCTION is not set. Add it to .env.production (docs/ENVIRONMENTS.md). A release build never uses a local address.');
  return check(production, 'production');
}
