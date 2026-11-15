import { create } from 'zustand';
import { api, Capabilities, NO_CAPABILITIES } from '../services/api';

type State = { caps: Capabilities; loaded: boolean; load: () => Promise<void> };

/** Which optional backend features are really switched on (OTP, reset email, online payments, GPS address lookup). */
export const useCapabilities = create<State>((set, get) => ({
  caps: NO_CAPABILITIES,
  loaded: false,
  load: async () => {
    if (get().loaded) return;
    set({ caps: await api.capabilities(), loaded: true });
  },
}));
