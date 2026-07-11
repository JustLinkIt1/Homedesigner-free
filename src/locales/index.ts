// Locale registry — the single place to add a language.
//
// To add one:
//   1. Generate a skeleton:  node scripts/new-locale.mjs <code> > src/locales/<code>.ts
//   2. Translate the values (any left in English simply fall through).
//   3. Import it below and add one line to LOCALES.
// The language pickers (Settings + projects screen) and detection all read
// from this list, so nothing else needs touching.
import { FR } from './fr';
import { ES } from './es';
import { TR } from './tr';
import { DE } from './de';
import { IT } from './it';
import { PT } from './pt';
import { NL } from './nl';
import { PL } from './pl';
import { RU } from './ru';
import { JA } from './ja';
import { KO } from './ko';
import { ZH } from './zh';

export interface LocaleDef {
  /** Short language code, matched against navigator.language (e.g. 'fr'). */
  code: string;
  /** Native name shown in the language picker (e.g. 'Français'). */
  label: string;
  /** English-key → translation map. English is the source, so its dict is empty. */
  dict: Record<string, string>;
}

export const LOCALES: LocaleDef[] = [
  { code: 'en', label: 'English', dict: {} },
  { code: 'de', label: 'Deutsch', dict: DE },
  { code: 'es', label: 'Español', dict: ES },
  { code: 'fr', label: 'Français', dict: FR },
  { code: 'it', label: 'Italiano', dict: IT },
  { code: 'nl', label: 'Nederlands', dict: NL },
  { code: 'pl', label: 'Polski', dict: PL },
  { code: 'pt', label: 'Português', dict: PT },
  { code: 'ru', label: 'Русский', dict: RU },
  { code: 'tr', label: 'Türkçe', dict: TR },
  { code: 'ja', label: '日本語', dict: JA },
  { code: 'ko', label: '한국어', dict: KO },
  { code: 'zh', label: '中文', dict: ZH },
];
