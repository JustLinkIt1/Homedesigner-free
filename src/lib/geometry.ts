import type { Point, Wall } from '../types';

export const uid = (): string =>
  Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const dist = (a: Point, b: Point): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

export const lerp = (a: Point, b: Point, t: number): Point => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

export const midpoint = (a: Point, b: Point): Point => lerp(a, b, 0.5);

/** Angle of segment a->b in degrees. */
export const angleDeg = (a: Point, b: Point): number =>
  (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;

/** Snap a point to the nearest grid multiple (cm). */
export const snapToGrid = (p: Point, grid: number): Point => ({
  x: Math.round(p.x / grid) * grid,
  y: Math.round(p.y / grid) * grid,
});

/**
 * Snap an in-progress segment's end so it locks to horizontal / vertical /
 * 45° when close, which makes hand-drawn walls look clean.
 */
export const snapAngle = (start: Point, end: Point, stepDeg = 15): Point => {
  const d = dist(start, end);
  if (d < 1) return end;
  let a = Math.atan2(end.y - start.y, end.x - start.x);
  const step = (stepDeg * Math.PI) / 180;
  a = Math.round(a / step) * step;
  return { x: start.x + Math.cos(a) * d, y: start.y + Math.sin(a) * d };
};

/** Nearest existing wall endpoint within `tol` cm, for snapping joints. */
export const snapToEndpoints = (
  p: Point,
  walls: Wall[],
  tol: number,
): Point | null => {
  let best: Point | null = null;
  let bestD = tol;
  for (const w of walls) {
    for (const e of [w.start, w.end]) {
      const d = dist(p, e);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
  }
  return best;
};

/** Signed area of a polygon (cm²); positive = counter-clockwise. */
export const polygonArea = (pts: Point[]): number => {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    a += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return a / 2;
};

export const polygonCentroid = (pts: Point[]): Point => {
  let cx = 0;
  let cy = 0;
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    const cross = pts[i].x * pts[j].y - pts[j].x * pts[i].y;
    cx += (pts[i].x + pts[j].x) * cross;
    cy += (pts[i].y + pts[j].y) * cross;
    a += cross;
  }
  if (Math.abs(a) < 1e-6) {
    // Degenerate — fall back to average.
    const avg = pts.reduce((s, p) => ({ x: s.x + p.x, y: s.y + p.y }), { x: 0, y: 0 });
    return { x: avg.x / pts.length, y: avg.y / pts.length };
  }
  a *= 3;
  return { x: cx / a, y: cy / a };
};

export const pointInPolygon = (p: Point, poly: Point[]): boolean => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const intersect =
      yi > p.y !== yj > p.y &&
      p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
};

/** Distance from point p to segment a-b (cm), plus the closest point. */
export const pointToSegment = (
  p: Point,
  a: Point,
  b: Point,
): { dist: number; t: number; closest: Point } => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const closest = { x: a.x + t * dx, y: a.y + t * dy };
  return { dist: dist(p, closest), t, closest };
};

export const boundsOf = (pts: Point[]): { min: Point; max: Point } => {
  const min = { x: Infinity, y: Infinity };
  const max = { x: -Infinity, y: -Infinity };
  for (const p of pts) {
    min.x = Math.min(min.x, p.x);
    min.y = Math.min(min.y, p.y);
    max.x = Math.max(max.x, p.x);
    max.y = Math.max(max.y, p.y);
  }
  return { min, max };
};
