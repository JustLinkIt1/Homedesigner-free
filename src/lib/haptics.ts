// Thin, fire-and-forget haptics wrapper. No-ops on the web and never throws,
// so call sites can `void tapLight()` without guarding. Mirrors the dynamic-
// import pattern in native.ts to keep the plugin out of the web bundle path.
import { Capacitor } from '@capacitor/core';

type HModule = typeof import('@capacitor/haptics');
let mod: Promise<HModule> | null = null;
const load = (): Promise<HModule> | null => {
  if (!Capacitor.isNativePlatform()) return null;
  if (!mod) mod = import('@capacitor/haptics');
  return mod;
};

/** Light physical tap — tool selection, furniture placement. */
export function tapLight(): void {
  const p = load();
  if (!p) return;
  p.then(({ Haptics, ImpactStyle }) => Haptics.impact({ style: ImpactStyle.Light })).catch(() => {});
}

/** Firmer tap — long-press menus, confirmations. */
export function tapMedium(): void {
  const p = load();
  if (!p) return;
  p.then(({ Haptics, ImpactStyle }) => Haptics.impact({ style: ImpactStyle.Medium })).catch(() => {});
}

/** Subtle selection tick — fired once each time a snap is acquired. */
export function selectionTick(): void {
  const p = load();
  if (!p) return;
  p.then(({ Haptics }) => Haptics.selectionStart().then(() => Haptics.selectionChanged())).catch(() => {});
}

/** Notification buzz — deletes and other completed one-off actions. */
export function notify(type: 'success' | 'warning' | 'error' = 'success'): void {
  const p = load();
  if (!p) return;
  p.then(({ Haptics, NotificationType }) => {
    const map = {
      success: NotificationType.Success,
      warning: NotificationType.Warning,
      error: NotificationType.Error,
    } as const;
    return Haptics.notification({ type: map[type] });
  }).catch(() => {});
}
