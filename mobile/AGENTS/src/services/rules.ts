import { DELIVERY_SLOTS, DEMO_CONFIG } from '../data/config';
import type { DeliverySlot } from '../types';
import { DEFAULT_TIMING } from './deliveryDates';

/**
 * Delivery rules used for the price PREVIEW. In demo mode these are the bundled defaults; with a live backend the catalogue
 * brings the store's current values (edited in the admin panel), and the server applies the same values when the order is placed.
 */
export type DeliveryRules = { freeDeliveryThreshold: number; codLimit: number; slots: DeliverySlot[]; maxAdvanceDays: number; cutoffMinutes: number };

const DEFAULTS: DeliveryRules = { freeDeliveryThreshold: DEMO_CONFIG.freeDeliveryThreshold, codLimit: DEMO_CONFIG.codLimit, slots: DELIVERY_SLOTS, ...DEFAULT_TIMING };
let current: DeliveryRules = DEFAULTS;

/** Reward rules for the preview: ₹ value of one point. Live backend: the store edits it in admin > Rewards. */
export type RewardRules = { earnPerRupee: number; pointsToRupee: number };
let rewards: RewardRules = { earnPerRupee: DEMO_CONFIG.pointsPerRupee, pointsToRupee: DEMO_CONFIG.pointsToRupee };
export const getRewardRules = () => rewards;
export function setRewardRules(r: RewardRules | undefined) {
  rewards = r && r.pointsToRupee > 0 ? r : { earnPerRupee: DEMO_CONFIG.pointsPerRupee, pointsToRupee: DEMO_CONFIG.pointsToRupee };
}

export const getRules = () => current;
export function setRules(r: Partial<DeliveryRules> & Pick<DeliveryRules, 'freeDeliveryThreshold' | 'codLimit' | 'slots'> | undefined) {
  current = r && r.slots.length > 0 ? { ...r, maxAdvanceDays: r.maxAdvanceDays ?? DEFAULT_TIMING.maxAdvanceDays, cutoffMinutes: r.cutoffMinutes ?? DEFAULT_TIMING.cutoffMinutes } : DEFAULTS;
}
