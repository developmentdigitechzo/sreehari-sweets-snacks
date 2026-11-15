import type { Address, CartLine, LineOptions } from '../types';

export const MAX_LINE_QTY = 20;

/**
 * Identity of a cart line = the complete selected configuration: size (variant) + flavour + message.
 * Two cakes of the same size with a different flavour or message are different lines and never overwrite each other;
 * identical configurations are one line with a higher quantity. Messages compare case/whitespace-insensitively.
 */
export const lineKey = (l: { variantId: string; options?: LineOptions }) =>
  [l.variantId, l.options?.flavour ?? '', (l.options?.message ?? '').trim().toLowerCase()].join('|');

const cleanOptions = (o?: LineOptions): LineOptions | undefined => {
  const flavour = o?.flavour || undefined;
  const message = o?.message?.trim() || undefined;
  return flavour || message ? { flavour, message } : undefined;
};

const variantTotal = (lines: CartLine[], variantId: string) => lines.filter((l) => l.variantId === variantId).reduce((n, l) => n + l.qty, 0);

export type AddResult = 'added' | 'capped' | 'soldout';

/**
 * Add a line. Stock is a limit on the VARIANT's total across all of its customised lines, plus a per-line maximum.
 */
export function addLine(lines: CartLine[], line: CartLine, stock: number): { lines: CartLine[]; result: AddResult } {
  if (stock <= 0) return { lines, result: 'soldout' };
  const next: CartLine = { ...line, options: cleanOptions(line.options) };
  const key = lineKey(next);
  const existing = lines.find((l) => lineKey(l) === key);
  const room = stock - variantTotal(lines, next.variantId);
  const add = Math.max(0, Math.min(next.qty, room, MAX_LINE_QTY - (existing?.qty ?? 0)));
  const result: AddResult = add < next.qty ? 'capped' : 'added';
  if (add === 0) return { lines, result: 'capped' };
  if (existing) return { lines: lines.map((l) => (lineKey(l) === key ? { ...l, qty: l.qty + add } : l)), result };
  return { lines: [...lines, { ...next, qty: add }], result };
}

/** Set a line's quantity without exceeding stock shared with the variant's other lines. 0 removes the line. */
export function setLineQty(lines: CartLine[], key: string, qty: number, stock: number): CartLine[] {
  if (qty <= 0) return lines.filter((l) => lineKey(l) !== key);
  return lines.map((l) => {
    if (lineKey(l) !== key) return l;
    const othersOfVariant = variantTotal(lines, l.variantId) - l.qty;
    return { ...l, qty: Math.max(1, Math.min(qty, MAX_LINE_QTY, stock - othersOfVariant)) };
  });
}

/**
 * Merge a guest cart into an account cart without duplicating products or customisations.
 * Same configuration => quantities add; per-variant totals are capped by stock (later lines are trimmed first).
 */
/**
 * mode 'sum' (default): a guest cart joining an account, so the same item in both is the customer adding it twice.
 * mode 'max': the server holds a copy of THIS account's cart, so the same line in both is one line, not two (summing it doubled
 * every quantity each time the app started).
 */
export function mergeCarts(guest: CartLine[], account: CartLine[], maxQty: (variantId: string) => number = () => MAX_LINE_QTY, mode: 'sum' | 'max' = 'sum'): CartLine[] {
  const merged = new Map<string, CartLine>();
  for (const l of [...account, ...guest]) {
    const k = lineKey(l);
    const ex = merged.get(k);
    merged.set(k, ex ? { ...ex, qty: Math.min(mode === 'max' ? Math.max(ex.qty, l.qty) : ex.qty + l.qty, MAX_LINE_QTY) } : { ...l, options: cleanOptions(l.options) });
  }
  const used = new Map<string, number>();
  const out: CartLine[] = [];
  for (const l of merged.values()) {
    const room = Math.max(0, maxQty(l.variantId) - (used.get(l.variantId) ?? 0));
    const qty = Math.min(l.qty, room);
    if (qty > 0) {
      out.push({ ...l, qty });
      used.set(l.variantId, (used.get(l.variantId) ?? 0) + qty);
    }
  }
  return out;
}

const addrKey = (a: Pick<Address, 'line1' | 'pincode'>) => `${a.line1.trim().toLowerCase()}|${a.pincode}`;

/** Account addresses first; guest addresses are added only if they are not already saved. */
export function mergeAddresses(account: Address[], guest: Address[]): Address[] {
  const seen = new Set(account.map(addrKey));
  const extra = guest.filter((a) => !seen.has(addrKey(a))).map((a) => ({ ...a, isDefault: false }));
  return [...account, ...extra];
}
