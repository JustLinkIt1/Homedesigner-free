// Bundled sample homes ("templates"): three contrasting, fully furnished
// designs a first-run user can open and explore. Each build() returns a
// fresh snapshot — single-floor samples return a GeomSnapshot and the store's
// withFloors() wraps them; the two-storey house returns full floor data.
import type { MaybeFloored } from '../store/designStore';
import type { FurnitureItem, Opening, OpeningStyle, Wall, Room, FloorGeom } from '../types';
import { CATALOG_BY_TYPE, DEFAULT_WALL_THICKNESS } from './furnitureCatalog';
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
    opening(w3.id, 'window', offS(500), 220, 220, 0, 'french'),
    opening(w3.id, 'door', offS(900), 100, 210, 0),
    opening(w4.id, 'window', offW(150), 140, 130, 100),
    opening(w4.id, 'window', offW(430), 140, 130, 100),
    opening(w4.id, 'window', offW(700), 140, 130, 100),
    opening(w5.id, 'door', offV(200), 90, 210, 0),
    opening(w5.id, 'door', offV(640), 80, 210, 0),
  ];

  const rooms = [
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
    fur('modern_sofa', 340, 785, 180),
    fur('throw_pillows', 340, 748, 180),
    fur('round_coffee_table', 340, 685),
    fur('tv_stand', 340, 560, 0),
    fur('accent_chair', 150, 720, 260),
    fur('tall_side_table', 65, 720),
    fur('floor_lamp', 90, 610),
    fur('display_cabinet', 25, 500, 90),
    fur('clay_planter', 675, 690),
    fur('large_plant', 690, 780),
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
  ];

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
      opening(g4.id, 'window', gW(250), 180, 220, 0, 'french'), // garden doors
      opening(g5.id, 'door', at([600, 0], [600, 500], 250), 100, 210, 0, 'passage'),
      opening(g6.id, 'door', gHall(300), 100, 210, 0, 'passage'), // living → hall
      opening(g6.id, 'door', gHall(760), 90, 210, 0), // kitchen → hall
      opening(g7.id, 'door', at([850, 500], [850, H], 150), 80, 210, 0),
    ],
    rooms: [
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
      fur('large_plant', 60, 440),
      fur('ceiling_light', 300, 250),
      // Kitchen & dining
      fur('fridge', 650, 45),
      fur('cabinets', 760, 30),
      fur('stove', 855, 45),
      fur('kitchen_sink', 950, 45, 90),
      fur('dining_table', 800, 330),
      fur('wooden_dining_chair', 745, 270, 0),
      fur('wooden_dining_chair', 855, 270, 0),
      fur('wooden_dining_chair', 745, 395, 180),
      fur('wooden_dining_chair', 855, 395, 180),
      fur('pendant', 800, 330),
      // Hall — stairs rise along the south wall.
      fur('stairs', 130, 660, 90),
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
      fur('chest_of_drawers', 430, 330, 270),
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
      fur('vanity', 620, 535, 0),
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
    opening(s3.id, 'window', sS(250), 200, 220, 0, 'french'), // balcony doors
    opening(s4.id, 'window', sW(260), 160, 130, 95),
    opening(s6.id, 'door', at([440, 210], [W, 210], 100), 80, 210, 0, 'pocket'),
  ];

  const rooms = [
    room('Studio', rect(0, 0, W, H), 'walnut', '#f1e7da'),
    room('Bathroom', rect(440, 0, W, 210), 'tile_white', '#eaf0f0'),
  ];

  const furniture: FurnitureItem[] = [
    // Sleeping corner (NW)
    fur('bed_double', 110, 140, 270), // headboard against the west wall
    fur('nightstand', 45, 260, 90),
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
    fur('tv_stand', 280, 495, 180),
    fur('floor_lamp', 420, 300),
    fur('large_plant', 55, 470),
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
  ];

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
    room('Terrace', [[0, 0], [240, 0], [240, 440], [lx(440), 440]], 'tile_grey', '#e7e9ea'),
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
    fur('stairs', 330, 980, 0),
    fur('sideboard', 430, 870, 0),
    fur('ceiling_light', 330, 990),
    // WC.
    fur('toilet', 150, 1030, 180),
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
    fur('bed_double', 370, 175),
    fur('nightstand', 275, 60),
    fur('wardrobe', 455, 340, 90),
    fur('ceiling_light', 360, 200),
    // Terrace (tiled, out back).
    fur('picnic_table', 120, 250),
    fur('large_plant', 60, 60),
  ];

  return { walls, rooms, furniture, openings, background: null, projectName: 'Terraced townhouse' };
}

/* ------------------------------------------------------------------ registry */

export interface SampleDef {
  id: string;
  name: string;
  blurb: string;
  build: () => MaybeFloored;
}

export const SAMPLES: SampleDef[] = [
  {
    id: 'open-plan',
    name: 'Sunlit open-plan home',
    blurb: 'Kitchen, dining and living in one bright great room',
    build: openPlan,
  },
  {
    id: 'family-house',
    name: 'Maple family house',
    blurb: 'Two storeys — living below, three rooms above',
    build: familyHouse,
  },
  {
    id: 'city-studio',
    name: 'City studio',
    blurb: 'A clever compact studio with every zone in place',
    build: cityStudio,
  },
  {
    id: 'terrace-house',
    name: 'Terraced townhouse',
    blurb: 'Narrow terrace — living, WC & stairs, dining, rear bedroom',
    build: terraceHouse,
  },
];

export const SAMPLE_BY_ID: Record<string, SampleDef> = Object.fromEntries(SAMPLES.map((s) => [s.id, s]));

/** Back-compat: the original single sample. */
export const sampleProject = openPlan;
