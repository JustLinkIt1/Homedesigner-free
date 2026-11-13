// Roofs over L-shaped houses, and the street in front.
//
// Both are worked out from the plan with plain geometry, so both can be checked
// without a renderer:
//
//   * roofRects: an L, T or stepped outline is cut into blocks and each block
//     gets its own gable. The old single gable over the bounding box oversailed
//     every recess, and from the side you looked up into an open roof.
//   * streetPlan: the front door says which way the house faces; the road,
//     pavement, path, drive and fence are laid out from it, clear of the plan.
//
//   node tests/roof-street.mjs
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'hdroof-'));
let rects, street, roofs, views;
try {
  const bundle = async (entry, name) => {
    const outfile = join(dir, name);
    await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
    return import(pathToFileURL(outfile).href);
  };
  rects = await bundle('src/lib/roofRects.ts', 'rects.mjs');
  street = await bundle('src/lib/streetPlan.ts', 'street.mjs');
  roofs = await bundle('src/lib/roofGeometry.ts', 'roofs.mjs');
  views = await bundle('src/lib/renderView.ts', 'views.mjs');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
const { rectilinear, decompose, planPrisms, coverAt } = rects;
const { streetPlan } = street;
const { buildRoofGeometry } = roofs;

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : ` -- ${detail}`}`);
  if (!ok) failures++;
};
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const P = (x, y) => ({ x, y });

// ---- cutting an outline into blocks
// An L: a 1000 x 600 main block with a 400 x 300 wing below its left end.
const L = [P(0, 0), P(1000, 0), P(1000, 600), P(400, 600), P(400, 900), P(0, 900)];
{
  check('square-cornered outline is recognised', rectilinear(L) && !rectilinear([P(0, 0), P(600, 0), P(300, 500)]));
  const parts = decompose(L);
  check('L: two blocks, biggest first', parts.length === 2 && near(parts[0].u1 - parts[0].u0, 1000) && near(parts[0].v1 - parts[0].v0, 600), JSON.stringify(parts));
  check('L: the wing is the rest', near(parts[1].u0, 0) && near(parts[1].u1, 400) && near(parts[1].v0, 600) && near(parts[1].v1, 900));
  const area = parts.reduce((sum, r) => sum + (r.u1 - r.u0) * (r.v1 - r.v0), 0);
  check('L: the blocks cover the outline exactly', near(area, 1000 * 600 + 400 * 300));
  check('a plain rectangle is one block', decompose([P(0, 0), P(800, 0), P(800, 600), P(0, 600)]).length === 1);
}

// ---- a gable for each block
{
  const plan = planPrisms(decompose(L), 30);
  const [main, wing] = plan.prisms;
  check('main roof: ridge along the long side, a gable at each end',
    main.axis === 'u' && main.gableStart && main.gableEnd && near(main.mid, 300) && near(main.half, 330) && near(main.a0, -30) && near(main.a1, 1030));
  check('wing: a cross gable, ridge running out from the main roof', wing.axis === 'v' && near(wing.mid, 200) && near(wing.half, 230));
  check('wing: a gable at its outer end only', wing.gableEnd && !wing.gableStart && near(wing.a1, 930));
  check('wing: runs into the main roof far enough to be buried', wing.a0 < 600 - 200 && wing.a0 > 0);
  // Over the wing's own walls its roof is the one overhead; over the main block the main roof is higher.
  const overWing = coverAt(plan.prisms, 200, 800);
  check('over the wing the wing roof covers', near(overWing, 230));
  check('nothing roofs the empty corner of the L', coverAt(plan.prisms, 800, 800) === null);
  check('at the wing ridge inside the main block the main roof is higher',
    coverAt([main], 200, 400) > coverAt([wing], 200, 400) - 1e-6);
}
{
  // A narrower block carrying on from the main roof's gable end.
  const T = [P(0, 0), P(800, 0), P(800, 150), P(1100, 150), P(1100, 450), P(800, 450), P(800, 600), P(0, 600)];
  const plan = planPrisms(decompose(T), 0);
  const ext = plan.prisms[1];
  check('extension off a gable end: same ridge direction, butting the end wall',
    ext.axis === 'u' && near(ext.a0, 800) && near(ext.a1, 1100) && !ext.gableStart && ext.gableEnd);
  check('extension: its seam is the wall it butts', plan.seams.length === 1 && near(plan.seams[0][0].x, 800) && near(plan.seams[0][1].x, 800));
}
{
  // The whole thing through the mesh builder: an L gets a roof that stops at its walls.
  const eave = [P(-30, -30), P(1030, -30), P(1030, 630), P(430, 630), P(430, 930), P(-30, 930)];
  const built = buildRoofGeometry(eave, L, { type: 'gable', pitch: 35, overhang: 30, thickness: 18, covering: 'tile', coveringScaleCm: 100, color: '#8c4f38', windows: 2 }, 2.75);
  const pos = built.parts.covering.getAttribute('position');
  let maxX = -Infinity, maxZ = -Infinity, finite = true;
  for (let i = 0; i < pos.count; i++) {
    maxX = Math.max(maxX, pos.getX(i));
    maxZ = Math.max(maxZ, pos.getZ(i));
    finite = finite && Number.isFinite(pos.getY(i));
  }
  check('L roof: built in two pieces, covering and boards', !!built.parts && built.parts.trim.getAttribute('position').count > 0 && finite);
  check('L roof: reaches the wing end and no further', near(maxZ, 9.3, 1e-3) && near(maxX, 10.3, 1e-3), `${maxX}, ${maxZ}`);
  check('L roof: gable walls are filled', !!built.infill && built.infill.getAttribute('position').count > 0);
  check('L roof: roof windows keep clear of the wing', built.lights.length >= 2 && built.lights.length <= 4
    && built.lights.every((l) => !(l.position.x < 4.3 + 0.6 && l.position.z > 3)), `${built.lights.length}`);
  const plain = buildRoofGeometry([P(0, 0), P(800, 0), P(800, 600), P(0, 600)], null, { type: 'gable', pitch: 30, overhang: 0, thickness: 20, covering: 'tile', coveringScaleCm: 100, color: '#8c4f38' }, 2.7);
  check('a plain rectangle is still one gable, with no roof windows unless asked', !plain.parts && plain.lights.length === 0);
}

// ---- the street
const room = { id: 'r', name: 'Hall', floorMaterial: 'oak', color: '#fff', points: [P(0, 0), P(800, 0), P(800, 600), P(0, 600)] };
const wall = (id, a, b) => ({ id, start: a, end: b, thickness: 20, height: 275, color: '#eee' });
const walls = [wall('n', P(0, 0), P(800, 0)), wall('e', P(800, 0), P(800, 600)), wall('s', P(800, 600), P(0, 600)), wall('w', P(0, 600), P(0, 0))];
const door = { id: 'd', wallId: 's', type: 'door', style: 'front', offset: 0.5, width: 95, height: 210, sill: 0 };
{
  const plan = streetPlan({ walls, rooms: [room], openings: [door], furniture: [] });
  check('street: faces the way the front door does', !!plan && near(plan.front.x, 0) && near(plan.front.y, 1) && near(plan.origin.x, 400) && near(plan.origin.y, 600));
  check('street: pavement beyond a front garden, then the road', plan.pavement[0] >= 500 && near(plan.road[0], plan.pavement[1]) && plan.road[1] - plan.road[0] >= 500);
  check('street: the plot is wider than the house', plan.plot[0] < -400 && plan.plot[1] > 400 && plan.back < -600);
  check('street: a path from the door', near(plan.path.at, 0) && plan.path.from < 50);
  check('street: a drive beside the path, clear of it', !!plan.drive && Math.abs(plan.drive.at) - plan.drive.width / 2 >= plan.path.width / 2 + 30);
  const plainDoor = streetPlan({ walls, rooms: [room], openings: [{ ...door, style: 'single' }], furniture: [] });
  check('street: an ordinary outside door will do when there is no front door', !!plainDoor && near(plainDoor.front.y, 1));
  const both = streetPlan({ walls, rooms: [room], openings: [{ ...door, id: 'b', wallId: 'n', style: 'single' }, door], furniture: [] });
  check('street: a front door wins over an ordinary one', near(both.front.y, 1));
  check('street: garden doors and no doors give no street',
    streetPlan({ walls, rooms: [room], openings: [{ ...door, style: 'sliding' }], furniture: [] }) === null
    && streetPlan({ walls, rooms: [room], openings: [], furniture: [] }) === null);

  const patio = { id: 'p', name: 'Patio', floorMaterial: 'oak', color: '#fff', outdoor: true, points: [P(200, 600), P(600, 600), P(600, 1000), P(200, 1000)] };
  const pushed = streetPlan({ walls, rooms: [room, patio], openings: [door], furniture: [] });
  check('street: something drawn out front pushes the street away', pushed.pavement[0] >= 400 + 250 && pushed.pavement[0] > plan.pavement[0] - 1e-6);

  const garage = { id: 'g', wallId: 's', type: 'door', style: 'double', offset: 0.2, width: 240, height: 210, sill: 0 };
  const withGarage = streetPlan({ walls, rooms: [room], openings: [door, garage], furniture: [] });
  // The south wall runs from x=800 to x=0, so offset 0.2 is at x=640: 240 cm to the door's left as you face the street.
  check('street: the drive goes to a garage door', !!withGarage.drive && near(Math.abs(withGarage.drive.at), 240) && withGarage.drive.width >= 300);
}

// ---- inside or outside: which wording an AI render of this view gets
{
  const { renderViewOf } = views;
  const roof = { type: 'gable', pitch: 35, overhang: 30, thickness: 18, covering: 'tile', coveringScaleCm: 100, color: '#8c4f38' };
  const geom = { walls, rooms: [room], openings: [door], furniture: [] };
  const house = (dollhouse, withRoof) => ({ dollhouse, floors: [{ id: 'g', name: 'Ground', elevation: 0, ...(withRoof ? { roof } : {}) }], floorGeom: { g: geom } });
  const kerb = { x: 400, y: 1500, height: 170 };
  check('view: from the street, roof on, is an outside view', renderViewOf(house(false, true), kerb) === 'exterior');
  check('view: the cutaway is always an inside view', renderViewOf(house(true, true), kerb) === 'interior');
  check('view: standing in a room is an inside view', renderViewOf(house(false, true), { x: 400, y: 300, height: 160 }) === 'interior');
  check('view: high above a roofed house is still outside', renderViewOf(house(false, true), { x: 400, y: 300, height: 900 }) === 'exterior');
  check('view: no roof, seen from above, looks into the rooms', renderViewOf(house(false, false), { x: 400, y: 1500, height: 900 }) === 'interior');
  check('view: no roof, seen from eye level outside, is outside', renderViewOf(house(false, false), kerb) === 'exterior');
  const patio = { id: 'p', name: 'Patio', floorMaterial: 'oak', color: '#fff', outdoor: true, points: [P(200, 600), P(600, 600), P(600, 1000), P(200, 1000)] };
  check('view: standing on the patio is outside',
    renderViewOf({ ...house(false, true), floorGeom: { g: { ...geom, rooms: [room, patio] } } }, { x: 400, y: 800, height: 160 }) === 'exterior');
  check('view: an empty plan is not an outside view', renderViewOf({ dollhouse: false, floors: [], floorGeom: {} }, kerb) === 'interior');
}

console.log(failures === 0 ? '\nROOF AND STREET: all green' : `\nROOF AND STREET: ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
