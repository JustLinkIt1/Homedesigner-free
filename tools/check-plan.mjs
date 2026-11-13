// Check a plan description before anyone is shown a model made from it.
//
//   node tools/check-plan.mjs <blueprint.json>
//
// A blueprint written by reading someone's drawing (by a person or a model) is
// easy to get subtly wrong, and the builder is forgiving: a door that is not
// exactly on a wall line is silently dropped, two rooms that overlap still
// draw. This runs the real builder and reports what it had to drop or could
// not make sense of, then prints every room's size so it can be read against
// the dimensions written on the original drawing.
//
// Exit code 0: nothing wrong was found. 1: at least one problem. Warnings do
// not fail the check; they are things to look at on the drawing.
//
// This is the first of three checks. It cannot tell whether the plan matches
// the drawing: that takes the size table below (check 2) and the rendered plan
// laid next to the original (check 3).
import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const [file] = process.argv.slice(2);
if (!file) {
  console.error('usage: node tools/check-plan.mjs <blueprint.json>');
  process.exit(2);
}
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = mkdtempSync(join(tmpdir(), 'hdcheck-'));
let plans, shared;
try {
  const bundle = async (entry, name) => {
    const outfile = join(dir, name);
    await build({
      entryPoints: [join(root, entry)], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent',
      define: { 'import.meta.env.VITE_CLOUD_SYNC_URL': '""', 'import.meta.env.BASE_URL': '"/app/"' },
    });
    return import(pathToFileURL(outfile).href);
  };
  plans = await bundle('src/lib/aiPlan.ts', 'plan.mjs');
  shared = await bundle('src/lib/sharedPlan.ts', 'shared.mjs');
} finally {
  rmSync(dir, { recursive: true, force: true });
}

const bp = JSON.parse(readFileSync(file, 'utf8'));
const problems = [];
const warnings = [];
const floorName = (i) => (i === 0 ? 'ground floor' : i === 1 ? 'upper floor' : `upper floor ${i}`);

// The same gate a claim link goes through.
const parsed = shared.parseSharedPlan(bp);
if (!parsed) {
  console.log('PROBLEM  The app would refuse this plan outright (wrong shape, unknown room type or opening kind, or a size out of range).');
  process.exit(1);
}

const DOORS = new Set(['door', 'open', 'entrance', 'garage']);
bp.floors.forEach((floor, level) => {
  const where = floorName(level);
  const byId = new Map(floor.rooms.map((r) => [r.id, r]));
  if (byId.size !== floor.rooms.length) problems.push(`${where}: two rooms share an id`);

  // Rooms must tile, not overlap.
  floor.rooms.forEach((a, i) => floor.rooms.slice(i + 1).forEach((b) => {
    const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    if (w > 0.5 && h > 0.5) problems.push(`${where}: "${a.name}" and "${b.name}" overlap by ${Math.round(w)} x ${Math.round(h)} cm`);
  }));

  // Rooms that touch nothing are almost always a misplaced coordinate.
  if (floor.rooms.length > 1) {
    for (const a of floor.rooms) {
      const touches = floor.rooms.some((b) => b !== a
        && a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h);
      if (!touches) problems.push(`${where}: "${a.name}" does not touch any other room`);
    }
  }

  // Every opening has to land strictly inside one wall run, with room for its width.
  const onEdge = (room, o) => (o.vertical
    ? (o.x === room.x || o.x === room.x + room.w) && o.y > room.y && o.y < room.y + room.h
    : (o.y === room.y || o.y === room.y + room.h) && o.x > room.x && o.x < room.x + room.w);
  floor.openings.forEach((o, n) => {
    const label = `${where}: ${o.kind} #${n + 1} at (${o.x}, ${o.y})`;
    const hosts = floor.rooms.filter((r) => onEdge(r, o));
    if (!hosts.length) {
      problems.push(`${label} is not on any room's wall line, so the builder drops it`);
      return;
    }
    for (const id of o.rooms) {
      const room = byId.get(id);
      if (!room) problems.push(`${label} names a room that does not exist ("${id}")`);
      else if (!onEdge(room, o)) problems.push(`${label} names "${room.name}" but is not on that room's wall`);
    }
    for (const room of hosts) {
      const lo = o.vertical ? room.y : room.x;
      const hi = o.vertical ? room.y + room.h : room.x + room.w;
      const at = o.vertical ? o.y : o.x;
      if (at - o.width / 2 < lo + 5 || at + o.width / 2 > hi - 5) {
        warnings.push(`${label} (${o.width} cm wide) runs past the end of "${room.name}"'s wall`);
        break;
      }
    }
    if (DOORS.has(o.kind) && o.kind !== 'entrance' && o.kind !== 'garage' && hosts.length < 2) {
      warnings.push(`${label} is an inside door on an outside wall`);
    }
    if (!DOORS.has(o.kind) && hosts.length > 1) warnings.push(`${label} is a window on a wall between two rooms`);
  });

  // Every room needs a way in.
  for (const room of floor.rooms) {
    const doors = floor.openings.filter((o) => DOORS.has(o.kind) && onEdge(room, o));
    if (!doors.length) problems.push(`${where}: "${room.name}" has no door`);
    const windows = floor.openings.filter((o) => !DOORS.has(o.kind) && onEdge(room, o));
    if (!windows.length && ['living', 'open_living', 'kitchen', 'dining', 'bedroom', 'office', 'playroom'].includes(room.type)) {
      warnings.push(`${where}: "${room.name}" has no window`);
    }
  }
});

if (!bp.floors[0].openings.some((o) => o.kind === 'entrance')) problems.push('ground floor: no front door (entrance)');

// Stairs have to be in the same place on every storey they join.
if (bp.floors.length > 1) {
  const stairs = bp.floors.map((f) => f.rooms.filter((r) => r.type === 'stairwell'));
  stairs.forEach((list, level) => { if (!list.length) problems.push(`${floorName(level)}: no stairwell, but the house has ${bp.floors.length} storeys`); });
  for (let level = 1; level < stairs.length; level++) {
    const below = stairs[level - 1][0];
    const here = stairs[level][0];
    if (below && here && (below.x !== here.x || below.y !== here.y || below.w !== here.w || below.h !== here.h)) {
      problems.push(`${floorName(level)}: the stairwell is not directly above the one below`);
    }
  }
}

// What the real builder makes of it.
const snap = plans.blueprintToSnapshot(parsed.blueprint, { allowPro: true, exterior: parsed.exterior, roof: parsed.roof });
const geoms = Object.values(snap.floorGeom);
bp.floors.forEach((floor, level) => {
  const built = geoms[level];
  const lost = floor.openings.length - built.openings.length;
  if (lost > 0) problems.push(`${floorName(level)}: the builder dropped ${lost} of ${floor.openings.length} doors and windows`);
  if (bp.furnished !== false && built.furniture.length === 0) warnings.push(`${floorName(level)}: nothing was furnished`);
});

// Check 2 material: sizes to read against the drawing.
const ft = (cm) => {
  const inches = Math.round(cm / 2.54);
  return `${Math.floor(inches / 12)}'${inches % 12}"`;
};
console.log(`${bp.title}: ${bp.floors.length} storey(s), ${(bp.widthCm / 100).toFixed(2)} x ${(bp.depthCm / 100).toFixed(2)} m overall\n`);
bp.floors.forEach((floor, level) => {
  const area = floor.rooms.reduce((sum, r) => sum + r.w * r.h, 0) / 10000;
  console.log(`${floorName(level)} (${area.toFixed(1)} m2, ${Math.round(area * 10.764)} sq ft)`);
  for (const r of floor.rooms) {
    console.log(`  ${r.name.padEnd(22)} ${(r.w / 100).toFixed(2)} x ${(r.h / 100).toFixed(2)} m   ${ft(r.w)} x ${ft(r.h)}   ${r.type}`);
  }
  const count = (kinds) => floor.openings.filter((o) => kinds.includes(o.kind)).length;
  console.log(`  doors ${count(['door', 'open', 'garage'])}, front doors ${count(['entrance'])}, windows ${count(['window', 'small_window'])}, bays ${count(['bay'])}\n`);
});

for (const w of warnings) console.log(`LOOK     ${w}`);
for (const p of problems) console.log(`PROBLEM  ${p}`);
console.log(problems.length ? `\n${problems.length} problem(s), ${warnings.length} thing(s) to look at` : `\nNo problems found${warnings.length ? `, ${warnings.length} thing(s) to look at` : ''}`);
process.exit(problems.length ? 1 : 0);
