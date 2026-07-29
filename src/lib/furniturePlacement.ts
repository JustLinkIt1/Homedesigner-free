import type { CatalogEntry } from '../data/furnitureCatalog';
import { CATALOG_BY_TYPE } from '../data/furnitureCatalog';
import type { FurnitureItem, Point } from '../types';

/** Small décor is safe to place on a supporting object even when an older
 * manifest does not yet carry the explicit placement hint. */
export function isSurfacePlaceable(entry?: CatalogEntry): boolean {
  if (!entry) return false;
  if (entry.placement === 'surface') return true;
  return (
    entry.category === 'Decor' &&
    entry.width <= 90 && entry.depth <= 90 && entry.height <= 80 &&
    entry.shape !== 'rug'
  ) || entry.shape === 'desk_lamp' || entry.shape === 'monitor';
}

export function isWallPlaceable(entry?: CatalogEntry): boolean {
  if (!entry) return false;
  return entry.placement === 'wall' || entry.mountY != null || /wall[ _-]?mount/i.test(`${entry.type} ${entry.name}`);
}

/** Highest object top beneath a plan point. Rotation is respected, so a lamp
 * dropped on a turned sideboard still lands on the sideboard rather than the
 * floor. */
export function supportElevationAt(point: Point, furniture: FurnitureItem[], excludeId?: string): number {
  let top = 0;
  for (const item of furniture) {
    if (item.id === excludeId || item.height < 15) continue;
    const entry = CATALOG_BY_TYPE[item.type];
    if (entry?.shape === 'rug' || entry?.shape === 'pendant' || entry?.shape === 'ceiling_light') continue;
    const angle = (item.rotation * Math.PI) / 180;
    const dx = point.x - item.position.x;
    const dy = point.y - item.position.y;
    const localX = dx * Math.cos(angle) + dy * Math.sin(angle);
    const localY = -dx * Math.sin(angle) + dy * Math.cos(angle);
    if (Math.abs(localX) > item.width / 2 || Math.abs(localY) > item.depth / 2) continue;
    top = Math.max(top, (item.elevation ?? entry?.mountY ?? 0) + item.height);
  }
  return top;
}
