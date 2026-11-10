import { create } from 'zustand';
import type { PointsState } from '../lib/aiRender';

interface PointView {
  subject: string | null;
  revision: number;
  generation: number;
  walletOpen: boolean;
  openWallet: () => void;
  closeWallet: () => void;
  balance: number | null;
  state: PointsState | null;
  setSubject: (subject: string | null) => void;
  observe: (subject: string, path: string, value: unknown, readRevision: number) => void;
}

/** Display-only, memory-only cache. Never an authority for spending or Pro. */
export const usePointsStore = create<PointView>((set, get) => ({
  subject: null, revision: 0, generation: 0, balance: null, state: null, walletOpen: false,
  openWallet: () => set({ walletOpen: true }),
  closeWallet: () => set({ walletOpen: false }),
  setSubject: subject => {
    if (subject !== get().subject) set(current => ({
      subject, revision: current.revision + 1, generation: current.generation + 1,
      balance: null, state: null, walletOpen: false,
    }));
  },
  observe: (subject, path, value, readRevision) => {
    const current = get();
    if (current.subject !== subject || !value || typeof value !== 'object') return;
    const data = value as Partial<PointsState>;
    if (!Number.isSafeInteger(data.balance)) return;
    if (path === '/v1/points') {
      // A read started before a charge/restore must not overwrite its balance.
      if (current.revision !== readRevision || !data.features || !Array.isArray(data.packs)) return;
      set({ balance: data.balance, state: data as PointsState });
    } else if (path.startsWith('/v1/ai/') || path === '/v1/points/play/claim') {
      // Concurrent mutations need a fresh server read: response order is not
      // necessarily ledger order, so neither result can prove the latest balance.
      if (current.revision !== readRevision) return;
      set({ balance: data.balance, revision: current.revision + 1,
        state: current.state ? { ...current.state, balance: data.balance! } : null });
    }
  },
}));
