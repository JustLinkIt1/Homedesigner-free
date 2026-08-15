import { getGoogleIdToken } from './googleAuth';
import { applyCloudState, getCloudState, type CloudProjectRecord, type ProjectTombstone } from './projects';

const SYNC_URL = (import.meta.env.VITE_CLOUD_SYNC_URL ?? '').replace(/\/$/, '');
let syncPromise: Promise<number> | null = null;
let debounceTimer: number | null = null;

export function isCloudSyncConfigured(): boolean {
  return /^https:\/\//.test(SYNC_URL);
}

const NETWORK_TIMEOUT_MS = 15_000;

/**
 * `fetch` with a bound, because a phone's connection does not fail cleanly.
 * A dead cell handoff, a captive portal or a sleeping radio leaves the request
 * PENDING rather than rejecting it — and nothing above this file re-bounds it.
 *
 * That is not a theoretical leak. `syncNow()`/`signIn()` in the auth store await
 * these inside `Promise.allSettled`, which never settles if one member never
 * settles, so `busy` stuck true — and the Pro sheet renders its primary button
 * as a spinner while any auth work is busy. The visible result was a
 * permanently spinning, permanently DISABLED "Unlock Pro" button on a sheet the
 * user had only just opened, with no Play sheet possible because no purchase
 * was ever started. Reported as "it hangs and I never click anything".
 *
 * `AbortController` rather than `AbortSignal.timeout()`: the latter needs a
 * WebView newer than the oldest this app still supports, and aborting also
 * releases the socket instead of leaking it for the life of the process.
 */
async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    // A caller cannot act on a bare AbortError, and must never mistake "we gave
    // up waiting" for "the server said no".
    if (controller.signal.aborted) {
      // eslint-disable-next-line preserve-caught-error -- AbortError carries no useful cause
      throw new Error('The network did not respond. Check your connection and try again.');
    }
    throw err;
  } finally {
    window.clearTimeout(timer);
  }
}

/** Returns the RevenueCat entitlement for the currently signed-in Google
 * account. The Worker derives the customer ID from the verified JWT, so the
 * browser cannot ask for another customer's purchase state. */
export async function getCloudProEntitlement(): Promise<boolean> {
  if (!isCloudSyncConfigured()) return false;
  const token = await getGoogleIdToken();
  const response = await fetchWithTimeout(`${SYNC_URL}/v1/entitlement`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Pro status check failed (${response.status}).`);
  const result = await response.json() as { isPro?: boolean };
  return result.isPro === true;
}

/** Verify and acknowledge a Play purchase without requiring app sign-in.
 * The purchase token is an unforgeable store receipt; the Worker asks Google
 * for its state before returning active. Account ownership is attached later. */
export async function verifyPlayPurchase(purchaseToken: string): Promise<boolean> {
  if (!isCloudSyncConfigured()) {
    throw new Error('Purchase verification is not configured in this build.');
  }
  const response = await fetchWithTimeout(`${SYNC_URL}/v1/play/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ purchaseToken }),
  });
  const result = await response.json().catch(() => ({})) as { active?: boolean; error?: string };
  if (!response.ok) throw new Error(result.error || `Purchase verification failed (${response.status}).`);
  return result.active === true;
}

/** Attach device-owned Play receipts to the signed-in Google account. The
 * Worker rejects a token already attached to a different account. */
export async function linkPlayPurchases(purchaseTokens: string[]): Promise<boolean> {
  if (!isCloudSyncConfigured() || purchaseTokens.length === 0) return false;
  const token = await getGoogleIdToken();
  const response = await fetchWithTimeout(`${SYNC_URL}/v1/play/link`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ purchaseTokens: [...new Set(purchaseTokens)].slice(0, 10) }),
  });
  const result = await response.json().catch(() => ({})) as { isPro?: boolean; error?: string };
  if (!response.ok) throw new Error(result.error || `Purchase linking failed (${response.status}).`);
  return result.isPro === true;
}

export async function syncProjects(): Promise<number> {
  if (!isCloudSyncConfigured()) return 0;
  if (syncPromise) return syncPromise;

  syncPromise = (async () => {
    const token = await getGoogleIdToken();
    const response = await fetchWithTimeout(`${SYNC_URL}/v1/sync`, {
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
  const response = await fetchWithTimeout(`${SYNC_URL}/v1/account`, {
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
