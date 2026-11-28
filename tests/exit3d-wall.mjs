// The Pro wall the first time a free user leaves 3D (lib/exit3dWall.ts), once
// per install, and its pro_wall_shown detail '3d_exit' passes events.ts and
// the events worker's rules.
//
//   node tests/exit3d-wall.mjs
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const store = new Map();
let storageDown = false;
let writeDown = false;
globalThis.localStorage = {
  getItem: (k) => { if (storageDown) throw new Error('down'); return store.has(k) ? store.get(k) : null; },
  setItem: (k, v) => { if (storageDown || writeDown) throw new Error('down'); store.set(k, String(v)); },
};

const dir = mkdtempSync(join(tmpdir(), 'hdexit3d-'));
let mod;
try {
  const out = join(dir, 'exit3dWall.mjs');
  writeFileSync(out, ts.transpileModule(readFileSync('src/lib/exit3dWall.ts', 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  }).outputText);
  mod = await import(pathToFileURL(out).href);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

let failures = 0;
const check = (name, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) failures += 1; };
const KEY = 'homedesigner.exit3dWall.v1';
const { shouldShowExit3DWall, exit3DWallShown, noteLeft3D } = mod;
const free = { from: '3d', isPro: false, dialogOpen: false, reviewAsked: false };
let opens = 0;
const open = () => { opens += 1; };

// Pure rule.
check('free user, first exit from 3D: shows', shouldShowExit3DWall(false, free));
check('already shown: never again', !shouldShowExit3DWall(true, free));
check('Pro: never', !shouldShowExit3DWall(false, { ...free, isPro: true }));
check('a dialog is open: not now', !shouldShowExit3DWall(false, { ...free, dialogOpen: true }));
check('Play review card asked this launch: not now', !shouldShowExit3DWall(false, { ...free, reviewAsked: true }));
check('2D pressed while already in 2D: not an exit', !shouldShowExit3DWall(false, { ...free, from: '2d' }));

// Pro never sees it, and that does not use it up.
check('Pro exit: no wall', noteLeft3D({ ...free, isPro: true }, open) === false && opens === 0);
check('Pro exit leaves the flag unset', store.get(KEY) === undefined);
// Skipped exits leave it for later.
check('exit with a dialog open: no wall, flag unset', noteLeft3D({ ...free, dialogOpen: true }, open) === false && opens === 0 && !store.has(KEY));
check('exit after a review request: no wall, flag unset', noteLeft3D({ ...free, reviewAsked: true }, open) === false && opens === 0 && !store.has(KEY));

// First exit fires and persists; the second does not.
check('first exit opens the wall', noteLeft3D(free, open) === true && opens === 1);
check('flag persisted', store.get(KEY) === 'shown' && exit3DWallShown());
check('second exit: no wall', noteLeft3D(free, open) === false && opens === 1);

// A persisted flag from an earlier launch is respected.
store.clear();
store.set(KEY, 'shown');
check('flag from an earlier launch: no wall', noteLeft3D(free, open) === false && opens === 1);
store.set(KEY, 'garbage');
check('unknown stored value is not "shown"', !exit3DWallShown());
store.clear();

// Storage that cannot remember it never shows it.
storageDown = true;
check('storage unreadable: counts as shown, no wall', exit3DWallShown() && noteLeft3D(free, open) === false && opens === 1);
storageDown = false;
writeDown = true;
check('storage read-only: no wall (it would show every time)', noteLeft3D(free, open) === false && opens === 1);
writeDown = false;

// pro_wall_shown detail '3d_exit': not limited by events.ts, kept by its slug, accepted by the worker.
const events = readFileSync('src/lib/events.ts', 'utf8');
const slugSrc = events.match(/const slug = \(value: string, max: number\): string =>\s*([^;]+);/)[1];
const slug = new Function('value', 'max', `return ${slugSrc};`);
const workerSrc = readFileSync('workers/design-sync/src/hd-events.ts', 'utf8');
const detailRe = new RegExp(workerSrc.match(/const DETAIL = \/(.*)\/;/)[1]);
check("events.ts has no pro_wall_shown detail allowlist", !/event === 'pro_wall_shown'/.test(events));
check("'3d_exit' survives the client slug", slug('3d_exit', 64) === '3d_exit');
check("'3d_exit' passes the worker's DETAIL rule", detailRe.test('3d_exit'));

// Wiring: the trigger is a ProTrigger, has no copy of its own, and the 2D toggle opens it with no feature.
const pro = readFileSync('src/lib/pro.ts', 'utf8');
check("'3d_exit' is a ProTrigger", /export type ProTrigger =[^;]*'3d_exit'/.test(pro));
const toolbar = readFileSync('src/components/Toolbar.tsx', 'utf8');
check('2D toggle opens the wall with no feature and trigger 3d_exit', toolbar.includes("openUpsell(null, '3d_exit')") && toolbar.includes('noteLeft3D('));

if (failures) {
  console.log(`\nEXIT3D WALL: ${failures} failing`);
  process.exit(1);
}
console.log('\nEXIT3D WALL: all green');
