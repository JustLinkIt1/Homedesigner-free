// Recently-used catalog items (most recent first). Pure localStorage util —
// deliberately not store state: it never participates in undo/persist.
const KEY = 'homedesigner.recent.v1';
const MAX = 8;

export function getRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((t): t is string => typeof t === 'string') : [];
  } catch {
    return [];
  }
}

export function recordRecent(type: string): void {
  try {
    const next = [type, ...getRecent().filter((t) => t !== type)].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* best-effort */
  }
}
