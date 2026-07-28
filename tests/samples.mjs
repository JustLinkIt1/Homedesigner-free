// Sample-home sanity: every shipped template is the first thing a new user
// sees, so furniture must not sit inside walls, block a doorway, or overlap
// another piece. These are pure geometry checks over the sample definitions.
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const dir = mkdtempSync(join(tmpdir(), 'hdsamples-'));
const sourceRoot = process.cwd().replaceAll('\\', '/');
const entry = join(process.cwd(), '.samples-entry.tmp.ts');
writeFileSync(entry, `
export { SAMPLES } from '${sourceRoot}/src/data/samples.ts';
export { CATALOG_BY_TYPE } from '${sourceRoot}/src/data/furnitureCatalog.ts';
export { isFence } from '${sourceRoot}/src/lib/fence.ts';
`);
const out = join(dir, 'bundle.mjs');
// `import.meta.env` is Vite-only; the sample dressing calls materialUrl(), so
// define a stand-in rather than stubbing the module.
await build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  platform: 'node',
  define: { 'import.meta.env.BASE_URL': '"/"' },
  outfile: out,
});
rmSync(entry, { force: true });

const { SAMPLES, CATALOG_BY_TYPE, isFence } = await import(pathToFileURL(out).href);

let fails = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) fails++;
};

// --- geometry helpers --------------------------------------------------------
const rotate = (px, py, deg) => {
  const r = (-deg * Math.PI) / 180;
  return { x: px * Math.cos(r) - py * Math.sin(r), y: px * Math.sin(r) + py * Math.cos(r) };
};
/** Axis-aligned corners of a rotated furniture footprint. */
const corners = (f) => {
  const hw = f.width / 2;
  const hd = f.depth / 2;
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([dx, dy]) => {
    const r = rotate(dx, dy, f.rotation);
    return { x: f.position.x + r.x, y: f.position.y + r.y };
  });
};
const polyBounds = (pts) => ({
  minX: Math.min(...pts.map((p) => p.x)), maxX: Math.max(...pts.map((p) => p.x)),
  minY: Math.min(...pts.map((p) => p.y)), maxY: Math.max(...pts.map((p) => p.y)),
});
/** Separating-axis overlap area proxy: AABB intersection of the two footprints. */
const aabbOverlap = (a, b) => {
  const A = polyBounds(corners(a));
  const B = polyBounds(corners(b));
  const w = Math.min(A.maxX, B.maxX) - Math.max(A.minX, B.minX);
  const h = Math.min(A.maxY, B.maxY) - Math.max(A.minY, B.minY);
  return w > 0 && h > 0 ? w * h : 0;
};
/** Distance from point to segment. */
const segDist = (p, a, b) => {
  const vx = b.x - a.x, vy = b.y - a.y;
  const L = vx * vx + vy * vy;
  const t = L ? Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / L)) : 0;
  const cx = a.x + t * vx, cy = a.y + t * vy;
  return Math.hypot(p.x - cx, p.y - cy);
};

// Shapes that are MEANT to sit in/on a wall or above the floor, so wall overlap
// and floor-footprint overlap are not defects for them.
const WALL_MOUNTED = new Set(['curtains', 'wall_art', 'mirror', 'sconce', 'cabinets', 'wall_cabinet']);
const CEILING = new Set(['pendant', 'ceiling_light', 'spotlight', 'led_strip', 'cove_light']);
const FLAT = new Set(['rug']); // things other furniture legitimately stands on
const ON_TOP = new Set(['throw_pillows', 'desk_lamp', 'monitor', 'watering_can']);
const SEATS = new Set(['chair', 'stool']);
const SURFACES = new Set(['table', 'desk', 'side_table', 'counter']);

for (const sample of SAMPLES) {
  const built = sample.build();
  const floors = built.floorGeom ? Object.values(built.floorGeom) : [built];

  for (const [fi, geom] of floors.entries()) {
    const label = `${sample.id}${floors.length > 1 ? ` [floor ${fi}]` : ''}`;
    const walls = (geom.walls ?? []).filter((w) => !isFence(w));
    const furniture = geom.furniture ?? [];

    // 1. Nothing may be buried inside a structural wall.
    const buried = [];
    for (const f of furniture) {
      const e = CATALOG_BY_TYPE[f.type];
      const shape = e?.shape ?? 'box';
      if (WALL_MOUNTED.has(f.type) || WALL_MOUNTED.has(shape) || CEILING.has(shape)) continue;
      for (const w of walls) {
        const d = segDist(f.position, w.start, w.end);
        // Centre inside the wall body means it is embedded, not merely against it.
        if (d < w.thickness / 2) { buried.push(`${f.type}@${Math.round(f.position.x)},${Math.round(f.position.y)}`); break; }
      }
    }
    check(`${label}: no furniture buried in a wall`, buried.length === 0, buried.join(' '));

    // 2. Doorways must stay walkable. Test the real threshold rectangle (door
    // width x 55cm either side of the wall), not a radius — a radius flags
    // anything merely standing beside the opening.
    const blocked = [];
    for (const o of geom.openings ?? []) {
      if (o.type !== 'door') continue;
      const w = walls.find((q) => q.id === o.wallId);
      if (!w) continue;
      const dx = w.end.x - w.start.x, dy = w.end.y - w.start.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len;      // along the wall
      const nx = -uy, ny = ux;                 // across it
      const cx = w.start.x + dx * o.offset;
      const cy = w.start.y + dy * o.offset;
      const halfW = o.width / 2;
      const reach = 55;
      for (const f of furniture) {
        const shape = CATALOG_BY_TYPE[f.type]?.shape ?? 'box';
        if (CEILING.has(shape) || FLAT.has(shape) || WALL_MOUNTED.has(shape)) continue;
        if (WALL_MOUNTED.has(f.type)) continue;
        // A staircase beside a door IS the route through it — in a narrow
        // terrace the stair foot legitimately meets the hall door.
        if (shape === 'stairs') continue;
        // Project each footprint corner into (along, across) door space.
        const inThreshold = corners(f).some((p) => {
          const along = (p.x - cx) * ux + (p.y - cy) * uy;
          const across = (p.x - cx) * nx + (p.y - cy) * ny;
          return Math.abs(along) < halfW && Math.abs(across) < reach;
        });
        if (inThreshold) blocked.push(`${f.type} blocks door on ${w.id}`);
      }
    }
    check(`${label}: doorways are not blocked`, blocked.length === 0, blocked.slice(0, 4).join(' | '));

    // 3. Two solid pieces must not occupy the same floor.
    const clashes = [];
    for (let i = 0; i < furniture.length; i++) {
      for (let j = i + 1; j < furniture.length; j++) {
        const a = furniture[i], b = furniture[j];
        const sa = CATALOG_BY_TYPE[a.type]?.shape ?? 'box';
        const sb = CATALOG_BY_TYPE[b.type]?.shape ?? 'box';
        if (CEILING.has(sa) || CEILING.has(sb)) continue;
        if (FLAT.has(sa) || FLAT.has(sb)) continue;
        if (WALL_MOUNTED.has(a.type) || WALL_MOUNTED.has(b.type)) continue;
        // Legitimate stacking/tucking: pillows on a sofa, a lamp on a desk,
        // chairs pushed under a table. These SHOULD overlap in plan.
        if (ON_TOP.has(a.type) || ON_TOP.has(b.type)) continue;
        const tuck = (x, y) => SEATS.has(x) && SURFACES.has(y);
        if (tuck(sa, sb) || tuck(sb, sa)) continue;
        const ov = aabbOverlap(a, b);
        const smaller = Math.min(a.width * a.depth, b.width * b.depth);
        // Allow slight touching; flag real interpenetration.
        if (ov > smaller * 0.35) clashes.push(`${a.type}/${b.type}`);
      }
    }
    check(`${label}: no furniture overlaps another piece`, clashes.length === 0, clashes.slice(0, 5).join(' | '));

    // 4. A staircase needs landing space: no wall within 150cm of either end,
    //    measured straight off the run. A stair that arrives at a wall is
    //    unusable, and it is the single easiest thing to get wrong in a plan.
    const LANDING = 150;
    const tight = [];
    for (const f of furniture) {
      if ((CATALOG_BY_TYPE[f.type]?.shape ?? '') !== 'stairs') continue;
      // The run points along the item's depth axis; both ends need clearance.
      const rad = (-f.rotation * Math.PI) / 180;
      const ax = Math.sin(rad), ay = Math.cos(rad); // unit vector along the run
      for (const dir of [1, -1]) {
        const ex = f.position.x + ax * dir * (f.depth / 2);
        const ey = f.position.y + ay * dir * (f.depth / 2);
        for (const w of walls) {
          // Ignore the wall the stair runs alongside; only the wall it FACES
          // matters, so measure from the end point straight ahead.
          const d = segDist({ x: ex + ax * dir * LANDING * 0.5, y: ey + ay * dir * LANDING * 0.5 }, w.start, w.end);
          if (d < LANDING * 0.5) {
            tight.push(`${f.type} end@${Math.round(ex)},${Math.round(ey)} vs ${w.id}`);
            break;
          }
        }
      }
    }
    check(`${label}: stairs have landing space at both ends`, tight.length === 0, tight.slice(0, 3).join(' | '));

    // 5. Every piece must resolve to a catalog entry.
    const unknown = furniture.filter((f) => !CATALOG_BY_TYPE[f.type]).map((f) => f.type);
    check(`${label}: every piece exists in the catalog`, unknown.length === 0, unknown.join(' '));
  }
}

// 6. Every sample should now show off the outdoor work.
for (const sample of SAMPLES) {
  const built = sample.build();
  const floors = built.floorGeom ? Object.values(built.floorGeom) : [built];
  const rooms = floors.flatMap((g) => g.rooms ?? []);
  const furniture = floors.flatMap((g) => g.furniture ?? []);
  const hasOutdoor = rooms.some((r) => r.outdoor);
  const hasGarden = furniture.some((f) => ['tree', 'tree_small', 'hedge', 'parasol', 'sun_lounger',
    'bbq', 'fire_pit', 'planter_box', 'patio_table', 'patio_chair', 'bench'].includes(f.type));
  check(`${sample.id}: has an outdoor area`, hasOutdoor);
  check(`${sample.id}: has garden furniture`, hasGarden);
}

console.log(fails ? `\nSAMPLES: ${fails} FAILED` : '\nSAMPLES: all green');
process.exit(fails ? 1 : 0);
