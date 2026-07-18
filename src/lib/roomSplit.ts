// Split a room polygon along a newly drawn wall, so flooring stays bounded by
// the walls the user sees (tester report: drawing a wall through a room left
// the old floor spilling across it — the polygon still spanned the old
// outline). Pure geometry; the store decides what to do with the halves.
import { midpoint, pointInPolygon, pointToSegment, polygonArea } from './geometry';
import type { Point } from '../types';

/** How close (cm) a wall endpoint must be to the room outline to count as
 *  landing on it. Wall endpoints snap to existing walls, whose centrelines are
 *  what room outlines follow, so a generous-but-not-sloppy tolerance works. */
const EDGE_TOL = 25;
/** Ignore slivers smaller than this (cm² — 0.5 m²). */
const MIN_AREA = 5000;

interface Attach {
  edge: number; // polygon edge index (edge i runs points[i] -> points[i+1])
  t: number;
  point: Point;
}

function attach(p: Point, pts: Point[]): Attach | null {
  let best: Attach | null = null;
  let bestDist = EDGE_TOL;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const hit = pointToSegment(p, a, b);
    if (hit.dist < bestDist) {
      bestDist = hit.dist;
      best = { edge: i, t: hit.t, point: hit.closest };
    }
  }
  return best;
}

/** Walk the outline from the cut at `from` forward to the cut at `to`,
 *  collecting the vertices in between (exclusive of the cut points). */
function walk(pts: Point[], from: Attach, to: Attach): Point[] {
  const out: Point[] = [];
  let i = (from.edge + 1) % pts.length;
  // The `to` cut lies on edge `to.edge`, i.e. after vertex to.edge — stop once
  // we have consumed that vertex.
  for (let guard = 0; guard <= pts.length; guard++) {
    out.push(pts[i]);
    if (i === to.edge) break;
    i = (i + 1) % pts.length;
  }
  return out;
}

/**
 * If the segment a→b cuts across the polygon (both endpoints on the outline,
 * midpoint inside), returns the two halves, larger first. Otherwise null.
 */
export function splitPolygonBySegment(pts: Point[], a: Point, b: Point): [Point[], Point[]] | null {
  if (pts.length < 3) return null;
  const A = attach(a, pts);
  const B = attach(b, pts);
  if (!A || !B) return null;
  if (A.edge === B.edge) return null; // runs along a single edge — no cut
  if (!pointInPolygon(midpoint(a, b), pts)) return null;

  const half1 = [A.point, ...walk(pts, A, B), B.point];
  const half2 = [B.point, ...walk(pts, B, A), A.point];
  const area1 = Math.abs(polygonArea(half1));
  const area2 = Math.abs(polygonArea(half2));
  if (area1 < MIN_AREA || area2 < MIN_AREA) return null;
  // Sanity: the halves should roughly re-compose the whole.
  const whole = Math.abs(polygonArea(pts));
  if (area1 + area2 > whole * 1.15 || area1 + area2 < whole * 0.85) return null;
  return area1 >= area2 ? [half1, half2] : [half2, half1];
}
