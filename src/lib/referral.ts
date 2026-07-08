import { Capacitor } from '@capacitor/core';

const REFERRAL_KEY = 'homedesigner.referral.v1';

const VALID_CODES: Record<string, boolean> = {
  HOMEDESIGN50: true,
};

function normalize(code: string): string {
  return code.trim().toUpperCase().replace(/[\s-]/g, '');
}

export function isValidReferralCode(raw: string): boolean {
  return !!VALID_CODES[normalize(raw)];
}

export function isReferralRedeemed(): boolean {
  try {
    return localStorage.getItem(REFERRAL_KEY) === '1';
  } catch {
    return false;
  }
}

export function markReferralRedeemed(): void {
  try {
    localStorage.setItem(REFERRAL_KEY, '1');
  } catch {
    /* best-effort */
  }
  if (Capacitor.isNativePlatform()) {
    import('@capacitor/preferences')
      .then(({ Preferences }) => Preferences.set({ key: REFERRAL_KEY, value: '1' }))
      .catch(() => {});
  }
}
