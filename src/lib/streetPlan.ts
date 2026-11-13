// Where the street goes.
//
// A house standing alone on a lawn that runs to the horizon reads as a model
// on a table. What makes an outside view look like a place is the ordinary
// stuff in front of it: a road, a pavement, a path to the front door, a drive,
// a fence along the front. None of it is part of the plan, so it is worked out
// from the plan: the front door says which way the house faces, and everything
// is laid out from there, clear of whatever has been drawn.
//
// Pure plan geometry (cm). The 3D side is components/Viewer3D/StreetScene.tsx.

import { exteriorSideAt } from './exteriorFaces';
import type { FloorGeom, Point } from '../types';

export interface StreetPlan {
  /** The front door, on its wall line. Everything below is measured from here. */
  origin: Point;
  /** Unit vector from the house towards the street, and along the street. */
  front: Point;
  right: Point;
  /** Bands across the front, as [near, far] distances along `front`. */
  pavement: [number, number];
  road: [number, number];
  farPavement: [number, number];
  /** The plot's side boundaries along `right`, and how far back it runs. */
  plot: [number, number];
  back: number;
  /** Strips running from the house to the pavement: centre along `right`,
   *  width, and the distance along `front` where each starts. */
  path: { at: number; width: number; from: number };
  drive: { at: number; width: number; from: number } | null;
}

const FRONT_DOORS = new Set(['front', 'front_glazed', 'front_modern']);
const GARDEN = 550; // depth of a front garden with nothing drawn in it
const PAVEMENT = 180;
const ROAD = 620;
const PATH = 110;
const DRIVE = 300;

/** The street layout for a storey's plan, or null when it has no door to the outside. */
export function streetPlan(geom: Pick<FloorGeom, 'walls' | 'rooms' | 'openings' | 'furniture'>): StreetPlan | null {
  const byId = new Map(geom.walls.map((w) => [w.id, w]));
  let found: { origin: Point; front: Point } | null = null;
  // A proper front door decides it. Plans drawn before those existed have an
  // ordinary door in an outside wall instead, so failing a front door the
  // first of those will do; glazed garden doors (sliding, double) never count.
  const isFront = (style: string | undefined) => !!style && FRONT_DOORS.has(style);
  const candidates = [
    ...geom.openings.filter((o) => o.type === 'door' && isFront(o.style)),
    ...geom.openings.filter((o) => o.type === 'door' && (!o.style || o.style === 'single')),
  ];
  for (const o of candidates) {
    const w = byId.get(o.wallId);
    if (!w) continue;
    const dx = w.end.x - w.start.x, dy = w.end.y - w.start.y;
    const len = Math.hypot(dx, dy);
    if (len < 1) continue;
    const side = exteriorSideAt(w, geom.rooms, o.offset);
    if (side == null) continue;
    found = {
      origin: { x: w.start.x + dx * o.offset, y: w.start.y + dy * o.offset },
      // Side +1 of a wall is its left normal, (-dy, dx).
      front: { x: (-dy / len) * side, y: (dx / len) * side },
    };
    break;
  }
  if (!found) return null;
  const { origin, front } = found;
  // Chosen so that (right, up, front) is a right-handed frame in the 3D scene.
  const right: Point = { x: front.y, y: -front.x };
  const f = (p: Point) => (p.x - origin.x) * front.x + (p.y - origin.y) * front.y;
  const r = (p: Point) => (p.x - origin.x) * right.x + (p.y - origin.y) * right.y;

  const drawn: Point[] = [
    ...geom.walls.flatMap((w) => [w.start, w.end]),
    ...geom.rooms.flatMap((room) => room.points),
    ...geom.furniture.map((item) => item.position),
  ];
  const fs = drawn.map(f), rs = drawn.map(r);
  const frontMost = Math.max(0, ...fs);
  // Anything drawn out front (a porch, a bay, a planted bed) pushes the street away.
  const building = geom.walls.filter((w) => w.kind !== 'fence');
  const houseFront = Math.max(0, ...building.flatMap((w) => [f(w.start), f(w.end)]));
  const start = Math.max(houseFront + GARDEN, frontMost + 250);
  const plot: [number, number] = [Math.min(...rs) - 350, Math.max(...rs) + 350];

  // Everything a drive must not run over: walls and fences, the edges of every
  // room (a deck or patio is a room), and whatever stands in the garden.
  const edges: [Point, Point][] = [
    ...geom.walls.map((w): [Point, Point] => [w.start, w.end]),
    ...geom.rooms.flatMap((room) => room.points.map((p, i): [Point, Point] => [p, room.points[(i + 1) % room.points.length]])),
    ...geom.furniture.map((item): [Point, Point] => [item.position, item.position]),
  ];
  /** The front-most drawn thing within a strip along `right`: where a drive has to stop. */
  const wallFront = (lo: number, hi: number): number => {
    let reach = -Infinity;
    for (const [start, end] of edges) {
      let a = { r: r(start), f: f(start) }, b = { r: r(end), f: f(end) };
      if (a.r > b.r) [a, b] = [b, a];
      if (b.r < lo || a.r > hi) continue;
      const at = (x: number) => (b.r - a.r < 1e-6 ? Math.max(a.f, b.f) : a.f + ((b.f - a.f) * (x - a.r)) / (b.r - a.r));
      reach = Math.max(reach, at(Math.max(lo, a.r)), at(Math.min(hi, b.r)));
    }
    return reach;
  };

  // A drive goes to a garage door when the front has one, otherwise beside the
  // path on whichever side has the room.
  let drive: StreetPlan['drive'] = null;
  const garage = geom.openings.find((o) => {
    if (o.type !== 'door' || o.width < 200 || (o.style && FRONT_DOORS.has(o.style))) return false;
    const w = byId.get(o.wallId);
    if (!w) return false;
    const dx = w.end.x - w.start.x, dy = w.end.y - w.start.y;
    const len = Math.hypot(dx, dy) || 1;
    const side = exteriorSideAt(w, geom.rooms, o.offset);
    return side != null && ((-dy / len) * side) * front.x + ((dx / len) * side) * front.y > 0.9;
  });
  if (garage) {
    const w = byId.get(garage.wallId)!;
    const at = r({ x: w.start.x + (w.end.x - w.start.x) * garage.offset, y: w.start.y + (w.end.y - w.start.y) * garage.offset });
    const width = Math.max(DRIVE, garage.width + 60);
    drive = { at, width, from: Math.max(0, wallFront(at - width / 2, at + width / 2)) + 5 };
  } else {
    const offset = PATH / 2 + 60 + DRIVE / 2;
    const roomRight = plot[1] - 60 - (offset + DRIVE / 2);
    const roomLeft = -plot[0] - 60 - (offset + DRIVE / 2);
    if (Math.max(roomRight, roomLeft) >= 0) {
      const at = roomRight >= roomLeft ? offset : -offset;
      drive = { at, width: DRIVE, from: Math.max(0, wallFront(at - DRIVE / 2 - 40, at + DRIVE / 2 + 40)) + 60 };
    }
  }
  // No room left for a car between what is drawn and the pavement: no drive.
  if (drive && start - drive.from < 300) drive = null;

  return {
    origin, front, right,
    pavement: [start, start + PAVEMENT],
    road: [start + PAVEMENT, start + PAVEMENT + ROAD],
    farPavement: [start + PAVEMENT + ROAD, start + PAVEMENT * 2 + ROAD],
    plot,
    back: Math.min(0, ...fs) - 450,
    path: { at: 0, width: PATH, from: 8 },
    drive,
  };
}
