// Built-in photoreal material library (CC0, Poly Haven), grouped into families
// like Planner 5D. These are real image textures in public/textures/ (fetched +
// downscaled by scripts/fetch-textures.mjs). Applied to floors via room.texture
// and to walls via wall.texture — the same path as user-uploaded custom images,
// so nothing new is needed to render them.

export type MaterialGroup =
  | 'Wood' | 'Tile' | 'Marble & Stone' | 'Concrete' | 'Brick' | 'Plaster';

export interface Material {
  id: string; // basename in public/textures (no extension)
  name: string;
  group: MaterialGroup;
  target: 'floor' | 'wall' | 'both';
  scaleCm: number; // real-world size the image tiles at
  roughness: number;
  metalness: number;
  color: string; // representative flat colour (2D plan fill + swatch fallback)
}

/** Resolve a material image to a URL under the app base (relative for Capacitor). */
export const materialUrl = (id: string) => `${import.meta.env.BASE_URL}textures/${id}.webp`;

export const MATERIALS: Material[] = [
  // Wood
  { id: 'wood_floor', name: 'Oak Boards', group: 'Wood', target: 'floor', scaleCm: 200, roughness: 0.6, metalness: 0, color: '#b98d5a' },
  { id: 'wood_floor_worn', name: 'Worn Oak', group: 'Wood', target: 'floor', scaleCm: 200, roughness: 0.65, metalness: 0, color: '#a67c4e' },
  { id: 'laminate_floor_02', name: 'Light Laminate', group: 'Wood', target: 'floor', scaleCm: 200, roughness: 0.55, metalness: 0, color: '#c8a877' },
  { id: 'laminate_floor_03', name: 'Walnut Laminate', group: 'Wood', target: 'floor', scaleCm: 200, roughness: 0.55, metalness: 0, color: '#9c7550' },
  { id: 'herringbone_parquet', name: 'Herringbone', group: 'Wood', target: 'floor', scaleCm: 130, roughness: 0.5, metalness: 0, color: '#b07f4e' },
  { id: 'diagonal_parquet', name: 'Diagonal Parquet', group: 'Wood', target: 'floor', scaleCm: 130, roughness: 0.5, metalness: 0, color: '#bb8a58' },
  { id: 'rectangular_parquet', name: 'Block Parquet', group: 'Wood', target: 'floor', scaleCm: 130, roughness: 0.5, metalness: 0, color: '#a97c4d' },
  { id: 'dark_wooden_planks', name: 'Dark Planks', group: 'Wood', target: 'both', scaleCm: 200, roughness: 0.6, metalness: 0, color: '#6f4b2e' },
  { id: 'brown_planks_09', name: 'Timber Panel', group: 'Wood', target: 'wall', scaleCm: 200, roughness: 0.7, metalness: 0, color: '#7d5a38' },
  // Tile
  { id: 'floor_tiles_02', name: 'Stone Tile', group: 'Tile', target: 'floor', scaleCm: 60, roughness: 0.35, metalness: 0.05, color: '#cfc9bf' },
  { id: 'floor_tiles_06', name: 'Cream Tile', group: 'Tile', target: 'floor', scaleCm: 60, roughness: 0.35, metalness: 0.05, color: '#d8d4cc' },
  { id: 'long_white_tiles', name: 'Subway White', group: 'Tile', target: 'both', scaleCm: 30, roughness: 0.3, metalness: 0.05, color: '#e8e6e0' },
  { id: 'interior_tiles', name: 'Matte Tile', group: 'Tile', target: 'floor', scaleCm: 60, roughness: 0.4, metalness: 0.04, color: '#c7c2b8' },
  { id: 'checkered_pavement_tiles', name: 'Checkerboard', group: 'Tile', target: 'floor', scaleCm: 40, roughness: 0.4, metalness: 0.03, color: '#cfccc6' },
  { id: 'brown_floor_tiles', name: 'Terracotta', group: 'Tile', target: 'floor', scaleCm: 60, roughness: 0.45, metalness: 0.02, color: '#9e7a55' },
  // Marble & Stone
  { id: 'marble_01', name: 'White Marble', group: 'Marble & Stone', target: 'both', scaleCm: 120, roughness: 0.22, metalness: 0.08, color: '#ece9e4' },
  { id: 'marble_mosaic_tiles', name: 'Marble Mosaic', group: 'Marble & Stone', target: 'floor', scaleCm: 60, roughness: 0.25, metalness: 0.08, color: '#d9d4cc' },
  { id: 'terrazzo_tiles', name: 'Terrazzo', group: 'Marble & Stone', target: 'floor', scaleCm: 90, roughness: 0.4, metalness: 0.03, color: '#d7d2c8' },
  { id: 'granite_tile', name: 'Granite', group: 'Marble & Stone', target: 'floor', scaleCm: 80, roughness: 0.3, metalness: 0.06, color: '#8f8a86' },
  { id: 'granite_tile_02', name: 'Pale Granite', group: 'Marble & Stone', target: 'floor', scaleCm: 80, roughness: 0.3, metalness: 0.06, color: '#a29d98' },
  // Concrete
  { id: 'concrete_floor_worn_02', name: 'Polished Concrete', group: 'Concrete', target: 'both', scaleCm: 200, roughness: 0.8, metalness: 0, color: '#9a9793' },
  { id: 'garage_floor', name: 'Sealed Concrete', group: 'Concrete', target: 'floor', scaleCm: 200, roughness: 0.7, metalness: 0.02, color: '#a8a6a2' },
  { id: 'granular_concrete', name: 'Raw Concrete', group: 'Concrete', target: 'both', scaleCm: 200, roughness: 0.9, metalness: 0, color: '#9d9a95' },
  // Brick
  { id: 'brick_wall_001', name: 'Red Brick', group: 'Brick', target: 'wall', scaleCm: 120, roughness: 0.9, metalness: 0, color: '#9c5a44' },
  { id: 'brick_wall_10', name: 'Rustic Brick', group: 'Brick', target: 'wall', scaleCm: 120, roughness: 0.9, metalness: 0, color: '#a86a4e' },
  { id: 'brown_brick_02', name: 'Brown Brick', group: 'Brick', target: 'wall', scaleCm: 120, roughness: 0.9, metalness: 0, color: '#7c5240' },
  { id: 'painted_brick', name: 'Painted Brick', group: 'Brick', target: 'wall', scaleCm: 120, roughness: 0.85, metalness: 0, color: '#d8d2c8' },
  // Plaster
  { id: 'beige_wall_001', name: 'Beige Plaster', group: 'Plaster', target: 'wall', scaleCm: 250, roughness: 0.92, metalness: 0, color: '#ded5c4' },
  { id: 'grey_plaster', name: 'Grey Plaster', group: 'Plaster', target: 'wall', scaleCm: 250, roughness: 0.92, metalness: 0, color: '#b8b4ac' },
  { id: 'plaster_grey_04', name: 'Concrete Plaster', group: 'Plaster', target: 'wall', scaleCm: 250, roughness: 0.92, metalness: 0, color: '#c3bfb7' },
];

export const MATERIAL_GROUPS: MaterialGroup[] = ['Wood', 'Tile', 'Marble & Stone', 'Concrete', 'Brick', 'Plaster'];

export const floorMaterials = () => MATERIALS.filter((m) => m.target !== 'wall');
export const wallMaterials = () => MATERIALS.filter((m) => m.target !== 'floor');

/** Single shared wall-paint palette (was duplicated in PropertiesPanel + Scene3D). */
export const WALL_PAINTS = [
  '#ece6db', '#ffffff', '#f5efe3', '#e9d8c3', '#dfe5dc', '#cfdce2',
  '#d7c4b7', '#c9cdd4', '#b9c7b3', '#e6c9c9', '#f0d9a8', '#4a5568',
];
