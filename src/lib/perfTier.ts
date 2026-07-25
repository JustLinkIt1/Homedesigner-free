/**
 * 3D quality tiering.
 *
 * The viewer used to branch on a single `matchMedia('(pointer: coarse)')` check,
 * which meant *every* touch device — including current flagship phones and iPads —
 * lost real-time shadows, contact shadows, soft shadows and post-processing
 * outright. That is most of the app's audience, since HomeDesigner ships on
 * Android: the sun and shadow work is invisible to them.
 *
 * So we grade the device instead of asking "is it touch?", and let the user
 * override the guess. Detection is deliberately conservative — when we can't
 * tell, a touch device lands on 'mid' (shadows, no post-processing) rather than
 * 'high', because a wrong 'high' costs frames while a wrong 'mid' only costs
 * a little polish.
 */

export type PerfTier = 'low' | 'mid' | 'high';
/** What the user picked in Settings. 'auto' defers to detection. */
export type QualityPref = 'auto' | 'low' | 'mid' | 'high';

const QUALITY_KEY = 'hd-quality';

export function qualityPref(): QualityPref {
  try {
    const v = localStorage.getItem(QUALITY_KEY);
    if (v === 'low' || v === 'mid' || v === 'high') return v;
  } catch {
    /* private mode */
  }
  return 'auto';
}

export function setQualityPref(v: QualityPref): void {
  try {
    if (v === 'auto') localStorage.removeItem(QUALITY_KEY);
    else localStorage.setItem(QUALITY_KEY, v);
  } catch {
    /* private mode */
  }
}

const isTouch = () =>
  typeof window !== 'undefined' &&
  !!window.matchMedia &&
  window.matchMedia('(pointer: coarse)').matches;

/**
 * NB: we deliberately do NOT sniff `WEBGL_debug_renderer_info` here.
 * Doing so means creating a throwaway WebGL context during render, and this app
 * already runs several live canvases at once (the main scene plus a preview
 * canvas per catalog item). Browsers cap concurrent contexts, and the extra
 * create/lose churn destabilised the catalog list badly enough to fail the smoke
 * suite. Core count, memory and pointer type are coarser but cost nothing and
 * cannot perturb the renderer — and the user can always override in Settings.
 */

let detected: PerfTier | null = null;

/** Grade this device once per page load. */
export function detectTier(): PerfTier {
  if (detected) return detected;

  if (typeof navigator === 'undefined') return (detected = 'high');

  const cores = navigator.hardwareConcurrency ?? 0;
  // Non-standard but widely available on Chrome/Android, which is our main target.
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 0;

  // Desktop/laptop: assume capable.
  if (!isTouch()) return (detected = 'high');

  // Touch device. Budget phones (few cores / little RAM) keep the stripped path;
  // anything mid-range or better gets shadows back.
  if (cores <= 4 || (mem > 0 && mem <= 2)) detected = 'low';
  else if (cores >= 8 && (mem === 0 || mem >= 6)) detected = 'high';
  else detected = 'mid';
  return detected;
}

/** The tier actually in force, honouring the user's Settings override. */
export function activeTier(): PerfTier {
  const pref = qualityPref();
  return pref === 'auto' ? detectTier() : pref;
}

export interface TierCaps {
  tier: PerfTier;
  /** Real-time sun shadows. */
  shadows: boolean;
  shadowMapSize: number;
  /** drei SoftShadows (PCSS) — desktop-class only, it's a shader-heavy patch. */
  softShadows: boolean;
  contactShadows: boolean;
  /** N8AO + Bloom + ACES composer. */
  post: boolean;
  envResolution: number;
  /** Derive normal maps from albedo (A5) — skipped on low to save CPU/memory. */
  derivedNormals: boolean;
  maxDpr: number;
}

export function tierCaps(tier: PerfTier, touch = isTouch()): TierCaps {
  switch (tier) {
    case 'low':
      return {
        tier, shadows: false, shadowMapSize: 0, softShadows: false,
        contactShadows: false, post: false, envResolution: 128,
        derivedNormals: false, maxDpr: 1.5,
      };
    case 'mid':
      return {
        tier, shadows: true, shadowMapSize: 1024, softShadows: false,
        contactShadows: true, post: false, envResolution: 128,
        derivedNormals: true, maxDpr: 2,
      };
    default:
      return {
        tier,
        shadows: true,
        shadowMapSize: touch ? 1024 : 2048,
        // PCSS and the composer stay off on touch even at 'high': they are the
        // two things that have actually broken drivers in the field.
        softShadows: !touch,
        contactShadows: true,
        post: !touch,
        envResolution: touch ? 128 : 256,
        derivedNormals: true,
        maxDpr: 2,
      };
  }
}
