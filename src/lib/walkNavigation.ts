import { pointInPolygon, polygonVisualCenter } from './geometry';
import type { FurnitureItem, Opening, Point, Room, Wall } from '../types';
import { stairPlanFor, stairToPlan } from './stairs';

const M = 0.01;

export interface WalkWallSegment {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  pad: number;
}

/** Build solid collision spans, leaving actual door and passage openings clear. */
export function buildWalkWallSegments(walls: Wall[], openings: Opening[]): WalkWallSegment[] {
  const byWall = new Map<string, Opening[]>();
  for (const opening of openings) {
    if (opening.type !== 'door' || opening.sill > 1) continue;
    const list = byWall.get(opening.wallId) ?? [];
    list.push(opening);
    byWall.set(opening.wallId, list);
  }

  return walls.flatMap((wall) => {
    const dx = wall.end.x - wall.start.x;
    const dz = wall.end.y - wall.start.y;
    const length = Math.hypot(dx, dz);
    if (length < 0.01) return [];

    // Merge overlapping doorway ranges so adjacent/double openings cannot
    // leave tiny invisible collision slivers between them.
    const ranges = (byWall.get(wall.id) ?? [])
      .map((opening) => ({
        start: Math.max(0, opening.offset * length - opening.width / 2 - 2),
        end: Math.min(length, opening.offset * length + opening.width / 2 + 2),
      }))
      .filter((range) => range.end > range.start)
      .sort((a, b) => a.start - b.start)
      .reduce<Array<{ start: number; end: number }>>((merged, range) => {
        const previous = merged[merged.length - 1];
        if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
        else merged.push({ ...range });
        return merged;
      }, []);

    const solids: Array<{ start: number; end: number }> = [];
    let cursor = 0;
    for (const range of ranges) {
      if (range.start > cursor) solids.push({ start: cursor, end: range.start });
      cursor = Math.max(cursor, range.end);
    }
    if (cursor < length) solids.push({ start: cursor, end: length });

    const ux = dx / length;
    const uz = dz / length;
    return solids.map((solid) => ({
      ax: (wall.start.x + ux * solid.start) * M,
      az: (wall.start.y + uz * solid.start) * M,
      bx: (wall.start.x + ux * solid.end) * M,
      bz: (wall.start.y + uz * solid.end) * M,
      pad: (wall.thickness * M) / 2,
    }));
  });
}

/** Position relative to a rotated furniture footprint, in metres. */
export function stairLocalPosition(item: FurnitureItem, x: number, z: number) {
  const dx = x - item.position.x * M;
  const dz = z - item.position.y * M;
  const angle = (item.rotation * Math.PI) / 180;
  return {
    // Furniture3D rotates the group by -item.rotation. Apply its inverse here
    // to recover the model's local footprint coordinates.
    x: dx * Math.cos(angle) + dz * Math.sin(angle),
    z: -dx * Math.sin(angle) + dz * Math.cos(angle),
  };
}

/** Rotated plan footprint used to cut the matching stairwell into the floor above. */
export function stairOpeningPoints(item: FurnitureItem): Point[] {
  const angle = (item.rotation * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const halfWidth = item.width / 2;
  const halfDepth = item.depth / 2;
  return [
    { x: -halfWidth, y: -halfDepth },
    { x: halfWidth, y: -halfDepth },
    { x: halfWidth, y: halfDepth },
    { x: -halfWidth, y: halfDepth },
  ].map((local) => ({
    x: item.position.x + local.x * cos - local.y * sin,
    y: item.position.y + local.x * sin + local.y * cos,
  }));
}

/** Is the walker standing on (or just before) this stair's bottom or top
 *  step? Works for every stair shape: each has an entry edge, and the zone is
 *  the strip across that edge, reaching a little way onto the stair. */
export function isAtStairEnd(item: FurnitureItem, x: number, z: number, end: 'low' | 'high') {
  const local = stairLocalPosition(item, x, z);
  const plan = stairPlanFor(item);
  const edge = end === 'low' ? plan.low : plan.high;
  const rx = local.x - edge.at.x * M;
  const rz = local.z - edge.at.y * M;
  // Distance onto the stair (against `out`) and across the edge.
  const along = -(rx * edge.out.x + rz * edge.out.y);
  const across = Math.abs(rx * edge.out.y - rz * edge.out.x);
  const run = plan.post ? item.depth * M * 0.35 : item.depth * M;
  const landingDepth = Math.min(0.9, Math.max(0.55, run * 0.38));
  return across <= plan.flightWidth * M / 2 + 0.22 && along >= -0.3 && along <= landingDepth;
}

/** Landing just beyond the stair's selected end, clear of its trigger zone.
 * When destination rooms are supplied the result is guaranteed to be indoors;
 * badly oriented stairs fall back to the nearest room centre instead of
 * placing the walker outside the building. */
export function stairLanding(item: FurnitureItem, end: 'low' | 'high', rooms: Room[] = []) {
  const plan = stairPlanFor(item);
  const edge = end === 'low' ? plan.low : plan.high;
  const local = { x: edge.at.x + edge.out.x * 105, y: edge.at.y + edge.out.y * 105 };
  const world = stairToPlan(item, local);
  const ideal = { x: world.x * M, z: world.y * M };
  if (rooms.length === 0 || rooms.some((room) => pointInPolygon({ x: ideal.x / M, y: ideal.z / M }, room.points))) {
    return ideal;
  }

  const centres = rooms
    .filter((room) => room.points.length >= 3)
    .map((room) => polygonVisualCenter(room.points))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  const nearest = centres.sort((a, b) =>
    Math.hypot(a.x * M - ideal.x, a.y * M - ideal.z) - Math.hypot(b.x * M - ideal.x, b.y * M - ideal.z),
  )[0];
  return nearest ? { x: nearest.x * M, z: nearest.y * M } : ideal;
}
