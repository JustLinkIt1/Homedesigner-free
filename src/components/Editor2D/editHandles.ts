// Math helpers for the 2D direct-manipulation edit handles.
// All coordinates are in plan-space centimeters (cm) unless noted.

import type { Point } from '../../types';

/** Rotate a vector by `deg` degrees (CCW in screen space, y-down). */
export const rotateVec = (v: Point, deg: number): Point => {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
};

/** World point -> a box's local frame (centered, axis-aligned). */
export const worldToLocal = (p: Point, center: Point, rotationDeg: number): Point => {
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  const a = (-rotationDeg * Math.PI) / 180;
  return {
    x: dx * Math.cos(a) - dy * Math.sin(a),
    y: dx * Math.sin(a) + dy * Math.cos(a),
  };
};

/** A box's local-frame point -> world. */
export const localToWorld = (l: Point, center: Point, rotationDeg: number): Point => {
  const r = rotateVec(l, rotationDeg);
  return { x: center.x + r.x, y: center.y + r.y };
};

export interface Box {
  position: Point; // center (cm)
  width: number;
  depth: number;
}

/**
 * Local-frame corner offsets for a width x depth box. Index order:
 *   0 = top-left, 1 = top-right, 2 = bottom-right, 3 = bottom-left.
 */
export const cornerSign = (corner: number): Point => ({
  x: corner === 1 || corner === 2 ? 1 : -1,
  y: corner === 2 || corner === 3 ? 1 : -1,
});

/**
 * Resize a (possibly rotated) box by dragging `corner` to `worldPointer`. The
 * diagonally-opposite corner is held fixed in world space. Enforces `minSize`
 * and preserves rotation. Returns the new center/width/depth.
 */
export const resizeBox = (
  box: Box,
  corner: number,
  worldPointer: Point,
  rotationDeg: number,
  minSize: number,
): Box => {
  const s = cornerSign(corner);

  // Opposite (anchor) corner, fixed in world space.
  const anchorLocal: Point = { x: (-s.x * box.width) / 2, y: (-s.y * box.depth) / 2 };
  const anchorWorld = localToWorld(anchorLocal, box.position, rotationDeg);

  // Dragged corner in the box's local frame.
  const movingLocal = worldToLocal(worldPointer, box.position, rotationDeg);

  // New extents from the anchor to the moving corner (local axes).
  const width = Math.max(minSize, Math.abs(movingLocal.x - anchorLocal.x));
  const depth = Math.max(minSize, Math.abs(movingLocal.y - anchorLocal.y));

  // New center keeps the anchor corner fixed: center = anchorWorld + rot(half).
  const halfLocal: Point = { x: (s.x * width) / 2, y: (s.y * depth) / 2 };
  const offset = rotateVec(halfLocal, rotationDeg);
  const position = { x: anchorWorld.x + offset.x, y: anchorWorld.y + offset.y };

  return { position, width, depth };
};

/** Normalize an angle to [0, 360). */
export const norm360 = (deg: number): number => ((deg % 360) + 360) % 360;

/**
 * Uniform scale about the box CENTRE, driven by dragging `corner`.
 *
 * `resizeBox` above stretches width and depth independently and pins the
 * opposite corner, so a sofa dragged sideways comes out flat and slides across
 * the plan while you do it. A tester asked for the other behaviour — "scaled
 * proportionally from all sides" — which is this: the shape is preserved and
 * the object stays where it is.
 *
 * The factor is the pointer's projection onto the ORIGINAL half-diagonal rather
 * than, say, the larger of the two axis ratios. Projection keeps the corner
 * tracking the finger smoothly; an axis-max would make the box jump whenever
 * the dominant axis changed mid-drag.
 */
export const scaleBox = (
  box: Box,
  corner: number,
  worldPointer: Point,
  rotationDeg: number,
  minSize: number,
): Box & { scale: number } => {
  const s = cornerSign(corner);
  const half: Point = { x: (s.x * box.width) / 2, y: (s.y * box.depth) / 2 };
  const p = worldToLocal(worldPointer, box.position, rotationDeg);

  const denom = half.x * half.x + half.y * half.y;
  // A zero-size box has no diagonal to project onto; leave it alone rather than
  // dividing by zero.
  if (denom === 0) return { ...box, scale: 1 };

  // Neither side may fall under minSize, so the clamp is driven by whichever
  // axis is already smaller — this is what stops a long thin rug collapsing.
  const floor = Math.max(minSize / box.width, minSize / box.depth);
  const scale = Math.max(floor, (p.x * half.x + p.y * half.y) / denom);

  return {
    position: box.position, // the centre is the anchor — that is the whole point
    width: box.width * scale,
    depth: box.depth * scale,
    scale,
  };
};

/** Snap an angle to the nearest `step` degrees when within `tol` degrees. */
export const snapAngleTo = (deg: number, step: number, tol: number): number => {
  const snapped = Math.round(deg / step) * step;
  // Smallest signed difference to the snapped value.
  const diff = Math.abs(((deg - snapped + 540) % 360) - 180);
  return diff <= tol ? snapped : deg;
};
