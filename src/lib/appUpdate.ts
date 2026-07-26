import { create } from 'zustand';
import { APP_VERSION } from './appInfo';
import { isNative } from './native';

/**
 * "There's a new version" on startup.
 *
 * Two different mechanisms behind one piece of state, because the two builds
 * update in genuinely different ways:
 *
 *  - **Android** asks Google Play. Play knows what is published and can download
 *    a new build in the background while the app stays usable (a "flexible"
 *    update), then swap it in on restart. Nothing else can offer that, so the
 *    native path uses it rather than sending people to a store listing.
 *  - **Web** compares the version compiled into the running bundle against
 *    `version.json` sitting next to it. A tab left open for a week keeps running
 *    the bundle it loaded; this is how it finds out otherwise. Updating is a
 *    reload.
 *
 * The whole thing is best-effort by design. A failed check must never be
 * visible: no network, an offline device, a Play build installed by sideload
 * rather than from the store — all of those are normal, and all of them just
 * mean no prompt.
 */

export interface UpdateState {
  /** A newer version exists. */
  available: boolean;
  /** The version on offer, when we know it (web always does; Play does not). */
  version: string | null;
  /** Play has finished downloading and is waiting to install. */
  readyToInstall: boolean;
  /** An install/download is in flight. */
  busy: boolean;
}

interface UpdateStore extends UpdateState {
  set: (patch: Partial<UpdateState>) => void;
  dismiss: () => void;
}

const DISMISS_KEY = 'homedesigner.update.dismissed';

export const useAppUpdate = create<UpdateStore>((set, get) => ({
  available: false,
  version: null,
  readyToInstall: false,
  busy: false,
  set: (patch) => set(patch),
  dismiss: () => {
    // Remember WHICH version was waved away, so the next release still asks.
    try {
      localStorage.setItem(DISMISS_KEY, get().version ?? 'unknown');
    } catch {
      /* private mode */
    }
    set({ available: false });
  },
}));

/** Was this exact version already dismissed by the user? */
function wasDismissed(version: string | null): boolean {
  try {
    return !!version && localStorage.getItem(DISMISS_KEY) === version;
  } catch {
    return false;
  }
}

/**
 * Compare dotted numeric versions. Returns true when `candidate` is newer than
 * `current`. Anything unparseable compares as not-newer, so a malformed
 * manifest can never nag users into a pointless reload.
 */
export function isNewer(candidate: string, current: string): boolean {
  const parse = (v: string) => {
    const m = String(v).trim().match(/^(\d+)\.(\d+)\.(\d+)/);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
  };
  const a = parse(candidate);
  const b = parse(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return false;
}

/** Where `version.json` lives, relative to the running bundle. */
function manifestUrl(): string {
  // import.meta.url points at the hashed chunk in /assets, so go up one level.
  try {
    return new URL('../version.json', import.meta.url).href;
  } catch {
    return 'version.json';
  }
}

async function checkWeb(): Promise<void> {
  const res = await fetch(`${manifestUrl()}?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) return;
  const data = (await res.json()) as { version?: string };
  const next = typeof data?.version === 'string' ? data.version : null;
  if (!next || !isNewer(next, APP_VERSION) || wasDismissed(next)) return;
  useAppUpdate.getState().set({ available: true, version: next });
}

async function checkNative(): Promise<void> {
  const { AppUpdate, AppUpdateAvailability } = await import('@capawesome/capacitor-app-update');
  const info = await AppUpdate.getAppUpdateInfo();
  if (info.updateAvailability !== AppUpdateAvailability.UPDATE_AVAILABLE) return;
  const next = info.availableVersionName ?? info.availableVersionCode ?? null;
  const version = next === null ? null : String(next);
  if (wasDismissed(version)) return;
  useAppUpdate.getState().set({ available: true, version });
}

/**
 * Look for a newer version. Safe to call repeatedly and safe to call at
 * startup: every failure path is swallowed.
 */
export async function checkForUpdate(): Promise<void> {
  if (useAppUpdate.getState().busy) return;
  try {
    if (isNative()) await checkNative();
    else await checkWeb();
  } catch {
    /* offline, blocked, sideloaded, or no manifest — stay quiet */
  }
}

/**
 * Act on the offer. On Android this starts Play's background download and, once
 * it lands, installs it. On the web it reloads onto the new bundle.
 */
export async function applyUpdate(): Promise<void> {
  const store = useAppUpdate.getState();
  if (store.busy) return;
  if (!isNative()) {
    // Reload from the network rather than the bfcache, or we come back to the
    // same bundle we are trying to leave.
    location.reload();
    return;
  }
  store.set({ busy: true });
  try {
    const { AppUpdate, FlexibleUpdateInstallStatus } = await import('@capawesome/capacitor-app-update');
    const result = await AppUpdate.startFlexibleUpdate();
    // The user can decline Play's sheet; that is not an error.
    if (result.code === undefined || result.code === null) {
      useAppUpdate.getState().set({ busy: false });
      return;
    }
    void FlexibleUpdateInstallStatus;
    await AppUpdate.completeFlexibleUpdate();
    useAppUpdate.getState().set({ busy: false, available: false, readyToInstall: false });
  } catch {
    // Play refused, no network, or this build did not come from the store.
    useAppUpdate.getState().set({ busy: false });
  }
}

/** Open the store listing — the fallback when an in-app update isn't possible. */
export async function openStoreListing(): Promise<void> {
  try {
    const { AppUpdate } = await import('@capawesome/capacitor-app-update');
    await AppUpdate.openAppStore();
  } catch {
    /* nothing sensible to do */
  }
}
