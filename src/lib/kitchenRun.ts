// Shared geometry for the kitchen-run tool: given a drawn segment a→b, tile
// single base-cabinet units end-to-end along it, each oriented so its back sits
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

export function kitchenRunUnits(a: Point, b: Point, rooms: RoomLike[], walls: WallLike[]): RunUnit[] {
  const wUnit = RUN_UNIT.width;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  const n = Math.max(1, Math.round(len / wUnit));
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

  const used = n * wUnit;
  const start = (len - used) / 2; // centre the units within the drawn span
  const units: RunUnit[] = [];
  for (let i = 0; i < n; i++) {
    const at = start + (i + 0.5) * wUnit;
    units.push({ position: { x: a.x + ux * at, y: a.y + uy * at }, rotation });
  }
  return units;
}
