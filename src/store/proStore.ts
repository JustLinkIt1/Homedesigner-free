// Pro entitlement state. Deliberately separate from useDesign: design
// snapshots feed undo/persist, and entitlement must never ride along.
import { create } from 'zustand';
import { Capacitor } from '@capacitor/core';
import { getProProvider, type ProFeature, type ProPlan, type ProPlanID } from '../lib/pro';
import {
  isValidReferralCode,
  markReferralRedeemed,
  isReferralRedeemed,
  syncReferralAttribute,
} from '../lib/referral';
import { toast } from '../lib/ui';
import { t } from '../lib/i18n';

const PRO_CACHE_KEY = 'homedesigner.pro.v1';

/** Resume fires on every screen unlock, so the promo-code re-check is rate
 *  limited. Redemption takes a trip to the Play Store, so a minute is nowhere
 *  near the user's perception of "instant". */
const RECHECK_INTERVAL_MS = 60_000;
let lastRecheck = 0;

const readCache = (): boolean => {
  // Browser storage is user-editable and must never be an entitlement source.
  // Android keeps this offline fallback for previously verified Play purchases.
  if (!Capacitor.isNativePlatform()) return false;
  try {
    return localStorage.getItem(PRO_CACHE_KEY) === '1';
  } catch {
    return false;
  }
};

const writeCache = (isPro: boolean) => {
  if (!Capacitor.isNativePlatform()) {
    try { localStorage.removeItem(PRO_CACHE_KEY); } catch { /* cache cleanup only */ }
    return;
  }
  try {
    localStorage.setItem(PRO_CACHE_KEY, isPro ? '1' : '0');
  } catch {
    /* cache only */
  }
  // Mirror to native Preferences: it survives WebView storage clears.
  import('@capacitor/preferences')
    .then(({ Preferences }) => Preferences.set({ key: PRO_CACHE_KEY, value: isPro ? '1' : '0' }))
    .catch(() => {});
};

interface ProState {
  isPro: boolean;
  priceLabel: string | null;
  plans: ProPlan[];
  busy: boolean;
  upsellFeature: ProFeature | null;
  refresh: () => Promise<void>;
  /** Silent re-check for an entitlement granted outside the app (Play promo
   *  code). Resolves true only when it flipped a non-Pro user to Pro. */
  recheck: () => Promise<boolean>;
  purchase: (planID?: ProPlanID) => Promise<void>;
  restore: () => Promise<void>;
  linkAccount: (account: { appUserID: string; email: string | null; displayName: string | null }) => Promise<void>;
  unlinkAccount: () => Promise<void>;
  redeemCode: (code: string) => boolean;
  openUpsell: (f: ProFeature) => void;
  closeUpsell: () => void;
}

export const useProStore = create<ProState>((set, get) => ({
  // Seeded synchronously so gates work instantly and offline. A redeemed
  // referral code counts even if the entitlement cache was clobbered.
  isPro: readCache() || isReferralRedeemed(),
  priceLabel: null,
  plans: [],
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
    try {
      set({ plans: await provider.getPlans() });
    } catch {
      /* plan choices are cosmetic until checkout */
    }
  },

  recheck: async () => {
    // Nothing to find: a Pro user is already Pro, and this must never be able
    // to take Pro away — a flaky read on resume revoking a paid unlock would be
    // far worse than a promo code taking one more resume to appear.
    if (get().isPro) return false;
    const now = Date.now();
    if (now - lastRecheck < RECHECK_INTERVAL_MS) return false;
    lastRecheck = now;
    const provider = getProProvider();
    try {
      await provider.init();
      const entitled = provider.sync ? await provider.sync() : await provider.isEntitled();
      if (!entitled) return false;
      set({ isPro: true, upsellFeature: null });
      writeCache(true);
      return true;
    } catch {
      // Offline or store unavailable — try again on the next resume.
      lastRecheck = 0;
      return false;
    }
  },

  purchase: async (planID) => {
    if (get().busy) return;
    set({ busy: true });
    try {
      const ok = await getProProvider().purchase(planID);
      if (ok) {
        set({ isPro: true, upsellFeature: null });
        writeCache(true);
        toast.success(t('Pro unlocked — thank you!'));
      } else if (Capacitor.isNativePlatform()) {
        // The provider resolved false without throwing: the flow ended without a
        // confirmed transaction (e.g. sheet dismissed in a way that isn't
        // reported as a cancel error). Never leave the user with zero feedback —
        // and if they WERE charged, Restore is the recovery path. (Web's mock
        // provider intentionally returns false after opening the Play listing.)
        toast.info("Purchase didn't complete. If you were charged, use Restore purchase.");
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

  linkAccount: async ({ appUserID, email, displayName }) => {
    const provider = getProProvider();
    await provider.init();
    const entitled = (await provider.identify(appUserID, email, displayName)) || isReferralRedeemed();
    const priceLabel = await provider.getPrice().catch(() => null);
    const plans = await provider.getPlans().catch(() => []);
    set({ isPro: entitled, plans, ...(priceLabel ? { priceLabel } : {}) });
    writeCache(entitled);
  },

  unlinkAccount: async () => {
    const provider = getProProvider();
    let entitled = isReferralRedeemed();
    // Clear account-derived state before touching the network so sign-out is
    // immediate and cannot leave another person's Pro badge or prices visible.
    set({ isPro: entitled, plans: [], priceLabel: null, upsellFeature: null });
    writeCache(entitled);
    try {
      await provider.init();
      entitled = (await provider.disconnect()) || entitled;
    } finally {
      // RevenueCat may reveal a device-owned anonymous entitlement after
      // logout; retain that, while network failures keep the local fallback.
      set({ isPro: entitled, plans: [], priceLabel: null, upsellFeature: null });
      writeCache(entitled);
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
