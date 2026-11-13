import * as THREE from 'three';
import { orientedBox, boxFillRatio, offsetPolygon } from './polygonOffset';
import { detectBuildingOutline } from './roomDetection';
import { coverAt, decompose, kinkLines, planPrisms, rectilinear } from './roofRects';
import type { Point, Roof, Wall } from '../types';

const M = 0.01; // cm -> m, matching DesignScene

/**
 * Roof surface generation.
 *
 * Staged deliberately:
 *  - `flat` extrudes the footprint and is EXACT for any polygon, concave included,
 *    so it doubles as the safe fallback.
 *  - `shed` tilts a single plane; also exact for any polygon.
 *  - `gable` / `hip` are built over the footprint's oriented bounding box.
 *  - a `gable` over an outline whose walls all run square to each other (an L,
 *    a T, a stepped front) is several gables, one per block: see roofRects.ts.
 *
 * A true gable/hip over an arbitrary concave outline needs a straight skeleton.
 * That is 800+ lines, notoriously fragile at degenerate events, and on
 * user-drawn geometry (near-collinear edges, millimetre slivers) it tends to
 * infinite-loop or emit broken meshes. An OBB roof is correct for the
 * rectangular-ish footprints that cover most houses, and anything markedly
 * non-rectangular falls back to flat — see `roofNeedsFallback`.
 */

/**
 * The two plan outlines a roof needs. `detectBuildingOutline` runs along wall
 * CENTRElines, so both are offsets of it:
 *  - `eave` — pushed out by half a wall plus the overhang; the roof edge.
 *  - `wall` — pushed out by half a wall; the outer wall face, where the gable
 *    and shed end infill has to sit so it lines up with the walls below.
 * Returns null when the walls don't enclose anything.
 */
export function roofOutlines(walls: Wall[], overhang: number): { eave: Point[]; wall: Point[] } | null {
  const outline = detectBuildingOutline(walls);
  if (!outline || outline.length < 3) return null;
  const half = (walls.reduce((m, w) => Math.max(m, w.thickness), 0) || 10) / 2;
  return {
    eave: offsetPolygon(outline, half + Math.max(0, overhang)),
    wall: offsetPolygon(outline, half),
  };
}

/** Just the roof edge — for callers that only need to test the shape. */
export function roofFootprint(walls: Wall[], overhang: number): Point[] | null {
  return roofOutlines(walls, overhang)?.eave ?? null;
}

/** True when a pitched roof over this footprint would visibly float. */
export function roofNeedsFallback(outline: Point[]): boolean {
  return boxFillRatio(outline) < 0.82;
}

/** The outline in the frame of its own bounding box: u along it, v across. */
function localOutline(outline: Point[]): Point[] {
  const { theta, center } = orientedBox(outline);
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  return outline.map((p) => ({
    x: (p.x - center.x) * cos + (p.y - center.y) * sin,
    y: -(p.x - center.x) * sin + (p.y - center.y) * cos,
  }));
}

/** True when a gable roof can follow this outline block by block. */
export function roofFollowsOutline(outline: Point[]): boolean {
  const local = localOutline(outline);
  return rectilinear(local) && !!decompose(local);
}

/** The roof type actually used, after the rectangularity check. */
export function effectiveRoofType(roof: Roof, outline: Point[]): Roof['type'] {
  if (roof.type === 'flat' || roof.type === 'shed') return roof.type;
  if (!roofNeedsFallback(outline)) return roof.type;
  // A square-cornered outline takes a gable however far it is from a plain
  // rectangle: the roof is built in blocks. A hip still needs a compact plan.
  return roof.type === 'gable' && roofFollowsOutline(outline) ? 'gable' : 'flat';
}

function shapeOf(poly: Point[]): THREE.Shape {
  const s = new THREE.Shape();
  poly.forEach((p, i) => (i ? s.lineTo(p.x * M, p.y * M) : s.moveTo(p.x * M, p.y * M)));
  s.closePath();
  return s;
}

/** Push one triangle (world coords, metres) into the position array. */
function tri(out: number[], a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) {
  out.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
}
function quad(out: number[], a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) {
  tri(out, a, b, c);
  tri(out, a, c, d);
}

/**
 * Per-face planar UVs, in metres, so `map.repeat = 1/patternMetres` behaves the
 * same way it does for floors and walls.
 *
 * Projecting the whole roof down onto XZ would foreshorten every slope by
 * 1/cos(pitch) — visibly stretched tiles. Instead each triangle is projected
 * onto its own plane using a basis derived from its normal, which is exact.
 * Coplanar triangles get the same basis, so a slope has no internal seam.
 */
function planarUVs(geo: THREE.BufferGeometry) {
  const pos = geo.getAttribute('position');
  const uv = new Float32Array(pos.count * 2);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  const t = new THREE.Vector3();
  const bt = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const side = new THREE.Vector3(1, 0, 0);
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    n.copy(b).sub(a).cross(c.clone().sub(a));
    if (n.lengthSq() < 1e-12) n.set(0, 1, 0);
    n.normalize();
    // Tangent runs across the slope; near-vertical faces (fascia) fall back to X.
    t.copy(up).cross(n);
    if (t.lengthSq() < 1e-8) t.copy(side).cross(n);
    t.normalize();
    bt.copy(n).cross(t).normalize();
    for (let k = 0; k < 3; k++) {
      p.fromBufferAttribute(pos, i + k);
      uv[(i + k) * 2] = p.dot(t);
      uv[(i + k) * 2 + 1] = p.dot(bt);
    }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

export interface RoofLight { position: THREE.Vector3; along: THREE.Vector3; up: THREE.Vector3 }

/**
 * Build the roof mesh geometry in WORLD space (metres), relative to the storey
 * group. `eaveY` is the eave plane height in metres above that group's origin.
 *
 * Returns null when the footprint is unusable.
 */
export function buildRoofGeometry(
  outline: Point[],
  wallOutline: Point[] | null,
  roof: Roof,
  eaveY: number,
): {
  geometry: THREE.BufferGeometry;
  infill: THREE.BufferGeometry | null;
  ridgeHeight: number;
  /** The same roof in two pieces, when the builder knows which faces are roofing
   *  and which are boards. Without it the caller has to work that out. */
  parts?: { covering: THREE.BufferGeometry; trim: THREE.BufferGeometry };
  /** Where the roof windows sit: a point on the covering, the direction along
   *  the ridge and the direction up the slope (unit vectors). */
  lights?: RoofLight[];
} | null {
  if (outline.length < 3) return null;
  const type = effectiveRoofType(roof, outline);
  const t = roof.thickness * M;

  // ---- flat -------------------------------------------------------------
  if (type === 'flat') {
    const solid = new THREE.ExtrudeGeometry(shapeOf(outline), { depth: t, bevelEnabled: false });
    // Shape lies in XY; rotate into XZ. Extrusion then runs downward, so lift by t.
    solid.rotateX(Math.PI / 2);
    solid.translate(0, eaveY + t, 0);
    // planarUVs works triangle-by-triangle, so the geometry must be non-indexed.
    const geo = solid.index ? solid.toNonIndexed() : solid;
    if (geo !== solid) solid.dispose();
    geo.computeVertexNormals();
    planarUVs(geo);
    // A flat roof sits straight on the wall top, so there is nothing to fill.
    return { geometry: geo, infill: null, ridgeHeight: t };
  }

  const box = orientedBox(outline);
  const { theta, center, halfA, halfB } = box;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  // Local (u along theta, v across) -> world plan coords, then to metres.
  const toWorld = (u: number, v: number, y: number) =>
    new THREE.Vector3(
      (center.x + u * cos - v * sin) * M,
      y,
      (center.y + u * sin + v * cos) * M,
    );

  const pitch = Math.max(0, Math.min(60, roof.pitch)) * (Math.PI / 180);
  const pos: number[] = [];
  // Local coordinates of a plan point, in the box's frame.
  const uOf = (p: Point) => (p.x - center.x) * cos + (p.y - center.y) * sin;
  const vOf = (p: Point) => -(p.x - center.x) * sin + (p.y - center.y) * cos;

  /**
   * Close the gap between the wall top and the underside of a pitched roof.
   *
   * Without this you look straight in under the raised end of a shed roof, and
   * a gable has an open triangle at each end plus an open strip along the eaves
   * (the roof clears the wall by `overhang * tan(pitch)`). Built on the WALL
   * outline, not the eave outline, so it lines up with the walls below, and
   * returned separately so it can be rendered in a wall finish rather than
   * roofing.
   */
  const buildInfill = (
    underAt: (p: Point) => number,
    /** Extra split points along an edge where the roof underside changes slope
     *  — without them a gable end would be capped flat instead of peaked. */
    creases: (a: Point, b: Point) => number[],
    /** Lines inside the outline that also need filling: where a lower roof
     *  butts a taller one's gable wall. */
    seams: [Point, Point][] = [],
  ): THREE.BufferGeometry | null => {
    if (!wallOutline || wallOutline.length < 3) return null;
    const W = wallOutline;
    const out: number[] = [];
    // Start marginally below the wall top so the two surfaces can't z-fight.
    const base = eaveY - 0.01;
    const lerp = (a: Point, b: Point, s: number): Point => ({ x: a.x + (b.x - a.x) * s, y: a.y + (b.y - a.y) * s });
    const edges: [Point, Point][] = [...W.map((p, i): [Point, Point] => [p, W[(i + 1) % W.length]]), ...seams];
    for (const [a, b] of edges) {
      const cuts = [0, ...creases(a, b).filter((s) => s > 1e-6 && s < 1 - 1e-6), 1].sort((p, q) => p - q);
      for (let k = 0; k + 1 < cuts.length; k++) {
        const p0 = lerp(a, b, cuts[k]);
        const p1 = lerp(a, b, cuts[k + 1]);
        // Clamp: with no overhang the underside can dip below the wall top, and
        // an inverted quad would render as a dark sliver.
        const y0 = Math.max(base, underAt(p0));
        const y1 = Math.max(base, underAt(p1));
        if (y0 - base < 0.005 && y1 - base < 0.005) continue; // flush; nothing to fill
        quad(
          out,
          new THREE.Vector3(p0.x * M, base, p0.y * M),
          new THREE.Vector3(p1.x * M, base, p1.y * M),
          new THREE.Vector3(p1.x * M, y1, p1.y * M),
          new THREE.Vector3(p0.x * M, y0, p0.y * M),
        );
      }
    }
    if (!out.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
    g.computeVertexNormals();
    planarUVs(g);
    return g;
  };

  // ---- shed -------------------------------------------------------------
  if (type === 'shed') {
    // Single plane rising across v. Exact for any polygon: we tilt the real
    // outline rather than the box, so the eave follows the actual walls.
    const rise = halfB * 2 * Math.tan(pitch) * M;
    const vMin = Math.min(...outline.map(vOf));
    const span = Math.max(1, Math.max(...outline.map(vOf)) - vMin);
    const yOf = (p: Point) => eaveY + ((vOf(p) - vMin) / span) * rise;

    const shape = shapeOf(outline);
    const pts = shape.getPoints(0);
    const faces = THREE.ShapeUtils.triangulateShape(pts, []);
    const P = outline;
    const top = (i: number) => new THREE.Vector3(P[i].x * M, yOf(P[i]) + t, P[i].y * M);
    const bot = (i: number) => new THREE.Vector3(P[i].x * M, yOf(P[i]), P[i].y * M);
    for (const f of faces) {
      tri(pos, top(f[0]), top(f[1]), top(f[2]));
      tri(pos, bot(f[2]), bot(f[1]), bot(f[0])); // underside, reversed
    }
    // Fascia band around the perimeter.
    for (let i = 0; i < P.length; i++) {
      const j = (i + 1) % P.length;
      quad(pos, bot(i), bot(j), top(j), top(i));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    planarUVs(geo);
    // A shed is one unbroken plane, so its infill has no creases.
    return { geometry: geo, infill: buildInfill(yOf, () => []), ridgeHeight: rise + t };
  }

  /**
   * Roof windows on the two slopes of one gable: `roof.windows` a side, spaced
   * evenly along the ridge and half way up. `clear` says whether a spot is free
   * of any other roof running into this one.
   */
  const lightsOn = (
    axis: 'u' | 'v', a0: number, a1: number, mid: number, half: number,
    clear: (u: number, v: number) => boolean = () => true,
  ): RoofLight[] => {
    const count = Math.max(0, Math.min(6, Math.round(roof.windows ?? 0)));
    const usable = a1 - a0 - 240;
    if (!count || usable < 80 || half < 150) return [];
    const at = (a: number, c: number, y: number) => (axis === 'u' ? toWorld(a, c, y) : toWorld(c, a, y));
    const grade = Math.tan(pitch);
    const run = half * 0.5; // in from the eave, cm
    const out: RoofLight[] = [];
    for (const side of [-1, 1]) {
      for (let i = 0; i < count; i++) {
        const a = a0 + 120 + (usable * (i + 0.5)) / count;
        const c = mid + side * (half - run);
        const free = [[0, 0], [-55, 0], [55, 0], [0, -75], [0, 75]].every(([da, dc]) =>
          (axis === 'u' ? clear(a + da, c + dc) : clear(c + dc, a + da)));
        if (!free) continue;
        const p = at(a, c, eaveY + run * grade * M);
        out.push({
          position: p,
          along: at(a + 100, c, eaveY + run * grade * M).sub(p).normalize(),
          up: at(a, c - side * 100, eaveY + (run + 100) * grade * M).sub(p).normalize(),
        });
      }
    }
    return out;
  };

  // ---- gable over an L, T or stepped outline ----------------------------
  if (type === 'gable') {
    // Planned on the walls, so each roof ends where its walls do; the eaves are
    // added per roof. Without a wall outline the eave outline stands in.
    const basis = wallOutline && wallOutline.length >= 3 ? wallOutline : outline;
    const ov = basis === outline ? 0 : Math.max(0, roof.overhang);
    const local = basis.map((p) => ({ x: uOf(p), y: vOf(p) }));
    const rects = rectilinear(local) ? decompose(local) : null;
    if (rects && rects.length > 1) {
      const plan = planPrisms(rects, ov);
      const slope = Math.tan(pitch);
      const cover: number[] = [];
      const trim: number[] = [];
      let top = 0;
      for (const P of plan.prisms) {
        const at = (a: number, c: number, y: number) => (P.axis === 'u' ? toWorld(a, c, y) : toWorld(c, a, y));
        const up = P.half * slope * M;
        top = Math.max(top, up);
        const lo = P.mid - P.half;
        const hi = P.mid + P.half;
        const eave = (a: number, c: number) => at(a, c, eaveY);
        const ridge = (a: number) => at(a, P.mid, eaveY + up);
        const eaveU = (a: number, c: number) => at(a, c, eaveY - t);
        const ridgeU = (a: number) => at(a, P.mid, eaveY + up - t);
        quad(cover, eave(P.a0, lo), eave(P.a1, lo), ridge(P.a1), ridge(P.a0));
        quad(cover, eave(P.a1, hi), eave(P.a0, hi), ridge(P.a0), ridge(P.a1));
        quad(trim, ridgeU(P.a0), ridgeU(P.a1), eaveU(P.a1, lo), eaveU(P.a0, lo));
        quad(trim, ridgeU(P.a1), ridgeU(P.a0), eaveU(P.a0, hi), eaveU(P.a1, hi));
        quad(trim, eaveU(P.a0, lo), eaveU(P.a1, lo), eave(P.a1, lo), eave(P.a0, lo));
        quad(trim, eaveU(P.a1, hi), eaveU(P.a0, hi), eave(P.a0, hi), eave(P.a1, hi));
        for (const [a, gable] of [[P.a0, P.gableStart], [P.a1, P.gableEnd]] as const) {
          if (!gable) continue;
          quad(trim, eave(a, lo), ridge(a), ridgeU(a), eaveU(a, lo));
          quad(trim, ridge(a), eave(a, hi), eaveU(a, hi), ridgeU(a));
        }
      }
      const make = (positions: number[]) => {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        g.computeVertexNormals();
        planarUVs(g);
        return g;
      };
      const underAt = (p: Point) => eaveY - t + (coverAt(plan.prisms, uOf(p), vOf(p)) ?? 0) * slope * M;
      const kinks = kinkLines(plan.prisms);
      const creases = (a: Point, b: Point): number[] => {
        const ua = uOf(a), ub = uOf(b), va = vOf(a), vb = vOf(b);
        const cuts: number[] = [];
        // Either side of each line as well: where one roof stops and another
        // takes over, the wall top steps rather than slopes.
        const add = (s: number) => cuts.push(s - 1e-4, s, s + 1e-4);
        if (Math.abs(ub - ua) > 1e-6) for (const k of kinks.u) add((k - ua) / (ub - ua));
        if (Math.abs(vb - va) > 1e-6) for (const k of kinks.v) add((k - va) / (vb - va));
        // And evenly, for the valleys where two roofs cross over a wall.
        const steps = Math.ceil(Math.hypot(ub - ua, vb - va) / 30);
        for (let i = 1; i < steps; i++) cuts.push(i / steps);
        return cuts;
      };
      const toPlan = (p: Point): Point => ({ x: center.x + p.x * cos - p.y * sin, y: center.y + p.x * sin + p.y * cos });
      const seams = plan.seams.map(([a, b]): [Point, Point] => [toPlan(a), toPlan(b)]);
      return {
        geometry: make([...cover, ...trim]),
        infill: buildInfill(underAt, creases, seams),
        ridgeHeight: top + t,
        parts: { covering: make(cover), trim: make(trim) },
        // On the main roof only, and not where a cross gable runs into it.
        lights: lightsOn(plan.prisms[0].axis, plan.prisms[0].a0, plan.prisms[0].a1, plan.prisms[0].mid, plan.prisms[0].half,
          (u, v) => coverAt(plan.prisms.slice(1), u, v) === null),
      };
    }
  }

  // ---- gable / hip ------------------------------------------------------
  const rise = halfB * Math.tan(pitch) * M;
  const A = halfA;
  const B = halfB;
  const yE = eaveY;
  const yR = eaveY + rise;
  // Ridge half-length: a hip pulls the ridge in by B at each end (45° hips);
  // a gable runs the ridge the full length.
  const ridgeA = type === 'hip' ? Math.max(0, A - B) : A;

  const E = (u: number, v: number) => toWorld(u, v, yE); // eave corners
  const R = (u: number) => toWorld(u, 0, yR); // ridge points

  // Two main slopes.
  if (type === 'gable') {
    quad(pos, E(-A, -B), E(A, -B), R(A), R(-A));
    quad(pos, E(A, B), E(-A, B), R(-A), R(A));
  } else {
    quad(pos, E(-ridgeA, -B), E(ridgeA, -B), R(ridgeA), R(-ridgeA));
    quad(pos, E(ridgeA, B), E(-ridgeA, B), R(-ridgeA), R(ridgeA));
    // Hip ends (triangles). When ridgeA is 0 this is a pyramid, which is correct
    // for a square footprint.
    tri(pos, E(A, -B), E(A, B), R(ridgeA));
    tri(pos, E(-A, B), E(-A, -B), R(-ridgeA));
    // Close the two slope quads out to the hip corners.
    tri(pos, E(ridgeA, -B), E(A, -B), R(ridgeA));
    tri(pos, E(A, B), E(ridgeA, B), R(ridgeA));
    tri(pos, E(-A, -B), E(-ridgeA, -B), R(-ridgeA));
    tri(pos, E(-ridgeA, B), E(-A, B), R(-ridgeA));
  }

  // Underside + fascia so the roof reads as a solid slab from below and at the eave.
  const dY = t;
  const Eu = (u: number, v: number) => toWorld(u, v, yE - dY);
  const Ru = (u: number) => toWorld(u, 0, yR - dY);
  if (type === 'gable') {
    quad(pos, Ru(-A), Ru(A), Eu(A, -B), Eu(-A, -B));
    quad(pos, Ru(A), Ru(-A), Eu(-A, B), Eu(A, B));
    // The gable-end triangle is filled by `buildInfill` below, on the wall
    // outline — it is masonry, not roofing, and belongs flush with the walls.
  } else {
    quad(pos, Ru(-ridgeA), Ru(ridgeA), Eu(ridgeA, -B), Eu(-ridgeA, -B));
    quad(pos, Ru(ridgeA), Ru(-ridgeA), Eu(-ridgeA, B), Eu(ridgeA, B));
  }
  // Fascia along the eaves. A hip has an eave on all four sides. A gable has
  // one only under each slope: across a gable end the wall runs straight up
  // into the triangle, and a board there read as a beam nailed across the
  // brickwork.
  const corners: [number, number][] = [[-A, -B], [A, -B], [A, B], [-A, B]];
  for (let i = 0; i < 4; i++) {
    const [u0, v0] = corners[i];
    const [u1, v1] = corners[(i + 1) % 4];
    if (type === 'gable' && v0 !== v1) continue;
    quad(pos, Eu(u0, v0), Eu(u1, v1), E(u1, v1), E(u0, v0));
  }
  // What a gable end has instead is a bargeboard up each verge: the end of the
  // roof slab, closed. Left open it showed the gap between the covering and
  // the soffit.
  if (type === 'gable') {
    for (const u of [-A, A]) {
      quad(pos, E(u, -B), R(u), Ru(u), Eu(u, -B));
      quad(pos, R(u), E(u, B), Eu(u, B), Ru(u));
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  planarUVs(geo);

  // Height of the roof's UNDERSIDE over a plan point. Both shapes are straight
  // skeletons over the box: a gable falls off across v only, a hip also falls
  // off along u (its ends are 45° in plan, so the same rise/B gradient applies).
  const slope = B > 0 ? rise / B : 0;
  const dOf = (p: Point) => {
    const du = A - Math.abs(uOf(p));
    const dv = B - Math.abs(vOf(p));
    return type === 'hip' ? Math.min(du, dv) : dv;
  };
  const underAt = (p: Point) => yE - t + Math.max(0, dOf(p)) * slope;

  // Where the underside creases along an edge: at the ridge (v = 0), and for a
  // hip also where the end slope takes over from the side slope (du = dv).
  // u and v are affine along an edge, so every root is a simple linear solve.
  const zeroOf = (fa: number, fb: number) => (fa === fb ? [] : [fa / (fa - fb)]);
  const creases = (a: Point, b: Point): number[] => {
    const roots = [...zeroOf(uOf(a), uOf(b)), ...zeroOf(vOf(a), vOf(b))];
    if (type !== 'hip') return roots;
    // Between consecutive |u|/|v| kinks du - dv is affine, so bracket and solve.
    const stops = [0, ...roots.filter((s) => s > 0 && s < 1), 1].sort((p, q) => p - q);
    const lerp = (s: number): Point => ({ x: a.x + (b.x - a.x) * s, y: a.y + (b.y - a.y) * s });
    const gap = (s: number) => A - Math.abs(uOf(lerp(s))) - (B - Math.abs(vOf(lerp(s))));
    for (let i = 0; i + 1 < stops.length; i++) {
      const g0 = gap(stops[i]);
      const g1 = gap(stops[i + 1]);
      if (g0 === g1 || g0 * g1 > 0) continue;
      roots.push(stops[i] + ((stops[i + 1] - stops[i]) * g0) / (g0 - g1));
    }
    return roots;
  };
  return {
    geometry: geo,
    infill: buildInfill(underAt, creases),
    ridgeHeight: rise + t,
    lights: type === 'gable' ? lightsOn('u', -A, A, 0, B) : [],
  };
}
