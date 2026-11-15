import { useMemo } from 'react';
import { Group, Path } from 'react-konva';
import { SYMBOLS, FALLBACK_SYMBOL } from '../../lib/symbols';
import { isStairShape, stairPlan, stairSymbolPaths } from '../../lib/stairs';
import type { Shape3D } from '../../data/furnitureCatalog';

/**
 * Konva-side renderer for the plan symbols. The 100×100 viewbox is scaled to
 * the item's footprint; strokes are screen-space (strokeScaleEnabled=false)
 * so line weight stays crisp and uniform at any zoom or footprint size.
 *
 * Stairs are the exception: they are drawn from their real geometry at their
 * real size, so the treads in the plan are the treads in 3D.
 */
export default function FurnitureSymbol({
  shape,
  width,
  depth,
  height = 280,
  mirrored = false,
  color = '#242a33',
  opacity = 0.85,
  dashed = false,
}: {
  shape: Shape3D;
  width: number;
  depth: number;
  height?: number;
  mirrored?: boolean;
  color?: string;
  opacity?: number;
  /** Plan convention for wall-mounted items above the worktop (dashed). */
  dashed?: boolean;
}) {
  const stairPaths = useMemo(
    () => (isStairShape(shape) ? stairSymbolPaths(stairPlan(shape, width, depth, height, mirrored)) : null),
    [shape, width, depth, height, mirrored],
  );
  const spec = stairPaths ?? SYMBOLS[shape] ?? FALLBACK_SYMBOL;
  return (
    <Group
      x={stairPaths ? 0 : -width / 2}
      y={stairPaths ? 0 : -depth / 2}
      scaleX={stairPaths ? 1 : width / 100}
      scaleY={stairPaths ? 1 : depth / 100}
      listening={false}
      opacity={opacity}
    >
      {spec.map((p, i) => (
        <Path
          key={i}
          data={p.d}
          stroke={color}
          strokeWidth={p.sw ? p.sw * 0.55 : 1.6}
          strokeScaleEnabled={false}
          fill={p.fill ? color : undefined}
          dash={dashed ? [5, 4] : undefined}
          lineCap="round"
          lineJoin="round"
          perfectDrawEnabled={false}
        />
      ))}
    </Group>
  );
}
