/**
 * A short hash of what a design contains, for telling a bundled sample's first
 * real edit from re-saves of the sample (src/lib/projects.ts, noteSampleSave).
 * Every storey counts, with the one on screen taken from the top-level mirror,
 * in a fixed order: switching floors changes the mirror but not this key. The
 * project name and which floor is showing are not content.
 */
type Geom = { walls: unknown; rooms: unknown; furniture: unknown; openings: unknown };
type Snap = Geom & { floors?: unknown; floorGeom?: Record<string, Geom>; activeFloorId?: string };

export function sampleContentKey(snap: Snap): string {
  const mirror: Geom = { walls: snap.walls, rooms: snap.rooms, furniture: snap.furniture, openings: snap.openings };
  const geom: Record<string, Geom> = { ...(snap.floorGeom ?? {}), ...(snap.activeFloorId ? { [snap.activeFloorId]: mirror } : {}) };
  const storeys = Object.keys(geom).sort().map((key) => {
    const g = geom[key];
    return [key, g.walls, g.rooms, g.furniture, g.openings];
  });
  const text = JSON.stringify([snap.floors ?? null, storeys]);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return `${text.length}:${(h >>> 0).toString(36)}`;
}
