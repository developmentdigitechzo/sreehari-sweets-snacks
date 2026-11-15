import fs from 'node:fs';
import path from 'node:path';
import { env } from '../../config/env.js';

/**
 * Most categories and products use pictures that ship inside the phone app (an image KEY such as "cake-black-forest").
 * The admin panel runs in a browser and cannot read the phone app's files, so it showed a letter instead of the picture.
 * Copies of those pictures live in `seed-images/` and are served at `/seed-images/<key>.jpg`; this turns a key into that URL.
 */
export function makeImageResolver(known: Map<string, string>, publicUrl: string) {
  const seedImageUrl = (key?: string | null) => {
    const file = key ? known.get(key) : undefined;
    return file ? `${publicUrl}/seed-images/${file}` : null;
  };
  /** An uploaded URL wins; otherwise the picture for the bundled key; otherwise null (the caller may try a parent category). */
  const imageSrc = (url?: string | null, key?: string | null) => url || seedImageUrl(key);
  /**
   * A category without a picture of its own (the admin creates new ones with the key "generic") shows its parent's picture,
   * so no category tile is ever blank.
   */
  const categoryImageKey = (c: { imageKey: string; imageUrl?: string | null; parentId: string | null }, byId: Map<string, { imageKey: string; parentId: string | null }>) => {
    if (c.imageUrl || known.has(c.imageKey)) return c.imageKey;
    let p = c.parentId ? byId.get(c.parentId) : undefined;
    for (let i = 0; p && i < 5; i++) {
      if (known.has(p.imageKey)) return p.imageKey;
      p = p.parentId ? byId.get(p.parentId) : undefined;
    }
    return c.imageKey;
  };
  return { seedImageUrl, imageSrc, categoryImageKey };
}

export const SEED_IMAGE_DIR = path.resolve('seed-images');

const loadKnown = () => {
  const m = new Map<string, string>();
  if (fs.existsSync(SEED_IMAGE_DIR)) for (const f of fs.readdirSync(SEED_IMAGE_DIR)) m.set(f.replace(/\.[a-z0-9]+$/i, ''), f);
  return m;
};

const resolver = makeImageResolver(loadKnown(), env.PUBLIC_URL);
export const { seedImageUrl, imageSrc, categoryImageKey } = resolver;
