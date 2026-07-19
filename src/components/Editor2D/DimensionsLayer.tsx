import { useMemo } from 'react';
import { Group, Line, Text, Rect } from 'react-konva';
import { useDesign } from '../../store/designStore';
import { dist, midpoint, boundsOf } from '../../lib/geometry';
import { formatLength, type Units } from '../../lib/units';
import { useTheme, canvasColors } from '../../lib/theme';
import type { Point, Wall } from '../../types';

/**
 * Architectural dimension annotations drawn over the 2D plan.
 *
 * Rendered INSIDE Canvas2D's transformed <Layer>, so all coordinates here are
 * in world space (cm). Sizes that should stay visually constant while zooming
 * (offsets, tick lengths, text) are divided by `zoom` so a screen-space "px"
 * value maps to the right number of cm at the current scale.
 */


interface Props {
  zoom: number;
  /** When set, per-wall length labels become clickable to type an exact length. */
  onEditWall?: (wallId: string) => void;
}

export default function DimensionsLayer({ zoom, onEditWall }: Props) {
  const walls = useDesign((s) => s.walls);
  const rooms = useDesign((s) => s.rooms);
  const units = useDesign((s) => s.units);

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

  // Interactive only enables the small clickable wall labels; every decorative
  // shape stays listening={false} so clicks still fall through to the walls.
  return (
    <Group listening={!!onEditWall}>
      {/* Per-wall dimensions (skips perimeter walls that duplicate the overall,
          and walls too short to label legibly at the current zoom). */}
      {bounds &&
        walls.map((w) => {
          if (dist(w.start, w.end) * zoom < 30) return null;
          if (isPerimeterDuplicate(w, bounds)) return null;
          return (
            <WallDimension key={w.id} wall={w} px={px} units={units} onEdit={onEditWall} />
          );
        })}

      {/* Building overall dimensions (top + left exterior) */}
      <OverallDimension walls={walls} px={px} units={units} />
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

/** A small length label centered on a single interior wall. */
function WallDimension({
  wall,
  px,
  units,
  onEdit,
}: {
  wall: Wall;
  px: (n: number) => number;
  units: Units;
  onEdit?: (wallId: string) => void;
}) {
  // Themed inks (legible on the light or dark canvas).
  const C = canvasColors(useTheme((t) => t.theme));
  const TEXT_COLOR = C.dimensionText;
  const PLATE_FILL = C.dimensionPlate;
  const PLATE_STROKE = C.dimensionPlateStroke;
  const a = wall.start;
  const b = wall.end;
  const len = dist(a, b);
  if (len < 1) return null;

  const dx = (b.x - a.x) / len;
  const dy = (b.y - a.y) / len;

  // Inline label centered ON the wall (no offset dimension line): the old
  // offset pushed interior-wall numbers into the neighbouring room, over its
  // name and furniture. A small rounded plate keeps the number legible over
  // any floor fill; click-to-edit is preserved. Perimeter lengths still read
  // cleanly from the overall building dimensions.
  let rot = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (rot > 90 || rot < -90) rot += 180; // keep text from being upside-down
  const lc = midpoint(a, b);
  const fs = px(11.5);
  const label = formatLength(len, units);
  const plateW = px(7) + label.length * fs * 0.56;
  const plateH = fs + px(5);

  return (
    <Group x={lc.x} y={lc.y} rotation={rot}>
      <Rect
        x={-plateW / 2}
        y={-plateH / 2}
        width={plateW}
        height={plateH}
        cornerRadius={plateH / 2}
        fill={PLATE_FILL}
        stroke={PLATE_STROKE}
        strokeWidth={px(0.6)}
        listening={false}
      />
      <Text
        x={-plateW / 2}
        y={-fs / 2}
        text={label}
        fontSize={fs}
        fontStyle="bold"
        fill={TEXT_COLOR}
        width={plateW}
        align="center"
        listening={!!onEdit}
        hitStrokeWidth={px(20)}
        onMouseEnter={(e) => {
          const st = e.target.getStage();
          if (st) st.container().style.cursor = 'text';
        }}
        onMouseLeave={(e) => {
          const st = e.target.getStage();
          if (st) st.container().style.cursor = 'default';
        }}
        onClick={(e) => {
          if (!onEdit) return;
          e.cancelBubble = true;
          onEdit(wall.id);
        }}
        onTap={(e) => {
          if (!onEdit) return;
          e.cancelBubble = true;
          onEdit(wall.id);
        }}
      />
    </Group>
  );
}

/** Exterior overall width (top) and height (left) for the whole building. */
function OverallDimension({ walls, px, units }: { walls: Wall[]; px: (n: number) => number; units: Units }) {
  const OVERALL_COLOR = canvasColors(useTheme((t) => t.theme)).dimensionOverall;
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
    <Group listening={false}>
      {/* top: overall width */}
      {witness(min.x, min.y, min.x, topY - tick)}
      {witness(max.x, min.y, max.x, topY - tick)}
      <Line points={[min.x, topY, max.x, topY]} stroke={OVERALL_COLOR} strokeWidth={px(1.1)} />
      {tickAt(min.x, topY)}
      {tickAt(max.x, topY)}
      <Text
        x={(min.x + max.x) / 2}
        y={topY - px(4)}
        text={formatLength(w, units)}
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
        text={formatLength(h, units)}
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
