export type Units = 'metric' | 'imperial';

const CM_PER_IN = 2.54;

/** Format a centimetre length for display in the user's chosen units. */
export function formatLength(cm: number, units: Units): string {
  if (units === 'imperial') {
    const totalIn = cm / CM_PER_IN;
    let ft = Math.floor(totalIn / 12);
    let inch = Math.round(totalIn - ft * 12);
    if (inch === 12) {
      ft += 1;
      inch = 0;
    }
    if (ft === 0) return `${inch}"`;
    return inch === 0 ? `${ft}'` : `${ft}'${inch}"`;
  }
  return cm >= 100 ? `${(cm / 100).toFixed(2)} m` : `${Math.round(cm)} cm`;
}

/** Format a cm² area for display. */
export function formatArea(cm2: number, units: Units): string {
  const m2 = Math.abs(cm2) / 10000;
  if (units === 'imperial') return `${(m2 * 10.7639).toFixed(1)} ft²`;
  return `${m2.toFixed(2)} m²`;
}
