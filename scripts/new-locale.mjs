// Scaffold a new locale file from the canonical English key set.
//
//   node scripts/new-locale.mjs de > src/locales/de.ts
//
// Emits every translatable key with the English string as a placeholder value
// (so an untranslated locale still renders — English falls through). Translate
// the values, then register it in src/locales/index.ts. The key list is read
// from src/locales/fr.ts, which is kept complete.
import fs from 'node:fs';

const code = process.argv[2];
if (!code || !/^[a-z]{2}(-[a-z]{2})?$/i.test(code)) {
  console.error('usage: node scripts/new-locale.mjs <code>   (e.g. de, pt, pt-br)');
  process.exit(1);
}

const ref = fs.readFileSync(new URL('../src/locales/fr.ts', import.meta.url), 'utf8');

// Top-level object keys are 2-space indented; either bareword or quoted. Value
// continuation lines are 4-space indented, and comments start with / or *.
const keys = [];
const seen = new Set();
for (const line of ref.split('\n')) {
  const m = line.match(/^ {2}(?:'((?:[^'\\]|\\.)+)'|"((?:[^"\\]|\\.)+)"|([A-Za-z][\w]*)):/);
  if (!m) continue;
  const key = (m[1] ?? m[2] ?? m[3]).replace(/\\'/g, "'");
  if (!seen.has(key)) {
    seen.add(key);
    keys.push(key);
  }
}

const VAR = code.replace(/-/g, '_').toUpperCase();
const esc = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const quoteKey = (k) => (/^[A-Za-z][\w]*$/.test(k) ? k : `'${esc(k)}'`);

let out = `// ${code} locale. Keys are the English source strings (see src/lib/i18n.ts).\n`;
out += `// TODO: translate the values. Anything left in English falls through fine.\n`;
out += `export const ${VAR}: Record<string, string> = {\n`;
for (const k of keys) out += `  ${quoteKey(k)}: '${esc(k)}',\n`;
out += `};\n`;

process.stdout.write(out);
console.error(`Generated ${keys.length} keys for "${code}". Now translate values and add it to src/locales/index.ts.`);
