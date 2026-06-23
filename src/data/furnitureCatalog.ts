// Furniture catalog. Each entry defines default dimensions (cm) and how the
// item is rendered in 3D. Keeping this data-driven makes it trivial to grow.

export type Shape3D =
  | 'box' // simple block (table top, cabinet)
  | 'sofa'
  | 'bed'
  | 'chair'
  | 'table'
  | 'lamp'
  | 'plant'
  | 'rug'
  | 'tv'
  | 'fridge'
  | 'toilet'
  | 'bathtub'
  | 'door'
  | 'window';

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
}

export const FURNITURE_CATALOG: CatalogEntry[] = [
  // Living room
  { type: 'sofa', name: 'Sofa', category: 'Living', width: 200, depth: 90, height: 80, color: '#6b7a8f', shape: 'sofa', icon: '🛋️' },
  { type: 'armchair', name: 'Armchair', category: 'Living', width: 80, depth: 80, height: 80, color: '#8a9bb0', shape: 'chair', icon: '🪑' },
  { type: 'coffee_table', name: 'Coffee Table', category: 'Living', width: 110, depth: 60, height: 40, color: '#9c6b3f', shape: 'table', icon: '🪵' },
  { type: 'tv_stand', name: 'TV', category: 'Living', width: 130, depth: 12, height: 75, color: '#1c1c22', shape: 'tv', icon: '📺' },
  { type: 'rug', name: 'Rug', category: 'Living', width: 200, depth: 140, height: 1, color: '#c98f6a', shape: 'rug', icon: '🟫' },
  { type: 'plant', name: 'Plant', category: 'Living', width: 40, depth: 40, height: 120, color: '#3f7d4f', shape: 'plant', icon: '🪴' },
  { type: 'floor_lamp', name: 'Floor Lamp', category: 'Living', width: 35, depth: 35, height: 160, color: '#d9c27a', shape: 'lamp', icon: '🛋️' },

  // Bedroom
  { type: 'bed_double', name: 'Double Bed', category: 'Bedroom', width: 160, depth: 210, height: 50, color: '#b6a98f', shape: 'bed', icon: '🛏️' },
  { type: 'bed_single', name: 'Single Bed', category: 'Bedroom', width: 100, depth: 200, height: 50, color: '#b6a98f', shape: 'bed', icon: '🛏️' },
  { type: 'nightstand', name: 'Nightstand', category: 'Bedroom', width: 45, depth: 40, height: 50, color: '#9c6b3f', shape: 'box', icon: '🗄️' },
  { type: 'wardrobe', name: 'Wardrobe', category: 'Bedroom', width: 150, depth: 60, height: 210, color: '#7a5a3a', shape: 'box', icon: '🚪' },
  { type: 'dresser', name: 'Dresser', category: 'Bedroom', width: 120, depth: 50, height: 80, color: '#9c6b3f', shape: 'box', icon: '🗄️' },

  // Dining / Kitchen
  { type: 'dining_table', name: 'Dining Table', category: 'Dining', width: 160, depth: 90, height: 75, color: '#8a5a30', shape: 'table', icon: '🍽️' },
  { type: 'dining_chair', name: 'Dining Chair', category: 'Dining', width: 45, depth: 50, height: 90, color: '#6e5236', shape: 'chair', icon: '🪑' },
  { type: 'fridge', name: 'Refrigerator', category: 'Kitchen', width: 70, depth: 70, height: 180, color: '#d6d9dd', shape: 'fridge', icon: '🧊' },
  { type: 'counter', name: 'Counter', category: 'Kitchen', width: 200, depth: 60, height: 90, color: '#cfd2d6', shape: 'box', icon: '🍳' },
  { type: 'island', name: 'Kitchen Island', category: 'Kitchen', width: 180, depth: 90, height: 90, color: '#bfc3c8', shape: 'box', icon: '🍳' },

  // Bathroom
  { type: 'toilet', name: 'Toilet', category: 'Bathroom', width: 40, depth: 65, height: 75, color: '#f2f4f6', shape: 'toilet', icon: '🚽' },
  { type: 'bathtub', name: 'Bathtub', category: 'Bathroom', width: 170, depth: 75, height: 55, color: '#eef1f4', shape: 'bathtub', icon: '🛁' },
  { type: 'sink', name: 'Sink', category: 'Bathroom', width: 60, depth: 45, height: 85, color: '#f2f4f6', shape: 'box', icon: '🚰' },

  // Office
  { type: 'desk', name: 'Desk', category: 'Office', width: 140, depth: 70, height: 75, color: '#7a5a3a', shape: 'table', icon: '🖥️' },
  { type: 'office_chair', name: 'Office Chair', category: 'Office', width: 60, depth: 60, height: 110, color: '#2c2c33', shape: 'chair', icon: '🪑' },
  { type: 'bookshelf', name: 'Bookshelf', category: 'Office', width: 90, depth: 30, height: 200, color: '#8a5a30', shape: 'box', icon: '📚' },

  // Openings (placed on walls)
  { type: 'door', name: 'Door', category: 'Openings', width: 90, depth: 12, height: 205, color: '#a9744f', shape: 'door', icon: '🚪' },
  { type: 'window', name: 'Window', category: 'Openings', width: 120, depth: 12, height: 120, color: '#bfe3f2', shape: 'window', icon: '🪟' },
];

export const CATALOG_BY_TYPE: Record<string, CatalogEntry> = Object.fromEntries(
  FURNITURE_CATALOG.map((e) => [e.type, e]),
);

export const FLOOR_MATERIALS: { id: string; name: string; color: string }[] = [
  { id: 'oak', name: 'Oak Wood', color: '#c9a36b' },
  { id: 'walnut', name: 'Walnut', color: '#6f4b2e' },
  { id: 'tile_white', name: 'White Tile', color: '#e8e8ea' },
  { id: 'tile_grey', name: 'Grey Tile', color: '#b9bcc0' },
  { id: 'concrete', name: 'Concrete', color: '#9a9ca0' },
  { id: 'carpet_beige', name: 'Beige Carpet', color: '#d8cab0' },
  { id: 'carpet_grey', name: 'Grey Carpet', color: '#9c9ea3' },
  { id: 'marble', name: 'Marble', color: '#eceef0' },
];

export const FLOOR_BY_ID: Record<string, { id: string; name: string; color: string }> =
  Object.fromEntries(FLOOR_MATERIALS.map((m) => [m.id, m]));
