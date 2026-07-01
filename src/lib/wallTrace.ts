// Robust wall tracing for real architectural plans.
//
// The first-generation tracer only found axis-aligned dark bands, so it failed
// on the two things real plans always have: walls drawn at a slight angle
// (skewed / tapered footprints) and lots of thin furniture / hatching / text
// that looks like ink. This version fixes both:
//
//   1. Binarize (Otsu auto-threshold) — handles black OR grey walls.
//   2. Distance transform → keep only THICK ink. Walls are thick strokes;
//      furniture outlines, dimension lines, tile hatching, stairs and door
//      arcs are thin, so a thickness floor removes them cleanly.
//   3. Hough transform → detect straight wall segments at ANY angle.
//
// Output is the same PixelSegment[] the wall builder already consumes (it can
// already merge + corner-snap arbitrary-angle segments).

import type { PixelSegment } from './autoTrace';
import { autoThreshold } from './autoTrace';

export interface TraceConfig {
  /** Luminance threshold 0..255; pixels darker than this are ink. */
  threshold: number;
  /** Minimum wall length in source px. */
  minLength: number;
  /** Minimum wall HALF-thickness in source px (rejects thin furniture/lines).
   *  Lower this for plans that draw exterior walls as a thin single stroke. */
  minHalfThickness: number;
  /** Largest processed dimension; the image is downscaled to this. */
  maxDim: number;
}

export const DEFAULT_CONFIG: TraceConfig = {
  threshold: 150,
  minLength: 40,
  minHalfThickness: 2.5,
  maxDim: 1000,
};

interface Bin {
  data: Uint8Array; // 1 = ink
  w: number;
  h: number;
  scale: number; // source px per processed px
}

function binarize(img: ImageData, threshold: number, maxDim: number): Bin {
  const scale = Math.max(1, Math.max(img.width, img.height) / maxDim);
  const w = Math.round(img.width / scale);
  const h = Math.round(img.height / scale);
  const data = new Uint8Array(w * h);
  const src = img.data;
  for (let y = 0; y < h; y++) {
    const sy = Math.min(img.height - 1, Math.floor(y * scale));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(img.width - 1, Math.floor(x * scale));
      const i = (sy * img.width + sx) * 4;
      const a = src[i + 3];
      const lum = a < 10 ? 255 : 0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2];
      data[y * w + x] = lum < threshold ? 1 : 0;
    }
  }
  return { data, w, h, scale };
}

/**
 * Chamfer (3,4) distance transform: distance from each ink pixel to the nearest
 * background pixel, in units of ~3 per orthogonal step. Returns a Float array.
 */
function distanceTransform(bin: Bin): Float32Array {
  const { data, w, h } = bin;
  const INF = 1e9;
  const d = new Float32Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = data[i] ? INF : 0;
  // forward pass
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (d[i] === 0) continue;
      let m = d[i];
      if (x > 0) m = Math.min(m, d[i - 1] + 3);
      if (y > 0) m = Math.min(m, d[i - w] + 3);
      if (x > 0 && y > 0) m = Math.min(m, d[i - w - 1] + 4);
      if (x < w - 1 && y > 0) m = Math.min(m, d[i - w + 1] + 4);
      d[i] = m;
    }
  }
  // backward pass
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (d[i] === 0) continue;
      let m = d[i];
      if (x < w - 1) m = Math.min(m, d[i + 1] + 3);
      if (y < h - 1) m = Math.min(m, d[i + w] + 3);
      if (x < w - 1 && y < h - 1) m = Math.min(m, d[i + w + 1] + 4);
      if (x > 0 && y < h - 1) m = Math.min(m, d[i + w - 1] + 4);
      d[i] = m;
    }
  }
  return d;
}

/** Ink pixels whose stroke is at least `minHalf` px thick (the wall body). */
function thickMask(bin: Bin, dist: Float32Array, minHalf: number): Uint8Array {
  const out = new Uint8Array(bin.w * bin.h);
  const floor = minHalf * 3; // chamfer units
  for (let i = 0; i < out.length; i++) out[i] = dist[i] >= floor ? 1 : 0;
  return out;
}

/**
 * Hough line-segment detection. Votes every mask pixel into a (theta, rho)
 * accumulator, finds peak lines, then for each peak gathers the mask pixels on
 * that line and splits them into segments (allowing small gaps). Pixels are
 * consumed as segments are taken so near-duplicate peaks don't re-detect the
 * same wall.
 */
function houghSegments(
  mask: Uint8Array,
  w: number,
  h: number,
  scale: number,
  cfg: TraceConfig,
): PixelSegment[] {
  const pts: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x]) {
        pts.push(x, y);
      }
    }
  }
  if (pts.length === 0) return [];

  const numTheta = 180;
  const cosT = new Float32Array(numTheta);
  const sinT = new Float32Array(numTheta);
  for (let t = 0; t < numTheta; t++) {
    const a = (t * Math.PI) / numTheta;
    cosT[t] = Math.cos(a);
    sinT[t] = Math.sin(a);
  }
  const rhoMax = Math.ceil(Math.hypot(w, h));
  const rhoBins = 2 * rhoMax + 1;
  const acc = new Int32Array(numTheta * rhoBins);
  for (let p = 0; p < pts.length; p += 2) {
    const x = pts[p];
    const y = pts[p + 1];
    for (let t = 0; t < numTheta; t++) {
      const rho = Math.round(x * cosT[t] + y * sinT[t]) + rhoMax;
      acc[t * rhoBins + rho]++;
    }
  }

  // Candidate peaks: locally-maximal accumulator cells above a vote floor.
  const minVotes = Math.max(12, cfg.minLength / scale / 1.4);
  const peaks: { t: number; rho: number; v: number }[] = [];
  const tWin = 2;
  const rWin = 8;
  for (let t = 0; t < numTheta; t++) {
    for (let r = 0; r < rhoBins; r++) {
      const v = acc[t * rhoBins + r];
      if (v < minVotes) continue;
      let isMax = true;
      for (let dt = -tWin; dt <= tWin && isMax; dt++) {
        const tt = (t + dt + numTheta) % numTheta;
        for (let dr = -rWin; dr <= rWin; dr++) {
          const rr = r + dr;
          if (rr < 0 || rr >= rhoBins) continue;
          if (acc[tt * rhoBins + rr] > v) {
            isMax = false;
            break;
          }
        }
      }
      if (isMax) peaks.push({ t, rho: r - rhoMax, v });
    }
  }
  peaks.sort((a, b) => b.v - a.v);

  // Consume pixels as segments are extracted.
  const consumed = new Uint8Array(w * h);
  const idx = (x: number, y: number) => y * w + x;
  const minLenPx = cfg.minLength / scale;
  const maxGap = Math.max(6, minLenPx * 0.35);
  const tol = 1.6; // perpendicular distance to count a pixel on the line
  const segments: PixelSegment[] = [];

  for (const pk of peaks) {
    if (segments.length > 400) break;
    const ct = cosT[pk.t];
    const st = sinT[pk.t];
    // Line direction (perpendicular to the (ct,st) normal).
    const dx = -st;
    const dy = ct;
    // Gather on-line, not-yet-consumed pixels, keyed by their position along dir.
    const onLine: { s: number; x: number; y: number }[] = [];
    for (let p = 0; p < pts.length; p += 2) {
      const x = pts[p];
      const y = pts[p + 1];
      if (consumed[idx(x, y)]) continue;
      if (Math.abs(x * ct + y * st - pk.rho) <= tol) {
        onLine.push({ s: x * dx + y * dy, x, y });
      }
    }
    if (onLine.length < minLenPx * 0.5) continue;
    onLine.sort((a, b) => a.s - b.s);
    // Split into runs separated by gaps larger than maxGap.
    let runStart = 0;
    const flushRun = (a: number, b: number) => {
      const first = onLine[a];
      const last = onLine[b];
      const len = Math.hypot(last.x - first.x, last.y - first.y);
      if (len < minLenPx) return;
      for (let k = a; k <= b; k++) consumed[idx(onLine[k].x, onLine[k].y)] = 1;
      segments.push({
        x1: first.x * scale,
        y1: first.y * scale,
        x2: last.x * scale,
        y2: last.y * scale,
        thickness: Math.max(4, cfg.minHalfThickness * 2 * scale),
      });
    };
    for (let k = 1; k < onLine.length; k++) {
      if (onLine[k].s - onLine[k - 1].s > maxGap) {
        flushRun(runStart, k - 1);
        runStart = k;
      }
    }
    flushRun(runStart, onLine.length - 1);
  }

  return segments;
}

interface Seg2 {
  x1: number; y1: number; x2: number; y2: number; thickness: number;
}

const segLen = (s: Seg2) => Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
/** Angle of a segment in [0, π) (undirected). */
function segAngle(s: Seg2): number {
  let a = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
  if (a < 0) a += Math.PI;
  if (a >= Math.PI) a -= Math.PI;
  return a;
}
function angleDiff(a: number, b: number): number {
  let d = Math.abs(a - b);
  if (d > Math.PI / 2) d = Math.PI - d;
  return d;
}

/**
 * Collapse the many fragments Hough produces (both edges of a wall, broken
 * runs) into one clean centreline per wall: cluster segments that are nearly
 * parallel, close perpendicular (within ~a wall thickness) and overlapping
 * along their shared direction, then refit each cluster to a single segment.
 */
function mergeColinear(segs: Seg2[], angleTol: number, perpTol: number, gapTol: number): Seg2[] {
  const used = new Array(segs.length).fill(false);
  // Longest first so clusters seed on the strongest evidence.
  const order = segs.map((_, i) => i).sort((a, b) => segLen(segs[b]) - segLen(segs[a]));
  const out: Seg2[] = [];

  for (const i of order) {
    if (used[i]) continue;
    used[i] = true;
    const base = segs[i];
    const ang = segAngle(base);
    const dx = Math.cos(ang);
    const dy = Math.sin(ang);
    // Normal of the base line, and its offset, used to test perpendicular gap.
    const nx = -dy;
    const ny = dx;
    const baseOff = base.x1 * nx + base.y1 * ny;
    const cluster = [base];

    // Project a point onto the base direction.
    const proj = (x: number, y: number) => x * dx + y * dy;
    let lo = Math.min(proj(base.x1, base.y1), proj(base.x2, base.y2));
    let hi = Math.max(proj(base.x1, base.y1), proj(base.x2, base.y2));
    // Member spans along the line, to measure how much of the final segment is
    // actually backed by ink (vs bridged across empty space).
    const spans: [number, number][] = [[lo, hi]];

    let grew = true;
    while (grew) {
      grew = false;
      for (const j of order) {
        if (used[j]) continue;
        const s = segs[j];
        if (angleDiff(ang, segAngle(s)) > angleTol) continue;
        // perpendicular distance of both endpoints to the base line
        const o1 = s.x1 * nx + s.y1 * ny - baseOff;
        const o2 = s.x2 * nx + s.y2 * ny - baseOff;
        if (Math.abs((o1 + o2) / 2) > perpTol) continue;
        const p1 = proj(s.x1, s.y1);
        const p2 = proj(s.x2, s.y2);
        const slo = Math.min(p1, p2);
        const shi = Math.max(p1, p2);
        // overlapping or within gapTol along the line
        if (shi < lo - gapTol || slo > hi + gapTol) continue;
        used[j] = true;
        cluster.push(s);
        spans.push([slo, shi]);
        lo = Math.min(lo, slo);
        hi = Math.max(hi, shi);
        grew = true;
      }
    }

    // Coverage: union of member spans vs the full extent. A real wall is mostly
    // covered; a line bridged across empty space (a false merge of far, aligned
    // fragments) is not — drop those.
    spans.sort((a, b) => a[0] - b[0]);
    let covered = 0;
    let cs = spans[0][0];
    let ce = spans[0][1];
    for (let k = 1; k < spans.length; k++) {
      if (spans[k][0] <= ce) ce = Math.max(ce, spans[k][1]);
      else {
        covered += ce - cs;
        [cs, ce] = spans[k];
      }
    }
    covered += ce - cs;
    if (hi - lo > 1 && covered / (hi - lo) < 0.5) continue;

    // Refit: centreline = average perpendicular offset, extent = [lo, hi].
    let offSum = 0;
    let wSum = 0;
    let thick = 0;
    for (const s of cluster) {
      const w = segLen(s) || 1;
      const o = ((s.x1 * nx + s.y1 * ny) + (s.x2 * nx + s.y2 * ny)) / 2;
      offSum += o * w;
      wSum += w;
      thick = Math.max(thick, s.thickness);
    }
    const off = offSum / wSum;
    // A point on the centreline: base point shifted to the averaged offset.
    const cx = base.x1 + nx * (off - baseOff);
    const cy = base.y1 + ny * (off - baseOff);
    const originProj = proj(cx, cy);
    out.push({
      x1: cx + dx * (lo - originProj),
      y1: cy + dy * (lo - originProj),
      x2: cx + dx * (hi - originProj),
      y2: cy + dy * (hi - originProj),
      thickness: thick,
    });
  }
  return out;
}

/** Perpendicular distance from a point to a segment (clamped to its extent). */
function pointToSeg(px: number, py: number, s: Seg2): number {
  const dx = s.x2 - s.x1;
  const dy = s.y2 - s.y1;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-6) return Math.hypot(px - s.x1, py - s.y1);
  let t = ((px - s.x1) * dx + (py - s.y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (s.x1 + t * dx), py - (s.y1 + t * dy));
}

/**
 * Keep the main wall network and discard small disconnected islands. Walls form
 * one big connected component (perimeter + interior all meet); furniture, label
 * text and stray dimension marks form their own little clusters that don't touch
 * the walls. Group segments by touch, then keep the component with the most
 * total length, plus any individually long segment (a lone long wall).
 */
function networkCleanup(segs: Seg2[], tol: number, keepLong: number): Seg2[] {
  const n = segs.length;
  if (n === 0) return segs;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (a: number): number => {
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]];
      a = parent[a];
    }
    return a;
  };
  const touch = (a: Seg2, b: Seg2): boolean =>
    pointToSeg(a.x1, a.y1, b) <= tol ||
    pointToSeg(a.x2, a.y2, b) <= tol ||
    pointToSeg(b.x1, b.y1, a) <= tol ||
    pointToSeg(b.x2, b.y2, a) <= tol;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (find(i) !== find(j) && touch(segs[i], segs[j])) parent[find(i)] = find(j);
    }
  }
  // Total length per component; pick the heaviest as the wall network.
  const lenByRoot = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    lenByRoot.set(r, (lenByRoot.get(r) ?? 0) + segLen(segs[i]));
  }
  let bestRoot = -1;
  let bestLen = -1;
  for (const [r, l] of lenByRoot) {
    if (l > bestLen) {
      bestLen = l;
      bestRoot = r;
    }
  }
  return segs.filter((s, i) => find(i) === bestRoot || segLen(s) >= keepLong);
}

/**
 * Run the pipeline and return every intermediate stage (not just the final
 * result) — useful for diagnosing why a specific wall on a hard plan didn't
 * survive tracing (which stage dropped it).
 */
export function traceWallsStages(img: ImageData, options: Partial<TraceConfig> = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...options };
  const bin = binarize(img, cfg.threshold, cfg.maxDim);
  const dist = distanceTransform(bin);
  // minHalfThickness is specified in source px; convert to the downscaled
  // processed-px units the distance transform works in.
  const mask = thickMask(bin, dist, cfg.minHalfThickness / bin.scale);
  const raw = houghSegments(mask, bin.w, bin.h, bin.scale, cfg);
  // Merge fragments/edges into clean centrelines. perpTol must be wide enough to
  // fuse the two faces of a thick wall, but below the spacing of parallel walls;
  // gapTol bridges door/window breaks along a wall — real plans interrupt the
  // wall's ink at every opening, and doors/patio windows commonly span
  // 70-200cm, so this needs to be generous (still far below a room's size).
  const angleTol = (10 * Math.PI) / 180;
  const perpTol = Math.max(14, 13 * bin.scale);
  const gapTol = Math.max(cfg.minLength, 70 * bin.scale);
  const merged1 = mergeColinear(raw, angleTol, perpTol, gapTol);
  const merged2 = mergeColinear(merged1, angleTol, perpTol, gapTol);
  const lenFiltered = merged2.filter((s) => segLen(s) >= cfg.minLength);
  // Remove furniture / label / dimension leftovers: short + isolated strokes.
  const joinTol = Math.max(cfg.minLength * 0.8, 22 * bin.scale);
  const keepLong = cfg.minLength * 3;
  const final = networkCleanup(lenFiltered, joinTol, keepLong);
  return { cfg, bin, raw, merged1, merged2, lenFiltered, final };
}

/** Detect wall segments (any angle) in a raster plan. Coords in source px. */
export function traceWallsV2(img: ImageData, options: Partial<TraceConfig> = {}): PixelSegment[] {
  return traceWallsStages(img, options).final;
}

/** Auto-pick the threshold then trace. */
export function traceWallsAuto(img: ImageData, options: Partial<TraceConfig> = {}): PixelSegment[] {
  const threshold = options.threshold ?? autoThreshold(img);
  return traceWallsV2(img, { ...options, threshold });
}
