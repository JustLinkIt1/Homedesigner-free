// Pure-Node geometry checks for the roof pipeline. These functions decide real
// building geometry and are exactly the kind of thing that must not be validated
// by eyeball, so they get deterministic assertions instead.
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Compile the two TS modules under test to a temp ESM bundle via esbuild (already
// a Vite dependency), so this runs with plain `node` and no browser.
const dir = mkdtempSync(join(tmpdir(), 'hdgeo-'));
const entry = join(dir, 'entry.ts');
writeFileSync(entry, `
export { offsetPolygon, orientedBox, boxFillRatio } from '${process.cwd()}/src/lib/polygonOffset.ts';
export { detectBuildingOutline, detectRooms } from '${process.cwd()}/src/lib/roomDetection.ts';
export { polygonArea } from '${process.cwd()}/src/lib/geometry.ts';
export { buildRoofGeometry, effectiveRoofType, roofNeedsFallback, roofFootprint, roofOutlines } from '${process.cwd()}/src/lib/roofGeometry.ts';
export { normalizeRoofs, roofFloorId, DEFAULT_ROOF } from '${process.cwd()}/src/lib/roof.ts';
`);
const out = join(dir, 'bundle.mjs');
execFileSync(join(process.cwd(), 'node_modules/.bin/esbuild'), [
  entry, '--bundle', '--format=esm', '--platform=neutral', `--outfile=${out}`,
], { stdio: 'pipe' });

const {
  offsetPolygon, orientedBox, boxFillRatio, detectBuildingOutline, polygonArea,
  buildRoofGeometry, effectiveRoofType, roofNeedsFallback, roofFootprint, roofOutlines,
  normalizeRoofs, roofFloorId, DEFAULT_ROOF,
} = await import(out);

let fails = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) fails++;
};
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const rect = (w, h) => [ {x:0,y:0}, {x:w,y:0}, {x:w,y:h}, {x:0,y:h} ];

// ---- offsetPolygon -------------------------------------------------------
{
  const r = offsetPolygon(rect(400, 300), 50);
  const area = Math.abs(polygonArea(r));
  // A rectangle offset by d grows to (w+2d)(h+2d).
  check('offset: rectangle grows exactly', near(area, 500 * 400, 1), `got ${area}`);
}
{
  // L-shape (concave). Must grow and stay finite.
  const L = [ {x:0,y:0},{x:600,y:0},{x:600,y:300},{x:300,y:300},{x:300,y:600},{x:0,y:600} ];
  const r = offsetPolygon(L, 40);
  const grew = Math.abs(polygonArea(r)) > Math.abs(polygonArea(L));
  const finite = r.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  check('offset: L-shape grows and stays finite', grew && finite && r.length >= 6);
}
{
  // Notch narrower than 2d — must clamp rather than invert.
  const notch = [ {x:0,y:0},{x:300,y:0},{x:300,y:200},{x:160,y:200},{x:160,y:20},{x:140,y:20},{x:140,y:200},{x:0,y:200} ];
  const r = offsetPolygon(notch, 60);
  const a0 = Math.abs(polygonArea(notch));
  const a1 = Math.abs(polygonArea(r));
  check('offset: narrow notch does not invert', a1 >= a0 && a1 < a0 * 4 && r.length >= 3, `a0=${a0} a1=${a1}`);
}
{
  const tri = [ {x:0,y:0},{x:500,y:0},{x:250,y:20} ]; // very acute
  const r = offsetPolygon(tri, 40);
  check('offset: acute corner bevels instead of spiking',
    r.every((p) => Number.isFinite(p.x)) && Math.abs(polygonArea(r)) < Math.abs(polygonArea(tri)) * 4);
}
{
  check('offset: degenerate input returned unchanged', offsetPolygon([{x:0,y:0},{x:1,y:1}], 10).length < 3);
  const z = offsetPolygon(rect(200,200), 0);
  check('offset: zero distance is identity', z.length === 4);
}
// ---- orientedBox ---------------------------------------------------------
{
  const b = orientedBox(rect(600, 200));
  const long = Math.max(b.halfA, b.halfB) * 2;
  const short = Math.min(b.halfA, b.halfB) * 2;
  check('obb: axis-aligned rectangle extents', near(long, 600, 0.01) && near(short, 200, 0.01), `${long}x${short}`);
  check('obb: centre', near(b.center.x, 300, 0.01) && near(b.center.y, 100, 0.01));
  check('obb: fill ratio of a rectangle is 1', near(boxFillRatio(rect(600,200)), 1, 1e-6));
}
{
  // 45-degree rotated square: OBB should recover the true side, not the bbox.
  const s = 200, c = Math.SQRT1_2;
  const rot = [ {x:0,y:0},{x:s*c,y:s*c},{x:0,y:2*s*c},{x:-s*c,y:s*c} ];
  const b = orientedBox(rot);
  check('obb: rotated square recovers side length', near(Math.max(b.halfA,b.halfB)*2, s, 0.5), `${b.halfA*2}x${b.halfB*2}`);
}
{
  const L = [ {x:0,y:0},{x:600,y:0},{x:600,y:300},{x:300,y:300},{x:300,y:600},{x:0,y:600} ];
  const ratio = boxFillRatio(L);
  check('obb: L-shape flagged as non-rectangular', ratio > 0.6 && ratio < 0.85, `ratio=${ratio.toFixed(3)}`);
}
// ---- detectBuildingOutline ----------------------------------------------
const wallsOf = (pts) => pts.map((p, i) => ({
  id: `w${i}`, start: p, end: pts[(i + 1) % pts.length],
  thickness: 12, height: 270, color: '#fff',
}));
{
  const outline = detectBuildingOutline(wallsOf(rect(500, 400)));
  check('outline: closed rectangle found', !!outline && outline.length === 4, JSON.stringify(outline));
  if (outline) {
    check('outline: wound counter-clockwise', polygonArea(outline) > 0, `area=${polygonArea(outline)}`);
    check('outline: area matches footprint', near(Math.abs(polygonArea(outline)), 500 * 400, 1));
  }
}
{
  // Unclosed sketch -> no meaningful outline.
  const open = wallsOf(rect(500, 400)).slice(0, 2);
  check('outline: unclosed walls return null', detectBuildingOutline(open) === null);
}
{
  // Dangling spur must not spike the hull.
  const walls = wallsOf(rect(500, 400));
  walls.push({ id: 'spur', start: {x:500,y:400}, end: {x:900,y:400}, thickness: 12, height: 270, color: '#fff' });
  const outline = detectBuildingOutline(walls);
  const ok = !!outline && outline.every((p) => p.x <= 501);
  check('outline: dangling wall pruned, no spike', ok, JSON.stringify(outline));
}

// ---- roof geometry -------------------------------------------------------
const roofDef = (patch) => ({ ...DEFAULT_ROOF, ...patch });
/** Bounds of a built roof, in metres. */
const roofBounds = (built) => {
  const p = built.geometry.getAttribute('position').array;
  const b = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (let i = 0; i < p.length; i += 3) {
    b.minX = Math.min(b.minX, p[i]); b.maxX = Math.max(b.maxX, p[i]);
    b.minY = Math.min(b.minY, p[i + 1]); b.maxY = Math.max(b.maxY, p[i + 1]);
    b.minZ = Math.min(b.minZ, p[i + 2]); b.maxZ = Math.max(b.maxZ, p[i + 2]);
  }
  return b;
};
const allFinite = (built) =>
  [...built.geometry.getAttribute('position').array].every(Number.isFinite) &&
  [...built.geometry.getAttribute('uv').array].every(Number.isFinite);

{
  // 8x6m footprint, 30 degrees. Ridge rises halfB*tan(30) = 3m*0.5774 = 1.732m.
  const built = buildRoofGeometry(rect(800, 600), null, roofDef({ type: 'gable', pitch: 30, thickness: 20 }), 2.7);
  const b = roofBounds(built);
  check('roof: gable geometry builds', !!built && allFinite(built));
  check('roof: gable ridge height correct', near(built.ridgeHeight, 3 * Math.tan(Math.PI / 6) + 0.2, 1e-3), `got ${built.ridgeHeight}`);
  check('roof: gable sits on the eave plane', near(b.maxY, 2.7 + 3 * Math.tan(Math.PI / 6), 1e-3), `top=${b.maxY}`);
  check('roof: gable covers the footprint', near(b.minX, 0, 1e-3) && near(b.maxX, 8, 1e-3) && near(b.maxZ, 6, 1e-3));
}
{
  // Hip over a square is a pyramid: the ridge collapses to a point.
  const built = buildRoofGeometry(rect(600, 600), null, roofDef({ type: 'hip', pitch: 35 }), 2.7);
  const p = built.geometry.getAttribute('position').array;
  const top = roofBounds(built).maxY;
  const apex = [];
  for (let i = 0; i < p.length; i += 3) if (near(p[i + 1], top, 1e-4)) apex.push([p[i], p[i + 2]]);
  const sameXZ = apex.every(([x, z]) => near(x, 3, 1e-3) && near(z, 3, 1e-3));
  check('roof: hip over a square is a pyramid', apex.length > 0 && sameXZ, JSON.stringify(apex.slice(0, 3)));
}
{
  const built = buildRoofGeometry(rect(800, 600), null, roofDef({ type: 'shed', pitch: 20, thickness: 15 }), 2.7);
  const b = roofBounds(built);
  check('roof: shed low edge is the eave', near(b.minY, 2.7, 1e-3), `low=${b.minY}`);
  check('roof: shed rises above the eave', b.maxY > 2.7 + 1 && allFinite(built));
}
{
  const built = buildRoofGeometry(rect(800, 600), null, roofDef({ type: 'flat', thickness: 25 }), 2.7);
  const b = roofBounds(built);
  check('roof: flat is a slab at the eave', near(b.minY, 2.7, 1e-3) && near(b.maxY, 2.95, 1e-3), `${b.minY}..${b.maxY}`);
}
{
  // A markedly non-rectangular plan must fall back to flat, not emit a floating
  // pitched roof over an L-shaped house.
  const L = [ {x:0,y:0},{x:600,y:0},{x:600,y:300},{x:300,y:300},{x:300,y:600},{x:0,y:600} ];
  check('roof: L-plan needs fallback', roofNeedsFallback(L));
  check('roof: L-plan gable becomes flat', effectiveRoofType(roofDef({ type: 'gable' }), L) === 'flat');
  check('roof: rectangle keeps its gable', effectiveRoofType(roofDef({ type: 'gable' }), rect(800, 600)) === 'gable');
  check('roof: shed never falls back', effectiveRoofType(roofDef({ type: 'shed' }), L) === 'shed');
}
{
  check('roof: degenerate outline returns null', buildRoofGeometry([{x:0,y:0},{x:1,y:1}], null, roofDef({}), 2.7) === null);
}
{
  // Footprint must clear the wall centreline by half a wall plus the overhang.
  const walls = wallsOf(rect(500, 400));
  const fp = roofFootprint(walls, 45);
  const area = Math.abs(polygonArea(fp));
  const d = 12 / 2 + 45;
  check('roof: footprint offsets by half-wall + overhang', near(area, (500 + 2 * d) * (400 + 2 * d), 1), `got ${area}`);
  check('roof: no walls means no footprint', roofFootprint([], 45) === null);
}

// ---- gable/shed end infill ------------------------------------------------
// Without this the roof clears the wall top by `overhang * tan(pitch)` and you
// can see straight into the building under the eaves and at the gable ends.
const inset = (w, h, d) => [ {x:d,y:d}, {x:w-d,y:d}, {x:w-d,y:h-d}, {x:d,y:h-d} ];
const bboxOf = (geo) => {
  const p = geo.getAttribute('position').array;
  const b = { minY: Infinity, maxY: -Infinity, minX: Infinity, maxX: -Infinity };
  for (let i = 0; i < p.length; i += 3) {
    b.minY = Math.min(b.minY, p[i + 1]); b.maxY = Math.max(b.maxY, p[i + 1]);
    b.minX = Math.min(b.minX, p[i]); b.maxX = Math.max(b.maxX, p[i]);
  }
  return b;
};
{
  // 8x6m eave, walls 0.5m inside it (a 50cm overhang), 30 degrees, 20cm deck.
  const eave = rect(800, 600);
  const wallPoly = inset(800, 600, 50);
  const built = buildRoofGeometry(eave, wallPoly, roofDef({ type: 'gable', pitch: 30, thickness: 20 }), 2.7);
  check('roof: gable has end infill', !!built.infill);
  const b = bboxOf(built.infill);
  // The gable-end wall crosses the ridge line at its midpoint, so the infill
  // must climb all the way to the ridge underside (eave - deck + full rise).
  const peak = 2.7 - 0.2 + 3.0 * Math.tan(Math.PI / 6);
  check('roof: infill reaches the underside of the ridge', near(b.maxY, peak, 1e-3), `got ${b.maxY} want ${peak}`);
  check('roof: infill starts at the wall top', near(b.minY, 2.69, 1e-6), `got ${b.minY}`);
  check('roof: infill sits on the wall line, not the eave', near(b.minX, 0.5, 1e-6) && near(b.maxX, 7.5, 1e-6));
}
{
  const built = buildRoofGeometry(rect(800, 600), inset(800, 600, 50), roofDef({ type: 'shed', pitch: 20 }), 2.7);
  check('roof: shed has infill under the raised end', !!built.infill && bboxOf(built.infill).maxY > 2.7 + 1);
}
{
  const built = buildRoofGeometry(rect(800, 600), inset(800, 600, 50), roofDef({ type: 'flat' }), 2.7);
  check('roof: flat needs no infill', built.infill === null);
}
{
  // No wall outline (callers that only want the shell) must not crash.
  check('roof: infill is optional', buildRoofGeometry(rect(800, 600), null, roofDef({ type: 'gable' }), 2.7).infill === null);
}
{
  const walls = wallsOf(rect(500, 400));
  const o = roofOutlines(walls, 45);
  check('roof: wall outline is the outer wall face',
    near(Math.abs(polygonArea(o.wall)), (500 + 12) * (400 + 12), 1), JSON.stringify(o.wall));
  check('roof: eave outline is further out', Math.abs(polygonArea(o.eave)) > Math.abs(polygonArea(o.wall)));
}

// ---- roof placement across storeys ---------------------------------------
{
  const floors = [
    { id: 'a', name: 'Ground', elevation: 0, roof: roofDef({}) },
    { id: 'b', name: 'First', elevation: 270 },
  ];
  const n = normalizeRoofs(floors);
  check('roof: re-homes onto the top storey', !n[0].roof && !!n[1].roof);
  check('roof: top storey id', roofFloorId(floors) === 'b');
}
{
  const floors = [
    { id: 'a', name: 'Ground', elevation: 0, roof: roofDef({ pitch: 10 }) },
    { id: 'b', name: 'First', elevation: 270, roof: roofDef({ pitch: 40 }) },
  ];
  const n = normalizeRoofs(floors);
  check('roof: only one roof survives', n.filter((f) => f.roof).length === 1 && n[1].roof.pitch === 40);
}
{
  const floors = [{ id: 'a', name: 'Ground', elevation: 0 }];
  check('roof: roofless saves untouched', normalizeRoofs(floors) === floors);
}
{
  const floors = [{ id: 'a', name: 'Ground', elevation: 0, roof: roofDef({ pitch: 999, overhang: -5, thickness: 0 }) }];
  const r = normalizeRoofs(floors)[0].roof;
  check('roof: out-of-range values clamped', r.pitch === 60 && r.overhang === 0 && r.thickness === DEFAULT_ROOF.thickness,
    JSON.stringify(r));
}

console.log(fails ? `\nGEOMETRY: ${fails} FAILED` : '\nGEOMETRY: all green');
process.exit(fails ? 1 : 0);
