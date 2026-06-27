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

/** Snap an angle to the nearest `step` degrees when within `tol` degrees. */
export const snapAngleTo = (deg: number, step: number, tol: number): number => {
  const snapped = Math.round(deg / step) * step;
  // Smallest signed difference to the snapped value.
  const diff = Math.abs(((deg - snapped + 540) % 360) - 180);
  return diff <= tol ? snapped : deg;
};
