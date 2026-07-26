import type { Point, Wall } from '../types';
import { pointToSegment } from './geometry';
import type { Seg } from './wallCentrelines';

/**
 * Classify a wall's holes as doors or windows.
 *
 * Finding the openings is not the hard part and does not happen here: CAD cuts
 * the wall at every door and window, so `wallCentrelines` already reports each
 * hole's exact position and width from where both wall faces stop and restart.
 * What that cannot say is which KIND of opening it is.
 *
 * The drawing can. Door and window symbols live on their own layers, so the
 * question reduces to: which kind of symbol sits in this hole? That is a
 * proximity test, and a deliberately cheap one.
 *
 * The alternative — reading the door symbols directly — was tried and abandoned.
 * A door is drawn as jambs plus a leaf plus a 90-degree swing arc that sweeps a
 * door's-width into the room, so its raw extent is roughly twice the real
 * opening; and the parts only group together reliably when the draughtsman
 * happened to make them touch. Measuring the hole in the wall avoids both
 * problems entirely.
 */

export interface KindedSeg extends Seg {
  kind: 'door' | 'window';
}

/** Plan-model defaults for the dimensions a 2D drawing does not carry. */
export const OPENING_DEFAULTS = {
  door: { height: 205, sill: 0 },
  window: { height: 120, sill: 90 },
};

/**
 * Which kind of opening sits at `centre`, or null if nothing identifies it.
 *
 * `reach` should be about half the hole's width plus a margin: a door's symbol
 * is centred in its hole, but its arc and leaf sprawl to one side, so the test
 * looks for the NEAREST symbol rather than counting everything nearby.
 */
export function classifyOpening(
  centre: Point,
  reach: number,
  symbols: KindedSeg[],
): 'door' | 'window' | null {
  let best: { kind: 'door' | 'window'; d: number } | null = null;
  for (const s of symbols) {
    const d = pointToSegment(centre, s.a, s.b).dist;
    if (d > reach) continue;
    if (!best || d < best.d) best = { kind: s.kind, d };
  }
  return best ? best.kind : null;
}

/**
 * Openings read from the symbol layers directly, for the ones that leave no
 * hole in the wall.
 *
 * Measured on a real ArchiCAD export: the wall polygons are cut for DOORS but
 * run straight through WINDOWS, which are drawn as glazing lines laid over an
 * unbroken wall. So the wall-gap method finds every door and almost no window.
 *
 * A window is well suited to being read from its symbol, because its lines run
 * ALONG the opening for its full width: projecting the parts that lie inside the
 * wall onto the wall's axis gives a dense band whose extent IS the opening.
 * That is not true of a door — its symbol is two jambs a door's-width apart plus
 * a swing arc, which is exactly the ambiguity ("two jambs of one door" vs "two
 * separate openings") this cannot resolve. Hence doors come from wall gaps and
 * windows come from here.
 */
export function symbolSpansOnWall(
  wall: Wall,
  symbols: KindedSeg[],
  opts: { insideMargin?: number; clusterGap?: number; minWidth?: number; maxWidth?: number } = {},
): { offset: number; width: number }[] {
  const insideMargin = opts.insideMargin ?? 14;
  const clusterGap = opts.clusterGap ?? 35;
  const minWidth = opts.minWidth ?? 35;
  const maxWidth = opts.maxWidth ?? 500;

  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const wallLen = Math.hypot(dx, dy);
  if (wallLen < 1) return [];
  const ux = dx / wallLen;
  const uy = dy / wallLen;
  const reach = wall.thickness / 2 + insideMargin;

  const ts: number[] = [];
  for (const s of symbols) {
    for (const p of [s.a, s.b]) {
      if (pointToSegment(p, wall.start, wall.end).dist > reach) continue;
      const t = (p.x - wall.start.x) * ux + (p.y - wall.start.y) * uy;
      if (t < -reach || t > wallLen + reach) continue;
      ts.push(t);
    }
  }
  if (ts.length < 3) return [];
  ts.sort((a, b) => a - b);

  const out: { offset: number; width: number }[] = [];
  let lo = ts[0];
  let hi = ts[0];
  const flush = () => {
    const width = hi - lo;
    if (width < minWidth || width > maxWidth || width > wallLen * 0.96) return;
    const offset = (lo + hi) / 2 / wallLen;
    if (offset > 0 && offset < 1) out.push({ offset, width });
  };
  for (let i = 1; i < ts.length; i++) {
    if (ts[i] - hi <= clusterGap) {
      hi = ts[i];
    } else {
      flush();
      lo = ts[i];
      hi = ts[i];
    }
  }
  flush();
  return out;
}
