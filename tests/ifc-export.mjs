// IFC4 export: write the bundled samples plus an angled-wall project, parse the
// files back with web-ifc (a devDependency, never shipped) and check the counts
// and the geometry.
//
//   node tests/ifc-export.mjs
//
// Sample files go to $IFC_OUT (or, on the Windows build box, the shared media
// folder). Elsewhere nothing is written.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import * as WebIFC from 'web-ifc';

const root = process.cwd();
const rootImport = root.replaceAll('\\', '/');
const dir = mkdtempSync(join(tmpdir(), 'hdifc-'));
const entry = join(root, '.ifc-entry.tmp.ts');
writeFileSync(entry, `
export { SAMPLES } from '${rootImport}/src/data/samples.ts';
export { buildIfc } from '${rootImport}/src/lib/ifcExport.ts';
export { isFence } from '${rootImport}/src/lib/fence.ts';
export { parapetSegments, roofOutlines, roofParapetContext } from '${rootImport}/src/lib/roofGeometry.ts';
`);
const out = join(dir, 'bundle.mjs');
try {
  await build({
    entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: out,
    define: { 'import.meta.env.BASE_URL': '"/"' },
  });
} finally {
  rmSync(entry, { force: true });
}
const { SAMPLES, buildIfc, isFence, parapetSegments, roofOutlines, roofParapetContext } = await import(pathToFileURL(out).href);

let checks = 0;
const check = (v, label) => { assert.ok(v, label); checks++; };
const eq = (a, b, label) => { assert.equal(a, b, `${label}: got ${a}, expected ${b}`); checks++; };

const outDir = process.env.IFC_OUT ?? (process.platform === 'win32' ? 'C:\\Projects\\DeepBlue\\shared\\drafts\\media\\hd-ifc' : null);
if (outDir) mkdirSync(outDir, { recursive: true });

// ---- projects -----------------------------------------------------------------

/** Normalise a sample (single- or multi-floor) into the writer's input. */
function inputOf(name, built) {
  const floors = built.floors ?? [{ id: 'f1', name: 'Ground floor', elevation: 0 }];
  const geom = built.floorGeom ?? { [floors[0].id]: built };
  const slim = {};
  for (const f of floors) {
    const g = geom[f.id];
    slim[f.id] = { walls: g.walls, rooms: g.rooms, openings: g.openings };
  }
  return { projectName: name, floors, geom: slim };
}

/** One storey with a 30 degree wall carrying a door and a window, a fence, an
 *  indoor room and an outdoor one. */
function angledProject() {
  const a = (30 * Math.PI) / 180;
  const L = 400;
  const S = { x: 100, y: 100 };
  const E = { x: S.x + L * Math.cos(a), y: S.y + L * Math.sin(a) };
  const wall = (id, s, e, extra = {}) => ({ id, start: s, end: e, thickness: 20, height: 260, color: '#fff', ...extra });
  const walls = [
    wall('w-angled', S, E),
    wall('w-down', E, { x: E.x, y: E.y + 300 }),
    wall('w-back', { x: E.x, y: E.y + 300 }, { x: S.x, y: S.y + 300 }),
    wall('w-left', { x: S.x, y: S.y + 300 }, S),
    wall('w-fence', { x: 0, y: 700 }, { x: 300, y: 720 }, { kind: 'fence', height: 110 }),
  ];
  const openings = [
    { id: 'o-door', wallId: 'w-angled', type: 'door', offset: 0.3, width: 90, height: 210, sill: 0 },
    { id: 'o-win', wallId: 'w-angled', type: 'window', offset: 0.7, width: 120, height: 120, sill: 90 },
    { id: 'o-fence-door', wallId: 'w-fence', type: 'door', offset: 0.5, width: 90, height: 100, sill: 0 },
  ];
  const rooms = [
    { id: 'r-in', name: 'Café & "den"', points: [S, E, { x: E.x, y: E.y + 300 }, { x: S.x, y: S.y + 300 }], floorMaterial: 'x', color: '#fff' },
    { id: 'r-out', name: 'Patio', outdoor: true, points: [{ x: 0, y: 500 }, { x: 200, y: 500 }, { x: 200, y: 650 }], floorMaterial: 'x', color: '#fff' },
  ];
  return { built: { floors: [{ id: 'f1', name: 'Ground', elevation: 0 }], floorGeom: { f1: { walls, rooms, furniture: [], openings, background: null } } }, S, E, a };
}

// ---- web-ifc ------------------------------------------------------------------

const api = new WebIFC.IfcAPI();
await api.Init();

const countOf = (model, type) => api.GetLineIDsWithType(model, type).size();
const ids = (model, type) => { const v = api.GetLineIDsWithType(model, type); return Array.from({ length: v.size() }, (_, i) => v.get(i)); };

/** World-space bounding box and triangle count of one product. */
function meshInfo(model, expressID) {
  const flat = api.GetFlatMesh(model, expressID);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let tris = 0;
  for (let i = 0; i < flat.geometries.size(); i++) {
    const pg = flat.geometries.get(i);
    const geo = api.GetGeometry(model, pg.geometryExpressID);
    const verts = api.GetVertexArray(geo.GetVertexData(), geo.GetVertexDataSize());
    const idx = api.GetIndexArray(geo.GetIndexData(), geo.GetIndexDataSize());
    tris += idx.length / 3;
    const m = pg.flatTransformation;
    for (let v = 0; v < verts.length; v += 6) {
      const x = verts[v], y = verts[v + 1], z = verts[v + 2];
      // web-ifc hands meshes back Y-up: (x, z, -y) of the IFC frame. Undo it.
      const o = [
        m[0] * x + m[4] * y + m[8] * z + m[12],
        m[1] * x + m[5] * y + m[9] * z + m[13],
        m[2] * x + m[6] * y + m[10] * z + m[14],
      ];
      const w = [o[0], -o[2], o[1]];
      for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], w[k]); max[k] = Math.max(max[k], w[k]); }
    }
    geo.delete?.();
  }
  return { min, max, tris, parts: flat.geometries.size() };
}

function verify(name, built, extra) {
  const input = inputOf(name, built);
  const text = buildIfc(input);
  check(buildIfc(input) === text, `${name}: same project gives byte-identical output`);
  check(text.startsWith('ISO-10303-21;') && text.includes("FILE_SCHEMA(('IFC4'))"), `${name}: STEP header`);
  if (outDir) writeFileSync(join(outDir, `${name}.ifc`), text);

  // What the input says should be there (independent of the writer).
  const floors = input.floors;
  const allWalls = floors.flatMap((f) => input.geom[f.id].walls);
  const solid = allWalls.filter((w) => !isFence(w));
  const solidIds = new Set(solid.map((w) => w.id));
  const openings = floors.flatMap((f) => input.geom[f.id].openings).filter((o) => solidIds.has(o.wallId));
  const doors = openings.filter((o) => o.type === 'door').length;
  const windows = openings.filter((o) => o.type === 'window').length;
  const spaces = floors.flatMap((f) => input.geom[f.id].rooms).filter((r) => !r.outdoor && r.points.length >= 3).length;

  const model = api.OpenModel(new TextEncoder().encode(text));
  eq(countOf(model, WebIFC.IFCPROJECT), 1, `${name}: IfcProject`);
  eq(countOf(model, WebIFC.IFCSITE), 1, `${name}: IfcSite`);
  eq(countOf(model, WebIFC.IFCBUILDING), 1, `${name}: IfcBuilding`);
  eq(countOf(model, WebIFC.IFCBUILDINGSTOREY), floors.length, `${name}: storeys = floors`);
  eq(countOf(model, WebIFC.IFCDOOR), doors, `${name}: IfcDoor`);
  eq(countOf(model, WebIFC.IFCWINDOW), windows, `${name}: IfcWindow`);
  eq(countOf(model, WebIFC.IFCOPENINGELEMENT), doors + windows, `${name}: IfcOpeningElement = doors + windows`);
  eq(countOf(model, WebIFC.IFCRELVOIDSELEMENT), doors + windows, `${name}: IfcRelVoidsElement`);
  eq(countOf(model, WebIFC.IFCRELFILLSELEMENT), doors + windows, `${name}: IfcRelFillsElement`);
  eq(countOf(model, WebIFC.IFCSPACE), spaces, `${name}: IfcSpace = indoor rooms`);
  // v1 elements are untouched by the roof (v2): STANDARD walls = the plan's
  // walls, FLOOR slabs = storeys. The roof adds an IfcRoof, a ROOF slab and
  // PARAPET walls per roofed storey.
  const roofed = floors.filter((f) => f.roof).length;
  const typed = (type, pre) => ids(model, type).filter((id) => api.GetLine(model, id).PredefinedType?.value === pre);
  eq(typed(WebIFC.IFCWALL, 'STANDARD').length, solid.length, `${name}: STANDARD IfcWall = non-fence walls`);
  eq(typed(WebIFC.IFCSLAB, 'FLOOR').length, floors.length, `${name}: FLOOR IfcSlab = storeys`);
  eq(countOf(model, WebIFC.IFCROOF), roofed, `${name}: IfcRoof = roofed storeys`);
  eq(typed(WebIFC.IFCSLAB, 'ROOF').length, roofed, `${name}: ROOF IfcSlab = roofed storeys`);
  const parapets = typed(WebIFC.IFCWALL, 'PARAPET').length;
  eq(countOf(model, WebIFC.IFCWALL), solid.length + parapets, `${name}: IfcWall = walls + parapets`);
  eq(countOf(model, WebIFC.IFCSLAB), floors.length + roofed, `${name}: IfcSlab = storeys + roofs`);

  // Everything v1 wrote comes out line for line: the same project with its
  // roofs taken off is an exact prefix of the file with them.
  const bare = buildIfc({ ...input, floors: floors.map(({ roof, ...f }) => f) });
  const TRAILER = 'ENDSEC;\nEND-ISO-10303-21;\n';
  check(bare.endsWith(TRAILER) && text.startsWith(bare.slice(0, -TRAILER.length)), `${name}: v1 lines unchanged, roof entities come after them`);

  // Storey elevations (metres) match the floors, in order.
  const elevs = ids(model, WebIFC.IFCBUILDINGSTOREY).map((id) => api.GetLine(model, id).Elevation.value).sort((a, b) => a - b);
  const wantElevs = floors.map((f) => f.elevation / 100).sort((a, b) => a - b);
  check(elevs.every((e, i) => Math.abs(e - wantElevs[i]) < 1e-6), `${name}: storey elevations`);

  // GlobalIds: 22 characters, all different.
  const guids = [];
  for (const type of [WebIFC.IFCPROJECT, WebIFC.IFCBUILDINGSTOREY, WebIFC.IFCWALL, WebIFC.IFCDOOR, WebIFC.IFCWINDOW, WebIFC.IFCOPENINGELEMENT, WebIFC.IFCSPACE]) {
    for (const id of ids(model, type)) guids.push(api.GetLine(model, id).GlobalId.value);
  }
  check(guids.every((g) => /^[0-3][0-9A-Za-z_$]{21}$/.test(g)), `${name}: GlobalIds are 22-char IFC base64`);
  eq(new Set(guids).size, guids.length, `${name}: GlobalIds unique`);

  // Slab tops sit at the storey elevations; slabs are 0.22 m thick.
  const slabIds = typed(WebIFC.IFCSLAB, 'FLOOR');
  const tops = slabIds.map((id) => meshInfo(model, id).max[2]).sort((a, b) => a - b);
  check(tops.every((z, i) => Math.abs(z - wantElevs[i]) < 0.01), `${name}: slab tops at storey elevations`);
  check(slabIds.every((id) => { const m = meshInfo(model, id); return Math.abs(m.max[2] - m.min[2] - 0.22) < 0.01; }), `${name}: slabs are 0.22 m thick`);

  // Every wall, door, window and space produces geometry; walls with openings
  // are cut (a plain 4-point prism is 12 triangles).
  const withHoles = new Set(openings.map((o) => o.wallId));
  let meshed = 0;
  for (const type of [WebIFC.IFCWALL, WebIFC.IFCDOOR, WebIFC.IFCWINDOW, WebIFC.IFCSPACE, WebIFC.IFCSLAB]) {
    for (const id of ids(model, type)) {
      const info = meshInfo(model, id);
      check(info.parts > 0 && info.tris >= 12, `${name}: express #${id} has geometry`);
      meshed++;
    }
  }
  let cutWalls = 0;
  for (const id of ids(model, WebIFC.IFCWALL)) {
    const line = api.GetLine(model, id);
    const hosted = ids(model, WebIFC.IFCRELVOIDSELEMENT).some((r) => api.GetLine(model, r).RelatingBuildingElement.value === id);
    if (hosted) {
      check(meshInfo(model, id).tris > 12, `${name}: wall #${line.expressID} with openings is cut`);
      cutWalls++;
    }
  }
  eq(cutWalls, withHoles.size, `${name}: every wall that hosts an opening is cut`);
  for (const id of [...typed(WebIFC.IFCSLAB, 'ROOF'), ...typed(WebIFC.IFCWALL, 'PARAPET')]) {
    check(meshInfo(model, id).tris >= 4, `${name}: roof part #${id} has geometry`);
  }
  check(text.length < 1024 * 1024, `${name}: file under 1 MB (${text.length} bytes)`);
  const res = { model, text, bare, input, meshed, counts: { storeys: floors.length, walls: solid.length, doors, windows, spaces, openings: doors + windows, roofs: roofed, parapets } };
  if (!extra) api.CloseModel(model);
  return res;
}

// ---- bundled samples ----------------------------------------------------------
const summary = [];
for (const s of SAMPLES) {
  const r = verify(s.id, s.build());
  summary.push(`${s.id}: ${JSON.stringify(r.counts)} ${r.text.length} bytes (v1 ${r.bare.length}, roof +${r.text.length - r.bare.length})`);
}
check(SAMPLES.some((s) => s.id === 'family-house'), 'family-house sample exists');

// ---- angled wall --------------------------------------------------------------
{
  const { built, S, a } = angledProject();
  const r = verify('angled', built, true);
  eq(r.counts.walls, 4, 'angled: the fence is left out');
  eq(r.counts.doors, 1, 'angled: the door on the fence is left out');
  const { model } = r;
  // Expected world position of each opening centre: along the wall axis, in IFC
  // space (x/100, -y/100), at the right sill.
  const L = 400;
  const origin = { x: S.x / 100, y: -S.y / 100 };
  const dirI = { x: Math.cos(a), y: -Math.sin(a) };
  const probe = (type, off, width, sill, height, label) => {
    const [id] = ids(model, type);
    const info = meshInfo(model, id);
    const c = (off * L) / 100;
    const cx = origin.x + dirI.x * c;
    const cy = origin.y + dirI.y * c;
    const mx = (info.min[0] + info.max[0]) / 2;
    const my = (info.min[1] + info.max[1]) / 2;
    check(Math.abs(mx - cx) < 0.01 && Math.abs(my - cy) < 0.01, `angled: ${label} centre sits on the wall axis at its offset (got ${mx.toFixed(3)},${my.toFixed(3)} want ${cx.toFixed(3)},${cy.toFixed(3)})`);
    check(Math.abs(info.min[2] - sill / 100) < 0.01 && Math.abs(info.max[2] - (sill + height) / 100) < 0.01, `angled: ${label} sill and height`);
    // The leaf's footprint runs along the wall direction: its extent along the
    // wall is the width, across it is the leaf thickness.
    let lo = Infinity, hi = -Infinity;
    for (const [x, y] of [[info.min[0], info.min[1]], [info.max[0], info.min[1]], [info.min[0], info.max[1]], [info.max[0], info.max[1]]]) {
      const p = (x - cx) * dirI.x + (y - cy) * dirI.y; lo = Math.min(lo, p); hi = Math.max(hi, p);
    }
    check(hi - lo >= width / 100 - 0.01, `angled: ${label} is at least ${width} cm wide along the wall`);
  };
  probe(WebIFC.IFCDOOR, 0.3, 90, 0, 210, 'door');
  probe(WebIFC.IFCWINDOW, 0.7, 120, 90, 120, 'window');
  api.CloseModel(model);
  summary.push(`angled: ${JSON.stringify(r.counts)}`);
}

// ---- roofs --------------------------------------------------------------------
/** An 8 x 6 m box, walls 270 high and 20 thick, with the given roof. */
function roofProject(roof) {
  const P = (x, y) => ({ x, y });
  const pts = [P(0, 0), P(800, 0), P(800, 600), P(0, 600)];
  const walls = pts.map((p, i) => ({ id: `w${i}`, start: p, end: pts[(i + 1) % 4], thickness: 20, height: 270, color: '#fff' }));
  const rooms = [{ id: 'r', name: 'Room', points: pts, floorMaterial: 'x', color: '#fff' }];
  return { floors: [{ id: 'f1', name: 'Ground', elevation: 0, roof }], floorGeom: { f1: { walls, rooms, furniture: [], openings: [], background: null } } };
}
const ROOF = { pitch: 0, overhang: 15, thickness: 18, covering: 'tile', coveringScaleCm: 100, color: '#888' };
const near = (a, b, eps = 0.01) => Math.abs(a - b) <= eps;
{
  // Flat roof with a 94 cm parapet.
  const built = roofProject({ ...ROOF, type: 'flat', parapet: 94 });
  const r = verify('roof-flat-parapet', built, true);
  const { model } = r;
  const [roofId] = ids(model, WebIFC.IFCROOF);
  eq(api.GetLine(model, roofId).PredefinedType.value, 'FLAT_ROOF', 'flat: IfcRoof is FLAT_ROOF');
  const slab = ids(model, WebIFC.IFCSLAB).find((id) => api.GetLine(model, id).PredefinedType.value === 'ROOF');
  const s = meshInfo(model, slab);
  // Eave outline: outer wall face (-10..810, -610..10 in IFC y) plus 15 cm.
  check(near(s.min[0], -0.25) && near(s.max[0], 8.25) && near(s.min[1], -6.25) && near(s.max[1], 0.25), `flat: roof slab covers the eave outline (${s.min.map((v) => v.toFixed(3))} .. ${s.max.map((v) => v.toFixed(3))})`);
  check(near(s.min[2], 2.7) && near(s.max[2], 2.88), `flat: roof slab sits on the walls, 18 cm thick (z ${s.min[2].toFixed(3)}..${s.max[2].toFixed(3)})`);
  const walls = built.floorGeom.f1.walls;
  const o = roofOutlines(walls, 15, false);
  const segs = parapetSegments(o.wall, 2.7, roofParapetContext(walls));
  eq(r.counts.parapets, segs.length, 'flat: one parapet wall per parapet run');
  eq(segs.length, 4, 'flat: a plain box gets a parapet run on every edge');
  for (const id of ids(model, WebIFC.IFCWALL).filter((id) => api.GetLine(model, id).PredefinedType.value === 'PARAPET')) {
    const m = meshInfo(model, id);
    check(near(m.min[2], 2.7) && near(m.max[2], 2.7 + 0.18 + 0.94), `flat: parapet #${id} runs from the eave to above the deck (z ${m.min[2].toFixed(3)}..${m.max[2].toFixed(3)})`);
    check(m.min[0] >= -0.1 - 0.01 && m.max[0] <= 8.1 + 0.01 && m.min[1] >= -6.1 - 0.01 && m.max[1] <= 0.1 + 0.01, `flat: parapet #${id} stands on the walls, not on the overhang`);
  }
  api.CloseModel(model);
  summary.push(`roof-flat-parapet: ${JSON.stringify(r.counts)} ${r.text.length} bytes (v1 ${r.bare.length}, roof +${r.text.length - r.bare.length})`);
}
{
  // Gable roof, 35 degrees.
  const built = roofProject({ ...ROOF, type: 'gable', pitch: 35 });
  const r = verify('roof-gable', built, true);
  const { model } = r;
  const [roofId] = ids(model, WebIFC.IFCROOF);
  eq(api.GetLine(model, roofId).PredefinedType.value, 'GABLE_ROOF', 'gable: IfcRoof is GABLE_ROOF');
  eq(r.counts.parapets, 0, 'gable: no parapet');
  check(r.text.includes('IFCTRIANGULATEDFACESET('), 'gable: written as a triangulated face set');
  const slab = ids(model, WebIFC.IFCSLAB).find((id) => api.GetLine(model, id).PredefinedType.value === 'ROOF');
  const s = meshInfo(model, slab);
  check(s.tris >= 8, `gable: roof has triangles (${s.tris})`);
  check(near(s.min[0], -0.25, 0.03) && near(s.max[0], 8.25, 0.03) && near(s.min[1], -6.25, 0.03) && near(s.max[1], 0.25, 0.03), `gable: roof covers the eave outline in plan, right way up in y (${s.min.map((v) => v.toFixed(3))} .. ${s.max.map((v) => v.toFixed(3))})`);
  // The roof rises tan 35 x the half-span from the eave: 2.28 m (ridge along the 8 m side)
  // or 2.98 m (along the 6 m side, which is how buildRoofGeometry turns this box).
  check(s.min[2] > 2.3 && s.min[2] < 2.75 && s.max[2] > 2.7 + 2.2 && s.max[2] < 2.7 + 3.1, `gable: eave near the wall top, ridge 2.3-3 m above (z ${s.min[2].toFixed(3)}..${s.max[2].toFixed(3)})`);
  api.CloseModel(model);
  summary.push(`roof-gable: ${JSON.stringify(r.counts)} ${r.text.length} bytes (v1 ${r.bare.length}, roof +${r.text.length - r.bare.length})`);
}

// ---- text escaping ------------------------------------------------------------
{
  const { built } = angledProject();
  const text = buildIfc(inputOf('Étage "1" – it\'s', built));
  const model = api.OpenModel(new TextEncoder().encode(text));
  const names = ids(model, WebIFC.IFCSPACE).map((id) => api.GetLine(model, id).Name.value);
  check(names.includes('Café & "den"'), `non-ASCII room names survive a round trip (got ${JSON.stringify(names)})`);
  const project = api.GetLine(model, ids(model, WebIFC.IFCPROJECT)[0]);
  check(project.Name.value === 'Étage "1" – it\'s', `project name survives a round trip (got ${project.Name.value})`);
  api.CloseModel(model);
}

console.log(summary.join('\n'));
console.log(`ifc-export: ${checks} checks passed`);
rmSync(dir, { recursive: true, force: true });
