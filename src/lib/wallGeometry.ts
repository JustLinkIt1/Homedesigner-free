// Mitered wall-body polygons for the 2D plan (arch-plotter-style corner
// mitering, computed in-house): instead of stroking each wall as a thick
// round-capped line — which leaves round blobs or gaps at corners, especially
// on the skewed/non-orthogonal walls a traced plan often has — each wall is
// drawn as a filled quadrilateral whose corners are mitered against whatever
// wall shares that endpoint.

import type { Point, Wall } from '../types';

interface Edge {
  S: Point;
  E: Point;
  u: Point; // unit direction S -> E
  n: Point; // unit left-hand normal
  half: number; // half thickness
}

function edgeOf(w: Wall): Edge {
  const dx = w.end.x - w.start.x;
  const dy = w.end.y - w.start.y;
  const len = Math.hypot(dx, dy) || 1;
  const u = { x: dx / len, y: dy / len };
  const n = { x: -u.y, y: u.x };
  return { S: w.start, E: w.end, u, n, half: w.thickness / 2 };
}

/** Intersection of infinite lines p1+t*d1 and p2+s*d2, or null if parallel. */
function lineIntersect(p1: Point, d1: Point, p2: Point, d2: Point): Point | null {
  const denom = d1.x * d2.y - d1.y * d2.x;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((p2.x - p1.x) * d2.y - (p2.y - p1.y) * d2.x) / denom;
  return { x: p1.x + d1.x * t, y: p1.y + d1.y * t };
}

const closeEnough = (a: Point, b: Point, tol = 0.5) => Math.hypot(a.x - b.x, a.y - b.y) <= tol;

/**
 * Miter the left/right offset points at a corner shared by exactly two walls:
 * pair each wall's left/right offset line with whichever of the neighbor's
 * offset lines is topologically continuous (nearest), then intersect. Falls
 * back to null (caller uses a squared cap) beyond the miter limit or when the
 * walls are near-parallel, so acute corners never spike wildly.
 */
function miterAt(corner: Point, e: Edge, oe: Edge): { L: Point; R: Point } | null {
  const eL = { x: corner.x + e.n.x * e.half, y: corner.y + e.n.y * e.half };
  const eR = { x: corner.x - e.n.x * e.half, y: corner.y - e.n.y * e.half };
  const oL = { x: corner.x + oe.n.x * oe.half, y: corner.y + oe.n.y * oe.half };
  const oR = { x: corner.x - oe.n.x * oe.half, y: corner.y - oe.n.y * oe.half };

  const dLL = Math.hypot(eL.x - oL.x, eL.y - oL.y);
  const dLR = Math.hypot(eL.x - oR.x, eL.y - oR.y);
  const matchForL = dLL <= dLR ? oL : oR;
  const matchForR = dLL <= dLR ? oR : oL;

  const miterLimit = Math.max(e.half, oe.half) * 6;
  const L = lineIntersect(eL, e.u, matchForL, oe.u);
  const R = lineIntersect(eR, e.u, matchForR, oe.u);
  if (!L || !R) return null;
  if (Math.hypot(L.x - corner.x, L.y - corner.y) > miterLimit) return null;
  if (Math.hypot(R.x - corner.x, R.y - corner.y) > miterLimit) return null;
  return { L, R };
}

/**
 * A filled polygon per wall (4 points, S-left/E-left/E-right/S-right).
 * Endpoints shared with exactly one other wall get a true mitered corner;
 * open ends and T/X junctions (3+ walls) get a squared cap extended by half
 * the wall's own thickness — matching the corner-closing already used for
 * the 3D wall meshes, so open-end/junction geometry stays consistent.
 */
export function computeWallPolygons(walls: Wall[]): Map<string, Point[]> {
  const edges = walls.map(edgeOf);
  const touchingAt = (p: Point, skipIdx: number): number[] => {
    const out: number[] = [];
    edges.forEach((e, i) => {
      if (i === skipIdx) return;
      if (closeEnough(e.S, p) || closeEnough(e.E, p)) out.push(i);
    });
    return out;
  };

  const result = new Map<string, Point[]>();
  edges.forEach((e, i) => {
    const startExt = { x: e.S.x - e.u.x * e.half, y: e.S.y - e.u.y * e.half };
    const endExt = { x: e.E.x + e.u.x * e.half, y: e.E.y + e.u.y * e.half };
    let SL = { x: startExt.x + e.n.x * e.half, y: startExt.y + e.n.y * e.half };
    let SR = { x: startExt.x - e.n.x * e.half, y: startExt.y - e.n.y * e.half };
    let EL = { x: endExt.x + e.n.x * e.half, y: endExt.y + e.n.y * e.half };
    let ER = { x: endExt.x - e.n.x * e.half, y: endExt.y - e.n.y * e.half };

    const startNeighbors = touchingAt(e.S, i);
    if (startNeighbors.length === 1) {
      const m = miterAt(e.S, e, edges[startNeighbors[0]]);
      if (m) {
        SL = m.L;
        SR = m.R;
      }
    }
    const endNeighbors = touchingAt(e.E, i);
    if (endNeighbors.length === 1) {
      const m = miterAt(e.E, e, edges[endNeighbors[0]]);
      if (m) {
        EL = m.L;
        ER = m.R;
      }
    }

    result.set(walls[i].id, [SL, EL, ER, SR]);
  });
  return result;
}
