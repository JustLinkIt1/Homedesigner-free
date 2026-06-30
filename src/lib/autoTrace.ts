// Automatic wall tracing from a raster floor plan (PDF render or image).
//
// Floor plans are overwhelmingly drawn as thick, axis-aligned black lines on a
// light background. We exploit that: binarize the image, then scan for long
// horizontal and vertical "bands" of dark pixels and turn each band into a
// centered wall segment. This is far more robust (fewer false positives) on
// real plans than a generic Hough transform, and runs in a few milliseconds.

export interface PixelSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thickness: number; // band thickness in source px
}

export interface TraceOptions {
  /** Fraction of the band's length that must be dark to count (0..1). */
  coverage: number;
  /** Minimum wall length in px (after downscale). */
  minLength: number;
  /** Maximum band thickness in px — rejects filled regions / text blocks. */
  maxThickness: number;
  /** Luminance threshold 0..255; pixels darker than this are "ink". */
  threshold: number;
}

export const DEFAULT_TRACE: TraceOptions = {
  coverage: 0.6,
  minLength: 24,
  maxThickness: 26,
  threshold: 150,
};

interface Binary {
  data: Uint8Array; // 1 = ink (dark), 0 = background
  w: number;
  h: number;
  scale: number; // source px per processed px
}

/**
 * Otsu's method: pick the luminance threshold that best separates dark "ink"
 * from the light background by maximising between-class variance over the
 * image histogram. This is what lets auto-trace work without the user fiddling
 * a sensitivity slider — the plan's own contrast chooses the cutoff.
 */
export function autoThreshold(img: ImageData, maxDim = 700): number {
  const scale = Math.max(1, Math.max(img.width, img.height) / maxDim);
  const w = Math.round(img.width / scale);
  const h = Math.round(img.height / scale);
  const hist = new Array(256).fill(0);
  let total = 0;
  const src = img.data;
  for (let y = 0; y < h; y++) {
    const sy = Math.min(img.height - 1, Math.floor(y * scale));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(img.width - 1, Math.floor(x * scale));
      const i = (sy * img.width + sx) * 4;
      if (src[i + 3] < 10) continue; // skip transparent
      const lum = Math.round(0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2]);
      hist[lum]++;
      total++;
    }
  }
  if (total === 0) return DEFAULT_TRACE.threshold;

  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0;
  let wB = 0;
  let maxVar = -1;
  let threshold = DEFAULT_TRACE.threshold;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > maxVar) {
      maxVar = between;
      threshold = t;
    }
  }
  // Bias slightly toward the dark side so faint background texture isn't ink.
  return Math.max(60, Math.min(210, threshold - 6));
}

/** Downscale to a manageable size and binarize using a luminance threshold. */
function binarize(img: ImageData, threshold: number, maxDim = 1100): Binary {
  const scale = Math.max(1, Math.max(img.width, img.height) / maxDim);
  const w = Math.round(img.width / scale);
  const h = Math.round(img.height / scale);
  const data = new Uint8Array(w * h);
  const src = img.data;
  for (let y = 0; y < h; y++) {
    const sy = Math.min(img.height - 1, Math.floor(y * scale));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(img.width - 1, Math.floor(x * scale));
      const i = (sy * img.width + sx) * 4;
      const a = src[i + 3];
      // Treat transparent pixels as background.
      const lum = a < 10 ? 255 : 0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2];
      data[y * w + x] = lum < threshold ? 1 : 0;
    }
  }
  return { data, w, h, scale };
}

/** Maximal runs of ink in a single row/column line of the binary image. */
function runsAlong(
  bin: Binary,
  fixed: number,
  horizontal: boolean,
  minLen: number,
): { start: number; end: number }[] {
  const { data, w, h } = bin;
  const len = horizontal ? w : h;
  const runs: { start: number; end: number }[] = [];
  let runStart = -1;
  const gapTol = 2; // bridge tiny gaps (anti-aliasing)
  let gap = 0;
  for (let i = 0; i < len; i++) {
    const idx = horizontal ? fixed * w + i : i * w + fixed;
    const ink = data[idx] === 1;
    if (ink) {
      if (runStart < 0) runStart = i;
      gap = 0;
    } else if (runStart >= 0) {
      gap++;
      if (gap > gapTol) {
        if (i - gap - runStart >= minLen) runs.push({ start: runStart, end: i - gap });
        runStart = -1;
        gap = 0;
      }
    }
  }
  if (runStart >= 0 && len - runStart >= minLen) runs.push({ start: runStart, end: len - 1 });
  return runs;
}

/** Group overlapping runs across adjacent scan-lines into thick bands. */
function bandsFromRuns(
  bin: Binary,
  horizontal: boolean,
  opts: TraceOptions,
): PixelSegment[] {
  const { w, h } = bin;
  const lines = horizontal ? h : w;
  const minLen = opts.minLength / bin.scale;

  type Band = { a: number; b: number; first: number; last: number; rows: number };
  let open: Band[] = [];
  const closed: Band[] = [];

  for (let line = 0; line < lines; line++) {
    const runs = runsAlong(bin, line, horizontal, minLen);
    const next: Band[] = [];
    const used = new Array(runs.length).fill(false);

    for (const band of open) {
      let matched = false;
      for (let r = 0; r < runs.length; r++) {
        if (used[r]) continue;
        const run = runs[r];
        // Overlap test between band [a,b] and run.
        const overlap = Math.min(band.b, run.end) - Math.max(band.a, run.start);
        if (overlap > 0) {
          band.a = Math.min(band.a, run.start);
          band.b = Math.max(band.b, run.end);
          band.last = line;
          band.rows++;
          used[r] = true;
          matched = true;
          break;
        }
      }
      if (matched) next.push(band);
      else closed.push(band);
    }
    for (let r = 0; r < runs.length; r++) {
      if (!used[r]) next.push({ a: runs[r].start, b: runs[r].end, first: line, last: line, rows: 1 });
    }
    open = next;
  }
  closed.push(...open);

  const segs: PixelSegment[] = [];
  for (const band of closed) {
    const thickness = (band.last - band.first + 1) * bin.scale;
    if (thickness > opts.maxThickness) continue; // filled area, not a wall
    const length = (band.b - band.a) * bin.scale;
    if (length < opts.minLength) continue;
    const center = ((band.first + band.last) / 2) * bin.scale;
    const a = band.a * bin.scale;
    const b = band.b * bin.scale;
    if (horizontal) {
      segs.push({ x1: a, y1: center, x2: b, y2: center, thickness });
    } else {
      segs.push({ x1: center, y1: a, x2: center, y2: b, thickness });
    }
  }
  return segs;
}

/**
 * Detect wall segments in an image. Coordinates are in source-image pixels.
 */
export function traceWalls(
  img: ImageData,
  options: Partial<TraceOptions> = {},
): PixelSegment[] {
  const opts = { ...DEFAULT_TRACE, ...options };
  const bin = binarize(img, opts.threshold);
  const horizontal = bandsFromRuns(bin, true, opts);
  const vertical = bandsFromRuns(bin, false, opts);
  return [...horizontal, ...vertical];
}
