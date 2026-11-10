import type { FurnitureItem, Opening, Room, Wall } from '../types';
import { pointInPolygon, polygonArea } from './geometry';

export interface AiRoomSummary {
  id: string;
  areaSqm: number;
  widthCm: number;
  depthCm: number;
  furniture: string[];
  outdoor?: boolean;
}

/** Build the bounded, geometry-derived payload accepted by the Worker. No
 * project file, coordinates or account details leave the device. */
export function summarizeRooms(rooms: Room[], furniture: FurnitureItem[]): AiRoomSummary[] {
  return rooms.filter(room => room.points.length >= 3 && room.points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y))).map((room) => {
    const xs = room.points.map(point => point.x);
    const ys = room.points.map(point => point.y);
    return {
      id: room.id,
      areaSqm: Math.round(Math.abs(polygonArea(room.points)) / 1000) / 10,
      widthCm: Math.max(1, Math.round(Math.max(...xs) - Math.min(...xs))),
      depthCm: Math.max(1, Math.round(Math.max(...ys) - Math.min(...ys))),
      furniture: furniture
        .filter(item => pointInPolygon(item.position, room.points))
        .map(item => item.type)
        .slice(0, 40),
      ...(room.outdoor ? { outdoor: true } : {}),
    };
  }).filter(room => room.areaSqm >= 0.1).slice(0, 20);
}

/** A local-only binding for suggestions. It excludes image data, but includes
 * every floor-plan fact that could make a previous suggestion stale. */
export function aiDesignContext(projectId: string | null, design: {
  activeFloorId: string; projectName: string; rooms: Room[];
  furniture: FurnitureItem[]; walls: Wall[]; openings: Opening[];
}): string {
  return JSON.stringify({
    projectId, floor: design.activeFloorId, name: design.projectName,
    rooms: design.rooms.map(room => [room.id, room.name, room.outdoor, room.points]),
    furniture: design.furniture.map(item => [item.id, item.type, item.position, item.rotation, item.width, item.depth]),
    walls: design.walls.map(wall => [wall.id, wall.start, wall.end, wall.thickness]),
    openings: design.openings.map(opening => [opening.id, opening.wallId, opening.type, opening.offset, opening.width]),
  });
}

export interface RoomNameSuggestion {
  id: string;
  name: string;
  confidence: 'high' | 'low';
}

export interface ColourSchemeSuggestion {
  style: string;
  title: string;
  rationale: string;
}

export interface ListingDescription {
  headline: string;
  description: string;
}
