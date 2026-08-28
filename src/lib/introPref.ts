// Every install gets one automatic intro, then recurring playback defaults off.
// People who enjoy it can explicitly opt back in from Settings.
const KEY = 'hd-intro-enabled';
const FIRST_PLAY_KEY = 'hd-intro-first-played';

export function introEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function shouldPlayIntro(): boolean {
  try {
    return localStorage.getItem(FIRST_PLAY_KEY) !== '1' || introEnabled();
  } catch {
    return false;
  }
}

export function markIntroPlayed(): void {
  try {
    localStorage.setItem(FIRST_PLAY_KEY, '1');
  } catch {
    /* private mode — ignore */
  }
}

export function setIntroEnabled(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    /* private mode — ignore */
  }
}
