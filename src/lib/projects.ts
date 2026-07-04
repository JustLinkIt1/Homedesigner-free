// Multi-project persistence. Layout:
//   homedesigner.projects.index.v1  -> ProjectMeta[] (id, name, updatedAt, thumbnail)
//   homedesigner.project.<id>       -> DesignSnapshot JSON (unchanged shape)
//   homedesigner.activeProject.v1   -> current id
// The legacy single-slot key (homedesigner.project.v1) is migrated into the
// index on first load and kept for one release as rollback insurance.
//
// saveActive()/loadActive() keep the exact contract the store's old persist/
// loadInitial had, so the commit() hot path is untouched.

import { uid } from './geometry';

export interface ProjectMeta {
  id: string;
  name: string;
  updatedAt: number;
  /** Small JPEG dataURL (~10-20 KB) captured from the 2D plan. */
  thumbnail?: string;
}

const INDEX_KEY = 'homedesigner.projects.index.v1';
const ACTIVE_KEY = 'homedesigner.activeProject.v1';
const LEGACY_KEY = 'homedesigner.project.v1';
const projectKey = (id: string) => `homedesigner.project.${id}`;

const readJSON = <T,>(key: string): T | null => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};

const writeJSON = (key: string, value: unknown): boolean => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
};

export function listProjects(): ProjectMeta[] {
  return readJSON<ProjectMeta[]>(INDEX_KEY) ?? [];
}

function writeIndex(index: ProjectMeta[]): void {
  writeJSON(INDEX_KEY, index);
}

export function getActiveId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function setActiveId(id: string): void {
  try {
    localStorage.setItem(ACTIVE_KEY, id);
  } catch {
    /* ignore */
  }
}

/** One-time migration of the legacy single-slot save into the index. */
function migrate(): void {
  if (listProjects().length > 0 || getActiveId()) return;
  const legacy = readJSON<{ projectName?: string }>(LEGACY_KEY);
  if (!legacy) return;
  const id = uid();
  writeJSON(projectKey(id), legacy);
  writeIndex([{ id, name: legacy.projectName || 'My home', updatedAt: Date.now() }]);
  setActiveId(id);
  // LEGACY_KEY intentionally left in place for one release as a rollback copy.
}
migrate();

/** Raw snapshot of the active project (the store parses/validates it). */
export function loadActive(): unknown | null {
  const id = getActiveId();
  if (id) {
    const snap = readJSON(projectKey(id));
    if (snap) return snap;
  }
  // Fresh install (or index lost): fall back to the legacy slot.
  return readJSON(LEGACY_KEY);
}

// Index writes are throttled: persist runs on every edit and rewriting the
// (thumbnail-carrying) index each keystroke would be wasteful.
let lastIndexWrite = 0;

/** Persist the active project's snapshot. Returns false on quota failure. */
export function saveActive(snap: { projectName: string }): boolean {
  let id = getActiveId();
  if (!id) {
    // First save ever: mint the project on the fly.
    id = uid();
    setActiveId(id);
    writeIndex([{ id, name: snap.projectName, updatedAt: Date.now() }, ...listProjects()]);
  }
  const ok = writeJSON(projectKey(id), snap);
  const now = Date.now();
  if (ok && now - lastIndexWrite > 2000) {
    lastIndexWrite = now;
    touchMeta(id, { name: snap.projectName, updatedAt: now });
  }
  return ok;
}

function touchMeta(id: string, patch: Partial<ProjectMeta>): void {
  const index = listProjects();
  const i = index.findIndex((p) => p.id === id);
  if (i >= 0) {
    index[i] = { ...index[i], ...patch };
  } else {
    index.unshift({ id, name: 'My home', updatedAt: Date.now(), ...patch });
  }
  writeIndex(index);
}

/** Create a new empty project and make it active. Returns its id. */
export function createProject(name = 'Untitled home'): string {
  const id = uid();
  writeIndex([{ id, name, updatedAt: Date.now() }, ...listProjects()]);
  setActiveId(id);
  return id;
}

export function renameProject(id: string, name: string): void {
  touchMeta(id, { name, updatedAt: Date.now() });
  // Keep the snapshot's own projectName in sync, otherwise the next autosave
  // would write the old name straight back into the index.
  const snap = readJSON<{ projectName?: string }>(projectKey(id));
  if (snap) writeJSON(projectKey(id), { ...snap, projectName: name });
}

export function deleteProject(id: string): void {
  writeIndex(listProjects().filter((p) => p.id !== id));
  try {
    localStorage.removeItem(projectKey(id));
  } catch {
    /* ignore */
  }
  if (getActiveId() === id) {
    try {
      localStorage.removeItem(ACTIVE_KEY);
    } catch {
      /* ignore */
    }
  }
}

/** Copy a project (snapshot + meta). The active project is unchanged. */
export function duplicateProject(id: string): string | null {
  const snap = readJSON<{ projectName?: string }>(projectKey(id));
  if (!snap) return null;
  const meta = listProjects().find((p) => p.id === id);
  const newId = uid();
  const name = `${meta?.name ?? snap.projectName ?? 'Project'} copy`;
  if (!writeJSON(projectKey(newId), { ...snap, projectName: name })) return null;
  writeIndex([{ id: newId, name, updatedAt: Date.now(), thumbnail: meta?.thumbnail }, ...listProjects()]);
  return newId;
}

/** Load a project's raw snapshot without changing the active id. */
export function readProject(id: string): unknown | null {
  return readJSON(projectKey(id));
}

export function setThumbnail(id: string, dataUrl: string): void {
  touchMeta(id, { thumbnail: dataUrl });
}
