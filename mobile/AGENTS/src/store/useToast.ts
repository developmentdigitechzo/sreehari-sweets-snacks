import { create } from 'zustand';

type ToastState = {
  message: string | null;
  tone: 'success' | 'info' | 'error';
  seq: number;
  show: (message: string, tone?: ToastState['tone']) => void;
  hide: () => void;
};

export const useToast = create<ToastState>((set) => ({
  message: null,
  tone: 'info',
  seq: 0,
  show: (message, tone = 'info') => set((s) => ({ message, tone, seq: s.seq + 1 })),
  hide: () => set({ message: null }),
}));

export const toast = (m: string, tone: ToastState['tone'] = 'info') => useToast.getState().show(m, tone);
