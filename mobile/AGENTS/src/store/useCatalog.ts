import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import { create } from 'zustand';
import { BANNERS, CATEGORIES, COLLECTIONS, COUPONS, PRODUCTS } from '../data/seed';
import { USE_MOCK_API } from '../data/config';
import { api, Catalog } from '../services/api';
import { setRewardRules, setRules } from '../services/rules';

type Status = 'idle' | 'loading' | 'ready' | 'error';

type CatalogState = Catalog & {
  status: Status;
  error?: string;
  /** Catalogue version the server reported with the data on screen (see services/catalogSync.ts). */
  version?: string;
  loadedAt?: number;
  /** Set when a background refresh failed while older data is still shown. */
  refreshError?: string;
  load: (opts?: { silent?: boolean }) => Promise<void>;
  /** Reload quietly if the data on screen is older than maxAgeMs (or was never loaded). */
  ensureFresh: (maxAgeMs: number) => void;
};

export const useCatalog = create<CatalogState>((set, get) => ({
  // Demo data is only the starting point in demo mode. With a live backend the catalogue starts empty so a slow or failed load
  // can never show products and prices that are not in the database.
  products: USE_MOCK_API ? PRODUCTS : [],
  categories: USE_MOCK_API ? CATEGORIES : [],
  collections: USE_MOCK_API ? COLLECTIONS : [],
  banners: USE_MOCK_API ? BANNERS : [],
  coupons: USE_MOCK_API ? COUPONS : [],
  delivery: undefined,
  status: 'idle',
  load: async (opts) => {
    if (get().status === 'loading') return;
    const had = get().status === 'ready';
    // Keep showing the current catalogue on refresh; only the first load shows skeletons.
    set({ status: opts?.silent && had ? 'ready' : 'loading', error: undefined });
    try {
      const catalog = await api.getCatalog();
      setRules(catalog.delivery);
      setRewardRules(catalog.rewards);
      set({ ...catalog, status: 'ready', version: catalog.meta?.version, loadedAt: Date.now(), refreshError: undefined });
    } catch (e) {
      // A failed refresh must not wipe products the customer is looking at; a failed first load shows the error state.
      if (had) set({ status: 'ready', refreshError: (e as Error).message });
      else set({ status: 'error', error: (e as Error).message });
    }
  },
  ensureFresh: (maxAgeMs) => {
    const s = get();
    if (s.status === 'loading') return;
    if (s.status === 'idle' || s.status === 'error' || !s.loadedAt || Date.now() - s.loadedAt > maxAgeMs) void s.load({ silent: true });
  },
}));

export const getProduct = (id: string) => useCatalog.getState().products.find((p) => p.id === id);

/** Screens call this so they never sit on skeletons if the splash did not trigger a load. */
export function useEnsureCatalog() {
  // Every time a screen becomes active, make sure it shows current data (a no-op if loaded in the last 30 s).
  const ensureFresh = useCatalog((s) => s.ensureFresh);
  useFocusEffect(useCallback(() => ensureFresh(30_000), [ensureFresh]));
}
