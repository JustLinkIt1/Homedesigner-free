import type { FurnitureItem, Opening, Wall } from '../types';

const M = 0.01;

export interface WalkWallSegment {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  pad: number;
}

/** Build solid collision spans, leaving actual door and passage openings clear. */
export function buildWalkWallSegments(walls: Wall[], openings: Opening[]): WalkWallSegment[] {
  const byWall = new Map<string, Opening[]>();
  for (const opening of openings) {
    if (opening.type !== 'door' || opening.sill > 1) continue;
    const list = byWall.get(opening.wallId) ?? [];
    list.push(opening);
    byWall.set(opening.wallId, list);
  }

  return walls.flatMap((wall) => {
    const dx = wall.end.x - wall.start.x;
    const dz = wall.end.y - wall.start.y;
    const length = Math.hypot(dx, dz);
    if (length < 0.01) return [];

    // Merge overlapping doorway ranges so adjacent/double openings cannot
    // leave tiny invisible collision slivers between them.
    const ranges = (byWall.get(wall.id) ?? [])
      .map((opening) => ({
        start: Math.max(0, opening.offset * length - opening.width / 2 - 2),
        end: Math.min(length, opening.offset * length + opening.width / 2 + 2),
      }))
      .filter((range) => range.end > range.start)
      .sort((a, b) => a.start - b.start)
      .reduce<Array<{ start: number; end: number }>>((merged, range) => {
        const previous = merged[merged.length - 1];
        if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
        else merged.push({ ...range });
        return merged;
      }, []);

    const solids: Array<{ start: number; end: number }> = [];
    let cursor = 0;
    for (const range of ranges) {
      if (range.start > cursor) solids.push({ start: cursor, end: range.start });
      cursor = Math.max(cursor, range.end);
    }
    if (cursor < length) solids.push({ start: cursor, end: length });

    const ux = dx / length;
    const uz = dz / length;
    return solids.map((solid) => ({
      ax: (wall.start.x + ux * solid.start) * M,
      az: (wall.start.y + uz * solid.start) * M,
      bx: (wall.start.x + ux * solid.end) * M,
      bz: (wall.start.y + uz * solid.end) * M,
      pad: (wall.thickness * M) / 2,
    }));
  });
}

/** Position relative to a rotated furniture footprint, in metres. */
export function stairLocalPosition(item: FurnitureItem, x: number, z: number) {
  const dx = x - item.position.x * M;
  const dz = z - item.position.y * M;
  const angle = (item.rotation * Math.PI) / 180;
  return {
    // Furniture3D rotates the group by -item.rotation. Apply its inverse here
    // to recover the model's local footprint coordinates.
    x: dx * Math.cos(angle) + dz * Math.sin(angle),
    z: -dx * Math.sin(angle) + dz * Math.cos(angle),
  };
}

export function isAtStairEnd(item: FurnitureItem, x: number, z: number, end: 'low' | 'high') {
  const local = stairLocalPosition(item, x, z);
  const halfWidth = item.width * M / 2 + 0.22;
  const halfDepth = item.depth * M / 2;
  const landingDepth = Math.min(0.9, Math.max(0.55, item.depth * M * 0.38));
  if (Math.abs(local.x) > halfWidth) return false;
  return end === 'low'
    ? local.z >= -halfDepth - 0.3 && local.z <= -halfDepth + landingDepth
    : local.z <= halfDepth + 0.3 && local.z >= halfDepth - landingDepth;
}

/** Landing just beyond the stair's selected end, clear of its trigger zone. */
export function stairLanding(item: FurnitureItem, end: 'low' | 'high') {
  const angle = (item.rotation * Math.PI) / 180;
  const distance = item.depth * M / 2 + 1.05;
  const direction = end === 'high' ? 1 : -1;
  return {
    x: item.position.x * M - Math.sin(angle) * distance * direction,
    z: item.position.y * M + Math.cos(angle) * distance * direction,
  };
}
