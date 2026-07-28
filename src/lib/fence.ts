import type { Wall, FenceStyle } from '../types';

/** A fence is a boundary run, not a building wall: no roof, no room, no
 *  cladding. Everything that reasons about the *building* should filter with
 *  `structuralWalls` first; everything that reasons about *barriers* (walk
 *  collision, snapping, the 2D plan) should keep fences in. */
export function isFence(w: Wall): boolean {
  return w.kind === 'fence';
}

/** Default worktop/guard height for a new pony wall. */
export const HALF_WALL_HEIGHT = 105;

/** A low wall is still part of the building; unlike a fence it encloses rooms,
 * carries finishes and blocks walkthrough movement. */
export function isHalfWall(w: Wall): boolean {
  return !isFence(w) && w.halfWall === true;
}

/** Walls that actually build the house. */
export function structuralWalls(walls: Wall[]): Wall[] {
  return walls.filter((w) => !isFence(w));
}

/** Sensible height in cm when a wall is converted into a fence. A 270cm garden
 *  fence looks absurd, and a 100cm one reads as a railing, so each style gets
 *  the height it is actually built at. */
export const FENCE_HEIGHTS: Record<FenceStyle, number> = {
  picket: 110,
  privacy: 180,
  rail: 120,
  railing: 100,
};

export const DEFAULT_FENCE_STYLE: FenceStyle = 'picket';

/** One box of a fence, in wall-local cm.
 *  `x` runs along the wall from its start, `y` up from the floor, `z` across
 *  the centreline. All values are centres; `w`/`h`/`d` are full sizes. */
export interface FenceBox {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  /** Posts and rails are the frame; slats are the infill. The renderer shades
   *  the frame slightly darker so the fence reads as built, not extruded. */
  part: 'post' | 'rail' | 'slat';
}

interface Profile {
  postW: number;
  postD: number;
  /** Maximum spacing between post centres, in cm. */
  postEvery: number;
  slatW: number;
  slatGap: number;
  slatD: number;
  /** Ground clearance under the slats. */
  slatBottom: number;
  /** Gap between the top of the slats and the top of the fence. */
  slatTopGap: number;
  railD: number;
  railH: number;
  /** Heights of horizontal rails as a fraction of fence height. */
  railAt: number[];
  /** A capping rail across the very top. */
  topCap: boolean;
}

const PROFILES: Record<FenceStyle, Profile> = {
  // Classic garden picket: spaced vertical boards on two rails.
  picket: {
    postW: 9, postD: 9, postEvery: 180,
    slatW: 7, slatGap: 5, slatD: 3, slatBottom: 12, slatTopGap: 6,
    railD: 4, railH: 9, railAt: [0.3, 0.75], topCap: false,
  },
  // Close-board privacy panel: boards almost touching, full height.
  privacy: {
    postW: 10, postD: 10, postEvery: 200,
    slatW: 14, slatGap: 1, slatD: 3, slatBottom: 5, slatTopGap: 0,
    railD: 4, railH: 9, railAt: [0.25, 0.7], topCap: true,
  },
  // Ranch/post-and-rail: no infill at all, just horizontal rails.
  rail: {
    postW: 10, postD: 10, postEvery: 220,
    slatW: 0, slatGap: 0, slatD: 0, slatBottom: 0, slatTopGap: 0,
    railD: 5, railH: 14, railAt: [0.3, 0.6, 0.9], topCap: false,
  },
  // Deck/balcony railing: slim balusters under a broad top cap.
  railing: {
    postW: 6, postD: 6, postEvery: 150,
    slatW: 3, slatGap: 9, slatD: 3, slatBottom: 6, slatTopGap: 8,
    railD: 7, railH: 6, railAt: [0.12], topCap: true,
  },
};

export function fenceProfile(style: FenceStyle | undefined): Profile {
  return PROFILES[style ?? DEFAULT_FENCE_STYLE];
}

/**
 * Build one run of fence between `a` and `b` (cm along the wall).
 *
 * Runs come from the same span splitter the solid walls use, so an opening in a
 * fence is simply a gap — which is exactly what a gate or a garden entrance is.
 * Posts are placed at both ends of every run, so a gate always gets a post on
 * each side rather than floating between slats.
 */
export function fenceRunBoxes(
  a: number,
  b: number,
  height: number,
  style: FenceStyle | undefined,
): FenceBox[] {
  const p = fenceProfile(style);
  const run = b - a;
  if (run <= 0 || height <= 0) return [];
  const out: FenceBox[] = [];

  // Posts: both ends, plus evenly spaced intermediates so no bay exceeds
  // `postEvery`. Spacing them evenly (rather than every N cm with a short
  // leftover bay) is what stops a fence looking machine-truncated at one end.
  const bays = Math.max(1, Math.ceil(run / p.postEvery));
  const postH = height + (p.topCap ? 0 : p.postW * 0.4); // caps hide the post top
  for (let i = 0; i <= bays; i++) {
    out.push({
      x: a + (run * i) / bays,
      y: postH / 2,
      z: 0,
      w: p.postW,
      h: postH,
      d: p.postD,
      part: 'post',
    });
  }

  // Horizontal rails span the whole run, inset so they die into the posts.
  const railA = a + p.postW / 2;
  const railB = b - p.postW / 2;
  const railLen = railB - railA;
  if (railLen > 0) {
    for (const f of p.railAt) {
      out.push({
        x: (railA + railB) / 2,
        y: height * f,
        z: 0,
        w: railLen,
        h: p.railH,
        d: p.railD,
        part: 'rail',
      });
    }
    if (p.topCap) {
      out.push({
        x: (railA + railB) / 2,
        y: height - p.railH / 2,
        z: 0,
        w: railLen,
        h: p.railH,
        d: p.railD,
        part: 'rail',
      });
    }
  }

  // Vertical infill, centred in the run so the end gaps match each other. A
  // fence with a wide gap at one end and none at the other looks like a bug.
  const pitch = p.slatW + p.slatGap;
  if (p.slatW > 0 && pitch > 0) {
    const usable = run - p.postW; // keep slats clear of the end posts
    const n = Math.floor((usable + p.slatGap) / pitch);
    if (n > 0) {
      const spread = n * pitch - p.slatGap;
      const first = a + (run - spread) / 2 + p.slatW / 2;
      const top = height - p.slatTopGap;
      const h = top - p.slatBottom;
      if (h > 0) {
        for (let i = 0; i < n; i++) {
          out.push({
            x: first + i * pitch,
            y: p.slatBottom + h / 2,
            z: 0,
            w: p.slatW,
            h,
            d: p.slatD,
            part: 'slat',
          });
        }
      }
    }
  }

  return out;
}
