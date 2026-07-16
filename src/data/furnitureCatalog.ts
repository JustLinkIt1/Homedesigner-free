// Furniture catalog. Each entry defines default dimensions (cm) and how the
// item is rendered in 3D. Keeping this data-driven makes it trivial to grow.

export type Shape3D =
  | 'box' // simple block (table top, cabinet)
  | 'sofa'
  | 'bed'
  | 'chair'
  | 'table'
  | 'lamp'
  | 'led_strip'
  | 'cove_light'
  | 'sconce'
  | 'spotlight'
  | 'plant'
  | 'rug'
  | 'tv'
  | 'fridge'
  | 'toilet'
  | 'bathtub'
  | 'door'
  | 'window'
  // newly added richer shapes
  | 'bookshelf'
  | 'pendant'
  | 'ceiling_light'
  | 'mirror'
  | 'curtains'
  | 'stove'
  | 'sink'
  | 'cabinets'
  | 'counter'
  | 'dishwasher'
  | 'washer'
  | 'shower'
  | 'vanity'
  | 'stairs'
  | 'ottoman'
  | 'side_table'
  | 'crib'
  | 'monitor'
  | 'desk_lamp'
  | 'wall_art'
  | 'stool'
  // opening variants (sidebar icons / ghosts only — they place wall openings)
  | 'door_double'
  | 'door_sliding'
  | 'door_pocket'
  | 'door_bifold'
  | 'door_passage'
  | 'door_arch'
  | 'window_french'
  | 'window_sliding'
  | 'window_casement';

export interface CatalogEntry {
  type: string;
  name: string;
  category: string;
  /** default width (X), depth (Y), height (Z) in cm */
  width: number;
  depth: number;
  height: number;
  color: string;
  shape: Shape3D;
  icon: string; // emoji used in the 2D palette / sidebar
  /** Present when this entry places a wall opening instead of furniture. */
  opening?: { kind: 'door' | 'window'; style: import('../types').OpeningStyle; sill: number };
  /** Pro-catalog item: visible to everyone, placement requires the unlock.
   *  Rendering of already-placed pro items is NEVER gated. */
  pro?: true;
  /** Optional real model. Remote catalog entries use an absolute R2 URL while
   *  bundled entries continue to resolve through GltfFurniture's local map. */
  model?: {
    url: string;
    yaw?: number;
    bytes?: number;
    sha256?: string;
    source?: {
      name: string;
      url: string;
      author?: string;
      license: 'CC0';
    };
  };
  /** Set only for entries loaded from the signed-off cloud manifest. */
  cloud?: true;
}

/** Alternate catalog navigation that cuts across rooms. Keep this derived so
 * existing project/catalog data stays backward compatible as the library grows. */
export const CATALOG_GROUP_ORDER = [
  'Seating',
  'Tables',
  'Storage',
  'Beds',
  'Kitchen',
  'Bathroom fixtures',
  'Workspace',
  'Lighting',
  'Decor',
  'Outdoor',
  'Other',
] as const;

export type CatalogGroup = (typeof CATALOG_GROUP_ORDER)[number];

const SEATING_SHAPES = new Set<Shape3D>(['sofa', 'chair', 'ottoman', 'stool']);
const DECOR_TYPES = new Set([
  'rug', 'round_rug', 'plant', 'large_plant', 'clay_planter', 'mirror',
  'floor_mirror', 'curtains', 'wall_art', 'throw_pillows', 'tv_stand',
]);

export function catalogGroupFor(entry: CatalogEntry): CatalogGroup {
  if (entry.category === 'Outdoor') return 'Outdoor';
  if (entry.category === 'Office') return 'Workspace';
  if (entry.category === 'Lighting') return 'Lighting';
  if (entry.category === 'Bathroom') return 'Bathroom fixtures';
  if (entry.category === 'Kitchen' && !SEATING_SHAPES.has(entry.shape)) return 'Kitchen';
  if (entry.shape === 'bed' || entry.shape === 'crib') return 'Beds';
  if (SEATING_SHAPES.has(entry.shape)) return 'Seating';
  if (entry.shape === 'table' || entry.shape === 'side_table') return 'Tables';
  if (
    entry.shape === 'bookshelf' ||
    ['nightstand', 'wardrobe', 'dresser', 'display_cabinet', 'sideboard', 'chest_of_drawers'].includes(entry.type)
  ) return 'Storage';
  if (DECOR_TYPES.has(entry.type) || entry.category === 'Decor') return 'Decor';
  return 'Other';
}

export const FURNITURE_CATALOG: CatalogEntry[] = [
  // Living room
  { type: 'sofa', name: 'Sofa', category: 'Living', width: 200, depth: 90, height: 80, color: '#6b7a8f', shape: 'sofa', icon: '🛋️' },
  { type: 'armchair', pro: true, name: 'Armchair', category: 'Living', width: 80, depth: 80, height: 80, color: '#8a9bb0', shape: 'chair', icon: '🪑' },
  { type: 'coffee_table', name: 'Coffee Table', category: 'Living', width: 110, depth: 60, height: 40, color: '#9c6b3f', shape: 'table', icon: '🪵' },
  { type: 'tv_stand', name: 'TV', category: 'Living', width: 130, depth: 12, height: 75, color: '#1c1c22', shape: 'tv', icon: '📺' },
  { type: 'rug', name: 'Rug', category: 'Living', width: 200, depth: 140, height: 1, color: '#c98f6a', shape: 'rug', icon: '🟫' },
  { type: 'plant', name: 'Plant', category: 'Living', width: 40, depth: 40, height: 120, color: '#3f7d4f', shape: 'plant', icon: '🪴' },
  { type: 'floor_lamp', name: 'Floor Lamp', category: 'Living', width: 35, depth: 35, height: 160, color: '#d9c27a', shape: 'lamp', icon: '💡' },
  { type: 'bookshelf', name: 'Bookshelf', category: 'Living', width: 90, depth: 30, height: 200, color: '#8a5a30', shape: 'bookshelf', icon: '📚' },
  { type: 'ottoman', name: 'Ottoman', category: 'Living', width: 70, depth: 70, height: 42, color: '#7d8aa0', shape: 'ottoman', icon: '🟦' },
  { type: 'side_table', name: 'Side Table', category: 'Living', width: 45, depth: 45, height: 55, color: '#9c6b3f', shape: 'side_table', icon: '🛋️' },
  { type: 'console', pro: true, name: 'Console Table', category: 'Living', width: 120, depth: 35, height: 80, color: '#7a5a3a', shape: 'table', icon: '🪵' },
  { type: 'lounge_chair', pro: true, name: 'Lounge Chair', category: 'Living', width: 75, depth: 80, height: 75, color: '#7f8a72', shape: 'chair', icon: '🪑' },

  // Bedroom
  { type: 'bed_double', name: 'Double Bed', category: 'Bedroom', width: 160, depth: 210, height: 50, color: '#b6a98f', shape: 'bed', icon: '🛏️' },
  { type: 'bed_single', name: 'Single Bed', category: 'Bedroom', width: 100, depth: 200, height: 50, color: '#b6a98f', shape: 'bed', icon: '🛏️' },
  { type: 'nightstand', name: 'Nightstand', category: 'Bedroom', width: 45, depth: 40, height: 50, color: '#9c6b3f', shape: 'box', icon: '🗄️' },
  { type: 'wardrobe', name: 'Wardrobe', category: 'Bedroom', width: 150, depth: 60, height: 210, color: '#7a5a3a', shape: 'box', icon: '🚪' },
  { type: 'dresser', name: 'Dresser', category: 'Bedroom', width: 120, depth: 50, height: 80, color: '#9c6b3f', shape: 'box', icon: '🗄️' },
  { type: 'crib', pro: true, name: 'Crib', category: 'Bedroom', width: 75, depth: 130, height: 95, color: '#e3d8c4', shape: 'crib', icon: '👶' },
  { type: 'mirror', pro: true, name: 'Wall Mirror', category: 'Bedroom', width: 70, depth: 4, height: 120, color: '#cfe6ef', shape: 'mirror', icon: '🪞' },
  { type: 'curtains', pro: true, name: 'Curtains', category: 'Bedroom', width: 140, depth: 12, height: 220, color: '#cdb89a', shape: 'curtains', icon: '🪟' },

  // Dining / Kitchen
  { type: 'dining_table', name: 'Dining Table', category: 'Dining', width: 160, depth: 90, height: 75, color: '#8a5a30', shape: 'table', icon: '🍽️' },
  { type: 'round_dining_table', pro: true, name: 'Round Table', category: 'Dining', width: 120, depth: 120, height: 75, color: '#9c6b3f', shape: 'table', icon: '🍽️' },
  { type: 'dining_chair', name: 'Dining Chair', category: 'Dining', width: 45, depth: 50, height: 90, color: '#6e5236', shape: 'chair', icon: '🪑' },
  { type: 'fridge', name: 'Refrigerator', category: 'Kitchen', width: 70, depth: 70, height: 180, color: '#d6d9dd', shape: 'fridge', icon: '🧊' },
  { type: 'counter', name: 'Counter', category: 'Kitchen', width: 200, depth: 60, height: 90, color: '#cfd2d6', shape: 'counter', icon: '🍳' },
  { type: 'island', pro: true, name: 'Kitchen Island', category: 'Kitchen', width: 180, depth: 90, height: 90, color: '#bfc3c8', shape: 'counter', icon: '🍳' },
  { type: 'stove', name: 'Stove / Oven', category: 'Kitchen', width: 60, depth: 60, height: 90, color: '#cdd0d4', shape: 'stove', icon: '🍳' },
  { type: 'kitchen_sink', name: 'Kitchen Sink', category: 'Kitchen', width: 90, depth: 60, height: 90, color: '#cfd2d6', shape: 'sink', icon: '🚰' },
  { type: 'cabinets', name: 'Kitchen Cabinets', category: 'Kitchen', width: 120, depth: 35, height: 70, color: '#e6e2da', shape: 'cabinets', icon: '🗄️' },
  // Modular Kenney base units — place in a row to build a custom kitchen run
  // (each is a single ~60 cm cabinet with its own countertop).
  { type: 'kitchen_base_cabinet', name: 'Base Cabinet', category: 'Kitchen', width: 55, depth: 60, height: 62, color: '#cfd2d6', shape: 'counter', icon: '🗄️' },
  { type: 'kitchen_drawer_cabinet', pro: true, name: 'Drawer Unit', category: 'Kitchen', width: 55, depth: 60, height: 62, color: '#cfd2d6', shape: 'counter', icon: '🗄️' },
  { type: 'kitchen_corner_cabinet', pro: true, name: 'Corner Cabinet', category: 'Kitchen', width: 90, depth: 90, height: 62, color: '#cfd2d6', shape: 'counter', icon: '🗄️' },
  { type: 'dishwasher', pro: true, name: 'Dishwasher', category: 'Kitchen', width: 60, depth: 60, height: 85, color: '#c9cdd2', shape: 'dishwasher', icon: '🧼' },
  { type: 'bar_stool', pro: true, name: 'Bar Stool', category: 'Kitchen', width: 38, depth: 38, height: 75, color: '#4a3a28', shape: 'stool', icon: '🪑' },

  // Bathroom
  { type: 'toilet', name: 'Toilet', category: 'Bathroom', width: 40, depth: 65, height: 75, color: '#f2f4f6', shape: 'toilet', icon: '🚽' },
  { type: 'bathtub', name: 'Bathtub', category: 'Bathroom', width: 170, depth: 75, height: 55, color: '#eef1f4', shape: 'bathtub', icon: '🛁' },
  { type: 'sink', name: 'Sink', category: 'Bathroom', width: 60, depth: 45, height: 85, color: '#f2f4f6', shape: 'sink', icon: '🚰' },
  { type: 'shower', name: 'Shower', category: 'Bathroom', width: 90, depth: 90, height: 200, color: '#d4e6ee', shape: 'shower', icon: '🚿' },
  { type: 'vanity', pro: true, name: 'Sink Vanity', category: 'Bathroom', width: 90, depth: 50, height: 85, color: '#7a5a3a', shape: 'vanity', icon: '🪞' },
  { type: 'washer', pro: true, name: 'Washing Machine', category: 'Bathroom', width: 60, depth: 60, height: 85, color: '#e6e8ea', shape: 'washer', icon: '🧺' },

  // Office
  { type: 'desk', name: 'Desk', category: 'Office', width: 140, depth: 70, height: 75, color: '#7a5a3a', shape: 'table', icon: '🖥️' },
  { type: 'office_chair', name: 'Office Chair', category: 'Office', width: 60, depth: 60, height: 110, color: '#2c2c33', shape: 'chair', icon: '🪑' },
  { type: 'office_bookshelf', pro: true, name: 'Office Shelf', category: 'Office', width: 90, depth: 30, height: 200, color: '#8a5a30', shape: 'bookshelf', icon: '📚' },
  { type: 'monitor', pro: true, name: 'Monitor', category: 'Office', width: 60, depth: 18, height: 40, color: '#15151a', shape: 'monitor', icon: '🖥️' },
  { type: 'desk_lamp', pro: true, name: 'Desk Lamp', category: 'Office', width: 18, depth: 18, height: 45, color: '#2c2c33', shape: 'desk_lamp', icon: '💡' },
  { type: 'filing_cabinet', pro: true, name: 'Filing Cabinet', category: 'Office', width: 45, depth: 55, height: 110, color: '#9aa0a6', shape: 'box', icon: '🗄️' },

  // Lighting
  { type: 'pendant', pro: true, name: 'Pendant Light', category: 'Lighting', width: 30, depth: 30, height: 40, color: '#3a3a40', shape: 'pendant', icon: '💡' },
  { type: 'ceiling_light', name: 'Ceiling Light', category: 'Lighting', width: 50, depth: 50, height: 12, color: '#f4f0e4', shape: 'ceiling_light', icon: '💡' },
  { type: 'table_lamp', name: 'Table Lamp', category: 'Lighting', width: 28, depth: 28, height: 55, color: '#e8d49a', shape: 'desk_lamp', icon: '💡' },
  { type: 'spotlight', name: 'Recessed Spotlight', category: 'Lighting', width: 12, depth: 12, height: 8, color: '#fff4e0', shape: 'spotlight', icon: '🔆' },
  { type: 'led_strip', pro: true, name: 'LED Strip', category: 'Lighting', width: 120, depth: 4, height: 3, color: '#ffd9a0', shape: 'led_strip', icon: '➖' },
  { type: 'cove_light', pro: true, name: 'Cove / Niche Light', category: 'Lighting', width: 90, depth: 14, height: 10, color: '#ffe6c0', shape: 'cove_light', icon: '🔅' },
  { type: 'wall_sconce', pro: true, name: 'Wall Sconce', category: 'Lighting', width: 18, depth: 14, height: 30, color: '#ffe9c0', shape: 'sconce', icon: '💡' },

  // Decor
  { type: 'wall_art', pro: true, name: 'Wall Art', category: 'Decor', width: 80, depth: 4, height: 60, color: '#b0795a', shape: 'wall_art', icon: '🖼️' },
  { type: 'floor_mirror', pro: true, name: 'Floor Mirror', category: 'Decor', width: 60, depth: 5, height: 170, color: '#cfe6ef', shape: 'mirror', icon: '🪞' },
  { type: 'large_plant', name: 'Large Plant', category: 'Decor', width: 55, depth: 55, height: 170, color: '#346b41', shape: 'plant', icon: '🪴' },
  { type: 'round_rug', pro: true, name: 'Round Rug', category: 'Decor', width: 160, depth: 160, height: 1, color: '#c0738f', shape: 'rug', icon: '🟣' },

  // Outdoor
  { type: 'patio_table', pro: true, name: 'Patio Table', category: 'Outdoor', width: 90, depth: 90, height: 72, color: '#6f7d6a', shape: 'table', icon: '🪑' },
  { type: 'patio_chair', pro: true, name: 'Patio Chair', category: 'Outdoor', width: 55, depth: 55, height: 85, color: '#6f7d6a', shape: 'chair', icon: '🪑' },
  { type: 'bench', name: 'Garden Bench', category: 'Outdoor', width: 150, depth: 50, height: 80, color: '#6e5236', shape: 'sofa', icon: '🪑' },
  { type: 'stairs', name: 'Stairs', category: 'Outdoor', width: 100, depth: 250, height: 280, color: '#9aa0a6', shape: 'stairs', icon: '🪜' },

  // Realistic CC0 model pack (Poly Haven) — extra furnishings across rooms.
  { type: 'accent_chair', pro: true, name: 'Accent Chair', category: 'Living', width: 70, depth: 72, height: 80, color: '#7f8a72', shape: 'chair', icon: '🪑' },
  { type: 'rocking_chair', pro: true, name: 'Rocking Chair', category: 'Living', width: 62, depth: 95, height: 105, color: '#7a5a3a', shape: 'chair', icon: '🪑' },
  { type: 'round_coffee_table', pro: true, name: 'Round Coffee Table', category: 'Living', width: 90, depth: 90, height: 42, color: '#9c6b3f', shape: 'table', icon: '🪵' },
  { type: 'tall_side_table', pro: true, name: 'Tall Side Table', category: 'Living', width: 42, depth: 42, height: 62, color: '#8a5a30', shape: 'side_table', icon: '🪵' },
  { type: 'accent_table', pro: true, name: 'Accent Table', category: 'Living', width: 60, depth: 60, height: 52, color: '#9c6b3f', shape: 'table', icon: '🪵' },
  { type: 'modern_sofa', pro: true, name: 'Modern Sofa', category: 'Living', width: 200, depth: 92, height: 80, color: '#8a8f96', shape: 'sofa', icon: '🛋️' },
  { type: 'display_cabinet', pro: true, name: 'Display Cabinet', category: 'Living', width: 100, depth: 45, height: 120, color: '#7a5a3a', shape: 'box', icon: '🗄️' },
  { type: 'sideboard', pro: true, name: 'Sideboard', category: 'Living', width: 120, depth: 45, height: 88, color: '#b7b0a0', shape: 'box', icon: '🗄️' },
  { type: 'worn_bookshelf', pro: true, name: 'Rustic Bookshelf', category: 'Living', width: 90, depth: 30, height: 180, color: '#8a5a30', shape: 'bookshelf', icon: '📚' },
  { type: 'tea_table', pro: true, name: 'Tea Table', category: 'Living', width: 100, depth: 60, height: 38, color: '#6f4b2e', shape: 'table', icon: '🪵' },
  { type: 'wooden_dining_chair', pro: true, name: 'Wooden Chair', category: 'Dining', width: 45, depth: 50, height: 95, color: '#8a5a30', shape: 'chair', icon: '🪑' },
  { type: 'bar_chair', pro: true, name: 'Bar Chair', category: 'Kitchen', width: 40, depth: 40, height: 98, color: '#6e6e72', shape: 'stool', icon: '🪑' },
  { type: 'wooden_stool', pro: true, name: 'Wooden Stool', category: 'Kitchen', width: 35, depth: 35, height: 46, color: '#9c6b3f', shape: 'stool', icon: '🪑' },
  { type: 'metal_stool', pro: true, name: 'Metal Stool', category: 'Kitchen', width: 36, depth: 36, height: 66, color: '#6e6e72', shape: 'stool', icon: '🪑' },
  { type: 'chest_of_drawers', pro: true, name: 'Chest of Drawers', category: 'Bedroom', width: 90, depth: 45, height: 95, color: '#7a5a3a', shape: 'box', icon: '🗄️' },
  { type: 'day_bed', pro: true, name: 'Day Bed', category: 'Bedroom', width: 100, depth: 200, height: 60, color: '#b6a98f', shape: 'bed', icon: '🛏️' },
  { type: 'metal_desk', pro: true, name: 'Metal Desk', category: 'Office', width: 140, depth: 70, height: 75, color: '#6e6e72', shape: 'table', icon: '🪵' },
  { type: 'throw_pillows', pro: true, name: 'Throw Pillows', category: 'Decor', width: 55, depth: 45, height: 22, color: '#cbb89a', shape: 'box', icon: '🛋️' },
  { type: 'clay_planter', pro: true, name: 'Clay Planter', category: 'Decor', width: 40, depth: 40, height: 45, color: '#a5673f', shape: 'plant', icon: '🪴' },
  { type: 'picnic_table', pro: true, name: 'Picnic Table', category: 'Outdoor', width: 150, depth: 140, height: 75, color: '#9c7a4f', shape: 'table', icon: '🪑' },

  // Openings (placed on walls)
  { type: 'door', name: 'Door', category: 'Openings', width: 90, depth: 12, height: 205, color: '#a9744f', shape: 'door', icon: '🚪', opening: { kind: 'door', style: 'single', sill: 0 } },
  { type: 'double_door', pro: true, name: 'Double Door', category: 'Openings', width: 160, depth: 12, height: 205, color: '#a9744f', shape: 'door_double', icon: '🚪', opening: { kind: 'door', style: 'double', sill: 0 } },
  { type: 'sliding_door', pro: true, name: 'Sliding Door', category: 'Openings', width: 180, depth: 12, height: 210, color: '#9db4c4', shape: 'door_sliding', icon: '🚪', opening: { kind: 'door', style: 'sliding', sill: 0 } },
  { type: 'passage', name: 'Open Passage', category: 'Openings', width: 100, depth: 12, height: 205, color: '#e8e2d5', shape: 'door_passage', icon: '⬜', opening: { kind: 'door', style: 'passage', sill: 0 } },
  { type: 'archway', pro: true, name: 'Archway', category: 'Openings', width: 120, depth: 12, height: 215, color: '#e8e2d5', shape: 'door_arch', icon: '⛩️', opening: { kind: 'door', style: 'arch', sill: 0 } },
  { type: 'pocket_door', pro: true, name: 'Pocket Door', category: 'Openings', width: 90, depth: 12, height: 205, color: '#b9a58c', shape: 'door_pocket', icon: '🚪', opening: { kind: 'door', style: 'pocket', sill: 0 } },
  { type: 'bifold_door', pro: true, name: 'Bifold Door', category: 'Openings', width: 90, depth: 12, height: 205, color: '#a9744f', shape: 'door_bifold', icon: '🚪', opening: { kind: 'door', style: 'bifold', sill: 0 } },
  { type: 'window', name: 'Window', category: 'Openings', width: 120, depth: 12, height: 120, color: '#bfe3f2', shape: 'window', icon: '🪟', opening: { kind: 'window', style: 'standard', sill: 90 } },
  { type: 'french_window', pro: true, name: 'French Window', category: 'Openings', width: 180, depth: 12, height: 220, color: '#bfe3f2', shape: 'window_french', icon: '🪟', opening: { kind: 'window', style: 'french', sill: 0 } },
  { type: 'sliding_window', pro: true, name: 'Sliding Window', category: 'Openings', width: 150, depth: 12, height: 120, color: '#bfe3f2', shape: 'window_sliding', icon: '🪟', opening: { kind: 'window', style: 'sliding', sill: 90 } },
  { type: 'casement_window', pro: true, name: 'Casement Window', category: 'Openings', width: 60, depth: 12, height: 120, color: '#bfe3f2', shape: 'window_casement', icon: '🪟', opening: { kind: 'window', style: 'casement', sill: 90 } },
];

export const CATALOG_BY_TYPE: Record<string, CatalogEntry> = Object.fromEntries(
  FURNITURE_CATALOG.map((e) => [e.type, e]),
);

export type FloorKind = 'wood' | 'tile' | 'carpet' | 'concrete' | 'marble';

export interface FloorMaterial {
  id: string;
  name: string;
  color: string;
  kind: FloorKind;
}

export const FLOOR_MATERIALS: FloorMaterial[] = [
  { id: 'oak', name: 'Oak Wood', color: '#c9a36b', kind: 'wood' },
  { id: 'walnut', name: 'Walnut', color: '#6f4b2e', kind: 'wood' },
  { id: 'tile_white', name: 'White Tile', color: '#e8e8ea', kind: 'tile' },
  { id: 'tile_grey', name: 'Grey Tile', color: '#b9bcc0', kind: 'tile' },
  { id: 'concrete', name: 'Concrete', color: '#9a9ca0', kind: 'concrete' },
  { id: 'carpet_beige', name: 'Beige Carpet', color: '#d8cab0', kind: 'carpet' },
  { id: 'carpet_grey', name: 'Grey Carpet', color: '#9c9ea3', kind: 'carpet' },
  { id: 'marble', name: 'Marble', color: '#eceef0', kind: 'marble' },
];

export const FLOOR_BY_ID: Record<string, FloorMaterial> =
  Object.fromEntries(FLOOR_MATERIALS.map((m) => [m.id, m]));
