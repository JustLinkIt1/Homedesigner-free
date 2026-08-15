// Pro entitlement state. Deliberately separate from useDesign: design
// snapshots feed undo/persist, and entitlement must never ride along.
import { create } from 'zustand';
import { Capacitor } from '@capacitor/core';
import { getProProvider, STORE_TIMEOUT_MS, type ProFeature, type ProPlan, type ProPlanID } from '../lib/pro';
import {
  isValidReferralCode,
  markReferralRedeemed,
  isReferralRedeemed,
} from '../lib/referral';
import { toast } from '../lib/ui';
import { t } from '../lib/i18n';

const PRO_CACHE_KEY = 'homedesigner.pro.v1';

/** Resume fires on every screen unlock, so the promo-code re-check is rate
 *  limited. Redemption takes a trip to the Play Store, so a minute is nowhere
 *  near the user's perception of "instant". */
const RECHECK_INTERVAL_MS = 60_000;
let lastRecheck = 0;

/** How long a resume waits for an in-flight Play call to settle on its own
 *  before deciding it was stranded. Long enough not to race a purchase that is
 *  about to succeed, short enough that a stuck button frees in a blink rather
 *  than at the provider's minutes-long timeout. */
const SETTLE_GRACE_MS = 2_500;

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
  /** Resolve a purchase/restore that the Play sheet never reported back on, and
   *  free the button. Called on resume — the only moment we can tell. Resolves
   *  true only when it flipped a non-Pro user to Pro. */
  settleStranded: () => Promise<boolean>;
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
      // Direct Billing queries Play ownership. A redeemed referral code remains
      // a local grandfathered grant and is never allowed to revoke that result.
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
      // Query Play directly on resume so pending purchases and promo redemptions
      // become visible without relying on a stale SDK customer cache.
      const entitled = await provider.isEntitled();
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

  settleStranded: async () => {
    if (!get().busy) return false;
    // Coming back to the foreground is ALSO what a normal, successful purchase
    // looks like a moment before its promise resolves. Give the in-flight call
    // a beat to land on its own rather than racing it.
    await new Promise((r) => setTimeout(r, SETTLE_GRACE_MS));
    if (!get().busy) return false;
    // Still waiting, with the sheet gone and the user back in the app. Play
    // never delivered a result: Android can destroy the host Activity behind
    // the billing sheet (testers frequently have "Don't keep activities" on),
    // and a PENDING purchase — one whose payment needs a further step — never
    // calls back at all. Either way the answer now lives with the store, not
    // with a callback that is not coming. Ask it, then release the UI.
    let unlocked = false;
    try {
      const provider = getProProvider();
      const entitled = provider.sync ? await provider.sync() : await provider.isEntitled();
      if (entitled && !get().isPro) {
        set({ isPro: true, upsellFeature: null });
        writeCache(true);
        unlocked = true;
      }
    } catch {
      // Offline or store unreachable. Freeing the button is still right: a
      // spinner the user cannot dismiss is worse than one they can retry.
    }
    set({ busy: false });
    return unlocked;
  },

  purchase: async (planID) => {
    if (get().busy) return;
    set({ busy: true });
    // The Play sheet normally appears in well under a second. When Play Billing
    // cannot reach its service it appears never — and the provider's bound is
    // deliberately minutes long, because cutting a real purchase short is the
    // worse failure. That leaves a silent spinner in between, which is exactly
    // what "it hangs" felt like to the tester. Say something instead: the sheet
    // is still the only thing that can finish this, but the user now knows the
    // app is waiting on Play rather than broken, and "Maybe later" stays live.
    //
    // MUST stay above the provider's STORE_TIMEOUT_MS (12s), which bounds the
    // getOfferings() call that runs BEFORE any sheet exists. At 12s the two
    // raced, so a store lookup that simply timed out announced itself as "still
    // waiting for the Play Store" — telling the user (and three debugging
    // sessions) that Play was holding a sheet open when Play had never been
    // asked for one. This toast may only appear once a sheet is genuinely the
    // thing being waited on; anything earlier reports its own failure.
    const slow = setTimeout(() => {
      if (get().busy) toast.info(t('Still waiting for the Play Store…'));
    }, STORE_TIMEOUT_MS + 8_000);
    try {
      const ok = await getProProvider().purchase(planID);
      if (ok) {
        // `settleStranded` may already have found this purchase on resume and
        // announced it. Setting the flag again is harmless; congratulating the
        // user twice for one payment is not.
        const alreadyKnown = get().isPro;
        set({ isPro: true, upsellFeature: null });
        writeCache(true);
        if (!alreadyKnown) toast.success(t('Pro unlocked — thank you!'));
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
      clearTimeout(slow);
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
      // A device-owned Play purchase remains valid after account sign-out.
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
