import { pointInPolygon } from './geometry';
import type { Room, Wall, WallFaceRange } from '../types';

/**
 * Which side(s) of a wall face open air.
 *
 * Painting an exterior wall face already works in the app — `wallFaceAt` returns
 * a whole-wall range when no room sits on the tapped side, and the paint popover
 * writes it as a face finish. The problem is purely reach: dollhouse mode is on
 * by default and faded walls reject taps, so from outside the building the walls
 * you can actually see are exactly the ones that won't respond. This module lets
 * the UI skip the hunt and finish every outside face in one action.
 *
 * A side is "exterior" when a probe point just off that face lands inside no
 * room. Probing beyond the wall's own half-thickness keeps a wall that merely
 * touches a room boundary from being misread.
 */
const PROBE_MARGIN = 5; // cm past the wall face

export function exteriorSidesOf(wall: Wall, rooms: Room[]): (-1 | 1)[] {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return [];
  // Unit normal to the wall.
  const nx = -dy / len;
  const ny = dx / len;
  const mid = { x: (wall.start.x + wall.end.x) / 2, y: (wall.start.y + wall.end.y) / 2 };
  const off = wall.thickness / 2 + PROBE_MARGIN;

  const out: (-1 | 1)[] = [];
  for (const side of [1, -1] as const) {
    const probe = { x: mid.x + nx * off * side, y: mid.y + ny * off * side };
    const inside = rooms.some((r) => r.points.length >= 3 && pointInPolygon(probe, r.points));
    if (!inside) out.push(side);
  }
  return out;
}

/** Indoor rooms only: a patio or deck against a wall is still outdoors. */
const indoor = (rooms: Room[]): Room[] => rooms.filter((r) => !r.outdoor && r.points.length >= 3);

/**
 * The stretches of one side of a wall that face open air, as 0..1 fractions
 * along it (start to end), merged and in order.
 *
 * One long wall is often outdoors for only part of its length: where a wing
 * steps back, or where an upper storey's outline differs from the rooms either
 * side. Testing the midpoint alone called such a wall indoor and left the
 * exposed part unclad. Rooms end at their corners, so the wall is cut at every
 * room corner that lies on it and each piece is tested on its own.
 */
export function exteriorRanges(wall: Wall, rooms: Room[], side: 1 | -1): [number, number][] {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return [];
  const ux = dx / len, uy = dy / len;
  const nx = -uy, ny = ux;
  const inside = indoor(rooms);
  const reach = wall.thickness / 2 + PROBE_MARGIN + 1;
  const cuts = [0, 1];
  for (const room of inside) {
    for (const p of room.points) {
      const along = (p.x - wall.start.x) * ux + (p.y - wall.start.y) * uy;
      const across = Math.abs((p.x - wall.start.x) * nx + (p.y - wall.start.y) * ny);
      if (across <= reach && along > 1 && along < len - 1) cuts.push(along / len);
    }
  }
  cuts.sort((a, b) => a - b);
  const off = (wall.thickness / 2 + PROBE_MARGIN) * side;
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < cuts.length; i++) {
    const from = cuts[i], to = cuts[i + 1];
    if ((to - from) * len < 1) continue;
    const mid = ((from + to) / 2) * len;
    const probe = { x: wall.start.x + ux * mid + nx * off, y: wall.start.y + uy * mid + ny * off };
    if (inside.some((r) => pointInPolygon(probe, r.points))) continue;
    const last = out[out.length - 1];
    if (last && from - last[1] < 1e-6) last[1] = to;
    else out.push([from, to]);
  }
  return out;
}

/** The outdoor side of a wall at one point along it, or null when neither or both sides are. */
export function exteriorSideAt(wall: Wall, rooms: Room[], at: number): 1 | -1 | null {
  const open = ([1, -1] as const).filter((side) =>
    exteriorRanges(wall, rooms, side).some(([from, to]) => at >= from - 1e-6 && at <= to + 1e-6));
  return open.length === 1 ? open[0] : null;
}

/** Every stretch of wall face that is outdoors, as face ranges. */
export function exteriorFaces(
  walls: Wall[],
  rooms: Room[],
): { wallId: string; face: WallFaceRange }[] {
  const out: { wallId: string; face: WallFaceRange }[] = [];
  for (const wall of walls) {
    for (const side of [1, -1] as const) {
      for (const [start, end] of exteriorRanges(wall, rooms, side)) {
        out.push({ wallId: wall.id, face: { start, end, side } });
      }
    }
  }
  return out;
}
