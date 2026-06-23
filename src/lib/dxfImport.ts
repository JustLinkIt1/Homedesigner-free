import DxfParser from 'dxf-parser';
import type { Point, Wall } from '../types';
import { boundsOf, dist, uid } from './geometry';

interface RawSegment {
  a: Point;
  b: Point;
}

/** Pull straight segments out of LINE / (LW)POLYLINE entities. */
function extractSegments(dxf: any): RawSegment[] {
  const segs: RawSegment[] = [];
  const entities = dxf?.entities ?? [];
  for (const e of entities) {
    const type = e.type;
    if (type === 'LINE' && e.vertices?.length >= 2) {
      const [a, b] = e.vertices;
      segs.push({ a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y } });
    } else if ((type === 'LWPOLYLINE' || type === 'POLYLINE') && e.vertices?.length >= 2) {
      const vs: Point[] = e.vertices.map((v: any) => ({ x: v.x, y: v.y }));
      for (let i = 0; i < vs.length - 1; i++) segs.push({ a: vs[i], b: vs[i + 1] });
      if (e.shape || e.closed) segs.push({ a: vs[vs.length - 1], b: vs[0] });
    }
  }
  return segs;
}

/**
 * Guess a unit scale (cm per drawing unit) from the drawing's overall size.
 * A typical home spans ~5–30 m. We pick the multiplier that lands the larger
 * dimension in a sane range.
 */
function guessUnitScale(segs: RawSegment[]): number {
  const pts = segs.flatMap((s) => [s.a, s.b]);
  if (pts.length === 0) return 1;
  const { min, max } = boundsOf(pts);
  const span = Math.max(max.x - min.x, max.y - min.y);
  if (span === 0) return 1;
  // Candidate interpretations of one drawing unit, expressed in cm.
  const candidates = [0.1 /*mm*/, 1 /*cm*/, 100 /*m*/, 2.54 /*in*/, 30.48 /*ft*/];
  // Target: largest dimension ~ 1500 cm (15 m).
  let best = 1;
  let bestErr = Infinity;
  for (const c of candidates) {
    const cm = span * c;
    const err = Math.abs(Math.log(cm / 1500));
    if (err < bestErr) {
      bestErr = err;
      best = c;
    }
  }
  return best;
}

export interface DxfImportResult {
  walls: Wall[];
  unitScale: number;
  segmentCount: number;
}

export function importDxf(
  text: string,
  opts: { wallHeight: number; wallThickness: number; unitScale?: number; minLen?: number },
): DxfImportResult {
  const parser = new DxfParser();
  const dxf = parser.parseSync(text);
  const segs = extractSegments(dxf);
  const unitScale = opts.unitScale ?? guessUnitScale(segs);
  const minLen = opts.minLen ?? 20; // cm — drop tiny fragments
  const pts = segs.flatMap((s) => [s.a, s.b]);
  const { min } = pts.length ? boundsOf(pts) : { min: { x: 0, y: 0 } };

  const walls: Wall[] = [];
  for (const s of segs) {
    // Translate to origin and scale to cm. DXF Y is up; our plan Y is down.
    const a: Point = { x: (s.a.x - min.x) * unitScale, y: -(s.a.y - min.y) * unitScale };
    const b: Point = { x: (s.b.x - min.x) * unitScale, y: -(s.b.y - min.y) * unitScale };
    if (dist(a, b) < minLen) continue;
    walls.push({
      id: uid(),
      start: a,
      end: b,
      thickness: opts.wallThickness,
      height: opts.wallHeight,
      color: '#d7dade',
    });
  }
  return { walls, unitScale, segmentCount: segs.length };
}
