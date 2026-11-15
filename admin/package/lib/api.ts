'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { stripBase, withBase } from './base';

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string, public field?: string, public details?: { path: string; message: string }[]) {
    super(message);
  }
}

type Init = { method?: string; body?: unknown; raw?: BodyInit; contentType?: string };

/**
 * Stale-while-revalidate cache for GETs. Opening a page you visited a moment ago shows its last data immediately and refreshes
 * it in the background. Any write (POST/PUT/PATCH/DELETE) clears the whole cache, so a list can never show data from before
 * the change you just made. Entries older than MAX_AGE are ignored.
 */
const MAX_AGE_MS = 60_000;
const cache = new Map<string, { at: number; data: unknown }>();
const fresh = (path: string) => {
  const hit = cache.get(path);
  return hit && Date.now() - hit.at < MAX_AGE_MS ? hit : undefined;
};

/** Writes currently on the wire, keyed by method + path + body. */
const inflight = new Map<string, Promise<unknown>>();

/**
 * Calls the API through the same-origin gateway (the session cookie carries the token).
 *
 * Duplicate-submission safety net for every form: an identical write (same method, path and body) that is still in
 * flight is shared instead of being sent again, so a double click, a held Enter key or a double tap can never create
 * two records, whatever the page does with its own "busy" state. File uploads are never merged.
 */
export function api<T>(path: string, init: Init = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase();
  if (method === 'GET') return request<T>(path, init).then((data) => { cache.set(path, { at: Date.now(), data }); return data; });
  cache.clear(); // a write is about to happen: nothing cached before it may be shown after it
  if (init.raw !== undefined) return request<T>(path, init);
  const key = `${method} ${path} ${JSON.stringify(init.body ?? null)}`;
  const running = inflight.get(key);
  if (running) return running as Promise<T>;
  const p = request<T>(path, init).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

async function request<T>(path: string, init: Init): Promise<T> {
  const headers: Record<string, string> = {};
  let body: BodyInit | undefined;
  if (init.raw !== undefined) {
    body = init.raw;
    if (init.contentType) headers['Content-Type'] = init.contentType;
  } else if (init.body !== undefined) {
    body = JSON.stringify(init.body);
    headers['Content-Type'] = 'application/json';
  }
  let res: Response;
  try {
    res = await fetch(withBase(`/api/proxy/${path.replace(/^\//, '')}`), { method: init.method ?? 'GET', headers, body, cache: 'no-store' });
  } catch {
    throw new ApiError('Network problem. Check your connection and try again.', 0);
  }
  if (res.status === 401) {
    if (typeof window !== 'undefined' && !stripBase(location.pathname).startsWith('/login')) location.href = withBase(`/login?next=${encodeURIComponent(stripBase(location.pathname))}`);
    throw new ApiError('Your session ended. Please sign in again.', 401);
  }
  if (res.status === 429) throw new ApiError('The server is busy (too many requests). Wait a few seconds and try again.', 429, 'RATE_LIMITED');
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get('content-type') ?? '';
  if (!res.ok) {
    const j = ct.includes('json') ? await res.json().catch(() => ({})) : {};
    const e = j?.error ?? {};
    throw new ApiError(e.details?.[0] ? `${e.details[0].path ? `${e.details[0].path}: ` : ''}${e.details[0].message}` : e.message ?? `Request failed (${res.status})`, res.status, e.code, e.field, e.details);
  }
  return (ct.includes('json') ? res.json() : res.text()) as Promise<T>;
}

export const qs = (o: Record<string, string | number | boolean | undefined | null>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '' && v !== 'all') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};

export type Fetch<T> = { data: T | null; error: string | null; loading: boolean; reload: () => void };

/** GET with loading/error state. Re-fetches when `path` changes; stale responses are ignored. */
export function useFetch<T>(path: string | null): Fetch<T> {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>(() => {
    const hit = path === null ? undefined : fresh(path);
    return { data: (hit?.data as T | undefined) ?? null, error: null, loading: path !== null && !hit };
  });
  const [tick, setTick] = useState(0);
  const seq = useRef(0);
  useEffect(() => {
    if (path === null) return;
    const mine = ++seq.current;
    const hit = fresh(path);
    setState((s) => ({ data: (hit?.data as T | undefined) ?? s.data, error: null, loading: !hit })); // cached data stays on screen while it refreshes
    api<T>(path)
      .then((data) => mine === seq.current && setState({ data, error: null, loading: false }))
      .catch((e: Error) => mine === seq.current && setState((s) => ({ data: s.data, error: e.message, loading: false })));
  }, [path, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}
