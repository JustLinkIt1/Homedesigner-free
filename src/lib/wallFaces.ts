import { polygonCentroid } from './geometry';
import type { Point, Room, Wall, WallFaceFinish, WallFaceRange } from '../types';

const EPS = 1e-4;

/** Resolve a 3D wall tap to the room-bounded stretch and side that was hit. */
export function wallFaceAt(wall: Wall, rooms: Room[], point: Point): WallFaceRange {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const len2 = dx * dx + dy * dy;
  const len = Math.sqrt(len2);
  if (len < EPS) return { start: 0, end: 1, side: 1 };

  const project = (p: Point) => ((p.x - wall.start.x) * dx + (p.y - wall.start.y) * dy) / len2;
  const cross = (p: Point) => dx * (p.y - wall.start.y) - dy * (p.x - wall.start.x);
  const tapped = Math.max(0, Math.min(1, project(point)));
  const side: -1 | 1 = cross(point) >= 0 ? 1 : -1;
  const lineDistance = (p: Point) => Math.abs(cross(p)) / len;
  const tolerance = wall.thickness / 2 + 8;
  const alongTolerance = tolerance / len;
  const candidates: WallFaceRange[] = [];

  for (const room of rooms) {
    if (room.points.length < 3) continue;
    const roomSide = cross(polygonCentroid(room.points)) >= 0 ? 1 : -1;
    if (roomSide !== side) continue;
    for (let i = 0; i < room.points.length; i++) {
      const a = room.points[i];
      const b = room.points[(i + 1) % room.points.length];
      if (lineDistance(a) > tolerance || lineDistance(b) > tolerance) continue;
      const start = Math.max(0, Math.min(project(a), project(b)));
      const end = Math.min(1, Math.max(project(a), project(b)));
      if (end - start < EPS) continue;
      if (tapped >= start - alongTolerance && tapped <= end + alongTolerance) {
        candidates.push({ start, end, side });
      }
    }
  }

  // At shared corners more than one room edge can be within tolerance. The
  // shortest matching stretch is the most specific room face under the tap.
  candidates.sort((a, b) => a.end - a.start - (b.end - b.start));
  return candidates[0] ?? { start: 0, end: 1, side };
}

export function finishForFace(wall: Wall, face?: WallFaceRange): WallFaceFinish | undefined {
  if (!face) return undefined;
  return wall.faceFinishes?.find(
    (finish) =>
      finish.side === face.side &&
      Math.abs(finish.start - face.start) < EPS &&
      Math.abs(finish.end - face.end) < EPS,
  );
}

/** Replace one face finish, splitting any older overlapping override so paint
 * never leaks into the neighbouring room stretch. */
export function withFaceFinish(
  wall: Wall,
  face: WallFaceRange,
  finish: Pick<WallFaceFinish, 'color' | 'texture'>,
): WallFaceFinish[] {
  const next: WallFaceFinish[] = [];
  for (const current of wall.faceFinishes ?? []) {
    if (current.side !== face.side || current.end <= face.start + EPS || current.start >= face.end - EPS) {
      next.push(current);
      continue;
    }
    if (current.start < face.start - EPS) next.push({ ...current, end: face.start });
    if (current.end > face.end + EPS) next.push({ ...current, start: face.end });
  }
  next.push({ ...face, ...finish });
  return next.sort((a, b) => a.side - b.side || a.start - b.start);
}
