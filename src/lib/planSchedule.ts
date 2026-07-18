// Plan-pack schedules: per-storey room areas and an aggregated door/window
// schedule. Feeds the Pro PDF export (planExport.ts); kept UI-free so it can
// be unit-tested and reused (e.g. a future on-screen summary).
import { polygonArea } from './geometry';
import type { FloorInfo, FloorGeom, Opening } from '../types';

export interface RoomRow {
  name: string;
  /** Bounding-box footprint (cm). */
  width: number;
  depth: number;
  /** Polygon area (cm²). */
  area: number;
}

export interface FloorSchedule {
  floorName: string;
  rooms: RoomRow[];
  /** Sum of room areas on this storey (cm²). */
  totalArea: number;
}

export interface OpeningRow {
  /** English display label (translate at render time), e.g. "Double door". */
  label: string;
  width: number;
  height: number;
  count: number;
}

/** English label for an opening; used as an i18n key by the PDF export. */
export function openingLabel(o: Opening): string {
  if (o.type === 'door') {
    switch (o.style) {
      case 'double': return 'Double door';
      case 'sliding': return 'Sliding door';
      case 'pocket': return 'Pocket door';
      case 'bifold': return 'Bi-fold door';
      case 'passage': return 'Passage';
      case 'arch': return 'Arch';
      default: return 'Single door';
    }
  }
  switch (o.style) {
    case 'french': return 'French window';
    case 'casement': return 'Casement window';
    case 'sliding': return 'Sliding window';
    default: return 'Window';
  }
}

const byElevation = (floors: FloorInfo[]) => [...floors].sort((a, b) => a.elevation - b.elevation);

/** Room rows per storey (elevation order), largest room first. */
export function buildFloorSchedules(
  floors: FloorInfo[],
  floorGeom: Record<string, FloorGeom>,
): FloorSchedule[] {
  return byElevation(floors).map((floor) => {
    const geom = floorGeom[floor.id];
    const rooms: RoomRow[] = (geom?.rooms ?? [])
      .filter((r) => r.points.length >= 3)
      .map((r) => {
        const xs = r.points.map((p) => p.x);
        const ys = r.points.map((p) => p.y);
        return {
          name: r.name,
          width: Math.max(...xs) - Math.min(...xs),
          depth: Math.max(...ys) - Math.min(...ys),
          area: Math.abs(polygonArea(r.points)),
        };
      })
      .sort((a, b) => b.area - a.area);
    return {
      floorName: floor.name,
      rooms,
      totalArea: rooms.reduce((sum, r) => sum + r.area, 0),
    };
  });
}

/** Doors & windows across ALL storeys, grouped by kind + size. */
export function buildOpeningSchedule(
  floors: FloorInfo[],
  floorGeom: Record<string, FloorGeom>,
): OpeningRow[] {
  const rows = new Map<string, OpeningRow>();
  for (const floor of byElevation(floors)) {
    for (const o of floorGeom[floor.id]?.openings ?? []) {
      const label = openingLabel(o);
      const key = `${label}|${Math.round(o.width)}x${Math.round(o.height)}`;
      const row = rows.get(key);
      if (row) row.count++;
      else rows.set(key, { label, width: o.width, height: o.height, count: 1 });
    }
  }
  // Doors first (alphabetical groups read naturally), then most-numerous.
  return [...rows.values()].sort(
    (a, b) => a.label.localeCompare(b.label) || b.count - a.count || b.width - a.width,
  );
}
