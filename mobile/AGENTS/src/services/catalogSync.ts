import { AppState } from 'react-native';
import { USE_MOCK_API } from '../data/config';
import { API_URL } from '../config/api';
import { useCatalog } from '../store/useCatalog';

/**
 * Keeps the catalogue current while the app is open (live backend only).
 * 1. Long-poll `/catalog/wait`: the server answers the moment an admin change is committed, and the app reloads the real catalogue.
 * 2. When the app returns to the foreground it reloads if its data is older than 15 s.
 * 3. If the connection drops it retries with a growing delay.
 * Plain HTTP is used on purpose (React Native has no EventSource). The version is only a hint: the catalogue itself always comes from `/catalog`.
 */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function startCatalogSync(): () => void {
  if (USE_MOCK_API) return () => undefined;
  let stopped = false;
  let controller: AbortController | null = null;

  const sub = AppState.addEventListener('change', (state) => {
    if (state !== 'active') return;
    useCatalog.getState().ensureFresh(15_000);
    controller?.abort(); // restart the poll on a fresh connection
  });

  (async () => {
    let delay = 2000;
    while (!stopped) {
      if (AppState.currentState !== 'active') {
        await sleep(2000);
        continue;
      }
      const c = new AbortController();
      controller = c;
      const kill = setTimeout(() => c.abort(), 33_000);
      try {
        const since = useCatalog.getState().version ?? '';
        const res = await fetch(`${API_URL}/catalog/wait?version=${encodeURIComponent(since)}&timeout=25`, { signal: c.signal, cache: 'no-store' });
        const body = (await res.json()) as { changed?: boolean };
        clearTimeout(kill);
        if (!res.ok) throw new Error(String(res.status));
        delay = 2000;
        if (useCatalog.getState().refreshError) void useCatalog.getState().load({ silent: true }); // back online: reload and clear the banner
        if (body.changed) {
          await useCatalog.getState().load({ silent: true });
          if (useCatalog.getState().refreshError) await sleep(5000); // do not hammer a failing server
        }
      } catch {
        clearTimeout(kill);
        if (stopped) break;
        if (c.signal.aborted) continue; // restarted on purpose
        useCatalog.setState({ refreshError: 'The store cannot be reached.' });
        await sleep(delay);
        delay = Math.min(delay * 2, 60_000);
      }
    }
  })();

  return () => {
    stopped = true;
    controller?.abort();
    sub.remove();
  };
}
