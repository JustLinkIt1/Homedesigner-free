import { create } from 'zustand';
import {
  hasGoogleSession,
  isGoogleSignInConfigured,
  revenueCatUserId,
  signInWithGoogle,
  signOutFromGoogle,
  type GoogleAccount,
} from '../lib/googleAuth';
import { toast } from '../lib/ui';
import { t } from '../lib/i18n';
import { useProStore } from './proStore';
import { startProjectSync, syncProjects } from '../lib/cloudSync';

const ACCOUNT_CACHE_KEY = 'homedesigner.google-account.v1';
let stopProjectSync: (() => void) | null = null;

/** Account work that runs WITHOUT a human in the loop. */
const SYNC_TIMEOUT_MS = 20_000;
/** Sign-in opens Google's account picker and waits for a person to choose an
 *  account and possibly type a password. Cutting that short is its own bug, so
 *  it gets the same minutes-long bound the Play sheet gets in `lib/pro.ts`. */
const INTERACTIVE_TIMEOUT_MS = 180_000;

/**
 * A backstop so `busy` can never strand. Every `busy` flag here already clears
 * in a `finally`, which is worthless if the awaited promise never settles —
 * and `Promise.allSettled` does not settle while any member is pending.
 *
 * That is what shipped: a stalled request left `busy` true forever, and the Pro
 * sheet spins its primary button (and DISABLES it) while any auth work is busy.
 * The user then cannot buy anything, having pressed nothing. The underlying
 * unbounded `fetch` is fixed in `lib/cloudSync.ts`; this bounds the store too,
 * because sign-in and RevenueCat linking go through dependencies whose hangs we
 * do not control, and a stuck spinner must never be one library away again.
 */
function bounded<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    // Resolve null rather than reject: a timeout here means "could not finish",
    // never "failed" — it must not discard a valid account or entitlement.
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

async function syncAccountData(): Promise<number> {
  stopProjectSync?.();
  stopProjectSync = startProjectSync();
  return syncProjects();
}

function readAccount(): GoogleAccount | null {
  try {
    const value = JSON.parse(localStorage.getItem(ACCOUNT_CACHE_KEY) ?? 'null') as Partial<GoogleAccount> | null;
    if (!value || typeof value.subject !== 'string' || !value.subject) return null;
    return {
      subject: value.subject,
      email: typeof value.email === 'string' ? value.email : null,
      name: typeof value.name === 'string' ? value.name : null,
      imageUrl: typeof value.imageUrl === 'string' ? value.imageUrl : null,
    };
  } catch {
    return null;
  }
}

function writeAccount(account: GoogleAccount | null): void {
  try {
    if (account) localStorage.setItem(ACCOUNT_CACHE_KEY, JSON.stringify(account));
    else localStorage.removeItem(ACCOUNT_CACHE_KEY);
  } catch {
    /* profile cache only */
  }
}

async function linkPurchases(account: GoogleAccount): Promise<void> {
  await useProStore.getState().linkAccount({
    appUserID: revenueCatUserId(account),
    email: account.email,
    displayName: account.name,
  });
}

interface AuthState {
  account: GoogleAccount | null;
  configured: boolean;
  ready: boolean;
  busy: boolean;
  restoreSession: () => Promise<void>;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  syncNow: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  account: readAccount(),
  configured: isGoogleSignInConfigured(),
  ready: false,
  busy: false,

  restoreSession: async () => {
    const cached = readAccount();
    if (!get().configured || !cached) {
      set({ account: cached, ready: true });
      return;
    }
    try {
      const active = await hasGoogleSession();
      if (!active) {
        stopProjectSync?.();
        stopProjectSync = null;
        writeAccount(null);
        set({ account: null, ready: true });
        void useProStore.getState().unlinkAccount().catch(() => {});
        return;
      }
      set({ account: cached });
      // Bounded like the rest: this one gates `ready`, and a startup that never
      // becomes ready is the same class of stuck UI.
      await bounded(Promise.allSettled([linkPurchases(cached), syncAccountData()]), SYNC_TIMEOUT_MS);
    } catch {
      // Offline startup must not discard a valid cached account or entitlement.
      set({ account: cached });
    } finally {
      set({ ready: true });
    }
  },

  signIn: async () => {
    if (get().busy || !get().configured) return;
    set({ busy: true });
    try {
      const account = await bounded(signInWithGoogle(), INTERACTIVE_TIMEOUT_MS);
      // Null means the picker never came back. Fail the sign-in rather than
      // writing a null account over a perfectly good cached one.
      if (!account) throw new Error(t('Google Sign-In did not complete.'));
      writeAccount(account);
      set({ account, ready: true });
      const settled = await bounded(
        Promise.allSettled([linkPurchases(account), syncAccountData()]), SYNC_TIMEOUT_MS);
      const purchases = settled?.[0];
      const plans = settled?.[1];
      if (purchases?.status === 'fulfilled' && plans?.status === 'fulfilled') {
        const imported = plans.value;
        toast.success(imported
          ? t('Signed in — your plans and Pro access are synced.')
          : t('Signed in — plans and Pro access will sync across devices.'));
      } else {
        toast.info(t("Signed in, but cloud sync couldn't finish. We'll retry when you're online."));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (!/cancel/i.test(message)) toast.error(message || t('Google Sign-In did not complete.'));
    } finally {
      set({ busy: false });
    }
  },

  signOut: async () => {
    if (get().busy || !get().account) return;
    set({ busy: true });
    // Stop cloud writes and clear the visible account immediately. Provider
    // cleanup is best-effort: offline RevenueCat/Google calls must never trap a
    // user in a signed-in UI on a shared desktop or phone.
    stopProjectSync?.();
    stopProjectSync = null;
    writeAccount(null);
    set({ account: null, ready: true });
    const cleanup = await Promise.race([
      Promise.allSettled([
        useProStore.getState().unlinkAccount(),
        signOutFromGoogle(),
      ]),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
    ]);
    try {
      if (cleanup?.every((result) => result.status === 'fulfilled')) {
        toast.success(t('Signed out. Designs remain saved on this device.'));
      } else {
        toast.info(t('Signed out on this device. Online account cleanup will retry next time.'));
      }
    } finally {
      set({ busy: false });
    }
  },

  syncNow: async () => {
    const account = get().account;
    if (get().busy || !account) return;
    set({ busy: true });
    try {
      const settled = await bounded(
        Promise.allSettled([linkPurchases(account), syncAccountData()]), SYNC_TIMEOUT_MS);
      if (settled?.[0].status === 'fulfilled' && settled[1].status === 'fulfilled') {
        toast.success(t('Sync complete — plans and Pro access are up to date.'));
      } else {
        toast.error(t("Sync couldn't finish. Check your connection and try again."));
      }
    } finally {
      set({ busy: false });
    }
  },
}));
