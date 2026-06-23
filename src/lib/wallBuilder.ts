import type { Point, Wall } from '../types';
import type { PixelSegment } from './autoTrace';
import { dist, uid } from './geometry';

/**
 * Convert detected pixel segments into walls in plan space (cm).
 * `cmPerPx` calibrates the image to real-world size; `origin` places the plan.
 */
export function segmentsToWalls(
  segs: PixelSegment[],
  cmPerPx: number,
  origin: Point,
  defaults: { height: number; thickness: number },
): Wall[] {
  const merged = mergeSegments(segs, /*tolPx*/ 6);
  const walls: Wall[] = [];
  for (const s of merged) {
    const start: Point = { x: origin.x + s.x1 * cmPerPx, y: origin.y + s.y1 * cmPerPx };
    const end: Point = { x: origin.x + s.x2 * cmPerPx, y: origin.y + s.y2 * cmPerPx };
    if (dist(start, end) < 15) continue;
    walls.push({
      id: uid(),
      start,
      end,
      // Use detected band thickness when it looks sane, else default.
      thickness: clamp(s.thickness * cmPerPx, 6, 40) || defaults.thickness,
      height: defaults.height,
      color: '#d7dade',
    });
  }
  return walls;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Merge nearly-collinear, overlapping axis-aligned segments so a thick wall
 * detected as several runs collapses into one clean segment.
 */
function mergeSegments(segs: PixelSegment[], tol: number): PixelSegment[] {
  const horizontals = segs.filter((s) => Math.abs(s.y1 - s.y2) < 1e-3);
  const verticals = segs.filter((s) => Math.abs(s.x1 - s.x2) < 1e-3);
  const others = segs.filter(
    (s) => Math.abs(s.y1 - s.y2) >= 1e-3 && Math.abs(s.x1 - s.x2) >= 1e-3,
  );
  return [
    ...mergeAxis(horizontals, true, tol),
    ...mergeAxis(verticals, false, tol),
    ...others,
  ];
}

function mergeAxis(segs: PixelSegment[], horizontal: boolean, tol: number): PixelSegment[] {
  // Group by the fixed coordinate (within tolerance), then union overlapping ranges.
  const groups: PixelSegment[][] = [];
  const sorted = [...segs].sort((a, b) =>
    horizontal ? a.y1 - b.y1 : a.x1 - b.x1,
  );
  for (const s of sorted) {
    const fixed = horizontal ? s.y1 : s.x1;
    let placed = false;
    for (const g of groups) {
      const gf = horizontal ? g[0].y1 : g[0].x1;
      if (Math.abs(gf - fixed) <= tol) {
        g.push(s);
        placed = true;
        break;
      }
    }
    if (!placed) groups.push([s]);
  }

  const out: PixelSegment[] = [];
  for (const g of groups) {
    const fixed = avg(g.map((s) => (horizontal ? s.y1 : s.x1)));
    const thickness = Math.max(...g.map((s) => s.thickness));
    const ranges = g
      .map((s) => (horizontal ? [s.x1, s.x2] : [s.y1, s.y2]))
      .map(([a, b]) => [Math.min(a, b), Math.max(a, b)] as [number, number])
      .sort((a, b) => a[0] - b[0]);
    let [cs, ce] = ranges[0];
    for (let i = 1; i < ranges.length; i++) {
      const [a, b] = ranges[i];
      if (a <= ce + tol) ce = Math.max(ce, b);
      else {
        out.push(makeSeg(horizontal, fixed, cs, ce, thickness));
        [cs, ce] = [a, b];
      }
    }
    out.push(makeSeg(horizontal, fixed, cs, ce, thickness));
  }
  return out;
}

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

function makeSeg(
  horizontal: boolean,
  fixed: number,
  a: number,
  b: number,
  thickness: number,
): PixelSegment {
  return horizontal
    ? { x1: a, y1: fixed, x2: b, y2: fixed, thickness }
    : { x1: fixed, y1: a, x2: fixed, y2: b, thickness };
}
