import * as THREE from 'three';
import { orientedBox, boxFillRatio, offsetPolygon } from './polygonOffset';
import { detectBuildingOutline } from './roomDetection';
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

/** The roof type actually used, after the rectangularity check. */
export function effectiveRoofType(roof: Roof, outline: Point[]): Roof['type'] {
  if (roof.type === 'flat' || roof.type === 'shed') return roof.type;
  return roofNeedsFallback(outline) ? 'flat' : roof.type;
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
): { geometry: THREE.BufferGeometry; infill: THREE.BufferGeometry | null; ridgeHeight: number } | null {
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
  ): THREE.BufferGeometry | null => {
    if (!wallOutline || wallOutline.length < 3) return null;
    const W = wallOutline;
    const out: number[] = [];
    // Start marginally below the wall top so the two surfaces can't z-fight.
    const base = eaveY - 0.01;
    const lerp = (a: Point, b: Point, s: number): Point => ({ x: a.x + (b.x - a.x) * s, y: a.y + (b.y - a.y) * s });
    for (let i = 0; i < W.length; i++) {
      const a = W[i];
      const b = W[(i + 1) % W.length];
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
  // Fascia around the eave rectangle.
  const corners: [number, number][] = [[-A, -B], [A, -B], [A, B], [-A, B]];
  for (let i = 0; i < 4; i++) {
    const [u0, v0] = corners[i];
    const [u1, v1] = corners[(i + 1) % 4];
    quad(pos, Eu(u0, v0), Eu(u1, v1), E(u1, v1), E(u0, v0));
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
  return { geometry: geo, infill: buildInfill(underAt, creases), ridgeHeight: rise + t };
}
