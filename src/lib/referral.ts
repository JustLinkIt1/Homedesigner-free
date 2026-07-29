import { Capacitor } from '@capacitor/core';

const REFERRAL_KEY = 'homedesigner.referral.v1';

// Referral program retired (enough test users) — no codes are currently
// redeemable. Devices that already redeemed keep Pro via redeemedReferralCode();
// to run a new campaign, add codes here and restore the entry UI in
// ProUpsellModal (see git history).
const VALID_CODES: Record<string, boolean> = {};
const GRANDFATHERED_CODES = new Set(['HOMEDESIGN50']);

function normalize(code: string): string {
  return code.trim().toUpperCase().replace(/[\s-]/g, '');
}

export function isValidReferralCode(raw: string): boolean {
  return !!VALID_CODES[normalize(raw)];
}

/** The redeemed code, or null. Legacy installs stored '1' before we kept the
 *  code itself — those can only have been HOMEDESIGN50. */
export function redeemedReferralCode(): string | null {
  try {
    const v = localStorage.getItem(REFERRAL_KEY);
    if (!v) return null;
    return v === '1' ? 'HOMEDESIGN50' : v;
  } catch {
    return null;
  }
}

export function isReferralRedeemed(): boolean {
  // Referral grants were an Android testing campaign. Browser localStorage is
  // editable and must never become a Pro entitlement source.
  if (!Capacitor.isNativePlatform()) return false;
  const code = redeemedReferralCode();
  return code !== null && GRANDFATHERED_CODES.has(normalize(code));
}

export function markReferralRedeemed(raw: string): void {
  const code = normalize(raw);
  try {
    localStorage.setItem(REFERRAL_KEY, code);
  } catch {
    /* best-effort */
  }
  if (Capacitor.isNativePlatform()) {
    import('@capacitor/preferences')
      .then(({ Preferences }) => Preferences.set({ key: REFERRAL_KEY, value: code }))
      .catch(() => {});
  }
  syncReferralAttribute();
}

/**
 * Tag this RevenueCat customer with the redeemed code so redemptions are
 * countable from the dashboard/API (the app has no backend of its own).
 * Fire-and-forget; requires Purchases.configure to have run (proStore.refresh
 * does that on launch, and calls this afterwards to backfill devices that
 * redeemed before this attribute existed).
 */
export function syncReferralAttribute(): void {
  if (!Capacitor.isNativePlatform()) return;
  const code = redeemedReferralCode();
  if (!code) return;
  import('@revenuecat/purchases-capacitor')
    .then(({ Purchases }) => Purchases.setAttributes({ referral_code: code }))
    .catch(() => {});
}
