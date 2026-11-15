export type LineOptions = { flavour?: string; message?: string };

/** Must stay identical to mobile/src/utils/cart.ts lineKey(). */
export const lineKey = (l: { variantId: string; options?: LineOptions }) =>
  [l.variantId, l.options?.flavour ?? '', (l.options?.message ?? '').trim().toLowerCase()].join('|');

export const cleanOptions = (o?: LineOptions): LineOptions | undefined => {
  const flavour = o?.flavour?.trim() || undefined;
  const message = o?.message?.trim() || undefined;
  return flavour || message ? { flavour, message } : undefined;
};
