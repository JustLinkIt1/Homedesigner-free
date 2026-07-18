import { Group, Path } from 'react-konva';
import { SYMBOLS, FALLBACK_SYMBOL } from '../../lib/symbols';
import type { Shape3D } from '../../data/furnitureCatalog';

/**
 * Konva-side renderer for the plan symbols. The 100×100 viewbox is scaled to
 * the item's footprint; strokes are screen-space (strokeScaleEnabled=false)
 * so line weight stays crisp and uniform at any zoom or footprint size.
 */
export default function FurnitureSymbol({
  shape,
  width,
  depth,
  color = '#242a33',
  opacity = 0.85,
  dashed = false,
}: {
  shape: Shape3D;
  width: number;
  depth: number;
  color?: string;
  opacity?: number;
  /** Plan convention for wall-mounted items above the worktop (dashed). */
  dashed?: boolean;
}) {
  const spec = SYMBOLS[shape] ?? FALLBACK_SYMBOL;
  return (
    <Group
      x={-width / 2}
      y={-depth / 2}
      scaleX={width / 100}
      scaleY={depth / 100}
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
