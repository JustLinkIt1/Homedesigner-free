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

const ACCOUNT_CACHE_KEY = 'homedesigner.google-account.v1';

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
        writeAccount(null);
        set({ account: null, ready: true });
        return;
      }
      set({ account: cached });
      await linkPurchases(cached);
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
      const account = await signInWithGoogle();
      writeAccount(account);
      set({ account, ready: true });
      try {
        await linkPurchases(account);
        toast.success(t('Signed in — Pro access is synced to this account.'));
      } catch {
        toast.info(t("Signed in, but purchases couldn't sync. We'll retry when you're online."));
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
    try {
      // Disconnect RevenueCat first. If that cannot complete, keep the account
      // signed in rather than leaving a shared device on the named customer.
      await useProStore.getState().unlinkAccount();
      await signOutFromGoogle();
      writeAccount(null);
      set({ account: null });
      toast.success(t('Signed out. Designs remain saved on this device.'));
    } catch {
      toast.error(t("Couldn't sign out safely — check your connection and try again."));
    } finally {
      set({ busy: false });
    }
  },
}));
