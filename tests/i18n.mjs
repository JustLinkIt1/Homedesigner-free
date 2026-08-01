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

const used = new Map(); // key -> first file that asks for it
for (const file of sources(join(root, 'src'))) {
  const src = readFileSync(file, 'utf8');
  // t('…') and tr('…'). Template literals and variables are deliberately not
  // matched: they cannot be statically resolved, and a dynamic key that misses
  // still falls back to readable English.
  for (const m of src.matchAll(/\b(?:t|tr)\(\s*'((?:[^'\\]|\\.)*)'/g)) {
    const key = m[1].replace(/\\'/g, "'");
    if (!used.has(key)) used.set(key, file.replace(`${root}/`, ''));
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
