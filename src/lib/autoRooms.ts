// The floors found inside closed walls ("auto" rooms), kept in step with the
// walls. Pure plan data, so tests/geometry.mjs can run it in plain Node.
import type { Point, Room, Wall } from '../types';
import { uid } from './geometry';
import { detectRooms, roomMatches } from './roomDetection';
import { structuralWalls } from './fence';

const AUTO_FLOORS = ['oak', 'carpet_grey', 'tile_white', 'walnut', 'tile_grey', 'concrete'];

function area(pts: Point[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

/**
 * Bring the automatic rooms up to date with the walls, without losing what the
 * user did to them.
 *
 * This used to throw every automatic room away and detect them afresh each
 * time a wall was drawn. That reset any floor the user had picked, and any
 * area the fresh pass missed simply lost its floor, leaving the lawn showing
 * through the house. Now a detected area that matches an existing room keeps
 * that room (its id, name, floor and colour) and only takes the new outline;
 * one split in two passes its floor to both halves; and a room no longer found
 * stays where it is rather than vanish. Rooms the user drew are never touched.
 * Fences never close a room.
 */
export function syncAutoRooms(rooms: Room[], walls: Wall[]): { rooms: Room[]; added: number } {
  const polys = detectRooms(structuralWalls(walls));
  const manual = rooms.filter((r) => !r.auto);
  const old = rooms.filter((r) => r.auto);
  const used = new Set<string>();
  const next: Room[] = [...manual];
  let added = 0;
  for (const poly of polys) {
    if (manual.some((r) => roomMatches(poly, r.points))) continue;
    const size = area(poly);
    // The closest in size of the rooms this area overlaps: a stray room that
    // covered a whole wing must not take over one of the rooms inside it.
    const match = old
      .filter((r) => roomMatches(poly, r.points))
      .sort((p, q) => Math.abs(area(p.points) - size) - Math.abs(area(q.points) - size))[0];
    if (match && !used.has(match.id)) {
      used.add(match.id);
      next.push({ ...match, points: poly });
    } else if (match) {
      next.push({ ...match, id: uid(), name: `Room ${next.length + 1}`, points: poly });
    } else {
      next.push({
        id: uid(),
        name: `Room ${next.length + 1}`,
        points: poly,
        floorMaterial: AUTO_FLOORS[added++ % AUTO_FLOORS.length],
        color: '#f3ede2',
        auto: true,
      });
    }
  }
  // Rooms nothing matched any more keep their floor, unless one now covers them.
  const fresh = [...next];
  for (const r of old) {
    if (used.has(r.id) || fresh.some((n) => roomMatches(r.points, n.points))) continue;
    next.push(r);
  }
  return { rooms: next, added };
}
