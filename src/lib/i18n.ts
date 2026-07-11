// Lightweight i18n: English strings are the keys, locales map them to
// translations, unknown strings fall through to English. No dependencies.
//
//   const t = useI18n();          // in components (re-renders on change)
//   t('Draw walls')
//
//   import { t } from '.../i18n'  // outside React (toasts, data builders) —
//                                 // reads the current language at call time.
//
// Languages live in src/locales/index.ts — add one there and the pickers,
// detection and dictionaries all pick it up automatically.
import { create } from 'zustand';
import { LOCALES } from '../locales';

/** Any registered language code, e.g. 'en' | 'fr' | 'es' | 'tr'. */
export type Lang = string;
export type LangPref = 'system' | Lang;

const KEY = 'homedesigner.lang.v1';

const CODES = LOCALES.map((l) => l.code);
const DICT: Record<string, Record<string, string>> = Object.fromEntries(
  LOCALES.map((l) => [l.code, l.dict]),
);

const isCode = (v: string | null): v is Lang => !!v && CODES.includes(v);

const readPref = (): LangPref => {
  try {
    const v = localStorage.getItem(KEY);
    return isCode(v) ? v : 'system';
  } catch {
    return 'system';
  }
};

export const resolveLang = (pref: LangPref): Lang => {
  if (pref !== 'system') return pref;
  try {
    const nav = (navigator.language || '').toLowerCase();
    // First registered non-English code whose prefix matches the device locale.
    return CODES.find((c) => c !== 'en' && nav.startsWith(c)) ?? 'en';
  } catch {
    return 'en';
  }
};

/** Options for the language pickers: System first, then every registered locale. */
export const LANG_OPTIONS: { id: LangPref; label: string }[] = [
  { id: 'system', label: 'System' },
  ...LOCALES.map((l) => ({ id: l.code as LangPref, label: l.label })),
];

interface LangState {
  pref: LangPref;
  lang: Lang;
  setPref: (p: LangPref) => void;
}

export const useLang = create<LangState>((set) => ({
  pref: readPref(),
  lang: resolveLang(readPref()),
  setPref: (pref) => {
    try {
      localStorage.setItem(KEY, pref);
    } catch {
      /* best-effort */
    }
    set({ pref, lang: resolveLang(pref) });
  },
}));

/** Translate now (non-React call sites: toasts, menus built in data files). */
export function t(en: string): string {
  const lang = useLang.getState().lang;
  return DICT[lang]?.[en] ?? en;
}

/** Component hook: subscribes to the language so the UI re-renders on switch. */
export function useI18n(): (en: string) => string {
  const lang = useLang((s) => s.lang);
  return (en: string) => DICT[lang]?.[en] ?? en;
}
