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
  { code: 'fr', label: 'Français', dict: FR },
  { code: 'es', label: 'Español', dict: ES },
  { code: 'tr', label: 'Türkçe', dict: TR },
];
