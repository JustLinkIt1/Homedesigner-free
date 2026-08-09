import { isNative } from './native';

const LAST_REQUEST_KEY = 'homedesigner.review.lastRequestedAt.v1';
export const REVIEW_COOLDOWN_MS = 180 * 24 * 60 * 60 * 1000;

let attemptedThisSession = false;

/** Keep the app-owned request cadence conservative; Play applies its own
 * opaque quota on top of this. Future/corrupt timestamps are treated as a
 * recent request so bad storage can never turn into a prompt loop. */
export function reviewRequestDue(lastRequestedAt: unknown, now = Date.now()): boolean {
  if (lastRequestedAt === null || lastRequestedAt === undefined || lastRequestedAt === '') return true;
  const last = Number(lastRequestedAt);
  return Number.isFinite(last) && last >= 0 && now >= last && now - last >= REVIEW_COOLDOWN_MS;
}

/** Ask only after a real success moment (currently a saved photo), never at
 * startup. Best-effort: Play may decide not to display its native sheet. */
export async function requestReviewAfterPhotoSave(): Promise<void> {
  if (!isNative() || attemptedThisSession) return;

  const now = Date.now();
  try {
    if (!reviewRequestDue(localStorage.getItem(LAST_REQUEST_KEY), now)) return;
  } catch {
    // Private/locked storage still gets at most one attempt this session.
  }

  attemptedThisSession = true;
  try {
    // Record the attempt before handing control to Play so failures or an
    // activity restart cannot cause every subsequent photo to ask again.
    localStorage.setItem(LAST_REQUEST_KEY, String(now));
  } catch {
    /* session guard above remains authoritative */
  }

  try {
    const { AppReview } = await import('@capawesome/capacitor-app-review');
    await AppReview.requestReview();
  } catch {
    // Sideloads, unavailable Play services and store quota are normal.
  }
}
