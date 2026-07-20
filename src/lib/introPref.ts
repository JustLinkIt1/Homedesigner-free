// User preference for the animated-logo launch intro (IntroVideo). Persisted in
// localStorage so it survives relaunches; defaults ON. Stored separately from
// the per-session "already played" flag (sessionStorage) — this is the "never
// show it" switch for people who don't want the intro at all.
const KEY = 'hd-intro-enabled';

export function introEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) !== '0';
  } catch {
    return true;
  }
}

export function setIntroEnabled(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    /* private mode — ignore */
  }
}
