import { useMemo } from 'react';
import { Group, Line, Text } from 'react-konva';
import { useDesign } from '../../store/designStore';
import { dist, midpoint, boundsOf, polygonArea, polygonCentroid } from '../../lib/geometry';
import type { Point, Wall, Room } from '../../types';

/**
 * Architectural dimension annotations drawn over the 2D plan.
 *
 * Rendered INSIDE Canvas2D's transformed <Layer>, so all coordinates here are
 * in world space (cm). Sizes that should stay visually constant while zooming
 * (offsets, tick lengths, text) are divided by `zoom` so a screen-space "px"
 * value maps to the right number of cm at the current scale.
 */

// Legible on the light canvas (#f1f1ec).
const COLOR = '#7c8493';
const TEXT_COLOR = '#3f4753';
const OVERALL_COLOR = '#2b3340';

const fmtLen = (cm: number): string =>
  cm >= 100 ? `${(cm / 100).toFixed(2)} m` : `${Math.round(cm)} cm`;

const fmtArea = (cm2: number): string => `${(Math.abs(cm2) / 10000).toFixed(2)} m²`;

interface Props {
  zoom: number;
}

export default function DimensionsLayer({ zoom }: Props) {
  const walls = useDesign((s) => s.walls);
  const rooms = useDesign((s) => s.rooms);

  // Screen-space sizes expressed in cm at the current zoom.
  const px = (n: number) => n / zoom;

  // Building bounds — used to centre dimension lines and to skip per-wall
  // dimensions that merely duplicate the overall building dimension.
  const bounds = useMemo(() => {
    const pts = walls.flatMap((w) => [w.start, w.end]);
    if (pts.length === 0) return null;
    return boundsOf(pts);
  }, [walls]);

  if (walls.length === 0 && rooms.length === 0) return null;
  const center = bounds
    ? { x: (bounds.min.x + bounds.max.x) / 2, y: (bounds.min.y + bounds.max.y) / 2 }
    : null;

  return (
    <Group listening={false}>
      {/* Per-wall dimensions (skips perimeter walls that duplicate the overall,
          and walls too short to label legibly at the current zoom). */}
      {center &&
        bounds &&
        walls.map((w) => {
          if (dist(w.start, w.end) * zoom < 30) return null;
          if (isPerimeterDuplicate(w, bounds)) return null;
          return <WallDimension key={w.id} wall={w} center={center} px={px} />;
        })}

      {/* Per-room area label (sizes come from wall/overall dims) */}
      {rooms.map((r) => (
        <RoomDimension key={r.id} room={r} px={px} />
      ))}

      {/* Building overall dimensions (top + left exterior) */}
      <OverallDimension walls={walls} px={px} />
    </Group>
  );
}

/** True when an axis-aligned wall runs along an outer edge for ~the full extent
 *  (so its length already shows in the overall building dimension). */
function isPerimeterDuplicate(
  w: Wall,
  bounds: { min: Point; max: Point },
): boolean {
  const tol = 6; // cm
  const fullW = bounds.max.x - bounds.min.x;
  const fullH = bounds.max.y - bounds.min.y;
  const horiz = Math.abs(w.start.y - w.end.y) < tol;
  const vert = Math.abs(w.start.x - w.end.x) < tol;
  const span = (a: number, b: number) => Math.abs(a - b);
  if (horiz && (near(w.start.y, bounds.min.y, tol) || near(w.start.y, bounds.max.y, tol))) {
    return span(w.start.x, w.end.x) > fullW * 0.92;
  }
  if (vert && (near(w.start.x, bounds.min.x, tol) || near(w.start.x, bounds.max.x, tol))) {
    return span(w.start.y, w.end.y) > fullH * 0.92;
  }
  return false;
}

const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

/** A dimension line offset just outside a single wall. */
function WallDimension({
  wall,
  center,
  px,
}: {
  wall: Wall;
  center: Point;
  px: (n: number) => number;
}) {
  const a = wall.start;
  const b = wall.end;
  const len = dist(a, b);
  if (len < 1) return null;

  // Unit direction along the wall and its (left-hand) normal.
  const dx = (b.x - a.x) / len;
  const dy = (b.y - a.y) / len;
  let nx = -dy;
  let ny = dx;

  // Point the normal toward the side AWAY from the building centre.
  const mid = midpoint(a, b);
  const toCenter = { x: center.x - mid.x, y: center.y - mid.y };
  if (nx * toCenter.x + ny * toCenter.y > 0) {
    nx = -nx;
    ny = -ny;
  }

  const offset = px(18) + wall.thickness / 2; // clear the wall body
  const tick = px(6);

  const off = (p: Point, d: number): Point => ({
    x: p.x + nx * d,
    y: p.y + ny * d,
  });

  const a1 = off(a, offset);
  const b1 = off(b, offset);

  // Witness (extension) lines from the wall ends out to the dimension line.
  const wGap = px(4); // small gap so witness lines don't touch the wall
  const aw0 = off(a, wGap);
  const bw0 = off(b, wGap);
  const aw1 = off(a, offset + tick);
  const bw1 = off(b, offset + tick);

  // 45° architectural ticks at each end of the dimension line.
  const tickVec = { x: (dx + nx) * tick, y: (dy + ny) * tick };

  // Label: upright/readable. Konva rotation is clockwise in degrees.
  let rot = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (rot > 90 || rot < -90) rot += 180; // keep text from being upside-down
  const lc = midpoint(a1, b1);
  const fs = px(12);
  const labelLift = px(3);
  // Lift the text slightly off the line, on the outer side.
  const lp = { x: lc.x + nx * labelLift, y: lc.y + ny * labelLift };

  return (
    <Group>
      {/* witness lines */}
      <Line points={[aw0.x, aw0.y, aw1.x, aw1.y]} stroke={COLOR} strokeWidth={px(0.8)} />
      <Line points={[bw0.x, bw0.y, bw1.x, bw1.y]} stroke={COLOR} strokeWidth={px(0.8)} />
      {/* dimension line */}
      <Line points={[a1.x, a1.y, b1.x, b1.y]} stroke={COLOR} strokeWidth={px(0.9)} />
      {/* end ticks (45°) */}
      <Line
        points={[a1.x - tickVec.x, a1.y - tickVec.y, a1.x + tickVec.x, a1.y + tickVec.y]}
        stroke={COLOR}
        strokeWidth={px(1)}
      />
      <Line
        points={[b1.x - tickVec.x, b1.y - tickVec.y, b1.x + tickVec.x, b1.y + tickVec.y]}
        stroke={COLOR}
        strokeWidth={px(1)}
      />
      {/* length label, centred and upright */}
      <Text
        x={lp.x}
        y={lp.y}
        text={fmtLen(len)}
        fontSize={fs}
        fill={TEXT_COLOR}
        rotation={rot}
        offsetX={px(28)}
        offsetY={fs}
        width={px(56)}
        align="center"
      />
    </Group>
  );
}

/** A single, legible area label placed just below the room name. */
function RoomDimension({ room, px }: { room: Room; px: (n: number) => number }) {
  if (room.points.length < 3) return null;
  const c = polygonCentroid(room.points);
  const fs = px(12.5);
  // The room name is drawn ~at the centroid in Canvas2D; sit the area below it.
  return (
    <Text
      x={c.x}
      y={c.y + px(12)}
      text={fmtArea(polygonArea(room.points))}
      fontSize={fs}
      fill={TEXT_COLOR}
      offsetX={px(40)}
      width={px(80)}
      align="center"
    />
  );
}

/** Exterior overall width (top) and height (left) for the whole building. */
function OverallDimension({ walls, px }: { walls: Wall[]; px: (n: number) => number }) {
  if (walls.length === 0) return null;
  const pts = walls.flatMap((w) => [w.start, w.end]);
  const { min, max } = boundsOf(pts);
  const w = max.x - min.x;
  const h = max.y - min.y;
  if (w < 1 && h < 1) return null;

  const gap = px(48); // sit well outside per-wall dimensions
  const tick = px(7);
  const fs = px(13);

  const topY = min.y - gap;
  const leftX = min.x - gap;

  // Witness lines connecting the plan extents to the overall dimension lines.
  const witness = (x1: number, y1: number, x2: number, y2: number) => (
    <Line points={[x1, y1, x2, y2]} stroke={OVERALL_COLOR} strokeWidth={px(0.7)} />
  );
  const tickAt = (x: number, y: number) => (
    <Line points={[x - tick, y - tick, x + tick, y + tick]} stroke={OVERALL_COLOR} strokeWidth={px(1.1)} />
  );

  return (
    <Group>
      {/* top: overall width */}
      {witness(min.x, min.y, min.x, topY - tick)}
      {witness(max.x, min.y, max.x, topY - tick)}
      <Line points={[min.x, topY, max.x, topY]} stroke={OVERALL_COLOR} strokeWidth={px(1.1)} />
      {tickAt(min.x, topY)}
      {tickAt(max.x, topY)}
      <Text
        x={(min.x + max.x) / 2}
        y={topY - px(4)}
        text={fmtLen(w)}
        fontSize={fs}
        fill={OVERALL_COLOR}
        fontStyle="bold"
        offsetX={px(34)}
        offsetY={fs + px(4)}
        width={px(68)}
        align="center"
      />
      {/* left: overall height */}
      {witness(min.x, min.y, leftX - tick, min.y)}
      {witness(min.x, max.y, leftX - tick, max.y)}
      <Line points={[leftX, min.y, leftX, max.y]} stroke={OVERALL_COLOR} strokeWidth={px(1.1)} />
      {tickAt(leftX, min.y)}
      {tickAt(leftX, max.y)}
      <Text
        x={leftX - px(4)}
        y={(min.y + max.y) / 2}
        text={fmtLen(h)}
        fontSize={fs}
        fill={OVERALL_COLOR}
        fontStyle="bold"
        rotation={-90}
        offsetX={px(34)}
        offsetY={fs + px(4)}
        width={px(68)}
        align="center"
      />
    </Group>
  );
}
