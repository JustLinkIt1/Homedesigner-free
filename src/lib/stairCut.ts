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
import * as THREE from 'three';
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

// ---- Geometry cut for the path tracer (row 18b, 1.22.52) -----------------------
//
// three-gpu-pathtracer ignores material.clippingPlanes, so in a traced Photo the
// plane cut above does nothing and the rail pokes through the roof. For that
// renderer the stair's geometry itself is cut instead.
//
// How to apply it (StairMesh in Furniture3D.tsx, design manager; `stairCut`
// prop 'planes' by default, 'geometry' from PhotoMode.tsx:117):
//   * StairMesh's `clipY` is in WORLD metres (DesignScene: elevation * M +
//     stairCapY(...)). The tread/rail geometries are in the stair's LOCAL frame:
//     the Furniture3D item group sits at y = mountY inside the storey group
//     (y = elevation * M) and only rotates about Y, so
//         yLocal = clipY - (elevation * M + mountY)   // = capY - mountY
//     or, from a ref, yLocal = clipY - itemGroup.getWorldPosition(v).y.
//     (Stairs have mountY = 0 today, so yLocal = capY in practice.)
//   * With 'geometry' and clipY set: inside the useMemo, after building
//     even/odd/rail, replace each with clipGeometryBelowY(geo, yLocal) (null =
//     nothing below: skip the mesh), dispose the original only when the result
//     is a different object, and do NOT pass clippingPlanes to the materials.
//     Add yLocal to the memo deps.
//   * The spiral post: h = stairPostHeight(postH, yLocal); render it only when
//     h > 0, at position [0, h / 2, 0] with cylinder height h.
//   * With 'planes' (3D view, raster Photo) nothing changes.

/** Linear interpolation of one vertex attribute item between two source
 *  vertices; normals are re-normalised. */
function lerpItem(attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, a: number, b: number, t: number, out: number[], normalise: boolean): void {
  const n = attr.itemSize;
  const start = out.length;
  for (let k = 0; k < n; k++) {
    const va = attr.getComponent(a, k);
    out.push(t === 0 ? va : va + (attr.getComponent(b, k) - va) * t);
  }
  if (normalise && t !== 0) {
    let len = 0;
    for (let k = 0; k < n; k++) len += out[start + k] ** 2;
    len = Math.sqrt(len);
    if (len > 0) for (let k = 0; k < n; k++) out[start + k] /= len;
  }
}

/**
 * The part of `geometry` on or below the horizontal plane y = yLocal (in the
 * geometry's own local frame), for renderers that ignore clipping planes.
 *
 *  - Every vertex on or below the plane: returns `geometry` itself, untouched
 *    (so the caller must not dispose it twice).
 *  - Nothing below: returns null.
 *  - Otherwise a NEW non-indexed BufferGeometry: triangles wholly below are
 *    kept, wholly above are dropped, and crossing ones are split at the plane
 *    (1 or 2 triangles, same winding). Every attribute (position, normal, uv,
 *    colour...) is interpolated linearly along the cut edges; normals are
 *    re-normalised and cut vertices get y = yLocal exactly. No cap is added
 *    (the cut lies on the underside of a roof or slab). Groups, morph targets
 *    and drawRange are not carried over (the stair geometries have none).
 *
 * Indexed and non-indexed input both work; the input is never modified.
 */
export function clipGeometryBelowY(geometry: THREE.BufferGeometry, yLocal: number): THREE.BufferGeometry | null {
  const pos = geometry.getAttribute('position');
  if (!pos || pos.count === 0) return null;
  let maxY = -Infinity;
  for (let i = 0; i < pos.count; i++) maxY = Math.max(maxY, pos.getY(i));
  if (maxY <= yLocal) return geometry;

  const index = geometry.getIndex();
  const triCount = Math.floor((index ? index.count : pos.count) / 3);
  const vertexAt = (i: number) => (index ? index.getX(i) : i);
  const names = Object.keys(geometry.attributes);
  const attrs = names.map((name) => geometry.getAttribute(name));
  const data: number[][] = names.map(() => []);
  const posSlot = names.indexOf('position');
  const normalSlot = names.indexOf('normal');

  // A polygon corner: source vertex a, or the point a + (b - a) * t on a cut edge.
  type Corner = { a: number; b: number; t: number };
  const emit = (c: Corner) => {
    for (let s = 0; s < attrs.length; s++) {
      lerpItem(attrs[s], c.a, c.b, c.t, data[s], s === normalSlot);
      if (s === posSlot && c.t !== 0) data[s][data[s].length - 2] = yLocal;
    }
  };

  let kept = 0;
  const tri = [0, 0, 0];
  for (let f = 0; f < triCount; f++) {
    tri[0] = vertexAt(f * 3);
    tri[1] = vertexAt(f * 3 + 1);
    tri[2] = vertexAt(f * 3 + 2);
    const d = tri.map((v) => pos.getY(v) - yLocal);
    if (d[0] > 0 && d[1] > 0 && d[2] > 0) continue;
    // Sutherland-Hodgman against the one plane: a triangle gives 3 or 4 corners.
    const poly: Corner[] = [];
    for (let k = 0; k < 3; k++) {
      const j = (k + 1) % 3;
      if (d[k] <= 0) poly.push({ a: tri[k], b: tri[k], t: 0 });
      if ((d[k] <= 0) !== (d[j] <= 0)) poly.push({ a: tri[k], b: tri[j], t: d[k] / (d[k] - d[j]) });
    }
    for (let k = 1; k + 1 < poly.length; k++) {
      emit(poly[0]);
      emit(poly[k]);
      emit(poly[k + 1]);
      kept++;
    }
  }
  if (kept === 0) return null;

  const out = new THREE.BufferGeometry();
  names.forEach((name, s) => {
    const src = attrs[s];
    // getComponent already de-normalised integer attributes, so the copy is
    // plain float data.
    out.setAttribute(name, new THREE.BufferAttribute(new Float32Array(data[s]), src.itemSize, false));
  });
  return out;
}

/** Height (m) of the spiral stair's central post under a cut: the full
 *  `postH` when there is no cut (yLocal undefined), else min(postH, yLocal),
 *  never below 0 (0 = do not draw the post). yLocal is in the stair's local
 *  frame, as for clipGeometryBelowY. */
export function stairPostHeight(postH: number, yLocal?: number): number {
  if (yLocal == null) return postH;
  return Math.max(0, Math.min(postH, yLocal));
}
