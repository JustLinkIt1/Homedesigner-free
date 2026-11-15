// Stair geometry, shared by the 2D plan symbol, the 3D model, the DXF export
// and walk mode, so all four always agree on where a stair starts and ends.
//
// Everything is in the item's local plan frame, in cm, centred on the item:
// x across its width, y along its depth, y = -depth/2 being the "back" edge
// (the same frame the plan symbols and the 3D group use). A straight stair
// starts climbing at the back edge; that has been true since stairs shipped,
// so existing saves keep their direction.
import type { FurnitureItem, Point } from '../types';

export type StairShape = 'stairs' | 'stairs_l' | 'stairs_u' | 'stairs_spiral';

export const STAIR_SHAPES: readonly StairShape[] = ['stairs', 'stairs_l', 'stairs_u', 'stairs_spiral'];

export function isStairShape(shape: string | undefined): shape is StairShape {
  return !!shape && (STAIR_SHAPES as readonly string[]).includes(shape);
}

/** Catalog types are named after their shapes, so this also answers "is this
 *  furniture item a stair". */
export function isStairs(item: { type: string } | null | undefined): boolean {
  return !!item && isStairShape(item.type);
}

/** Stairs that turn have a left- and a right-handed version. */
export function stairTurns(type: string): boolean {
  return type === 'stairs_l' || type === 'stairs_u' || type === 'stairs_spiral';
}

export interface StairTread {
  /** Outline in the local plan frame (cm). */
  poly: Point[];
  /** 1-based: the tread's top sits at level × rise. */
  level: number;
  landing?: boolean;
}

export interface StairEnd {
  /** Middle of the stair's edge where you step on or off. */
  at: Point;
  /** Unit vector pointing away from the stair. */
  out: Point;
}

export interface StairPlan {
  treads: StairTread[];
  /** Walking line from the bottom step to the top, for the plan arrow. */
  path: Point[];
  low: StairEnd;
  high: StairEnd;
  /** Clear width of a flight (cm). */
  flightWidth: number;
  /** Rise of one step (cm). */
  rise: number;
  steps: number;
  /** Spiral stairs: the central post. */
  post?: { radius: number };
}

/** Same step count the original straight stair used, so it looks unchanged. */
export function stairStepCount(height: number): number {
  return Math.max(6, Math.round(height / 18));
}

const rect = (x0: number, y0: number, x1: number, y1: number): Point[] => [
  { x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 },
];

/** Treads of one straight flight running from `a` to `b` along x or y. */
function flight(
  axis: 'x' | 'y', from: number, to: number, c0: number, c1: number, count: number, firstLevel: number,
): StairTread[] {
  const out: StairTread[] = [];
  for (let i = 0; i < count; i++) {
    const s0 = from + ((to - from) * i) / count;
    const s1 = from + ((to - from) * (i + 1)) / count;
    out.push({
      poly: axis === 'y' ? rect(c0, Math.min(s0, s1), c1, Math.max(s0, s1)) : rect(Math.min(s0, s1), c0, Math.max(s0, s1), c1),
      level: firstLevel + i,
    });
  }
  return out;
}

export function stairPlan(
  shape: StairShape, width: number, depth: number, height: number, mirrored = false,
): StairPlan {
  const steps = stairStepCount(height);
  const rise = height / steps;
  const w = Math.max(1, width);
  const d = Math.max(1, depth);
  const hw = w / 2;
  const hd = d / 2;
  let plan: StairPlan;

  if (shape === 'stairs_l') {
    // Up the left strip, a square landing in the far corner, then across.
    const s = Math.max(30, Math.min(w, d) * 0.45);
    const run1 = Math.max(1, d - s);
    const run2 = Math.max(1, w - s);
    const n1 = Math.min(steps - 2, Math.max(1, Math.round(((steps - 1) * run1) / (run1 + run2))));
    const n2 = steps - 1 - n1;
    const x0 = -hw;
    const x1 = -hw + s;
    plan = {
      treads: [
        ...flight('y', -hd, hd - s, x0, x1, n1, 1),
        { poly: rect(x0, hd - s, x1, hd), level: n1 + 1, landing: true },
        ...flight('x', x1, hw, hd - s, hd, n2, n1 + 2),
      ],
      path: [{ x: x0 + s / 2, y: -hd }, { x: x0 + s / 2, y: hd - s / 2 }, { x: hw, y: hd - s / 2 }],
      low: { at: { x: x0 + s / 2, y: -hd }, out: { x: 0, y: -1 } },
      high: { at: { x: hw, y: hd - s / 2 }, out: { x: 1, y: 0 } },
      flightWidth: s,
      rise,
      steps,
    };
  } else if (shape === 'stairs_u') {
    // Two flights side by side with a full-width half landing at the far end.
    const gap = Math.min(12, w * 0.06);
    const s = Math.max(30, (w - gap) / 2);
    const landing = Math.min(s, d * 0.45);
    const n1 = Math.max(1, Math.floor((steps - 1) / 2));
    const n2 = Math.max(1, steps - 1 - n1);
    plan = {
      treads: [
        ...flight('y', -hd, hd - landing, -hw, -hw + s, n1, 1),
        { poly: rect(-hw, hd - landing, hw, hd), level: n1 + 1, landing: true },
        ...flight('y', hd - landing, -hd, hw - s, hw, n2, n1 + 2),
      ],
      path: [
        { x: -hw + s / 2, y: -hd },
        { x: -hw + s / 2, y: hd - landing / 2 },
        { x: hw - s / 2, y: hd - landing / 2 },
        { x: hw - s / 2, y: -hd },
      ],
      low: { at: { x: -hw + s / 2, y: -hd }, out: { x: 0, y: -1 } },
      high: { at: { x: hw - s / 2, y: -hd }, out: { x: 0, y: -1 } },
      flightWidth: s,
      rise,
      steps: n1 + n2 + 1,
    };
  } else if (shape === 'stairs_spiral') {
    // Wedge treads round a central post, starting at the back edge and turning
    // 330 degrees so the top step clears the bottom one.
    const sweep = (330 * Math.PI) / 180;
    const start = -Math.PI / 2;
    const post = Math.min(hw, hd) * 0.12;
    const at = (r: number, a: number): Point => ({ x: Math.cos(a) * hw * r, y: Math.sin(a) * hd * r });
    const inner = post / Math.min(hw, hd);
    const treads: StairTread[] = [];
    const per = sweep / steps;
    for (let i = 0; i < steps; i++) {
      const a0 = start + per * i;
      const a1 = start + per * (i + 1);
      const poly: Point[] = [];
      const seg = 4;
      for (let k = 0; k <= seg; k++) poly.push(at(1, a0 + ((a1 - a0) * k) / seg));
      for (let k = seg; k >= 0; k--) poly.push(at(inner, a0 + ((a1 - a0) * k) / seg));
      treads.push({ poly, level: i + 1 });
    }
    const walkR = 0.6;
    const path: Point[] = [];
    for (let k = 0; k <= 24; k++) path.push(at(walkR, start + (sweep * k) / 24));
    const end = start + sweep;
    const tangent = (a: number): Point => {
      const v = { x: -Math.sin(a) * hw, y: Math.cos(a) * hd };
      const len = Math.hypot(v.x, v.y) || 1;
      return { x: v.x / len, y: v.y / len };
    };
    const t0 = tangent(start);
    plan = {
      treads,
      path,
      low: { at: at(walkR, start), out: { x: -t0.x, y: -t0.y } },
      high: { at: at(walkR, end), out: tangent(end) },
      flightWidth: Math.min(hw, hd) * (1 - inner),
      rise,
      steps,
      post: { radius: post },
    };
  } else {
    plan = {
      treads: flight('y', -hd, hd, -hw, hw, steps, 1),
      path: [{ x: 0, y: -hd }, { x: 0, y: hd }],
      low: { at: { x: 0, y: -hd }, out: { x: 0, y: -1 } },
      high: { at: { x: 0, y: hd }, out: { x: 0, y: 1 } },
      flightWidth: w,
      rise,
      steps,
    };
  }

  if (!mirrored) return plan;
  const flip = (p: Point): Point => ({ x: -p.x, y: p.y });
  return {
    ...plan,
    treads: plan.treads.map((t) => ({ ...t, poly: t.poly.map(flip).reverse() })),
    path: plan.path.map(flip),
    low: { at: flip(plan.low.at), out: flip(plan.low.out) },
    high: { at: flip(plan.high.at), out: flip(plan.high.out) },
  };
}

export function stairPlanFor(item: FurnitureItem): StairPlan {
  const shape: StairShape = isStairShape(item.type) ? item.type : 'stairs';
  return stairPlan(shape, item.width, item.depth, item.height, !!item.mirrored);
}

/** Plan-symbol line work (SVG path data, local frame, cm): tread outlines,
 *  the walking line and an arrow pointing up the stair, with a dot on the
 *  bottom step as plans conventionally draw it. */
export function stairSymbolPaths(plan: StairPlan): { d: string; sw?: number; fill?: boolean }[] {
  const poly = (pts: Point[], close = true) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') + (close ? ' Z' : '');
  // Circles as polygons, so every coordinate in the output is a plain x,y pair
  // that `stairIconPaths` can remap.
  const ring = (c: Point, r: number) =>
    poly(Array.from({ length: 16 }, (_, i) => ({ x: c.x + Math.cos((i / 16) * Math.PI * 2) * r, y: c.y + Math.sin((i / 16) * Math.PI * 2) * r })));
  const out: { d: string; sw?: number; fill?: boolean }[] = plan.treads.map((t) => ({ d: poly(t.poly), sw: t.landing ? 2.5 : 2 }));
  if (plan.post) out.push({ d: ring({ x: 0, y: 0 }, plan.post.radius), sw: 2.5 });
  // Inset the line from the outer edges so the arrow head sits on the stair.
  const path = plan.path.slice();
  const inset = (a: Point, b: Point, by: number): Point => {
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: a.x + ((b.x - a.x) / len) * by, y: a.y + ((b.y - a.y) / len) * by };
  };
  const step = Math.min(18, plan.flightWidth * 0.25);
  path[0] = inset(path[0], path[1], step);
  path[path.length - 1] = inset(path[path.length - 1], path[path.length - 2], step);
  out.push({ d: poly(path, false), sw: 2.5 });
  const tip = path[path.length - 1];
  const prev = path[path.length - 2];
  const len = Math.hypot(tip.x - prev.x, tip.y - prev.y) || 1;
  const ux = (tip.x - prev.x) / len;
  const uy = (tip.y - prev.y) / len;
  const head = Math.max(8, Math.min(22, plan.flightWidth * 0.18));
  const left = { x: tip.x - ux * head - uy * head * 0.6, y: tip.y - uy * head + ux * head * 0.6 };
  const right = { x: tip.x - ux * head + uy * head * 0.6, y: tip.y - uy * head - ux * head * 0.6 };
  out.push({ d: `M${left.x.toFixed(1)},${left.y.toFixed(1)} L${tip.x.toFixed(1)},${tip.y.toFixed(1)} L${right.x.toFixed(1)},${right.y.toFixed(1)}`, sw: 2.5 });
  out.push({ d: ring(path[0], Math.max(3, Math.min(7, plan.flightWidth * 0.05))), sw: 2.5 });
  return out;
}

/** Catalog-icon / DXF version of the symbol: drawn at the default size, then
 *  mapped into the 0..100 box the other plan symbols use. */
export function stairIconPaths(shape: StairShape, width: number, depth: number, height: number) {
  const plan = stairPlan(shape, width, depth, height);
  const map = (d: string) => d.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, (_, x, y) =>
    `${((Number(x) / width + 0.5) * 100).toFixed(1)},${((Number(y) / depth + 0.5) * 100).toFixed(1)}`);
  return stairSymbolPaths(plan).map((p) => ({ ...p, d: map(p.d) }));
}

/** Rotate/translate a local-frame point into plan space. */
export function stairToPlan(item: FurnitureItem, p: Point): Point {
  const a = (item.rotation * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return { x: item.position.x + p.x * cos - p.y * sin, y: item.position.y + p.x * sin + p.y * cos };
}
