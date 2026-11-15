import { USE_MOCK_API } from '../data/config';
import { API_URL } from '../config/api';
import { session } from './session';

type Event = { bannerId: string; type: 'view' | 'click' };

/**
 * Real banner impressions and taps, reported to the backend so the admin panel can show true performance.
 * Nothing is sent in demo (mock) mode, because there is no backend to receive it. A banner counts as viewed once per app session.
 */
const seen = new Set<string>();
let queue: Event[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

async function flush() {
  timer = null;
  const batch = queue.splice(0, 20);
  if (batch.length === 0) return;
  try {
    const token = session.get();
    await fetch(`${API_URL}/banner-events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ events: batch }),
    });
  } catch {
    // Analytics must never disturb shopping: drop the batch if the network is down.
  }
  if (queue.length) timer = setTimeout(flush, 1500);
}

export function trackBanner(bannerId: string, type: Event['type']) {
  if (USE_MOCK_API) return;
  if (type === 'view') {
    if (seen.has(bannerId)) return;
    seen.add(bannerId);
  }
  queue.push({ bannerId, type });
  if (!timer) timer = setTimeout(flush, 2500);
}
