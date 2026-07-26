import type { FloorInfo, FurnitureItem, Opening, Point, Room, Wall } from '../types';
import { computeWallPolygons } from './wallGeometry';
import { CATALOG_BY_TYPE } from '../data/furnitureCatalog';
import { SYMBOLS, FALLBACK_SYMBOL } from './symbols';
import { flattenPath } from './svgPath';
import { polygonArea, dist } from './geometry';

/**
 * Write the design as a CAD drawing.
 *
 * Structured the way an architect's file is structured, because that is what
 * makes a drawing useful to anyone downstream — and because this project has
 * spent a lot of effort learning to READ such files, so writing one is the same
 * knowledge pointed the other way. Everything lands on a named layer following
 * the AIA convention (A-WALL, A-DOOR, A-GLAZ, A-FURN, …) prefixed by storey, so
 * a three-storey house opens with its levels separable.
 *
 * Walls are drawn as their two FACES with the openings cut out, not as
 * centrelines — that is how CAD represents a wall, and it means our own
 * importer's centreline pairing and hole detection read this back correctly.
 *
 * The output is ASCII DXF R12. R12 is the most widely readable interchange
 * format there is; every entity here is a LINE, ARC or TEXT, which keeps the
 * file simple enough that nothing can misinterpret it. (DWG proper is a closed
 * binary format with no practical browser-side writer — every CAD application
 * opens DXF.)
 */

export interface DxfExportInput {
  projectName: string;
  floors: FloorInfo[];
  geom: Record<string, { walls: Wall[]; rooms: Room[]; furniture: FurnitureItem[]; openings: Opening[] }>;
}

/** AIA-style layer names, prefixed per storey so levels stay separable. */
export const LAYERS = {
  wall: 'A-WALL',
  door: 'A-DOOR',
  window: 'A-GLAZ',
  furniture: 'A-FURN',
  area: 'A-AREA',
  areaText: 'A-AREA-IDEN',
  dims: 'A-ANNO-DIMS',
} as const;

/** DXF colour indices, roughly matching drafting convention. */
const LAYER_COLOR: Record<string, number> = {
  [LAYERS.wall]: 7, // white/black
  [LAYERS.door]: 3, // green
  [LAYERS.window]: 5, // blue
  [LAYERS.furniture]: 8, // grey
  [LAYERS.area]: 9,
  [LAYERS.areaText]: 2, // yellow
  [LAYERS.dims]: 1, // red
};

const storeyPrefix = (index: number) => `L${String(index).padStart(2, '0')}-`;

/** A DXF group code/value pair. */
type Pair = [number, string | number];

class DxfWriter {
  private pairs: Pair[] = [];
  private layers = new Set<string>();

  layer(name: string) {
    this.layers.add(name);
    return name;
  }

  line(layer: string, a: Point, b: Point) {
    // Skip degenerate segments; some CAD apps flag them as errors.
    if (Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6) return;
    this.pairs.push(
      [0, 'LINE'], [8, this.layer(layer)],
      [10, a.x], [20, a.y], [30, 0],
      [11, b.x], [21, b.y], [31, 0],
    );
  }

  polyline(layer: string, pts: Point[], close = false) {
    for (let i = 0; i < pts.length - 1; i++) this.line(layer, pts[i], pts[i + 1]);
    if (close && pts.length > 2) this.line(layer, pts[pts.length - 1], pts[0]);
  }

  /** Angles in radians, counter-clockwise from +X, as DXF expects degrees. */
  arc(layer: string, centre: Point, radius: number, a0: number, a1: number) {
    if (!(radius > 0)) return;
    const deg = (r: number) => ((r * 180) / Math.PI + 360) % 360;
    this.pairs.push(
      [0, 'ARC'], [8, this.layer(layer)],
      [10, centre.x], [20, centre.y], [30, 0],
      [40, radius], [50, deg(a0)], [51, deg(a1)],
    );
  }

  text(layer: string, at: Point, height: number, value: string) {
    const clean = value.replace(/[\r\n]+/g, ' ').trim();
    if (!clean) return;
    this.pairs.push(
      [0, 'TEXT'], [8, this.layer(layer)],
      [10, at.x], [20, at.y], [30, 0],
      [40, height], [1, clean], [72, 1], // 72=1 centre-aligned
      [11, at.x], [21, at.y], [31, 0],
    );
  }

  build(extMin: Point, extMax: Point): string {
    const out: Pair[] = [];
    const push = (...p: Pair[]) => out.push(...p);

    // HEADER — $INSUNITS 5 declares centimetres, which is what we write. Our
    // own importer reads this (and sanity-checks it), as do most CAD apps.
    push([0, 'SECTION'], [2, 'HEADER']);
    push([9, '$ACADVER'], [1, 'AC1009']);
    push([9, '$INSUNITS'], [70, 5]);
    push([9, '$EXTMIN'], [10, extMin.x], [20, extMin.y], [30, 0]);
    push([9, '$EXTMAX'], [10, extMax.x], [20, extMax.y], [30, 0]);
    push([0, 'ENDSEC']);

    // TABLES — every layer used must be declared or strict readers reject it.
    const names = [...this.layers].sort();
    push([0, 'SECTION'], [2, 'TABLES']);
    push([0, 'TABLE'], [2, 'LAYER'], [70, names.length + 1]);
    push([0, 'LAYER'], [2, '0'], [70, 0], [62, 7], [6, 'CONTINUOUS']);
    for (const n of names) {
      const base = n.replace(/^L\d\d-/, '');
      push([0, 'LAYER'], [2, n], [70, 0], [62, LAYER_COLOR[base] ?? 7], [6, 'CONTINUOUS']);
    }
    push([0, 'ENDTAB'], [0, 'ENDSEC']);

    push([0, 'SECTION'], [2, 'ENTITIES']);
    push(...this.pairs);
    push([0, 'ENDSEC'], [0, 'EOF']);

    return out
      .map(([code, value]) =>
        `${code}\n${typeof value === 'number' ? formatNum(code, value) : value}`)
      .join('\n') + '\n';
  }
}

/** DXF wants reals with a decimal point and integers without. */
function formatNum(code: number, v: number): string {
  const isInt = code === 70 || code === 62 || code === 72 || code === 6;
  if (isInt) return String(Math.round(v));
  return Number.isFinite(v) ? v.toFixed(4) : '0.0000';
}

/** Unit direction and length of a wall. */
function axis(w: Wall) {
  const dx = w.end.x - w.start.x;
  const dy = w.end.y - w.start.y;
  const len = Math.hypot(dx, dy) || 1;
  return { ux: dx / len, uy: dy / len, nx: -dy / len, ny: dx / len, len };
}

/**
 * Split a wall face into the stretches left between its openings, as a real
 * drawing does — the gaps are what our importer reads back as doors and windows.
 */
function faceRuns(len: number, holes: { c: number; w: number }[]): [number, number][] {
  const sorted = [...holes].sort((a, b) => a.c - b.c);
  const runs: [number, number][] = [];
  let cursor = 0;
  for (const h of sorted) {
    const a = Math.max(cursor, h.c - h.w / 2);
    const b = Math.min(len, h.c + h.w / 2);
    if (a > cursor) runs.push([cursor, a]);
    cursor = Math.max(cursor, b);
  }
  if (cursor < len) runs.push([cursor, len]);
  return runs;
}

export function buildDxf(input: DxfExportInput): string {
  const w = new DxfWriter();
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const see = (p: Point) => {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  };

  const ordered = [...input.floors].sort((a, b) => a.elevation - b.elevation);
  ordered.forEach((floor, index) => {
    const g = input.geom[floor.id];
    if (!g) return;
    const P = storeyPrefix(index);
    const polys = computeWallPolygons(g.walls);

    // ---- walls, with their openings cut out --------------------------------
    for (const wall of g.walls) {
      const poly = polys.get(wall.id);
      if (!poly) continue;
      const [SL, EL, ER, SR] = poly;
      see(SL); see(EL); see(ER); see(SR);
      const { len } = axis(wall);
      const holes = g.openings
        .filter((o) => o.wallId === wall.id)
        .map((o) => ({ c: o.offset * len, w: o.width }));

      if (!holes.length) {
        // Unpierced: the plain mitred outline.
        w.polyline(P + LAYERS.wall, [SL, EL, ER, SR], true);
        continue;
      }
      // Each face becomes the stretches between its holes. The faces run
      // between the MITRED corners rather than along the wall axis, so they end
      // exactly where the end caps do — drawing them on the axis instead left
      // the caps protruding half a thickness, and the plan measured 10cm over
      // on a round trip. Holes are placed by fraction, which is how the model
      // stores them anyway.
      const face = (side: 1 | -1, f: number): Point => {
        const from = side === 1 ? SL : SR;
        const to = side === 1 ? EL : ER;
        return { x: from.x + (to.x - from.x) * f, y: from.y + (to.y - from.y) * f };
      };
      for (const [a, b] of faceRuns(len, holes)) {
        for (const side of [1, -1] as const) {
          w.line(P + LAYERS.wall, face(side, a / len), face(side, b / len));
        }
      }
      // End caps and a jamb across the wall at each side of every hole.
      w.line(P + LAYERS.wall, SL, SR);
      w.line(P + LAYERS.wall, EL, ER);
      for (const h of holes) {
        for (const t of [h.c - h.w / 2, h.c + h.w / 2]) {
          if (t <= 0 || t >= len) continue;
          w.line(P + LAYERS.wall, face(1, t / len), face(-1, t / len));
        }
      }
    }

    // ---- doors and windows -------------------------------------------------
    for (const o of g.openings) {
      const wall = g.walls.find((x) => x.id === o.wallId);
      if (!wall) continue;
      const { ux, uy, nx, ny, len } = axis(wall);
      const half = wall.thickness / 2;
      const c = o.offset * len;
      const at = (t: number, off: number): Point => ({
        x: wall.start.x + ux * t + nx * off,
        y: wall.start.y + uy * t + ny * off,
      });
      const t0 = c - o.width / 2;
      const t1 = c + o.width / 2;

      if (o.type === 'window') {
        const layer = P + LAYERS.window;
        // Glazing: two lines along the opening, plus the reveals.
        for (const off of [half * 0.35, -half * 0.35]) w.line(layer, at(t0, off), at(t1, off));
        w.line(layer, at(t0, half), at(t0, -half));
        w.line(layer, at(t1, half), at(t1, -half));
      } else {
        const layer = P + LAYERS.door;
        // Leaf hinged at t0, swinging to the +n side, plus its 90° arc — the
        // convention every plan uses, and what our importer looks for.
        const hinge = at(t0, 0);
        const openLeaf = at(t0, o.width);
        w.line(layer, hinge, openLeaf);
        w.line(layer, at(t0, half), at(t0, -half));
        w.line(layer, at(t1, half), at(t1, -half));
        const a0 = Math.atan2(uy, ux);
        w.arc(layer, hinge, o.width, a0, a0 + Math.PI / 2);
      }
    }

    // ---- room boundaries and labels ---------------------------------------
    for (const room of g.rooms) {
      if (room.points.length < 3) continue;
      room.points.forEach(see);
      w.polyline(P + LAYERS.area, room.points, true);
      const cx = room.points.reduce((n, p) => n + p.x, 0) / room.points.length;
      const cy = room.points.reduce((n, p) => n + p.y, 0) / room.points.length;
      const m2 = Math.abs(polygonArea(room.points)) / 10000;
      w.text(P + LAYERS.areaText, { x: cx, y: cy }, 20, room.name);
      w.text(P + LAYERS.areaText, { x: cx, y: cy - 28 }, 14, `${m2.toFixed(2)} m2`);
    }

    // ---- furniture, as wireframe plan symbols ------------------------------
    for (const item of g.furniture) {
      const entry = CATALOG_BY_TYPE[item.type];
      const symbol = (entry?.shape && SYMBOLS[entry.shape]) || FALLBACK_SYMBOL;
      const rot = (item.rotation * Math.PI) / 180;
      const cos = Math.cos(rot);
      const sin = Math.sin(rot);
      // Symbols are authored in a 100x100 box; map to the item's footprint,
      // rotate about its centre and drop it at its plan position.
      const place = (p: Point): Point => {
        const lx = (p.x / 100 - 0.5) * item.width;
        const ly = (p.y / 100 - 0.5) * item.depth;
        return { x: item.position.x + lx * cos - ly * sin, y: item.position.y + lx * sin + ly * cos };
      };
      for (const part of symbol) {
        for (const poly of flattenPath(part.d)) {
          const pts = poly.map(place);
          pts.forEach(see);
          w.polyline(P + LAYERS.furniture, pts);
        }
      }
    }

    // ---- overall dimensions ------------------------------------------------
    const pts = g.walls.flatMap((x) => [x.start, x.end]);
    if (pts.length >= 2) {
      const bx0 = Math.min(...pts.map((p) => p.x));
      const bx1 = Math.max(...pts.map((p) => p.x));
      const by0 = Math.min(...pts.map((p) => p.y));
      const by1 = Math.max(...pts.map((p) => p.y));
      const off = 120;
      const layer = P + LAYERS.dims;
      // Witness lines and a run of dimension either side of the plan.
      w.line(layer, { x: bx0, y: by0 - off }, { x: bx1, y: by0 - off });
      w.line(layer, { x: bx0, y: by0 }, { x: bx0, y: by0 - off - 20 });
      w.line(layer, { x: bx1, y: by0 }, { x: bx1, y: by0 - off - 20 });
      w.text(layer, { x: (bx0 + bx1) / 2, y: by0 - off + 12 }, 22, `${((bx1 - bx0) / 100).toFixed(2)} m`);
      w.line(layer, { x: bx0 - off, y: by0 }, { x: bx0 - off, y: by1 });
      w.line(layer, { x: bx0, y: by0 }, { x: bx0 - off - 20, y: by0 });
      w.line(layer, { x: bx0, y: by1 }, { x: bx0 - off - 20, y: by1 });
      w.text(layer, { x: bx0 - off - 40, y: (by0 + by1) / 2 }, 22, `${((by1 - by0) / 100).toFixed(2)} m`);
      see({ x: bx0 - off - 60, y: by0 - off - 40 });
      see({ x: bx1 + 40, y: by1 + 40 });
    }
  });

  if (!Number.isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = 1000;
    maxY = 1000;
  }
  return w.build({ x: minX, y: minY }, { x: maxX, y: maxY });
}

/** Longest wall in a design, handy for sanity-checking a round trip. */
export function longestWall(walls: Wall[]): number {
  return walls.reduce((m, x) => Math.max(m, dist(x.start, x.end)), 0);
}
