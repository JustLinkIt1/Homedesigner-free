// User-curated catalog shortcuts. Kept outside the design store because this
// preference is device UI state: it should not enter project JSON or undo.
const KEY = 'homedesigner.favorites.v1';

export function getFavorites(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(value)
      ? [...new Set(value.filter((type): type is string => typeof type === 'string'))]
      : [];
  } catch {
    return [];
  }
}

export function toggleFavorite(type: string): string[] {
  const current = getFavorites();
  const next = current.includes(type)
    ? current.filter((value) => value !== type)
    : [...current, type];
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* best-effort */
  }
  return next;
}
