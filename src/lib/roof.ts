import type { FloorInfo, Roof } from '../types';

/**
 * Roof data helpers (pure — no three.js, so the store can import them).
 *
 * A roof belongs to the building, not to a storey, but it has to be *stored*
 * somewhere and `FloorInfo` is the only per-storey record that survives a round
 * trip untouched (see the note on `FloorInfo` in types/index.ts). So the roof is
 * kept on the highest storey and `normalizeRoofs` re-homes it whenever the
 * storey stack changes — add a floor above a roofed house and the roof moves up
 * with it instead of being buried inside the new storey.
 */

export const DEFAULT_ROOF: Roof = {
  type: 'gable',
  pitch: 30,
  overhang: 45,
  thickness: 18,
  covering: 'tile',
  coveringScaleCm: 100,
  color: '#b45f3c',
};

/** Id of the storey a roof sits on: the highest one (last wins on a tie). */
export function roofFloorId(floors: FloorInfo[]): string | null {
  if (!floors.length) return null;
  let best = floors[0];
  for (const f of floors) if (f.elevation >= best.elevation) best = f;
  return best.id;
}

/** The design's roof, wherever it currently lives. */
export function roofOf(floors: FloorInfo[]): Roof | null {
  const id = roofFloorId(floors);
  if (!id) return null;
  return floors.find((f) => f.id === id)?.roof ?? null;
}

function sanitize(roof: Roof): Roof {
  return {
    ...roof,
    pitch: Math.max(5, Math.min(60, Number(roof.pitch) || DEFAULT_ROOF.pitch)),
    overhang: Math.max(0, Math.min(200, Number(roof.overhang) || 0)),
    thickness: Math.max(2, Math.min(60, Number(roof.thickness) || DEFAULT_ROOF.thickness)),
    covering: roof.covering ?? DEFAULT_ROOF.covering,
    coveringScaleCm: Math.max(10, Math.min(400, Number(roof.coveringScaleCm) || DEFAULT_ROOF.coveringScaleCm)),
  };
}

/**
 * Ensure at most one roof exists and that it sits on the top storey. Safe on
 * every existing save (no roof anywhere → returns the input array unchanged).
 */
export function normalizeRoofs(floors: FloorInfo[]): FloorInfo[] {
  const roofed = floors.filter((f) => f.roof);
  if (!roofed.length) return floors;
  const topId = roofFloorId(floors);
  // If several storeys somehow carry a roof, the highest one's wins.
  const clean = sanitize(roofed[roofed.length - 1].roof as Roof);
  const settled =
    roofed.length === 1 &&
    roofed[0].id === topId &&
    (Object.keys(clean) as (keyof Roof)[]).every((k) => (roofed[0].roof as Roof)[k] === clean[k]);
  if (settled) return floors;
  return floors.map((f) => {
    if (f.id === topId) return { ...f, roof: clean };
    if (!f.roof) return f;
    const { roof: _drop, ...rest } = f;
    return rest;
  });
}
