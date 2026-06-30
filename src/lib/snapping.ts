// Prioritized snapping engine for wall/room drawing, ported in spirit from
// cvdlab/react-planner (MIT): a collection of snap elements, each with a radius
// and a priority, plus nearestSnap() which returns the highest-priority element
// within range and the exact point on it. Adapted to our flat Wall[] model and
// extended with midpoint, wall-extension, and parallel/perpendicular guides.

import type { Point, Wall } from '../types';

export type SnapKind = 'point' | 'midpoint' | 'segment' | 'guide' | 'grid';

/** An infinite guide line, returned so the editor can draw the inference. */
export interface GuideLine {
  x0: number;
  y0: number;
  dx: number;
  dy: number;
}

export interface SnapResult {
  kind: SnapKind;
  point: Point;
  guide?: GuideLine;
}

interface SnapEl {
  kind: SnapKind;
  priority: number; // higher wins ties within range
  radius: number; // world cm
  line?: GuideLine; // present for guide elements
  nearest: (p: Point) => { point: Point; distance: number };
}

const d2 = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

function pointEl(x: number, y: number, radius: number, priority: number, kind: SnapKind = 'point'): SnapEl {
  const pt = { x, y };
  return { kind, priority, radius, nearest: (p) => ({ point: pt, distance: d2(p, pt) }) };
}

/** Finite wall body: project onto the segment, clamped to its ends. */
function segmentEl(a: Point, b: Point, radius: number, priority: number): SnapEl {
  return {
    kind: 'segment',
    priority,
    radius,
    nearest: (p) => {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy || 1;
      let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      const point = { x: a.x + t * dx, y: a.y + t * dy };
      return { point, distance: d2(p, point) };
    },
  };
}

/** Infinite guide line through (x0,y0) with unit direction (dx,dy). */
function guideEl(x0: number, y0: number, dx: number, dy: number, radius: number, priority: number): SnapEl {
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  return {
    kind: 'guide',
    priority,
    radius,
    line: { x0, y0, dx: ux, dy: uy },
    nearest: (p) => {
      const t = (p.x - x0) * ux + (p.y - y0) * uy;
      const point = { x: x0 + ux * t, y: y0 + uy * t };
      return { point, distance: d2(p, point) };
    },
  };
}

export interface BuildOpts {
  walls: Wall[];
  draft: Point[];
  /** The last placed draft point, if a chain is in progress. */
  prev: Point | null;
  /** Snap radius in world cm (screen px ÷ zoom). */
  radius: number;
  /** Include directional guides (cardinal / parallel / perpendicular / extension). */
  guides: boolean;
}

/**
 * Build the snap-element collection for the current scene + draft. Priorities:
 * point(5) > midpoint(4) > guide(3) > segment(2). Grid is handled by the caller.
 */
export function buildSnapElements(opts: BuildOpts): SnapEl[] {
  const { walls, draft, prev, radius, guides } = opts;
  const els: SnapEl[] = [];
  const verts: Point[] = [];

  for (const w of walls) {
    els.push(pointEl(w.start.x, w.start.y, radius, 5));
    els.push(pointEl(w.end.x, w.end.y, radius, 5));
    els.push(pointEl((w.start.x + w.end.x) / 2, (w.start.y + w.end.y) / 2, radius, 4, 'midpoint'));
    els.push(segmentEl(w.start, w.end, radius, 2));
    verts.push(w.start, w.end);
    if (guides) {
      // Extension guide along the wall's own line (align to / continue a wall).
      els.push(guideEl(w.start.x, w.start.y, w.end.x - w.start.x, w.end.y - w.start.y, radius * 0.8, 3));
    }
  }
  for (const p of draft) {
    els.push(pointEl(p.x, p.y, radius, 5));
    verts.push(p);
  }

  // Horizontal/vertical guides through every vertex (axis alignment).
  if (guides) {
    for (const v of verts) {
      els.push(guideEl(v.x, v.y, 1, 0, radius * 0.8, 3));
      els.push(guideEl(v.x, v.y, 0, 1, radius * 0.8, 3));
    }
    // Directional guides through the chain's previous point: cardinals (0/45/90)
    // plus parallel & perpendicular to every existing wall.
    if (prev) {
      for (const deg of [0, 45, 90, 135]) {
        const a = (deg * Math.PI) / 180;
        els.push(guideEl(prev.x, prev.y, Math.cos(a), Math.sin(a), radius * 0.8, 3));
      }
      for (const w of walls) {
        const dx = w.end.x - w.start.x;
        const dy = w.end.y - w.start.y;
        els.push(guideEl(prev.x, prev.y, dx, dy, radius * 0.7, 3)); // parallel
        els.push(guideEl(prev.x, prev.y, -dy, dx, radius * 0.7, 3)); // perpendicular
      }
    }
  }

  return els;
}

/** Highest-priority snap element within range; null if nothing is close. */
export function nearestSnap(els: SnapEl[], p: Point): SnapResult | null {
  let best: { el: SnapEl; point: Point; distance: number } | null = null;
  for (const el of els) {
    const n = el.nearest(p);
    if (n.distance >= el.radius) continue;
    if (
      !best ||
      el.priority > best.el.priority ||
      (el.priority === best.el.priority && n.distance < best.distance)
    ) {
      best = { el, point: n.point, distance: n.distance };
    }
  }
  return best ? { kind: best.el.kind, point: best.point, guide: best.el.line } : null;
}
