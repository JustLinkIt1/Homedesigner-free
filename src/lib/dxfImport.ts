import DxfParser from 'dxf-parser';
import type { Point, Wall } from '../types';
import { boundsOf, dist, uid } from './geometry';
import { classifyLayer, isDemolished, storeyOf, type LayerKind } from './dxfLayers';

interface RawSegment {
  a: Point;
  b: Point;
  layer: string;
  kind: LayerKind;
  /** Storey index from the layer name, or null when it encodes none. */
  storey: number | null;
  demolished: boolean;
}

/** Pull straight segments out of LINE / (LW)POLYLINE entities. */
function extractSegments(dxf: any): RawSegment[] {
  const segs: RawSegment[] = [];
  const entities = dxf?.entities ?? [];
  const cache = new Map<string, { kind: LayerKind; storey: number | null; demolished: boolean }>();
  const meta = (layer: string) => {
    let m = cache.get(layer);
    if (!m) {
      m = { kind: classifyLayer(layer), storey: storeyOf(layer), demolished: isDemolished(layer) };
      cache.set(layer, m);
    }
    return m;
  };
  for (const e of entities) {
    const type = e.type;
    const layer = typeof e.layer === 'string' ? e.layer : '';
    const m = meta(layer);
    const push = (a: Point, b: Point) => segs.push({ a, b, layer, ...m });
    if (type === 'LINE' && e.vertices?.length >= 2) {
      const [a, b] = e.vertices;
      push({ x: a.x, y: a.y }, { x: b.x, y: b.y });
    } else if ((type === 'LWPOLYLINE' || type === 'POLYLINE') && e.vertices?.length >= 2) {
      const vs: Point[] = e.vertices.map((v: any) => ({ x: v.x, y: v.y }));
      for (let i = 0; i < vs.length - 1; i++) push(vs[i], vs[i + 1]);
      if (e.shape || e.closed) push(vs[vs.length - 1], vs[0]);
    }
  }
  return segs;
}

/** cm per drawing unit for each $INSUNITS code we can act on. */
const INSUNITS_CM: Record<number, number> = {
  1: 2.54, // inches
  2: 30.48, // feet
  4: 0.1, // millimetres
  5: 1, // centimetres
  6: 100, // metres
  9: 0.01, // microns... vanishingly rare, but harmless
  10: 91.44, // yards
};

/**
 * Unit scale straight from the drawing's own header. Guessing from the overall
 * span is unreliable on architects' files, where model space also holds the
 * title block, elevations and every storey side by side — one file measured
 * 206 m across for a 7 m house.
 */
function headerUnitScale(dxf: any): number | null {
  const code = dxf?.header?.$INSUNITS;
  return typeof code === 'number' ? INSUNITS_CM[code] ?? null : null;
}

/**
 * Extent of the drawing ignoring outliers.
 *
 * Model space in a real CAD file is not just the building: there is a title
 * block, a north arrow, sometimes a stray entity left thousands of units away.
 * One file measured here had a single entity 30 km from the origin, and another
 * put its title block 174 m from the plan. Both wreck a min/max extent, and the
 * extent is what the unit-scale guess and the import origin depend on — so take
 * percentiles instead.
 */
function robustExtent(segs: RawSegment[]): { min: Point; max: Point; span: number } | null {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const s of segs) {
    for (const p of [s.a, s.b]) {
      if (Number.isFinite(p.x) && Number.isFinite(p.y)) {
        xs.push(p.x);
        ys.push(p.y);
      }
    }
  }
  if (xs.length < 4) return null;
  xs.sort((a, b) => a - b);
  ys.sort((a, b) => a - b);
  const q = (arr: number[], f: number) => arr[Math.min(arr.length - 1, Math.max(0, Math.floor(arr.length * f)))];
  const min = { x: q(xs, 0.02), y: q(ys, 0.02) };
  const max = { x: q(xs, 0.98), y: q(ys, 0.98) };
  return { min, max, span: Math.max(max.x - min.x, max.y - min.y) };
}

/** A home is metres-to-tens-of-metres across; anything else means the scale is wrong. */
const PLAUSIBLE_SPAN_CM = { min: 250, max: 30000 };

/**
 * Guess a unit scale (cm per drawing unit) from the drawing's overall size.
 * A typical home spans ~5–30 m. We pick the multiplier that lands the larger
 * dimension in a sane range.
 */
function guessUnitScale(segs: RawSegment[]): number {
  const ext = robustExtent(segs);
  if (!ext) return 1;
  const span = ext.span;
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

/** One storey recovered from the drawing's layer names. */
export interface DxfStorey {
  /** Index from the layer prefix (0 = ground) — or 0 when the file has none. */
  index: number;
  walls: Wall[];
}

export interface DxfImportResult {
  walls: Wall[];
  unitScale: number;
  segmentCount: number;
  /** Storeys found in the drawing. Always at least one. */
  storeys: DxfStorey[];
  /** How many segments each layer kind contributed, for the import summary. */
  kindCounts: Partial<Record<LayerKind, number>>;
  /** True when layer names were understood and used to pick out the walls. */
  layerAware: boolean;
  /** Segments dropped because their layer is demolition work. */
  demolishedDropped: number;
}

export function importDxf(
  text: string,
  opts: {
    wallHeight: number;
    wallThickness: number;
    unitScale?: number;
    minLen?: number;
    /** Import demolition layers too (default false). */
    includeDemolished?: boolean;
    /** Restrict to one storey index; omit for all. */
    storey?: number;
  },
): DxfImportResult {
  const parser = new DxfParser();
  const dxf = parser.parseSync(text);
  const all = extractSegments(dxf);

  const kindCounts: Partial<Record<LayerKind, number>> = {};
  for (const s of all) kindCounts[s.kind] = (kindCounts[s.kind] ?? 0) + 1;

  // Prefer layers that actually say "wall". Only when the drawing names no wall
  // layer at all do we fall back to using every line, which is what this
  // importer did before it could read layers.
  const layerAware = (kindCounts.wall ?? 0) >= 8;
  const wanted = (s: RawSegment) => (layerAware ? s.kind === 'wall' : s.kind !== 'dimension' && s.kind !== 'annotation');

  let segs = all.filter(wanted);
  const beforeDemo = segs.length;
  if (!opts.includeDemolished) segs = segs.filter((s) => !s.demolished);
  const demolishedDropped = beforeDemo - segs.length;
  if (opts.storey !== undefined) segs = segs.filter((s) => (s.storey ?? 0) === opts.storey);

  // Drop far-flung strays (title blocks, a stray entity 30 km out) so they
  // cannot drag the origin or the scale estimate with them.
  const gross = robustExtent(segs.length ? segs : all);
  if (gross) {
    const padX = Math.max(1, (gross.max.x - gross.min.x)) * 0.6;
    const padY = Math.max(1, (gross.max.y - gross.min.y)) * 0.6;
    const inside = (p: Point) =>
      p.x >= gross.min.x - padX && p.x <= gross.max.x + padX &&
      p.y >= gross.min.y - padY && p.y <= gross.max.y + padY;
    segs = segs.filter((s) => inside(s.a) && inside(s.b));
  }

  // Scale: prefer the drawing's own $INSUNITS header, but verify it. Headers are
  // routinely wrong — one file here declared centimetres for a drawing plainly
  // authored in metres, which would have imported an 18 m house as 18 cm and
  // dropped every wall as sub-minimum-length. So the header only wins if it puts
  // the building at a believable size; otherwise fall back to the span guess.
  const ext = robustExtent(segs.length ? segs : all);
  const header = headerUnitScale(dxf);
  const headerOk =
    header !== null && ext !== null &&
    ext.span * header >= PLAUSIBLE_SPAN_CM.min && ext.span * header <= PLAUSIBLE_SPAN_CM.max;
  const unitScale = opts.unitScale ?? (headerOk ? (header as number) : guessUnitScale(segs.length ? segs : all));
  const minLen = opts.minLen ?? 20; // cm — drop tiny fragments

  // Origin from the KEPT geometry, so a distant title block no longer pushes
  // the building thousands of units away from the origin.
  const pts = segs.flatMap((s) => [s.a, s.b]);
  const { min } = pts.length ? boundsOf(pts) : { min: { x: 0, y: 0 } };

  const toWall = (s: RawSegment): Wall | null => {
    // Translate to origin and scale to cm. DXF Y is up; our plan Y is down.
    const a: Point = { x: (s.a.x - min.x) * unitScale, y: -(s.a.y - min.y) * unitScale };
    const b: Point = { x: (s.b.x - min.x) * unitScale, y: -(s.b.y - min.y) * unitScale };
    // Reject malformed (non-finite) coordinates from a corrupt DXF.
    if (![a.x, a.y, b.x, b.y].every(Number.isFinite)) return null;
    if (dist(a, b) < minLen) return null;
    return {
      id: uid(),
      start: a,
      end: b,
      thickness: opts.wallThickness,
      height: opts.wallHeight,
      color: '#ece6db',
    };
  };

  const byStorey = new Map<number, Wall[]>();
  const walls: Wall[] = [];
  for (const s of segs) {
    const w = toWall(s);
    if (!w) continue;
    walls.push(w);
    const idx = s.storey ?? 0;
    const list = byStorey.get(idx) ?? [];
    list.push(w);
    byStorey.set(idx, list);
  }

  const storeys: DxfStorey[] = [...byStorey.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([index, ws]) => ({ index, walls: ws }));

  // Architects lay the storeys out SIDE BY SIDE in model space, but a building
  // stacks them. Bring each storey back to a common origin by its own bounding
  // box, which for a terraced or party-wall house lines the shell up exactly.
  // (Skipped for a single storey, where the shared origin above is already right.)
  if (storeys.length > 1) {
    for (const st of storeys) {
      const b = boundsOf(st.walls.flatMap((w) => [w.start, w.end]));
      const dx = b.min.x;
      const dy = b.min.y;
      if (!Number.isFinite(dx) || !Number.isFinite(dy)) continue;
      for (const w of st.walls) {
        w.start = { x: w.start.x - dx, y: w.start.y - dy };
        w.end = { x: w.end.x - dx, y: w.end.y - dy };
      }
    }
  }

  return {
    walls,
    unitScale,
    segmentCount: segs.length,
    storeys: storeys.length ? storeys : [{ index: 0, walls }],
    kindCounts,
    layerAware,
    demolishedDropped,
  };
}
