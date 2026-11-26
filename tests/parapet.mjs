// The parapet round a flat roof is built edge by edge, and stops where a wall
// already stands on its line.
//
//   * a plain house still gets one closed ring, the same footprint as before;
//   * a taller wall (the storey above, say) standing on the outline cuts the
//     parapet, the ends squared on the wall's faces, and no run overlaps it;
//   * an edge on a thinner wall sits on that wall's own face;
//   * corners stay closed wherever the parapet carries on.
//
//   node tests/parapet.mjs
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'hdparapet-'));
let roofs, ceil;
try {
  const outfile = join(dir, 'roofs.mjs');
  await build({ entryPoints: ['src/lib/roofGeometry.ts'], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
  roofs = await import(pathToFileURL(outfile).href);
  const ceilFile = join(dir, 'ceilings.mjs');
  await build({ entryPoints: ['src/lib/ceilings.ts'], bundle: true, format: 'esm', platform: 'node', outfile: ceilFile, logLevel: 'silent' });
  ceil = await import(pathToFileURL(ceilFile).href);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
const { buildRoofGeometry, parapetSegments, roofOutlines, roofParapetContext } = roofs;
const { roofEaveHeight, storeyTop } = ceil;

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : ` -- ${detail}`}`);
  if (!ok) failures++;
};
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const same = (p, q, eps = 1e-6) => near(p.x, q.x, eps) && near(p.y, q.y, eps);
const P = (x, y) => ({ x, y });
const wall = (id, ax, ay, bx, by, extra = {}) => ({ id, start: P(ax, ay), end: P(bx, by), thickness: 20, height: 270, color: '#fff', ...extra });
const ring = (tag, pts, extra = {}) => pts.map((p, i) => { const q = pts[(i + 1) % pts.length]; return wall(`${tag}${i}`, p.x, p.y, q.x, q.y, extra); });
const ROOF = { type: 'flat', pitch: 0, overhang: 15, thickness: 18, covering: 'tile', coveringScaleCm: 100, color: '#888', parapet: 94 };
const EAVE = 2.7;
const THICK = 15;

// Area of a polygon, and of the overlap of two convex ones (Sutherland-Hodgman).
const area = (poly) => Math.abs(poly.reduce((s, p, i) => { const q = poly[(i + 1) % poly.length]; return s + p.x * q.y - q.x * p.y; }, 0)) / 2;
function overlap(a, b) {
  const orient = (poly) => (poly.reduce((s, p, i) => { const q = poly[(i + 1) % poly.length]; return s + p.x * q.y - q.x * p.y; }, 0) >= 0 ? poly : poly.slice().reverse());
  let out = orient(a);
  const clip = orient(b);
  for (let i = 0; i < clip.length && out.length; i++) {
    const c0 = clip[i];
    const c1 = clip[(i + 1) % clip.length];
    const side = (p) => (c1.x - c0.x) * (p.y - c0.y) - (c1.y - c0.y) * (p.x - c0.x);
    const inp = out;
    out = [];
    for (let k = 0; k < inp.length; k++) {
      const p = inp[k];
      const q = inp[(k + 1) % inp.length];
      const sp = side(p);
      const sq = side(q);
      if (sp >= 0) out.push(p);
      if ((sp >= 0) !== (sq >= 0)) { const t = sp / (sp - sq); out.push(P(p.x + (q.x - p.x) * t, p.y + (q.y - p.y) * t)); }
    }
  }
  return out.length >= 3 ? area(out) : 0;
}
const footprint = (s) => [s.outer0, s.outer1, s.inner1, s.inner0];
const wallRect = (w) => {
  const l = Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y);
  const nx = (-(w.end.y - w.start.y) / l) * (w.thickness / 2);
  const ny = ((w.end.x - w.start.x) / l) * (w.thickness / 2);
  return [P(w.start.x + nx, w.start.y + ny), P(w.end.x + nx, w.end.y + ny), P(w.end.x - nx, w.end.y - ny), P(w.start.x - nx, w.start.y - ny)];
};
const closed = (segs) => {
  // Every run that ends in a corner meets the next edge's run, point for point.
  const bad = [];
  for (const s of segs) {
    if (s.cut1) continue;
    const next = segs.find((t) => t.edge !== s.edge && !t.cut0 && same(t.outer0, s.outer1, 1e-4));
    if (!next) bad.push(`edge ${s.edge} outer end`);
    else if (!same(next.inner0, s.inner1, 1e-4)) bad.push(`edge ${s.edge} inner end`);
  }
  return bad;
};

// The mitred ring as it was built before the parapet went edge by edge.
function oldRing(wallPts) {
  const n = wallPts.length;
  const a2 = wallPts.reduce((s, p, i) => { const q = wallPts[(i + 1) % n]; return s + p.x * q.y - q.x * p.y; }, 0);
  const turn = a2 >= 0 ? 1 : -1;
  return wallPts.map((p, i) => {
    const a = wallPts[(i - 1 + n) % n];
    const b = wallPts[(i + 1) % n];
    const l0 = Math.hypot(p.x - a.x, p.y - a.y) || 1;
    const l1 = Math.hypot(b.x - p.x, b.y - p.y) || 1;
    const n0 = { x: (-(p.y - a.y) / l0) * turn, y: ((p.x - a.x) / l0) * turn };
    const n1 = { x: (-(b.y - p.y) / l1) * turn, y: ((b.x - p.x) / l1) * turn };
    const along = 1 + n0.x * n1.x + n0.y * n1.y;
    const k = THICK / Math.max(along, 0.35);
    return P(p.x + (n0.x + n1.x) * k, p.y + (n0.y + n1.y) * k);
  });
}
const meshArea = (geo) => {
  // Plan area of the coping (the faces at the top of the parapet), from the mesh itself.
  const pos = geo.getAttribute('position');
  let top = -Infinity;
  for (let i = 0; i < pos.count; i++) top = Math.max(top, pos.getY(i));
  let sum = 0;
  for (let i = 0; i < pos.count; i += 3) {
    if (![0, 1, 2].every((k) => near(pos.getY(i + k), top, 1e-6))) continue;
    const [a, b, c] = [0, 1, 2].map((k) => ({ x: pos.getX(i + k) * 100, y: pos.getZ(i + k) * 100 }));
    sum += Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2;
  }
  return sum;
};

// ---- (a) a plain box house: one closed ring, as before
const BOX = [P(0, 0), P(800, 0), P(800, 600), P(0, 600)];
const boxWalls = ring('b', BOX);
{
  const o = roofOutlines(boxWalls, 15, false);
  const ctx = { carriers: boxWalls, half: 10 };
  const segs = parapetSegments(o.wall, EAVE, ctx);
  check('box: four runs, one per edge', segs.length === 4 && segs.every((s, i) => s.edge === i), JSON.stringify(segs.map((s) => s.edge)));
  check('box: no cut ends', segs.every((s) => !s.cut0 && !s.cut1));
  check('box: corners closed', closed(segs).length === 0, closed(segs).join(', '));
  const old = oldRing(o.wall);
  const same4 = segs.every((s, i) => same(s.outer0, o.wall[i], 1e-6) && same(s.inner0, old[i], 1e-6));
  check('box: same outer and inner ring as the single-ring builder', same4);
  const ringArea = area(o.wall) - area(old);
  const segArea = segs.reduce((sum, s) => sum + area(footprint(s)), 0);
  check('box: same footprint area as before (within 0.1%)', Math.abs(segArea - ringArea) / ringArea < 1e-3, `${segArea} vs ${ringArea}`);
  const r = buildRoofGeometry(o.eave, o.wall, ROOF, EAVE, ctx);
  const rOld = buildRoofGeometry(o.eave, o.wall, ROOF, EAVE);
  check('box: parapet mesh present, 24 triangles', r.infill && r.infill.getAttribute('position').count / 3 === 24);
  check('box: mesh coping area matches the ring', Math.abs(meshArea(r.infill) - ringArea) / ringArea < 1e-3, `${meshArea(r.infill)}`);
  check('box: same mesh with or without wall context', meshArea(rOld.infill) === meshArea(r.infill));
  check('box: ridgeHeight unchanged', near(r.ridgeHeight, ROOF.thickness * 0.01 + 0.94, 1e-6), String(r.ridgeHeight));
  const nrm = r.infill.getAttribute('normal');
  let upCoping = 0;
  for (let i = 0; i < nrm.count; i++) if (nrm.getY(i) > 0.99) upCoping++;
  check('box: coping faces up (normals)', upCoping === 4 * 6, String(upCoping));
  // Outside faces point away from the house, inside faces towards it.
  const pos = r.infill.getAttribute('position');
  let outward = 0;
  let wrong = 0;
  for (let i = 0; i < pos.count; i += 3) {
    if (Math.abs(nrm.getY(i)) > 0.5) continue;
    const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3 * 100 - 400;
    const cz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3 * 100 - 300;
    const isOuter = Math.abs(Math.abs(cx) - 410) < 0.5 || Math.abs(Math.abs(cz) - 310) < 0.5;
    const away = nrm.getX(i) * cx + nrm.getZ(i) * cz > 0;
    if (isOuter) outward++;
    if (isOuter !== away) wrong++;
  }
  check('box: outside faces point out, inside faces point in', outward === 8 && wrong === 0, `${outward} outer tris, ${wrong} wrong`);
}

// ---- (b) the customer's house: a porch on the front of the upper storey, thinner walls,
// and walls of the storey above standing on the ring.
const house = (t) => [
  wall('n', 0, 0, 800, 0, { thickness: t }), wall('e', 800, 0, 800, 600, { thickness: t }),
  wall('s1', 800, 600, 550, 600, { thickness: t }), wall('s2', 250, 600, 0, 600, { thickness: t }), wall('w', 0, 600, 0, 0, { thickness: t }),
];
const porch = (t) => [
  wall('p1', 550, 600, 550, 800, { thickness: t }), wall('p2', 550, 800, 250, 800, { thickness: t }), wall('p3', 250, 800, 250, 600, { thickness: t }),
];
const roofWalls = [...house(25), ...porch(10)];
{
  const o = roofOutlines(roofWalls, 15, false);
  check('porch: the outline takes in the porch (8 edges)', o && o.wall.length === 8, String(o?.wall.length));
  const half = 12.5;
  const ctx = { carriers: roofWalls, half };
  const segs = parapetSegments(o.wall, EAVE, ctx);
  check('porch: eight runs, closed ring', segs.length === 8 && closed(segs).length === 0, closed(segs).join(', '));
  // Porch side walls are 10 thick: their parapet sits on the wall's own face (x = 545 / 255 outside).
  const east = segs.find((s) => near(s.outer0.x, 555, 0.01) && near(s.outer1.x, 555, 0.01) && s.outer1.y > 700);
  const west = segs.find((s) => near(s.outer0.x, 245, 0.01) && near(s.outer1.x, 245, 0.01));
  check('porch: the porch side parapet stands on the 10 cm wall face, not the 25 cm one', !!east && !!west, JSON.stringify(segs.map((s) => [s.outer0, s.outer1])));
  // No parapet strays outside the walls: every run's outer face is within 0.5 cm of the wall face beneath it.
  const faceGap = segs.map((s) => {
    const m = P((s.outer0.x + s.outer1.x) / 2, (s.outer0.y + s.outer1.y) / 2);
    return Math.min(...roofWalls.map((w) => {
      const l = Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y);
      const d = Math.abs(((w.end.x - w.start.x) * (w.start.y - m.y) - (w.start.x - m.x) * (w.end.y - w.start.y)) / l);
      return Math.abs(d - w.thickness / 2);
    }));
  });
  check('porch: each run flush with the face of the wall under it', faceGap.every((g) => g < 0.5), faceGap.map((g) => g.toFixed(2)).join(','));
  const plain = parapetSegments(o.wall, EAVE, { half });
  check('porch: without carriers it falls back to the thickest wall line (old behaviour)', plain.length === 8 && plain.every((s) => !s.cut0 && !s.cut1));
}
{
  // The upper storey puts a wall right on the front line, and a cross wall that runs out through the back line.
  const o = roofOutlines(boxWalls, 15, false);
  const above = [
    { start: P(200, 600), end: P(500, 600), thickness: 20, top: EAVE + 2.7 }, // stands on the south line
    { start: P(400, -100), end: P(400, 300), thickness: 20, top: EAVE + 2.7 }, // crosses the north line
    { start: P(100, 300), end: P(700, 300), thickness: 20, top: EAVE + 2.7 }, // inside the house, clear of the ring
  ];
  const segs = parapetSegments(o.wall, EAVE, { carriers: boxWalls, half: 10, blockers: above });
  const rects = above.map(wallRect);
  const worst = Math.max(...segs.flatMap((s) => rects.map((r) => overlap(footprint(s), r))));
  check('repro: no parapet run overlaps a wall that stands on it', worst < 0.01, `overlap ${worst} cm2`);
  const south = segs.filter((s) => s.edge === 2).sort((p, q) => p.s0 - q.s0);
  check('repro: the front edge is cut in two round the wall', south.length === 2, String(south.length));
  // edge 2 runs from (810,610) to (-10,610): s is distance from x = 810.
  check('repro: the cuts are square on the wall ends (x = 500 and x = 200)',
    south.length === 2 && near(south[0].outer1.x, 500, 1e-6) && near(south[1].outer0.x, 200, 1e-6),
    JSON.stringify(south.map((s) => [s.outer0.x, s.outer1.x])));
  check('repro: cut ends are square across the parapet', south.every((s) => near(s.outer1.x, s.inner1.x, 1e-6) || near(s.outer0.x, s.inner0.x, 1e-6)));
  const back = segs.filter((s) => s.edge === 0);
  check('repro: the cross wall splits the back edge too', back.length === 2 && near(back[0].outer1.x, 390, 1e-6) && near(back[1].outer0.x, 410, 1e-6), JSON.stringify(back.map((s) => [s.outer0.x, s.outer1.x])));
  check('repro: an interior wall clear of the ring changes nothing', segs.filter((s) => s.edge === 1 || s.edge === 3).every((s) => !s.cut0 && !s.cut1));
  check('repro: corners still closed where the parapet carries on', closed(segs).length === 0, closed(segs).join(', '));
  check('repro: runs keep their edge index (for a per-edge on/off)', segs.every((s) => s.edge >= 0 && s.edge < 4));
  const skipped = parapetSegments(o.wall, EAVE, { skipEdges: new Set([1]) });
  check('skipEdges drops exactly that edge', skipped.length === 3 && skipped.every((s) => s.edge !== 1));
  const r = buildRoofGeometry(o.eave, o.wall, ROOF, EAVE, { carriers: boxWalls, half: 10, blockers: above });
  const pos = r.infill.getAttribute('position');
  // The end faces at the cut x = 500 look back along the edge, at the wall.
  const nr = r.infill.getAttribute('normal');
  let capOk = 0;
  for (let i = 0; i < pos.count; i += 3) {
    if ([0, 1, 2].every((k) => near(pos.getX(i + k) * 100, 500, 0.01) && near(pos.getZ(i + k) * 100, pos.getZ(i) * 100, 20))) {
      if (near(nr.getX(i), -1, 1e-6)) capOk++;
    }
  }
  check('repro: the end face at the wall faces the wall', capOk === 2, String(capOk));
  check('repro: mesh built, every vertex finite', pos.count > 0 && Array.from(pos.array).every(Number.isFinite));
  // Mesh check: no parapet vertex lies strictly inside a blocking wall's footprint.
  let inside = 0;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) * 100;
    const y = pos.getZ(i) * 100;
    for (const b of above.slice(0, 2)) {
      const r2 = wallRect(b);
      const [lo, hi] = [Math.min(...r2.map((p) => p.x)), Math.max(...r2.map((p) => p.x))];
      const [lo2, hi2] = [Math.min(...r2.map((p) => p.y)), Math.max(...r2.map((p) => p.y))];
      if (x > lo + 0.01 && x < hi - 0.01 && y > lo2 + 0.01 && y < hi2 - 0.01) inside++;
    }
  }
  check('repro: no parapet vertex inside a wall', inside === 0, String(inside));
}
{
  // Walls of the roof's own storey top out at the eave and never block it.
  const o = roofOutlines(boxWalls, 15, false);
  const own = boxWalls.map((w) => ({ start: w.start, end: w.end, thickness: w.thickness, top: EAVE }));
  const segs = parapetSegments(o.wall, EAVE, { carriers: boxWalls, half: 10, blockers: own });
  check('same-storey walls at the eave do not cut the ring', segs.length === 4 && segs.every((s) => !s.cut0 && !s.cut1));
}
{
  // A wall covering a whole edge removes it; its neighbours end at the wall.
  const o = roofOutlines(boxWalls, 15, false);
  const full = [{ start: P(-100, 600), end: P(900, 600), thickness: 20, top: 9 }];
  const segs = parapetSegments(o.wall, EAVE, { blockers: full });
  check('a wall along a whole edge removes that edge', !segs.some((s) => s.edge === 2));
  check('its neighbours stop at the wall', segs.filter((s) => s.edge === 1 || s.edge === 3).every((s) => near(s.outer1.y, 590, 1e-6) || near(s.outer0.y, 590, 1e-6) || s.cut1 || s.cut0));
}

{
  // Row 49: the roof sits on the common wall height, and the parapet stops at a
  // wall of the same storey that rises past it. The front is two walls; the
  // left half is raised to 400.
  const walls = [
    wall('fa', 0, 0, 400, 0, { height: 400 }),
    wall('fb', 400, 0, 800, 0),
    wall('r', 800, 0, 800, 600),
    wall('b', 800, 600, 0, 600),
    wall('l', 0, 600, 0, 0),
  ];
  const eave = roofEaveHeight(walls);
  check('clamp: the eave is the common height (270), not the tall wall (400)', eave === 270, String(eave));
  const o = roofOutlines(walls, 15, false);
  const segs = parapetSegments(o.wall, eave / 100, roofParapetContext(walls));
  const front = segs.filter((s) => near(s.outer0.y, -10, 1e-6) && near(s.outer1.y, -10, 1e-6));
  const tallRect = wallRect(walls[0]);
  check('clamp: no parapet run overlaps the tall wall', segs.every((s) => overlap(footprint(s), tallRect) < 1), segs.map((s) => overlap(footprint(s), tallRect).toFixed(1)).join(','));
  check('clamp: the front parapet stops square at the tall wall\'s end', front.some((s) => (s.cut0 && near(s.outer0.x, 400, 1e-6) && near(s.outer1.x, 810, 1e-6)) || (s.cut1 && near(s.outer1.x, 400, 1e-6) && near(s.outer0.x, 810, 1e-6))), JSON.stringify(front.map((s) => [s.outer0, s.outer1, s.cut0, s.cut1])));
  check('clamp: every edge keeps some parapet', new Set(segs.map((s) => s.edge)).size === 4);
  // Before: the roof sat on the tallest wall, so nothing on the storey blocked it.
  const before = parapetSegments(o.wall, storeyTop(walls) / 100, roofParapetContext(walls));
  check('clamp: at the old eave (400) the parapet did not stop there', before.length === 4 && before.every((s) => !s.cut0 && !s.cut1));
}

if (failures) {
  console.error(`\n${failures} parapet check(s) failed`);
  process.exit(1);
}
console.log('\nall parapet checks passed');
