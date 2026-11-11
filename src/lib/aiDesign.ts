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

export interface DesignReviewSuggestion {
  roomId: string | null;
  title: string;
  detail: string;
  impact: 'high' | 'medium' | 'low';
}

export interface DesignReview {
  score: number;
  summary: string;
  suggestions: DesignReviewSuggestion[];
}

export interface VoiceTour {
  script: string;
  /** Base64 MP3. */
  audio: string;
  mime: string;
}

/** Room names the user typed, for the Claude-backed tools. The Worker treats
 * them as labels, drops anything over 40 characters and ignores unknown ids. */
export function roomNameMap(rooms: Room[]): Record<string, string> {
  const names: Record<string, string> = {};
  for (const room of rooms) {
    const name = typeof room.name === 'string' ? room.name.trim() : '';
    if (name && name.length <= 40) names[room.id] = name;
  }
  return names;
}

/** A short fingerprint of `aiDesignContext`, small enough to store beside a
 * saved result so it can be flagged once the plan has changed. */
export function contextStamp(context: string): string {
  let hash = 5381;
  for (let i = 0; i < context.length; i += 1) hash = ((hash << 5) + hash + context.charCodeAt(i)) | 0;
  return `${(hash >>> 0).toString(36)}-${context.length.toString(36)}`;
}

export interface SavedReview { stamp: string; review: DesignReview }

const REVIEW_KEY = 'homedesigner.aiReview.v1';
const REVIEWS_KEPT = 8;

function validReview(value: unknown): value is DesignReview {
  if (!value || typeof value !== 'object') return false;
  const review = value as Partial<DesignReview>;
  return typeof review.score === 'number' && typeof review.summary === 'string'
    && Array.isArray(review.suggestions) && review.suggestions.every(item =>
      !!item && typeof item.title === 'string' && typeof item.detail === 'string'
      && (item.roomId === null || typeof item.roomId === 'string')
      && (item.impact === 'high' || item.impact === 'medium' || item.impact === 'low'));
}

function readReviews(): Record<string, SavedReview> {
  try {
    const parsed = JSON.parse(localStorage.getItem(REVIEW_KEY) ?? '{}') as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, SavedReview> : {};
  } catch {
    return {};
  }
}

/** The last designer review for a project level, kept on this device: it was
 * paid for, so closing the dialog must not throw it away. */
export function readSavedReview(slot: string): SavedReview | null {
  const saved = readReviews()[slot];
  return saved && typeof saved.stamp === 'string' && validReview(saved.review) ? saved : null;
}

export function saveReview(slot: string, value: SavedReview): void {
  try {
    const all = readReviews();
    delete all[slot];
    const entries = [...Object.entries(all), [slot, value] as const].slice(-REVIEWS_KEPT);
    localStorage.setItem(REVIEW_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    /* storage full or unavailable: the review still shows until the dialog closes */
  }
}
