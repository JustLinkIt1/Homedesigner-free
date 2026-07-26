import type { Point } from '../types';

/**
 * Flatten SVG path data into polylines.
 *
 * The furniture plan symbols in `symbols.ts` are SVG path strings — one source
 * of truth already used by the 2D canvas and the catalog sidebar. Exporting
 * furniture to CAD needs the same shapes as line work, so rather than redraw
 * every symbol this converts the paths that already exist.
 *
 * Deliberately not done with the DOM (`SVGPathElement.getPointAtLength` would
 * be a one-liner): keeping it pure means the export can be tested in plain Node
 * alongside the rest of the geometry, and it does not tie a library module to a
 * browser. Supports the commands `symbols.ts` actually uses — M L H V C S Q T A
 * Z, absolute and relative.
 */

export interface FlattenOptions {
  /** Segments per curve. Symbols are small; 12 is smooth at plan scale. */
  curveSteps: number;
}

const DEFAULTS: FlattenOptions = { curveSteps: 12 };

/** Split path data into [command, ...numbers] tuples. */
function tokenize(d: string): { cmd: string; args: number[] }[] {
  const out: { cmd: string; args: number[] }[] = [];
  const re = /([MmLlHhVvCcSsQqTtAaZz])|(-?\d*\.?\d+(?:e[-+]?\d+)?)/gi;
  let cmd = '';
  let args: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(d))) {
    if (m[1]) {
      if (cmd) out.push({ cmd, args });
      cmd = m[1];
      args = [];
    } else if (cmd) {
      args.push(Number(m[2]));
    }
  }
  if (cmd) out.push({ cmd, args });
  return out;
}

/** Endpoint-parameterised elliptical arc → sampled points (SVG spec F.6.5). */
function arcPoints(
  p0: Point,
  rx: number,
  ry: number,
  xRotDeg: number,
  largeArc: number,
  sweep: number,
  p1: Point,
  steps: number,
): Point[] {
  if (rx === 0 || ry === 0) return [p1];
  const phi = (xRotDeg * Math.PI) / 180;
  const cosP = Math.cos(phi);
  const sinP = Math.sin(phi);
  const dx2 = (p0.x - p1.x) / 2;
  const dy2 = (p0.y - p1.y) / 2;
  const x1 = cosP * dx2 + sinP * dy2;
  const y1 = -sinP * dx2 + cosP * dy2;
  let RX = Math.abs(rx);
  let RY = Math.abs(ry);
  // Scale the radii up if they are too small to span the endpoints.
  const lam = (x1 * x1) / (RX * RX) + (y1 * y1) / (RY * RY);
  if (lam > 1) {
    const s = Math.sqrt(lam);
    RX *= s;
    RY *= s;
  }
  const sign = largeArc === sweep ? -1 : 1;
  const num = RX * RX * RY * RY - RX * RX * y1 * y1 - RY * RY * x1 * x1;
  const den = RX * RX * y1 * y1 + RY * RY * x1 * x1;
  const co = sign * Math.sqrt(Math.max(0, num / den));
  const cx1 = (co * RX * y1) / RY;
  const cy1 = (-co * RY * x1) / RX;
  const cx = cosP * cx1 - sinP * cy1 + (p0.x + p1.x) / 2;
  const cy = sinP * cx1 + cosP * cy1 + (p0.y + p1.y) / 2;

  const ang = (ux: number, uy: number, vx: number, vy: number) => {
    const dot = ux * vx + uy * vy;
    const len = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    let a = Math.acos(Math.max(-1, Math.min(1, dot / (len || 1))));
    if (ux * vy - uy * vx < 0) a = -a;
    return a;
  };
  const theta0 = ang(1, 0, (x1 - cx1) / RX, (y1 - cy1) / RY);
  let dTheta = ang((x1 - cx1) / RX, (y1 - cy1) / RY, (-x1 - cx1) / RX, (-y1 - cy1) / RY);
  if (!sweep && dTheta > 0) dTheta -= 2 * Math.PI;
  if (sweep && dTheta < 0) dTheta += 2 * Math.PI;

  const n = Math.max(2, Math.ceil((Math.abs(dTheta) / Math.PI) * steps));
  const pts: Point[] = [];
  for (let i = 1; i <= n; i++) {
    const th = theta0 + (dTheta * i) / n;
    const ex = RX * Math.cos(th);
    const ey = RY * Math.sin(th);
    pts.push({ x: cosP * ex - sinP * ey + cx, y: sinP * ex + cosP * ey + cy });
  }
  return pts;
}

/** Flatten path data into one or more open/closed polylines. */
export function flattenPath(d: string, options: Partial<FlattenOptions> = {}): Point[][] {
  const o = { ...DEFAULTS, ...options };
  const polys: Point[][] = [];
  let cur: Point[] = [];
  let pos: Point = { x: 0, y: 0 };
  let start: Point = { x: 0, y: 0 };
  // Last control point, for the smooth variants S and T. Held in an object
  // because they are written from the nested curve helpers below, which
  // narrowing on plain `let` bindings would not account for.
  const last: { c: Point | null; q: Point | null } = { c: null, q: null };

  const flush = () => {
    if (cur.length > 1) polys.push(cur);
    cur = [];
  };
  const moveTo = (p: Point) => {
    flush();
    pos = p;
    start = p;
    cur = [p];
  };
  const lineTo = (p: Point) => {
    if (!cur.length) cur = [pos];
    cur.push(p);
    pos = p;
  };
  const cubic = (c1: Point, c2: Point, p: Point) => {
    if (!cur.length) cur = [pos];
    const p0 = pos;
    for (let i = 1; i <= o.curveSteps; i++) {
      const t = i / o.curveSteps;
      const u = 1 - t;
      cur.push({
        x: u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p.x,
        y: u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p.y,
      });
    }
    pos = p;
    last.c = c2;
    last.q = null;
  };
  const quad = (c: Point, p: Point) => {
    if (!cur.length) cur = [pos];
    const p0 = pos;
    for (let i = 1; i <= o.curveSteps; i++) {
      const t = i / o.curveSteps;
      const u = 1 - t;
      cur.push({
        x: u * u * p0.x + 2 * u * t * c.x + t * t * p.x,
        y: u * u * p0.y + 2 * u * t * c.y + t * t * p.y,
      });
    }
    pos = p;
    last.q = c;
    last.c = null;
  };

  for (const { cmd, args } of tokenize(d)) {
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    const rx = (v: number) => (rel ? pos.x + v : v);
    const ry = (v: number) => (rel ? pos.y + v : v);
    let i = 0;
    if (C === 'Z') {
      if (cur.length > 1) cur.push({ ...start });
      flush();
      pos = start;
      continue;
    }
    // Repeated coordinate sets after one command letter are implicit repeats
    // (and an implicit M repeat means L, per the SVG spec).
    let first = true;
    while (i < args.length) {
      switch (C) {
        case 'M': {
          const p = { x: rx(args[i]), y: ry(args[i + 1]) };
          if (first) moveTo(p);
          else lineTo(p);
          i += 2;
          break;
        }
        case 'L':
          lineTo({ x: rx(args[i]), y: ry(args[i + 1]) });
          i += 2;
          break;
        case 'H':
          lineTo({ x: rx(args[i]), y: pos.y });
          i += 1;
          break;
        case 'V':
          lineTo({ x: pos.x, y: ry(args[i]) });
          i += 1;
          break;
        case 'C':
          cubic(
            { x: rx(args[i]), y: ry(args[i + 1]) },
            { x: rx(args[i + 2]), y: ry(args[i + 3]) },
            { x: rx(args[i + 4]), y: ry(args[i + 5]) },
          );
          i += 6;
          break;
        case 'S': {
          const refl = last.c ? { x: 2 * pos.x - last.c.x, y: 2 * pos.y - last.c.y } : { ...pos };
          cubic(refl, { x: rx(args[i]), y: ry(args[i + 1]) }, { x: rx(args[i + 2]), y: ry(args[i + 3]) });
          i += 4;
          break;
        }
        case 'Q':
          quad({ x: rx(args[i]), y: ry(args[i + 1]) }, { x: rx(args[i + 2]), y: ry(args[i + 3]) });
          i += 4;
          break;
        case 'T': {
          const refl = last.q ? { x: 2 * pos.x - last.q.x, y: 2 * pos.y - last.q.y } : { ...pos };
          quad(refl, { x: rx(args[i]), y: ry(args[i + 1]) });
          i += 2;
          break;
        }
        case 'A': {
          const p1 = { x: rx(args[i + 5]), y: ry(args[i + 6]) };
          if (!cur.length) cur = [pos];
          for (const p of arcPoints(pos, args[i], args[i + 1], args[i + 2], args[i + 3], args[i + 4], p1, o.curveSteps)) {
            cur.push(p);
          }
          pos = p1;
          last.c = null;
          last.q = null;
          i += 7;
          break;
        }
        default:
          i = args.length;
      }
      first = false;
    }
  }
  flush();
  return polys;
}
