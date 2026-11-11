// AI plan, app side: turns the Worker's blueprint (exact room rectangles and
// opening positions, see workers/design-sync/src/ai-plan.ts) into the app's
// own walls, openings, rooms and furniture, as a snapshot the store can load.
//
// Nothing here talks to a server or a model. The blueprint is already valid
// geometry by the time it arrives; this file is a translation, plus a simple
// rule-based furnisher for people who asked for a furnished plan.
import type { MaybeFloored } from '../store/designStore';
import type { FloorGeom, FloorInfo, FurnitureItem, Opening, Room, Wall } from '../types';
import { CATALOG_BY_TYPE, DEFAULT_WALL_THICKNESS } from '../data/furnitureCatalog';
import { dressed, ROOFS } from '../data/samples';
import { uid } from './geometry';

export type PlanRoomType =
  | 'living' | 'open_living' | 'kitchen' | 'dining' | 'bedroom' | 'bathroom' | 'toilet'
  | 'hallway' | 'office' | 'utility' | 'storage' | 'garage' | 'stairwell' | 'playroom';

export interface PlanBrief {
  storeys: number;
  bedrooms: number;
  bathrooms: number;
  areaSqm: number;
  furnished: boolean;
  garage: boolean;
  wishes: string;
}

export interface BlueprintRoom { id: string; type: PlanRoomType; name: string; x: number; y: number; w: number; h: number }
export interface BlueprintOpening {
  kind: 'door' | 'open' | 'entrance' | 'garage' | 'window' | 'small_window';
  x: number;
  y: number;
  vertical: boolean;
  width: number;
  rooms: string[];
}
export interface BlueprintFloor { rooms: BlueprintRoom[]; openings: BlueprintOpening[] }
export interface Blueprint {
  title: string;
  notes: string;
  widthCm: number;
  depthCm: number;
  furnished: boolean;
  floors: BlueprintFloor[];
  /** The plan as the model wrote it. Opaque here; sent back to ask for a change. */
  source: unknown;
}

export const DEFAULT_BRIEF: PlanBrief = {
  storeys: 1, bedrooms: 2, bathrooms: 1, areaSqm: 90, furnished: true, garage: false, wishes: '',
};

/** Mirrors the Worker's rule, so the form can say so before points are spent. */
export const minimumArea = (brief: Pick<PlanBrief, 'bedrooms' | 'bathrooms' | 'garage'>): number =>
  14 + brief.bedrooms * 7 + brief.bathrooms * 3 + (brief.garage ? 15 : 0);

/** Shape check for a blueprint read back from storage or a response. */
export function isBlueprint(value: unknown): value is Blueprint {
  if (!value || typeof value !== 'object') return false;
  const plan = value as Partial<Blueprint>;
  const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  return typeof plan.title === 'string' && typeof plan.notes === 'string' && num(plan.widthCm) && num(plan.depthCm)
    && Array.isArray(plan.floors) && plan.floors.length >= 1 && plan.floors.length <= 3
    && plan.floors.every((floor) => !!floor && Array.isArray(floor.rooms) && floor.rooms.length >= 1 && Array.isArray(floor.openings)
      && floor.rooms.every((room) => !!room && typeof room.id === 'string' && typeof room.name === 'string'
        && typeof room.type === 'string' && [room.x, room.y, room.w, room.h].every(num) && room.w > 0 && room.h > 0)
      && floor.openings.every((o) => !!o && typeof o.kind === 'string' && [o.x, o.y, o.width].every(num)
        && typeof o.vertical === 'boolean' && Array.isArray(o.rooms)));
}

const STOREY_RISE = 282;
const WALL_HEIGHT = 275;
const WALL_COLOR = '#eae4d8';

const FLOORING: Record<PlanRoomType, [material: string, color: string]> = {
  living: ['oak', '#f6f1e5'], open_living: ['oak', '#f6f1e5'], dining: ['oak', '#f6f1e5'],
  hallway: ['oak', '#f3eee3'], office: ['oak', '#f4efe4'], playroom: ['oak', '#f6f1e5'],
  stairwell: ['oak', '#f3eee3'], bedroom: ['carpet_beige', '#efe6d7'],
  kitchen: ['tile_grey', '#eceeef'], utility: ['tile_grey', '#eceeef'],
  bathroom: ['tile_white', '#eaf0f0'], toilet: ['tile_white', '#eaf0f0'],
  garage: ['concrete', '#e2e3e5'], storage: ['concrete', '#e6e6e4'],
};

/** Fill colours for the small preview drawing: told apart at a glance, which
 *  the real (deliberately similar) floor finishes are not. */
export const ROOM_FILL: Record<PlanRoomType, string> = {
  living: '#f7eeda', open_living: '#f7eeda', dining: '#f6ead2', playroom: '#fbe7d3',
  kitchen: '#e2ecee', utility: '#e8eae6', bedroom: '#ebe5f2', office: '#e5efe1',
  bathroom: '#d9ebef', toilet: '#d9ebef', hallway: '#f2f0ea', stairwell: '#ebe8df',
  garage: '#dddfe3', storage: '#e6e5e1',
};

/** Every room edge on one line, merged into the longest walls that cover them.
 *  Interior walls then meet the long outside walls as T-junctions, which is
 *  how the bundled templates are drawn. */
function wallsFor(rooms: BlueprintRoom[]): Wall[] {
  const lines = new Map<string, [number, number][]>();
  const add = (vertical: boolean, at: number, from: number, to: number) => {
    const key = `${vertical ? 'v' : 'h'}:${at}`;
    lines.set(key, [...(lines.get(key) ?? []), [from, to]]);
  };
  for (const room of rooms) {
    add(false, room.y, room.x, room.x + room.w);
    add(false, room.y + room.h, room.x, room.x + room.w);
    add(true, room.x, room.y, room.y + room.h);
    add(true, room.x + room.w, room.y, room.y + room.h);
  }
  const walls: Wall[] = [];
  for (const [key, spans] of lines) {
    const vertical = key.startsWith('v');
    const at = Number(key.slice(2));
    spans.sort((a, b) => a[0] - b[0]);
    let [from, to] = spans[0];
    const flush = () => walls.push({
      id: uid(),
      start: vertical ? { x: at, y: from } : { x: from, y: at },
      end: vertical ? { x: at, y: to } : { x: to, y: at },
      thickness: DEFAULT_WALL_THICKNESS, height: WALL_HEIGHT, color: WALL_COLOR,
    });
    for (const [a, b] of spans.slice(1)) {
      if (a <= to) to = Math.max(to, b);
      else { flush(); [from, to] = [a, b]; }
    }
    flush();
  }
  return walls;
}

function openingFor(spec: BlueprintOpening, walls: Wall[], allowPro: boolean): Opening | null {
  const wall = walls.find((w) => (spec.vertical
    ? w.start.x === w.end.x && w.start.x === spec.x && spec.y > w.start.y && spec.y < w.end.y
    : w.start.y === w.end.y && w.start.y === spec.y && spec.x > w.start.x && spec.x < w.end.x));
  if (!wall) return null;
  const length = spec.vertical ? wall.end.y - wall.start.y : wall.end.x - wall.start.x;
  const along = spec.vertical ? spec.y - wall.start.y : spec.x - wall.start.x;
  const base = { id: uid(), wallId: wall.id, offset: along / length, width: spec.width };
  switch (spec.kind) {
    case 'window': return { ...base, type: 'window', height: 130, sill: 100 };
    case 'small_window': return { ...base, type: 'window', height: 80, sill: 130 };
    case 'open': return { ...base, type: 'door', height: 210, sill: 0, style: 'passage' };
    // There is no garage door in the catalogue. A pair of doors is the closest
    // thing; that style is Pro, so a free plan gets a plain wide opening.
    case 'garage': return { ...base, type: 'door', height: 210, sill: 0, style: allowPro ? 'double' : 'passage' };
    default: return { ...base, type: 'door', height: 210, sill: 0 };
  }
}

// ------------------------------------------------------------------ furnishing

type Side = 'N' | 'E' | 'S' | 'W';
interface Box { x0: number; y0: number; x1: number; y1: number }
const SIDES: Side[] = ['N', 'E', 'S', 'W'];
const OPPOSITE: Record<Side, Side> = { N: 'S', S: 'N', E: 'W', W: 'E' };
const ROTATION: Record<Side, number> = { N: 0, E: 90, S: 180, W: 270 };
const hits = (a: Box, b: Box, gap = 0) => a.x0 < b.x1 + gap && a.x1 > b.x0 - gap && a.y0 < b.y1 + gap && a.y1 > b.y0 - gap;

interface Placed { item: FurnitureItem; side?: Side; along: number }

/** One room being furnished: knows its usable floor, where its doors need
 *  space, and what has been put down so far. */
class RoomKit {
  readonly inner: Box;
  readonly items: FurnitureItem[] = [];
  private readonly solids: Box[] = [];
  private readonly doorZones: Box[] = [];
  private readonly windowZones: Box[] = [];
  private readonly doorsBySide: Record<Side, number> = { N: 0, E: 0, S: 0, W: 0 };

  constructor(readonly room: BlueprintRoom, openings: BlueprintOpening[], private readonly allowPro: boolean) {
    const inset = DEFAULT_WALL_THICKNESS / 2 + 2;
    this.inner = { x0: room.x + inset, y0: room.y + inset, x1: room.x + room.w - inset, y1: room.y + room.h - inset };
    for (const o of openings) {
      if (!o.rooms.includes(room.id)) continue;
      const side: Side = o.vertical ? (Math.abs(o.x - room.x) < 1 ? 'W' : 'E') : (Math.abs(o.y - room.y) < 1 ? 'N' : 'S');
      const window = o.kind === 'window' || o.kind === 'small_window';
      // Space a door needs to open and be walked through; a window only
      // rules out tall pieces standing in front of it.
      const reach = window ? 45 : o.kind === 'open' ? 70 : 95;
      const half = o.width / 2 + (window ? 0 : 10);
      const zone: Box = o.vertical
        ? { x0: side === 'W' ? room.x : room.x + room.w - reach, x1: side === 'W' ? room.x + reach : room.x + room.w, y0: o.y - half, y1: o.y + half }
        : { x0: o.x - half, x1: o.x + half, y0: side === 'N' ? room.y : room.y + room.h - reach, y1: side === 'N' ? room.y + reach : room.y + room.h };
      (window ? this.windowZones : this.doorZones).push(zone);
      if (!window) this.doorsBySide[side] += 1;
    }
  }

  get width() { return this.inner.x1 - this.inner.x0; }
  get depth() { return this.inner.y1 - this.inner.y0; }
  get area() { return (this.room.w * this.room.h) / 10_000; }
  get centre() { return { x: (this.inner.x0 + this.inner.x1) / 2, y: (this.inner.y0 + this.inner.y1) / 2 }; }
  length(side: Side) { return side === 'N' || side === 'S' ? this.width : this.depth; }
  /** Walls to try first: no door on them, then the longest. */
  sides(prefer: Side[] = SIDES): Side[] {
    return [...prefer].sort((a, b) => this.doorsBySide[a] - this.doorsBySide[b] || this.length(b) - this.length(a));
  }

  private entry(type: string) {
    const entry = CATALOG_BY_TYPE[type];
    return entry && (this.allowPro || !entry.pro) ? entry : null;
  }

  private fits(box: Box, tall: boolean, gap = 4): boolean {
    const { inner } = this;
    if (box.x0 < inner.x0 - 0.5 || box.y0 < inner.y0 - 0.5 || box.x1 > inner.x1 + 0.5 || box.y1 > inner.y1 + 0.5) return false;
    if (this.doorZones.some((zone) => hits(box, zone))) return false;
    if (tall && this.windowZones.some((zone) => hits(box, zone))) return false;
    return !this.solids.some((solid) => hits(box, solid, gap));
  }

  private make(type: string, x: number, y: number, rotation: number): FurnitureItem {
    const e = CATALOG_BY_TYPE[type];
    return { id: uid(), type, name: e.name, position: { x, y }, rotation, width: e.width, depth: e.depth, height: e.height, color: e.color };
  }

  /** Back against `side`, centred `along` it (a coordinate, not a fraction).
   *  `snug` lets it touch its neighbour, for units that form one run. */
  wallAt(type: string, side: Side, along: number, tall = false, snug = false): Placed | null {
    const e = this.entry(type);
    if (!e) return null;
    const { inner } = this;
    const box: Box = side === 'N' ? { x0: along - e.width / 2, x1: along + e.width / 2, y0: inner.y0, y1: inner.y0 + e.depth }
      : side === 'S' ? { x0: along - e.width / 2, x1: along + e.width / 2, y0: inner.y1 - e.depth, y1: inner.y1 }
        : side === 'W' ? { x0: inner.x0, x1: inner.x0 + e.depth, y0: along - e.width / 2, y1: along + e.width / 2 }
          : { x0: inner.x1 - e.depth, x1: inner.x1, y0: along - e.width / 2, y1: along + e.width / 2 };
    if (!this.fits(box, tall, snug ? -0.5 : 4)) return null;
    const item = this.make(type, (box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2, ROTATION[side]);
    this.items.push(item);
    this.solids.push(box);
    return { item, side, along };
  }

  /** Back against `side`, `t` of the way along it (0 = one corner, 1 = the other). */
  wall(type: string, side: Side, t: number, tall = false): Placed | null {
    const e = this.entry(type);
    if (!e) return null;
    const start = (side === 'N' || side === 'S' ? this.inner.x0 : this.inner.y0) + e.width / 2;
    const end = (side === 'N' || side === 'S' ? this.inner.x1 : this.inner.y1) - e.width / 2;
    return end < start ? null : this.wallAt(type, side, start + (end - start) * t, tall);
  }

  /** First wall and position that works. */
  anyWall(type: string, sides: Side[], ts: number[], tall = false): Placed | null {
    for (const side of sides) for (const t of ts) {
      const placed = this.wall(type, side, t, tall);
      if (placed) return placed;
    }
    return null;
  }

  /** Free-standing. `overlay` pieces (rugs, ceiling lights) do not block others. */
  free(type: string, x: number, y: number, rotation = 0, overlay = false): FurnitureItem | null {
    const e = this.entry(type);
    if (!e) return null;
    const turned = rotation % 180 !== 0;
    const w = turned ? e.depth : e.width;
    const d = turned ? e.width : e.depth;
    const box: Box = { x0: x - w / 2, x1: x + w / 2, y0: y - d / 2, y1: y + d / 2 };
    const { inner } = this;
    if (overlay) {
      if (box.x0 < inner.x0 || box.y0 < inner.y0 || box.x1 > inner.x1 || box.y1 > inner.y1) return null;
    } else if (!this.fits(box, false)) return null;
    const item = this.make(type, x, y, rotation);
    this.items.push(item);
    if (!overlay) this.solids.push(box);
    return item;
  }

  /** A point `distance` out from a wall, level with `along`. */
  out(side: Side, along: number, distance: number): { x: number; y: number } {
    const { inner } = this;
    return side === 'N' ? { x: along, y: inner.y0 + distance }
      : side === 'S' ? { x: along, y: inner.y1 - distance }
        : side === 'W' ? { x: inner.x0 + distance, y: along }
          : { x: inner.x1 - distance, y: along };
  }

  /** Undo everything placed since `mark` (for all-or-nothing groups). */
  mark() { return [this.items.length, this.solids.length] as const; }
  rollback([items, solids]: readonly [number, number]) { this.items.length = items; this.solids.length = solids; }
}

function seating(kit: RoomKit, sides: Side[], t = [0.5, 0.3, 0.7]): void {
  const sofa = kit.anyWall('sofa', sides, t);
  if (!sofa?.side) return;
  const turned = sofa.side === 'E' || sofa.side === 'W' ? 90 : 0;
  const table = kit.out(sofa.side, sofa.along, 90 + 40 + 30);
  if (kit.free('coffee_table', table.x, table.y, turned)) kit.free('rug', table.x, table.y, turned, true);
  if (kit.length(sofa.side === 'N' || sofa.side === 'S' ? 'E' : 'N') >= 300) kit.wallAt('tv_stand', OPPOSITE[sofa.side], sofa.along);
  if (!kit.wallAt('floor_lamp', sofa.side, sofa.along + 100 + 24)) kit.wallAt('floor_lamp', sofa.side, sofa.along - 100 - 24);
}

function diningSet(kit: RoomKit, x: number, y: number, turned: boolean): boolean {
  if (!kit.free('dining_table', x, y, turned ? 90 : 0)) return false;
  for (const across of [-1, 1]) for (const along of [-40, 40]) {
    // A chair's back faces away from the table.
    if (turned) kit.free('dining_chair', x + across * 73, y + along, across < 0 ? 270 : 90);
    else kit.free('dining_chair', x + along, y + across * 73, across < 0 ? 0 : 180);
  }
  return true;
}

/** Fridge, counter, hob and sink in one run along a wall, or nothing. */
function kitchenRun(kit: RoomKit, sides: Side[]): Side | null {
  const widths = (types: string[]) => types.reduce((sum, type) => sum + (CATALOG_BY_TYPE[type]?.width ?? 0), 0);
  for (const units of [['fridge', 'counter', 'stove', 'kitchen_sink'], ['fridge', 'stove', 'kitchen_sink']]) {
    for (const side of sides) {
      const base = side === 'N' || side === 'S' ? kit.inner.x0 : kit.inner.y0;
      const spare = kit.length(side) - widths(units);
      if (spare < 0) continue;
      for (const lead of [0, spare, spare / 2]) {
        const mark = kit.mark();
        let cursor = base + lead;
        const ok = units.every((type) => {
          const width = CATALOG_BY_TYPE[type].width;
          const placed = kit.wallAt(type, side, cursor + width / 2, type === 'fridge', true);
          cursor += width;
          return !!placed;
        });
        if (ok) return side;
        kit.rollback(mark);
      }
    }
  }
  return null;
}

function furnish(kit: RoomKit, stairs: boolean): void {
  const { room, centre } = kit;
  const wide = kit.width >= kit.depth;
  const order = kit.sides();
  switch (room.type) {
    case 'bedroom': {
      const double = kit.area >= 10 && Math.min(kit.width, kit.depth) >= 270;
      const bed = kit.anyWall(double ? 'bed_double' : 'bed_single', order, [0.5, 0.3, 0.7, 0, 1])
        ?? kit.anyWall('bed_single', order, [0.5, 0, 1]);
      if (bed?.side) {
        const reach = bed.item.width / 2 + 45 / 2 + 4;
        kit.wallAt('nightstand', bed.side, bed.along - reach);
        kit.wallAt('nightstand', bed.side, bed.along + reach);
      }
      kit.anyWall('wardrobe', order.filter((side) => side !== bed?.side), [0, 1, 0.5], true);
      if (kit.area >= 13) kit.anyWall('dresser', order.filter((side) => side !== bed?.side), [0.5, 0, 1]);
      break;
    }
    case 'living':
      seating(kit, order);
      kit.anyWall('bookshelf', order, [0, 1], true);
      kit.anyWall('plant', order, [0, 1]);
      break;
    case 'open_living': {
      // Kitchen at one end, table in the middle, sofa at the other end.
      const [endA, endB]: Side[] = wide ? ['W', 'E'] : ['N', 'S'];
      const flanks: Side[] = wide ? ['N', 'S'] : ['W', 'E'];
      kitchenRun(kit, [endA, ...kit.sides(flanks)]);
      const along = (share: number) => (wide
        ? { x: kit.inner.x0 + kit.width * share, y: centre.y }
        : { x: centre.x, y: kit.inner.y0 + kit.depth * share });
      const table = along(0.42);
      diningSet(kit, table.x, table.y, !wide);
      seating(kit, [...kit.sides(flanks), endB], [0.82, 0.7, 0.9]);
      kit.anyWall('plant', [endB, ...flanks], [1, 0]);
      break;
    }
    case 'kitchen': {
      const run = kitchenRun(kit, order);
      if (run && kit.area >= 12 && kit.length(run === 'N' || run === 'S' ? 'E' : 'N') >= 320) {
        const spot = kit.out(OPPOSITE[run], run === 'N' || run === 'S' ? centre.x : centre.y, 45 + 28 + 50 + 10);
        diningSet(kit, spot.x, spot.y, run === 'E' || run === 'W');
      }
      break;
    }
    case 'dining':
      diningSet(kit, centre.x, centre.y, !wide);
      kit.anyWall('cabinets', order, [0.5, 0, 1]);
      break;
    case 'bathroom':
      if (!(kit.area >= 6 && kit.anyWall('bathtub', order, [0, 1]))) kit.anyWall('shower', order, [0, 1]);
      kit.anyWall('toilet', order, [1, 0, 0.5]);
      kit.anyWall('sink', order, [0.5, 0, 1]);
      break;
    case 'toilet':
      kit.anyWall('toilet', order, [0.5, 0, 1]);
      kit.anyWall('sink', order, [0, 1, 0.5]);
      break;
    case 'office': {
      const desk = kit.anyWall('desk', order, [0.5, 0.3, 0.7]);
      if (desk?.side) {
        const seat = kit.out(desk.side, desk.along, 70 + 8 + 30);
        kit.free('office_chair', seat.x, seat.y, (ROTATION[desk.side] + 180) % 360);
      }
      kit.anyWall('bookshelf', order.filter((side) => side !== desk?.side), [0, 1, 0.5], true);
      break;
    }
    case 'hallway':
      if (Math.min(kit.width, kit.depth) >= 150) kit.anyWall('console', order, [0.5, 0.25, 0.75]);
      break;
    case 'utility':
      kit.anyWall('washer', order, [0, 1]);
      kit.anyWall('cabinets', order, [0, 1, 0.5]);
      break;
    case 'storage':
      kit.anyWall('bookshelf', order, [0, 1, 0.5], true);
      break;
    case 'playroom':
      kit.free('rug', centre.x, centre.y, wide ? 0 : 90, true);
      kit.anyWall('bookshelf', order, [0, 1, 0.5], true);
      kit.anyWall('sofa', order, [0.5, 0, 1]);
      break;
    case 'stairwell':
      // Only where there is a storey to climb to. Not held clear of the
      // door: the door is how the stairs are reached.
      if (stairs) kit.free('stairs', centre.x, centre.y, wide ? 90 : 0, true);
      return;
    default:
      return;
  }
  // Long rooms get a light at each third; everything else one in the middle.
  const span = Math.max(kit.width, kit.depth);
  const lights = span >= 650 ? [1 / 4, 3 / 4] : [1 / 2];
  for (const share of lights) {
    kit.free('ceiling_light', wide ? kit.inner.x0 + kit.width * share : centre.x, wide ? centre.y : kit.inner.y0 + kit.depth * share, 0, true);
  }
}

/** Furniture for one floor of a blueprint. `stairs` says a storey sits above
 *  this one. Exported for tests. */
export function furnishFloor(floor: BlueprintFloor, allowPro: boolean, stairs = false): FurnitureItem[] {
  return floor.rooms.flatMap((room) => {
    const kit = new RoomKit(room, floor.openings, allowPro);
    furnish(kit, stairs);
    return kit.items;
  });
}

const FLOOR_NAMES = ['Ground floor', 'Upper floor', 'Upper floor 2'];

/**
 * A complete, loadable project from a blueprint. `allowPro` lets the
 * furnisher use Pro catalogue pieces; `floorName` localises storey names.
 */
export function blueprintToSnapshot(
  plan: Blueprint,
  opts: { allowPro: boolean; floorName?: (english: string) => string },
): MaybeFloored {
  const floors: FloorInfo[] = [];
  const floorGeom: Record<string, FloorGeom> = {};
  plan.floors.forEach((floor, level) => {
    const walls = wallsFor(floor.rooms);
    const openings = floor.openings.map((spec) => openingFor(spec, walls, opts.allowPro)).filter((o): o is Opening => !!o);
    const rooms: Room[] = floor.rooms.map((room) => ({
      id: uid(),
      name: room.name,
      points: [
        { x: room.x, y: room.y }, { x: room.x + room.w, y: room.y },
        { x: room.x + room.w, y: room.y + room.h }, { x: room.x, y: room.y + room.h },
      ],
      floorMaterial: FLOORING[room.type]?.[0] ?? 'oak',
      color: FLOORING[room.type]?.[1] ?? '#f6f1e5',
      auto: false,
    }));
    const id = uid();
    const name = FLOOR_NAMES[level] ?? `Floor ${level + 1}`;
    floors.push({ id, name: opts.floorName ? opts.floorName(name) : name, elevation: level * STOREY_RISE });
    floorGeom[id] = {
      walls, rooms, openings, background: null,
      furniture: plan.furnished ? furnishFloor(floor, opts.allowPro, level < plan.floors.length - 1) : [],
    };
  });
  const ground = floorGeom[floors[0].id];
  return dressed(
    { ...ground, projectName: plan.title, floors, floorGeom, activeFloorId: floors[0].id },
    { roof: ROOFS.slateGable, exterior: { color: '#e9e3d6' } },
  );
}
