import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';

export const MODEL_STUDIO_OWNER = 'nathanjoppich@gmail.com';
export const MODEL_STUDIO_URL = 'https://homedesignerapp.com/app/model-studio/';

export function isModelStudioOwner(email: string | null | undefined): boolean {
  return email?.trim().toLowerCase() === MODEL_STUDIO_OWNER;
}

/**
 * Open the private production tool through a supported native browser surface.
 * Android WebViews may ignore window.open(), while Capacitor Browser reliably
 * hands the HTTPS page to a Custom Tab without navigating the editor away.
 */
export async function openModelStudio(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      await Browser.open({ url: MODEL_STUDIO_URL });
    } catch {
      // Keep a last-resort path for an out-of-date native shell where the new
      // plugin has not yet been registered. This navigates away from the editor
      // but is still better than the previous silent no-op.
      window.location.assign(MODEL_STUDIO_URL);
    }
    return;
  }
  window.location.assign('/app/model-studio/');
}
