// Bay windows: an opening of style 'bay' is a box that projects from the
// outside face of its wall, glazed on three sides, with the room's floor
// running out into it.
//
// The opening itself stays an ordinary window record on the host wall, so
// selecting, dragging and resizing it work as for any window. Everything the
// bay adds is DERIVED here from that record: three short walls, their windows
// and a floor patch. Nothing derived is stored, so a saved project needs no
// migration and an older build simply draws a plain window.
import { exteriorSideAt } from './exteriorFaces';
import { pointInPolygon } from './geometry';
import type { Opening, Point, Room, Wall, WallFaceFinish } from '../types';

/** How far a bay projects from the wall's centre line when the opening does not say (cm). */
export const BAY_DEPTH = 65;
/** Bay walls are slimmer than a house wall, as on a real bay. */
const BAY_WALL = 12;
/** Solid return between the bay's corner and its front glazing (cm). */
const BAY_PIER = 14;

export const isBay = (o: Pick<Opening, 'type' | 'style'>): boolean => o.type === 'window' && o.style === 'bay';

export interface BayFrame {
  /** Which side of the host wall the bay projects from (+1 = the wall's left normal). */
  side: 1 | -1;
  depth: number;
  /** Corners on the host wall's centre line, then out and back: a0, a1, b1, b0. */
  corners: [Point, Point, Point, Point];
}

/** Where a bay sits. Projects outdoors; on a wall with no outdoor side it keeps side +1. */
export function bayFrame(wall: Wall, opening: Opening, rooms: Room[]): BayFrame | null {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return null;
  const ux = dx / len, uy = dy / len;
  const side: 1 | -1 = exteriorSideAt(wall, rooms, opening.offset) ?? 1;
  const nx = -uy * side, ny = ux * side;
  const depth = Math.max(30, opening.depth ?? BAY_DEPTH);
  const half = Math.max(20, opening.width / 2);
  const cx = wall.start.x + ux * len * opening.offset;
  const cy = wall.start.y + uy * len * opening.offset;
  const a0 = { x: cx - ux * half, y: cy - uy * half };
  const b0 = { x: cx + ux * half, y: cy + uy * half };
  return {
    side,
    depth,
    corners: [a0, { x: a0.x + nx * depth, y: a0.y + ny * depth }, { x: b0.x + nx * depth, y: b0.y + ny * depth }, b0],
  };
}

export interface BayParts {
  /** The bay's own three walls, per bay. Their ids are derived, never stored. */
  walls: Wall[];
  /** Windows in those walls. */
  openings: Opening[];
  /** Which side of each bay wall faces outdoors, by wall id. The rooms cannot
   *  say: a bay's floor belongs to no room, so both its faces look outdoor. */
  outward: Record<string, 1 | -1>;
  /** One floor patch per bay, finished like the room it opens off. */
  floors: { id: string; points: Point[]; room: Room | null }[];
}

const EMPTY: BayParts = { walls: [], openings: [], floors: [], outward: {} };

/** A finish covering one whole face of a derived wall, copied from the host's outside face. */
function outerFinish(host: Wall, hostSide: 1 | -1, at: number, side: 1 | -1): WallFaceFinish[] {
  const finish = (host.faceFinishes ?? []).find((f) => f.side === hostSide && f.start <= at && f.end >= at)
    ?? (host.faceFinishes ?? []).find((f) => f.side === hostSide);
  return finish ? [{ ...finish, start: 0, end: 1, side }] : [];
}

/** The side of wall a→b whose normal points along (nx, ny). */
function sideFacing(a: Point, b: Point, nx: number, ny: number): 1 | -1 {
  const dx = b.x - a.x, dy = b.y - a.y;
  return -dy * nx + dx * ny >= 0 ? 1 : -1;
}

/** Everything the bays of one storey add to it. */
export function bayParts(walls: Wall[], openings: Opening[], rooms: Room[]): BayParts {
  if (!openings.some(isBay)) return EMPTY;
  const out: BayParts = { walls: [], openings: [], floors: [], outward: {} };
  const byId = new Map(walls.map((w) => [w.id, w]));
  for (const o of openings) {
    if (!isBay(o)) continue;
    const host = byId.get(o.wallId);
    if (!host) continue;
    const frame = bayFrame(host, o, rooms);
    if (!frame) continue;
    const [a0, a1, b1, b0] = frame.corners;
    const len = Math.hypot(host.end.x - host.start.x, host.end.y - host.start.y);
    const ux = (host.end.x - host.start.x) / len, uy = (host.end.y - host.start.y) / len;
    const nx = -uy * frame.side, ny = ux * frame.side; // outward
    const base = { thickness: Math.min(host.thickness, BAY_WALL), height: host.height, color: host.color, texture: host.texture };
    const mk = (suffix: string, start: Point, end: Point, outX: number, outY: number): Wall => ({
      ...base,
      id: `${o.id}:bay:${suffix}`,
      start,
      end,
      faceFinishes: outerFinish(host, frame.side, o.offset, sideFacing(start, end, outX, outY)),
    });
    const left = mk('a', a0, a1, -ux, -uy);
    const front = mk('f', a1, b1, nx, ny);
    const right = mk('b', b1, b0, ux, uy);
    out.walls.push(left, front, right);
    out.outward[left.id] = sideFacing(a0, a1, -ux, -uy);
    out.outward[front.id] = sideFacing(a1, b1, nx, ny);
    out.outward[right.id] = sideFacing(b1, b0, ux, uy);

    const win = (wall: Wall, offset: number, width: number): Opening => ({
      id: `${wall.id}:w`, wallId: wall.id, type: 'window', style: 'standard', offset, width, height: o.height, sill: o.sill,
    });
    const frontWidth = o.width - 2 * BAY_PIER;
    if (frontWidth >= 30) out.openings.push(win(front, 0.5, frontWidth));
    // Side lights only where the return is long enough to hold one.
    const clear = frame.depth - host.thickness / 2 - base.thickness / 2;
    const sideWidth = clear - 2 * 9;
    if (sideWidth >= 28) {
      const centre = (host.thickness / 2 + clear / 2) / frame.depth;
      out.openings.push(win(left, centre, sideWidth), win(right, 1 - centre, sideWidth));
    }

    // The room the bay opens off: the one just inside the host wall.
    const cx = host.start.x + ux * len * o.offset, cy = host.start.y + uy * len * o.offset;
    const probe = { x: cx - nx * (host.thickness / 2 + 5), y: cy - ny * (host.thickness / 2 + 5) };
    const room = rooms.find((r) => r.points.length >= 3 && pointInPolygon(probe, r.points)) ?? null;
    out.floors.push({ id: `${o.id}:bay:floor`, points: [a0, a1, b1, b0], room });
  }
  return out;
}
