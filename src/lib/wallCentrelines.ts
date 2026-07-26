import type { Point } from '../types';

/**
 * Wall centrelines from wall OUTLINES.
 *
 * CAD files don't draw a wall as a line down its middle — they draw its two
 * faces, usually as a closed rectangle per wall. HomeDesigner's model is the
 * opposite: a wall IS a centreline plus a thickness. Import the faces directly
 * and every wall arrives doubled, room detection (which walks a planar graph of
 * centrelines) sees the inside of each wall rectangle instead of the rooms, and
 * a 6 x 22 m house reports a 10 m² "footprint".
 *
 * So: find pairs of parallel faces that sit a plausible wall-thickness apart and
 * overlap along their length, and emit the line between them. The perpendicular
 * distance is the wall's real thickness, which is better than the default we
 * would otherwise guess.
 *
 * The work happens in a rotated frame per direction cluster, so this handles
 * plans drawn at any angle — which matters, because real plots are rarely square
 * to the page.
 */

export interface Seg {
  a: Point;
  b: Point;
}

export interface Centreline {
  a: Point;
  b: Point;
  /** Face-to-face distance, in the same units as the input. */
  thickness: number;
  /** False when this came through unpaired (a wall drawn as a single line). */
  paired: boolean;
  /**
   * Holes in the wall — where BOTH faces stop and start again. CAD cuts the
   * wall at every door and window, so these gaps are the openings themselves,
   * located and sized exactly. Positions are fractions along a→b.
   */
  gaps: { offset: number; width: number }[];
}

export interface CentrelineOptions {
  /** Thinnest wall to believe in (input units, cm by default). */
  minThickness: number;
  /** Thickest. Above this, two faces are opposite walls of a room, not one wall. */
  maxThickness: number;
  /** Direction clustering tolerance, radians. */
  angleTol: number;
  /** Two faces count as the same line within this perpendicular distance. */
  offsetTol: number;
  /** Bridge gaps along a face up to this long (door and window openings). */
  gapTol: number;
  /** Discard anything shorter than this. */
  minLength: number;
  /** Narrowest hole to report as an opening. */
  minOpening: number;
  /** Widest. Beyond this the wall simply ended rather than being pierced. */
  maxOpening: number;
  /** Keep unpaired runs at least this long as single-line walls. */
  keepUnpairedOver: number;
}

export const DEFAULT_CENTRELINE_OPTIONS: CentrelineOptions = {
  minThickness: 4,
  maxThickness: 60,
  angleTol: (2.5 * Math.PI) / 180,
  offsetTol: 3,
  // Real plans break a wall's ink at every opening; patio doors reach ~250cm.
  gapTol: 260,
  minLength: 25,
  minOpening: 45,
  maxOpening: 400,
  keepUnpairedOver: 120,
};

const len = (s: Seg) => Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);

/** Direction of a segment, folded into [0, PI) so a-to-b and b-to-a agree. */
function angleOf(s: Seg): number {
  let t = Math.atan2(s.b.y - s.a.y, s.b.x - s.a.x);
  if (t < 0) t += Math.PI;
  if (t >= Math.PI) t -= Math.PI;
  return t;
}

/** Smallest difference between two folded angles, accounting for the 0/PI seam. */
function angleGap(a: number, b: number): number {
  const d = Math.abs(a - b) % Math.PI;
  return Math.min(d, Math.PI - d);
}

/** One straight face: a maximal run along a line, in the cluster's local frame. */
interface Run {
  offset: number; // perpendicular position of the line
  t0: number; // start along the line
  t1: number; // end
  /** Breaks bridged while building this run — candidate openings. */
  gaps: [number, number][];
  /** Portions already consumed by a pairing, so a face can serve two walls. */
  used: [number, number][];
}

/** How much of [t0,t1] is still free on this run. */
function freeOverlap(run: Run, t0: number, t1: number): [number, number] | null {
  const lo = Math.max(run.t0, t0);
  const hi = Math.min(run.t1, t1);
  if (hi - lo <= 0) return null;
  // Trim against consumed intervals; keep the largest surviving piece.
  let best: [number, number] | null = null;
  const blocks = [...run.used].sort((p, q) => p[0] - q[0]);
  let cursor = lo;
  for (const [bs, be] of blocks) {
    if (be <= cursor) continue;
    if (bs >= hi) break;
    if (bs > cursor) {
      const piece: [number, number] = [cursor, Math.min(bs, hi)];
      if (!best || piece[1] - piece[0] > best[1] - best[0]) best = piece;
    }
    cursor = Math.max(cursor, be);
    if (cursor >= hi) break;
  }
  if (cursor < hi) {
    const piece: [number, number] = [cursor, hi];
    if (!best || piece[1] - piece[0] > best[1] - best[0]) best = piece;
  }
  return best;
}

function consume(run: Run, t0: number, t1: number) {
  run.used.push([t0, t1]);
}

/** Group segments into direction clusters, merging the 0/PI seam. */
function directionClusters(segs: Seg[], angleTol: number): { theta: number; segs: Seg[] }[] {
  const withAngle = segs.map((s) => ({ s, t: angleOf(s), l: len(s) })).sort((p, q) => p.t - q.t);
  const clusters: { items: typeof withAngle; wsum: number; tsum: number }[] = [];
  for (const it of withAngle) {
    const last = clusters[clusters.length - 1];
    if (last && angleGap(last.tsum / last.wsum, it.t) <= angleTol) {
      last.items.push(it);
      last.wsum += it.l;
      last.tsum += it.t * it.l;
    } else {
      clusters.push({ items: [it], wsum: it.l || 1e-6, tsum: it.t * (it.l || 1e-6) });
    }
  }
  // A wall at ~179.5 degrees and one at ~0.5 are the same direction.
  if (clusters.length > 1) {
    const first = clusters[0];
    const last = clusters[clusters.length - 1];
    if (angleGap(first.tsum / first.wsum, last.tsum / last.wsum) <= angleTol) {
      first.items.push(...last.items);
      first.wsum += last.wsum;
      // Fold the wrapped angle back before averaging, or the mean lands at PI/2.
      first.tsum += last.tsum - Math.PI * last.wsum;
      clusters.pop();
    }
  }
  return clusters.map((c) => ({ theta: c.tsum / c.wsum, segs: c.items.map((i) => i.s) }));
}

/**
 * Collapse wall faces into centrelines. Input and output are in the same units;
 * the thickness bounds are interpreted in those units too (cm by default).
 */
export function wallCentrelines(segs: Seg[], options: Partial<CentrelineOptions> = {}): Centreline[] {
  const o = { ...DEFAULT_CENTRELINE_OPTIONS, ...options };
  const usable = segs.filter((s) => len(s) >= 1 && Number.isFinite(s.a.x) && Number.isFinite(s.b.y));
  if (usable.length === 0) return [];

  const out: Centreline[] = [];

  for (const cluster of directionClusters(usable, o.angleTol)) {
    const ux = Math.cos(cluster.theta);
    const uy = Math.sin(cluster.theta);
    const nx = -uy;
    const ny = ux;
    const toWorld = (t: number, off: number): Point => ({ x: ux * t + nx * off, y: uy * t + ny * off });

    // Project every segment onto (along, across) and gather runs per line.
    const projected = cluster.segs.map((s) => {
      const ta = s.a.x * ux + s.a.y * uy;
      const tb = s.b.x * ux + s.b.y * uy;
      const off = ((s.a.x + s.b.x) / 2) * nx + ((s.a.y + s.b.y) / 2) * ny;
      return { off, t0: Math.min(ta, tb), t1: Math.max(ta, tb) };
    }).sort((p, q) => p.off - q.off);

    // Lines: segments sharing a perpendicular position.
    const lines: { off: number; parts: { t0: number; t1: number }[] }[] = [];
    for (const p of projected) {
      const last = lines[lines.length - 1];
      if (last && Math.abs(last.off - p.off) <= o.offsetTol) {
        last.parts.push({ t0: p.t0, t1: p.t1 });
      } else {
        lines.push({ off: p.off, parts: [{ t0: p.t0, t1: p.t1 }] });
      }
    }

    // Merge each line's parts into maximal runs, bridging opening-sized gaps.
    const runs: Run[] = [];
    for (const line of lines) {
      line.parts.sort((p, q) => p.t0 - q.t0);
      let cur = { ...line.parts[0] };
      let gaps: [number, number][] = [];
      for (let i = 1; i < line.parts.length; i++) {
        const p = line.parts[i];
        if (p.t0 - cur.t1 <= o.gapTol) {
          // Bridged: remember where the face was interrupted.
          if (p.t0 > cur.t1) gaps.push([cur.t1, p.t0]);
          cur.t1 = Math.max(cur.t1, p.t1);
        } else {
          runs.push({ offset: line.off, t0: cur.t0, t1: cur.t1, gaps, used: [] });
          cur = { ...p };
          gaps = [];
        }
      }
      runs.push({ offset: line.off, t0: cur.t0, t1: cur.t1, gaps, used: [] });
    }

    // Candidate face pairs: parallel, a wall-thickness apart, overlapping.
    type Cand = { i: number; j: number; overlap: number };
    const cands: Cand[] = [];
    for (let i = 0; i < runs.length; i++) {
      for (let j = i + 1; j < runs.length; j++) {
        const gap = Math.abs(runs[j].offset - runs[i].offset);
        if (gap < o.minThickness || gap > o.maxThickness) continue;
        const lo = Math.max(runs[i].t0, runs[j].t0);
        const hi = Math.min(runs[i].t1, runs[j].t1);
        if (hi - lo < o.minLength) continue;
        cands.push({ i, j, overlap: hi - lo });
      }
    }
    // Longest overlaps first: the most confident pairings claim their faces
    // before ambiguous ones get a chance.
    cands.sort((p, q) => q.overlap - p.overlap);

    for (const c of cands) {
      const A = runs[c.i];
      const B = runs[c.j];
      const lo = Math.max(A.t0, B.t0);
      const hi = Math.min(A.t1, B.t1);
      const fa = freeOverlap(A, lo, hi);
      if (!fa) continue;
      const fb = freeOverlap(B, fa[0], fa[1]);
      if (!fb) continue;
      const [t0, t1] = fb;
      if (t1 - t0 < o.minLength) continue;
      consume(A, t0, t1);
      consume(B, t0, t1);
      const thick = Math.abs(B.offset - A.offset);

      // Run the centreline out to the OUTER face at each end.
      //
      // At a corner the two faces of a wall do not end together: the outer face
      // carries on past the junction while the inner one stops at the internal
      // corner, so their overlap is short of the true corner by the crossing
      // wall's thickness. Truncating there leaves every corner open by a few
      // centimetres and room detection — which needs closed loops — finds
      // nothing. Only extend by up to a wall thickness, so a face that is
      // genuinely much longer (one long face shared by several walls) does not
      // drag the centreline past where the wall really ends.
      const reach = o.maxThickness;
      const outerLo = Math.min(A.t0, B.t0);
      const outerHi = Math.max(A.t1, B.t1);
      const e0 = t0 - outerLo <= reach ? outerLo : t0;
      const e1 = outerHi - t1 <= reach ? outerHi : t1;

      // A real opening pierces BOTH faces at the same place. A break in only
      // one face is something else — a wall meeting this one, a change of
      // material, a drafting artefact — so intersecting the two faces' gaps is
      // what separates genuine holes from noise.
      const span = e1 - e0;
      const gaps: { offset: number; width: number }[] = [];
      if (span > 0) {
        for (const [ga0, ga1] of A.gaps) {
          for (const [gb0, gb1] of B.gaps) {
            const lo = Math.max(ga0, gb0, e0);
            const hi = Math.min(ga1, gb1, e1);
            const w = hi - lo;
            if (w < o.minOpening || w > o.maxOpening) continue;
            gaps.push({ offset: ((lo + hi) / 2 - e0) / span, width: w });
          }
        }
      }
      gaps.sort((p, q) => p.offset - q.offset);

      const mid = (A.offset + B.offset) / 2;
      out.push({
        a: toWorld(e0, mid),
        b: toWorld(e1, mid),
        thickness: thick,
        paired: true,
        gaps,
      });
    }

    // Anything left over is either a wall drawn as a single line or clutter.
    // Length is the only signal available, so keep only the long ones.
    for (const run of runs) {
      const free = freeOverlap(run, run.t0, run.t1);
      if (!free) continue;
      if (free[1] - free[0] < o.keepUnpairedOver) continue;
      out.push({
        a: toWorld(free[0], run.offset),
        b: toWorld(free[1], run.offset),
        thickness: 0,
        paired: false,
        gaps: [],
      });
    }
  }

  return out;
}
