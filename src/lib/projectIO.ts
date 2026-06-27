import type { DesignSnapshot } from '../store/designStore';
import { saveText } from './native';

/** Download the current design as a portable .json project file. */
export async function exportProject(snapshot: DesignSnapshot): Promise<void> {
  const data = JSON.stringify({ app: 'homedesigner-free', version: 1, ...snapshot }, null, 2);
  const stamp = new Date().toISOString().slice(0, 10);
  await saveText(data, `homedesign-${stamp}.json`);
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
        resolve({
          walls: obj.walls ?? [],
          rooms: obj.rooms ?? [],
          furniture: obj.furniture ?? [],
          openings: obj.openings ?? [],
          background: obj.background ?? null,
        });
      } catch {
        alert('That file could not be read as a HomeDesigner project.');
        resolve(null);
      }
    };
    input.click();
  });
}
