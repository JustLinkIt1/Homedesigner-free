// Real text widths for canvas labels.
//
// The 2D plan used to size a room's name plate from `text.length * fontSize *
// 0.56` — an average-glyph guess. Guessing low is not cosmetic here: the plate
// is drawn at the guessed width while the Konva <Text> is laid out at its own
// (wider) box, so any underestimate leaves the name hanging outside its own
// backing plate and over whatever is beneath it. "Great Room" became
// "Great Roo|m" spilling onto the furniture.
//
// Reported: "sometimes text overflows as in the attached screenshot."
//
// Measuring is cheap and exact. Results are cached because the plan re-renders
// on every pan, zoom and drag, and room names change rarely.

/** Konva's default font family — the plan's <Text> nodes do not override it. */
export const CANVAS_FONT_FAMILY = 'Arial';

let ctx: CanvasRenderingContext2D | null = null;
const cache = new Map<string, number>();
/** Bounded so a long editing session cannot grow this without limit. */
const MAX_CACHE = 500;

/**
 * Width in CSS pixels of `text` rendered at `fontPx`.
 *
 * Measured at a fixed 100px and scaled, so every size of the same string shares
 * one cache entry and one measurement — font metrics are linear in size.
 * Returns a proportional estimate if no canvas is available (SSR, or a context
 * the browser refuses), which keeps callers total rather than making them
 * handle null.
 */
export function measureTextPx(text: string, fontPx: number, bold = false): number {
  if (!text) return 0;
  const key = `${bold ? 'b' : 'n'}:${text}`;
  let per100 = cache.get(key);
  if (per100 === undefined) {
    if (!ctx) {
      try {
        ctx = document.createElement('canvas').getContext('2d');
      } catch {
        ctx = null;
      }
    }
    if (ctx) {
      ctx.font = `${bold ? 'bold ' : ''}100px ${CANVAS_FONT_FAMILY}`;
      per100 = ctx.measureText(text).width;
    } else {
      per100 = text.length * 56; // same average-glyph fallback as before
    }
    if (cache.size >= MAX_CACHE) cache.clear();
    cache.set(key, per100);
  }
  return (per100 * fontPx) / 100;
}
