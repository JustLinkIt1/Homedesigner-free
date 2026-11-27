// Where a stair and its rail are cut (lib/stairCut.ts), shared by the 3D view
// and the IFC export.
//
//   * stairHoleCut is the stairwell-hole test DesignScene's roomShape used
//     inline; checked here against a copy of that old expression.
//   * stairCapY: eave under a roof, slab underside when the storey above cut no
//     hole, undefined when a hole was cut (the bundled samples' stairwells).
//
//   node tests/stair-cut.mjs
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = process.cwd();
const rootImport = root.replaceAll('\\', '/');
const dir = mkdtempSync(join(tmpdir(), 'hdstaircut-'));
const entry = join(root, '.staircut-entry.tmp.ts');
writeFileSync(entry, `
export { SAMPLES } from '${rootImport}/src/data/samples.ts';
export * from '${rootImport}/src/lib/stairCut.ts';
export { stairOpeningPoints } from '${rootImport}/src/lib/walkNavigation.ts';
export { pointInPolygon } from '${rootImport}/src/lib/geometry.ts';
export { isStairs } from '${rootImport}/src/lib/stairs.ts';
`);
const out = join(dir, 'bundle.mjs');
try {
  await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent', define: { 'import.meta.env.BASE_URL': '"/"' } });
} finally {
  rmSync(entry, { force: true });
}
const { SAMPLES, SLAB_T, stairHoleCut, stairHoleCutAbove, stairCapY, stairOpeningPoints, pointInPolygon, isStairs } = await import(pathToFileURL(out).href);

let checks = 0;
const check = (v, label) => { assert.ok(v, label); checks++; };
const near = (a, b, eps = 1e-9) => a != null && Math.abs(a - b) <= eps;

const P = (x, y) => ({ x, y });
const box = (x0, y0, x1, y1) => [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)];
const wallsOf = (pts, height = 270) => pts.map((p, i) => ({ id: `w${i}`, start: p, end: pts[(i + 1) % pts.length], thickness: 20, height, color: '#fff' }));
const stair = (x, y, extra = {}) => ({ id: 's', type: 'stairs', name: 'Stairs', position: P(x, y), rotation: 0, width: 90, depth: 280, height: 280, color: '#fff', railing: 'both', ...extra });
const FLAT = { type: 'flat', pitch: 0, overhang: 15, thickness: 18, parapet: 94, covering: 'tile', coveringScaleCm: 100, color: '#888' };

// ---- stairHoleCut = the old inline test -----------------------------------------
{
  const old = (s, room) => stairOpeningPoints(s).every((point) => pointInPolygon(point, room.points));
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const rooms = [
    { points: box(0, 0, 400, 500) },
    { points: [P(0, 0), P(600, 0), P(600, 300), P(300, 300), P(300, 600), P(0, 600)] },
    { points: [P(100, 0), P(500, 100), P(400, 500), P(0, 400)] },
  ];
  let agree = 0, cut = 0;
  for (let i = 0; i < 3000; i++) {
    const s = stair(rnd() * 700 - 50, rnd() * 700 - 50, { rotation: Math.floor(rnd() * 8) * 45 + (rnd() < 0.2 ? rnd() * 90 : 0), width: 60 + rnd() * 200, depth: 60 + rnd() * 300, type: ['stairs', 'stairs_l', 'stairs_u', 'stairs_spiral'][i % 4] });
    for (const room of rooms) {
      const a = stairHoleCut(s, room);
      assert.equal(a, old(s, room), `stairHoleCut differs from the old test for ${JSON.stringify(s)} in ${JSON.stringify(room.points)}`);
      agree++;
      if (a) cut++;
    }
  }
  checks++;
  check(cut > 100 && cut < agree - 100, `random cases cover both outcomes (${cut} cut of ${agree})`);
}

// ---- stairCapY ------------------------------------------------------------------
const ground = box(0, 0, 800, 600);
{
  // Top storey under a flat roof: the eave (walls 270 → 2.7 m).
  const s = stair(200, 300);
  check(near(stairCapY(s, { walls: wallsOf(ground), roof: FLAT }), 2.7), 'top storey under a flat roof: cut at the eave');
  // Roof eave follows roofEaveHeight, not the tallest wall.
  const walls = wallsOf(ground);
  walls[0].height = 400;
  check(near(stairCapY(s, { walls, roof: FLAT }), 2.7), 'top storey: eave from roofEaveHeight, not the one tall wall');
  // No roof and nothing above: open terrace, no cut.
  check(stairCapY(s, { walls: wallsOf(ground) }) === undefined, 'top storey without a roof: no cut');
}
{
  // Storey above, room holds the whole footprint: hole cut, no clip.
  const s = stair(200, 300);
  const roomsAbove = [{ points: ground }];
  check(stairHoleCutAbove(s, roomsAbove), 'whole footprint in a room above: hole cut');
  check(stairCapY(s, { walls: wallsOf(ground), riseTo: 290, roomsAbove }) === undefined, 'hole cut: no clip');
  check(stairCapY(s, { walls: wallsOf(ground), roof: FLAT, riseTo: 290, roomsAbove }) === undefined, 'hole cut: no clip, even on a roof-carrying storey');
}
{
  // Footprint crosses a room line above (two rooms split at y = 300): no hole,
  // cut at the underside of the upper slab.
  const s = stair(200, 300);
  const roomsAbove = [{ points: box(0, 0, 800, 300) }, { points: box(0, 300, 800, 600) }];
  check(!stairHoleCutAbove(s, roomsAbove), 'footprint across a room line above: no hole');
  const y = stairCapY(s, { walls: wallsOf(ground), riseTo: 290, roomsAbove });
  check(near(y, 2.9 - SLAB_T), `no hole: cut at the slab underside (got ${y})`);
  check(SLAB_T === 0.22, 'slab is 22 cm');
}
{
  // Nothing above the stair at all (upper storey is elsewhere), storey carries a roof: eave.
  const s = stair(100, 150);
  const roomsAbove = [{ points: box(400, 0, 800, 600) }];
  check(near(stairCapY(s, { walls: wallsOf(ground), roof: FLAT, riseTo: 290, roomsAbove }), 2.7), 'no room above the stair: falls back to the roof eave');
  check(stairCapY(s, { walls: wallsOf(ground), riseTo: 290, roomsAbove }) === undefined, 'no room above, no roof: no cut');
}

// ---- samples: a normal stairwell is never clipped ------------------------------
let sampleStairs = 0;
for (const sample of SAMPLES) {
  const built = sample.build();
  if (!built.floors) continue;
  const ordered = [...built.floors].sort((a, b) => a.elevation - b.elevation);
  ordered.forEach((f, i) => {
    const g = built.floorGeom[f.id];
    const next = ordered[i + 1];
    if (!next) return;
    for (const s of g.furniture.filter(isStairs)) {
      const y = stairCapY(s, { walls: g.walls, roof: f.roof, riseTo: next.elevation - f.elevation, roomsAbove: built.floorGeom[next.id].rooms });
      check(y === undefined, `${sample.id}: stair ${s.id} on ${f.name} sits in a stairwell, no clip (got ${y})`);
      sampleStairs++;
    }
  });
}
check(sampleStairs >= 2, `samples have stairwell stairs (${sampleStairs})`);

console.log(`stair-cut: ${checks} checks passed`);
rmSync(dir, { recursive: true, force: true });
