// App theme: 'system' | 'light' | 'dark', persisted and applied as a
// `data-theme` attribute on <html> (index.css owns the token overrides).
// Also keeps the browser/native chrome in sync (theme-color meta, Android
// status bar) and feeds the 2D Konva canvas — which can't read CSS vars —
// a JS palette via useTheme.
import { create } from 'zustand';
import { Capacitor } from '@capacitor/core';

export type ThemePref = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

const KEY = 'homedesigner.theme.v1';

const readPref = (): ThemePref => {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
    // v1.0.62: the app is dark-first. New installs (no stored pref) default to
    // dark; System/Light stay one tap away in Settings.
    return 'dark';
  } catch {
    return 'dark';
  }
};

const systemDark = () =>
  typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

export const resolve = (pref: ThemePref): ResolvedTheme =>
  pref === 'system' ? (systemDark() ? 'dark' : 'light') : pref;

const CHROME = { light: '#f6f5f2', dark: '#0a0d14' } as const;

function applyChrome(theme: ResolvedTheme) {
  document.documentElement.setAttribute('data-theme', theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', CHROME[theme]);
  if (Capacitor.isNativePlatform()) {
    import('@capacitor/status-bar')
      .then(({ StatusBar, Style }) =>
        Promise.all([
          // Keep the status bar as a solid, OS-reserved bar (NOT overlaying the
          // web content). Without this, some devices (e.g. Samsung on Android 9)
          // draw the WebView edge-to-edge under a translucent status bar, and
          // since Android doesn't populate env(safe-area-inset-top) the app's
          // top row ends up beneath the clock/battery. Reserving the bar means
          // content always sits below it and the colour below actually shows.
          StatusBar.setOverlaysWebView({ overlay: false }),
          // Style.Light = dark icons (for our light chrome) and vice versa.
          StatusBar.setStyle({ style: theme === 'dark' ? Style.Dark : Style.Light }),
          StatusBar.setBackgroundColor({ color: CHROME[theme] }),
        ]),
      )
      .catch(() => {});
  }
}

interface ThemeState {
  pref: ThemePref;
  theme: ResolvedTheme;
  setPref: (p: ThemePref) => void;
}

export const useTheme = create<ThemeState>((set) => ({
  pref: readPref(),
  theme: resolve(readPref()),
  setPref: (pref) => {
    try {
      localStorage.setItem(KEY, pref);
    } catch {
      /* best-effort */
    }
    const theme = resolve(pref);
    applyChrome(theme);
    set({ pref, theme });
  },
}));

/** Call once at startup: applies the stored theme and tracks OS changes. */
export function initTheme(): void {
  applyChrome(useTheme.getState().theme);
  try {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      const { pref } = useTheme.getState();
      if (pref !== 'system') return;
      const theme = resolve(pref);
      applyChrome(theme);
      useTheme.setState({ theme });
    });
  } catch {
    /* matchMedia unavailable */
  }
}

/** Konva 2D editor palette — the canvas can't read CSS variables. */
export interface CanvasColors {
  gridMinor: string;
  gridMajor: string;
  handleFill: string;
  handleStroke: string;
  selection: string;
  wallBody: string;
  labelInk: string;
  furnitureOutline: string;
  dimensionInk: string;
  dimensionText: string;
  dimensionOverall: string;
  /** Rounded plate behind an inline wall-length label (legible over any fill). */
  dimensionPlate: string;
  dimensionPlateStroke: string;
  symbolInk: string;
  accent: string;
}

const LIGHT: CanvasColors = {
  gridMinor: '#e4e4dd',
  gridMajor: '#d2d2c9',
  handleFill: '#ffffff',
  handleStroke: '#3b63f6',
  selection: '#3b63f6',
  wallBody: '#39414e',
  labelInk: '#0e1014',
  furnitureOutline: '#00000033',
  dimensionInk: '#7c8493',
  dimensionText: '#3f4753',
  dimensionOverall: '#2b3340',
  dimensionPlate: 'rgba(255,255,255,0.86)',
  dimensionPlateStroke: 'rgba(20,26,38,0.12)',
  symbolInk: '#242a33',
  accent: '#e0533d',
};

const DARK: CanvasColors = {
  gridMinor: '#22252c',
  gridMajor: '#2c303a',
  handleFill: '#1e2128',
  handleStroke: '#6d8bff',
  selection: '#6d8bff',
  wallBody: '#aeb5c2',
  labelInk: '#e2e6ed',
  furnitureOutline: '#ffffff2e',
  dimensionInk: '#8b93a1',
  dimensionText: '#e7ebf1',
  dimensionOverall: '#dfe3ea',
  dimensionPlate: 'rgba(24,28,36,0.82)',
  dimensionPlateStroke: 'rgba(255,255,255,0.14)',
  symbolInk: '#c9cfd9',
  accent: '#ff6b52',
};

export function canvasColors(theme: ResolvedTheme): CanvasColors {
  return theme === 'dark' ? DARK : LIGHT;
}
