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
  const segs = splitWalls(walls, mergeTol);

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

/** A representative interior point for matching a detected polygon to an existing room. */
export function roomMatches(poly: Point[], existing: Point[]): boolean {
  const c = polygonCentroid(poly);
  return pointInPolygon(c, existing) || pointInPolygon(polygonCentroid(existing), poly);
}
