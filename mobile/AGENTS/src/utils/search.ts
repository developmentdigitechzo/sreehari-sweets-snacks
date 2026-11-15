import type { Category, Product } from '../types';

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

/** Edit distance <= 1 check (cheap typo tolerance). */
function within1(a: string, b: string) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (a.length < b.length) j++;
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

const SYNONYMS: Record<string, string[]> = {
  ladoo: ['laddu'], laddoo: ['laddu'], ladu: ['laddu'], mysorepak: ['mysore', 'pak'], murukku: ['murukku', 'chakli'],
  chakli: ['murukku'], namkeen: ['mixture'], gift: ['gift', 'box'], katli: ['kaju', 'katli'],
};

/** Returns a relevance score (0 = no match). Every query token must match something. */
export function scoreProduct(p: Product, query: string, cats: Record<string, Category>): number {
  const q = norm(query);
  if (!q) return 1;
  const hay = norm([p.name, p.tagline, p.tags.join(' '), cats[p.categoryId]?.name ?? ''].join(' '));
  const words = hay.split(' ');
  const name = norm(p.name);
  let score = 0;
  for (const raw of q.split(' ')) {
    const variants = [raw, ...(SYNONYMS[raw] ?? [])];
    let best = 0;
    for (const t of variants) {
      if (name.includes(t)) best = Math.max(best, 5);
      else if (hay.includes(t)) best = Math.max(best, 3);
      else if (t.length >= 4 && words.some((w) => w.length >= 4 && within1(t, w))) best = Math.max(best, 2);
    }
    if (!best) return 0;
    score += best;
  }
  return score;
}

export const POPULAR_SEARCHES = ['Mysore pak', 'Laddu', 'Mixture', 'Gift box', 'Murukku', 'Kaju katli'];
