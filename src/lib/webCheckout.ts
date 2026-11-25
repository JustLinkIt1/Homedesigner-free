// Web Pro wall: price first, account second.
//
// A signed-out web visitor sees the real plan ladder (read-only catalogue, see
// `loadSignedOutWebPlans` in pro.ts), picks a plan and taps Continue. Only then
// does Google sign-in start, and when it succeeds checkout opens for the chosen
// plan with no further tap, through the SAME signed-in purchase path every other
// web buyer uses (`useProStore.purchase` -> WebRevenueCatProvider.purchase, bound
// to `google:<sub>`). The anonymous catalogue id never reaches the purchase SDK.
import { useAuthStore } from '../store/authStore';
import { useProStore } from '../store/proStore';
import { trackProCheckout } from './events';
import type { ProPlan, ProPlanID } from './pro';

interface WallPlanInput {
  native: boolean;
  /** Web build with a RevenueCat Web Billing key. */
  webBilling: boolean;
  signedIn: boolean;
  /** A signed-out Continue tap is mid-way through sign-in and checkout. */
  handoff: boolean;
  plans: ProPlan[];
  signedOutPlans: ProPlan[];
}

/** The plans the wall lists. Native and signed-in web use the account/store
 * ladder as before. Signed-out web (and the moment between sign-in and the
 * account ladder arriving, mid-handoff) uses the catalogue ladder, so the grid
 * does not vanish under the user's finger. */
export function wallPlans(i: WallPlanInput): ProPlan[] {
  if (i.native) return i.plans;
  if (!i.webBilling) return i.plans;
  if (i.signedIn && (i.plans.length > 0 || !i.handoff)) return i.plans;
  return i.signedOutPlans;
}

/** Signed-out web sheet that is selling plans: the under-button line shows. */
export function isSignedOutPlanWall(i: Pick<WallPlanInput, 'native' | 'webBilling' | 'signedIn'>): boolean {
  return !i.native && i.webBilling && !i.signedIn;
}

/** The signed-out Continue tap. Resolves when sign-in (and, on success,
 * checkout) has finished. Never throws. */
export async function continueWithPlan(planID: ProPlanID): Promise<void> {
  const pro = useProStore.getState();
  if (pro.checkoutHandoff) return;
  pro.setPendingPlan(planID);
  pro.setCheckoutHandoff(true);
  try {
    if (!useAuthStore.getState().account) {
      trackProCheckout('signin_click');
      await useAuthStore.getState().signIn();
      // Failed or closed sign-in: stay on the sheet, plan still chosen.
      if (!useAuthStore.getState().account) return;
      trackProCheckout('signin_ok');
      const now = useProStore.getState();
      // The account already owns Pro: the existing owned state (sheet gone,
      // Pro active, sign-in toast). Never open a checkout for it.
      if (now.isPro) { now.closeUpsell(); return; }
      // Ownership could not be read, so do not sell blind: the signed-in sheet
      // is showing and the user can tap Continue again.
      if (!useAuthStore.getState().purchasesLinked) return;
      // The visitor dismissed the sheet while Google was open.
      if (!now.upsellOpen) return;
    }
    await useProStore.getState().purchase(planID);
  } finally {
    useProStore.getState().setCheckoutHandoff(false);
  }
}

/** The plain "Sign in with Google" button shown when no prices could load. */
export async function signInFromWall(): Promise<void> {
  trackProCheckout('signin_click');
  await useAuthStore.getState().signIn();
  if (useAuthStore.getState().account) trackProCheckout('signin_ok');
}
