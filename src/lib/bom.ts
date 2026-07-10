// Shopping-list / bill-of-materials aggregation: every placed furniture item
// across ALL storeys, grouped by catalog type + size (a resized copy is a
// different purchase, so it gets its own row).
import type { FloorInfo, FloorGeom } from '../types';

export interface BomRow {
  type: string;
  name: string;
  width: number;
  depth: number;
  height: number;
  count: number;
  /** Storey names this item appears on (deduped, in elevation order). */
  floors: string[];
}

export function buildBom(floors: FloorInfo[], floorGeom: Record<string, FloorGeom>): BomRow[] {
  const rows = new Map<string, BomRow>();
  const ordered = [...floors].sort((a, b) => a.elevation - b.elevation);
  for (const floor of ordered) {
    const geom = floorGeom[floor.id];
    if (!geom) continue;
    for (const f of geom.furniture) {
      const key = `${f.type}|${f.name}|${Math.round(f.width)}x${Math.round(f.depth)}x${Math.round(f.height)}`;
      const row = rows.get(key);
      if (row) {
        row.count++;
        if (!row.floors.includes(floor.name)) row.floors.push(floor.name);
      } else {
        rows.set(key, {
          type: f.type,
          name: f.name,
          width: f.width,
          depth: f.depth,
          height: f.height,
          count: 1,
          floors: [floor.name],
        });
      }
    }
  }
  // Most-numerous first, then alphabetical — reads like a shopping list.
  return [...rows.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function bomToCsv(rows: BomRow[]): string {
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = ['item,quantity,width_cm,depth_cm,height_cm,floors'];
  for (const r of rows) {
    lines.push(
      [esc(r.name), r.count, Math.round(r.width), Math.round(r.depth), Math.round(r.height), esc(r.floors.join('; '))].join(','),
    );
  }
  return lines.join('\n');
}

export function bomToText(rows: BomRow[], projectName: string): string {
  const lines = [`${projectName} — shopping list`, ''];
  for (const r of rows) {
    lines.push(`• ${r.count}× ${r.name} (${Math.round(r.width)}×${Math.round(r.depth)} cm)`);
  }
  lines.push('', `${rows.reduce((a, r) => a + r.count, 0)} items total`);
  return lines.join('\n');
}
