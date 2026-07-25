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

/** Every (wall, side) pair that faces outdoors, as full-wall face ranges. */
export function exteriorFaces(
  walls: Wall[],
  rooms: Room[],
): { wallId: string; face: WallFaceRange }[] {
  const out: { wallId: string; face: WallFaceRange }[] = [];
  for (const wall of walls) {
    for (const side of exteriorSidesOf(wall, rooms)) {
      out.push({ wallId: wall.id, face: { start: 0, end: 1, side } });
    }
  }
  return out;
}
