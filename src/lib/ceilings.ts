import { pointInPolygon } from './geometry';
import { isFence, isHalfWall } from './fence';
import type { Room, Wall } from '../types';

/** How far past a wall face to look for the room it borders (cm). */
const PROBE_MARGIN = 5;
/** Places along a wall that are tested, as fractions of its length. */
const SAMPLES = [0.1, 0.3, 0.5, 0.7, 0.9];
const DEFAULT_HEIGHT = 270;

/** Height of the tallest wall on a storey (cm). */
export function storeyTop(walls: Wall[]): number {
  return walls.reduce((m, w) => Math.max(m, w.height), 0) || DEFAULT_HEIGHT;
}

/**
 * Where a storey's roof sits (cm): the wall height that most of the storey's
 * wall length is built to, the lower one on a tie. Fences and half walls carry
 * no roof and are not counted.
 *
 * The roof used to sit on the tallest wall, so raising one wall (a feature
 * wall, a gable end, a chimney breast) lifted the whole roof off every other
 * wall, with daylight under it. Now that one wall rises through the roof, and
 * the parapet stops at it.
 */
export function roofEaveHeight(walls: Wall[]): number {
  const byHeight = new Map<number, number>();
  for (const w of walls) {
    if (isFence(w) || isHalfWall(w) || !(w.height > 0)) continue;
    const len = Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y);
    byHeight.set(w.height, (byHeight.get(w.height) ?? 0) + len);
  }
  let best = 0;
  let bestLen = -1;
  for (const [h, len] of byHeight) {
    if (len > bestLen + 1e-6 || (Math.abs(len - bestLen) <= 1e-6 && h < best)) {
      best = h;
      bestLen = len;
    }
  }
  return best > 0 ? best : storeyTop(walls);
}

/**
 * Height (cm) of the flat ceiling over each indoor room of a storey.
 *
 * Every ceiling used to sit at the tallest wall of the whole storey. Raise one
 * wall (a parapet, a feature wall, a taller room next door) and every ceiling
 * in the house rose with it, left hanging in the air above walls that had not
 * changed, with daylight showing through the gap.
 *
 * A room's ceiling now sits on that room's own walls: at the height most of
 * its perimeter is built to. One taller wall simply stands up past it, and one
 * lower wall leaves an opening under it, while a room whose walls were all
 * raised gets its higher ceiling. Half walls and fences never carry a ceiling.
 */
export function roomCeilingHeights(rooms: Room[], walls: Wall[]): Map<string, number> {
  const top = storeyTop(walls);
  const bearing = walls.filter((w) => !isFence(w) && !isHalfWall(w));
  const out = new Map<string, number>();
  for (const room of rooms) {
    if (room.outdoor || room.points.length < 3) continue;
    // [height, length of this room's edge built to it]
    const runs: [number, number][] = [];
    for (const wall of bearing) {
      const dx = wall.end.x - wall.start.x;
      const dy = wall.end.y - wall.start.y;
      const len = Math.hypot(dx, dy);
      if (len < 1e-6) continue;
      const nx = -dy / len;
      const ny = dx / len;
      const off = wall.thickness / 2 + PROBE_MARGIN;
      let hits = 0;
      for (const f of SAMPLES) {
        const px = wall.start.x + dx * f;
        const py = wall.start.y + dy * f;
        if (pointInPolygon({ x: px + nx * off, y: py + ny * off }, room.points)
          || pointInPolygon({ x: px - nx * off, y: py - ny * off }, room.points)) hits++;
      }
      if (hits > 0) runs.push([wall.height, (len * hits) / SAMPLES.length]);
    }
    if (runs.length === 0) {
      out.set(room.id, top);
      continue;
    }
    // The height at the middle of the perimeter, the lower one on a tie.
    runs.sort((a, b) => a[0] - b[0]);
    const half = runs.reduce((sum, r) => sum + r[1], 0) / 2;
    let seen = 0;
    let height = runs[runs.length - 1][0];
    for (const [h, l] of runs) {
      seen += l;
      if (seen >= half - 1e-6) {
        height = h;
        break;
      }
    }
    out.set(room.id, height);
  }
  return out;
}

/** Ceiling height (cm) over a plan point: its room's, or the storey's top where
 *  no room is drawn. */
export function ceilingHeightAt(
  point: { x: number; y: number }, rooms: Room[], heights: Map<string, number>, fallback: number,
): number {
  for (const room of rooms) {
    const h = heights.get(room.id);
    if (h != null && pointInPolygon(point, room.points)) return h;
  }
  return fallback;
}
