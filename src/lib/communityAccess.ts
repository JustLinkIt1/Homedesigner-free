import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { COMMUNITY_URL } from './appInfo';

/** Opens the web-only forum without navigating the Android editor WebView. */
export async function openCommunityForum(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      await Browser.open({ url: COMMUNITY_URL });
      return;
    } catch {
      // Fall through for an older native shell without Capacitor Browser.
    }
  }
  window.location.assign(COMMUNITY_URL);
}
