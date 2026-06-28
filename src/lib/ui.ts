import { create } from 'zustand';

// ---------- Toasts ----------
export type ToastKind = 'info' | 'success' | 'error';
export interface Toast {
  id: string;
  message: string;
  kind: ToastKind;
}

interface ToastState {
  toasts: Toast[];
  push: (message: string, kind?: ToastKind) => void;
  dismiss: (id: string) => void;
}

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (message, kind = 'info') => {
    const id = Math.random().toString(36).slice(2);
    set((s) => ({ toasts: [...s.toasts, { id, message, kind }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3400);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export const toast = {
  info: (m: string) => useToasts.getState().push(m, 'info'),
  success: (m: string) => useToasts.getState().push(m, 'success'),
  error: (m: string) => useToasts.getState().push(m, 'error'),
};

// ---------- Confirm dialog ----------
interface ConfirmReq {
  title: string;
  message: string;
  confirmLabel: string;
  danger: boolean;
  resolve: (ok: boolean) => void;
}
interface ConfirmState {
  req: ConfirmReq | null;
  ask: (r: Omit<ConfirmReq, 'resolve'>) => Promise<boolean>;
  answer: (ok: boolean) => void;
}

export const useConfirm = create<ConfirmState>((set, get) => ({
  req: null,
  ask: (r) =>
    new Promise<boolean>((resolve) => {
      set({ req: { ...r, resolve } });
    }),
  answer: (ok) => {
    const { req } = get();
    req?.resolve(ok);
    set({ req: null });
  },
}));

// ---------- Active-drawing affordance (wall/room) ----------
interface DrawState {
  active: boolean;
  setActive: (b: boolean) => void;
}
export const useDraw = create<DrawState>((set) => ({
  active: false,
  setActive: (b) => set((s) => (s.active === b ? s : { active: b })),
}));
/** Lets the on-canvas affordance call into Canvas2D's draft handlers. */
export const drawBridge: { finish: (() => void) | null; cancel: (() => void) | null } = {
  finish: null,
  cancel: null,
};

/** Promise-based confirm matching the app's modal style. */
export function confirmDialog(
  title: string,
  message: string,
  opts?: { confirmLabel?: string; danger?: boolean },
): Promise<boolean> {
  return useConfirm.getState().ask({
    title,
    message,
    confirmLabel: opts?.confirmLabel ?? 'Confirm',
    danger: opts?.danger ?? false,
  });
}
