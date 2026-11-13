// Outside faces and bay windows.
//
// Two things here decide what a house looks like from the street, and both are
// plain geometry that can be checked without a renderer:
//
//   * exteriorRanges: which stretches of a wall face are outdoors. A long wall
//     is often outdoors for only part of its length (a wing steps back, an
//     upper storey oversails). Testing only the wall's midpoint left those
//     stretches unclad: bare strips on an otherwise brick house.
//   * bayParts: the three walls, the glazing and the floor a 'bay' window adds,
//     all derived from the one window record on the host wall, projecting
//     outdoors.
//
//   node tests/exterior.mjs
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'hdext-'));
let ext, bay;
try {
  const bundle = async (entry, name) => {
    const outfile = join(dir, name);
    await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' });
    return import(pathToFileURL(outfile).href);
  };
  ext = await bundle('src/lib/exteriorFaces.ts', 'exterior.mjs');
  bay = await bundle('src/lib/bayWindow.ts', 'bay.mjs');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
const { exteriorRanges, exteriorSideAt, exteriorFaces } = ext;
const { bayParts, bayFrame, isBay, BAY_DEPTH } = bay;

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : ` -- ${detail}`}`);
  if (!ok) failures++;
};
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const rect = (id, x, y, w, h, extra = {}) => ({
  id, name: id, floorMaterial: 'oak', color: '#fff',
  points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }], ...extra,
});
const wall = (id, ax, ay, bx, by, extra = {}) => ({
  id, start: { x: ax, y: ay }, end: { x: bx, y: by }, thickness: 20, height: 275, color: '#eee', ...extra,
});

// An L-shaped house: a 600x400 main room, and a 300x300 wing below its left half.
//   main: (0,0)-(600,400)   wing: (0,400)-(300,700)
const rooms = [rect('main', 0, 0, 600, 400), rect('wing', 0, 400, 300, 300)];
// One wall along y=400 for the whole width: indoors over the wing, outdoors beyond it.
const shared = wall('shared', 0, 400, 600, 400);
// The wall's left normal (side +1) is (-dy, dx) = (0, 1): towards +y, the wing side.
{
  const plus = exteriorRanges(shared, rooms, 1);
  check('partly outdoor wall: only the stretch past the wing is outdoors',
    plus.length === 1 && near(plus[0][0], 0.5) && near(plus[0][1], 1), JSON.stringify(plus));
  check('partly outdoor wall: the room side is never outdoors', exteriorRanges(shared, rooms, -1).length === 0);
  check('side at a point: indoors over the wing', exteriorSideAt(shared, rooms, 0.25) === null);
  check('side at a point: outdoors past it', exteriorSideAt(shared, rooms, 0.75) === 1);
}
{
  const top = wall('top', 0, 0, 600, 0); // normal (0,1) points into the room
  check('fully outdoor wall: one whole range on the outer side',
    JSON.stringify(exteriorRanges(top, rooms, -1)) === '[[0,1]]' && exteriorRanges(top, rooms, 1).length === 0);
  const faces = exteriorFaces([top, shared], rooms);
  check('exteriorFaces: one range per outdoor stretch',
    faces.length === 2 && faces.some((f) => f.wallId === 'shared' && near(f.face.start, 0.5) && f.face.side === 1));
}
{
  const deck = rect('deck', 300, 400, 300, 200, { outdoor: true });
  const plus = exteriorRanges(shared, [...rooms, deck], 1);
  check('a deck against the wall is still outdoors', plus.length === 1 && near(plus[0][0], 0.5) && near(plus[0][1], 1));
  check('zero-length wall: nothing', exteriorRanges(wall('z', 5, 5, 5, 5), rooms, 1).length === 0);
}

// ---- bay windows
const room = [rect('sit', 0, 0, 400, 500)];
const south = wall('south', 0, 500, 400, 500); // normal (0,1): +1 is outdoors (below the room)
const opening = { id: 'o1', wallId: 'south', type: 'window', style: 'bay', offset: 0.5, width: 200, height: 135, sill: 85 };
{
  check('isBay: a bay window only', isBay(opening) && !isBay({ type: 'window', style: 'standard' }) && !isBay({ type: 'door', style: 'bay' }));
  const frame = bayFrame(south, opening, room);
  check('bay projects outdoors', frame.side === 1 && near(frame.depth, BAY_DEPTH));
  const [a0, a1, b1, b0] = frame.corners;
  check('bay corners: on the wall, then out by the depth',
    near(a0.x, 100) && near(a0.y, 500) && near(b0.x, 300) && near(a1.y, 500 + BAY_DEPTH) && near(b1.x, 300) && near(b1.y, 500 + BAY_DEPTH));

  const north = wall('north', 400, 0, 0, 0); // reversed wall: outdoors is its +1 side too (normal (0,-1))
  const up = bayFrame(north, { ...opening, wallId: 'north' }, room);
  check('bay on a wall drawn the other way still projects outdoors', up.side === 1 && up.corners[1].y < 0);

  const parts = bayParts([south], [opening], room);
  check('bay adds three walls', parts.walls.length === 3 && parts.walls.every((w) => w.id.startsWith('o1:bay:')));
  check('bay walls are slimmer than the host and as tall', parts.walls.every((w) => w.thickness <= 12 && w.height === 275));
  const front = parts.walls.find((w) => w.id.endsWith(':f'));
  check('front wall spans the bay', near(Math.abs(front.end.x - front.start.x), 200) && near(front.start.y, 500 + BAY_DEPTH));
  check('bay glazing: a front window and two side lights at the bay\'s sill and height',
    parts.openings.length === 3 && parts.openings.every((o) => o.type === 'window' && o.sill === 85 && o.height === 135));
  const frontWin = parts.openings.find((o) => o.wallId === front.id);
  check('front window leaves a pier at each corner', frontWin.width < 200 && frontWin.width > 150 && near(frontWin.offset, 0.5));
  check('floor patch belongs to the room behind the wall', parts.floors.length === 1 && parts.floors[0].room?.id === 'sit' && parts.floors[0].points.length === 4);

  const shallow = bayParts([south], [{ ...opening, depth: 35 }], room);
  check('a shallow bay has no side lights', shallow.openings.length === 1);
  check('depth is honoured', near(bayFrame(south, { ...opening, depth: 90 }, room).depth, 90));

  const clad = { ...south, faceFinishes: [{ start: 0, end: 1, side: 1, color: '#9c5a44' }, { start: 0, end: 1, side: -1, color: '#ffffff' }] };
  const dressed = bayParts([clad], [opening], room);
  const outward = { ':a': [-1, 0], ':f': [0, 1], ':b': [1, 0] };
  const sidesRight = dressed.walls.every((w) => {
    const f = w.faceFinishes ?? [];
    if (f.length !== 1 || f[0].color !== '#9c5a44' || f[0].start !== 0 || f[0].end !== 1) return false;
    const dx = w.end.x - w.start.x, dy = w.end.y - w.start.y;
    const [ox, oy] = outward[w.id.slice(-2)];
    return Math.sign((-dy * ox + dx * oy) * f[0].side) === 1; // the finished face looks away from the bay
  });
  check('bay walls take the host\'s outside finish, on their outside face', sidesRight);

  check('no bays: nothing added', bayParts([south], [{ ...opening, style: 'standard' }], room).walls.length === 0);
  check('a bay whose wall is gone is skipped', bayParts([], [opening], room).walls.length === 0);
}

console.log(failures === 0 ? '\nEXTERIOR: all green' : `\nEXTERIOR: ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
