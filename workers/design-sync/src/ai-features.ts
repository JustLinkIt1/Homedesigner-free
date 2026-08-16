/**
 * Metered Workers AI features.
 *
 * Every export here runs through `runMetered`, so the spend happens before
 * dispatch and a failure refunds (guards G3/G5). None of these touch fal, so
 * none is exposed to the prepaid-balance problem in AI_FEATURES_PLAN §5.
 *
 * The shared discipline, learned from `suggestModelMetadata`: JSON mode on
 * Workers AI is best-effort, so every field coming back is re-validated here
 * and anything unrecognised falls back rather than propagating. A hallucinated
 * answer must be inert, not wrong-but-plausible.
 */
import type { FeatureId } from './points';

/**
 * Measured against real Workers AI, not chosen from the catalogue blurb.
 *
 * The 70B model was returning the RIGHT answers in 10s warm and 32s cold, and
 * the cost was almost entirely fixed overhead -- one room took 30.6s and twenty
 * took 34.1s. A 10-point convenience feature that makes someone wait half a
 * minute is one nobody uses twice.
 *
 * On identical inputs with opaque room ids, this model returned the same names
 * and the same confidences in ~780ms, stable across repeat runs. Same answers,
 * an order of magnitude faster, on a much cheaper model -- which widens the
 * blended margin the cheap features exist to provide (plan §6).
 *
 * Two things checked while picking it: `@cf/meta/llama-3.1-8b-instruct` (no
 * suffix) was deprecated on 2026-05-30 and errors at the binding, while the
 * `-fast` variant was explicitly retained; and `@cf/zai-org/glm-4.7-flash`, the
 * catalogue's recommended fast model, fails here outright -- it is a reasoning
 * model and its output does not survive `parseJson`, so it returned "unreadable
 * answer" every time. Do not swap this for a reasoning model without re-running
 * that check.
 */
const TEXT_MODEL = '@cf/meta/llama-3.1-8b-instruct-fast';

/**
 * A flat price per call is only honest if the call's size is bounded. Without
 * a cap, one request carrying 500 rooms costs many times what 10 points buys
 * -- which is exactly the "add-on goes unpriced" failure G4 exists to stop.
 */
export const MAX_ROOMS_PER_CALL = 20;

/**
 * Canonical room types. A closed set rather than free text: it keeps the
 * client's rendering predictable, and it means a confused model produces a
 * wrong-but-valid room name instead of a sentence in the name field.
 */
export const ROOM_TYPES = [
  'Living Room', 'Kitchen', 'Dining Room', 'Bedroom', 'Master Bedroom',
  'Bathroom', 'En-suite', 'Toilet', 'Hallway', 'Landing', 'Entrance',
  'Office', 'Study', 'Utility', 'Laundry', 'Pantry', 'Garage',
  'Conservatory', 'Playroom', 'Storage', 'Walk-in Wardrobe', 'Basement',
  'Attic', 'Porch', 'Balcony', 'Patio', 'Garden',
] as const;

export interface RoomSummary {
  id: string;
  /** Floor area in square metres, rounded by the client. */
  areaSqm: number;
  widthCm: number;
  depthCm: number;
  /** Catalogue `type` slugs of furniture standing in the room. */
  furniture: string[];
  /** True for a `Room.outdoor` polygon -- patio, deck, lawn. */
  outdoor?: boolean;
  /** Number of doors and windows on the room's boundary. */
  doors?: number;
  windows?: number;
}

export interface RoomNameSuggestion {
  id: string;
  name: string;
  confidence: 'high' | 'low';
}

function roomNameSchema(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      rooms: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string', enum: [...ROOM_TYPES] },
            confidence: { type: 'string', enum: ['high', 'low'] },
          },
          required: ['id', 'name', 'confidence'],
        },
      },
    },
    required: ['rooms'],
  };
}

/** JSON mode is best-effort: accept an object, a bare JSON string, or JSON
 *  wrapped in prose or code fences. Mirrors `parseModelJson` in index.ts. */
function parseJson(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== 'string') return null;
  const start = value.indexOf('{');
  const end = value.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(value.slice(start, end + 1)) as unknown;
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export function validRoomSummaries(value: unknown): RoomSummary[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_ROOMS_PER_CALL) return null;
  const rooms: RoomSummary[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') return null;
    const room = entry as Partial<RoomSummary>;
    if (typeof room.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(room.id)) return null;
    if (typeof room.areaSqm !== 'number' || !Number.isFinite(room.areaSqm) || room.areaSqm <= 0) return null;
    if (typeof room.widthCm !== 'number' || typeof room.depthCm !== 'number') return null;
    const furniture = Array.isArray(room.furniture)
      ? room.furniture.filter((f): f is string => typeof f === 'string').slice(0, 40)
      : [];
    rooms.push({
      id: room.id,
      areaSqm: Math.round(room.areaSqm * 10) / 10,
      widthCm: Math.round(room.widthCm),
      depthCm: Math.round(room.depthCm),
      furniture,
      outdoor: room.outdoor === true,
      doors: typeof room.doors === 'number' ? room.doors : undefined,
      windows: typeof room.windows === 'number' ? room.windows : undefined,
    });
  }
  return rooms;
}

function describeRoom(room: RoomSummary, index: number): string {
  const parts = [
    `${index + 1}. id=${room.id}`,
    `${room.areaSqm}m2`,
    `${(room.widthCm / 100).toFixed(1)}x${(room.depthCm / 100).toFixed(1)}m`,
  ];
  if (room.outdoor) parts.push('outdoor area');
  if (room.doors !== undefined) parts.push(`${room.doors} door(s)`);
  if (room.windows !== undefined) parts.push(`${room.windows} window(s)`);
  parts.push(room.furniture.length ? `contains: ${room.furniture.join(', ')}` : 'empty');
  return parts.join(' · ');
}

/**
 * The work half of room auto-naming. Callers wrap this in `runMetered` -- it
 * is exported unwrapped so the route stays in charge of the ledger and this
 * stays testable without a database.
 *
 * Throws on an unusable answer, which `runMetered` turns into a refund.
 */
export async function generateRoomNames(ai: Ai, rooms: RoomSummary[]): Promise<RoomNameSuggestion[]> {
  const system = [
    'You label rooms in a home floor plan. Answer with JSON only.',
    '',
    `- name: exactly one of ${ROOM_TYPES.join(', ')}. Never invent a label outside that list.`,
    '- Use the area, proportions and especially the furniture to decide. A 4m2 room with a toilet is a Toilet,',
    '  not a Bathroom. A room containing a bed is a Bedroom; the largest bedroom with an adjoining bathroom',
    '  is the Master Bedroom. A long thin room with several doors is a Hallway.',
    '- An outdoor area is a Patio, Balcony or Garden, never an interior room.',
    '- confidence: "high" when the furniture or shape makes the answer clear, otherwise "low".',
    '  An empty room of ordinary size is "low" -- say so rather than guessing confidently.',
    '- Return exactly one entry per input room, reusing the given id verbatim.',
  ].join('\n');

  const user = [
    'Label these rooms:',
    '',
    ...rooms.map(describeRoom),
  ].join('\n');

  const result = await ai.run(TEXT_MODEL, {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    max_tokens: 600,
    response_format: { type: 'json_schema', json_schema: roomNameSchema() },
  }) as { response?: unknown };

  const parsed = parseJson(result?.response);
  const list = parsed && Array.isArray(parsed.rooms) ? parsed.rooms : null;
  if (!list) throw new Error('The room assistant returned an unreadable answer');

  const allowed = new Set<string>(ROOM_TYPES);
  const byId = new Map<string, RoomNameSuggestion>();
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    const id = typeof row.id === 'string' ? row.id : '';
    const name = typeof row.name === 'string' ? row.name : '';
    // An id the caller never sent, or a label outside the closed set, is
    // dropped rather than passed through -- see the module note on inertness.
    if (!rooms.some((room) => room.id === id) || !allowed.has(name)) continue;
    byId.set(id, {
      id,
      name,
      confidence: row.confidence === 'high' ? 'high' : 'low',
    });
  }

  if (byId.size === 0) throw new Error('The room assistant could not label these rooms');
  // Rooms the model skipped or mislabelled are simply absent. The client keeps
  // their existing names, which is the correct no-op.
  return rooms.map((room) => byId.get(room.id)).filter((s): s is RoomNameSuggestion => !!s);
}

export const ROOM_NAMING_FEATURE: FeatureId = 'room_naming';
