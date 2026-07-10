// Pro entitlement state. Deliberately separate from useDesign: design
// snapshots feed undo/persist, and entitlement must never ride along.
import { create } from 'zustand';
import { Capacitor } from '@capacitor/core';
import { getProProvider, type ProFeature } from '../lib/pro';
import {
  isValidReferralCode,
  markReferralRedeemed,
  isReferralRedeemed,
  syncReferralAttribute,
} from '../lib/referral';
import { toast } from '../lib/ui';

const PRO_CACHE_KEY = 'homedesigner.pro.v1';

const readCache = (): boolean => {
  try {
    return localStorage.getItem(PRO_CACHE_KEY) === '1';
  } catch {
    return false;
  }
};

const writeCache = (isPro: boolean) => {
  try {
    localStorage.setItem(PRO_CACHE_KEY, isPro ? '1' : '0');
  } catch {
    /* cache only */
  }
  // Mirror to native Preferences: it survives WebView storage clears.
  if (Capacitor.isNativePlatform()) {
    import('@capacitor/preferences')
      .then(({ Preferences }) => Preferences.set({ key: PRO_CACHE_KEY, value: isPro ? '1' : '0' }))
      .catch(() => {});
  }
};

interface ProState {
  isPro: boolean;
  priceLabel: string | null;
  busy: boolean;
  upsellFeature: ProFeature | null;
  refresh: () => Promise<void>;
  purchase: () => Promise<void>;
  restore: () => Promise<void>;
  redeemCode: (code: string) => boolean;
  openUpsell: (f: ProFeature) => void;
  closeUpsell: () => void;
}

export const useProStore = create<ProState>((set, get) => ({
  // Seeded synchronously so gates work instantly and offline. A redeemed
  // referral code counts even if the entitlement cache was clobbered.
  isPro: readCache() || isReferralRedeemed(),
  priceLabel: null,
  busy: false,
  upsellFeature: null,

  refresh: async () => {
    const provider = getProProvider();
    // Native Preferences may hold an entitlement the WebView cache lost.
    if (Capacitor.isNativePlatform() && !get().isPro) {
      try {
        const { Preferences } = await import('@capacitor/preferences');
        const { value } = await Preferences.get({ key: PRO_CACHE_KEY });
        if (value === '1') set({ isPro: true });
      } catch {
        /* preferences unavailable */
      }
    }
    try {
      await provider.init();
      // Backfill the referral attribute for devices that redeemed before we
      // started reporting redemptions to RevenueCat (needs configure() first).
      syncReferralAttribute();
      // A redeemed referral code is a grant in its own right: RevenueCat
      // knows nothing about it, so it must never be able to revoke it.
      const entitled = (await provider.isEntitled()) || isReferralRedeemed();
      // Only a SUCCESSFUL response may change the flag — a network error must
      // never lock a paying user out of what they bought.
      set({ isPro: entitled });
      writeCache(entitled);
    } catch {
      /* keep cached entitlement */
    }
    try {
      const price = await provider.getPrice();
      if (price) set({ priceLabel: price });
    } catch {
      /* price is cosmetic */
    }
  },

  purchase: async () => {
    if (get().busy) return;
    set({ busy: true });
    try {
      const ok = await getProProvider().purchase();
      if (ok) {
        set({ isPro: true, upsellFeature: null });
        writeCache(true);
        toast.success('Pro unlocked — thank you!');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (!/cancel/i.test(msg)) toast.error(msg || 'Purchase did not complete. You were not charged.');
    } finally {
      set({ busy: false });
    }
  },

  restore: async () => {
    if (get().busy) return;
    set({ busy: true });
    try {
      const ok = await getProProvider().restore();
      if (ok) {
        set({ isPro: true, upsellFeature: null });
        writeCache(true);
        toast.success('Pro purchase restored.');
      } else {
        toast.info('No previous Pro purchase found for this account.');
      }
    } catch {
      toast.error("Couldn't reach the store — try again when you're online.");
    } finally {
      set({ busy: false });
    }
  },

  redeemCode: (code: string) => {
    if (!isValidReferralCode(code)) return false;
    markReferralRedeemed(code);
    set({ isPro: true, upsellFeature: null });
    writeCache(true);
    toast.success('Pro unlocked with your referral code!');
    return true;
  },

  openUpsell: (f) => set({ upsellFeature: f }),
  closeUpsell: () => set({ upsellFeature: null }),
}));
