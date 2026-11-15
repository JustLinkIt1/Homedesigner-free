import type { Point, Wall } from '../types';

/**
 * Close the corners of walls that came from a measured drawing.
 *
 * A CAD file is exact, so its corners must be closed without bending anything.
 * The raster tracer's `snapCorners` is the wrong tool for that: it pulls every
 * endpoint within 90 cm onto a shared average, which is right for a traced
 * photo whose ends are tens of centimetres off, and ruinous for a small flat
 * where a 30 cm wall stub and a 1.2 m bathroom are real. On one such file it
 * turned a square plan into a fan of slanted walls and several of zero length.
 *
 * Here an endpoint only ever moves ALONG ITS OWN WALL, to where that wall's
 * line crosses a neighbour's. A centreline stops half a wall-thickness from
 * the centreline it meets (at the neighbour's face), so that is all the
 * distance there is to make up, and a wall can get longer or shorter but never
 * change direction.
 */
export function joinCorners(walls: Wall[], slack = 12): void {
  const moves: { wall: Wall; end: 'start' | 'end'; to: Point }[] = [];
  for (const w of walls) {
    for (const end of ['start', 'end'] as const) {
      const to = cornerTarget(w, end, walls, slack);
      if (to) moves.push({ wall: w, end, to });
    }
  }
  // Applied together, from the original geometry, so the two walls of a corner
  // both land on the same crossing point rather than chasing each other.
  for (const m of moves) m.wall[m.end] = m.to;
}

/**
 * Where one end of `w` should move to meet a neighbouring wall, or null when
 * nothing is close enough. `w` need not be in `walls`.
 */
export function cornerTarget(w: Wall, end: 'start' | 'end', walls: Wall[], slack = 12): Point | null {
  const wx = w.end.x - w.start.x;
  const wy = w.end.y - w.start.y;
  const wl = Math.hypot(wx, wy);
  if (wl < 1e-6) return null;
  const e = w[end];
  const far = end === 'start' ? w.end : w.start;
  let best: { x: number; y: number; d: number } | null = null;

  for (const v of walls) {
    if (v === w) continue;
    const vx = v.end.x - v.start.x;
    const vy = v.end.y - v.start.y;
    const vl = Math.hypot(vx, vy);
    if (vl < 1e-6) continue;
    // Near-parallel walls have no useful crossing point.
    const cross = (wx * vy - wy * vx) / (wl * vl);
    if (Math.abs(cross) < 0.17) continue; // under ~10 degrees

    // Where this wall's line meets the other's.
    const s = ((v.start.x - e.x) * vy - (v.start.y - e.y) * vx) / (wx * vy - wy * vx);
    const x = e.x + wx * s;
    const y = e.y + wy * s;
    const reach = (w.thickness + v.thickness) / 2 + slack;
    const d = Math.hypot(x - e.x, y - e.y);
    if (d > reach) continue;

    // The crossing must be on the other wall, or just past its end (an
    // L-corner, where both walls stop short of the shared point).
    const tv = ((x - v.start.x) * vx + (y - v.start.y) * vy) / vl;
    if (tv < -reach || tv > vl + reach) continue;

    // And it must not swallow this wall: the far end stays where it is.
    if (Math.hypot(x - far.x, y - far.y) < 1) continue;

    if (!best || d < best.d) best = { x, y, d };
  }
  return best ? { x: best.x, y: best.y } : null;
}
