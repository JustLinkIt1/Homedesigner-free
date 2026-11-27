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
  return stairHoleRooms(stair, roomsAbove).length > 0;
}

/** The rooms of the storey above that get this stair's hole: every room that
 *  holds the whole footprint (`stairHoleCut`), in the given order. This is the
 *  one hole rule; DesignScene's roomShape applies it room by room and the IFC
 *  export voids exactly these rooms' slab blocks (1.22.52). */
export function stairHoleRooms<R extends Pick<Room, 'points'>>(stair: FurnitureItem, roomsAbove: R[]): R[] {
  return roomsAbove.filter((room) => stairHoleCut(stair, room));
}

/** Area (cm²) of `poly` inside the convex polygon `clip` (Sutherland-Hodgman;
 *  the clipped ring may have degenerate edges but its area is exact). */
function areaInsideConvex(poly: Point[], clip: Point[]): number {
  const signed = (r: Point[]) => r.reduce((a, p, i) => { const q = r[(i + 1) % r.length]; return a + p.x * q.y - q.x * p.y; }, 0) / 2;
  const dir = Math.sign(signed(clip)) || 1;
  let ring = poly;
  for (let i = 0; i < clip.length && ring.length; i++) {
    const a = clip[i];
    const b = clip[(i + 1) % clip.length];
    const side = (p: Point) => dir * ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x));
    const next: Point[] = [];
    for (let j = 0; j < ring.length; j++) {
      const p = ring[j];
      const q = ring[(j + 1) % ring.length];
      const sp = side(p);
      const sq = side(q);
      if (sp >= 0) next.push(p);
      if ((sp >= 0) !== (sq >= 0)) {
        const t = sp / (sp - sq);
        next.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
      }
    }
    ring = next;
  }
  return ring.length >= 3 ? Math.abs(signed(ring)) : 0;
}

/** Rooms above that the stair's hole must NOT cut although the footprint
 *  reaches into them: when a hole is cut (some room holds the stair whole),
 *  every other room whose area overlaps the footprint by more than 1 cm². Only
 *  overlapping room outlines can produce one (a footprint wholly inside one
 *  room cannot reach into a room that does not overlap it), so for drawings
 *  without overlapping rooms this is always empty. */
export function stairHoleSpillRooms<R extends Pick<Room, 'points'>>(stair: FurnitureItem, roomsAbove: R[]): R[] {
  const cut = stairHoleRooms(stair, roomsAbove);
  if (!cut.length) return [];
  const fp = stairOpeningPoints(stair);
  return roomsAbove.filter((room) => !cut.includes(room) && room.points.length >= 3 && areaInsideConvex(room.points, fp) > 1);
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
