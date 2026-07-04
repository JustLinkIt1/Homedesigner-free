import { SYMBOLS, FALLBACK_SYMBOL } from '../lib/symbols';
import type { Shape3D } from '../data/furnitureCatalog';

/** HTML-side renderer for the plan symbols (catalog cards, menus). */
export default function SymbolIcon({ shape, className }: { shape: Shape3D; className?: string }) {
  const spec = SYMBOLS[shape] ?? FALLBACK_SYMBOL;
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      {spec.map((p, i) => (
        <path
          key={i}
          d={p.d}
          fill={p.fill ? 'currentColor' : 'none'}
          fillOpacity={p.fill ? 0.15 : undefined}
          stroke="currentColor"
          strokeWidth={p.sw ?? 3}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}
