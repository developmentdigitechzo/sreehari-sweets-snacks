import { create } from 'zustand';
import type { EnsureResult, PermissionKind } from '../services/permissions/types';

/** One permission explanation at a time. `waiting` = the customer went to Settings and we are waiting for them to come back. */
export type PermissionPrompt = {
  kind: PermissionKind;
  phase: 'rationale' | 'settings' | 'waiting';
  revoked: boolean;
  busy: boolean;
  resolve: (r: EnsureResult) => void;
};

type State = {
  prompt: PermissionPrompt | null;
  open: (p: PermissionPrompt) => void;
  patch: (p: Partial<PermissionPrompt>) => void;
  close: () => void;
};

export const usePermissionPrompt = create<State>((set) => ({
  prompt: null,
  open: (prompt) => set({ prompt }),
  patch: (p) => set((s) => (s.prompt ? { prompt: { ...s.prompt, ...p } } : s)),
  close: () => set({ prompt: null }),
}));
