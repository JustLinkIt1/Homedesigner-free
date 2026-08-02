// Thin wrapper over Capacitor so the same code runs on the web and on Android.
// On native we save renders/projects to the device and offer a share sheet;
// on the web we fall back to a normal browser download.
import { Capacitor } from '@capacitor/core';
import { APP_NAME, PLAY_STORE_URL } from './appInfo';
import { t } from './i18n';

export const isNative = () => Capacitor.isNativePlatform();

function dataUrlToBase64(dataUrl: string): string {
  return dataUrl.split(',')[1] ?? '';
}

/** Trigger a browser download of a data URL. */
function webDownload(dataUrl: string, filename: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Save a PNG data URL. On Android it writes to the app's Documents dir and
 * opens the share sheet (so the user can save to Photos / Drive / etc.).
 */
export async function saveImage(dataUrl: string, filename: string): Promise<void> {
  if (!isNative()) {
    webDownload(dataUrl, filename);
    return;
  }
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  const { Share } = await import('@capacitor/share');
  const path = `renders/${filename}`;
  await Filesystem.writeFile({
    path,
    data: dataUrlToBase64(dataUrl),
    directory: Directory.Documents,
    recursive: true,
  });
  const { uri } = await Filesystem.getUri({ path, directory: Directory.Documents });
  try {
    // The image is the payload; the text is its caption. A shared render used
    // to travel with no name and no link, so anyone who liked one had no way
    // to find the app — the single cheapest organic channel, wasted.
    //
    // Three lines rather than a sentence: the product name has to lead so the
    // brand is not embedded in a translation key, and "made with X" word order
    // is not the same in Japanese or Korean as it is in English.
    await Share.share({
      title: `${APP_NAME} render`,
      text: `${APP_NAME}\n${t('Design your dream home')}\n${PLAY_STORE_URL}`,
      url: uri,
    });
  } catch {
    /* user dismissed the share sheet — file is still saved */
  }
}

/** Save a text file (e.g. exported project JSON). */
export async function saveText(text: string, filename: string, mime = 'application/json'): Promise<void> {
  if (!isNative()) {
    webDownload(`data:${mime};charset=utf-8,${encodeURIComponent(text)}`, filename);
    return;
  }
  const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
  await Filesystem.writeFile({
    path: `projects/${filename}`,
    data: text,
    directory: Directory.Documents,
    encoding: Encoding.UTF8,
    recursive: true,
  });
}

/**
 * Initialise native chrome (status bar, splash), route the hardware back button
 * and report returns to the foreground. `onBack` returns true if it handled the
 * press (don't exit the app); `onResume` runs whenever the app becomes active
 * again, which is when work done outside it (redeeming a Play promo code) has
 * to be picked up.
 */
export async function initNative(onBack: () => boolean, onResume?: () => void): Promise<void> {
  if (!isNative()) return;
  // Status-bar style/background are owned entirely by src/lib/theme.ts, which
  // sets them from the RESOLVED theme (dark icons on light chrome, light icons
  // on dark) at startup and on every theme change. Setting Style.Light here
  // unconditionally previously overrode that and left the icons invisible on
  // the dark background in dark mode — so we intentionally don't touch it.
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide();
  } catch {
    /* no splash configured */
  }
  try {
    const { App } = await import('@capacitor/app');
    App.addListener('backButton', ({ canGoBack }) => {
      const handled = onBack();
      if (!handled && !canGoBack) App.exitApp();
    });
    if (onResume) {
      App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) onResume();
      });
    }
  } catch {
    /* @capacitor/app not present */
  }
}
