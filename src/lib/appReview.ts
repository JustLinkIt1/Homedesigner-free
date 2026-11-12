// Google Play's in-app review card, asked for after something went well.
// The rules live in reviewPolicy.ts; this file only connects them to the
// device. On the web build both functions do nothing.
import { Capacitor } from '@capacitor/core';
import { createReviewPrompt, legacyReviewState } from './reviewPolicy';
import { useConfirm } from './ui';
import { useProStore } from '../store/proStore';
import { usePointsStore } from '../store/pointsStore';

const STATE_KEY = 'homedesigner.review.v2';
/** Written by earlier builds: the time of the last request and nothing else. */
const LEGACY_KEY = 'homedesigner.review.lastRequestedAt.v1';

const prompt = createReviewPrompt({
  android: () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android',
  now: () => Date.now(),
  read: () => localStorage.getItem(STATE_KEY) ?? legacyReviewState(localStorage.getItem(LEGACY_KEY)),
  write: (value) => {
    localStorage.setItem(STATE_KEY, value);
    localStorage.removeItem(LEGACY_KEY);
  },
  dialogOpen: () =>
    useProStore.getState().upsellOpen || usePointsStore.getState().walletOpen || useConfirm.getState().req !== null,
  launch: async () => {
    const { AppReview } = await import('@capawesome/capacitor-app-review');
    await AppReview.requestReview();
  },
});

/** The app was opened or came back to the foreground. */
export function noteAppOpened(): void {
  prompt.opened();
}

/**
 * Something just went well for the user: a file they exported was saved, an
 * AI render finished. Call it right there and nowhere else: not at launch,
 * not after an error or a cancelled action. It returns at once and never
 * throws; Play may or may not show its card, and the app shows nothing itself.
 */
export function notePositiveMoment(): void {
  void prompt.moment();
}
