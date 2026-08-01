import type { Point, Wall } from '../types';

/** One measured leg: where it starts on the item, which way it points, and how
 *  far it runs before meeting a wall face. */
export interface DistanceLeg {
  from: Point;
  dir: Point;
  /** Distance in cm to the near FACE of the wall, or Infinity if nothing hit. */
  distance: number;
}

/**
 * Distance from each side of a placed item to the wall it faces.
 *
 * Casts one ray from the midpoint of each of the item's four sides, along its
 * own rotated axes, and returns the nearest wall hit per side. Distances are to
 * the wall FACE rather than its centreline, because that is what a tape measure
 * reads in the real room.
 *
 * Pass every wall, including fences and half walls. Unlike room detection this
 * is not about enclosure: a ray that ignored a fence would pass through a
 * barrier the user can see and report the distance to whatever stands behind
 * it, which is the wrong number.
 */
export function wallDistances(
  box: { position: Point; width: number; depth: number },
  rotationDeg: number,
  walls: Wall[],
): DistanceLeg[] {
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  // Konva rotates clockwise in screen space (y grows downward), so a local
  // point maps to the world as +X → (cos, sin) and +Y → (-sin, cos).
  const toWorld = (lx: number, ly: number): Point => ({
    x: box.position.x + lx * cos - ly * sin,
    y: box.position.y + lx * sin + ly * cos,
  });
  const hw = box.width / 2;
  const hd = box.depth / 2;
  const rays: { from: Point; dir: Point }[] = [
    { from: toWorld(hw, 0), dir: { x: cos, y: sin } },
    { from: toWorld(-hw, 0), dir: { x: -cos, y: -sin } },
    { from: toWorld(0, hd), dir: { x: -sin, y: cos } },
    { from: toWorld(0, -hd), dir: { x: sin, y: -cos } },
  ];

  return rays.map(({ from, dir }) => {
    let best = Infinity;
    for (const w of walls) {
      const ex = w.end.x - w.start.x;
      const ey = w.end.y - w.start.y;
      // Ray P+tD against segment A+uE. Solving tD - uE = A-P by crossing with
      // E then with D gives t = (W×E)/(D×E) and u = (W×D)/(D×E).
      const denom = dir.x * ey - dir.y * ex;
      if (Math.abs(denom) < 1e-9) continue; // ray runs parallel to this wall
      const ax = w.start.x - from.x;
      const ay = w.start.y - from.y;
      const t = (ax * ey - ay * ex) / denom;
      const u = (ax * dir.y - ay * dir.x) / denom;
      if (t <= 0 || u < 0 || u > 1) continue;
      // Step back from the centreline to the near face. Half the thickness is
      // measured perpendicular to the wall, so along the ray that distance is
      // half / |D·n| for the wall's unit normal n.
      const len = Math.hypot(ex, ey) || 1;
      const dotNormal = Math.abs((dir.x * -ey + dir.y * ex) / len);
      const faceT = dotNormal > 1e-6 ? t - w.thickness / 2 / dotNormal : t;
      if (faceT > 0 && faceT < best) best = faceT;
    }
    return { from, dir, distance: best };
  });
}
