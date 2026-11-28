/**
 * The first project a NEW install opens starts in 3D, once (EXEC cycle 156).
 *
 * "New" is decided on the launch that creates the install, never later: that
 * launch is the one where events.ts finds no first-open marker and none of the
 * older projects' storage, i.e. it is not an update of an existing install.
 * Every other launch with no answer stored yet (an update of an install that
 * already has projects, or one that opened 1.22.45-47 and never reached 3D)
 * is written down as 'skip' and never gets this.
 *
 * Stored under `homedesigner.first3d.v1`:
 *   pending  new install, not used yet
 *   done     it happened (or was offered) once
 *   skip     an existing install: never
 *
 * A project with no walls (Start from scratch) stays 2D and does not use it
 * up. The build animation plays by itself the first time 3D opens on a project
 * with walls, so this open gets it once and nothing here touches it.
 */
const KEY = 'homedesigner.first3d.v1';

export type First3DState = 'pending' | 'done' | 'skip' | null;

/** Pure: may this editor entry open in 3D? */
export function shouldOpenFirst3D(state: First3DState, wallCount: number, webdriver: boolean): boolean {
  return state === 'pending' && wallCount > 0 && !webdriver;
}

function read(): First3DState {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'pending' || v === 'done' || v === 'skip' ? v : null;
  } catch {
    return 'skip'; // storage unavailable: never do it, it could not be remembered
  }
}

function write(v: Exclude<First3DState, null>): void {
  try {
    localStorage.setItem(KEY, v);
  } catch {
    /* best-effort */
  }
}

/** Call once at startup with whether this launch created the install. */
export function initFirst3D(freshInstall: boolean): void {
  if (read() === null) write(freshInstall ? 'pending' : 'skip');
}

let autoOpened = false;

/** Did the 3D view of this session open by itself (for the view_3d_opened detail)? */
export function wasAuto3D(): boolean {
  return autoOpened;
}

/** Entering the editor: true means the caller must switch to 3D now. */
export function takeFirst3D(wallCount: number): boolean {
  const webdriver = typeof navigator !== 'undefined' && !!navigator.webdriver;
  if (!shouldOpenFirst3D(read(), wallCount, webdriver)) return false;
  write('done');
  autoOpened = true;
  return true;
}

/**
 * A shared plan link chose to open in 2D (an empty room to arrange, S2b): use
 * the new install's one auto-open up so the editor entry right after it does
 * not flip the view to 3D. Leaves 'skip' and 'done' as they are.
 */
export function skipFirst3D(): void {
  if (read() === 'pending') write('done');
}

/** An import just put walls on the plan of a project the user created. */
export function openFirst3DAfterImport(wallCount: number): boolean {
  return takeFirst3D(wallCount);
}
