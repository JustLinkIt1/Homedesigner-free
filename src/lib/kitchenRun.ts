// Shared geometry for the kitchen-run tool: given a drawn segment a→b, tile
// single cabinet units end-to-end along it, each oriented so its back sits
// against the wall and its front faces the room. Used by BOTH the store action
// that commits the run and the live ghost preview, so they can never drift.
import { CATALOG_BY_TYPE } from '../data/furnitureCatalog';
import { KITCHEN_UNIT_BY_TYPE } from './kitchenUnits';
import type { Point } from '../types';

export interface RunUnit {
  position: Point;
  /** Furniture rotation in CW degrees (0 faces +Y). */
  rotation: number;
}

interface RoomLike { points: Point[] }
interface WallLike { start: Point; end: Point }

/** Base-cabinet footprint (falls back if the catalog entry is missing). */
export const RUN_UNIT = {
  width: CATALOG_BY_TYPE['kitchen_base_cabinet']?.width ?? 55,
  depth: CATALOG_BY_TYPE['kitchen_base_cabinet']?.depth ?? 60,
};
const UPPER = {
  width: CATALOG_BY_TYPE['wall_cabinet']?.width ?? 80,
  depth: CATALOG_BY_TYPE['wall_cabinet']?.depth ?? 35,
};

/** Direction, length and interior-facing rotation for a run a→b. */
function runGeometry(a: Point, b: Point, rooms: RoomLike[], walls: WallLike[]) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  const ux = dx / (len || 1);
  const uy = dy / (len || 1);
  let rotation = (Math.atan2(uy, ux) * 180) / Math.PI;

  // Face the interior: flip 180° if the front points away from the nearest
  // room's centre (else the whole design's centre).
  const mx = a.x + ux * (len / 2);
  const my = a.y + uy * (len / 2);
  let ref: Point | null = null;
  let best = Infinity;
  for (const r of rooms) {
    const k = r.points.length || 1;
    const c = r.points.reduce((s, p) => ({ x: s.x + p.x / k, y: s.y + p.y / k }), { x: 0, y: 0 });
    const d2 = (c.x - mx) ** 2 + (c.y - my) ** 2;
    if (d2 < best) { best = d2; ref = c; }
  }
  if (!ref && walls.length) {
    const k = walls.length;
    ref = walls.reduce(
      (s, w) => ({ x: s.x + (w.start.x + w.end.x) / (2 * k), y: s.y + (w.start.y + w.end.y) / (2 * k) }),
      { x: 0, y: 0 },
    );
  }
  if (ref) {
    const rad = (rotation * Math.PI) / 180;
    const fx = -Math.sin(rad);
    const fy = Math.cos(rad);
    if (fx * (ref.x - mx) + fy * (ref.y - my) < 0) rotation += 180;
  }
  // Unit forward (front) direction in 2D at the final rotation.
  const rad = (rotation * Math.PI) / 180;
  return { ux, uy, len, rotation, fx: -Math.sin(rad), fy: Math.cos(rad) };
}

/** Tile `unitW`-wide units centred along a→b, offset `back` cm toward the wall. */
function tile(a: Point, g: ReturnType<typeof runGeometry>, unitW: number, back: number): RunUnit[] {
  // Hard cap: a mis-tap (e.g. a 3D ground hit near the horizon, hundreds of
  // metres out) must never explode into thousands of cabinets.
  const n = Math.min(60, Math.max(1, Math.round(g.len / unitW)));
  const used = n * unitW;
  const start = (g.len - used) / 2;
  const units: RunUnit[] = [];
  for (let i = 0; i < n; i++) {
    const at = start + (i + 0.5) * unitW;
    units.push({
      position: { x: a.x + g.ux * at - g.fx * back, y: a.y + g.uy * at - g.fy * back },
      rotation: g.rotation,
    });
  }
  return units;
}

/** Base cabinets tiled along the run, backs to the wall, fronts to the room. */
export function kitchenRunUnits(a: Point, b: Point, rooms: RoomLike[], walls: WallLike[]): RunUnit[] {
  return tile(a, runGeometry(a, b, rooms, walls), RUN_UNIT.width, 0);
}

// ---- where two runs meet ------------------------------------------------------

interface UnitLike {
  id: string; type: string; position: Point; rotation: number; width: number; depth: number;
}

/** A corner unit that would join two runs into an L. */
export interface CornerSpot {
  position: Point;
  rotation: number;
  mirrored: boolean;
  /** Base units standing where the corner unit goes, to be replaced by it. */
  remove: string[];
  /** Runs that stop short of the corner, slid along their wall to meet it. */
  shift: { ids: string[]; dx: number; dy: number }[];
}

const CORNER_TYPE = 'kitchen_corner_cabinet';
/** How big a gap (or overlap) at the corner still reads as "these two runs
 *  meet here", cm from the corner unit's arm end. */
const CORNER_REACH = 120;

const isRunUnit = (type: string) => {
  const u = KITCHEN_UNIT_BY_TYPE[type];
  return !!u && u.family === 'base' && u.kind !== 'island' && u.kind !== 'corner';
};

/**
 * After a run is drawn, find where it meets an existing run at a right angle,
 * and where an L-shaped corner unit would join them. `fresh` are the ids of the
 * units just placed. Null when the runs do not meet, the corner is already
 * filled, or the units are not quarter turns of each other.
 */
export function findKitchenCorner(furniture: UnitLike[], fresh: Set<string>): CornerSpot | null {
  const entry = CATALOG_BY_TYPE[CORNER_TYPE];
  if (!entry) return null;
  const size = entry.width; // the corner unit is square
  const half = size / 2;
  const runs = furniture.filter((f) => isRunUnit(f.type));
  const frame = (r: number) => {
    const rad = (r * Math.PI) / 180;
    return { u: { x: Math.cos(rad), y: Math.sin(rad) }, f: { x: -Math.sin(rad), y: Math.cos(rad) } };
  };
  const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;
  type Frame = ReturnType<typeof frame>;
  let best: { score: number; spot: CornerSpot; a: UnitLike; b: UnitLike; A: Frame; B: Frame; C: Point } | null = null;

  for (const a of runs) {
    if (!fresh.has(a.id)) continue;
    for (const b of runs) {
      if (fresh.has(b.id)) continue;
      const turn = (((a.rotation - b.rotation) % 360) + 360) % 180;
      if (Math.abs(turn - 90) > 1) continue;
      const A = frame(a.rotation);
      const B = frame(b.rotation);
      // The walls the two runs back onto meet at C.
      const kA = dot(a.position, A.f) - a.depth / 2;
      const kB = dot(b.position, B.f) - b.depth / 2;
      const C = { x: kA * A.f.x + kB * B.f.x, y: kA * A.f.y + kB * B.f.y };
      // Each run has to lead away from the corner into the room, along the
      // other run's facing, and end close to it.
      const alongA = dot({ x: a.position.x - C.x, y: a.position.y - C.y }, B.f);
      const alongB = dot({ x: b.position.x - C.x, y: b.position.y - C.y }, A.f);
      if (alongA <= 0 || alongB <= 0) continue;
      const gapA = alongA - a.width / 2 - size;
      const gapB = alongB - b.width / 2 - size;
      if (gapA > CORNER_REACH || gapB > CORNER_REACH) continue;
      const score = Math.abs(gapA) + Math.abs(gapB);
      if (best && best.score <= score) continue;
      const position = { x: C.x + half * (A.f.x + B.f.x), y: C.y + half * (A.f.y + B.f.y) };
      best = {
        score, a, b, A, B, C,
        spot: { position, rotation: a.rotation, mirrored: dot(B.f, A.u) < 0, remove: [], shift: [] },
      };
    }
  }
  if (!best) return null;
  const hit = best;

  // What already stands in the corner square: run units are replaced, and a
  // corner unit there means the job is done.
  const spot = hit.spot;
  const F = frame(spot.rotation);
  for (const f of furniture) {
    const base = isRunUnit(f.type);
    if (!base && f.type !== CORNER_TYPE) continue;
    const d = { x: f.position.x - spot.position.x, y: f.position.y - spot.position.y };
    const lx = dot(d, F.u);
    const ly = dot(d, F.f);
    const quarter = Math.abs(Math.round((f.rotation - spot.rotation) / 90)) % 2 === 1;
    const hx = (quarter ? f.depth : f.width) / 2;
    const hy = (quarter ? f.width : f.depth) / 2;
    const ox = Math.min(lx + hx, half) - Math.max(lx - hx, -half);
    const oy = Math.min(ly + hy, half) - Math.max(ly - hy, -half);
    if (ox <= 10 || oy <= 10) continue;
    if (!base) return null;
    spot.remove.push(f.id);
  }

  // Close the gap between each arm of the L and the run along it: slide the
  // run (its base units and the wall cabinets over them) up to the arm's end.
  const gone = new Set(spot.remove);
  for (const [unit, toward] of [[hit.a, hit.B.f], [hit.b, hit.A.f]] as const) {
    const back = dot(unit.position, frame(unit.rotation).f) - unit.depth / 2;
    const fu = frame(unit.rotation).f;
    const along = (p: Point) => dot({ x: p.x - hit.C.x, y: p.y - hit.C.y }, toward);
    const sameLine = (f: UnitLike, depth = f.depth) =>
      Math.abs((((f.rotation - unit.rotation) % 360) + 360) % 360) < 1 &&
      Math.abs(dot(f.position, fu) - depth / 2 - back) < 2;
    // The run: base units on this line, in order from the corner, contiguous.
    const line = furniture
      .filter((f) => isRunUnit(f.type) && !gone.has(f.id) && sameLine(f))
      .sort((p, q) => along(p.position) - along(q.position));
    if (!line.length) continue;
    const gap = along(line[0].position) - line[0].width / 2 - size;
    if (gap <= 0.5 || gap > CORNER_REACH) continue;
    const chain = [line[0]];
    for (let i = 1; i < line.length; i++) {
      const prev = chain[chain.length - 1];
      const prevEnd = along(prev.position) + prev.width / 2;
      if (along(line[i].position) - line[i].width / 2 - prevEnd > 2) break;
      chain.push(line[i]);
    }
    const lo = along(chain[0].position) - chain[0].width / 2;
    const hi = along(chain[chain.length - 1].position) + chain[chain.length - 1].width / 2;
    const ids = chain.map((f) => f.id);
    // Wall cabinets over the run share its back line and its stretch of wall.
    for (const f of furniture) {
      if (KITCHEN_UNIT_BY_TYPE[f.type]?.family !== 'wall' || !sameLine(f)) continue;
      const c = along(f.position);
      if (c > lo - 1 && c < hi + 1) ids.push(f.id);
    }
    spot.shift.push({ ids, dx: -toward.x * gap, dy: -toward.y * gap });
  }
  return spot;
}

/** Wall cabinets tiled along the same run, set back so their backs align with
 *  the (deeper) base cabinets. They mount above the floor via their catalog
 *  `mountY`, so only x/z + facing come from here. */
export function kitchenUpperUnits(a: Point, b: Point, rooms: RoomLike[], walls: WallLike[]): RunUnit[] {
  const g = runGeometry(a, b, rooms, walls);
  return tile(a, g, UPPER.width, (RUN_UNIT.depth - UPPER.depth) / 2);
}
