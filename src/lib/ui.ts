import { create } from 'zustand';

// ---------- Toasts ----------
export type ToastKind = 'info' | 'success' | 'error';
export interface ToastAction {
  label: string;
  onClick: () => void;
}
export interface Toast {
  id: string;
  message: string;
  kind: ToastKind;
  action?: ToastAction;
}

interface ToastState {
  toasts: Toast[];
  push: (message: string, kind?: ToastKind, action?: ToastAction) => void;
  dismiss: (id: string) => void;
  /** Freeze/restart a toast's auto-dismiss (e.g. while a finger rests on it). */
  pause: (id: string) => void;
  resume: (id: string) => void;
}

// Toasts with an action (Undo) get a longer window so it's reachable.
const TTL = 3400;
const ACTION_TTL = 6000;
const timers = new Map<string, ReturnType<typeof setTimeout>>();

export const useToasts = create<ToastState>((set) => {
  const arm = (id: string, ms: number) => {
    const t = timers.get(id);
    if (t) clearTimeout(t);
    timers.set(
      id,
      setTimeout(() => {
        timers.delete(id);
        set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }));
      }, ms),
    );
  };
  return {
    toasts: [],
    push: (message, kind = 'info', action) => {
      const id = Math.random().toString(36).slice(2);
      set((s) => ({ toasts: [...s.toasts, { id, message, kind, action }] }));
      arm(id, action ? ACTION_TTL : TTL);
    },
    dismiss: (id) => {
      const t = timers.get(id);
      if (t) clearTimeout(t);
      timers.delete(id);
      set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }));
    },
    pause: (id) => {
      const t = timers.get(id);
      if (t) clearTimeout(t);
      timers.delete(id);
    },
    resume: (id) => arm(id, 2000),
  };
});

export const toast = {
  info: (m: string) => useToasts.getState().push(m, 'info'),
  success: (m: string) => useToasts.getState().push(m, 'success'),
  error: (m: string) => useToasts.getState().push(m, 'error'),
  /** Info toast with an inline action button (e.g. "Undo"). */
  action: (m: string, action: ToastAction, kind: ToastKind = 'info') =>
    useToasts.getState().push(m, kind, action),
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
