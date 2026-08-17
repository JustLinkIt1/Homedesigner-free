// Build room-naming accuracy fixtures from the SHIPPED sample homes.
//
// The point of using the samples rather than invented rooms is that they are
// the only floor plans in the repo with an authored, human-chosen name on every
// room — a ground truth nobody wrote to make the model look good — and the
// summaries built here are assembled exactly the way the client will assemble
// them: polygon area, bounding box, the furniture standing inside the polygon,
// and the doors and windows on the room's own walls.
//
//   node tools/room-naming-fixtures.mjs        → writes tools/room-naming-fixtures.json
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { build } from 'esbuild';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const rootImport = root.replaceAll('\\', '/');
const dir = mkdtempSync(join(tmpdir(), 'hdrooms-'));
const entry = join(root, '.rooms-entry.tmp.ts');
writeFileSync(entry, `
export { SAMPLES } from '${rootImport}/src/data/samples.ts';
export { polygonArea } from '${rootImport}/src/lib/geometry.ts';
`);
const out = join(dir, 'bundle.mjs');
try {
  await build({
    entryPoints: [entry], bundle: true, format: 'esm', platform: 'node',
    define: { 'import.meta.env.BASE_URL': '"/"' },
    outfile: out,
  });
} finally {
  rmSync(entry, { force: true });
}
const { SAMPLES, polygonArea } = await import(pathToFileURL(out).href);

const bbox = (pts) => {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return { w: Math.max(...xs) - Math.min(...xs), d: Math.max(...ys) - Math.min(...ys) };
};

/** Standard ray casting. Furniture sits at its centre point, which is inside
 *  the room it belongs to for every piece in the samples. */
const inside = (pt, pts) => {
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if ((a.y > pt.y) !== (b.y > pt.y)
      && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
};

/** Distance from a point to a segment — used to decide which rooms a door or
 *  window belongs to. An opening on a shared wall counts for BOTH rooms, which
 *  is the truth: a door between a hallway and a bedroom is a door in each. */
const distToSegment = (p, a, b) => {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const len2 = vx * vx + vy * vy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2));
  return Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy));
};

/** How close an opening's centre must sit to a room's boundary to count as
 *  that room's. Generous enough to survive wall thickness (default 10cm) and
 *  the room polygon being drawn on the wall centreline. */
const OPENING_TOLERANCE_CM = 40;

const openingCentre = (opening, wall) => {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const len = Math.hypot(dx, dy) || 1;
  const at = opening.offset + opening.width / 2;
  return { x: wall.start.x + (dx / len) * at, y: wall.start.y + (dy / len) * at };
};

const floorsOf = (snapshot) => {
  if (snapshot.floorGeom && snapshot.floors) {
    return snapshot.floors.map((floor) => ({
      floor: floor.name,
      geom: snapshot.floorGeom[floor.id],
    })).filter((entry) => entry.geom);
  }
  return [{ floor: 'Ground floor', geom: snapshot }];
};

const fixtures = [];
for (const sample of SAMPLES) {
  const snapshot = sample.build();
  for (const { floor, geom } of floorsOf(snapshot)) {
    const wallById = new Map((geom.walls ?? []).map((w) => [w.id, w]));
    for (const room of geom.rooms ?? []) {
      const pts = room.points;
      if (!pts || pts.length < 3) continue;
      const { w, d } = bbox(pts);
      const furniture = (geom.furniture ?? [])
        .filter((item) => inside(item.position, pts))
        .map((item) => item.type);
      let doors = 0;
      let windows = 0;
      for (const opening of geom.openings ?? []) {
        const wall = wallById.get(opening.wallId);
        if (!wall) continue;
        const centre = openingCentre(opening, wall);
        let onBoundary = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          if (distToSegment(centre, pts[i], pts[j]) <= OPENING_TOLERANCE_CM) { onBoundary = true; break; }
        }
        if (!onBoundary) continue;
        if (opening.type === 'door') doors += 1; else windows += 1;
      }
      fixtures.push({
        sample: sample.id,
        floor,
        // The authored name is the ground truth. It is NOT sent to the model.
        authored: room.name,
        outdoorPolygon: room.outdoor === true,
        summary: {
          // Opaque id: a name-shaped id would hand the model the answer.
          id: `r${fixtures.length + 1}`,
          areaSqm: Math.round((polygonArea(pts) / 10000) * 10) / 10,
          widthCm: Math.round(w),
          depthCm: Math.round(d),
          furniture,
          outdoor: room.outdoor === true,
          doors,
          windows,
        },
      });
    }
  }
}

const path = join(root, 'tools', 'room-naming-fixtures.json');
writeFileSync(path, `${JSON.stringify(fixtures, null, 2)}\n`);
rmSync(dir, { recursive: true, force: true });

console.log(`${fixtures.length} rooms from ${SAMPLES.length} samples → ${path}\n`);
for (const f of fixtures) {
  const s = f.summary;
  console.log(
    `${f.sample}/${f.floor.padEnd(12)} ${String(f.authored).padEnd(18)} `
    + `${String(s.areaSqm).padStart(5)}m2 ${(s.widthCm / 100).toFixed(1)}x${(s.depthCm / 100).toFixed(1)}m `
    + `d${s.doors} w${s.windows} ${s.outdoor ? '[outdoor] ' : ''}${s.furniture.join(',') || '(empty)'}`,
  );
}
