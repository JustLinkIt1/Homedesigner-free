/**
 * When "watch your plan build itself" plays.
 *
 * Automatically the first time each project with walls is opened in 3D on
 * this device, never when the OS asks for reduced motion, and never under
 * automation (store screenshots and smoke tests drive the app with
 * navigator.webdriver set, and must never see a half-built house).
 *
 * Testing override, in the page URL: `?build=on` plays it every time 3D opens
 * on a project with walls, ignoring the rest above; `?build=off` never plays
 * it and hides the replay button.
 */

/** Ids of the projects that have already played it here, oldest first. */
const PLAYED_KEY = 'homedesigner.buildPlayed.v1';
const MAX_REMEMBERED = 200;

export type Override = 'on' | 'off' | null;

function override(): Override {
  try {
    const v = new URLSearchParams(window.location.search).get('build');
    return v === 'on' || v === 'off' ? v : null;
  } catch {
    return null;
  }
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** May it play at all (also decides whether the replay button shows)? */
export function buildAnimationAllowed(): boolean {
  const o = override();
  if (o) return o === 'on';
  return !prefersReducedMotion();
}

/** null when storage cannot be read: then it never plays by itself. */
function played(): string[] | null {
  try {
    const v = JSON.parse(localStorage.getItem(PLAYED_KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return null;
  }
}

export interface AutoBuildInputs {
  projectId: string | null;
  /** Walls on all storeys when 3D opens. */
  wallCount: number;
  /** Projects that already played here; null when storage cannot be read. */
  played: string[] | null;
  reducedMotion: boolean;
  webdriver: boolean;
  override: Override;
}

/**
 * Should opening 3D play it by itself? Pure. Nothing to build means no play,
 * even with ?build=on, so an empty project keeps its one play for later, when
 * a plan has been imported or walls drawn.
 */
export function shouldAutoBuild(i: AutoBuildInputs): boolean {
  if (i.wallCount < 1) return false;
  if (i.override) return i.override === 'on';
  if (!i.projectId || i.reducedMotion || i.webdriver || !i.played) return false;
  return !i.played.includes(i.projectId);
}

/** shouldAutoBuild with this device's settings. No side effects. */
export function autoBuildDue(projectId: string | null, wallCount: number): boolean {
  return shouldAutoBuild({
    projectId,
    wallCount,
    played: played(),
    reducedMotion: prefersReducedMotion(),
    webdriver: typeof navigator !== 'undefined' && !!navigator.webdriver,
    override: override(),
  });
}

export function markBuildPlayed(projectId: string | null): void {
  const seen = played();
  if (!projectId || !seen || seen.includes(projectId)) return;
  try {
    localStorage.setItem(PLAYED_KEY, JSON.stringify([...seen, projectId].slice(-MAX_REMEMBERED)));
  } catch {
    /* best-effort */
  }
}
