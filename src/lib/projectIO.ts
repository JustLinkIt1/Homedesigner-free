import type { DesignSnapshot } from '../store/designStore';
import { saveText } from './native';
import { toast } from './ui';

/** Download the current design as a portable .json project file. */
export async function exportProject(snapshot: DesignSnapshot): Promise<void> {
  const data = JSON.stringify({ app: 'homedesigner-free', version: 1, ...snapshot }, null, 2);
  const slug = (snapshot.projectName || 'home').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'home';
  await saveText(data, `${slug}.json`);
}

/** Prompt for a .json project file and parse it into a snapshot. */
export function openProjectFile(): Promise<DesignSnapshot | null> {
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
        const snap: DesignSnapshot = {
          walls: arr(obj.walls),
          rooms: arr(obj.rooms),
          furniture: arr(obj.furniture),
          openings: arr(obj.openings),
          background: obj.background ?? null,
          projectName: typeof obj.projectName === 'string' ? obj.projectName : 'Imported home',
        };
        // Drop openings whose wall no longer exists.
        const wallIds = new Set(snap.walls.map((w) => w.id));
        snap.openings = snap.openings.filter((o) => wallIds.has(o.wallId));
        resolve(snap);
      } catch {
        toast.error('That file could not be read as a HomeDesigner project.');
        resolve(null);
      }
    };
    input.click();
  });
}
