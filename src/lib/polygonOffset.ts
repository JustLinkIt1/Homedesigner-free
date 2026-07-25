import { polygonArea, pointToSegment } from './geometry';
import type { Point } from '../types';

/**
 * Outward polygon offset, for roof eaves.
 *
 * The building outline we get from `detectBuildingOutline` runs along wall
 * CENTRELINES, so a roof has to push it out by half the wall thickness plus the
 * eave overhang. There is no offset/union library in this project and adding one
 * (clipper, polygon-clipping) would cost 40-90 KB gzipped in a shipping APK for
 * this single feature, so this is a small purpose-built implementation: offset
 * each edge along its outward normal and intersect consecutive offset lines.
 *
 * It is deliberately conservative. Every result is validated, and anything
 * degenerate falls back to the input polygon — a roof flush with the walls looks
 * far better than a roof with a spike through it.
 */

/** Intersection of two infinite lines given point + direction. */
function lineIntersect(p1: Point, d1: Point, p2: Point, d2: Point): Point | null {
  const denom = d1.x * d2.y - d1.y * d2.x;
  if (Math.abs(denom) < 1e-9) return null; // parallel
  const t = ((p2.x - p1.x) * d2.y - (p2.y - p1.y) * d2.x) / denom;
  return { x: p1.x + d1.x * t, y: p1.y + d1.y * t };
}

/** Drop duplicate and collinear vertices; force counter-clockwise winding. */
function clean(poly: Point[]): Point[] {
  const pts: Point[] = [];
  for (const p of poly) {
    const last = pts[pts.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 0.5) pts.push({ x: p.x, y: p.y });
  }
  if (pts.length > 1) {
    const a = pts[0];
    const b = pts[pts.length - 1];
    if (Math.hypot(a.x - b.x, a.y - b.y) <= 0.5) pts.pop();
  }
  if (pts.length < 3) return pts;

  const out: Point[] = [];
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[(i - 1 + pts.length) % pts.length];
    const cur = pts[i];
    const next = pts[(i + 1) % pts.length];
    const ux = cur.x - prev.x;
    const uy = cur.y - prev.y;
    const vx = next.x - cur.x;
    const vy = next.y - cur.y;
    const lu = Math.hypot(ux, uy);
    const lv = Math.hypot(vx, vy);
    if (lu < 1e-6 || lv < 1e-6) continue;
    if (Math.abs(ux * vy - uy * vx) > 1e-6 * lu * lv) out.push(cur); // not collinear
  }
  if (out.length < 3) return pts;
  if (polygonArea(out) < 0) out.reverse();
  return out;
}

/**
 * The largest offset this polygon can take before a narrow notch collapses on
 * itself. Measured as the closest approach between a vertex and a non-adjacent
 * edge. n is small (a house outline), so O(n²) is fine.
 */
function maxSafeOffset(poly: Point[]): number {
  let min = Infinity;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (j === i || (j + 1) % n === i) continue; // skip edges touching the vertex
      const d = pointToSegment(poly[i], poly[j], poly[(j + 1) % n]).dist;
      if (d < min) min = d;
    }
  }
  return min === Infinity ? Infinity : min * 0.45;
}

/**
 * Offset `poly` outward by `d` cm. Returns the input unchanged if the result
 * would be degenerate. Assumes/produces counter-clockwise winding.
 */
export function offsetPolygon(poly: Point[], d: number, miterLimit = 3): Point[] {
  const src = clean(poly);
  if (src.length < 3 || d <= 0) return src;

  // Clamp so a notch narrower than 2d can't invert.
  const dist = Math.min(d, maxSafeOffset(src));
  if (!(dist > 0)) return src;

  const n = src.length;
  const dir: Point[] = [];
  const nrm: Point[] = [];
  for (let i = 0; i < n; i++) {
    const a = src[i];
    const b = src[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const u = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    dir.push(u);
    // For CCW winding the outward normal is (uy, -ux).
    nrm.push({ x: u.y, y: -u.x });
  }

  const out: Point[] = [];
  for (let j = 0; j < n; j++) {
    const iPrev = (j - 1 + n) % n;
    const corner = src[j];
    const aPrev = { x: src[iPrev].x + nrm[iPrev].x * dist, y: src[iPrev].y + nrm[iPrev].y * dist };
    const aCur = { x: corner.x + nrm[j].x * dist, y: corner.y + nrm[j].y * dist };
    const hit = lineIntersect(aPrev, dir[iPrev], aCur, dir[j]);
    if (!hit) {
      out.push(aCur);
      continue;
    }
    // Acute convex corners spike; bevel instead of mitering past the limit. A
    // bevelled eave is visually indistinguishable from a mitre at this scale.
    if (Math.hypot(hit.x - corner.x, hit.y - corner.y) > dist * miterLimit) {
      out.push({ x: corner.x + nrm[iPrev].x * dist, y: corner.y + nrm[iPrev].y * dist });
      out.push(aCur);
    } else {
      out.push(hit);
    }
  }

  // Validate: an outward offset must be finite, still a polygon, and strictly
  // larger — but not wildly so.
  if (out.length < 3) return src;
  if (out.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return src;
  const a0 = Math.abs(polygonArea(src));
  const a1 = Math.abs(polygonArea(out));
  if (a1 < a0 || a1 > a0 * 4) return src;
  return out;
}

/** Oriented bounding box of a polygon, via rotating calipers over its edges. */
export function orientedBox(poly: Point[]): {
  theta: number;
  center: Point;
  halfA: number; // half-extent along theta
  halfB: number; // half-extent across theta
} {
  const pts = clean(poly);
  const fallback = { theta: 0, center: { x: 0, y: 0 }, halfA: 0, halfB: 0 };
  if (pts.length < 3) return fallback;

  let best = { area: Infinity, theta: 0, cx: 0, cy: 0, halfA: 0, halfB: 0 };
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const theta = Math.atan2(b.y - a.y, b.x - a.x);
    const c = Math.cos(-theta);
    const s = Math.sin(-theta);
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const p of pts) {
      const u = p.x * c - p.y * s;
      const v = p.x * s + p.y * c;
      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }
    const area = (maxU - minU) * (maxV - minV);
    if (area < best.area) {
      // Un-rotate the box centre back into plan space.
      const mu = (minU + maxU) / 2;
      const mv = (minV + maxV) / 2;
      best = {
        area,
        theta,
        cx: mu * Math.cos(theta) - mv * Math.sin(theta),
        cy: mu * Math.sin(theta) + mv * Math.cos(theta),
        halfA: (maxU - minU) / 2,
        halfB: (maxV - minV) / 2,
      };
    }
  }
  return {
    theta: best.theta,
    center: { x: best.cx, y: best.cy },
    halfA: best.halfA,
    halfB: best.halfB,
  };
}

/** How rectangular a footprint is (1 = perfectly rectangular). */
export function boxFillRatio(poly: Point[]): number {
  const box = orientedBox(poly);
  const boxArea = box.halfA * box.halfB * 4;
  if (boxArea <= 0) return 0;
  return Math.abs(polygonArea(poly)) / boxArea;
}
