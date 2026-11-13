// A plan handed over by link: homedesignerapp.com/app/?plan=<id>.
//
// The Worker keeps a small plan description under a long random id (see
// workers/design-sync/src/shared-plans.ts). It is the same "blueprint" the AI
// plan tool produces, optionally with an outside wall finish and a roof, and
// the app turns it into a furnished project with the same builder. Nothing
// else travels in a link, so a link can only ever open what that builder can
// make; this module re-checks every field anyway, because the response is
// network input.

import { ROOM_FILL, isBlueprint, type Blueprint, type BlueprintOpening } from './aiPlan';
import type { Roof, RoofCovering, RoofType } from '../types';

const BASE = (import.meta.env.VITE_CLOUD_SYNC_URL ?? '').replace(/\/$/, '');
const ID = /^[a-z0-9]{10,24}$/;
const HEX = /^#[0-9a-f]{6}$/i;
const MATERIAL = /^[a-z0-9_]{1,40}$/;
const OPENING_KINDS: readonly BlueprintOpening['kind'][] = ['door', 'open', 'entrance', 'garage', 'window', 'small_window', 'bay'];
const ROOF_TYPES: readonly RoofType[] = ['flat', 'shed', 'gable', 'hip'];
const ROOF_COVERINGS: readonly RoofCovering[] = ['tile', 'shingle', 'slate', 'metal', 'plain'];

export interface SharedPlan {
  blueprint: Blueprint;
  exterior?: { color: string; material?: string };
  roof?: Roof;
}

export type SharedPlanResult =
  | { ok: true; plan: SharedPlan }
  /** `gone`: the link is unknown, withdrawn, expired or unreadable. `failed`: worth retrying. */
  | { ok: false; reason: 'gone' | 'failed' };

/** The plan id in a page's query string, if it carries a well-formed one. */
export function sharedPlanId(search: string): string | null {
  const id = new URLSearchParams(search).get('plan') ?? '';
  return ID.test(id) ? id : null;
}

const within = (v: unknown, lo: number, hi: number): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

function parseExterior(value: unknown): SharedPlan['exterior'] {
  if (!value || typeof value !== 'object') return undefined;
  const { color, material } = value as { color?: unknown; material?: unknown };
  if (typeof color !== 'string' || !HEX.test(color)) return undefined;
  return typeof material === 'string' && MATERIAL.test(material) ? { color, material } : { color };
}

function parseRoof(value: unknown): Roof | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const r = value as Partial<Record<keyof Roof, unknown>>;
  if (!ROOF_TYPES.includes(r.type as RoofType) || !ROOF_COVERINGS.includes(r.covering as RoofCovering)) return undefined;
  if (!within(r.pitch, 0, 70) || !within(r.overhang, 0, 150) || !within(r.thickness, 4, 60)) return undefined;
  if (!within(r.coveringScaleCm, 10, 500) || typeof r.color !== 'string' || !HEX.test(r.color)) return undefined;
  // Field by field: a custom texture (an arbitrary image) never comes from a link.
  return {
    type: r.type as RoofType, pitch: r.pitch, overhang: r.overhang, thickness: r.thickness,
    covering: r.covering as RoofCovering, coveringScaleCm: r.coveringScaleCm, color: r.color,
    ...(within(r.windows, 1, 6) ? { windows: Math.round(r.windows) } : {}),
  };
}

/**
 * A checked copy of a stored plan, or null when anything about it is off.
 * A bad finish or roof is dropped rather than failing the plan: the house is
 * still worth opening with the default render and slate.
 */
export function parseSharedPlan(value: unknown): SharedPlan | null {
  if (!isBlueprint(value)) return null;
  const raw = value as Blueprint & { exterior?: unknown; roof?: unknown };
  if (!within(raw.widthCm, 100, 10000) || !within(raw.depthCm, 100, 10000)) return null;
  const floors: Blueprint['floors'] = [];
  for (const floor of raw.floors) {
    if (floor.rooms.length > 60 || floor.openings.length > 240) return null;
    const rooms = [];
    for (const room of floor.rooms) {
      if (!(room.type in ROOM_FILL) || room.id.length > 40 || room.name.length > 60) return null;
      if (!within(room.x, -2000, 12000) || !within(room.y, -2000, 12000)) return null;
      if (!within(room.w, 30, 10000) || !within(room.h, 30, 10000)) return null;
      rooms.push({ id: room.id, type: room.type, name: room.name, x: room.x, y: room.y, w: room.w, h: room.h });
    }
    const openings = [];
    for (const o of floor.openings) {
      if (!OPENING_KINDS.includes(o.kind) || !within(o.width, 20, 1200)) return null;
      if (!within(o.x, -2000, 12000) || !within(o.y, -2000, 12000)) return null;
      if (o.rooms.length > 2 || !o.rooms.every((id) => typeof id === 'string' && id.length <= 40)) return null;
      openings.push({ kind: o.kind, x: o.x, y: o.y, vertical: o.vertical, width: o.width, rooms: [...o.rooms] });
    }
    floors.push({ rooms, openings });
  }
  return {
    blueprint: {
      title: raw.title.trim().slice(0, 80) || 'Shared plan',
      notes: '',
      widthCm: raw.widthCm,
      depthCm: raw.depthCm,
      furnished: raw.furnished !== false,
      floors,
      source: null,
    },
    exterior: parseExterior(raw.exterior),
    roof: parseRoof(raw.roof),
  };
}

export async function fetchSharedPlan(id: string): Promise<SharedPlanResult> {
  if (!/^https:\/\//.test(BASE) || !ID.test(id)) return { ok: false, reason: 'failed' };
  try {
    const response = await fetch(`${BASE}/v1/plans/shared/${id}`);
    if (response.status === 404) return { ok: false, reason: 'gone' };
    if (!response.ok) return { ok: false, reason: 'failed' };
    const body = (await response.json()) as { plan?: unknown };
    const plan = parseSharedPlan(body.plan);
    return plan ? { ok: true, plan } : { ok: false, reason: 'gone' };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}
