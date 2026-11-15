import { prisma } from '../../database/prisma.js';
import { DEFAULT_TIMING, type SlotOverride } from '../orders/slots.js';
import { DEMO_RULES } from '../pricing/pricing.js';

/** Store settings live in the Setting table; code defaults apply until an admin saves a value. */
export type DeliverySettings = {
  freeDeliveryThreshold: number;
  codLimit: number;
  /** Per-slot overrides keyed by slot id: fee, on/off, wording and clock times. */
  slots: Record<string, SlotOverride>;
  /** How many days ahead a customer may schedule a delivery (0 = today only). */
  maxAdvanceDays: number;
  /** A timed slot closes for today this many minutes before it starts. */
  cutoffMinutes: number;
};
/** earnPerRupee: points earned per ₹1 spent (0.1 = 1 point per ₹10). pointsToRupee: ₹ value of one point (0.1 = 10 points per ₹1). */
export type RewardSettings = { earnPerRupee: number; pointsToRupee: number };
export type StoreSettings = { storeName: string; contactPhone: string; contactEmail: string; address: string; lowStockThreshold: number; returnWindowDays: number };

export const DEFAULTS = {
  delivery: { freeDeliveryThreshold: DEMO_RULES.freeDeliveryThreshold, codLimit: DEMO_RULES.codLimit, slots: {}, ...DEFAULT_TIMING } as DeliverySettings,
  rewards: { earnPerRupee: DEMO_RULES.earnPerRupee, pointsToRupee: DEMO_RULES.pointsToRupee } as RewardSettings,
  store: { storeName: 'Shree Hari Sweets & Snacks', contactPhone: '', contactEmail: '', address: '', lowStockThreshold: 20, returnWindowDays: 2 } as StoreSettings,
};

let cache: { at: number; map: Map<string, unknown> } | null = null;

async function all() {
  if (cache && Date.now() - cache.at < 15_000) return cache.map;
  const rows = await prisma.setting.findMany();
  cache = { at: Date.now(), map: new Map(rows.map((r) => [r.key, r.value])) };
  return cache.map;
}
export const clearSettingsCache = () => {
  cache = null;
};

export async function getSetting<K extends keyof typeof DEFAULTS>(key: K): Promise<(typeof DEFAULTS)[K]> {
  const v = (await all()).get(key) as Partial<(typeof DEFAULTS)[K]> | undefined;
  return { ...DEFAULTS[key], ...(v ?? {}) } as (typeof DEFAULTS)[K];
}

export async function saveSetting(key: keyof typeof DEFAULTS, value: object, by: string) {
  await prisma.setting.upsert({ where: { key }, update: { value, updatedBy: by }, create: { key, value, updatedBy: by } });
  clearSettingsCache();
}
