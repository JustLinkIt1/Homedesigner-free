import { getGoogleIdToken } from './googleAuth';
import { applyCloudState, getCloudState, type CloudProjectRecord, type ProjectTombstone } from './projects';

const SYNC_URL = (import.meta.env.VITE_CLOUD_SYNC_URL ?? '').replace(/\/$/, '');
let syncPromise: Promise<number> | null = null;
let debounceTimer: number | null = null;

export function isCloudSyncConfigured(): boolean {
  return /^https:\/\//.test(SYNC_URL);
}

/** Returns the RevenueCat entitlement for the currently signed-in Google
 * account. The Worker derives the customer ID from the verified JWT, so the
 * browser cannot ask for another customer's purchase state. */
export async function getCloudProEntitlement(): Promise<boolean> {
  if (!isCloudSyncConfigured()) return false;
  const token = await getGoogleIdToken();
  const response = await fetch(`${SYNC_URL}/v1/entitlement`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Pro status check failed (${response.status}).`);
  const result = await response.json() as { isPro?: boolean };
  return result.isPro === true;
}

export async function syncProjects(): Promise<number> {
  if (!isCloudSyncConfigured()) return 0;
  if (syncPromise) return syncPromise;

  syncPromise = (async () => {
    const token = await getGoogleIdToken();
    const response = await fetch(`${SYNC_URL}/v1/sync`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(getCloudState()),
    });
    if (!response.ok) throw new Error(`Plan sync failed (${response.status}).`);
    const state = await response.json() as {
      projects: CloudProjectRecord[];
      tombstones: ProjectTombstone[];
    };
    return applyCloudState(state);
  })().finally(() => { syncPromise = null; });

  return syncPromise;
}

export async function deleteCloudProjects(): Promise<void> {
  if (!isCloudSyncConfigured()) throw new Error('Cloud sync is not configured.');
  const token = await getGoogleIdToken();
  const response = await fetch(`${SYNC_URL}/v1/account`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Cloud deletion failed (${response.status}).`);
}

export function startProjectSync(): () => void {
  if (!isCloudSyncConfigured()) return () => {};
  const schedule = () => {
    if (debounceTimer !== null) window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => void syncProjects().catch(() => {}), 5000);
  };
  window.addEventListener('project-local-change', schedule);
  return () => {
    window.removeEventListener('project-local-change', schedule);
    if (debounceTimer !== null) window.clearTimeout(debounceTimer);
    debounceTimer = null;
  };
}
