// Touch drawing-gesture decisions, kept out of Canvas2D so they can be tested
// in plain Node (tests/geometry.mjs) rather than only through a headless
// browser. Each function here encodes a small truth table that used to live
// inline in a 2500-line Konva component, where it was untestable and easy to
// get subtly wrong.

import type { Point } from '../types';

/**
 * Tools where a one-finger drag DRAWS rather than pans.
 *
 * Deliberately excludes:
 *  - `select`, which owns node dragging and the long-press context menu
 *  - `erase`, because drag-to-erase is destructive and nobody asked for it
 *  - `pan`, obviously
 *  - `furniture` placement and `measure`, which could work the same way but
 *    would widen the blast radius of this change for no reported benefit
 */
export function isDragDrawTool(tool: string): boolean {
  return (
    tool === 'wall' ||
    tool === 'halfWall' ||
    tool === 'fence' ||
    tool === 'room' ||
    tool === 'kitchen'
  );
}

/**
 * Whether a one-finger touch should pan the viewport.
 *
 * Previously this was `moveLock || targetIsStage || targetIsBgPlan`, which made
 * a drag on empty canvas a pan with EVERY tool — so drawing by dragging was
 * impossible. A drawing tool now claims one finger, and panning moves to two.
 *
 * Note this overrides `moveLock` for drawing tools: lock mode exists to stop
 * objects being moved by accident, not to stop you drawing.
 */
export function shouldPanOnTouch(o: {
  tool: string;
  moveLock: boolean;
  targetIsStage: boolean;
  targetIsBgPlan: boolean;
}): boolean {
  if (isDragDrawTool(o.tool)) return false;
  return o.moveLock || o.targetIsStage || o.targetIsBgPlan;
}

/**
 * Drop a trailing point that sits on top of its predecessor.
 *
 * Finishing with a double-tap (or double-click) necessarily places a point on
 * the first tap before the second is recognised, so the draft ends with two
 * coincident points and the chain would commit a zero-length wall. This is a
 * pre-existing desktop bug too — `onMouseDown` commits on press, so
 * double-click has always done it.
 */
export function stripDegenerateTail(draft: Point[], epsCm: number): Point[] {
  if (draft.length < 2) return draft;
  const last = draft[draft.length - 1];
  const prev = draft[draft.length - 2];
  return Math.hypot(last.x - prev.x, last.y - prev.y) <= epsCm ? draft.slice(0, -1) : draft;
}

/** Screen px between the fingertip and the length/angle readout. Roughly a
 *  fingertip contact radius plus the text height, matching the app's 44px
 *  touch-target unit. */
const READOUT_GAP_PX = 44;
/** Below this screen Y the toolbar and the draw pill live, so a readout placed
 *  above the finger would be hidden behind them — flip it underneath instead. */
const TOP_OBSTRUCTION_PX = 96;

/**
 * Vertical offset (in world cm) from the fingertip to the readout, so the
 * finger never covers the number it is about to commit. Negative is above.
 */
export function readoutOffsetCm(o: { screenY: number; zoom: number }): number {
  const dir = o.screenY < TOP_OBSTRUCTION_PX ? 1 : -1;
  return (dir * READOUT_GAP_PX) / o.zoom;
}
