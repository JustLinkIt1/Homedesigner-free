// Architectural top-view plan symbols for every furniture shape, as SVG path
// data in a normalized 100×100 viewbox (y=0 is the item's back, matching the
// 3D meshes' orientation). One source of truth rendered two ways: Konva
// <Path> on the plan canvas and plain <svg> in the catalog sidebar — replacing
// the emoji icons that made the 2D editor read as a toy.

import type { Shape3D } from '../data/furnitureCatalog';

export interface SymbolPath {
  d: string;
  /** Filled (with low opacity) instead of stroked. */
  fill?: boolean;
  /** Stroke width in viewbox units for the sidebar SVG (default 3). */
  sw?: number;
}

const rect = (x: number, y: number, w: number, h: number, r = 0): string =>
  r > 0
    ? `M${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h} H${x + r} Q${x},${y + h} ${x},${y + h - r} V${y + r} Q${x},${y} ${x + r},${y} Z`
    : `M${x},${y} H${x + w} V${y + h} H${x} Z`;

const circle = (cx: number, cy: number, r: number): string =>
  `M${cx - r},${cy} A${r},${r} 0 1 0 ${cx + r},${cy} A${r},${r} 0 1 0 ${cx - r},${cy} Z`;

export const SYMBOLS: Partial<Record<Shape3D, SymbolPath[]>> = {
  sofa: [
    { d: rect(4, 4, 92, 92, 10) },
    { d: 'M4,28 H96' }, // backrest
    { d: 'M18,28 V96 M82,28 V96' }, // arms
    { d: 'M50,28 V96' }, // cushion split
  ],
  bed: [
    { d: rect(4, 4, 92, 92) },
    { d: rect(12, 10, 34, 18, 4) }, // pillows
    { d: rect(54, 10, 34, 18, 4) },
    { d: 'M4,40 H96' }, // blanket edge
  ],
  chair: [
    { d: rect(10, 6, 80, 16, 4) }, // backrest
    { d: rect(14, 24, 72, 68, 8) }, // seat
  ],
  stool: [{ d: circle(50, 50, 44) }],
  ottoman: [
    { d: rect(6, 6, 88, 88, 14) },
    { d: 'M36,36 L64,64 M64,36 L36,64' },
  ],
  side_table: [{ d: circle(50, 50, 44) }, { d: circle(50, 50, 6) }],
  table: [
    { d: rect(4, 4, 92, 92, 4) },
    { d: rect(14, 14, 72, 72, 2), sw: 2 },
  ],
  lamp: [{ d: circle(50, 50, 40) }, { d: 'M50,10 V90 M10,50 H90', sw: 2 }],
  plant: [
    { d: circle(50, 50, 44) },
    { d: 'M50,10 V90 M18,32 Q50,52 82,32 M18,68 Q50,48 82,68', sw: 2 },
  ],
  rug: [
    { d: rect(3, 3, 94, 94) },
    { d: rect(13, 13, 74, 74), sw: 2 },
  ],
  tv: [
    { d: rect(4, 20, 92, 60, 4) },
    { d: rect(12, 30, 76, 40), sw: 2 },
  ],
  fridge: [
    { d: rect(6, 4, 88, 92, 4) },
    { d: 'M6,56 H94' }, // door split
    { d: 'M20,66 V82 M80,66 V82', sw: 2 }, // handles
  ],
  toilet: [
    { d: rect(20, 4, 60, 24, 4) }, // cistern
    { d: 'M50,32 C74,32 84,48 84,62 C84,82 68,94 50,94 C32,94 16,82 16,62 C16,48 26,32 50,32 Z' },
  ],
  bathtub: [
    { d: rect(4, 4, 92, 92, 14) },
    { d: rect(14, 14, 72, 74, 24), sw: 2 },
    { d: circle(50, 28, 4), sw: 2 },
  ],
  door: [
    { d: 'M12,92 V12' },
    { d: 'M12,12 A80,80 0 0 1 92,92', sw: 2 },
  ],
  window: [{ d: 'M4,36 H96 M4,50 H96 M4,64 H96', sw: 2.5 }],
  door_double: [
    { d: 'M4,92 V46' },
    { d: 'M4,46 A46,46 0 0 1 50,92', sw: 2 },
    { d: 'M96,92 V46' },
    { d: 'M96,46 A46,46 0 0 0 50,92', sw: 2 },
  ],
  door_sliding: [
    { d: rect(4, 36, 58, 13) },
    { d: rect(38, 54, 58, 13) },
    { d: 'M14,86 H50 M14,86 L22,80 M14,86 L22,92', sw: 2 },
  ],
  window_french: [
    { d: 'M4,34 H96 M4,66 H96', sw: 2.5 },
    { d: 'M33,34 V66 M50,34 V66 M67,34 V66', sw: 2 },
  ],
  door_passage: [
    { d: 'M4,42 H24 M76,42 H96 M4,58 H24 M76,58 H96', sw: 3 },
    { d: 'M30,50 H70', sw: 1.5 },
  ],
  door_arch: [
    // Elevation view reads instantly as an arched opening.
    { d: 'M22,92 V52 A28,28 0 0 1 78,52 V92', sw: 2.5 },
    { d: 'M10,92 H90', sw: 2 },
  ],
  door_pocket: [
    { d: rect(6, 42, 38, 16) }, // leaf tucked in the wall cavity
    { d: 'M52,50 H88 M80,44 L88,50 L80,56', sw: 2 },
    { d: 'M48,36 V64 M92,36 V64', sw: 2.5 },
  ],
  door_bifold: [
    { d: 'M6,74 L28,42 L50,74 L72,42 L94,74', sw: 2.5 },
    { d: 'M6,74 H94', sw: 1.5 },
  ],
  window_sliding: [
    { d: 'M4,38 H96 M4,62 H96', sw: 2 },
    { d: rect(8, 41, 50, 8) },
    { d: rect(42, 51, 50, 8) },
    { d: 'M32,82 H68 M60,76 L68,82 L60,88', sw: 2 },
  ],
  window_casement: [
    { d: 'M4,50 H96', sw: 2.5 },
    { d: 'M24,50 V22', sw: 2 },
    { d: 'M24,22 A28,28 0 0 1 52,50', sw: 1.5 },
  ],
  bookshelf: [
    { d: rect(4, 8, 92, 84) },
    { d: 'M20,8 V92 M36,8 V92 M52,8 V92 M68,8 V92 M84,8 V92', sw: 2 },
  ],
  crib: [
    { d: rect(4, 4, 92, 92, 8) },
    { d: rect(16, 16, 68, 68, 6), sw: 2 },
  ],
  pendant: [{ d: circle(50, 50, 38), sw: 2 }, { d: circle(50, 50, 14) }],
  ceiling_light: [
    { d: circle(50, 50, 34) },
    { d: 'M50,4 V16 M50,84 V96 M4,50 H16 M84,50 H96', sw: 2 },
  ],
  desk_lamp: [
    { d: circle(32, 70, 16) },
    { d: 'M32,70 L68,32', sw: 2.5 },
    { d: circle(70, 30, 12) },
  ],
  spotlight: [{ d: circle(50, 50, 30), sw: 2 }, { d: circle(50, 50, 12) }],
  led_strip: [{ d: 'M6,50 H94', sw: 6 }, { d: 'M14,42 V58 M34,42 V58 M54,42 V58 M74,42 V58 M90,42 V58', sw: 1.5 }],
  cove_light: [{ d: rect(8, 40, 84, 20, 4) }, { d: 'M18,50 H82', sw: 3 }],
  sconce: [{ d: 'M28,20 H72 L82,80 H18 Z', sw: 2 }, { d: 'M40,20 A10,10 0 0 1 60,20', sw: 2 }],
  mirror: [
    { d: rect(4, 26, 92, 48, 4) },
    { d: 'M30,66 L52,34 M46,66 L68,34', sw: 2 },
  ],
  wall_art: [
    { d: rect(4, 22, 92, 56) },
    { d: rect(16, 32, 68, 36), sw: 2 },
  ],
  curtains: [
    { d: 'M4,50 Q13,26 22,50 Q31,74 40,50 Q49,26 58,50 Q67,74 76,50 Q85,26 96,50', sw: 2.5 },
  ],
  stove: [
    { d: rect(4, 4, 92, 92, 4) },
    { d: circle(30, 30, 13), sw: 2 },
    { d: circle(70, 30, 13), sw: 2 },
    { d: circle(30, 70, 13), sw: 2 },
    { d: circle(70, 70, 13), sw: 2 },
  ],
  sink: [
    { d: rect(4, 4, 92, 92, 4) },
    { d: rect(18, 26, 64, 58, 12), sw: 2 },
    { d: circle(50, 14, 5), sw: 2 },
  ],
  vanity: [
    { d: rect(4, 4, 92, 92, 4) },
    { d: 'M50,30 C68,30 78,42 78,56 C78,72 66,80 50,80 C34,80 22,72 22,56 C22,42 32,30 50,30 Z', sw: 2 },
    { d: circle(50, 20, 4), sw: 2 },
  ],
  cabinets: [
    { d: rect(4, 4, 92, 92) },
    { d: 'M50,4 V96' },
    { d: 'M40,74 V86 M60,74 V86', sw: 2 },
  ],
  dishwasher: [
    { d: rect(4, 4, 92, 92, 4) },
    { d: 'M4,20 H96', sw: 2 },
    { d: circle(50, 58, 24), sw: 2 },
  ],
  washer: [
    { d: rect(4, 4, 92, 92, 4) },
    { d: 'M4,20 H96', sw: 2 },
    { d: circle(50, 58, 28), sw: 2 },
    { d: circle(50, 58, 15), sw: 2 },
  ],
  shower: [
    { d: rect(4, 4, 92, 92, 6) },
    { d: 'M4,4 L38,38 M96,4 L62,38 M4,96 L38,62 M96,96 L62,62', sw: 2 },
    { d: circle(50, 50, 7), sw: 2 },
  ],
  monitor: [
    { d: rect(4, 24, 92, 44, 4) },
    { d: 'M35,80 H65', sw: 2.5 },
  ],
  stairs: [
    { d: rect(4, 4, 92, 92) },
    { d: 'M4,22 H96 M4,40 H96 M4,58 H96 M4,76 H96', sw: 2 },
    { d: 'M50,90 V14 M50,14 L42,26 M50,14 L58,26', sw: 2.5 },
  ],
  // Kitchen worktop / base cabinet: outline + front-edge line (the worktop
  // overhang) + a centred pull. Backs sit at y=0 like the 3D meshes.
  counter: [
    { d: rect(4, 4, 92, 92) },
    { d: 'M4,82 H96', sw: 2 },
    { d: 'M40,90 H60', sw: 2 },
  ],
  // Generic closed volume (chests, boxes): outline + light diagonals so it
  // doesn't read as an unstyled fallback rectangle.
  box: [
    { d: rect(4, 4, 92, 92, 4) },
    { d: 'M4,4 L96,96 M96,4 L4,96', sw: 1.2 },
  ],
};

/** Sidebar/canvas fallback for shapes without dedicated art (plain box). */
export const FALLBACK_SYMBOL: SymbolPath[] = [{ d: rect(8, 8, 84, 84, 6) }];
