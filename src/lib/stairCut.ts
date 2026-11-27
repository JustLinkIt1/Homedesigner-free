// Where a stair (and its handrail) has to stop: the one rule the 3D view and
// the IFC export share, so both cut a stair at the same height.
//
// A stair belongs to the storey it stands on (the lower one). The storey
// directly above cuts a stairwell hole for it in its slab and floor, but only
// in a room that holds the stair's whole footprint: a THREE.Shape hole must sit
// wholly inside its room, so stairs that cross a room boundary above stay
// solid (`stairHoleCut`). Nothing ever cuts the roof.
//
// API for the 3D clip (design manager):
//   const capY = stairCapY(stair, {
//     walls: geom.walls,                 // this storey's walls (cm)
//     roof,                              // FloorContent's `roof` prop (set only on the roof-carrying storey)
//     riseTo,                            // FloorContent's `riseTo` (cm to the storey above), if any
//     roomsAbove: above-storey rooms,    // floorGeom[next storey].rooms, if there is a storey above
//   });
//   capY is in METRES above the storey's own floor (the same frame as eaveY in
//   DesignScene's FloorContent, i.e. local to the <group name="storey">).
//   undefined = draw the stair whole. Otherwise clip treads, posts and rails
//   with a THREE.Plane(new Vector3(0, -1, 0), capY) in storey-local space
//   (add the storey's elevation × M if the plane is set in world space).
//
// The storey above is the next one up by elevation among ALL floors (the same
// order DesignScene's `stairsBelowByFloor` uses), not just the visible ones.
import { pointInPolygon } from './geometry';
import { roofEaveHeight } from './ceilings';
import { stairOpeningPoints } from './walkNavigation';
import type { FurnitureItem, Point, Roof, Room, Wall } from '../types';

/** Structural slab thickness between storeys (m). DesignScene draws the slab
 *  of the storey above from its floor down by this much. */
export const SLAB_T = 0.22;

const M = 0.01;

/** Does `room` get a stairwell hole cut for this stair (the stair standing on
 *  the storey below)? True when the stair's whole rotated footprint lies
 *  inside the room polygon. Stairs that cross room boundaries remain solid
 *  until a clipped-opening model exists. */
export function stairHoleCut(stair: FurnitureItem, room: Pick<Room, 'points'>): boolean {
  return stairOpeningPoints(stair).every((point) => pointInPolygon(point, room.points));
}

/** Was a stairwell hole cut for this stair anywhere on the storey above? */
export function stairHoleCutAbove(stair: FurnitureItem, roomsAbove: Pick<Room, 'points'>[]): boolean {
  return roomsAbove.some((room) => stairHoleCut(stair, room));
}

/** Does the stair's footprint touch any of these rooms at all? */
function overlapsAny(stair: FurnitureItem, rooms: Pick<Room, 'points'>[]): boolean {
  const fp = stairOpeningPoints(stair);
  const segHit = (a: Point, b: Point, c: Point, d: Point) => {
    const cr = (p: Point, q: Point, r: Point) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    return cr(a, b, c) * cr(a, b, d) < 0 && cr(c, d, a) * cr(c, d, b) < 0;
  };
  return rooms.some((room) => {
    if (fp.some((p) => pointInPolygon(p, room.points))) return true;
    if (room.points.some((p) => pointInPolygon(p, fp))) return true;
    for (let i = 0; i < fp.length; i++) {
      for (let j = 0; j < room.points.length; j++) {
        if (segHit(fp[i], fp[(i + 1) % fp.length], room.points[j], room.points[(j + 1) % room.points.length])) return true;
      }
    }
    return false;
  });
}

export interface StairCapContext {
  /** Walls of the storey the stair stands on (cm). */
  walls: Wall[];
  /** The roof this storey carries (only the roof-carrying storey has one). */
  roof?: Roof | null;
  /** Height (cm) from this storey's floor to the next storey's, if any. */
  riseTo?: number;
  /** Rooms of the storey directly above, if there is one. */
  roomsAbove?: Pick<Room, 'points'>[];
}

/**
 * Height (m above the storey's floor) at which a stair and its rail must be
 * cut, or undefined for no cut.
 *  - A storey above exists and cut a hole for the stair: undefined.
 *  - A storey above exists, no hole, and its rooms cover part of the stair:
 *    the underside of that storey's slab, riseTo − SLAB_T.
 *  - Otherwise, the storey carries a roof: the roof eave (roofEaveHeight).
 *  - Otherwise (open top, nothing above): undefined.
 */
export function stairCapY(stair: FurnitureItem, ctx: StairCapContext): number | undefined {
  const above = ctx.roomsAbove;
  if (above && above.length && ctx.riseTo != null) {
    if (stairHoleCutAbove(stair, above)) return undefined;
    if (overlapsAny(stair, above)) return ctx.riseTo * M - SLAB_T;
  }
  if (ctx.roof) return roofEaveHeight(ctx.walls) * M;
  return undefined;
}
