/**
 * "Watch your plan build itself": the timeline.
 *
 * Pure: given what the scene holds (counts per storey, bottom-up) and one time
 * value in milliseconds, it says where every part is. Nothing here reads a
 * clock, so whoever drives it decides what "now" is — the live 3D view uses
 * the frame time, and a recorder could step it frame by frame.
 *
 * Stages, storey by storey from the ground up: floors (with that storey's
 * slab), walls one after another, ceilings, furniture; then every roof last.
 * Parts only ever move down onto their place and switch on; at rest every
 * part is exactly { dy: 0, visible: true }.
 */

/** What one storey holds, as counted in the scene. */
export interface StoreyCounts {
  /** Floor and slab meshes. They move as one. */
  floors: number;
  walls: number;
  ceilings: number;
  furniture: number;
  roofs: number;
}

export interface BuildSceneDesc {
  /** Ordered bottom-up. */
  storeys: StoreyCounts[];
}

export type PartKind = 'floors' | 'wall' | 'ceilings' | 'furniture' | 'roof';

export interface Pose {
  /** Metres above the part's resting place. */
  dy: number;
  visible: boolean;
}

interface Pace {
  /** Before anything moves: the plan alone on the ground. */
  lead: number;
  floorDur: number;
  wallDur: number;
  /** Most time between two walls starting. */
  wallStepMax: number;
  /** Most time, all storeys together, between the first and last wall starting. */
  wallSpread: number;
  ceilDur: number;
  furnDur: number;
  furnStepMax: number;
  furnSpread: number;
  roofDur: number;
  /** After the roof lands: the plan fades out. */
  tail: number;
  /** Hard ceiling on the whole thing; longer timelines are compressed to fit. */
  cap: number;
  /** Depth of the little dip after landing, metres. 0 = none. */
  settle: number;
}

export const FULL_PACE: Pace = {
  lead: 300, floorDur: 250,
  wallDur: 450, wallStepMax: 90, wallSpread: 1500,
  ceilDur: 250,
  furnDur: 400, furnStepMax: 50, furnSpread: 700,
  roofDur: 550, tail: 300, cap: 6000, settle: 0.02,
};

/** Low perf tier: shorter, furniture lands all at once, no settle. */
export const LITE_PACE: Pace = {
  lead: 200, floorDur: 200,
  wallDur: 350, wallStepMax: 60, wallSpread: 800,
  ceilDur: 200,
  furnDur: 350, furnStepMax: 0, furnSpread: 0,
  roofDur: 400, tail: 250, cap: 3000, settle: 0,
};

/** Metres each kind falls from. */
const DROP: Record<PartKind, number> = { floors: 0.25, wall: 2.2, ceilings: 0.6, furniture: 1, roof: 1.5 };
/** Kinds that dip a little on landing (when the pace allows it). */
const SETTLES: Record<PartKind, boolean> = { floors: false, wall: true, ceilings: false, furniture: true, roof: true };
/** Fraction of a drop spent falling; the rest is the settle. */
const FALL = 0.75;
/** Peak opacity of the plan image on the ground. */
export const PLAN_OPACITY = 0.9;

interface Stage { start: number; dur: number; step: number }

export interface BuildTimeline {
  /** ms. Every part is at rest from here on. */
  duration: number;
  pace: Pace;
  /** Per storey, in the description's order. */
  floors: Stage[];
  walls: Stage[];
  ceilings: Stage[];
  furniture: Stage[];
  roofs: Stage[];
  /** When the plan starts fading out. */
  fadeOut: number;
}

const stepFor = (count: number, max: number, spread: number) =>
  count > 1 ? Math.min(max, spread / (count - 1)) : 0;

export function buildTimeline(desc: BuildSceneDesc, lite = false): BuildTimeline {
  const p = lite ? LITE_PACE : FULL_PACE;
  const total = (k: keyof StoreyCounts) => desc.storeys.reduce((n, s) => n + s[k], 0);
  const wallStep = stepFor(total('walls'), p.wallStepMax, p.wallSpread);
  const furnStep = stepFor(total('furniture'), p.furnStepMax, p.furnSpread);
  const stagger = (count: number, dur: number, step: number) => (count > 0 ? dur + (count - 1) * step : 0);

  let t = p.lead;
  const floors: Stage[] = [];
  const walls: Stage[] = [];
  const ceilings: Stage[] = [];
  const furniture: Stage[] = [];
  for (const s of desc.storeys) {
    floors.push({ start: t, dur: p.floorDur, step: 0 });
    if (s.floors > 0) t += p.floorDur;
    walls.push({ start: t, dur: p.wallDur, step: wallStep });
    t += stagger(s.walls, p.wallDur, wallStep);
    ceilings.push({ start: t, dur: p.ceilDur, step: 0 });
    if (s.ceilings > 0) t += p.ceilDur;
    furniture.push({ start: t, dur: p.furnDur, step: furnStep });
    t += stagger(s.furniture, p.furnDur, furnStep);
  }
  // Roofs last, all together: a wing roof on a lower storey lands with the main one.
  const roofs = desc.storeys.map(() => ({ start: t, dur: p.roofDur, step: 0 }));
  if (total('roofs') > 0) t += p.roofDur;
  const fadeOut = t;
  t += p.tail;

  // Too long (many storeys): squeeze everything uniformly so the cap holds.
  const k = t > p.cap ? p.cap / t : 1;
  const squeeze = (st: Stage): Stage => ({ start: st.start * k, dur: st.dur * k, step: st.step * k });
  return {
    duration: t * k,
    pace: p,
    floors: floors.map(squeeze),
    walls: walls.map(squeeze),
    ceilings: ceilings.map(squeeze),
    furniture: furniture.map(squeeze),
    roofs: roofs.map(squeeze),
    fadeOut: fadeOut * k,
  };
}

/**
 * A part that has not started yet is hidden AND parked this far below the
 * ground. Hiding alone left faint furniture footprints on the floor and lawn on
 * some GPUs at the high tier (Fable, 1.22.48 replay); parked out of every
 * shadow and depth pass, a waiting part can leave no trace. It is back at
 * exactly dy 0 the moment it starts falling.
 */
export const PARK_DY = -1000;

const easeOutCubic = (u: number) => 1 - (1 - u) ** 3;

/** Where part `index` of `kind` on storey `storey` is at time `t` (ms). */
export function partPose(tl: BuildTimeline, kind: PartKind, storey: number, index: number, t: number): Pose {
  const stages = { floors: tl.floors, wall: tl.walls, ceilings: tl.ceilings, furniture: tl.furniture, roof: tl.roofs }[kind];
  const st = stages[storey];
  // Anything the description did not know about stays as it is, and after
  // the end everything is exactly at rest.
  if (!st || t >= tl.duration) return { dy: 0, visible: true };
  const start = st.start + index * st.step;
  if (t < start) return { dy: PARK_DY, visible: false };
  const u = (t - start) / st.dur;
  if (u >= 1) return { dy: 0, visible: true };
  const drop = DROP[kind];
  const settle = SETTLES[kind] ? tl.pace.settle : 0;
  if (settle === 0) return { dy: drop * (1 - easeOutCubic(u)), visible: true };
  if (u < FALL) return { dy: drop * (1 - easeOutCubic(u / FALL)), visible: true };
  return { dy: -settle * Math.sin((Math.PI * (u - FALL)) / (1 - FALL)), visible: true };
}

/** Opacity of the imported plan lying on the ground at time `t` (ms). */
export function planOpacity(tl: BuildTimeline, t: number): number {
  if (t <= 0 || t >= tl.duration) return 0;
  const lead = tl.floors.length ? tl.floors[0].start : tl.fadeOut;
  if (t < lead) return PLAN_OPACITY * (t / Math.max(1, lead));
  if (t <= tl.fadeOut) return PLAN_OPACITY;
  return PLAN_OPACITY * (1 - (t - tl.fadeOut) / Math.max(1, tl.duration - tl.fadeOut));
}

/**
 * What a value should be when the animation lets go of it: its resting value
 * if it still holds what the animation last wrote, otherwise whatever someone
 * else set since (React re-applying a changed prop, a drag), left alone.
 */
export function restoreIfUntouched<T>(current: T, lastWritten: T, rest: T): T {
  return Object.is(current, lastWritten) ? rest : current;
}
