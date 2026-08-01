/**
 * How big to draw a furniture sprite inside its plan footprint.
 *
 * Sprites are top-down renders, so by default they are contain-fitted to keep
 * the aspect the 3D model was normalised to. That is right until someone
 * resizes the object: contain-fitting keys the drawn size to the *image's*
 * aspect, so stretching an object's depth changed nothing in plan while 3D
 * scaled correctly. A tester hit this on a kitchen sink. Once an object has
 * been deliberately reshaped, its footprint is the truth and the sprite follows
 * it.
 */
export interface SpriteBox {
  w: number;
  h: number;
}

/** Footprint aspect differs enough from the catalogue's to count as a resize. */
const RESHAPE_EPSILON = 0.02;

export function spriteReshaped(
  width: number,
  depth: number,
  entry?: { width: number; depth: number },
): boolean {
  if (!entry) return false;
  const drawn = width / Math.max(depth, 1);
  const nominal = entry.width / Math.max(entry.depth, 1);
  return Math.abs(drawn - nominal) > RESHAPE_EPSILON;
}

export function spriteBox(
  width: number,
  depth: number,
  imageAspect: number,
  opts: { fill?: boolean; entry?: { width: number; depth: number } } = {},
): SpriteBox {
  if (opts.fill || spriteReshaped(width, depth, opts.entry)) return { w: width, h: depth };
  const w = width;
  const h = width / imageAspect;
  return h > depth ? { w: depth * imageAspect, h: depth } : { w, h };
}
