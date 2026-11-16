import type { Point, Wall } from '../types';
import { polygonArea, polygonCentroid, pointInPolygon, pointToSegment } from './geometry';

interface Seg {
  a: Point;
  b: Point;
}

/** Proper intersection point of two segments, or null. Includes T-touches. */
function segIntersect(p1: Point, p2: Point, p3: Point, p4: Point): Point | null {
  const d1x = p2.x - p1.x;
  const d1y = p2.y - p1.y;
  const d2x = p4.x - p3.x;
  const d2y = p4.y - p3.y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-9) return null; // parallel / collinear
  const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / denom;
  const u = ((p3.x - p1.x) * d1y - (p3.y - p1.y) * d1x) / denom;
  const eps = 1e-6;
  if (t < -eps || t > 1 + eps || u < -eps || u > 1 + eps) return null;
  return { x: p1.x + t * d1x, y: p1.y + t * d1y };
}

/**
 * Split walls at every junction (shared endpoints, T-touches, and X-crossings)
 * so the result is a clean planar graph. Without this, a wall that meets
 * another mid-span would leave the rooms unenclosed.
 */
function splitWalls(walls: Wall[], tol: number): Seg[] {
  const segs: Seg[] = walls.map((w) => ({ a: w.start, b: w.end }));
  const pts: Point[] = [];
  const addPt = (p: Point) => {
    if (!pts.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < tol)) pts.push(p);
  };
  for (const s of segs) {
    addPt(s.a);
    addPt(s.b);
  }
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const ip = segIntersect(segs[i].a, segs[i].b, segs[j].a, segs[j].b);
      if (ip) addPt(ip);
    }
  }

  const out: Seg[] = [];
  for (const s of segs) {
    const len = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) || 1;
    const on = pts
      .map((p) => ({ p, r: pointToSegment(p, s.a, s.b) }))
      .filter((x) => x.r.dist < tol)
      .map((x) => ({ p: x.r.closest, t: x.r.t }))
      .sort((u, v) => u.t - v.t);
    for (let k = 0; k < on.length - 1; k++) {
      const a = on[k].p;
      const b = on[k + 1].p;
      if (Math.hypot(b.x - a.x, b.y - a.y) > Math.min(tol * 2, len * 0.02)) out.push({ a, b });
    }
  }
  return out;
}

/** How far (cm, to the other wall's centre line) a wall end may stop short of
 *  another wall and still be treated as meeting it. */
export const GAP_REACH = 30;

export interface LooseEnd {
  wallId: string;
  end: 'start' | 'end';
  /** Where the end is now. */
  point: Point;
  /** Where it would meet the wall it stops short of. */
  target: Point;
  /** Whether the gap shows in the plan (the end is clear of the other wall's body). */
  visible: boolean;
}

/**
 * Wall ends that stop just short of another wall: more than `mergeTol` from
 * every other wall (so the wall graph would not join them) but within
 * `GAP_REACH`. Such a gap is easy to leave when dragging a wall and hard to
 * see, yet it leaves a room unenclosed. The target is where the wall would
 * hit the other one if it carried straight on, else the nearest point on it.
 */
export function looseWallEnds(walls: Wall[], mergeTol = 12): LooseEnd[] {
  const out: LooseEnd[] = [];
  for (const w of walls) {
    for (const end of ['start', 'end'] as const) {
      const p = w[end];
      const q = end === 'start' ? w.end : w.start;
      let best: { dist: number; closest: Point; wall: Wall } | null = null;
      for (const o of walls) {
        if (o === w) continue;
        const r = pointToSegment(p, o.start, o.end);
        if (!best || r.dist < best.dist) best = { dist: r.dist, closest: r.closest, wall: o };
      }
      if (!best || best.dist <= mergeTol || best.dist > GAP_REACH) continue;
      // Carry the wall straight on to whatever it meets first within reach.
      const len = Math.hypot(p.x - q.x, p.y - q.y);
      let target = best.closest;
      if (len > 1e-6) {
        const far = { x: p.x + ((p.x - q.x) / len) * GAP_REACH, y: p.y + ((p.y - q.y) / len) * GAP_REACH };
        let nearest = Infinity;
        for (const o of walls) {
          if (o === w) continue;
          const hit = segIntersect(p, far, o.start, o.end);
          if (!hit) continue;
          const d = Math.hypot(hit.x - p.x, hit.y - p.y);
          if (d < nearest) {
            nearest = d;
            target = hit;
          }
        }
      }
      out.push({ wallId: w.id, end, point: p, target, visible: best.dist > best.wall.thickness / 2 + 2 });
    }
  }
  return out;
}

/** The walls with every loose end (see `looseWallEnds`) carried on to the wall
 *  it stops short of. Walls that need no change are returned as they are. */
export function closeSmallGaps(walls: Wall[], mergeTol = 12): Wall[] {
  const loose = looseWallEnds(walls, mergeTol);
  if (!loose.length) return walls;
  return walls.map((w) => {
    const mine = loose.filter((l) => l.wallId === w.id);
    if (!mine.length) return w;
    const next = { ...w };
    for (const l of mine) next[l.end] = l.target;
    return next;
  });
}

/**
 * Planar faces of the wall graph, largest first. Shared by room detection (which
 * discards the outer face) and building-outline detection (which wants it).
 * `pruneLeaves` drops dead-end walls first — a spur is walked out-and-back by the
 * half-edge traversal and injects a zero-width spike into the outer face, which
 * then explodes when offset for a roof eave.
 */
function wallFaces(
  walls: Wall[],
  mergeTol: number,
  pruneLeaves: boolean,
): { poly: Point[]; area: number }[] {
  if (walls.length < 3) return [];
  // A wall that stops a few centimetres short still encloses its room.
  const segs = splitWalls(closeSmallGaps(walls, mergeTol), mergeTol);

  // Build merged nodes.
  const nodes: Point[] = [];
  const nodeOf = (p: Point): number => {
    for (let i = 0; i < nodes.length; i++) {
      if (Math.hypot(nodes[i].x - p.x, nodes[i].y - p.y) <= mergeTol) return i;
    }
    nodes.push({ x: p.x, y: p.y });
    return nodes.length - 1;
  };

  const seen = new Set<string>();
  const adj: Map<number, number[]> = new Map();
  const edges: [number, number][] = [];
  for (const s of segs) {
    const a = nodeOf(s.a);
    const b = nodeOf(s.b);
    if (a === b) continue;
    const key = a < b ? `${a}_${b}` : `${b}_${a}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push([a, b]);
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a)!.push(b);
    adj.get(b)!.push(a);
  }

  if (pruneLeaves) {
    // Iteratively remove degree-1 nodes so dangling walls can't spike the hull.
    for (;;) {
      const leaf = [...adj.entries()].find(([, n]) => n.length === 1);
      if (!leaf) break;
      const [v, [only]] = leaf;
      adj.delete(v);
      const rest = (adj.get(only) ?? []).filter((x) => x !== v);
      if (rest.length) adj.set(only, rest);
      else adj.delete(only);
    }
    // Drop edges whose endpoints no longer both exist.
    for (let i = edges.length - 1; i >= 0; i--) {
      const [a, b] = edges[i];
      if (!adj.has(a) || !adj.has(b)) edges.splice(i, 1);
    }
    if (edges.length < 3) return [];
  }

  // Sort neighbours by angle (CCW).
  const angle = (from: number, to: number) =>
    Math.atan2(nodes[to].y - nodes[from].y, nodes[to].x - nodes[from].x);
  for (const [v, nbrs] of adj) nbrs.sort((p, q) => angle(v, p) - angle(v, q));

  // Walk faces via half-edges (next = immediately clockwise neighbour).
  const visited = new Set<string>();
  const halfKey = (u: number, v: number) => `${u}>${v}`;
  const faces: number[][] = [];
  for (const [a, b] of edges) {
    for (const [u0, v0] of [[a, b], [b, a]] as [number, number][]) {
      if (visited.has(halfKey(u0, v0))) continue;
      const face: number[] = [];
      let u = u0;
      let v = v0;
      let guard = 0;
      while (guard++ < 20000) {
        visited.add(halfKey(u, v));
        face.push(u);
        const nbrs = adj.get(v)!;
        const idx = nbrs.indexOf(u);
        const next = nbrs[(idx - 1 + nbrs.length) % nbrs.length];
        u = v;
        v = next;
        if (u === u0 && v === v0) break;
      }
      if (face.length >= 3) faces.push(face);
    }
  }

  const minArea = 8000; // cm² (~0.8 m²)
  return faces
    .map((f) => f.map((i) => nodes[i]))
    .map((poly) => ({ poly, area: Math.abs(polygonArea(poly)) }))
    .filter((x) => x.area > minArea)
    .sort((a, b) => b.area - a.area);
}

/**
 * Detect enclosed rooms from a set of walls by finding the minimal cycles
 * (faces) of the wall graph via a planar half-edge traversal.
 */
export function detectRooms(walls: Wall[], mergeTol = 12): Point[][] {
  const polys = wallFaces(walls, mergeTol, false);
  if (polys.length === 0) return [];
  // The half-edge walk winds every enclosed face one way (positive area) and
  // the outside of each separate group of walls the other way. Keeping only
  // the positive ones drops every outside, not just the biggest: with a house
  // and a separate annex, the annex's outline used to come back as a "room"
  // laid over all of its real rooms.
  const inner = polys.filter((r) => polygonArea(r.poly) > 0);
  if (inner.length) return inner.map((r) => r.poly);
  // The biggest face is the outer hull only when there is more than one face.
  const rooms = polys.length > 1 ? polys.slice(1) : polys;
  return rooms.map((r) => r.poly);
}

/**
 * The building's outer perimeter (wall centrelines), or null if the walls don't
 * enclose anything. This is the face `detectRooms` throws away. Returned wound
 * counter-clockwise so "outward" is unambiguous for the roof's eave offset.
 *
 * NB a single closed loop yields TWO faces of equal magnitude (inner CCW + outer
 * CW), so `length > 1` still holds for the simplest possible building; one face
 * means an unclosed sketch and there is no meaningful outline.
 */
export function detectBuildingOutline(walls: Wall[], mergeTol = 12): Point[] | null {
  const polys = wallFaces(walls, mergeTol, true);
  if (polys.length < 2) return null;
  const poly = polys[0].poly.slice();
  if (polygonArea(poly) < 0) poly.reverse();
  return poly;
}

/**
 * A point that is really inside the polygon. The centroid of an L- or C-shaped
 * room can fall outside it (in the notch), where it would "match" whatever
 * room sits in that notch; then take the middle of the widest stretch of the
 * polygon on the horizontal line through the centroid.
 */
export function interiorPoint(poly: Point[]): Point {
  const c = polygonCentroid(poly);
  if (pointInPolygon(c, poly)) return c;
  const xs: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    if (a.y > c.y !== b.y > c.y) xs.push(a.x + ((c.y - a.y) / (b.y - a.y)) * (b.x - a.x));
  }
  xs.sort((p, q) => p - q);
  let best = c;
  let widest = 0;
  for (let i = 0; i + 1 < xs.length; i += 2) {
    if (xs[i + 1] - xs[i] > widest) {
      widest = xs[i + 1] - xs[i];
      best = { x: (xs[i] + xs[i + 1]) / 2, y: c.y };
    }
  }
  return best;
}

/** Whether a detected polygon and an existing room are the same area: an
 *  interior point of either lies inside the other. */
export function roomMatches(poly: Point[], existing: Point[]): boolean {
  return pointInPolygon(interiorPoint(poly), existing) || pointInPolygon(interiorPoint(existing), poly);
}
