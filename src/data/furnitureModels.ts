// Single source of truth mapping a catalog `type` to the glTF file that
// represents it (basename in public/models, no extension). Consumed by BOTH
// the 3D viewer (GltfFurniture) and the 2D top-down sprite renderer
// (scripts/render-sprites.mjs via sprite-render.html), so the two views never
// disagree. Most entries are identity; a few point a type at a nicer-looking
// model than its same-named file.
export const MODEL_FILE: Record<string, string> = {
  // Living
  sofa: 'sofa',
  armchair: 'armchair',
  coffee_table: 'coffee_table',
  side_table: 'side_table',
  console: 'console',
  lounge_chair: 'lounge_chair',
  ottoman: 'ottoman',
  bookshelf: 'bookshelf',
  plant: 'plant',
  large_plant: 'large_plant',
  // Bedroom
  bed_double: 'bed_double',
  nightstand: 'nightstand',
  wardrobe: 'wardrobe',
  dresser: 'dresser',
  mirror: 'mirror',
  // Dining — swapped to cleaner models (the same-named files carry a picnic
  // tablecloth / an oversized leather chair that read poorly from above).
  dining_table: 'tea_table',
  dining_chair: 'wooden_dining_chair',
  round_dining_table: 'round_dining_table',
  // Kitchen
  fridge: 'fridge',
  stove: 'stove',
  kitchen_sink: 'kitchen_sink',
  cabinets: 'cabinets',
  kitchen_base_cabinet: 'kitchen_base_cabinet',
  kitchen_drawer_cabinet: 'kitchen_drawer_cabinet',
  kitchen_corner_cabinet: 'kitchen_corner_cabinet',
  wall_cabinet: 'wall_cabinet',
  bar_stool: 'bar_stool',
  // Office
  desk: 'desk',
  office_chair: 'office_chair',
  office_bookshelf: 'office_bookshelf',
  desk_lamp: 'desk_lamp',
  filing_cabinet: 'filing_cabinet',
  // CC0 extras also reachable through the cloud/remote catalog.
  bench: 'bench',
  accent_chair: 'accent_chair',
  rocking_chair: 'rocking_chair',
  round_coffee_table: 'round_coffee_table',
  tall_side_table: 'tall_side_table',
  accent_table: 'accent_table',
  modern_sofa: 'modern_sofa',
  display_cabinet: 'display_cabinet',
  sideboard: 'sideboard',
  worn_bookshelf: 'worn_bookshelf',
  tea_table: 'tea_table',
  wooden_dining_chair: 'wooden_dining_chair',
  bar_chair: 'bar_chair',
  wooden_stool: 'wooden_stool',
  metal_stool: 'metal_stool',
  chest_of_drawers: 'chest_of_drawers',
  day_bed: 'day_bed',
  metal_desk: 'metal_desk',
  throw_pillows: 'throw_pillows',
  clay_planter: 'clay_planter',
  picnic_table: 'picnic_table',
  // Outdoor (Phase C4). patio_table/patio_chair previously had NO model and
  // rendered as the generic indoor table/chair primitives tinted grey-green;
  // they now point at real outdoor pieces.
  patio_table: 'patio_set',
  patio_chair: 'garden_chair',
  fire_pit: 'fire_pit',
  planter_box: 'planter_box',
  planter_box_long: 'planter_box_long',
  tree_stump: 'tree_stump',
  garden_gnome: 'garden_gnome',
  garden_lamp: 'garden_lamp',
  outdoor_bin: 'outdoor_bin',
  watering_can: 'watering_can',
};

export type ModelFit = 'contain' | 'width' | 'depth' | 'height' | 'stretch';

/** Optional yaw correction (radians) for BUNDLED models whose "front" isn't +Z.
 *  Only read for types present in MODEL_FILE above — a type served by the cloud
 *  catalogue takes its yaw from the manifest, so corrections for those belong
 *  in MODEL_CORRECTIONS. */
export const MODEL_YAW: Record<string, number> = {};

/** Per-type 3D scaling policy for the bundled models. The Kenney kitchen
 *  cabinets are authored as ~45 cm cubes, so uniform fitting leaves them
 *  stubby and half-height; 'stretch' fills each cabinet's real footprint and
 *  counter/upper height instead (boxy cabinetry survives non-uniform scale). */
export const MODEL_FIT: Record<string, ModelFit> = {
  kitchen_base_cabinet: 'stretch',
  kitchen_drawer_cabinet: 'stretch',
  kitchen_corner_cabinet: 'stretch',
  wall_cabinet: 'stretch',
  cabinets: 'stretch',
  // Same ~45 cm-cube Kenney models — stretch so the stove and sink line up with
  // the 90 cm cabinets instead of sitting half-height beside them.
  stove: 'stretch',
  kitchen_sink: 'stretch',
  // Foliage and lamps: the catalogue box is the POT or the BASE, but the mesh
  // spans the whole leaf spread / lamp arm, so the footprint fit shrinks the
  // object to fit its own overhang inside the pot — this plant draws 36cm
  // against a 120cm entry. Height is what the eye judges and an overhanging
  // leaf is correct, so scale by height. `node tests/models.mjs` measures it.
  plant: 'height',
  large_plant: 'height',
  clay_planter: 'height',
  tree_stump: 'height',
  desk_lamp: 'height',
};

/** Corrections that WIN over a cloud catalogue definition.
 *
 *  Published model metadata lives in the R2 manifest, so a mis-sized model
 *  normally needs a Model Studio republish to fix. This map lets an app release
 *  fix one from the client instead, which matters because the app is the thing
 *  users actually update. Once the manifest carries the right values an entry
 *  here is redundant but harmless.
 *
 *  MODEL_YAW/MODEL_FIT above cannot do this job: they are only consulted for
 *  types that have a bundled GLB. */
export const MODEL_CORRECTIONS: Record<string, { yaw?: number; fit?: ModelFit }> = {
  // Measured 0.751 x 0.936 x 0.190 — four times wider than deep, because a
  // trailing power cable lies across the floor. 'contain' scales by that
  // footprint and draws a 160cm lamp at 44cm. The cable is a millimetre thick,
  // so scale by height and let it lie flat at the right size.
  floor_lamp: { fit: 'height' },
  // Measured 1.607 x 1.260 x 3.900: its length runs along Z against a
  // catalogue box that expects it on X, so it draws 24cm against a 55cm entry.
  // A quarter turn swaps the axes and it draws 54.9cm.
  bathtub: { yaw: Math.PI / 2 },
};

/** Flat rectangular tops whose 2D sprite should STRETCH to fill the whole
 *  footprint rather than aspect-contain. Their top surface is essentially a
 *  featureless plane, so filling reads as a proper table/desk instead of a
 *  smaller shape floating inside the footprint (e.g. the square tea-table model
 *  standing in for a rectangular dining table). */
export const SPRITE_FILL: ReadonlySet<string> = new Set([
  'dining_table', 'desk', 'metal_desk',
]);
