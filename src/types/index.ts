// Core domain types for the home designer.
// All planar coordinates are in centimeters (cm). The 2D editor maps cm -> px
// via a zoom factor; the 3D scene maps cm -> meters (÷100).

export interface Point {
  x: number;
  y: number;
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
}

/** A door or window cut into a wall. */
export interface Opening {
  id: string;
  wallId: string;
  type: 'door' | 'window';
  /** Distance of the opening centre from the wall's start point, in cm. */
  offset: number;
  /** Opening width along the wall (cm). */
  width: number;
  /** Opening height (cm). */
  height: number;
  /** Height of the sill above the floor (cm) — 0 for doors. */
  sill: number;
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
  | 'pan'
  | 'erase'
  | 'measure';

export type ViewMode = '2d' | '3d';

export interface Selection {
  kind: 'wall' | 'room' | 'furniture' | 'opening' | null;
  id: string | null;
}
