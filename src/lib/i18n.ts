// Lightweight i18n: English strings are the keys, locales map them to
// translations, unknown strings fall through to English. No dependencies.
//
//   const t = useI18n();          // in components (re-renders on change)
//   t('Draw walls')
//
//   import { t } from '.../i18n'  // outside React (toasts, data builders) —
//                                 // reads the current language at call time.
import { create } from 'zustand';
import { FR } from '../locales/fr';

export type LangPref = 'system' | 'en' | 'fr';
export type Lang = 'en' | 'fr';

const KEY = 'homedesigner.lang.v1';

const readPref = (): LangPref => {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'en' || v === 'fr' ? v : 'system';
  } catch {
    return 'system';
  }
};

export const resolveLang = (pref: LangPref): Lang => {
  if (pref !== 'system') return pref;
  try {
    return (navigator.language || '').toLowerCase().startsWith('fr') ? 'fr' : 'en';
  } catch {
    return 'en';
  }
};

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

const DICT: Record<Lang, Record<string, string>> = { en: {}, fr: FR };

/** Translate now (non-React call sites: toasts, menus built in data files). */
export function t(en: string): string {
  const lang = useLang.getState().lang;
  return DICT[lang][en] ?? en;
}

/** Component hook: subscribes to the language so the UI re-renders on switch. */
export function useI18n(): (en: string) => string {
  const lang = useLang((s) => s.lang);
  return (en: string) => DICT[lang][en] ?? en;
}
