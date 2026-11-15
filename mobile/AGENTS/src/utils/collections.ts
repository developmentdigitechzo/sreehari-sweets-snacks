import type { Category, Collection } from '../types';

/**
 * The category ids a collection (a Home tile such as "Sweets") covers.
 * Uses the store's collection when it exists; otherwise falls back to the category tree, treating the id as a top-level
 * category and including its sub-categories. Returns [] when nothing matches, so a tile can never mean "everything".
 */
export function collectionCategoryIds(collectionId: string | undefined, collections: Collection[], categories: Category[]): string[] {
  if (!collectionId) return [];
  const col = collections.find((c) => c.id === collectionId);
  if (col && col.categoryIds.length > 0) return col.categoryIds;
  const ids = new Set<string>();
  const add = (parent: string) => {
    for (const c of categories) {
      if (c.parentId === parent && !ids.has(c.id)) { ids.add(c.id); add(c.id); }
    }
  };
  if (categories.some((c) => c.id === collectionId)) ids.add(collectionId);
  add(collectionId);
  return [...ids];
}
