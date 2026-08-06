// Translation coverage.
//
// A tester in French saw "Tap a wall to place Passage ouvert" — an English
// sentence wrapped around a translated item name. The cause was not a bug in
// the i18n layer: `t()` falls back to English by design, silently, so a string
// added to a component after the last translation pass simply stays English
// forever and nothing anywhere complains. Forty-three of them had accumulated.
//
// This walks every t('...') / tr('...') call with a literal argument and asserts
// each one exists in every locale. Pure Node — it reads the sources directly, so
// it costs nothing and cannot drift from what the app actually calls.
//
//   node tests/i18n.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
let fails = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) fails++;
};

// --- every translatable literal the app actually asks for -------------------
const sources = (dir, out = []) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'locales' || e.name === 'node_modules') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) sources(p, out);
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
};

/** Blank out comments so prose that *describes* a call is not mistaken for one.
 *  A doc comment explaining why `t('Made with')` would be wrong is not a
 *  translatable string, and treating it as one fails the build for a phrase
 *  that never reaches a user. Tracks strings/templates so a `//` inside one is
 *  left alone. */
function stripComments(src) {
  let out = '';
  let i = 0;
  let quote = null; // "'", '"', '`' or null
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    if (quote) {
      out += c;
      if (c === '\\') { out += next ?? ''; i += 2; continue; }
      if (c === quote) quote = null;
      i++;
      continue;
    }
    if (c === '/' && next === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && next === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] === '\n') out += '\n'; // keep line numbers honest
        i++;
      }
      i += 2;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') quote = c;
    out += c;
    i++;
  }
  return out;
}

const used = new Map(); // key -> first file that asks for it
for (const file of sources(join(root, 'src'))) {
  const src = stripComments(readFileSync(file, 'utf8'));
  // t('…') and tr('…'). Template literals and variables are deliberately not
  // matched: they cannot be statically resolved, and a dynamic key that misses
  // still falls back to readable English.
  // BOTH quote styles. Single-quoted only was the original rule, which silently
  // exempted every string containing an apostrophe — i.e. most of the
  // user-facing error copy ("Couldn't load that image.") — from the 12-locale
  // coverage check. Six strings were hiding behind it.
  for (const m of src.matchAll(/\b(?:t|tr)\(\s*'((?:[^'\\]|\\.)*)'/g)) {
    const key = m[1].replace(/\\'/g, "'");
    if (!used.has(key)) used.set(key, file.replace(`${root}/`, ''));
  }
  for (const m of src.matchAll(/\b(?:t|tr)\(\s*"((?:[^"\\]|\\.)*)"/g)) {
    const key = m[1].replace(/\\"/g, '"');
    if (!used.has(key)) used.set(key, file.replace(`${root}/`, ''));
  }
}

// The catalog chip row renders `t(value)` over a runtime list, so the scanner
// above cannot see those keys — a category could ship untranslated in all 12
// locales and nothing would fail. That is exactly what happened to the "Free"
// chip. Resolve the list from the data and require it explicitly.
{
  const catalogSrc = readFileSync(join(root, 'src', 'data', 'furnitureCatalog.ts'), 'utf8');
  for (const m of catalogSrc.matchAll(/\bcategory:\s*'((?:[^'\\]|\\.)*)'/g)) {
    const key = m[1].replace(/\\'/g, "'");
    if (!used.has(key)) used.set(key, 'src/data/furnitureCatalog.ts (category chip)');
  }
  // The two pseudo-categories the chip row adds on top of the real ones.
  for (const key of ['All', 'Free']) {
    if (!used.has(key)) used.set(key, 'src/components/CatalogSidebar.tsx (category chip)');
  }
}

// --- what each locale actually defines --------------------------------------
const localeFiles = readdirSync(join(root, 'src', 'locales'))
  .filter((f) => f.endsWith('.ts') && f !== 'index.ts');

const keysOf = (file) => {
  const src = readFileSync(join(root, 'src', 'locales', file), 'utf8');
  const keys = new Set();
  for (const m of src.matchAll(/^\s*'((?:[^'\\]|\\.)*)':/gm)) keys.add(m[1].replace(/\\'/g, "'"));
  // Single-word keys are written unquoted (All, Living, Kitchen…).
  for (const m of src.matchAll(/^\s*([A-Za-z_]\w*):/gm)) keys.add(m[1]);
  return keys;
};

check(`found ${used.size} translatable strings across the app`, used.size > 200);
check(`found ${localeFiles.length} locales`, localeFiles.length >= 12);

for (const file of localeFiles) {
  const keys = keysOf(file);
  const missing = [...used.keys()].filter((k) => !keys.has(k));
  check(
    `${file.replace('.ts', '')}: every string the app asks for is translated`,
    missing.length === 0,
    `${missing.length} missing, e.g. ${missing.slice(0, 4).map((k) => JSON.stringify(k)).join(', ')}`
      + ` (first from ${used.get(missing[0])})`,
  );
}

// A translation that is byte-identical to its English key across a whole locale
// usually means a block was pasted without being translated. Proper nouns and
// short shared words legitimately match, so this only trips on a large share.
for (const file of localeFiles) {
  const src = readFileSync(join(root, 'src', 'locales', file), 'utf8');
  let same = 0;
  let total = 0;
  for (const m of src.matchAll(/^\s*'((?:[^'\\]|\\.)*)':\s*'((?:[^'\\]|\\.)*)',/gm)) {
    total++;
    if (m[1] === m[2]) same++;
  }
  check(
    `${file.replace('.ts', '')}: entries are actually translated`,
    total === 0 || same / total < 0.25,
    `${same}/${total} identical to the English key`,
  );
}

console.log(fails ? `\nI18N: ${fails} FAILED` : '\nI18N: all green');
process.exit(fails ? 1 : 0);
