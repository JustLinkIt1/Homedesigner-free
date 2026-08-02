// Pure-Node geometry checks for the roof pipeline. These functions decide real
// building geometry and are exactly the kind of thing that must not be validated
// by eyeball, so they get deterministic assertions instead.
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

// Compile the two TS modules under test to a temp ESM bundle via esbuild (already
// a Vite dependency), so this runs with plain `node` and no browser.
const dir = mkdtempSync(join(tmpdir(), 'hdgeo-'));
const sourceRoot = process.cwd().replaceAll('\\', '/');
// The entry has to live inside the project: esbuild resolves bare imports
// (dxf-parser, three) relative to the entry file, not the working directory.
const entry = join(process.cwd(), '.geometry-entry.tmp.ts');
writeFileSync(entry, `
export { offsetPolygon, orientedBox, boxFillRatio } from '${sourceRoot}/src/lib/polygonOffset.ts';
export { detectBuildingOutline, detectRooms } from '${sourceRoot}/src/lib/roomDetection.ts';
export { polygonArea, rotatePoint, boundsOf } from '${sourceRoot}/src/lib/geometry.ts';
export { buildRoofGeometry, effectiveRoofType, roofNeedsFallback, roofFootprint, roofOutlines } from '${sourceRoot}/src/lib/roofGeometry.ts';
export { wallCentrelines } from '${sourceRoot}/src/lib/wallCentrelines.ts';
export { classifyOpening } from '${sourceRoot}/src/lib/dxfOpenings.ts';
export { buildDxf, LAYERS } from '${sourceRoot}/src/lib/dxfExport.ts';
export { flattenPath } from '${sourceRoot}/src/lib/svgPath.ts';
export { importDxf } from '${sourceRoot}/src/lib/dxfImport.ts';
export { isNewer } from '${sourceRoot}/src/lib/appUpdate.ts';
export { classifyLayer, storeyOf, isDemolished } from '${sourceRoot}/src/lib/dxfLayers.ts';
export { normalizeRoofs, roofFloorId, DEFAULT_ROOF } from '${sourceRoot}/src/lib/roof.ts';
export { fenceRunBoxes, fenceProfile, structuralWalls, isFence, isHalfWall, FENCE_HEIGHTS, HALF_WALL_HEIGHT } from '${sourceRoot}/src/lib/fence.ts';
export { lockToAngle, ANGLE_LOCK_RAD } from '${sourceRoot}/src/lib/snapping.ts';
export { spriteBox, spriteReshaped } from '${sourceRoot}/src/lib/spriteFit.ts';
export { wallDistances } from '${sourceRoot}/src/lib/distanceGuides.ts';
export { isDragDrawTool, shouldPanOnTouch, stripDegenerateTail, readoutOffsetCm } from '${sourceRoot}/src/lib/drawGesture.ts';
`);
const out = join(dir, 'bundle.mjs');
// platform=node so CommonJS-only deps (dxf-parser) resolve via "main";
// platform=neutral leaves mainFields empty and cannot find them. The JS API is
// used instead of the Unix-only .bin shim so this suite also runs on Windows.
await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: out });
rmSync(entry, { force: true });

const {
  offsetPolygon, orientedBox, boxFillRatio, detectBuildingOutline, detectRooms, polygonArea,
  buildRoofGeometry, effectiveRoofType, roofNeedsFallback, roofFootprint, roofOutlines,
  normalizeRoofs, roofFloorId, DEFAULT_ROOF,
  classifyLayer, storeyOf, isDemolished, wallCentrelines, classifyOpening,
  buildDxf, LAYERS, flattenPath, importDxf, isNewer, rotatePoint, boundsOf,
  fenceRunBoxes, fenceProfile, structuralWalls, isFence, isHalfWall, FENCE_HEIGHTS, HALF_WALL_HEIGHT,
  wallDistances, lockToAngle, ANGLE_LOCK_RAD, spriteBox, spriteReshaped,
  isDragDrawTool, shouldPanOnTouch, stripDegenerateTail, readoutOffsetCm,
} = await import(pathToFileURL(out).href);

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

// ---- CAD layer classification --------------------------------------------
// Layer names from a real ArchiCAD export (a French practice), including the
// mojibake that DWG->DXF conversion produces for accented characters.
{
  const cases = [
    ['0._ _1_Structure - Murs ext\ufffdrieurs', 'wall', 0],
    ['1._ _2_Structure - Murs ext\ufffdrieurs', 'wall', 1],
    ['2._ _3_Nouveau_Structure - Murs ext\ufffdrieurs', 'wall', 2],
    ['0._ _1_2D - Cotations - existant ET nouveau', 'dimension', 0],
    ['0._ _1_Portes Archicad', 'door', 0],
    ['1._ _2_Fen\ufffdtres Archicad', 'window', 1],
    ['0._ _1_Int\ufffdrieur - Escaliers & ascenseurs', 'stair', 0],
    ['2._ _3_Toits - Toitures', 'roof', 2],
    ['0._ _1_Zones - existant 01', 'zone', 0],
    ['0._ _1_Nouveau_Exter - V\ufffdg\ufffdtation', 'outdoor', 0],
    ['0._ _1_Marques - Coupes non vues', 'annotation', 0],
    ['A-WALL-FULL', 'wall', null],
    ['A-DIMS', 'dimension', null],
  ];
  for (const [name, kind, storey] of cases) {
    check(`layer: ${name.slice(0, 34)} -> ${kind}`, classifyLayer(name) === kind, `got ${classifyLayer(name)}`);
    if (storey !== null) check(`layer storey: ${name.slice(0, 26)} -> ${storey}`, storeyOf(name) === storey, `got ${storeyOf(name)}`);
  }
  // The bug this guards: 'tur' (German Tuer) is a substring of "strucTURe", so
  // plain substring matching classified every exterior wall layer as a door.
  check('layer: "Structure" is not a door', classifyLayer('Structure - Murs') === 'wall');
  // And 'exter' must not make "Murs exterieurs" an outdoor layer.
  check('layer: "Murs exterieurs" is not outdoor', classifyLayer('Structure - Murs exterieurs') === 'wall');
  check('layer: demolition detected', isDemolished('0._ _1_D\ufffdmoli_Portes Archicad'));
  check('layer: new work is not demolition', !isDemolished('0._ _1_Nouveau_Portes Archicad'));
  check('layer: unknown stays unknown', classifyLayer('Layer1') === 'unknown');
}

// ---- wall centrelines from outlines --------------------------------------
// CAD draws a wall as its two FACES. These must collapse to one centreline with
// the real thickness, or every wall imports doubled and room detection fails.
const seg = (x1, y1, x2, y2) => ({ a: { x: x1, y: y1 }, b: { x: x2, y: y2 } });
/** The two long faces of a wall from (x1,y1) to (x2,y2) of thickness t. */
const faces = (x1, y1, x2, y2, t) => {
  const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy);
  const nx = (-dy / L) * (t / 2), ny = (dx / L) * (t / 2);
  return [
    seg(x1 + nx, y1 + ny, x2 + nx, y2 + ny),
    seg(x1 - nx, y1 - ny, x2 - nx, y2 - ny),
  ];
};
const clLen = (c) => Math.hypot(c.b.x - c.a.x, c.b.y - c.a.y);

{
  const cl = wallCentrelines(faces(0, 0, 500, 0, 20));
  check('centreline: one wall from two faces', cl.length === 1, `got ${cl.length}`);
  if (cl[0]) {
    check('centreline: thickness recovered', near(cl[0].thickness, 20, 0.01), `got ${cl[0].thickness}`);
    check('centreline: sits between the faces', near(cl[0].a.y, 0, 0.01) && near(cl[0].b.y, 0, 0.01));
    check('centreline: full length', near(clLen(cl[0]), 500, 0.01), `got ${clLen(cl[0])}`);
  }
}
{
  // A closed rectangle: two long faces plus two end caps. The caps are short
  // and perpendicular, and must not survive as walls.
  const r = [
    seg(0, -10, 500, -10), seg(500, -10, 500, 10),
    seg(500, 10, 0, 10), seg(0, 10, 0, -10),
  ];
  const cl = wallCentrelines(r);
  check('centreline: wall rectangle gives exactly one wall', cl.length === 1, JSON.stringify(cl.map(clLen)));
  if (cl[0]) check('centreline: rectangle thickness', near(cl[0].thickness, 20, 0.01));
}
{
  // Skewed wall — real plots are not square to the page.
  const t = 24, ang = (13 * Math.PI) / 180;
  const x2 = 600 * Math.cos(ang), y2 = 600 * Math.sin(ang);
  const cl = wallCentrelines(faces(0, 0, x2, y2, t));
  check('centreline: skewed wall pairs', cl.length === 1 && near(cl[0].thickness, t, 0.05),
    JSON.stringify(cl.map((c) => c.thickness)));
  if (cl[0]) check('centreline: skewed length', near(clLen(cl[0]), 600, 0.05), `got ${clLen(cl[0])}`);
}
{
  // Opposite walls of a 3 m room must NOT pair into one fat wall.
  const cl = wallCentrelines([seg(0, 0, 500, 0), seg(0, 300, 500, 300)]);
  check('centreline: room width is not a wall', cl.every((c) => !c.paired), JSON.stringify(cl.map((c) => c.thickness)));
}
{
  // A face broken by a door opening still yields one continuous wall.
  const [top, bot] = faces(0, 0, 600, 0, 20);
  const broken = [
    seg(top.a.x, top.a.y, 200, top.a.y),
    seg(290, top.a.y, top.b.x, top.b.y), // 90cm door gap
    bot,
  ];
  const cl = wallCentrelines(broken);
  check('centreline: door gap bridged', cl.length === 1 && near(clLen(cl[0]), 600, 1), JSON.stringify(cl.map(clLen)));
}
{
  // Two parallel walls 40cm apart (a service duct) must stay two walls.
  const cl = wallCentrelines([...faces(0, 0, 400, 0, 15), ...faces(0, 60, 400, 60, 15)]);
  const paired = cl.filter((c) => c.paired);
  check('centreline: adjacent walls stay separate', paired.length === 2, JSON.stringify(paired.map((c) => c.thickness)));
}
{
  // A single-line wall (some plans draw thin walls with one stroke) survives.
  const cl = wallCentrelines([seg(0, 0, 400, 0)]);
  check('centreline: long single line kept', cl.length === 1 && cl[0].paired === false);
  // Short stray strokes (furniture, hatch ticks) do not.
  check('centreline: short stray dropped', wallCentrelines([seg(0, 0, 30, 0)]).length === 0);
}
{
  check('centreline: empty input is safe', wallCentrelines([]).length === 0);
}
{
  // A full rectangular room drawn as wall outlines -> 4 centrelines.
  const W = 600, H = 400, t = 20;
  const outline = [
    ...faces(0, 0, W, 0, t), ...faces(W, 0, W, H, t),
    ...faces(W, H, 0, H, t), ...faces(0, H, 0, 0, t),
  ];
  const cl = wallCentrelines(outline);
  const paired = cl.filter((c) => c.paired);
  check('centreline: four-wall room gives four walls', paired.length === 4, `got ${paired.length} of ${cl.length}`);
  check('centreline: all thicknesses correct', paired.every((c) => near(c.thickness, t, 0.05)));
}

// ---- openings: holes in the wall, classified by the symbol layers ---------
// The hole itself comes from wallCentrelines (both faces stop and restart);
// the door/window layers only say which kind it is.
{
  // A 6 m wall with a 90 cm hole at 2 m, drawn as two wall rectangles.
  const t = 20;
  const piece = (x0, x1) => [
    { a: { x: x0, y: -t / 2 }, b: { x: x1, y: -t / 2 } },
    { a: { x: x0, y: t / 2 }, b: { x: x1, y: t / 2 } },
  ];
  const cl = wallCentrelines([...piece(0, 200), ...piece(290, 600)]);
  check('opening: wall with a hole is still one wall', cl.length === 1, JSON.stringify(cl.map((c) => c.gaps)));
  if (cl[0]) {
    check('opening: one hole found', cl[0].gaps.length === 1, JSON.stringify(cl[0].gaps));
    if (cl[0].gaps[0]) {
      check('opening: hole width measured', near(cl[0].gaps[0].width, 90, 0.5), `got ${cl[0].gaps[0].width}`);
      check('opening: hole position measured', near(cl[0].gaps[0].offset, 245 / 600, 0.01),
        `got ${cl[0].gaps[0].offset}`);
    }
  }
}
{
  // A break in ONE face only is not an opening — it is a wall butting in, or a
  // drafting artefact. Both faces must be pierced.
  const t = 20;
  const segs = [
    { a: { x: 0, y: -t / 2 }, b: { x: 200, y: -t / 2 } },
    { a: { x: 290, y: -t / 2 }, b: { x: 600, y: -t / 2 } },
    { a: { x: 0, y: t / 2 }, b: { x: 600, y: t / 2 } }, // unbroken face
  ];
  const cl = wallCentrelines(segs);
  check('opening: one-sided break is not an opening', cl[0] && cl[0].gaps.length === 0,
    JSON.stringify(cl.map((c) => c.gaps)));
}
{
  // Two holes in one wall.
  const t = 20;
  const piece = (x0, x1) => [
    { a: { x: x0, y: -t / 2 }, b: { x: x1, y: -t / 2 } },
    { a: { x: x0, y: t / 2 }, b: { x: x1, y: t / 2 } },
  ];
  const cl = wallCentrelines([...piece(0, 150), ...piece(250, 500), ...piece(620, 900)]);
  check('opening: two holes in one wall', cl[0] && cl[0].gaps.length === 2,
    JSON.stringify(cl[0] && cl[0].gaps));
}
{
  // A gap wider than maxOpening is the wall ending, not a hole.
  const t = 20;
  const piece = (x0, x1) => [
    { a: { x: x0, y: -t / 2 }, b: { x: x1, y: -t / 2 } },
    { a: { x: x0, y: t / 2 }, b: { x: x1, y: t / 2 } },
  ];
  const cl = wallCentrelines([...piece(0, 150), ...piece(600, 900)], { gapTol: 600 });
  const holes = cl.reduce((n, c) => n + c.gaps.length, 0);
  check('opening: an over-wide gap is not a hole', holes === 0, JSON.stringify(cl.map((c) => c.gaps)));
}
{
  // Classification from the symbol layers.
  const doorSym = [{ kind: 'door', a: { x: 240, y: 0 }, b: { x: 240, y: 80 } }];
  const winSym = [{ kind: 'window', a: { x: 240, y: -2 }, b: { x: 300, y: -2 } }];
  check('opening: classified as a door', classifyOpening({ x: 245, y: 0 }, 60, doorSym) === 'door');
  check('opening: classified as a window', classifyOpening({ x: 245, y: 0 }, 60, winSym) === 'window');
  // Window sits 2cm from the probe, door 5cm: the nearer one decides.
  check('opening: nearest symbol wins',
    classifyOpening({ x: 245, y: 0 }, 60, [...doorSym, ...winSym]) === 'window');
  check('opening: distant symbols ignored',
    classifyOpening({ x: 245, y: 0 }, 20, [{ kind: 'door', a: { x: 900, y: 900 }, b: { x: 950, y: 900 } }]) === null);
  check('opening: no symbols is unclassified', classifyOpening({ x: 0, y: 0 }, 50, []) === null);
}

// ---- SVG path flattening (furniture symbols -> line work) -----------------
{
  const polys = flattenPath('M0,0 H100 V50 H0 Z');
  check('path: closed rectangle', polys.length === 1 && polys[0].length === 5, JSON.stringify(polys.map(p=>p.length)));
  if (polys[0]) {
    const xs = polys[0].map((p) => p.x), ys = polys[0].map((p) => p.y);
    check('path: rectangle extents', Math.max(...xs) === 100 && Math.max(...ys) === 50);
    check('path: closes back to start', near(polys[0][4].x, 0) && near(polys[0][4].y, 0));
  }
}
{
  // The symbols use A (arc) for circles and Q for rounded corners.
  const circle = flattenPath('M0,50 A50,50 0 1 0 100,50 A50,50 0 1 0 0,50 Z');
  const pts = circle.flat();
  const r = pts.map((p) => Math.hypot(p.x - 50, p.y - 50));
  check('path: circle arcs stay on the radius',
    pts.length > 12 && Math.max(...r) < 50.6 && Math.min(...r) > 49.4,
    `r ${Math.min(...r).toFixed(2)}..${Math.max(...r).toFixed(2)}`);
  const q = flattenPath('M0,0 Q50,0 50,50');
  check('path: quadratic sampled', q.length === 1 && q[0].length > 5 && near(q[0][q[0].length-1].x, 50, 1e-6));
}
{
  check('path: separate subpaths', flattenPath('M0,0 H10 M50,50 H60').length === 2);
  check('path: empty is safe', flattenPath('').length === 0 && flattenPath('Z').length === 0);
}

// ---- DXF export, and a round trip back through the importer ---------------
{
  const mkWall = (id, x1, y1, x2, y2, t = 20) => ({
    id, start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: t, height: 270, color: '#fff',
  });
  // A 6m x 4m room with a door in the south wall and a window in the north.
  const W = 600, H = 400;
  const walls = [
    mkWall('n', 0, 0, W, 0), mkWall('e', W, 0, W, H),
    mkWall('s', W, H, 0, H), mkWall('w', 0, H, 0, 0),
  ];
  const openings = [
    { id: 'd1', wallId: 's', type: 'door', offset: 0.5, width: 90, height: 205, sill: 0 },
    { id: 'w1', wallId: 'n', type: 'window', offset: 0.4, width: 120, height: 120, sill: 90 },
  ];
  const rooms = [{ id: 'r1', name: 'Living', points: [ {x:10,y:10},{x:W-10,y:10},{x:W-10,y:H-10},{x:10,y:H-10} ], floorMaterial: 'wood_floor', color: '#fff' }];
  const furniture = [{ id: 'f1', type: 'sofa', name: 'Sofa', position: { x: 300, y: 300 }, rotation: 0, width: 200, depth: 90, height: 80, color: '#888' }];
  const floors = [{ id: 'g', name: 'Ground floor', elevation: 0 }];
  const dxf = buildDxf({
    projectName: 'Test', floors,
    geom: { g: { walls, rooms, furniture, openings } },
  });

  check('dxf: is a DXF file', dxf.startsWith('0\nSECTION') && dxf.trimEnd().endsWith('EOF'));
  check('dxf: declares centimetres', dxf.includes('$INSUNITS'));
  const layerLines = dxf.split('\n');
  const declared = layerLines.filter((l, i) => layerLines[i - 1] === '2' && /^L\d\d-A-/.test(l));
  check('dxf: layers are declared in the table', declared.length >= 5, JSON.stringify([...new Set(declared)]));
  for (const [what, name] of Object.entries(LAYERS)) {
    check(`dxf: ${what} on layer ${name}`, dxf.includes(`L00-${name}`), name);
  }
  check('dxf: furniture became line work', (dxf.match(/L00-A-FURN/g) || []).length > 8);
  check('dxf: door swing is a real ARC', dxf.includes('ARC'));

  // The real test: read our own file back with the importer.
  const back = importDxf(dxf, { wallHeight: 270, wallThickness: 10 });
  check('round trip: layers understood', back.layerAware);
  check('round trip: one storey', back.storeys.length === 1 && back.storeys[0].index === 0,
    JSON.stringify(back.storeys.map((s) => s.index)));
  check('round trip: dimensions not imported as walls', (back.kindCounts.dimension ?? 0) > 0);
  check('round trip: furniture not imported as walls', (back.kindCounts.furniture ?? 0) > 0);

  const rt = back.storeys[0];
  check('round trip: four walls recovered', rt.walls.length === 4, `got ${rt.walls.length}`);
  const thick = [...new Set(rt.walls.map((x) => Math.round(x.thickness)))];
  check('round trip: wall thickness preserved', thick.length === 1 && thick[0] === 20, JSON.stringify(thick));
  const span = (sel) => {
    const v = rt.walls.flatMap((x) => [sel(x.start), sel(x.end)]);
    return Math.max(...v) - Math.min(...v);
  };
  // Within half a wall thickness, by design: the importer runs centrelines out
  // to the outer face at corners so the loops close for room detection, which
  // makes the outer ring measure fractionally large. 10cm on 6m.
  check('round trip: plan size preserved to half a wall',
    near(span((p) => p.x), W, 12) && near(span((p) => p.y), H, 12),
    `${span((p) => p.x).toFixed(1)} x ${span((p) => p.y).toFixed(1)}`);

  const doors = rt.openings.filter((o) => o.type === 'door');
  const wins = rt.openings.filter((o) => o.type === 'window');
  check('round trip: door recovered', doors.length === 1 && Math.abs(doors[0].width - 90) <= 6,
    JSON.stringify(rt.openings.map((o) => [o.type, Math.round(o.width)])));
  check('round trip: window recovered', wins.length === 1 && Math.abs(wins[0].width - 120) <= 8,
    JSON.stringify(rt.openings.map((o) => [o.type, Math.round(o.width)])));
  check('round trip: room detected', detectRooms(rt.walls).length >= 1, `${detectRooms(rt.walls).length}`);
}
{
  // Multi-storey: layer prefixes must bring the levels back separately.
  const mk = (id, x1, y1, x2, y2) => ({ id, start:{x:x1,y:y1}, end:{x:x2,y:y2}, thickness: 20, height: 270, color:'#fff' });
  const ring = (p) => [mk(p+'n',0,0,500,0), mk(p+'e',500,0,500,300), mk(p+'s',500,300,0,300), mk(p+'w',0,300,0,0)];
  const dxf = buildDxf({
    projectName: 'Two', 
    floors: [{ id:'a', name:'Ground', elevation:0 }, { id:'b', name:'First', elevation:280 }],
    geom: {
      a: { walls: ring('a'), rooms: [], furniture: [], openings: [] },
      b: { walls: ring('b'), rooms: [], furniture: [], openings: [] },
    },
  });
  check('dxf: storey prefixes written', dxf.includes('L00-A-WALL') && dxf.includes('L01-A-WALL'));
  const back = importDxf(dxf, { wallHeight: 270, wallThickness: 10 });
  check('round trip: two storeys', back.storeys.length === 2, JSON.stringify(back.storeys.map((s)=>s.index)));
  check('round trip: walls on both storeys', back.storeys.every((s) => s.walls.length === 4),
    JSON.stringify(back.storeys.map((s)=>s.walls.length)));
}

// ---- update version comparison -------------------------------------------
// A wrong answer here either nags users forever or never offers the update.
{
  check('update: patch bump is newer', isNewer('1.2.1', '1.2.0'));
  check('update: minor bump is newer', isNewer('1.3.0', '1.2.9'));
  check('update: major bump is newer', isNewer('2.0.0', '1.99.99'));
  check('update: same version is not newer', !isNewer('1.2.0', '1.2.0'));
  check('update: older is not newer', !isNewer('1.1.9', '1.2.0'));
  // 10 > 9 numerically, but string comparison would say otherwise.
  check('update: compares numerically not lexically', isNewer('1.10.0', '1.9.0'));
  check('update: 1.0.100 beats 1.0.99', isNewer('1.0.100', '1.0.99'));
  // A broken manifest must never trigger a reload loop.
  check('update: garbage is never newer', !isNewer('banana', '1.2.0') && !isNewer('', '1.2.0'));
  check('update: missing current is safe', !isNewer('9.9.9', 'dev'));
  check('update: suffixes ignored', isNewer('1.2.1-beta', '1.2.0'));
}

// ---- whole-plan rotation (a tester asked for it; there was no way to do it) ----
{
  const O = { x: 0, y: 0 };
  // Plan Y grows downwards, so a positive angle reads clockwise on screen.
  const r90 = rotatePoint({ x: 100, y: 0 }, 90, O);
  check('rotate: +90° takes +X to +Y (clockwise on screen)', near(r90.x, 0) && near(r90.y, 100), JSON.stringify(r90));
  const l90 = rotatePoint({ x: 100, y: 0 }, -90, O);
  check('rotate: -90° takes +X to -Y', near(l90.x, 0) && near(l90.y, -100), JSON.stringify(l90));

  // Right angles must land EXACTLY on axis, or rotated walls stop snapping.
  check('rotate: 90° is exact, not 6e-15', rotatePoint({ x: 250, y: 137 }, 90, O).x === -137);
  check('rotate: 180° is exact', JSON.stringify(rotatePoint({ x: 30, y: 40 }, 180, O)) === JSON.stringify({ x: -30, y: -40 }));

  // Four right turns are the identity — a user can spin back to where they were.
  let p = { x: 321, y: -87 };
  for (let i = 0; i < 4; i++) p = rotatePoint(p, 90, { x: 55, y: 12 });
  check('rotate: 4×90° returns the original point', p.x === 321 && p.y === -87, JSON.stringify(p));

  // The pivot itself never moves.
  const piv = { x: 17, y: 92 };
  const fixed = rotatePoint(piv, 37, piv);
  check('rotate: the pivot is fixed', near(fixed.x, piv.x) && near(fixed.y, piv.y));

  // Rotation is rigid: distances between any two points are preserved.
  const a = { x: 10, y: 20 };
  const b = { x: 310, y: 420 };
  const ra = rotatePoint(a, 37, piv);
  const rb = rotatePoint(b, 37, piv);
  check(
    'rotate: preserves distance (rigid motion)',
    near(Math.hypot(b.x - a.x, b.y - a.y), Math.hypot(rb.x - ra.x, rb.y - ra.y), 1e-9),
  );

  // A 90° turn of an axis-aligned plan swaps its width and height.
  const plan = [{ x: 0, y: 0 }, { x: 800, y: 0 }, { x: 800, y: 500 }, { x: 0, y: 500 }];
  const c = { x: 400, y: 250 };
  const spun = plan.map((q) => rotatePoint(q, 90, c));
  const bb = boundsOf(spun);
  check(
    'rotate: 90° swaps plan width and height',
    near(bb.max.x - bb.min.x, 500) && near(bb.max.y - bb.min.y, 800),
    JSON.stringify(bb),
  );
  // Rotating about the bounding-box centre keeps the plan centred there, so a
  // rotated design does not fly off into empty canvas.
  check(
    'rotate: about the centre keeps the centre',
    near((bb.min.x + bb.max.x) / 2, c.x) && near((bb.min.y + bb.max.y) / 2, c.y),
  );
  check('rotate: area is unchanged', near(Math.abs(polygonArea(spun)), Math.abs(polygonArea(plan)), 1e-6));

  // 360° and 0° are no-ops the store short-circuits on.
  check('rotate: 360° is the identity', JSON.stringify(rotatePoint(a, 360, piv)) === JSON.stringify(a));
}

// ---- fences (Phase C3) ------------------------------------------------------
// A fence is generated, not drawn, so its geometry is exactly the kind of thing
// that must not be validated by eyeball.
{
  const H = 110;
  const boxes = fenceRunBoxes(0, 600, H, 'picket');
  const posts = boxes.filter((b) => b.part === 'post');
  const slats = boxes.filter((b) => b.part === 'slat');
  const rails = boxes.filter((b) => b.part === 'rail');

  check('fence: a run posts both of its ends', posts.length >= 2
    && near(Math.min(...posts.map((p) => p.x)), 0)
    && near(Math.max(...posts.map((p) => p.x)), 600));

  // No bay may exceed the profile's spacing, or the fence sags visibly.
  const xs = posts.map((p) => p.x).sort((a, b) => a - b);
  let widest = 0;
  for (let i = 1; i < xs.length; i++) widest = Math.max(widest, xs[i] - xs[i - 1]);
  check('fence: no bay exceeds the profile spacing', widest <= fenceProfile('picket').postEvery + 0.01, `widest ${widest}`);

  check('fence: picket has infill, rails and posts', slats.length > 0 && rails.length > 0 && posts.length > 0);

  // Infill is centred in the run: the gap before the first slat matches the gap
  // after the last. An off-centre fence reads as a bug even when it is "correct".
  const first = Math.min(...slats.map((b) => b.x - b.w / 2));
  const last = Math.max(...slats.map((b) => b.x + b.w / 2));
  check('fence: infill is centred in the run', near(first - 0, 600 - last, 0.01), `${first} vs ${600 - last}`);

  // Nothing may poke through the ground or overshoot the fence height.
  check('fence: nothing sits below ground', boxes.every((b) => b.y - b.h / 2 >= -0.01));
  check('fence: infill stays within the fence height', slats.every((b) => b.y + b.h / 2 <= H + 0.01));

  // Post-and-rail is defined by having no infill at all.
  const ranch = fenceRunBoxes(0, 400, 120, 'rail');
  check('fence: post-and-rail has no infill', ranch.every((b) => b.part !== 'slat') && ranch.some((b) => b.part === 'rail'));

  // A railing is the low style, a privacy screen the tall one — the defaults
  // exist so converting a 270cm wall does not leave an absurd picket fence.
  check('fence: railing is lower than a privacy screen', FENCE_HEIGHTS.railing < FENCE_HEIGHTS.privacy);

  // Degenerate runs must produce nothing rather than NaN boxes.
  check('fence: a zero-length run builds nothing', fenceRunBoxes(100, 100, H, 'picket').length === 0);
  check('fence: a reversed run builds nothing', fenceRunBoxes(200, 100, H, 'picket').length === 0);
  check('fence: every box is finite', boxes.every((b) => [b.x, b.y, b.z, b.w, b.h, b.d].every(Number.isFinite)));

  // The whole point of the discriminator: fences are not part of the building.
  const walls = [
    { id: 'a', start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, thickness: 10, height: 270, color: '#fff' },
    { id: 'b', start: { x: 0, y: 0 }, end: { x: 0, y: 100 }, thickness: 10, height: 110, color: '#fff', kind: 'fence' },
  ];
  check('fence: structuralWalls drops fences', structuralWalls(walls).length === 1 && structuralWalls(walls)[0].id === 'a');
  check('fence: isFence only matches the flag', !isFence(walls[0]) && isFence(walls[1]));

  // A pony wall is deliberately NOT a fence: it still divides rooms, carries
  // finishes/roofs and blocks walkthrough movement. Its flag supplies the UI
  // and dollhouse semantics that raw height alone cannot.
  const pony = {
    id: 'pony', start: { x: 0, y: 200 }, end: { x: 500, y: 200 },
    thickness: 10, height: HALF_WALL_HEIGHT, color: '#fff', halfWall: true,
  };
  check('half wall: default height is worktop/guard height', HALF_WALL_HEIGHT === 105);
  check('half wall: semantic flag is recognised', isHalfWall(pony) && !isFence(pony));
  check('half wall: remains structural', structuralWalls([...walls, pony]).some((w) => w.id === pony.id));

  // An internal half wall must not grow or distort the building eaves.
  const outer = wallsOf(rect(500, 400));
  const baseRoof = roofFootprint(outer, 45);
  const ponyRoof = roofFootprint([...outer, pony], 45);
  check(
    'half wall: internal run does not distort roof footprint',
    !!baseRoof && !!ponyRoof && near(Math.abs(polygonArea(baseRoof)), Math.abs(polygonArea(ponyRoof)), 0.01),
  );
}

// --- distance guides -------------------------------------------------------
// These numbers are read off the plan as measurements, so they get asserted
// rather than eyeballed. A sign slip in the ray/segment solve silently rejects
// every real hit, and a wrong rotation convention points the rays at the wrong
// walls — neither shows up as an error, only as a wrong number on screen.
{
  const W = 12; // wall thickness
  // A 6x4 m room, walls on the centrelines of the rectangle.
  const room = [
    { id: 'n', start: { x: 0, y: 0 }, end: { x: 600, y: 0 }, thickness: W, height: 270, color: '#fff' },
    { id: 'e', start: { x: 600, y: 0 }, end: { x: 600, y: 400 }, thickness: W, height: 270, color: '#fff' },
    { id: 's', start: { x: 600, y: 400 }, end: { x: 0, y: 400 }, thickness: W, height: 270, color: '#fff' },
    { id: 'w', start: { x: 0, y: 400 }, end: { x: 0, y: 0 }, thickness: W, height: 270, color: '#fff' },
  ];
  const at = (x, y, width, depth) => ({ position: { x, y }, width, depth });

  // Item centred in the room, unrotated. Right/left legs run to the east/west
  // wall faces; down/up to the south/north. Faces sit W/2 inside each centreline.
  const centred = wallDistances(at(300, 200, 100, 60), 0, room);
  const d = centred.map((l) => l.distance);
  check('guides: right leg reaches the east wall face', near(d[0], 300 - 50 - W / 2, 0.001), `${d[0]}`);
  check('guides: left leg reaches the west wall face', near(d[1], 300 - 50 - W / 2, 0.001), `${d[1]}`);
  check('guides: down leg reaches the south wall face', near(d[2], 200 - 30 - W / 2, 0.001), `${d[2]}`);
  check('guides: up leg reaches the north wall face', near(d[3], 200 - 30 - W / 2, 0.001), `${d[3]}`);

  // The four legs must always sum with the item to the full internal span.
  check(
    'guides: opposing legs plus the item span the room',
    near(d[0] + d[1] + 100, 600 - W, 0.001) && near(d[2] + d[3] + 60, 400 - W, 0.001),
  );

  // Rotation convention: at 90 degrees the item's WIDTH axis runs along world
  // +Y, so the leg that measured to the east wall must now measure to the
  // south, starting from the width half-extent (50). The depth leg swings round
  // to the west wall, starting from the depth half-extent (30).
  const turned = wallDistances(at(300, 200, 100, 60), 90, room).map((l) => l.distance);
  check('guides: a quarter turn swaps which walls the legs meet',
    near(turned[0], 200 - 50 - W / 2, 0.001) && near(turned[2], 300 - 30 - W / 2, 0.001),
    `${turned.join(', ')}`);

  // Off-centre: the near side must shorten by exactly the offset.
  const shifted = wallDistances(at(400, 200, 100, 60), 0, room).map((l) => l.distance);
  check('guides: moving 100 right shortens the right leg by 100',
    near(shifted[0], d[0] - 100, 0.001) && near(shifted[1], d[1] + 100, 0.001));

  // An item pushed flush against a wall reports (near) zero, not a negative.
  const flush = wallDistances(at(600 - W / 2 - 50, 200, 100, 60), 0, room).map((l) => l.distance);
  check('guides: an item against the wall never reports a negative distance',
    flush.every((v) => v > 0 || !Number.isFinite(v)), `${flush.join(', ')}`);

  // No walls at all: every leg reports Infinity so the renderer draws nothing.
  check('guides: nothing to measure against yields no legs',
    wallDistances(at(0, 0, 100, 60), 0, []).every((l) => !Number.isFinite(l.distance)));

  // A fence must stop a ray. Ignoring it would report the wall behind it.
  const withFence = [
    ...room,
    { id: 'f', start: { x: 450, y: -100 }, end: { x: 450, y: 500 }, thickness: 10, height: 180, color: '#fff', kind: 'fence' },
  ];
  const blocked = wallDistances(at(300, 200, 100, 60), 0, withFence).map((l) => l.distance);
  check('guides: a fence blocks the ray instead of being seen through',
    near(blocked[0], 150 - 50 - 5, 0.001), `${blocked[0]}`);
}

// --- opening hit area ------------------------------------------------------
// A tester reported "when I try to select the door, often it will select the
// wall instead". The hit test was radial with radius = width/2, so it missed
// the outer thirds of a wide door and over-claimed perpendicular to a narrow
// one. This mirrors the rectangle Canvas2D now uses (hitsOpening).
{
  const zoom = 1; // 1 px per cm, so slop terms are in cm
  const wall = { start: { x: 0, y: 0 }, end: { x: 400, y: 0 }, thickness: 12 };
  // A double door — the width where the mismatch bites hardest, because the
  // circle's radius grows with the door while its corners fall further inside
  // the leaf that is actually drawn.
  const door = { width: 160, offset: 0.5 };
  const centre = { x: 200, y: 0 };

  const radial = (p) => Math.hypot(p.x - centre.x, p.y - centre.y) <= Math.max(door.width / 2, 16 / zoom);
  const rect = (p) => {
    const along = Math.abs(p.x - centre.x);
    const across = Math.abs(p.y - centre.y);
    const slop = 8 / zoom;
    return along <= door.width / 2 + slop && across <= Math.max(wall.thickness, 14 / zoom) / 2 + slop;
  };

  // Near the end of the leaf, slightly off the centreline — inside the drawn
  // door, but outside the circle, because a circle's edge curves away from the
  // rectangle's corners. This is the tap that fell through to the wall.
  const nearEnd = { x: 200 + 84, y: 14 };
  check('opening hit: a tap near the corner of a wide door hits the door', rect(nearEnd));
  check('opening hit: the old radial test dropped that tap onto the wall', !radial(nearEnd),
    `radial=${radial(nearEnd)}`);

  // Well past the door along the wall must fall through to the wall.
  const pastEnd = { x: 200 + 110, y: 0 };
  check('opening hit: past the door falls through to the wall', !rect(pastEnd));

  // Far off the wall perpendicular must not claim the tap — the radial test did,
  // which is the same defect seen from the other side: it stole taps meant for
  // furniture standing in a doorway.
  const offWall = { x: 200, y: 60 };
  check('opening hit: a tap well off the wall is not the door', !rect(offWall));
  check('opening hit: the old radial test wrongly claimed it', radial(offWall));

  // Dead centre still works, and so does the near edge.
  check('opening hit: centre and near-edge both hit',
    rect(centre) && rect({ x: 200 - 79, y: 0 }));
}

// --- tracing angle lock ----------------------------------------------------
// A tester tracing an imported apartment plan asked for snap-to-grid: "it's
// difficult to tap precisely exactly each corner". Grid snapping is off under a
// background on purpose (its origin/scale mean nothing to the traced image), so
// near-axis segments are straightened instead — at a tighter tolerance than
// free drawing, or a deliberately angled wall would be yanked square.
{
  const TRACE = (6 * Math.PI) / 180;
  const prev = { x: 0, y: 0 };
  const at = (deg, len = 200) => ({
    x: prev.x + Math.cos((deg * Math.PI) / 180) * len,
    y: prev.y + Math.sin((deg * Math.PI) / 180) * len,
  });
  const angleOf = (p) => (Math.atan2(p.y - prev.y, p.x - prev.x) * 180) / Math.PI;

  // 3° off horizontal: clearly meant to be straight.
  check('trace lock: a 3° wobble is straightened',
    Math.abs(angleOf(lockToAngle(prev, at(3), undefined, TRACE))) < 1e-6);
  // 20° is a deliberate angle and must survive untouched.
  const kept = lockToAngle(prev, at(20), undefined, TRACE);
  check('trace lock: a deliberate 20° wall is left alone', Math.abs(angleOf(kept) - 20) < 1e-6);
  // 10° would be captured by the looser free-drawing tolerance but not here —
  // that difference is the whole point of the separate value.
  check('trace lock: 10° is left alone while tracing',
    Math.abs(angleOf(lockToAngle(prev, at(10), undefined, TRACE)) - 10) < 1e-6);
  check('trace lock: 10° IS straightened when not tracing',
    Math.abs(angleOf(lockToAngle(prev, at(10)))) < 1e-6, `ANGLE_LOCK_RAD=${ANGLE_LOCK_RAD}`);
  // Length is preserved when straightening, so a traced wall keeps its size.
  const s3 = lockToAngle(prev, at(3), undefined, TRACE);
  check('trace lock: straightening preserves the wall length',
    Math.abs(Math.hypot(s3.x - prev.x, s3.y - prev.y) - 200) < 1e-6);
}

// --- resized objects fill their footprint in plan --------------------------
// "the object seems to correctly scale in 3D view but in 2D view it maintains
// its proportions and therefore does not scale following the object resizing"
// — a tester, on a kitchen sink.
{
  const sink = { width: 80, depth: 60 };       // catalogue default
  const ar = 4 / 3;                             // sprite image aspect

  // Untouched: contain-fit, so the drawn box keeps the render's aspect.
  const asIs = spriteBox(80, 60, ar, { entry: sink });
  check('sprite: an unresized object keeps the render aspect',
    near(asIs.w / asIs.h, ar, 1e-9), JSON.stringify(asIs));

  // Depth doubled: the footprint aspect no longer matches the catalogue, so the
  // sprite must fill it. This is the reported bug — before, h stayed at 60.
  const tall = spriteBox(80, 120, ar, { entry: sink });
  check('sprite: doubling depth doubles the drawn height',
    near(tall.w, 80) && near(tall.h, 120), JSON.stringify(tall));

  // Width alone, same reasoning.
  const wide = spriteBox(160, 60, ar, { entry: sink });
  check('sprite: widening follows the footprint', near(wide.w, 160) && near(wide.h, 60), JSON.stringify(wide));

  // Scaling BOTH sides equally is not a reshape — the object is just bigger, so
  // the render's aspect is still right and contain-fit should hold.
  const bigger = spriteBox(160, 120, ar, { entry: sink });
  check('sprite: a proportional resize still contain-fits',
    near(bigger.w / bigger.h, ar, 1e-9), JSON.stringify(bigger));
  check('sprite: proportional resize is not treated as a reshape',
    !spriteReshaped(160, 120, sink));
  check('sprite: a one-axis resize is treated as a reshape', spriteReshaped(80, 120, sink));

  // An explicit fill type ignores all of it.
  check('sprite: explicit fill always fills',
    (() => { const b = spriteBox(80, 60, ar, { fill: true, entry: sink }); return near(b.w, 80) && near(b.h, 60); })());

  // No catalogue entry (a cloud type not present locally): contain-fit, never crash.
  const orphan = spriteBox(80, 200, ar, {});
  check('sprite: an unknown type still contain-fits', near(orphan.h, 60) && near(orphan.w, 80));
}

// ---- touch drawing gesture -----------------------------------------------
// One finger draws with a build tool armed, and pans with everything else.
// These are the exact decisions that used to be an inline boolean expression
// inside Canvas2D, where nothing could reach them.
{
  const draws = ['wall', 'halfWall', 'fence', 'room', 'kitchen'];
  const doesNot = ['select', 'erase', 'pan'];
  check('gesture: every build tool draws on drag', draws.every(isDragDrawTool));
  // select owns node dragging + the long-press menu; erase would be
  // destructive; pan is pan. Regressing any of these is a serious bug.
  check('gesture: select/erase/pan never draw on drag', doesNot.every((t) => !isDragDrawTool(t)));

  // Drawing beats lock mode: lock stops objects MOVING, not you drawing.
  check('gesture: a draw tool wins over move lock',
    shouldPanOnTouch({ tool: 'wall', moveLock: true, targetIsStage: true, targetIsBgPlan: false }) === false);
  check('gesture: a draw tool does not pan on the traced plan',
    shouldPanOnTouch({ tool: 'room', moveLock: false, targetIsStage: false, targetIsBgPlan: true }) === false);
  // …but every non-drawing tool keeps the panning it has today.
  check('gesture: lock-mode one-finger pan survives for select',
    shouldPanOnTouch({ tool: 'select', moveLock: true, targetIsStage: false, targetIsBgPlan: false }) === true);
  check('gesture: traced-plan pan survives for select',
    shouldPanOnTouch({ tool: 'select', moveLock: false, targetIsStage: false, targetIsBgPlan: true }) === true);
  check('gesture: empty-canvas pan survives for erase',
    shouldPanOnTouch({ tool: 'erase', moveLock: false, targetIsStage: true, targetIsBgPlan: false }) === true);
  check('gesture: nothing pans when the touch is on an object',
    shouldPanOnTouch({ tool: 'select', moveLock: false, targetIsStage: false, targetIsBgPlan: false }) === false);
}
{
  // Finishing with a double-tap places a point on the FIRST tap, so the draft
  // ends with two coincident points and would commit a zero-length wall.
  const a = { x: 0, y: 0 };
  const b = { x: 300, y: 0 };
  check('gesture: a doubled final point is dropped',
    stripDegenerateTail([a, b, { x: 300, y: 0 }], 1).length === 2);
  check('gesture: a real short segment is kept',
    stripDegenerateTail([a, b, { x: 300, y: 2 }], 1).length === 3);
  // Must never eat the only point, or the first tap of a chain vanishes.
  check('gesture: a single point is never stripped', stripDegenerateTail([a], 1).length === 1);
}
{
  // The readout has to clear the fingertip, and flip below it near the top bar
  // where the toolbar and the draw pill would hide it.
  const mid = readoutOffsetCm({ screenY: 400, zoom: 1 });
  const top = readoutOffsetCm({ screenY: 30, zoom: 1 });
  check('gesture: readout sits above the finger normally', mid < 0, `got ${mid}`);
  check('gesture: readout flips below the finger near the top bar', top > 0, `got ${top}`);
  // It is a screen-space gap, so it must shrink in world units as we zoom in.
  check('gesture: readout gap is constant on screen, not in the plan',
    near(Math.abs(readoutOffsetCm({ screenY: 400, zoom: 2 })), Math.abs(mid) / 2, 1e-9));
}

console.log(fails ? `\nGEOMETRY: ${fails} FAILED` : '\nGEOMETRY: all green');
process.exit(fails ? 1 : 0);
