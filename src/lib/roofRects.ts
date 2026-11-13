// A pitched roof over an L-shaped, T-shaped or stepped house.
//
// The roof over a plain rectangle is one gable. Over anything else that single
// gable was drawn across the whole bounding box, so wherever a wall stepped
// back the roof carried on over thin air: from the side you looked straight up
// into it, as if the gable end had been left open.
//
// A real house of that shape has a main roof over its biggest block and a
// smaller gable over each part that sticks out, its ridge running into the
// main slope. That is what this works out, for outlines whose walls all run
// square to each other (which is nearly every house plan):
//
//   1. cut the outline into rectangles, biggest first;
//   2. give the biggest a gable along its length;
//   3. give each other rectangle a gable of its own, attached to the roof it
//      touches.
//
// The roofs are simply drawn through one another. They share an eave height
// and a pitch, so where two meet the higher one hides the lower and the valley
// between them appears by itself; nothing has to be clipped.
//
// Everything here is plan geometry in the roof's own frame (u along the
// bounding box, v across it, centimetres). No rendering.

import type { Point } from '../types';

export interface Rect { u0: number; u1: number; v0: number; v1: number }

/** One gable: a ridge with a slope falling away on each side. */
export interface RoofPrism {
  /** The direction the ridge runs. */
  axis: 'u' | 'v';
  /** Where the roof starts and stops along the ridge (eave line, overhang included). */
  a0: number;
  a1: number;
  /** The ridge's position across, and the distance from it out to each eave. */
  mid: number;
  half: number;
  /** Whether each end is a gable end, with bargeboards, or runs into another roof. */
  gableStart: boolean;
  gableEnd: boolean;
}

export interface RoofPlan {
  prisms: RoofPrism[];
  /** Lines where a lower roof butts a taller one's gable wall. The outline does
   *  not run along them, so the wall above the lower roof is built from these. */
  seams: [Point, Point][];
}

const EPS = 1; // cm: closer than this is the same line

/** True when every edge runs along u or along v. */
export function rectilinear(local: Point[]): boolean {
  if (local.length < 4) return false;
  return local.every((p, i) => {
    const q = local[(i + 1) % local.length];
    return Math.abs(p.x - q.x) < EPS || Math.abs(p.y - q.y) < EPS;
  });
}

function levels(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const out: number[] = [];
  for (const v of sorted) if (!out.length || v - out[out.length - 1] >= EPS) out.push(v);
  return out;
}

function inside(poly: Point[], x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

/**
 * The outline as rectangles, biggest first, each the largest that still fits
 * in what is left. Null when the outline is too intricate to be a house roof.
 */
export function decompose(local: Point[]): Rect[] | null {
  const us = levels(local.map((p) => p.x));
  const vs = levels(local.map((p) => p.y));
  const nu = us.length - 1, nv = vs.length - 1;
  if (nu < 1 || nv < 1 || nu > 16 || nv > 16) return null;
  // free[j][i]: cell i,j is part of the house and not yet under a rectangle.
  const free = Array.from({ length: nv }, (_, j) =>
    Array.from({ length: nu }, (_, i) => inside(local, (us[i] + us[i + 1]) / 2, (vs[j] + vs[j + 1]) / 2)));
  const rects: Rect[] = [];
  for (let guard = 0; guard < 24; guard++) {
    let best: { area: number; i0: number; i1: number; j0: number; j1: number } | null = null;
    for (let j0 = 0; j0 < nv; j0++) {
      for (let i0 = 0; i0 < nu; i0++) {
        let reach = nu; // how far right every row so far allows
        for (let j1 = j0; j1 < nv && reach > i0; j1++) {
          let run = i0;
          while (run < reach && free[j1][run]) run++;
          reach = run;
          if (reach <= i0) break;
          const area = (us[reach] - us[i0]) * (vs[j1 + 1] - vs[j0]);
          if (!best || area > best.area + 1e-6) best = { area, i0, i1: reach, j0, j1: j1 + 1 };
        }
      }
    }
    if (!best) break;
    for (let j = best.j0; j < best.j1; j++) for (let i = best.i0; i < best.i1; i++) free[j][i] = false;
    rects.push({ u0: us[best.i0], u1: us[best.i1], v0: vs[best.j0], v1: vs[best.j1] });
  }
  return rects.length ? rects : null;
}

type Side = '+u' | '-u' | '+v' | '-v';

/** Which side of `host` the rectangle `w` sits against, and for how long. */
function touching(host: Rect, w: Rect): { side: Side; length: number } | null {
  const alongV = Math.min(host.v1, w.v1) - Math.max(host.v0, w.v0);
  const alongU = Math.min(host.u1, w.u1) - Math.max(host.u0, w.u0);
  if (Math.abs(w.u0 - host.u1) < EPS && alongV > EPS) return { side: '+u', length: alongV };
  if (Math.abs(w.u1 - host.u0) < EPS && alongV > EPS) return { side: '-u', length: alongV };
  if (Math.abs(w.v0 - host.v1) < EPS && alongU > EPS) return { side: '+v', length: alongU };
  if (Math.abs(w.v1 - host.v0) < EPS && alongU > EPS) return { side: '-v', length: alongU };
  return null;
}

/** A free-standing gable over one rectangle, ridge along its longer side. */
function standalone(r: Rect, ov: number): RoofPrism {
  const alongU = r.u1 - r.u0 >= r.v1 - r.v0;
  return alongU
    ? { axis: 'u', a0: r.u0 - ov, a1: r.u1 + ov, mid: (r.v0 + r.v1) / 2, half: (r.v1 - r.v0) / 2 + ov, gableStart: true, gableEnd: true }
    : { axis: 'v', a0: r.v0 - ov, a1: r.v1 + ov, mid: (r.u0 + r.u1) / 2, half: (r.u1 - r.u0) / 2 + ov, gableStart: true, gableEnd: true };
}

/**
 * The gables for a set of rectangles (biggest first, as `decompose` returns
 * them). `overhang` is how far the eaves pass the walls, in cm.
 */
export function planPrisms(rects: Rect[], overhang: number): RoofPlan {
  const ov = Math.max(0, overhang);
  const plan: RoofPlan = { prisms: [], seams: [] };
  const placed: { rect: Rect; prism: RoofPrism }[] = [];
  // Slivers narrower than the eaves overhang sit under the roof next door.
  const pending = rects.filter((r, i) => i === 0 || Math.min(r.u1 - r.u0, r.v1 - r.v0) > Math.max(25, ov));
  if (!pending.length) return plan;
  const main = pending.shift()!;
  placed.push({ rect: main, prism: standalone(main, ov) });

  while (pending.length) {
    // Take whichever remaining block touches a roof already planned, by its longest shared wall.
    let pick: { index: number; host: (typeof placed)[number]; side: Side; length: number } | null = null;
    pending.forEach((w, index) => {
      for (const host of placed) {
        const t = touching(host.rect, w);
        if (t && (!pick || t.length > pick.length)) pick = { index, host, side: t.side, length: t.length };
      }
    });
    if (!pick) {
      const lone = pending.shift()!;
      placed.push({ rect: lone, prism: standalone(lone, ov) });
      continue;
    }
    const { index, host, side } = pick as { index: number; host: (typeof placed)[number]; side: Side };
    const w = pending.splice(index, 1)[0];
    const outward: 'u' | 'v' = side === '+u' || side === '-u' ? 'u' : 'v';
    const positive = side === '+u' || side === '+v';
    // Along the direction the block sticks out, and across it.
    const [near, far] = outward === 'u' ? (positive ? [w.u0, w.u1] : [w.u1, w.u0]) : (positive ? [w.v0, w.v1] : [w.v1, w.v0]);
    const [c0, c1] = outward === 'u' ? [w.v0, w.v1] : [w.u0, w.u1];
    const span = c1 - c0;
    const hostSpan = (host.prism.half - ov) * 2;
    let prism: RoofPrism;
    if (host.prism.axis === outward) {
      // It carries on from the host's gable end: a lower roof in the same
      // direction, butting the host's end wall.
      prism = {
        axis: outward, mid: (c0 + c1) / 2, half: span / 2 + ov,
        a0: positive ? near : far - ov, a1: positive ? far + ov : near,
        gableStart: !positive, gableEnd: positive,
      };
      const a: Point = outward === 'u' ? { x: near, y: c0 } : { x: c0, y: near };
      const b: Point = outward === 'u' ? { x: near, y: c1 } : { x: c1, y: near };
      plan.seams.push([a, b]);
    } else if (span <= hostSpan * 0.98) {
      // It sticks out of the host's side: a cross gable. Its ridge meets the
      // host's slope half its own width in from the wall, so it runs that far
      // into the host (a little further, to be safely buried).
      const into = Math.min(span / 2 + 8, hostSpan);
      prism = {
        axis: outward, mid: (c0 + c1) / 2, half: span / 2 + ov,
        a0: positive ? near - into : far - ov, a1: positive ? far + ov : near + into,
        gableStart: !positive, gableEnd: positive,
      };
    } else {
      // Wider than the host is deep: a cross gable would rise above the main
      // ridge. Roof it alongside instead, ridge parallel to the wall it is on.
      const lo = Math.min(near, far), hi = Math.max(near, far);
      prism = {
        axis: outward === 'u' ? 'v' : 'u', mid: (lo + hi) / 2, half: (hi - lo) / 2 + ov,
        a0: c0 - ov, a1: c1 + ov, gableStart: true, gableEnd: true,
      };
    }
    placed.push({ rect: w, prism });
  }
  plan.prisms = placed.map((p) => p.prism);
  return plan;
}

/**
 * How far the highest roof over plan point (u, v) stands above the eave line,
 * as a distance to multiply by the slope. Null where no roof passes over.
 */
export function coverAt(prisms: RoofPrism[], u: number, v: number): number | null {
  let best: number | null = null;
  for (const p of prisms) {
    const a = p.axis === 'u' ? u : v;
    const c = p.axis === 'u' ? v : u;
    if (a < p.a0 - 1e-6 || a > p.a1 + 1e-6) continue;
    const run = p.half - Math.abs(c - p.mid);
    if (run < -1e-6) continue;
    if (best === null || run > best) best = Math.max(0, run);
  }
  return best;
}

/** The lines along u and along v where the roof surface over an edge can kink. */
export function kinkLines(prisms: RoofPrism[]): { u: number[]; v: number[] } {
  const out = { u: [] as number[], v: [] as number[] };
  for (const p of prisms) {
    const across = p.axis === 'u' ? out.v : out.u;
    const along = p.axis === 'u' ? out.u : out.v;
    across.push(p.mid, p.mid - p.half, p.mid + p.half);
    along.push(p.a0, p.a1);
  }
  return out;
}
