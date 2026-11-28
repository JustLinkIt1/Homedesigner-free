// B4 (IFC customer, 28 Nov 2026): "grid off" and "lock on" reset every session.
// Grid and move-lock now live in the persisted settings key next to units etc.
// This bundles the real store, fakes localStorage, and "reloads" the app by
// importing a fresh copy of the bundle.
//
//   node tests/settings-persist.mjs
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  clear: () => mem.clear(),
};
const KEY = 'homedesigner.settings.v1';
const dir = mkdtempSync(join(tmpdir(), 'hdsettings-'));
const outfile = join(dir, 'designStore.mjs');
await build({ entryPoints: ['src/store/designStore.ts'], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent', define: { 'import.meta.env': '{}' } });
let n = 0;
const load = async () => (await import(`${pathToFileURL(outfile).href}?r=${n++}`)).useDesign.getState();

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : ` -- ${detail}`}`);
  if (!ok) failures++;
};

try {
  // Someone who never touched either setting keeps today's defaults.
  let s = await load();
  check('fresh install: grid on by default', s.showGrid === true);
  check('fresh install: lock off by default', s.moveLock === false);

  // Older settings blob (no grid/lock fields) still gives the defaults.
  mem.set(KEY, JSON.stringify({ units: 'imperial', sunTime: 9, lightsOn: false, street: true, wallAngleLock: '90' }));
  s = await load();
  check('old settings blob: grid/lock fall back to defaults', s.showGrid === true && s.moveLock === false);
  check('old settings blob: other settings untouched', s.units === 'imperial' && s.sunTime === 9 && s.wallAngleLock === '90');

  // The customer's case: grid off, lock on, then a new session.
  s.setShowGrid(false);
  s.setMoveLock(true);
  s = await load();
  check('grid off survives a reload', s.showGrid === false);
  check('lock on survives a reload', s.moveLock === true);
  check('turning them on/off keeps the other settings', s.units === 'imperial' && s.sunTime === 9 && s.lightsOn === false && s.wallAngleLock === '90');

  // And back again.
  s.setShowGrid(true);
  s.setMoveLock(false);
  s = await load();
  check('grid back on survives a reload', s.showGrid === true);
  check('lock back off survives a reload', s.moveLock === false);

  // Changing another setting doesn't wipe grid/lock.
  s.setMoveLock(true);
  s.setUnits('metric');
  s = await load();
  check('changing units keeps lock on', s.moveLock === true && s.units === 'metric');

  // Junk values fall back to defaults instead of breaking the editor.
  mem.set(KEY, JSON.stringify({ showGrid: 'no', moveLock: 1 }));
  s = await load();
  check('junk grid/lock values fall back to defaults', s.showGrid === true && s.moveLock === false);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log(failures ? `\nSETTINGS PERSIST: ${failures} failure(s)` : '\nSETTINGS PERSIST: all green');
process.exit(failures ? 1 : 0);
