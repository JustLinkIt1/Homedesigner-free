// "Watch your plan build itself": the timeline, when it plays, and how it lets go.
//
// The animation is one pure function of (scene counts, time), so it can be
// checked without a renderer: parts appear and land in order, the length is
// capped however big the plan is, and at the end every part is exactly at
// rest — the 3D view after the animation must be the 3D view without it.
//
//   node tests/build-animation.mjs
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'hdbuild-'));
let tl;
let play;
try {
  const bundle = async (entry, name) => {
    const outfile = join(dir, name);
    await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
    return import(pathToFileURL(outfile).href);
  };
  tl = await bundle('src/lib/buildTimeline.ts', 'buildTimeline.mjs');
  play = await bundle('src/lib/buildPlay.ts', 'buildPlay.mjs');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
const { buildTimeline, partPose, planOpacity, PLAN_OPACITY, restoreIfUntouched } = tl;
const { shouldAutoBuild } = play;

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : ` -- ${detail}`}`);
  if (!ok) failures++;
};

const storey = (walls, furniture, extra = {}) => ({ floors: 3, walls, ceilings: 3, furniture, roofs: 0, ...extra });
const KINDS = [['floors', 'floors'], ['wall', 'walls'], ['ceilings', 'ceilings'], ['furniture', 'furniture'], ['roof', 'roofs']];
/** Every part a description holds: [kind, storey, index]. Floors, ceilings and roofs move as one group per storey. */
const partsOf = (desc) => desc.storeys.flatMap((s, si) => KINDS.flatMap(([kind, key]) => {
  const n = kind === 'wall' || kind === 'furniture' ? s[key] : s[key] > 0 ? 1 : 0;
  return Array.from({ length: n }, (_, i) => [kind, si, i]);
}));
const start = (t, [kind, s, i]) => {
  // First time the part is visible, to 1 ms.
  let lo = 0;
  let hi = t.duration;
  while (hi - lo > 1) {
    const mid = (lo + hi) / 2;
    if (partPose(t, kind, s, i, mid).visible) hi = mid;
    else lo = mid;
  }
  return hi;
};

const small = { storeys: [storey(8, 10, { roofs: 1 })] };
const one = { storeys: [storey(1, 0)] };
const huge = { storeys: [storey(500, 500, { roofs: 1 })] };
const tower = { storeys: Array.from({ length: 6 }, (_, i) => storey(500, 500, { roofs: i === 5 ? 1 : 0 })) };
const twoStorey = { storeys: [storey(12, 8, { ceilings: 0 }), storey(10, 6, { roofs: 2 })] };

// --- length caps -------------------------------------------------------------
for (const lite of [false, true]) {
  const tag = lite ? 'lite' : 'full';
  const cap = lite ? 3000 : 6000;
  const d = (desc) => buildTimeline(desc, lite).duration;
  check(`${tag}: one wall is short (${Math.round(d(one))} ms)`, d(one) <= (lite ? 2000 : 2500));
  check(`${tag}: a small plan takes about 3.5 s or less (${Math.round(d(small))} ms)`, d(small) <= (lite ? 2600 : 3700) && d(small) >= 1500);
  check(`${tag}: 500 walls + 500 items stay under the cap (${Math.round(d(huge))} ms)`, d(huge) <= cap);
  check(`${tag}: six storeys of 500 walls stay under the cap (${Math.round(d(tower))} ms)`, d(tower) <= cap + 1e-6);
  check(`${tag}: an empty scene is harmless`, Number.isFinite(d({ storeys: [] })) && d({ storeys: [] }) <= cap);
}
check('lite is shorter than full for the same plan', buildTimeline(small, true).duration < buildTimeline(small).duration);

// --- every part ends exactly at rest ------------------------------------------
for (const [name, desc] of [['small', small], ['one wall', one], ['huge', huge], ['tower', tower], ['two storeys', twoStorey]]) {
  for (const lite of [false, true]) {
    const t = buildTimeline(desc, lite);
    const parts = partsOf(desc);
    const bad = [t.duration, t.duration + 1, 1e9].flatMap((at) => parts.filter(([k, s, i]) => {
      const p = partPose(t, k, s, i, at);
      return !(Object.is(p.dy, 0) && p.visible === true);
    }));
    check(`${name}${lite ? ' (lite)' : ''}: every part is exactly at rest from the end on`, bad.length === 0, JSON.stringify(bad[0]));
    check(`${name}${lite ? ' (lite)' : ''}: the plan is gone at the end`, planOpacity(t, t.duration) === 0 && planOpacity(t, 1e9) === 0);
  }
}

// --- monotonic progress -------------------------------------------------------
for (const [name, desc] of [['small', small], ['two storeys', twoStorey], ['huge', huge]]) {
  for (const lite of [false, true]) {
    const t = buildTimeline(desc, lite);
    const parts = partsOf(desc);
    let prevVisible = -1;
    let shrank = false;
    let reappeared = false;
    let below = false;
    const shown = new Set();
    const landed = new Set();
    for (let at = -100; at <= t.duration + 50; at += 16) {
      let visible = 0;
      parts.forEach((part, n) => {
        const p = partPose(t, ...part, at);
        if (p.visible) visible++;
        if (shown.has(n) && !p.visible) reappeared = true;
        if (p.visible) shown.add(n);
        if (landed.has(n) && p.dy > 0) reappeared = true; // landed parts never lift off again
        if (p.visible && Math.abs(p.dy) < 1e-12 && at > 0) landed.add(n);
        if (p.dy < -0.021) below = true;
      });
      if (visible < prevVisible) shrank = true;
      prevVisible = visible;
    }
    check(`${name}${lite ? ' (lite)' : ''}: parts only ever appear, never vanish`, !shrank && !reappeared);
    check(`${name}${lite ? ' (lite)' : ''}: the settle dips 2 cm at most`, !below);
    if (lite) {
      const dips = parts.some((part) => Array.from({ length: 200 }, (_, j) => partPose(t, ...part, (j / 200) * t.duration).dy).some((dy) => dy < 0));
      check(`${name} (lite): no settle dip`, !dips);
    }
    check(`${name}${lite ? ' (lite)' : ''}: nothing shows before time 0`, parts.every((part) => !partPose(t, ...part, -1).visible));
  }
}

// --- order: walls in sequence, storeys bottom-up, roof last -------------------
{
  const t = buildTimeline(twoStorey);
  const starts = (kind, s, n) => Array.from({ length: n }, (_, i) => start(t, [kind, s, i]));
  const w0 = starts('wall', 0, 12);
  check('walls drop one after another, in their stable order', w0.every((x, i) => i === 0 || x > w0[i - 1]));
  const f0 = starts('furniture', 0, 8);
  check('furniture drops one after another too', f0.every((x, i) => i === 0 || x > f0[i - 1]));
  const ground = [start(t, ['floors', 0, 0]), ...w0, ...f0];
  const upper = [start(t, ['floors', 1, 0]), ...starts('wall', 1, 10), start(t, ['ceilings', 1, 0]), ...starts('furniture', 1, 6)];
  check('storeys build bottom-up: all of the ground floor starts before the first floor', Math.max(...ground) < Math.min(...upper));
  check('floors, then walls, then furniture within a storey', start(t, ['floors', 0, 0]) < w0[0] && Math.max(...w0) < f0[0]);
  check('ceilings come after the walls and before the furniture', start(t, ['ceilings', 1, 0]) > Math.max(...starts('wall', 1, 10)) && start(t, ['ceilings', 1, 0]) < start(t, ['furniture', 1, 0]));
  const roof = [start(t, ['roof', 1, 0]), start(t, ['roof', 0, 0])];
  check('roofs land last, after every other part', Math.min(...roof) > Math.max(...ground, ...upper));
  const tHuge = buildTimeline(huge);
  check('the stagger shrinks as the count grows', tHuge.walls[0].step < t.walls[0].step);
}

// --- the plan on the ground ---------------------------------------------------
{
  const t = buildTimeline(small);
  const peak = Math.max(...Array.from({ length: 400 }, (_, j) => planOpacity(t, (j / 400) * t.duration)));
  check('the plan shows at full strength mid-build', Math.abs(peak - PLAN_OPACITY) < 1e-9);
  check('the plan is there before the first floor lands', planOpacity(t, t.floors[0].start) > 0.5);
  check('the plan is still there while the walls drop', planOpacity(t, t.walls[0].start + 100) === PLAN_OPACITY);
}

// --- when it plays by itself -----------------------------------------------
{
  const base = { projectId: 'p1', wallCount: 4, played: [], reducedMotion: false, webdriver: false, override: null };
  const auto = (patch) => shouldAutoBuild({ ...base, ...patch });
  check('a project with walls, never played here: plays', auto({}) === true);
  check('an empty project does not play (and so keeps its one play)', auto({ wallCount: 0 }) === false);
  check('...not even with ?build=on', auto({ wallCount: 0, override: 'on' }) === false);
  check('already played for this project: no', auto({ played: ['p0', 'p1'] }) === false);
  check('played for other projects only: yes', auto({ played: ['p0', 'p2'] }) === true);
  check('OS reduced motion: no', auto({ reducedMotion: true }) === false);
  check('automation (navigator.webdriver): no', auto({ webdriver: true }) === false);
  check('no project id: no', auto({ projectId: null }) === false);
  check('storage unreadable: no (else it would play on every open)', auto({ played: null }) === false);
  check('?build=off: no', auto({ override: 'off' }) === false);
  check('?build=on beats played, reduced motion, automation and storage',
    auto({ override: 'on', played: null, reducedMotion: true, webdriver: true, projectId: null }) === true);
}

// --- letting go at the end -------------------------------------------------
{
  check('a value still as the animation left it goes back to rest', restoreIfUntouched(2.2, 2.2, 0) === 0);
  check('a value someone else set since is left alone', restoreIfUntouched(1.5, 2.2, 0) === 1.5);
  check('...including a new resting value React re-applied mid-way', restoreIfUntouched(0.3, 0.8, 0) === 0.3);
  check('visibility: hidden by the animation comes back', restoreIfUntouched(false, false, true) === true);
  check('visibility: hidden by someone else stays hidden', restoreIfUntouched(false, true, true) === false);
  check('restoring twice changes nothing', restoreIfUntouched(restoreIfUntouched(2.2, 2.2, 0), 0, 0) === 0);
}

console.log(failures === 0 ? '\nBUILD ANIMATION: all green' : `\nBUILD ANIMATION: ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
