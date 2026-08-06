// Bundled sample homes ("templates"): three contrasting, fully furnished
// designs a first-run user can open and explore. Each build() returns a
// fresh snapshot — single-floor samples return a GeomSnapshot and the store's
// withFloors() wraps them; the two-storey house returns full floor data.
import type { MaybeFloored } from '../store/designStore';
import type { CustomTexture, FenceStyle, FurnitureItem, Opening, OpeningStyle, Roof, Wall, Room, FloorGeom } from '../types';
import { CATALOG_BY_TYPE, DEFAULT_WALL_THICKNESS, OUTDOOR_BY_ID } from './furnitureCatalog';
import { MATERIAL_BY_ID, materialUrl } from './materials';
import { exteriorFaces } from '../lib/exteriorFaces';
import { structuralWalls, FENCE_HEIGHTS } from '../lib/fence';
import { withFaceFinish } from '../lib/wallFaces';
import { uid } from '../lib/geometry';

let n = 0;
const id = (p: string) => `${p}${n++}`;

const wall = (a: [number, number], b: [number, number], color = '#eae4d8'): Wall => ({
  id: id('w'),
  start: { x: a[0], y: a[1] },
  end: { x: b[0], y: b[1] },
  thickness: DEFAULT_WALL_THICKNESS,
  height: 275,
  color,
});

const fur = (type: string, x: number, y: number, rotation = 0): FurnitureItem => {
  const e = CATALOG_BY_TYPE[type];
  return {
    id: id('f'),
    type,
    name: e.name,
    position: { x, y },
    rotation,
    width: e.width,
    depth: e.depth,
    height: e.height,
    color: e.color,
  };
};

const opening = (
  wallId: string,
  type: 'door' | 'window',
  offset: number,
  width: number,
  height: number,
  sill: number,
  style?: OpeningStyle,
): Opening => ({ id: id('o'), wallId, type, offset, width, height, sill, style });

const room = (name: string, pts: [number, number][], floorMaterial: string, color: string): Room => ({
  id: id('r'),
  name,
  points: pts.map(([x, y]) => ({ x, y })),
  floorMaterial,
  color,
  auto: false,
});

/** A patio/deck/lawn: same Room primitive, drawn on the ground with no slab
 *  beneath and no ceiling above (see Room.outdoor). */
const outdoor = (name: string, pts: [number, number][], material: string): Room => ({
  id: id('r'),
  name,
  points: pts.map(([x, y]) => ({ x, y })),
  floorMaterial: material,
  color: OUTDOOR_BY_ID[material]?.color ?? '#b9b3a7',
  auto: false,
  outdoor: true,
});

/** A boundary run rather than a building wall — no roof, no room, no cladding. */
const fence = (
  a: [number, number],
  b: [number, number],
  style: FenceStyle = 'picket',
): Wall => ({
  id: id('w'),
  start: { x: a[0], y: a[1] },
  end: { x: b[0], y: b[1] },
  thickness: 10,
  height: FENCE_HEIGHTS[style],
  color: '#b98d5f',
  kind: 'fence',
  fenceStyle: style,
});

const rect = (x0: number, y0: number, x1: number, y1: number): [number, number][] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];

/** Centre-of-opening offset for a wall from a→b, given cm along the wall. */
const at = (a: [number, number], b: [number, number], cm: number) =>
  cm / Math.hypot(b[0] - a[0], b[1] - a[1]);

/* ------------------------------------------------------------------ 1. Sunlit open plan */

function openPlan(): MaybeFloored {
  n = 0;
  const WIDTH = 1100;
  const HEIGHT = 850;

  const w1 = wall([0, 0], [WIDTH, 0]);
  const w2 = wall([WIDTH, 0], [WIDTH, HEIGHT]);
  const w3 = wall([WIDTH, HEIGHT], [0, HEIGHT]);
  const w4 = wall([0, HEIGHT], [0, 0]);
  const w5 = wall([750, 0], [750, HEIGHT]);
  const w6 = wall([750, 500], [WIDTH, 500]);
  const walls = [w1, w2, w3, w4, w5, w6];

  const offN = (cm: number) => at([0, 0], [WIDTH, 0], cm);
  const offE = (cm: number) => at([WIDTH, 0], [WIDTH, HEIGHT], cm);
  const offS = (cm: number) => at([WIDTH, HEIGHT], [0, HEIGHT], cm);
  const offW = (cm: number) => at([0, HEIGHT], [0, 0], cm);
  const offV = (cm: number) => at([750, 0], [750, HEIGHT], cm);

  const openings: Opening[] = [
    opening(w1.id, 'window', offN(220), 180, 130, 100),
    opening(w1.id, 'window', offN(560), 180, 130, 100),
    opening(w1.id, 'window', offN(970), 160, 130, 100),
    opening(w2.id, 'window', offE(200), 140, 130, 100),
    opening(w2.id, 'window', offE(650), 60, 80, 130, 'casement'),
    opening(w3.id, 'window', offS(220), 140, 130, 100),
    opening(w3.id, 'door', offS(500), 300, 220, 0, 'sliding'), // patio slider onto the deck
    opening(w3.id, 'door', offS(900), 100, 210, 0),
    opening(w4.id, 'window', offW(150), 140, 130, 100),
    opening(w4.id, 'window', offW(430), 140, 130, 100),
    opening(w4.id, 'window', offW(700), 140, 130, 100),
    opening(w5.id, 'door', offV(200), 90, 210, 0),
    opening(w5.id, 'door', offV(640), 80, 210, 0),
  ];

  const rooms = [
    outdoor('Deck', rect(350, HEIGHT, 900, HEIGHT + 420), 'out_deck'),
    room('Great Room', rect(0, 0, 750, HEIGHT), 'oak', '#f6f1e5'),
    room('Master Bedroom', rect(750, 0, WIDTH, 500), 'carpet_beige', '#efe6d7'),
    room('Bathroom', rect(750, 500, WIDTH, HEIGHT), 'marble', '#eaf0f0'),
  ];

  const furniture: FurnitureItem[] = [
    fur('fridge', 55, 45),
    fur('cabinets', 165, 30),
    fur('stove', 260, 45),
    fur('cabinets', 355, 30),
    fur('kitchen_sink', 465, 45),
    fur('cabinets', 605, 30),
    fur('island', 300, 220),
    fur('pendant', 245, 210),
    fur('pendant', 355, 210),
    fur('bar_stool', 225, 285),
    fur('bar_stool', 300, 285),
    fur('bar_stool', 375, 285),
    fur('dining_table', 550, 430),
    fur('wooden_dining_chair', 500, 370, 0),
    fur('wooden_dining_chair', 550, 370, 0),
    fur('wooden_dining_chair', 600, 370, 0),
    fur('wooden_dining_chair', 500, 490, 180),
    fur('wooden_dining_chair', 550, 490, 180),
    fur('wooden_dining_chair', 600, 490, 180),
    fur('pendant', 550, 430),
    fur('large_plant', 700, 380),
    fur('rug', 340, 700),
    fur('modern_sofa', 350, 785, 180),
    fur('throw_pillows', 350, 748, 180),
    fur('round_coffee_table', 340, 685),
    fur('tv_stand', 340, 560, 0),
    fur('accent_chair', 150, 720, 260),
    fur('tall_side_table', 65, 720),
    fur('floor_lamp', 90, 610),
    fur('display_cabinet', 25, 500, 90),
    fur('clay_planter', 675, 690),
    fur('large_plant', 660, 640),
    fur('wall_art', 742, 640, 90),
    fur('ceiling_light', 340, 700),
    fur('bed_double', 925, 155),
    fur('nightstand', 800, 60),
    fur('nightstand', 1050, 60),
    fur('wardrobe', 1065, 380, 90),
    fur('bench', 925, 295),
    fur('curtains', 990, 22, 0),
    fur('rug', 925, 275),
    fur('ceiling_light', 900, 250),
    fur('large_plant', 795, 450),
    fur('bathtub', 960, 550, 0),
    fur('vanity', 800, 535, 0),
    fur('toilet', 795, 805, 180),
    fur('shower', 1045, 800, 0),
    fur('ceiling_light', 925, 675),
    // Deck, straight out of the slider.
    fur('patio_table', 520, 1060, 0),
    fur('parasol', 720, 1050, 0),
    fur('patio_chair', 660, 1230, 200),
    fur('bbq', 840, 1180, 180),
    fur('planter_box', 380, 1210, 0),
    fur('tree', 1120, 1050, 0),
    fur('hedge', 500, 1310, 0),
    fur('hedge', 700, 1310, 0),
  ];

  walls.push(fence([250, 1290], [1000, 1290]));

  return { walls, rooms, furniture, openings, background: null, projectName: 'Sunlit open-plan home' };
}

/* ------------------------------------------------------------------ 2. Two-storey family house */

function familyHouse(): MaybeFloored {
  n = 0;
  const W = 1000;
  const H = 800;
  const STOREY = 282; // matches the store's storey rise

  // ---------- Ground floor ----------
  const g1 = wall([0, 0], [W, 0]);
  const g2 = wall([W, 0], [W, H]);
  const g3 = wall([W, H], [0, H]);
  const g4 = wall([0, H], [0, 0]);
  const g5 = wall([600, 0], [600, 500]); // living | kitchen
  const g6 = wall([0, 500], [W, 500]); // rooms | hall
  const g7 = wall([850, 500], [850, H]); // hall | WC

  const gN = (cm: number) => at([0, 0], [W, 0], cm);
  const gE = (cm: number) => at([W, 0], [W, H], cm);
  const gS = (cm: number) => at([W, H], [0, H], cm);
  const gW = (cm: number) => at([0, H], [0, 0], cm);
  const gHall = (cm: number) => at([0, 500], [W, 500], cm);

  const groundGeom: FloorGeom = {
    walls: [g1, g2, g3, g4, g5, g6, g7],
    openings: [
      opening(g1.id, 'window', gN(200), 200, 140, 95),
      opening(g1.id, 'window', gN(790), 200, 140, 95),
      opening(g2.id, 'window', gE(250), 150, 140, 95),
      opening(g3.id, 'door', gS(500), 110, 210, 0), // front door, centre south
      opening(g3.id, 'window', gS(160), 60, 80, 130, 'casement'), // WC
      opening(g4.id, 'door', gW(250), 260, 220, 0, 'sliding'), // slider onto the garden terrace
      opening(g5.id, 'door', at([600, 0], [600, 500], 250), 100, 210, 0, 'passage'),
      opening(g6.id, 'door', gHall(300), 100, 210, 0, 'passage'), // living → hall
      opening(g6.id, 'door', gHall(760), 90, 210, 0), // kitchen → hall
      opening(g7.id, 'door', at([850, 500], [850, H], 150), 80, 210, 0),
    ],
    rooms: [
      outdoor('Terrace', rect(-430, 380, 0, 780), 'out_paving'),
      outdoor('Lawn', rect(-880, 100, -430, 900), 'out_lawn'),
      room('Living Room', rect(0, 0, 600, 500), 'oak', '#f3ecdf'),
      room('Kitchen & Dining', rect(600, 0, W, 500), 'tile_white', '#eef0ea'),
      room('Hallway', rect(0, 500, 850, H), 'oak', '#f0eadc'),
      room('WC', rect(850, 500, W, H), 'tile_grey', '#e8ecee'),
    ],
    furniture: [
      // Living room — sofa faces the TV on the west wall.
      fur('rug', 280, 250),
      fur('modern_sofa', 430, 250, 90), // back to the kitchen wall, faces west
      fur('throw_pillows', 405, 250, 90),
      fur('tea_table', 300, 250),
      fur('tv_stand', 40, 250, 90), // on the west wall, faces east
      fur('lounge_chair', 300, 80, 25),
      fur('display_cabinet', 450, 25, 0),
      fur('floor_lamp', 545, 80),
      fur('large_plant', 60, 330),
      fur('ceiling_light', 300, 250),
      // Terrace + lawn, out through the slider on the west wall.
      fur('patio_table', -180, 500, 90),
      fur('patio_chair', -330, 640, 90),
      fur('bbq', -110, 720, 90),
      fur('planter_box', -390, 420, 0),
      fur('fire_pit', -640, 620, 0),
      fur('sun_lounger', -640, 300, 90),
      fur('tree', -740, 830, 0),
      fur('tree_small', -520, 160, 0),
      fur('hedge', -880, 500, 90),
      // Kitchen & dining
      fur('fridge', 650, 45),
      fur('cabinets', 760, 30),
      fur('stove', 855, 45),
      fur('kitchen_sink', 950, 45, 0), // backs onto the north wall, not turned along it
      fur('dining_table', 800, 330),
      fur('wooden_dining_chair', 745, 270, 0),
      fur('wooden_dining_chair', 855, 270, 0),
      fur('wooden_dining_chair', 745, 395, 180),
      fur('wooden_dining_chair', 855, 395, 180),
      fur('pendant', 800, 330),
      // Hall — stairs rise along the south wall.
      // Low end at the west, high end opening safely onto the upper landing.
      fur('stairs', 285, 660, 270),
      fur('sideboard', 420, 530, 0),
      fur('wall_art', 550, 512, 0),
      fur('ceiling_light', 450, 650),
      fur('large_plant', 790, 760),
      // WC
      fur('toilet', 890, 770, 180),
      fur('sink', 960, 540, 0),
    ],
    background: null,
  };

  // ---------- Upper floor ----------
  const u1 = wall([0, 0], [W, 0]);
  const u2 = wall([W, 0], [W, H]);
  const u3 = wall([W, H], [0, H]);
  const u4 = wall([0, H], [0, 0]);
  const u5 = wall([500, 0], [500, 500]); // master | kids
  const u6 = wall([0, 500], [W, 500]); // bedrooms | landing+bath
  const u7 = wall([550, 500], [550, H]); // landing | bathroom

  const uN = (cm: number) => at([0, 0], [W, 0], cm);
  const uE = (cm: number) => at([W, 0], [W, H], cm);
  const uS = (cm: number) => at([W, H], [0, H], cm);
  const uW = (cm: number) => at([0, H], [0, 0], cm);
  const uMid = (cm: number) => at([0, 500], [W, 500], cm);

  const upperGeom: FloorGeom = {
    walls: [u1, u2, u3, u4, u5, u6, u7],
    openings: [
      opening(u1.id, 'window', uN(250), 170, 130, 95),
      opening(u1.id, 'window', uN(750), 170, 130, 95),
      opening(u2.id, 'window', uE(250), 150, 130, 95),
      opening(u2.id, 'window', uE(650), 70, 80, 130, 'casement'), // bath
      opening(u3.id, 'window', uS(300), 150, 130, 95), // landing light
      opening(u4.id, 'window', uW(250), 150, 130, 95),
      opening(u5.id, 'door', at([500, 0], [500, 500], 250), 90, 210, 0),
      opening(u6.id, 'door', uMid(250), 90, 210, 0), // master → landing
      opening(u6.id, 'door', uMid(700), 90, 210, 0), // kids → landing
      opening(u7.id, 'door', at([550, 500], [550, H], 160), 80, 210, 0, 'sliding'),
    ],
    rooms: [
      room('Master Bedroom', rect(0, 0, 500, 500), 'carpet_beige', '#efe6d7'),
      room('Kids Room', rect(500, 0, W, 500), 'carpet_grey', '#e9ecf2'),
      room('Landing', rect(0, 500, 550, H), 'oak', '#f0eadc'),
      room('Bathroom', rect(550, 500, W, H), 'marble', '#eaf0f0'),
    ],
    furniture: [
      // Master
      fur('bed_double', 250, 180),
      fur('nightstand', 120, 60),
      fur('nightstand', 380, 60),
      fur('wardrobe', 80, 420, 180),
      fur('chest_of_drawers', 430, 380, 90), // drawers face the room, back to the wall
      fur('rug', 250, 320),
      fur('ceiling_light', 250, 250),
      // Kids room
      fur('day_bed', 620, 150),
      fur('nightstand', 540, 60),
      fur('metal_desk', 900, 300, 270),
      fur('office_chair', 830, 300, 90),
      fur('office_bookshelf', 960, 60, 90),
      fur('desk_lamp', 900, 285, 270),
      fur('rug', 720, 320),
      fur('ceiling_light', 750, 250),
      fur('large_plant', 950, 440),
      // Landing — open stairwell mirrors the ground stairs position.
      fur('ceiling_light', 300, 650),
      fur('sideboard', 400, 530, 0),
      // Bathroom
      fur('bathtub', 950, 560, 90),
      fur('vanity', 580, 535, 0),
      fur('toilet', 600, 770, 180),
      fur('shower', 950, 760, 0),
      fur('ceiling_light', 775, 650),
    ],
    background: null,
  };

  const groundId = uid();
  const upperId = uid();
  return {
    walls: groundGeom.walls,
    rooms: groundGeom.rooms,
    furniture: groundGeom.furniture,
    openings: groundGeom.openings,
    background: null,
    projectName: 'Maple family house',
    floors: [
      { id: groundId, name: 'Ground floor', elevation: 0 },
      { id: upperId, name: 'Upper floor', elevation: STOREY },
    ],
    floorGeom: { [groundId]: groundGeom, [upperId]: upperGeom },
    activeFloorId: groundId,
  };
}

/* ------------------------------------------------------------------ 3. City studio */

function cityStudio(): MaybeFloored {
  n = 0;
  const W = 650;
  const H = 520;

  const s1 = wall([0, 0], [W, 0]);
  const s2 = wall([W, 0], [W, H]);
  const s3 = wall([W, H], [0, H]);
  const s4 = wall([0, H], [0, 0]);
  const s5 = wall([440, 0], [440, 210]); // bath partition
  const s6 = wall([440, 210], [W, 210]);
  const walls = [s1, s2, s3, s4, s5, s6];

  const sN = (cm: number) => at([0, 0], [W, 0], cm);
  const sS = (cm: number) => at([W, H], [0, H], cm);
  const sW = (cm: number) => at([0, H], [0, 0], cm);

  const openings: Opening[] = [
    opening(s1.id, 'window', sN(220), 260, 150, 90), // big city window
    opening(s3.id, 'door', sS(560), 100, 210, 0), // entry
    opening(s3.id, 'door', sS(250), 240, 220, 0, 'sliding'), // slider onto the terrace
    opening(s4.id, 'window', sW(260), 160, 130, 95),
    opening(s6.id, 'door', at([440, 210], [W, 210], 100), 80, 210, 0, 'pocket'),
  ];

  const rooms = [
    outdoor('Terrace', rect(230, H, 560, H + 300), 'out_deck'),
    room('Studio', rect(0, 0, W, H), 'walnut', '#f1e7da'),
    room('Bathroom', rect(440, 0, W, 210), 'tile_white', '#eaf0f0'),
  ];

  const furniture: FurnitureItem[] = [
    // Sleeping corner (NW)
    fur('bed_double', 110, 140, 270), // headboard against the west wall
    fur('nightstand', 45, 260, 270), // back to the west wall, matching the bed
    fur('curtains', 22, 140, 90),
    // Kitchenette along the north wall
    fur('cabinets', 300, 30),
    fur('kitchen_sink', 395, 45, 0),
    fur('fridge', 250, 45),
    // Living zone (centre-south) — sofa faces the TV on the south wall.
    fur('rug', 280, 360),
    fur('modern_sofa', 280, 300, 0),
    fur('throw_pillows', 280, 325, 0),
    fur('accent_table', 280, 400),
    fur('tv_stand', 210, 495, 180),
    fur('floor_lamp', 420, 300),
    fur('large_plant', 170, 470),
    // Dining nook (east of sofa)
    fur('dining_table', 530, 330),
    fur('wooden_dining_chair', 480, 280, 45),
    fur('wooden_dining_chair', 585, 380, 225),
    fur('pendant', 530, 330),
    // Bathroom
    fur('shower', 615, 40, 0),
    fur('toilet', 480, 30, 0),
    fur('sink', 610, 175, 180),
    fur('ceiling_light', 545, 110),
    // Overhead
    fur('ceiling_light', 280, 300),
    // Terrace — small, but a real outdoor room for a studio.
    fur('patio_table', 300, 700, 90),
    fur('patio_chair', 480, 640, 200),
    fur('planter_box', 520, 780, 0),
    fur('tree_small', 640, 730, 0),
    fur('hedge', 300, 800, 0),
  ];

  walls.push(fence([210, 820], [580, 820], 'railing'));
  walls.push(fence([210, 520], [210, 820], 'railing'));
  walls.push(fence([580, 520], [580, 820], 'railing'));

  return { walls, rooms, furniture, openings, background: null, projectName: 'City studio' };
}

/* ------------------------------------------------------------------ 4. Terraced townhouse
   A recreation of a real narrow, slightly-tapered terraced-house ground floor:
   front living room, a WC + staircase in the middle, a dining room, a rear
   bedroom and a tapered tiled terrace at the back. Front (living) is at the
   bottom (large Y); the left wall angles in so the plan narrows toward the
   front, matching the reference drawing. */

function terraceHouse(): MaybeFloored {
  n = 0;
  const RX = 470; // straight right wall
  const BOT = 1560; // front (living) edge
  const lx = (y: number) => Math.round((55 * y) / BOT); // angled left wall x at height y

  const grey = '#d7d2c6';
  // Exterior shell (thicker, grey).
  const wLeft = wall([0, 0], [55, BOT], grey);
  const wBottom = wall([55, BOT], [RX, BOT], grey);
  const wRight = wall([RX, BOT], [RX, 0], grey);
  const wTop = wall([RX, 0], [0, 0], grey);
  wLeft.thickness = wBottom.thickness = wRight.thickness = wTop.thickness = 18;

  // Interior partitions.
  const pRear = wall([lx(440), 440], [RX, 440]); // rear rooms | dining
  const pDine = wall([lx(820), 820], [RX, 820]); // dining | hall
  const pLiving = wall([lx(1130), 1130], [RX, 1130]); // hall | living
  const rearDiv = wall([240, 0], [240, 440]); // terrace | rear bedroom
  const wcRight = wall([185, 820], [185, 1080]); // WC | hall
  const wcBottom = wall([lx(1080), 1080], [185, 1080]);

  const walls = [wLeft, wBottom, wRight, wTop, pRear, pDine, pLiving, rearDiv, wcRight, wcBottom];

  const openings: Opening[] = [
    // Front door + window on the street elevation (bottom).
    opening(wBottom.id, 'door', at([55, BOT], [RX, BOT], 340), 95, 210, 0),
    opening(wBottom.id, 'window', at([55, BOT], [RX, BOT], 140), 170, 140, 30),
    // Dining window on the (angled) left wall.
    opening(wLeft.id, 'window', at([0, 0], [55, BOT], 620), 170, 140, 90),
    // Rear bedroom window on the back wall.
    opening(wTop.id, 'window', at([RX, 0], [0, 0], 120), 160, 140, 90),
    // Terrace doors from the rear bedroom (french) + open flow through the plan.
    opening(rearDiv.id, 'door', at([240, 0], [240, 440], 230), 180, 210, 0, 'french'),
    opening(pRear.id, 'door', at([lx(440), 440], [RX, 440], 360), 100, 210, 0, 'passage'),
    opening(pDine.id, 'door', at([lx(820), 820], [RX, 820], 370), 110, 210, 0, 'passage'),
    opening(pLiving.id, 'door', at([lx(1130), 1130], [RX, 1130], 360), 120, 210, 0, 'passage'),
    // WC door off the hall.
    opening(wcRight.id, 'door', at([185, 820], [185, 1080], 180), 75, 210, 0),
  ];

  const rooms = [
    outdoor('Terrace', [[0, 0], [240, 0], [240, 440], [lx(440), 440]], 'out_paving'),
    room('Bedroom', rect(240, 0, RX, 440), 'carpet_beige', '#efe6d7'),
    room('Dining Room', [[lx(440), 440], [RX, 440], [RX, 820], [lx(820), 820]], 'oak', '#f3ecdf'),
    room('WC', [[lx(820), 820], [185, 820], [185, 1080], [lx(1080), 1080]], 'tile_white', '#eef0ea'),
    room('Hall', [[185, 820], [RX, 820], [RX, 1130], [lx(1130), 1130], [lx(1080), 1080], [185, 1080]], 'oak', '#f0eadc'),
    room('Living Room', [[lx(1130), 1130], [RX, 1130], [RX, BOT], [55, BOT]], 'oak', '#f6f1e5'),
  ];

  const furniture: FurnitureItem[] = [
    // Living room (front): sofa on the right wall facing the room, two armchairs,
    // coffee table, plant and a TV on the left wall.
    fur('rug', 300, 1400),
    fur('modern_sofa', 415, 1400, 90),
    fur('throw_pillows', 390, 1400, 90),
    fur('round_coffee_table', 300, 1400),
    fur('tv_stand', 65, 1400, 270),
    fur('accent_chair', 250, 1250, 150),
    fur('lounge_chair', 250, 1540, 30),
    fur('large_plant', 95, 1200),
    fur('ceiling_light', 290, 1360),
    // Hall + stairs.
    fur('sideboard', 430, 915, 0),
    fur('ceiling_light', 330, 990),
    // WC.
    fur('toilet', 100, 1030, 180),
    fur('planter_box', 60, 120, 0),
    fur('patio_chair', 60, 240, 180),
    fur('hedge', 60, 30, 0),
    fur('sink', 60, 860, 0),
    // Dining room: 6-seat table with a plant in the corner.
    fur('dining_table', 250, 630),
    fur('wooden_dining_chair', 175, 540, 270),
    fur('wooden_dining_chair', 175, 630, 270),
    fur('wooden_dining_chair', 175, 720, 270),
    fur('wooden_dining_chair', 325, 540, 90),
    fur('wooden_dining_chair', 325, 630, 90),
    fur('wooden_dining_chair', 325, 720, 90),
    fur('pendant', 250, 630),
    fur('large_plant', 95, 500),
    // Rear bedroom.
    fur('bed_double', 385, 175),
    fur('nightstand', 275, 60),
    fur('wardrobe', 455, 300, 90),
    fur('ceiling_light', 360, 200),
    // Terrace (tiled, out back).
    fur('picnic_table', 100, 250),
    fur('large_plant', 195, 80),
  ];

  return { walls, rooms, furniture, openings, background: null, projectName: 'Terraced townhouse' };
}

/* ------------------------------------------------------------------ 5. Suburban classic
   A big American two-storey with an ATTACHED GARAGE — the shape every other
   template here is missing. The existing four are all compact and European:
   an open plan, a modest family house, a studio and a narrow terrace. None of
   them has a garage, a utility wing, a formal dining room or a den, so anyone
   drawing a US/AU/NZ suburban home starts from nothing.

   The layout is the familiar sitcom-suburb arrangement: a front-to-back hall
   with the stairs in it, a formal room each side, the kitchen and its round
   table across the back, a utility wing (laundry → den) and a double garage
   filling the right third. Upstairs sits on the main block only; the garage
   stays single-storey, which is what gives the front elevation its step. */

function suburbanClassic(): MaybeFloored {
  n = 0;
  const W = 1560; // full width including the garage
  const H = 1150;
  const MID = 480; // front/back divider on both storeys
  const STOREY = 282; // matches the store's storey rise
  // Salmon walls and a burnt-orange roof: the palette does more of the
  // "I know that house" work than the plan does, and it costs nothing.
  const PAINT = '#e9a98e';

  // ---------- Ground floor ----------
  const g1 = wall([0, 0], [W, 0], PAINT); // rear
  const g2 = wall([W, 0], [W, H], PAINT); // east (garage side)
  const g3 = wall([W, H], [0, H], PAINT); // front
  const g4 = wall([0, H], [0, 0], PAINT); // west
  const g5 = wall([500, 0], [500, H], PAINT); // left rooms | centre
  const g6 = wall([1000, 0], [1000, H], PAINT); // centre | utility+garage
  const g7 = wall([0, MID], [1000, MID], PAINT); // back rooms | front rooms
  const g8 = wall([740, MID], [740, H], PAINT); // hall | dining
  const g9 = wall([1000, MID], [W, MID], PAINT); // utility | garage
  const g10 = wall([1280, 0], [1280, MID], PAINT); // laundry | den

  const gN = (cm: number) => at([0, 0], [W, 0], cm);
  const gE = (cm: number) => at([W, 0], [W, H], cm);
  const gS = (cm: number) => at([W, H], [0, H], cm);
  const gW = (cm: number) => at([0, H], [0, 0], cm);
  const gV5 = (cm: number) => at([500, 0], [500, H], cm);
  const gV6 = (cm: number) => at([1000, 0], [1000, H], cm);
  const gMid = (cm: number) => at([0, MID], [1000, MID], cm);
  const gV8 = (cm: number) => at([740, MID], [740, H], cm - MID);
  const gUtil = (cm: number) => at([1000, MID], [W, MID], cm - 1000);
  const gV10 = (cm: number) => at([1280, 0], [1280, MID], cm);

  const groundGeom: FloorGeom = {
    walls: [g1, g2, g3, g4, g5, g6, g7, g8, g9, g10],
    openings: [
      // Exterior
      opening(g1.id, 'window', gN(250), 170, 140, 90),
      opening(g1.id, 'window', gN(640), 150, 140, 90),
      opening(g1.id, 'window', gN(900), 150, 140, 90), // over the kitchen sink
      opening(g1.id, 'window', gN(1140), 90, 90, 140, 'casement'), // laundry
      opening(g1.id, 'window', gN(1420), 170, 140, 90), // den
      opening(g2.id, 'window', gE(240), 150, 140, 90),
      opening(g2.id, 'window', gE(700), 90, 90, 140, 'casement'), // garage
      opening(g3.id, 'door', gS(280), 420, 230, 0, 'double'), // garage door
      opening(g3.id, 'window', gS(690), 160, 140, 90), // dining
      opening(g3.id, 'door', gS(940), 110, 215, 0), // front door
      opening(g3.id, 'window', gS(1310), 220, 140, 90), // living room
      opening(g4.id, 'door', gW(400), 240, 215, 0, 'sliding'), // out to the deck
      opening(g4.id, 'window', gW(900), 150, 140, 90),
      // Interior
      opening(g5.id, 'door', gV5(400), 100, 210, 0, 'passage'), // sitting → kitchen
      opening(g5.id, 'door', gV5(560), 100, 210, 0, 'passage'), // living → hall
      opening(g6.id, 'door', gV6(200), 90, 210, 0), // kitchen → laundry
      opening(g7.id, 'door', gMid(120), 110, 210, 0, 'passage'), // sitting → living
      opening(g7.id, 'door', gMid(560), 110, 210, 0, 'passage'), // kitchen → hall
      opening(g7.id, 'door', gMid(870), 100, 210, 0, 'passage'), // kitchen → dining
      opening(g8.id, 'door', gV8(950), 100, 210, 0, 'passage'), // hall → dining
      opening(g9.id, 'door', gUtil(1100), 90, 210, 0), // garage → laundry
      opening(g10.id, 'door', gV10(400), 90, 210, 0), // laundry → den
    ],
    rooms: [
      outdoor('Deck', rect(-420, 500, 0, 1000), 'out_deck'),
      outdoor('Side lawn', rect(-900, -350, -420, 1300), 'out_lawn'),
      outdoor('Back lawn', rect(0, -350, W, 0), 'out_lawn'),
      outdoor('Front lawn', rect(0, H, 1000, 1560), 'out_lawn'),
      outdoor('Driveway', rect(1000, H, W, 1620), 'out_asphalt'),
      room('Sitting Room', rect(0, 0, 500, MID), 'oak', '#f3ecdf'),
      // The one surface everybody can name. A room texture override rather
      // than a floor-material id, because the checkerboard ships in the
      // material library and not in the (much shorter) floor list.
      {
        ...room('Kitchen', rect(500, 0, 1000, MID), 'tile_white', '#eef0ea'),
        texture: { src: materialUrl('checkered_pavement_tiles'), scaleCm: 40, roughness: 0.4, metalness: 0.03 },
      },
      room('Laundry', rect(1000, 0, 1280, MID), 'tile_grey', '#e8ecee'),
      room('Den', rect(1280, 0, W, MID), 'carpet_grey', '#e9ecf2'),
      room('Living Room', rect(0, MID, 500, H), 'oak', '#f0eadc'),
      room('Hallway', rect(500, MID, 740, H), 'oak', '#f0eadc'),
      room('Dining Room', rect(740, MID, 1000, H), 'walnut', '#efe6d7'),
      room('Garage', rect(1000, MID, W, H), 'concrete', '#d9dade'),
    ],
    furniture: [
      // --- Sitting room: the formal front room, no TV.
      fur('rug', 250, 230),
      fur('sofa', 250, 60),
      fur('coffee_table', 250, 250),
      fur('armchair', 90, 290, 270),
      fur('lounge_chair', 410, 290, 90),
      fur('side_table', 90, 180),
      fur('bookshelf', 400, 20),
      fur('large_plant', 450, 130),
      fur('floor_lamp', 40, 60),
      fur('wall_art', 8, 380, 270),
      fur('ceiling_light', 250, 240),
      // --- Kitchen: run along the back wall, round table in the middle.
      fur('fridge', 545, 45),
      fur('counter', 690, 35),
      fur('dishwasher', 825, 35),
      fur('kitchen_sink', 900, 35),
      fur('stove', 535, 200, 270),
      fur('cabinets', 690, 12),
      fur('round_dining_table', 740, 300),
      fur('dining_chair', 740, 225),
      fur('dining_chair', 740, 375, 180),
      fur('dining_chair', 665, 300, 270),
      fur('dining_chair', 815, 300, 90),
      fur('pendant', 740, 300),
      // --- Laundry
      fur('washer', 1040, 50, 270),
      fur('sink', 1040, 330, 270),
      fur('cabinets', 1150, 12),
      fur('ceiling_light', 1140, 240),
      // --- Den: the second living room, off the utility wing.
      fur('desk', 1420, 50),
      fur('office_chair', 1450, 150, 180),
      fur('day_bed', 1390, 230, 270),
      fur('bookshelf', 1510, 60, 90),
      fur('rug', 1420, 330),
      fur('ceiling_light', 1420, 240),
      // --- Living room: couch facing the TV across the rug.
      fur('sofa', 250, 1090, 180),
      fur('tv_stand', 250, 492),
      fur('rug', 250, 900),
      fur('coffee_table', 250, 960),
      fur('armchair', 80, 950, 270),
      fur('lounge_chair', 420, 950, 90),
      fur('floor_lamp', 60, 1080),
      fur('bookshelf', 20, 560, 270),
      fur('large_plant', 400, 700),
      fur('wall_art', 8, 750, 270),
      fur('ceiling_light', 250, 800),
      // --- Hall: stairs down the middle, so it stays deliberately bare.
      fur('stairs', 620, 800),
      fur('large_plant', 710, 1060),
      fur('wall_art', 620, 486),
      fur('mirror', 508, 620, 270),
      fur('ceiling_light', 620, 620),
      // --- Dining room: the formal one, six places.
      fur('dining_table', 870, 780, 90),
      fur('wooden_dining_chair', 870, 680),
      fur('wooden_dining_chair', 870, 880, 180),
      fur('wooden_dining_chair', 795, 730, 270),
      fur('wooden_dining_chair', 795, 830, 270),
      fur('wooden_dining_chair', 945, 730, 90),
      fur('wooden_dining_chair', 945, 830, 90),
      fur('sideboard', 770, 620, 270),
      fur('display_cabinet', 790, 1080, 270),
      fur('large_plant', 950, 1080),
      fur('pendant', 870, 780),
      // --- Garage: no car in the catalog, so it reads as one by what a
      //     garage actually accumulates — bench, shelving, bins.
      fur('bench', 1480, 700, 90),
      fur('worn_bookshelf', 1500, 900, 90),
      fur('filing_cabinet', 1500, 550, 90),
      fur('outdoor_bin', 1050, 1020),
      fur('outdoor_bin', 1110, 1020),
      fur('ceiling_light', 1280, 800),
      // --- Deck, out through the living-room slider.
      fur('patio_table', -230, 700),
      fur('patio_chair', -340, 640, 270),
      fur('patio_chair', -340, 760, 270),
      fur('patio_chair', -120, 640, 90),
      fur('bbq', -360, 920),
      // --- Gardens
      fur('tree', -680, 200),
      fur('tree_small', -620, 900),
      fur('hedge', -870, 700, 90),
      fur('garden_lamp', -470, 1150),
      fur('hedge', 300, -40),
      fur('tree_small', 900, -200),
      fur('tree', 1350, -180),
      fur('tree_small', 300, 1400),
      fur('hedge', 500, 1350),
      fur('garden_lamp', 1020, 1200),
      fur('planter_box', 1530, 1320),
    ],
    background: null,
  };

  // ---------- Upper floor ----------
  // The upper storey covers the WHOLE footprint, garage included. A stepped
  // profile (bedrooms over the main block, single-storey garage beside it)
  // would be truer to the reference, but the app carries exactly one roof and
  // it sits on the top storey — so anything below the top storey is left open
  // to the sky. A wing with no roof reads as a bug, not as a design, so the
  // garage gets a bonus room over it and the house gets a roof that closes.
  //
  // That forces the landing to be L-shaped: a stair hall plus a corridor
  // running east along y 480–620. Without it the landing would meet the garage
  // wing at a single point and the whole east side would be unreachable.
  const u1 = wall([0, 0], [W, 0], PAINT);
  const u2 = wall([W, 0], [W, H], PAINT);
  const u3 = wall([W, H], [0, H], PAINT);
  const u4 = wall([0, H], [0, 0], PAINT);
  const u5 = wall([0, MID], [W, MID], PAINT); // north rooms | corridor
  const u6 = wall([500, MID], [500, H], PAINT); // bedroom | landing
  const u7 = wall([740, 620], [740, H], PAINT); // stair hall | bathroom
  const u8 = wall([620, 0], [620, MID], PAINT); // master | kids
  const u9 = wall([740, 620], [W, 620], PAINT); // corridor | bathroom + bonus
  const u10 = wall([1000, 620], [1000, H], PAINT); // bathroom | bonus

  const uN = (cm: number) => at([0, 0], [W, 0], cm);
  const uE = (cm: number) => at([W, 0], [W, H], cm);
  const uS = (cm: number) => at([W, H], [0, H], cm);
  const uW = (cm: number) => at([0, H], [0, 0], cm);
  const uMid = (cm: number) => at([0, MID], [W, MID], cm);
  const uV6 = (cm: number) => at([500, MID], [500, H], cm - MID);
  const uV7 = (cm: number) => at([740, 620], [740, H], cm - 620);
  const uV8 = (cm: number) => at([620, 0], [620, MID], cm);
  const uCorr = (cm: number) => at([740, 620], [W, 620], cm - 740);

  const upperGeom: FloorGeom = {
    walls: [u1, u2, u3, u4, u5, u6, u7, u8, u9, u10],
    openings: [
      opening(u1.id, 'window', uN(250), 170, 130, 95),
      opening(u1.id, 'window', uN(820), 150, 130, 95),
      opening(u1.id, 'window', uN(1280), 170, 130, 95), // office
      opening(u2.id, 'window', uE(240), 150, 130, 95), // office
      opening(u2.id, 'window', uE(550), 90, 110, 115, 'casement'), // corridor
      opening(u2.id, 'window', uE(880), 150, 130, 95), // bonus room
      opening(u3.id, 'window', uS(280), 170, 130, 95), // bonus room
      opening(u3.id, 'window', uS(690), 90, 90, 135, 'casement'), // bathroom
      opening(u3.id, 'window', uS(1310), 170, 130, 95), // second bedroom
      opening(u4.id, 'window', uW(300), 150, 130, 95),
      opening(u4.id, 'window', uW(900), 150, 130, 95),
      opening(u5.id, 'door', uMid(560), 90, 210, 0), // master → corridor
      opening(u5.id, 'door', uMid(680), 90, 210, 0), // kids → corridor
      opening(u5.id, 'door', uMid(1280), 90, 210, 0), // office → corridor
      opening(u6.id, 'door', uV6(620), 90, 210, 0), // second bedroom → landing
      opening(u7.id, 'door', uV7(750), 80, 210, 0), // bathroom → landing
      opening(u8.id, 'door', uV8(420), 90, 210, 0), // master ↔ kids
      opening(u9.id, 'door', uCorr(1200), 90, 210, 0), // bonus room → corridor
    ],
    rooms: [
      room('Master Bedroom', rect(0, 0, 620, MID), 'carpet_beige', '#efe6d7'),
      room("Kids' Room", rect(620, 0, 1000, MID), 'carpet_grey', '#e9ecf2'),
      room('Home Office', rect(1000, 0, W, MID), 'oak', '#f0eadc'),
      room('Second Bedroom', rect(0, MID, 500, H), 'carpet_beige', '#efe6d7'),
      // Stair hall plus the east corridor, as one L.
      room('Landing', [
        [500, MID], [W, MID], [W, 620], [740, 620], [740, H], [500, H],
      ], 'oak', '#f0eadc'),
      room('Bathroom', rect(740, 620, 1000, H), 'marble', '#eaf0f0'),
      room('Bonus Room', rect(1000, 620, W, H), 'carpet_grey', '#e9ecf2'),
    ],
    furniture: [
      // --- Master
      fur('bed_double', 300, 140),
      fur('nightstand', 170, 50),
      fur('nightstand', 430, 50),
      fur('wardrobe', 150, 440, 180),
      fur('dresser', 560, 200, 90),
      fur('rug', 300, 330),
      fur('large_plant', 560, 340),
      fur('wall_art', 300, 8),
      fur('ceiling_light', 300, 240),
      // --- Kids' room
      fur('bed_single', 690, 130),
      fur('nightstand', 790, 55),
      fur('desk', 920, 320, 90),
      fur('desk_lamp', 920, 270),
      fur('office_chair', 820, 320, 270),
      fur('bookshelf', 950, 55, 90),
      fur('rug', 800, 380),
      fur('ceiling_light', 800, 240),
      // --- Home office, over the front half of the garage.
      fur('desk', 1280, 45),
      fur('office_chair', 1280, 140, 180),
      fur('desk_lamp', 1330, 40),
      fur('office_bookshelf', 1060, 240, 270),
      fur('filing_cabinet', 1060, 380, 270),
      fur('sofa', 1500, 240, 90),
      fur('rug', 1280, 300),
      fur('large_plant', 1500, 60),
      fur('ceiling_light', 1280, 240),
      // --- Second bedroom
      fur('bed_single', 90, 590),
      fur('nightstand', 185, 700),
      fur('desk', 250, 520),
      fur('office_chair', 250, 610, 180),
      fur('wardrobe', 350, 1110, 180),
      fur('bookshelf', 450, 760, 90),
      fur('rug', 280, 850),
      fur('large_plant', 460, 1040),
      fur('ceiling_light', 250, 800),
      // --- Landing: the stairwell opens into the hall, so that half stays
      //     clear; the corridor takes the storage.
      fur('sideboard', 900, 500),
      fur('large_plant', 700, 1080),
      fur('wall_art', 620, 486),
      fur('wall_art', 1200, 486),
      fur('mirror', 508, 1000, 270),
      fur('ceiling_light', 620, 800),
      fur('ceiling_light', 1100, 550),
      // --- Bathroom
      fur('bathtub', 890, 670),
      fur('vanity', 950, 830, 90),
      fur('sink', 790, 830, 270),
      fur('shower', 940, 1060),
      fur('toilet', 790, 1080, 270),
      fur('mirror', 745, 830, 270),
      fur('ceiling_light', 870, 880),
      // --- Bonus room over the garage: the rumpus room this house type
      //     always ends up with.
      fur('sofa', 1400, 1090, 180),
      fur('tv_stand', 1400, 632),
      fur('rug', 1400, 900),
      fur('coffee_table', 1400, 950),
      fur('armchair', 1200, 950, 270),
      fur('lounge_chair', 1510, 950, 90),
      fur('bookshelf', 1060, 700, 270),
      fur('large_plant', 1500, 700),
      fur('floor_lamp', 1060, 1080),
      fur('ceiling_light', 1400, 880),
    ],
    background: null,
  };

  const groundId = uid();
  const upperId = uid();
  return {
    walls: groundGeom.walls,
    rooms: groundGeom.rooms,
    furniture: groundGeom.furniture,
    openings: groundGeom.openings,
    background: null,
    projectName: 'Suburban classic',
    floors: [
      { id: groundId, name: 'Ground floor', elevation: 0 },
      { id: upperId, name: 'Upper floor', elevation: STOREY },
    ],
    floorGeom: { [groundId]: groundGeom, [upperId]: upperGeom },
    activeFloorId: groundId,
  };
}

/* ------------------------------------------------------------------ registry */

/**
 * Give a finished sample its outside.
 *
 * The samples were authored before roofs and exterior cladding existed, so from
 * the outside every one of them was an untextured white box with a flat white
 * ceiling for a lid — which is what a first-run user sees the moment they switch
 * to 3D. This dresses the shell without touching the interior: only the wall
 * faces that no room sits against are clad, so inside stays painted.
 */
function dressed(
  snap: MaybeFloored,
  opts: { roof: Roof; exterior: { color: string; material?: string } },
): MaybeFloored {
  const clad = (walls: Wall[], rooms: Room[]): Wall[] => {
    const entry = opts.exterior.material ? MATERIAL_BY_ID[opts.exterior.material] : undefined;
    const texture: CustomTexture | undefined = entry
      ? {
          src: materialUrl(entry.id),
          scaleCm: entry.scaleCm,
          roughness: entry.roughness,
          metalness: entry.metalness,
        }
      : undefined;
    const byId = new Map(walls.map((w) => [w.id, w]));
    for (const { wallId, face } of exteriorFaces(structuralWalls(walls), rooms)) {
      const w = byId.get(wallId);
      if (!w) continue;
      byId.set(wallId, {
        ...w,
        faceFinishes: withFaceFinish(w, face, { color: opts.exterior.color, texture }),
      });
    }
    return walls.map((w) => byId.get(w.id) ?? w);
  };

  // Single-storey samples return bare geometry; materialise a floor so the roof
  // has somewhere to live (the store's withFloors would otherwise invent one).
  if (!snap.floors?.length || !snap.floorGeom || !snap.activeFloorId) {
    const fid = uid();
    const walls = clad(snap.walls, snap.rooms);
    const geom: FloorGeom = {
      walls,
      rooms: snap.rooms,
      furniture: snap.furniture,
      openings: snap.openings,
      background: null,
    };
    return {
      ...snap,
      walls,
      floors: [{ id: fid, name: 'Ground floor', elevation: 0, roof: opts.roof }],
      floorGeom: { [fid]: geom },
      activeFloorId: fid,
    };
  }

  const floorGeom: Record<string, FloorGeom> = {};
  for (const fid in snap.floorGeom) {
    const g = snap.floorGeom[fid];
    floorGeom[fid] = { ...g, walls: clad(g.walls, g.rooms) };
  }
  // The roof belongs on the highest storey.
  let topId = snap.floors[0].id;
  for (const f of snap.floors) {
    if (f.elevation >= (snap.floors.find((x) => x.id === topId)?.elevation ?? 0)) topId = f.id;
  }
  const active = floorGeom[snap.activeFloorId];
  return {
    ...snap,
    walls: active ? active.walls : snap.walls,
    floors: snap.floors.map((f) => (f.id === topId ? { ...f, roof: opts.roof } : f)),
    floorGeom,
  };
}

/** Roof presets, so each sample reads as the kind of house it is. */
const ROOFS = {
  clayGable: { type: 'gable', pitch: 32, overhang: 45, thickness: 18, covering: 'tile', coveringScaleCm: 100, color: '#b45f3c' },
  slateGable: { type: 'gable', pitch: 38, overhang: 40, thickness: 18, covering: 'slate', coveringScaleCm: 90, color: '#4a4f55' },
  greyHip: { type: 'hip', pitch: 28, overhang: 50, thickness: 18, covering: 'tile', coveringScaleCm: 100, color: '#6f7275' },
  cityFlat: { type: 'flat', pitch: 5, overhang: 25, thickness: 22, covering: 'plain', coveringScaleCm: 100, color: '#8d9298' },
  // Deep eaves and asphalt shingle: the American suburban roof, and the thing
  // that stops the salmon walls reading as a Mediterranean villa.
  orangeGable: { type: 'gable', pitch: 34, overhang: 55, thickness: 18, covering: 'shingle', coveringScaleCm: 90, color: '#b4652f' },
} satisfies Record<string, Roof>;

export interface SampleDef {
  id: string;
  name: string;
  blurb: string;
  build: () => MaybeFloored;
  /** True when a photoreal preview render ships in public/previews/<id>.webp. */
  hasPreview?: true;
}

/** URL of a template's preview render (dollhouse 3D). */
export const samplePreviewUrl = (id: string) => `${import.meta.env.BASE_URL}previews/${id}.webp`;

export const SAMPLES: SampleDef[] = [
  {
    id: 'open-plan',
    name: 'Sunlit open-plan home',
    blurb: 'Kitchen, dining and living in one bright great room',
    build: () => dressed(openPlan(), {
      roof: ROOFS.clayGable,
      exterior: { color: '#9e8d77', material: 'beige_wall_001' },
    }),
    hasPreview: true,
  },
  {
    id: 'family-house',
    name: 'Maple family house',
    blurb: 'Two storeys — living below, three rooms above',
    build: () => dressed(familyHouse(), {
      roof: ROOFS.slateGable,
      exterior: { color: '#63493b', material: 'brick_wall_001' },
    }),
    hasPreview: true,
  },
  {
    id: 'city-studio',
    name: 'City studio',
    blurb: 'A clever compact studio with every zone in place',
    build: () => dressed(cityStudio(), {
      roof: ROOFS.cityFlat,
      exterior: { color: '#8b8573', material: 'grey_plaster' },
    }),
    hasPreview: true,
  },
  {
    id: 'terrace-house',
    name: 'Terraced townhouse',
    blurb: 'Narrow terrace — living, WC & stairs, dining, rear bedroom',
    build: () => dressed(terraceHouse(), {
      roof: ROOFS.greyHip,
      exterior: { color: '#b69068', material: 'brown_brick_02' },
    }),
    hasPreview: true,
  },
  {
    id: 'suburban-classic',
    name: 'Suburban classic',
    blurb: 'Two storeys, double garage and a big checkerboard kitchen',
    build: () => dressed(suburbanClassic(), {
      roof: ROOFS.orangeGable,
      exterior: { color: '#e8a07c', material: 'beige_wall_001' },
    }),
  },
];

export const SAMPLE_BY_ID: Record<string, SampleDef> = Object.fromEntries(SAMPLES.map((s) => [s.id, s]));

/** Back-compat: the original single sample. */
export const sampleProject = openPlan;
