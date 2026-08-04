// Theme and tooltip hygiene.
//
// A user reported that hovering the tools "looks like it's still in light mode".
// Two causes, both invisible to every other check:
//
//   1. The buttons carried BOTH `data-tip` and a native `title`, so Chrome drew
//      its own tooltip over the styled one. A native tooltip follows the
//      BROWSER's theme, not the page's — `color-scheme: dark` cannot reach it.
//   2. The styled tooltip used `background: var(--text)` with `color: #fff`,
//      which in the dark theme is white on near-white.
//
// This pins the shape of the fix: tooltips are `data-tip` only, every one of
// them still has an accessible name, and no rule paints a light background
// without a dark counterpart.
//
//   node tests/theme.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
let fails = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) fails++;
};

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

const tsx = (dir, out = []) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) tsx(p, out);
    else if (e.name.endsWith('.tsx')) out.push(p);
  }
  return out;
};

/** End of the JSX tag opening at `i`, skipping `=>` and anything inside braces. */
function tagEnd(s, i) {
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === '>' && depth === 0 && s[j - 1] !== '=') return j;
  }
  return -1;
}

// The Model Studio is an owner-only page with its own stylesheet and no
// TooltipHost mounted, so it legitimately keeps native tooltips.
const EXEMPT = /src[\\/]model-studio[\\/]/;

const both = [];
const unnamed = [];
for (const file of tsx(join(root, 'src'))) {
  if (EXEMPT.test(file)) continue;
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/data-tip=/g)) {
    const start = src.lastIndexOf('<', m.index);
    const end = tagEnd(src, start);
    if (end < 0) continue;
    const tag = src.slice(start, end + 1);
    const where = `${file.replace(`${root}/`, '')}:${src.slice(0, start).split('\n').length}`;
    if (/\stitle=/.test(tag)) both.push(where);
    if (!/aria-label/.test(tag)) unnamed.push(where);
  }
}

check(
  'no element carries both data-tip and a native title',
  both.length === 0,
  `${both.length}: ${both.slice(0, 4).join(', ')}`,
);
check(
  'every data-tip element keeps an accessible name',
  unnamed.length === 0,
  `${unnamed.length}: ${unnamed.slice(0, 4).join(', ')}`,
);

// --- no light background without a dark counterpart -------------------------
// Google's branding requires its sign-in button to stay white in both themes.
const ALLOWED = new Set(['.google-signin', '.google-signin:hover:not(:disabled)']);
const css = readFileSync(join(root, 'src', 'index.css'), 'utf8').split('\n');
const light = [];
let depth = 0;
let selector = '';
let inDark = false;
for (let i = 0; i < css.length; i++) {
  const line = css[i].trim();
  if (line.endsWith('{')) {
    selector = line.slice(0, -1).trim();
    if (/\[data-theme='dark'\]/.test(selector)) inDark = true;
    depth++;
    continue;
  }
  if (line.startsWith('}')) {
    if (--depth <= 0) inDark = false;
    continue;
  }
  if (inDark || ALLOWED.has(selector)) continue;
  const m = /^background(?:-color)?\s*:\s*([^;]+);/.exec(line);
  if (!m || m[1].includes('var(')) continue;
  const value = m[1];
  let isLight = /\b(white|whitesmoke|ivory|snow)\b/i.test(value);
  for (let hex of value.match(/#([0-9a-fA-F]{3,8})/g) ?? []) {
    hex = hex.slice(1);
    if (hex.length === 3) hex = [...hex].map((c) => c + c).join('');
    if (hex.length < 6) continue;
    const [r, g, b] = [0, 2, 4].map((k) => parseInt(hex.slice(k, k + 2), 16));
    if (0.2126 * r + 0.7152 * g + 0.0722 * b > 190) isLight = true;
  }
  if (isLight) light.push(`${i + 1} ${selector}`);
}
check(
  'no rule paints a light background that the dark theme cannot override',
  light.length === 0,
  `${light.length}: ${light.slice(0, 4).join(' | ')}`,
);

// The tooltip's own colours must come from tokens defined in BOTH themes.
const cssAll = readFileSync(join(root, 'src', 'index.css'), 'utf8');
for (const token of ['--tip-bg', '--tip-fg', '--tip-border']) {
  const defs = (cssAll.match(new RegExp(`${token}\\s*:`, 'g')) ?? []).length;
  check(`${token} is defined for both themes`, defs >= 2, `${defs} definition(s)`);
}

// ---- the Pro badge -------------------------------------------------------
// "PRO" is a two-letter visual token, so a screen reader gets nothing useful
// from the text alone — it needs an explicit name. Keeping the badge in ONE
// component is what makes that enforceable, so also assert nobody has started
// hand-rolling the markup again somewhere else.
{
  const proTag = readFileSync(join(root, 'src', 'components', 'ProTag.tsx'), 'utf8');
  check('the Pro badge carries an accessible name', /aria-label=/.test(proTag));

  const strays = [];
  for (const file of tsx(join(root, 'src'))) {
    if (file.endsWith('ProTag.tsx')) continue;
    const src = readFileSync(file, 'utf8');
    if (/className="pro-tag-corner"/.test(src)) strays.push(file.replace(`${root}/`, ''));
  }
  check('the Pro badge markup lives in exactly one component', strays.length === 0, strays.join(', '));
}

// ---- Android 15 edge-to-edge ----------------------------------------------
// Play flagged Window.setStatusBarColor as deprecated, reached through the
// StatusBar plugin. Both of these are no-ops on Android 15+ (we target SDK 36),
// and both are the kind of call that gets pasted back in while chasing a
// status-bar bug on some older device. setStyle is NOT deprecated and must stay.
{
  // Comments are stripped first: theme.ts deliberately names both calls in a
  // comment explaining why they went away, and matching that mention would make
  // this check fail on the very documentation that keeps them gone.
  const themeSrc = stripComments(readFileSync(join(root, 'src', 'lib', 'theme.ts'), 'utf8'));
  check('edge-to-edge: no setBackgroundColor (deprecated on Android 15+)',
    !/setBackgroundColor/.test(themeSrc));
  check('edge-to-edge: no setOverlaysWebView (ignored on Android 15+)',
    !/setOverlaysWebView/.test(themeSrc));
  check('edge-to-edge: setStyle is kept, so the bar icons stay legible',
    /setStyle/.test(themeSrc));

  // The top inset must be carried by the chrome, not by .app — otherwise .app's
  // --bg paints behind the status bar and the light theme shows a grey band
  // above the white toolbar.
  const css = readFileSync(join(root, 'src', 'index.css'), 'utf8');
  const appRule = /\.app \{[^}]*\}/g;
  const appBlocks = css.match(appRule) ?? [];
  const appPadsTop = appBlocks.some((b) => /padding-top:\s*env\(safe-area-inset-top\)/.test(b));
  check('edge-to-edge: .app does not carry the top inset', !appPadsTop);
  for (const sel of ['.toolbar', '.ps-head']) {
    const block = new RegExp(`\\${sel} \\{[^}]*\\}`).exec(css)?.[0] ?? '';
    check(`edge-to-edge: ${sel} paints behind the status bar`,
      /padding-top:\s*env\(safe-area-inset-top\)/.test(block)
        && /height:\s*calc\([^)]*safe-area-inset-top/.test(block),
      block.slice(0, 80));
  }
}

// ---- R8 --------------------------------------------------------------------
// Enabled for the first time in 1.21.0. R8 cannot see Capacitor's plugin lookup
// (by name, from capacitor.plugins.json), so losing these keeps would strip
// every plugin — and nothing in the JS test suite would notice.
{
  const gradle = readFileSync(join(root, 'android', 'app', 'build.gradle'), 'utf8');
  check('r8: minification is enabled', /minifyEnabled true/.test(gradle));
  const rules = readFileSync(join(root, 'android', 'app', 'proguard-rules.pro'), 'utf8');
  check('r8: Capacitor plugin classes are kept',
    /-keep class \* extends com\.getcapacitor\.Plugin/.test(rules));
  check('r8: @PluginMethod members are kept',
    /com\.getcapacitor\.PluginMethod/.test(rules));
  check('r8: the JS bridge interface is kept',
    /JavascriptInterface/.test(rules));
}

console.log(fails ? `\nTHEME: ${fails} FAILED` : '\nTHEME: all green');
process.exit(fails ? 1 : 0);
