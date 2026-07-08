import { Capacitor } from '@capacitor/core';

const REFERRAL_KEY = 'homedesigner.referral.v1';
const API_URL = import.meta.env.VITE_REFERRAL_API as string | undefined;

const VALID_CODES: Record<string, boolean> = {
  HOMEDESIGN50: true,
};

function normalize(code: string): string {
  return code.trim().toUpperCase().replace(/[\s-]/g, '');
}

export function isReferralRedeemed(): boolean {
  try {
    return localStorage.getItem(REFERRAL_KEY) === '1';
  } catch {
    return false;
  }
}

function markReferralRedeemed(): void {
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

export async function redeemReferralCode(
  raw: string,
): Promise<{ ok: boolean; error?: string }> {
  const code = normalize(raw);
  if (!VALID_CODES[code]) return { ok: false, error: 'Invalid code' };

  if (API_URL) {
    try {
      const res = await fetch(`${API_URL}/redeem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!data.ok) {
        return {
          ok: false,
          error: data.remaining === 0
            ? 'This code has reached its limit — no more slots available'
            : 'Code not accepted',
        };
      }
    } catch {
      return { ok: false, error: 'Unable to verify code — check your connection' };
    }
  }

  markReferralRedeemed();
  return { ok: true };
}
