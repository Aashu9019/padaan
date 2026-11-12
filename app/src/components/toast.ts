import { create } from 'zustand';

export interface ToastItem {
  id: number;
  message: string;
  tone: 'neutral' | 'error';
  action?: { label: string; run: () => void };
}

interface ToastState {
  toasts: ToastItem[];
  push: (toast: Omit<ToastItem, 'id'>) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push: (toast) => {
    const id = nextId++;
    set({ toasts: [...get().toasts.slice(-2), { ...toast, id }] });
    window.setTimeout(() => get().dismiss(id), toast.tone === 'error' ? 7000 : 4000);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export const toast = {
  info: (message: string, action?: ToastItem['action']) =>
    useToasts.getState().push({ message, tone: 'neutral', action }),
  error: (message: string, action?: ToastItem['action']) =>
    useToasts.getState().push({ message, tone: 'error', action }),
};
