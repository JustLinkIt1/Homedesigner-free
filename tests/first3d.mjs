// First project of a new install opens in 3D, once (lib/first3d.ts), and the
// view_3d_opened detail ('auto' / 'user') passes the events worker's rules.
//
//   node tests/first3d.mjs
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const store = new Map();
let storageDown = false;
globalThis.localStorage = {
  getItem: (k) => { if (storageDown) throw new Error('down'); return store.has(k) ? store.get(k) : null; },
  setItem: (k, v) => { if (storageDown) throw new Error('down'); store.set(k, String(v)); },
};
const nav = { webdriver: false };
Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true });

const dir = mkdtempSync(join(tmpdir(), 'hdfirst3d-'));
let load;
try {
  const out = join(dir, 'first3d.mjs');
  writeFileSync(out, ts.transpileModule(readFileSync('src/lib/first3d.ts', 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  }).outputText);
  load = () => import(`${pathToFileURL(out).href}?${Math.random()}`);
  var first = await load();
} finally {
  // the module is already evaluated; the file can go
  rmSync(dir, { recursive: true, force: true });
}

let failures = 0;
const check = (name, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) failures += 1; };
const KEY = 'homedesigner.first3d.v1';
const { shouldOpenFirst3D, initFirst3D, takeFirst3D, wasAuto3D, openFirst3DAfterImport } = first;

check('pending + walls opens', shouldOpenFirst3D('pending', 7, false));
check('blank project stays 2D', !shouldOpenFirst3D('pending', 0, false));
check('done, skip and unknown never open', !shouldOpenFirst3D('done', 7, false) && !shouldOpenFirst3D('skip', 7, false) && !shouldOpenFirst3D(null, 7, false));
check('automation never opens', !shouldOpenFirst3D('pending', 7, true));

// An existing install (it had a first-open marker or projects before this update)
initFirst3D(false);
check('existing install is marked skip', store.get(KEY) === 'skip');
check('existing install: no 3D', takeFirst3D(7) === false && !wasAuto3D());
initFirst3D(true);
check('a later launch cannot turn skip into pending', store.get(KEY) === 'skip');

// A new install
store.clear();
initFirst3D(true);
check('new install is marked pending', store.get(KEY) === 'pending');
initFirst3D(false);
check('the next launch keeps pending', store.get(KEY) === 'pending');
check('blank project: no 3D, still pending', takeFirst3D(0) === false && store.get(KEY) === 'pending' && !wasAuto3D());
check('sample with walls: opens in 3D', takeFirst3D(7) === true && wasAuto3D());
check('used up after one open', store.get(KEY) === 'done' && takeFirst3D(7) === false);
check('an import cannot use it twice', openFirst3DAfterImport(9) === false);

// Import after a blank start
store.clear(); initFirst3D(true);
check('import with walls after a blank start opens', openFirst3DAfterImport(9) === true && store.get(KEY) === 'done');

// Automation and broken storage
store.clear(); initFirst3D(true); nav.webdriver = true;
check('under automation it stays pending and 2D', takeFirst3D(7) === false && store.get(KEY) === 'pending');
nav.webdriver = false;
storageDown = true;
check('unreadable storage: never opens', takeFirst3D(7) === false);
check('unreadable storage: no throw on init', (() => { try { initFirst3D(true); return true; } catch { return false; } })());
storageDown = false;

// view_3d_opened detail: what events.ts sends and what the worker accepts.
const workerSrc = readFileSync('workers/design-sync/src/hd-events.ts', 'utf8');
const detailRe = new RegExp(workerSrc.match(/const DETAIL = \/(.*)\/;/)[1]);
const slug = (value, max) => value.toLowerCase().replace(/[^a-z0-9:_.-]+/g, '-').replace(/^[^a-z0-9]+/, '').slice(0, max);
check("detail 'auto' and 'user' survive the client slug and the worker's DETAIL rule",
  ['auto', 'user'].every((d) => slug(d, 64) === d && detailRe.test(d) && d.length <= 64));
const app = readFileSync('src/App.tsx', 'utf8');
check('App sends auto/user with view_3d_opened', /trackEvent\('view_3d_opened', wasAuto3D\(\) \? 'auto' : 'user'/.test(app));

if (failures) { console.log(`\n${failures} first3d check(s) FAILED.`); process.exit(1); }
console.log('\nAll first3d checks passed.');
