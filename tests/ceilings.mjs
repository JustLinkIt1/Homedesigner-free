// Ceilings that sit on their own room's walls, and stair handrails.
//
// Both are plain geometry, so they can be checked without a renderer:
//
//   * roomCeilingHeights: every ceiling used to hang at the tallest wall of the
//     storey. Raising one wall lifted all of them off the walls that had not
//     changed. A room's ceiling now follows the height most of its own
//     perimeter is built to.
//   * stair rails: the line a handrail follows on each side of a stair. It has
//     to stay over the treads, climb from the bottom step to the top one, and
//     trade sides when the stair is mirrored.
//
//   node tests/ceilings.mjs
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'hdceil-'));
let ceil, stairs, geo;
try {
  const bundle = async (entry, name) => {
    const outfile = join(dir, name);
    await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
    return import(pathToFileURL(outfile).href);
  };
  ceil = await bundle('src/lib/ceilings.ts', 'ceilings.mjs');
  stairs = await bundle('src/lib/stairs.ts', 'stairs.mjs');
  geo = await bundle('src/lib/geometry.ts', 'geometry.mjs');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
const { roomCeilingHeights, storeyTop, ceilingHeightAt } = ceil;
const { stairPlan, stairRailsFor } = stairs;
const { pointInPolygon } = geo;

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : ` -- ${detail}`}`);
  if (!ok) failures++;
};
const rect = (id, x, y, w, h, extra = {}) => ({
  id, name: id, floorMaterial: 'oak', color: '#fff',
  points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }], ...extra,
});
const wall = (id, ax, ay, bx, by, extra = {}) => ({
  id, start: { x: ax, y: ay }, end: { x: bx, y: by }, thickness: 15, height: 270, color: '#eee', ...extra,
});

// ---- ceilings -----------------------------------------------------------------
// Two rooms side by side sharing the wall at x=400.
//   left: (0,0)-(400,300)   right: (400,0)-(800,300)
const rooms = [rect('left', 0, 0, 400, 300), rect('right', 400, 0, 400, 300)];
const box = (over = {}) => [
  wall('l-top', 0, 0, 400, 0, over['l-top']),
  wall('l-bottom', 0, 300, 400, 300, over['l-bottom']),
  wall('l-west', 0, 0, 0, 300, over['l-west']),
  wall('shared', 400, 0, 400, 300, over.shared),
  wall('r-top', 400, 0, 800, 0, over['r-top']),
  wall('r-bottom', 400, 300, 800, 300, over['r-bottom']),
  wall('r-east', 800, 0, 800, 300, over['r-east']),
];
{
  const h = roomCeilingHeights(rooms, box());
  check('walls all one height: both ceilings sit on them', h.get('left') === 270 && h.get('right') === 270);
}
{
  // What the tester did: make one wall taller.
  const walls = box({ 'l-west': { height: 400 } });
  const h = roomCeilingHeights(rooms, walls);
  check('one raised wall: the storey top follows it', storeyTop(walls) === 400);
  check('one raised wall: its room keeps its ceiling', h.get('left') === 270, String(h.get('left')));
  check('one raised wall: the room next door is untouched', h.get('right') === 270);
}
{
  const walls = box({ 'l-top': { height: 350 }, 'l-bottom': { height: 350 }, 'l-west': { height: 350 }, shared: { height: 350 } });
  const h = roomCeilingHeights(rooms, walls);
  check('a room raised all round gets the higher ceiling', h.get('left') === 350, String(h.get('left')));
  check('its neighbour, sharing one tall wall, stays low', h.get('right') === 270, String(h.get('right')));
  check('a ceiling light hangs from its own room: tall room', ceilingHeightAt({ x: 200, y: 150 }, rooms, h, 999) === 350);
  check('a ceiling light hangs from its own room: low room', ceilingHeightAt({ x: 600, y: 150 }, rooms, h, 999) === 270);
  check('outside every room: the storey top', ceilingHeightAt({ x: 2000, y: 150 }, rooms, h, 999) === 999);
}
{
  const walls = box({ 'l-west': { height: 120 } });
  check('one lowered wall does not pull the ceiling down', roomCeilingHeights(rooms, walls).get('left') === 270);
}
{
  const walls = [...box(), wall('pony', 200, 0, 200, 300, { height: 60, halfWall: true }), wall('fence', 0, -200, 800, -200, { height: 110, kind: 'fence' })];
  const h = roomCeilingHeights(rooms, walls);
  check('half walls and fences carry no ceiling', h.get('left') === 270 && h.get('right') === 270);
}
{
  const h = roomCeilingHeights([rect('patio', 0, 0, 400, 300, { outdoor: true }), rect('lone', 5000, 5000, 300, 300)], box());
  check('an outdoor surface has no ceiling', !h.has('patio'));
  check('a room with no walls round it falls back to the storey top', h.get('lone') === 270);
}

// ---- stair handrails ------------------------------------------------------------
const SHAPES = [
  ['stairs', 100, 250], ['stairs_l', 240, 320], ['stairs_u', 220, 290], ['stairs_spiral', 160, 160],
];
for (const [shape, w, d] of SHAPES) {
  const plan = stairPlan(shape, w, d, 280);
  const top = Math.max(...plan.treads.map((t) => t.level));
  check(`${shape}: has a handrail line`, plan.rails.length === (shape === 'stairs_spiral' ? 1 : 2));
  const overTreads = plan.rails.every((r) => {
    // Sample the whole line, not just its corners.
    for (let i = 0; i + 1 < r.pts.length; i++) {
      for (const f of [0.02, 0.25, 0.5, 0.75, 0.98]) {
        const p = { x: r.pts[i].x + (r.pts[i + 1].x - r.pts[i].x) * f, y: r.pts[i].y + (r.pts[i + 1].y - r.pts[i].y) * f };
        if (!plan.treads.some((t) => pointInPolygon(p, t.poly))) return false;
      }
    }
    return true;
  });
  check(`${shape}: every rail stays over the treads`, overTreads);
  const climbs = plan.rails.every((r) => {
    const levels = r.pts.map((p) => p.level);
    return levels.every((l, i) => i === 0 || l >= levels[i - 1] - 1e-9)
      && levels[0] <= 1 && Math.abs(levels[levels.length - 1] - top) <= 0.5 + 1e-9;
  });
  check(`${shape}: every rail climbs from the first step to the top one`, climbs);
  // The rail is never far from the tread under it: within one rise either way.
  const hugs = plan.rails.every((r) => {
    for (let i = 0; i + 1 < r.pts.length; i++) {
      for (const f of [0.1, 0.5, 0.9]) {
        const a = r.pts[i], b = r.pts[i + 1];
        const p = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
        const level = a.level + (b.level - a.level) * f;
        const tread = plan.treads.find((t) => pointInPolygon(p, t.poly));
        if (!tread || Math.abs(tread.level - level) > 1 + 1e-9) return false;
      }
    }
    return true;
  });
  check(`${shape}: the rail follows the treads beneath it`, hugs);

  const mirrored = stairPlan(shape, w, d, 280, true);
  const swapped = mirrored.rails.every((r, i) => r.side !== plan.rails[i].side
    && r.pts.every((p, k) => Math.abs(p.x + plan.rails[i].pts[k].x) < 1e-9 && p.y === plan.rails[i].pts[k].y));
  check(`${shape}: mirrored, the rails flip and trade sides`, swapped);

  check(`${shape}: no handrail unless one is chosen`, stairRailsFor(plan, undefined).length === 0);
  check(`${shape}: both sides shows every rail`, stairRailsFor(plan, 'both').length === plan.rails.length);
  if (shape === 'stairs_spiral') {
    check('spiral: any choice shows its one rail', stairRailsFor(plan, 'right').length === 1 && stairRailsFor(plan, 'left').length === 1);
  } else {
    const left = stairRailsFor(plan, 'left');
    check(`${shape}: one side shows only that rail`, left.length === 1 && left[0].side === 'left');
  }
}
{
  // Walking up a straight stair (towards +y in plan), the right hand is at -x.
  const plan = stairPlan('stairs', 100, 250, 280);
  const right = plan.rails.find((r) => r.side === 'right');
  check('straight stair: the right-hand rail is on the right going up', right.pts.every((p) => p.x < 0));
}

console.log(failures === 0 ? '\nCEILINGS: all green' : `\nCEILINGS: ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
