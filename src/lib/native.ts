// Thin wrapper over Capacitor so the same code runs on the web and on Android.
// On native we save renders/projects to the device and offer a share sheet;
// on the web we fall back to a normal browser download.
import { Capacitor } from '@capacitor/core';

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
    await Share.share({ title: 'Home Designer render', url: uri });
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
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  await Filesystem.writeFile({
    path: `projects/${filename}`,
    data: text,
    directory: Directory.Documents,
    encoding: 'utf8' as any,
    recursive: true,
  });
}

/**
 * Initialise native chrome (status bar, splash) and route the hardware back
 * button. `onBack` returns true if it handled the press (don't exit the app).
 */
export async function initNative(onBack: () => boolean): Promise<void> {
  if (!isNative()) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: Style.Dark });
  } catch {
    /* status bar unavailable on some devices */
  }
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
  } catch {
    /* @capacitor/app not present */
  }
}
