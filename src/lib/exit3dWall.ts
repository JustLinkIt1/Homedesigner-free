/**
 * The Pro wall, once per install, the first time a non-Pro user leaves 3D
 * with the view toggle (EXEC cycle 238). Trigger key `3d_exit`; the wall opens
 * with no feature, so it shows the generic Pro pitch (no new strings).
 *
 * Stored under `homedesigner.exit3dWall.v1` = 'shown' once it has opened.
 * The flag is written only when the wall actually opens: an exit that is
 * skipped (Pro, a dialog already open, Play's review card asked for this
 * session) leaves it unused for a later exit. Storage that cannot be read or
 * written counts as shown: it could not be remembered, so it never nags.
 *
 * No imports on purpose: tests/exit3d-wall.mjs runs this without a browser;
 * the stores are read by the caller (Toolbar.tsx).
 */
const KEY = 'homedesigner.exit3dWall.v1';

export interface Exit3DContext {
  /** The view switching away from (only '3d' counts). */
  from: string;
  isPro: boolean;
  /** A paywall, the points wallet, a confirmation or any modal is on screen. */
  dialogOpen: boolean;
  /** Play's in-app review card was asked for this launch (Android). */
  reviewAsked: boolean;
}

/** Pure: does this exit open the wall, given whether it has been shown? */
export function shouldShowExit3DWall(shown: boolean, ctx: Exit3DContext): boolean {
  return ctx.from === '3d' && !shown && !ctx.isPro && !ctx.dialogOpen && !ctx.reviewAsked;
}

export function exit3DWallShown(): boolean {
  try {
    return localStorage.getItem(KEY) === 'shown';
  } catch {
    return true;
  }
}

/** The user pressed 2D. Returns true (and calls `open`) when the wall opens. */
export function noteLeft3D(ctx: Exit3DContext, open: () => void): boolean {
  if (!shouldShowExit3DWall(exit3DWallShown(), ctx)) return false;
  try {
    localStorage.setItem(KEY, 'shown');
  } catch {
    return false; // not remembered: never show it, or it would show every time
  }
  open();
  return true;
}
