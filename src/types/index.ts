// Core domain types for the home designer.
// All planar coordinates are in centimeters (cm). The 2D editor maps cm -> px
// via a zoom factor; the 3D scene maps cm -> meters (÷100).

export interface Point {
  x: number;
  y: number;
}

/** A user-uploaded texture image (data URL) applied to a wall or floor.
 *  `scaleCm` is the real-world size of one tile of the pattern along either
 *  axis, so a 30x30cm floor tile pattern set to 30 renders at real scale. */
export interface CustomTexture {
  src: string;
  scaleCm: number;
  /** PBR overrides for built-in material-library textures (user uploads leave
   *  these undefined and fall back to sensible per-surface defaults). */
  roughness?: number;
  metalness?: number;
}

/** A normalized stretch of one side of a structural wall. `side` is relative
 * to the wall's start -> end direction: +1 is the left face, -1 the right. */
export interface WallFaceRange {
  start: number;
  end: number;
  side: -1 | 1;
}

/** Paint override for one room-facing stretch of a wall. */
export interface WallFaceFinish extends WallFaceRange {
  color: string;
  texture?: CustomTexture;
}

export interface Wall {
  id: string;
  start: Point;
  end: Point;
  /** Wall thickness in cm. */
  thickness: number;
  /** Wall height in cm. */
  height: number;
  color: string;
  /** Optional custom paint image — overrides `color` in the 3D view. */
  texture?: CustomTexture;
  /** Per-room/per-side finishes. Older projects omit this and keep using the
   * whole-wall color/texture above. */
  faceFinishes?: WallFaceFinish[];
}

export interface Room {
  id: string;
  name: string;
  /** Ordered polygon of corner points (cm). */
  points: Point[];
  floorMaterial: string;
  color: string;
  /** True when created by automatic room detection (so re-detection can refresh it). */
  auto?: boolean;
  /** Optional custom floor image — overrides `floorMaterial` in the 3D view. */
  texture?: CustomTexture;
  /**
   * An outdoor surface (patio, deck, driveway, path, lawn) rather than an
   * interior room. Same polygon primitive — it just renders on the ground with
   * no slab beneath and no ceiling above, and takes an outdoor material.
   */
  outdoor?: boolean;
}

/** Visual/behavioural variant of an opening.
 *  Doors: single (default) / double / sliding / pocket / bifold.
 *  Doorless interior openings (kind 'door', no leaf): passage / arch.
 *  Windows: standard (default) / french / casement; 'sliding' is shared. */
export type OpeningStyle =
  | 'single'
  | 'double'
  | 'sliding'
  | 'pocket'
  | 'bifold'
  | 'passage'
  | 'arch'
  | 'standard'
  | 'french'
  | 'casement';

/** A door or window cut into a wall. */
export interface Opening {
  id: string;
  wallId: string;
  type: 'door' | 'window';
  /** Variant: doors are single (default) / double / sliding; windows are
   *  standard (default) / french (full-height). */
  style?: OpeningStyle;
  /** Position of the opening centre along the wall as a 0..1 fraction
   *  (start→end). Stored relative so it survives wall moves, reversals and
   *  scaling. */
  offset: number;
  /** Opening width along the wall (cm). */
  width: number;
  /** Opening height (cm). */
  height: number;
  /** Height of the sill above the floor (cm) — 0 for doors. */
  sill: number;
  /** Mirror a hinged/pocket/sliding opening to the opposite jamb/side. */
  flipHinge?: boolean;
  /** Swing the leaf toward the opposite side of the wall. */
  flipSwing?: boolean;
}

export interface FurnitureItem {
  id: string;
  /** Catalog key, e.g. "sofa", "bed". */
  type: string;
  name: string;
  /** Center position in plan space (cm). */
  position: Point;
  /** Rotation around the vertical axis, in degrees. */
  rotation: number;
  /** Footprint width (X) and depth (Y) in cm. */
  width: number;
  depth: number;
  /** Height in cm (for 3D). */
  height: number;
  color: string;
}

/** A raster plan (from PDF or image) shown beneath the editor for tracing. */
export interface BackgroundPlan {
  /** Data URL of the rendered image. */
  src: string;
  /** Image natural size in px. */
  imgWidth: number;
  imgHeight: number;
  /** Placement in plan space (cm). */
  x: number;
  y: number;
  /** cm per image pixel — calibrates real-world scale. */
  scale: number;
  rotation: number;
  opacity: number;
}

export type ToolMode =
  | 'select'
  | 'wall'
  | 'room'
  | 'furniture'
  | 'kitchen'
  | 'pan'
  | 'erase'
  | 'measure';

/** A storey: its own walls/rooms/furniture, stacked at `elevation` (cm). */
/** NB: the roof lives on FloorInfo, NOT FloorGeom. FloorGeom is rebuilt from
 *  explicit field lists in several places (geomOf, commit, scaleGeom, cloneFloor);
 *  a new field there would be silently dropped by any call site that missed it.
 *  FloorInfo is always spread whole, so an optional field survives for free. */
export interface FloorInfo {
  id: string;
  name: string;
  /** Base height of this storey above ground, in cm. */
  elevation: number;
  /** Roof sitting on this storey. Absent = no roof (all existing saves). */
  roof?: Roof;
}

/** The editable geometry that belongs to a single storey. */
export interface FloorGeom {
  walls: Wall[];
  rooms: Room[];
  furniture: FurnitureItem[];
  openings: Opening[];
  background: BackgroundPlan | null;
}

export type ViewMode = '2d' | '3d';

export interface Selection {
  kind: 'wall' | 'room' | 'furniture' | 'opening' | null;
  id: string | null;
  /** Present when a wall was selected from a specific face in 3D. */
  wallFace?: WallFaceRange;
}

/** Roof shape. `flat` is exact for any footprint and is the safe fallback. */
export type RoofType = 'flat' | 'shed' | 'gable' | 'hip';

/** Roof covering. Procedural (see `getRoofTexture`) — nothing bundled reads as
 *  roofing, and photographic roof sets would add real weight to the APK. */
export type RoofCovering = 'tile' | 'shingle' | 'slate' | 'metal' | 'plain';

export interface Roof {
  type: RoofType;
  /** Pitch in degrees (ignored by `flat`). */
  pitch: number;
  /** Eave overhang beyond the outer wall face, cm. */
  overhang: number;
  /** Deck/fascia thickness, cm. */
  thickness: number;
  covering: RoofCovering;
  /** Real-world size of one covering tile, cm. */
  coveringScaleCm: number;
  color: string;
  /** A user-supplied image, which wins over `covering` when present. */
  texture?: CustomTexture;
}
