// What a 3D capture shows: rooms, or the house from outside.
//
// The AI render is told which. Asked for "an interior photograph" of a street
// view, the model floors the lawn and puts a sofa in the garden, so a capture
// taken from outside is sent with the exterior wording instead.

import { pointInPolygon } from './geometry';
import type { FloorGeom, FloorInfo } from '../types';

export type RenderView = 'interior' | 'exterior';

const WALL_HEIGHT = 275; // cm, when a storey has no walls to measure

/**
 * `eye` is the camera in plan centimetres, with `height` above the ground.
 * Outside means: the walls are solid (not the cutaway), the camera is in no
 * room, and it cannot look down into rooms that have no roof over them.
 */
export function renderViewOf(
  plan: { dollhouse: boolean; floors: FloorInfo[]; floorGeom: Record<string, FloorGeom> },
  eye: { x: number; y: number; height: number },
): RenderView {
  if (plan.dollhouse) return 'interior';
  const storeys = [...plan.floors].sort((a, b) => a.elevation - b.elevation);
  let top = 0;
  for (let i = 0; i < storeys.length; i++) {
    const geom = plan.floorGeom[storeys[i].id];
    if (!geom) continue;
    const walls = Math.max(0, ...geom.walls.map((w) => w.height)) || WALL_HEIGHT;
    const ceiling = storeys[i + 1]?.elevation ?? storeys[i].elevation + walls;
    top = Math.max(top, storeys[i].elevation + walls);
    const indoors = eye.height >= storeys[i].elevation && eye.height < ceiling
      && geom.rooms.some((room) => !room.outdoor && room.points.length >= 3 && pointInPolygon(eye, room.points));
    if (indoors) return 'interior';
  }
  if (top === 0) return 'interior'; // nothing built yet
  // No roof: from above the walls you see straight into the rooms.
  if (!storeys.some((floor) => floor.roof) && eye.height > top) return 'interior';
  return 'exterior';
}
