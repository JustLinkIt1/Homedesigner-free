// Where a stair and its rail are cut (lib/stairCut.ts), shared by the 3D view
// and the IFC export.
//
//   * stairHoleCut is the stairwell-hole test DesignScene's roomShape used
//     inline; checked here against a copy of that old expression.
//   * stairCapY: eave under a roof, slab underside when the storey above cut no
//     hole, undefined when a hole was cut (the bundled samples' stairwells).
//
//   * clipGeometryBelowY (row 18b): the path tracer ignores clipping planes,
//     so traced Photo cuts the stair's geometry; stairPostHeight for the post.
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
export * as THREE from 'three';
`);
const out = join(dir, 'bundle.mjs');
try {
  await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent', define: { 'import.meta.env.BASE_URL': '"/"' } });
} finally {
  rmSync(entry, { force: true });
}
const { THREE, clipGeometryBelowY, stairPostHeight, SAMPLES, SLAB_T, stairHoleCut, stairHoleCutAbove, stairHoleRooms, stairHoleSpillRooms, stairCapY, stairOpeningPoints, pointInPolygon, isStairs } = await import(pathToFileURL(out).href);

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
  // Overlapping rooms above (1.22.52): the stair lies whole inside A and
  // partly inside B. The one hole rule: the hole goes in every room that holds
  // the whole footprint (A), whatever the order; B is a spill room the hole
  // must not cut. DesignScene's per-room stairHoleCut gives the same answer.
  const s = stair(400, 450, { rotation: 90, width: 100, depth: 300 });
  const A = { id: 'A', points: ground };
  const B = { id: 'B', points: box(450, 350, 800, 600) };
  for (const rooms of [[A, B], [B, A]]) {
    const order = rooms.map((r) => r.id).join('');
    const cut = stairHoleRooms(s, rooms);
    check(cut.length === 1 && cut[0] === A, `overlap ${order}: hole only in A`);
    check(rooms.filter((r) => stairHoleCut(s, r)).every((r) => cut.includes(r)) && stairHoleCut(s, A) && !stairHoleCut(s, B), `overlap ${order}: same rooms as the 3D per-room test`);
    const spill = stairHoleSpillRooms(s, rooms);
    check(spill.length === 1 && spill[0] === B, `overlap ${order}: B is the spill room`);
    check(stairHoleCutAbove(s, rooms) && stairCapY(s, { walls: wallsOf(ground), riseTo: 290, roomsAbove: rooms }) === undefined, `overlap ${order}: hole cut, stair not clipped`);
  }
  // Adjacent (non-overlapping) rooms, stair touching the shared edge: no spill.
  const t = stair(200, 150, { width: 100, depth: 300 }); // y 0..300, touching y = 300
  check(stairHoleSpillRooms(t, [{ points: box(0, 0, 800, 300) }, { points: box(0, 300, 800, 600) }]).length === 0, 'adjacent rooms, stair on the shared edge: no spill');
  // No hole anywhere: no spill either.
  check(stairHoleSpillRooms(s, [{ points: box(0, 0, 800, 300) }, { points: box(0, 300, 800, 600) }]).length === 0, 'no hole: no spill');
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
      check(stairHoleSpillRooms(s, built.floorGeom[next.id].rooms.filter((r) => !r.outdoor && r.points.length >= 3)).length === 0, `${sample.id}: stair ${s.id}: no overlapping-room spill`);
      sampleStairs++;
    }
  });
}
check(sampleStairs >= 2, `samples have stairwell stairs (${sampleStairs})`);

// ---- clipGeometryBelowY / stairPostHeight (row 18b) ---------------------------
{
  const v3 = (a, i) => new THREE.Vector3().fromBufferAttribute(a, i);
  const maxY = (g) => { const p = g.getAttribute('position'); let m = -Infinity; for (let i = 0; i < p.count; i++) m = Math.max(m, p.getY(i)); return m; };
  const minY = (g) => { const p = g.getAttribute('position'); let m = Infinity; for (let i = 0; i < p.count; i++) m = Math.min(m, p.getY(i)); return m; };
  const tris = (g) => { const idx = g.getIndex(); const p = g.getAttribute('position'); const n = idx ? idx.count : p.count; const at = (i) => (idx ? idx.getX(i) : i); const out = []; for (let i = 0; i + 2 < n; i += 3) out.push([at(i), at(i + 1), at(i + 2)]); return out; };
  const area = (g) => { const p = g.getAttribute('position'); return tris(g).reduce((s, [a, b, c]) => s + new THREE.Vector3().subVectors(v3(p, b), v3(p, a)).cross(new THREE.Vector3().subVectors(v3(p, c), v3(p, a))).length() / 2, 0); };
  const snapshot = (g) => JSON.stringify({ a: Object.fromEntries(Object.entries(g.attributes).map(([k, v]) => [k, Array.from(v.array)])), i: g.index ? Array.from(g.index.array) : null });

  // A box 1 x 2 x 1 (y -1..1) crossing y = 0.3, indexed and non-indexed.
  for (const [label, make] of [['indexed', () => new THREE.BoxGeometry(1, 2, 1)], ['non-indexed', () => new THREE.BoxGeometry(1, 2, 1).toNonIndexed()]]) {
    const box = make();
    const before = snapshot(box);
    const cut = clipGeometryBelowY(box, 0.3);
    check(cut && cut !== box, `${label} box: a new geometry`);
    check(snapshot(box) === before, `${label} box: input not mutated`);
    check(maxY(cut) === Math.fround(0.3), `${label} box: max y is the plane (${maxY(cut)})`);
    check(near(minY(cut), -1, 1e-6), `${label} box: bottom kept`);
    // Open box: bottom face 1 + four sides 1 x 1.3; the top (y = 1) is gone.
    check(near(area(cut), 1 + 4 * 1.3, 1e-5), `${label} box: area 6.2 (${area(cut)})`);
    check(cut.getAttribute('position').count % 3 === 0 && !cut.getIndex(), `${label} box: whole triangles, non-indexed`);
    const n = cut.getAttribute('normal');
    const uv = cut.getAttribute('uv');
    const p = cut.getAttribute('position');
    check(n && uv && n.count === p.count && uv.count === p.count, `${label} box: normals and uvs kept`);
    let sides = 0;
    for (let i = 0; i < p.count; i++) {
      check(near(v3(n, i).length(), 1, 1e-6), `${label} box: unit normal`);
      // +x face of BoxGeometry: v runs 0 at y = -1 to 1 at y = 1.
      if (n.getX(i) > 0.99) { check(near(uv.getY(i), (p.getY(i) + 1) / 2, 1e-6), `${label} box: uv interpolated at y ${p.getY(i)}`); sides++; }
    }
    check(sides >= 6, `${label} box: +x face present (${sides} vertices)`);
    // Winding kept: each triangle's face normal agrees with its vertex normal.
    for (const [a, b, c] of tris(cut)) {
      const fn = new THREE.Vector3().subVectors(v3(p, b), v3(p, a)).cross(new THREE.Vector3().subVectors(v3(p, c), v3(p, a)));
      check(fn.length() < 1e-9 || fn.dot(v3(n, a)) > 0, `${label} box: winding kept`);
    }
  }

  // Wholly below (touching the plane counts as below): the same object, untouched.
  {
    const box = new THREE.BoxGeometry(1, 2, 1);
    const before = snapshot(box);
    check(clipGeometryBelowY(box, 5) === box, 'below the plane: geometry returned as is');
    check(clipGeometryBelowY(box, 1) === box, 'top exactly on the plane: geometry returned as is');
    check(snapshot(box) === before, 'below the plane: not mutated');
  }
  // Wholly above: nothing.
  {
    const box = new THREE.BoxGeometry(1, 2, 1);
    const before = snapshot(box);
    check(clipGeometryBelowY(box, -1.5) === null, 'above the plane: null');
    check(clipGeometryBelowY(new THREE.BufferGeometry(), 0) === null, 'empty geometry: null');
    check(snapshot(box) === before, 'above the plane: not mutated');
  }

  // Single triangles: one corner above -> a quad (2 triangles); two above -> 1.
  {
    const tri = (pts) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3)); return g; };
    const one = clipGeometryBelowY(tri([[0, 0, 0], [1, 0, 0], [0, 1, 0]]), 0.5);
    check(one.getAttribute('position').count === 6, 'one corner above: two triangles');
    check(near(area(one), 0.375, 1e-6), `one corner above: area 0.5 - 0.125 (${area(one)})`);
    const two = clipGeometryBelowY(tri([[0, 0, 0], [1, 1, 0], [0, 1, 0]]), 0.5);
    check(two.getAttribute('position').count === 3, 'two corners above: one triangle');
    check(near(area(two), 0.125, 1e-6), `two corners above: area 0.125 (${area(two)})`);
    check(maxY(one) <= 0.5 && maxY(two) <= 0.5, 'triangles: nothing above the plane');
    // Without normals or uvs only position comes out.
    check(Object.keys(one.attributes).join() === 'position', 'triangles: only the attributes given');
  }

  // A cylinder (the shape of a rail post) through the plane: every vertex at or below it.
  {
    const cyl = new THREE.CylinderGeometry(0.05, 0.05, 3, 12);
    cyl.translate(0, 1.5, 0);
    const cut = clipGeometryBelowY(cyl, 2.2);
    check(maxY(cut) <= Math.fround(2.2) && near(maxY(cut), 2.2, 1e-6), 'cylinder: cut at 2.2');
    // 12-sided prism: side = perimeter x 2.2, bottom = the 12-gon (the top is cut off).
    const side = 12 * 2 * 0.05 * Math.sin(Math.PI / 12) * 2.2;
    const bottom = 6 * 0.05 ** 2 * Math.sin(Math.PI / 6);
    check(near(area(cut), side + bottom, 1e-5), `cylinder: side + bottom area (${area(cut)})`);
  }

  check(stairPostHeight(3.7, undefined) === 3.7, 'post: no cut, full height');
  check(stairPostHeight(3.7, 2.7) === 2.7, 'post: cut at the eave');
  check(stairPostHeight(3.7, 5) === 3.7, 'post: cut above the post');
  check(stairPostHeight(3.7, -0.2) === 0, 'post: cut below the floor, no post');
}

console.log(`stair-cut: ${checks} checks passed`);
rmSync(dir, { recursive: true, force: true });
