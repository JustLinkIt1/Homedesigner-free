import type { DesignSnapshot, MaybeFloored } from '../store/designStore';
import { saveText } from './native';
import { toast } from './ui';
import { t } from './i18n';
import { slugify } from './appInfo';

/** Download the current design as a portable .json project file. */
export async function exportProject(snapshot: DesignSnapshot): Promise<void> {
  // `app` tag kept as-is: existing exported files carry it, and import matches on it loosely.
  // `version` is informational only — forward compatibility relies on the
  // `??`-fallbacks in openProjectFile/loadSnapshot, not on migrations. Bump it
  // (and add a real migration) only if a field is ever renamed/reshaped.
  const data = JSON.stringify({ app: 'homedesigner-free', version: 1, ...snapshot }, null, 2);
  await saveText(data, `${slugify(snapshot.projectName)}.json`);
}

/** Prompt for a .json project file and parse it into a snapshot. */
export function openProjectFile(): Promise<MaybeFloored | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      try {
        const text = await file.text();
        const obj = JSON.parse(text);
        const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
        const snap: MaybeFloored = {
          walls: arr(obj.walls),
          rooms: arr(obj.rooms),
          furniture: arr(obj.furniture),
          openings: arr(obj.openings),
          background: obj.background ?? null,
          projectName: typeof obj.projectName === 'string' ? obj.projectName : 'Imported home',
          // Preserve multi-floor data when the file has it.
          floors: Array.isArray(obj.floors) ? obj.floors : undefined,
          floorGeom: obj.floorGeom && typeof obj.floorGeom === 'object' ? obj.floorGeom : undefined,
          activeFloorId: typeof obj.activeFloorId === 'string' ? obj.activeFloorId : undefined,
        };
        // Drop openings whose wall no longer exists — on the top-level
        // (active-floor) geometry AND inside every stored storey, so a stale
        // multi-floor file can't smuggle orphans onto non-active floors.
        const wallIds = new Set(snap.walls.map((w) => w.id));
        snap.openings = snap.openings.filter((o) => wallIds.has(o.wallId));
        if (snap.floorGeom) {
          for (const fid of Object.keys(snap.floorGeom)) {
            const g = snap.floorGeom[fid];
            if (!g || !Array.isArray(g.walls) || !Array.isArray(g.openings)) continue;
            const ids = new Set(g.walls.map((w) => w.id));
            g.openings = g.openings.filter((o) => ids.has(o.wallId));
          }
        }
        resolve(snap);
      } catch {
        toast.error(t('That file could not be read as a HomeDesigner project.'));
        resolve(null);
      }
    };
    input.click();
  });
}
