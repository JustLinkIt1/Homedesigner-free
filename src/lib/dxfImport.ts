import DxfParser from 'dxf-parser';
import type { Opening, Point, Wall } from '../types';
import { boundsOf, dist, uid } from './geometry';
import { classifyLayer, isDemolished, storeyOf, type LayerKind } from './dxfLayers';
import { wallCentrelines } from './wallCentrelines';
import { classifyOpening, symbolSpansOnWall, OPENING_DEFAULTS, type KindedSeg } from './dxfOpenings';
import { snapCorners } from './wallBuilder';

interface RawSegment {
  a: Point;
  b: Point;
  layer: string;
  kind: LayerKind;
  /** Storey index from the layer name, or null when it encodes none. */
  storey: number | null;
  demolished: boolean;
}

/** A 2D placement: rotation, scale and translation, as an INSERT applies it. */
interface Xform {
  cos: number;
  sin: number;
  sx: number;
  sy: number;
  tx: number;
  ty: number;
}
const IDENTITY: Xform = { cos: 1, sin: 0, sx: 1, sy: 1, tx: 0, ty: 0 };
const apply = (m: Xform, p: Point): Point => {
  const x = p.x * m.sx;
  const y = p.y * m.sy;
  return { x: m.cos * x - m.sin * y + m.tx, y: m.sin * x + m.cos * y + m.ty };
};
const compose = (outer: Xform, inner: Xform): Xform => {
  const o = apply(outer, { x: inner.tx, y: inner.ty });
  const ang = Math.atan2(outer.sin, outer.cos) + Math.atan2(inner.sin, inner.cos);
  return {
    cos: Math.cos(ang),
    sin: Math.sin(ang),
    sx: outer.sx * inner.sx,
    sy: outer.sy * inner.sy,
    tx: o.x,
    ty: o.y,
  };
};

/**
 * Pull straight segments out of a DXF's entities.
 *
 * Handles the four things architects' files actually contain:
 *  - LINE and (LW)POLYLINE, the obvious ones;
 *  - ARC, which is how door swings are drawn — dropping them left a door symbol
 *    as two isolated jamb strokes with nothing between, which is precisely what
 *    made the door symbols hard to group; and
 *  - INSERT, a reference to a reusable block. This one matters most: in a
 *    measured file every door and window was an INSERT on layers named `Doors`
 *    and `Windows`, so ignoring INSERT meant ignoring every opening in the
 *    drawing. Blocks are expanded in place, transformed by the insert's
 *    position, rotation and scale, so their contents flow through the rest of
 *    the importer as ordinary geometry — walls included, since some files put
 *    those in blocks too.
 */
function extractSegments(dxf: any): RawSegment[] {
  const segs: RawSegment[] = [];
  const cache = new Map<string, { kind: LayerKind; storey: number | null; demolished: boolean }>();
  const meta = (layer: string) => {
    let m = cache.get(layer);
    if (!m) {
      m = { kind: classifyLayer(layer), storey: storeyOf(layer), demolished: isDemolished(layer) };
      cache.set(layer, m);
    }
    return m;
  };

  const walk = (entities: any[], m: Xform, inheritedLayer: string, depth: number) => {
    if (!Array.isArray(entities) || depth > 6) return;
    for (const e of entities) {
      // Entities inside a block often sit on layer "0", meaning "whatever layer
      // the block was inserted on".
      const own = typeof e.layer === 'string' ? e.layer : '';
      const layer = !own || own === '0' ? inheritedLayer : own;
      const info = meta(layer);
      const push = (a: Point, b: Point) =>
        segs.push({ a: apply(m, a), b: apply(m, b), layer, ...info });

      switch (e.type) {
        case 'LINE':
          if (e.vertices?.length >= 2) push(e.vertices[0], e.vertices[1]);
          break;
        case 'LWPOLYLINE':
        case 'POLYLINE': {
          const vs: Point[] = (e.vertices ?? []).map((v: any) => ({ x: v.x, y: v.y }));
          for (let i = 0; i < vs.length - 1; i++) push(vs[i], vs[i + 1]);
          if ((e.shape || e.closed) && vs.length > 2) push(vs[vs.length - 1], vs[0]);
          break;
        }
        case 'ARC':
        case 'CIRCLE': {
          const c = e.center;
          const r = e.radius;
          if (!c || !(r > 0)) break;
          const full = e.type === 'CIRCLE';
          const a0 = full ? 0 : ((e.startAngle ?? 0));
          let a1 = full ? Math.PI * 2 : ((e.endAngle ?? 0));
          if (!full && a1 <= a0) a1 += Math.PI * 2;
          // ~8 degrees per step: enough for a door swing to read as a dense run.
          const steps = Math.max(3, Math.ceil(((a1 - a0) / Math.PI) * 22));
          let prev = { x: c.x + r * Math.cos(a0), y: c.y + r * Math.sin(a0) };
          for (let i = 1; i <= steps; i++) {
            const a = a0 + ((a1 - a0) * i) / steps;
            const cur = { x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) };
            push(prev, cur);
            prev = cur;
          }
          break;
        }
        case 'INSERT': {
          const block = dxf?.blocks?.[e.name];
          if (!block?.entities) break;
          const rot = ((e.rotation ?? 0) * Math.PI) / 180;
          const base = block.position ?? { x: 0, y: 0 };
          const sx = e.xScale ?? 1;
          const sy = e.yScale ?? 1;
          // Place the block: scale and rotate about its base point, then move to
          // the insertion point.
          const local: Xform = {
            cos: Math.cos(rot),
            sin: Math.sin(rot),
            sx,
            sy,
            tx: (e.position?.x ?? 0) - (base.x * sx * Math.cos(rot) - base.y * sy * Math.sin(rot)),
            ty: (e.position?.y ?? 0) - (base.x * sx * Math.sin(rot) + base.y * sy * Math.cos(rot)),
          };
          walk(block.entities, compose(m, local), layer, depth + 1);
          break;
        }
        default:
          break;
      }
    }
  };

  walk(dxf?.entities ?? [], IDENTITY, '', 0);
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
  /** Doors and windows cut into this storey's walls. */
  openings: Opening[];
}

export interface DxfImportResult {
  walls: Wall[];
  unitScale: number;
  segmentCount: number;
  /** Doors and windows across every storey. */
  openings: Opening[];
  /** Storeys found in the drawing. Always at least one. */
  storeys: DxfStorey[];
  /** How many segments each layer kind contributed, for the import summary. */
  kindCounts: Partial<Record<LayerKind, number>>;
  /** True when layer names were understood and used to pick out the walls. */
  layerAware: boolean;
  /** Segments dropped because their layer is demolition work. */
  demolishedDropped: number;
  /** Segments sitting on demolition layers, whether or not they were dropped. */
  demolishedCount: number;
}

export function importDxf(
  text: string,
  opts: {
    wallHeight: number;
    wallThickness: number;
    unitScale?: number;
    minLen?: number;
    /**
     * Leave out layers marked as demolition work, giving the PROPOSED state.
     * Off by default: those walls are existing fabric that is physically there,
     * and dropping them punches holes in the shell — on a measured file the
     * ground floor went from 4 rooms and a 69 m2 footprint down to 2 and 49 m2.
     */
    excludeDemolished?: boolean;
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
  if (opts.excludeDemolished) segs = segs.filter((s) => !s.demolished);
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

  // Translate to origin and scale to cm. DXF Y is up; our plan Y is down.
  const toPlan = (p: Point): Point => ({ x: (p.x - min.x) * unitScale, y: -(p.y - min.y) * unitScale });

  // Collapse wall FACES into centrelines, per storey. CAD draws each wall as a
  // closed outline; importing the faces directly doubles every wall and leaves
  // room detection walking the inside of wall rectangles instead of the rooms.
  // Done per storey so a face on one level can't pair with one on another.
  const segsByStorey = new Map<number, RawSegment[]>();
  for (const s of segs) {
    const idx = s.storey ?? 0;
    const list = segsByStorey.get(idx) ?? [];
    list.push(s);
    segsByStorey.set(idx, list);
  }

  // Door and window symbols, kept per storey so they can label that storey's
  // holes. These never become walls; they only say what each hole is.
  const symbolsByStorey = new Map<number, KindedSeg[]>();
  for (const s of all) {
    if (s.kind !== 'door' && s.kind !== 'window') continue;
    if (!opts.excludeDemolished || !s.demolished) {
      const idx = s.storey ?? 0;
      const list = symbolsByStorey.get(idx) ?? [];
      list.push({ a: toPlan(s.a), b: toPlan(s.b), kind: s.kind });
      symbolsByStorey.set(idx, list);
    }
  }

  const byStorey = new Map<number, { walls: Wall[]; openings: Opening[] }>();
  const walls: Wall[] = [];
  const openings: Opening[] = [];
  for (const [idx, list] of segsByStorey) {
    const planSegs = list
      .map((s) => ({ a: toPlan(s.a), b: toPlan(s.b) }))
      .filter((s) => [s.a.x, s.a.y, s.b.x, s.b.y].every(Number.isFinite));
    const centrelines = wallCentrelines(planSegs, { minLength: minLen });
    const symbols = symbolsByStorey.get(idx) ?? [];
    const made: Wall[] = [];
    const madeOpenings: Opening[] = [];
    for (const c of centrelines) {
      const wallLen = dist(c.a, c.b);
      if (wallLen < minLen) continue;
      const wall: Wall = {
        id: uid(),
        start: c.a,
        end: c.b,
        // A paired wall knows its own thickness; a single-line one does not.
        thickness: c.paired ? Math.round(c.thickness) : opts.wallThickness,
        height: opts.wallHeight,
        color: '#ece6db',
      };
      made.push(wall);

      // Each hole in this wall becomes a door or a window, per the symbol
      // nearest its centre. Holes with no symbol beside them are still real
      // holes — they import as doorless passages rather than being discarded.
      const onThisWall: Opening[] = [];
      const add = (type: 'door' | 'window', offset: number, width: number, style?: 'passage') => {
        // One hole per stretch of wall.
        const c0 = offset * wallLen;
        const clash = onThisWall.some(
          (o) => Math.abs(o.offset * wallLen - c0) < (o.width + width) / 2,
        );
        if (clash) return;
        const d = OPENING_DEFAULTS[type];
        onThisWall.push({
          id: uid(),
          wallId: wall.id,
          type,
          style,
          offset,
          width: Math.round(width),
          height: d.height,
          sill: d.sill,
        });
      };

      // The drawing labels its doors and windows, so read them off their own
      // layers first — that is both simpler and more complete than inferring
      // openings from the shape of the walls.
      for (const kind of ['door', 'window'] as const) {
        const syms = symbols.filter((sy) => sy.kind === kind);
        if (!syms.length) continue;
        // A door narrower than 60cm is not a door, it is a fragment of one
        // whose symbol the drawing left too sparse to group. Better to miss it
        // than to import a 38cm doorway.
        const minWidth = kind === 'door' ? 60 : 35;
        for (const span of symbolSpansOnWall(wall, syms, { minWidth })) {
          add(kind, span.offset, span.width);
        }
      }

      // Then the holes in the wall itself. These add the openings the symbol
      // layers miss — and carry files that have no opening layers at all, where
      // a gap between two wall pieces is the only evidence a door exists.
      // `add` skips anything overlapping an opening already found.
      for (const g of c.gaps) {
        const centre = {
          x: c.a.x + (c.b.x - c.a.x) * g.offset,
          y: c.a.y + (c.b.y - c.a.y) * g.offset,
        };
        const kind = classifyOpening(centre, g.width / 2 + 60, symbols);
        add(kind ?? 'door', g.offset, g.width, kind === null ? 'passage' : undefined);
      }
      madeOpenings.push(...onThisWall);
    }
    // Centrelines already run out to the outer face at corners; this closes
    // what is left. Openings are stored as a FRACTION along their wall, so
    // they follow the endpoints this moves.
    snapCorners(made, 90);
    walls.push(...made);
    openings.push(...madeOpenings);
    byStorey.set(idx, { walls: made, openings: madeOpenings });
  }

  const storeys: DxfStorey[] = [...byStorey.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([index, v]) => ({ index, walls: v.walls, openings: v.openings }));

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
    openings,
    storeys: storeys.length ? storeys : [{ index: 0, walls, openings }],
    kindCounts,
    layerAware,
    demolishedDropped,
    demolishedCount: all.filter((s) => s.demolished && wanted(s)).length,
  };
}
