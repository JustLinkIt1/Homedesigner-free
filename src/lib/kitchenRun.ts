// Shared geometry for the kitchen-run tool: given a drawn segment a→b, tile
// single cabinet units end-to-end along it, each oriented so its back sits
// against the wall and its front faces the room. Used by BOTH the store action
// that commits the run and the live ghost preview, so they can never drift.
import { CATALOG_BY_TYPE } from '../data/furnitureCatalog';
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

/** Wall cabinets tiled along the same run, set back so their backs align with
 *  the (deeper) base cabinets. They mount above the floor via their catalog
 *  `mountY`, so only x/z + facing come from here. */
export function kitchenUpperUnits(a: Point, b: Point, rooms: RoomLike[], walls: WallLike[]): RunUnit[] {
  const g = runGeometry(a, b, rooms, walls);
  return tile(a, g, UPPER.width, (RUN_UNIT.depth - UPPER.depth) / 2);
}
