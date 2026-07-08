import type { GeomSnapshot } from '../store/designStore';
import type { FurnitureItem, Opening, OpeningStyle, Wall } from '../types';
import { CATALOG_BY_TYPE } from './furnitureCatalog';

let n = 0;
const id = (p: string) => `${p}${n++}`;

const wall = (
  a: [number, number],
  b: [number, number],
  color = '#eae4d8',
): Wall => ({
  id: id('w'),
  start: { x: a[0], y: a[1] },
  end: { x: b[0], y: b[1] },
  thickness: 12,
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

/**
 * The sample home: a single-storey open-plan showcase (~11 × 8.5 m) that
 * highlights every category — a modern great room joining kitchen, dining
 * and living, a master bedroom, and a bright bathroom. Designed to look
 * good in every view (2D plan, 3D walkthrough, dollhouse) so first-run
 * users see what the app can produce before touching a wall.
 */
export function sampleProject(): GeomSnapshot {
  n = 0;

  const WIDTH = 1100;
  const HEIGHT = 850;

  // Perimeter (clockwise from NW so exterior faces read consistently).
  const w1 = wall([0, 0], [WIDTH, 0]);              // north
  const w2 = wall([WIDTH, 0], [WIDTH, HEIGHT]);     // east
  const w3 = wall([WIDTH, HEIGHT], [0, HEIGHT]);    // south
  const w4 = wall([0, HEIGHT], [0, 0]);             // west
  // Bedroom / bathroom wing splits off the east third of the plan.
  const w5 = wall([750, 0], [750, HEIGHT]);         // wing partition
  const w6 = wall([750, 500], [WIDTH, 500]);        // bedroom | bathroom

  const walls = [w1, w2, w3, w4, w5, w6];

  // Offsets are the *centre* of the opening measured as a 0..1 fraction of the
  // wall from start→end (see Opening.offset in types). The helpers below make
  // it easier to reason about openings by their real cm-along-wall positions.
  const at = (a: [number, number], b: [number, number], cm: number) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return cm / len;
  };
  const offN = (cm: number) => at([0, 0], [WIDTH, 0], cm);
  const offE = (cm: number) => at([WIDTH, 0], [WIDTH, HEIGHT], cm);
  const offS = (cm: number) => at([WIDTH, HEIGHT], [0, HEIGHT], cm);
  const offW = (cm: number) => at([0, HEIGHT], [0, 0], cm);
  const offV = (cm: number) => at([750, 0], [750, HEIGHT], cm);

  const openings: Opening[] = [
    // North: two big kitchen windows over the counter, one framing the bed.
    opening(w1.id, 'window', offN(220), 180, 130, 100),
    opening(w1.id, 'window', offN(560), 180, 130, 100),
    opening(w1.id, 'window', offN(970), 160, 130, 100),   // bedroom
    // East: bedroom + slim bathroom light.
    opening(w2.id, 'window', offE(200), 140, 130, 100),
    opening(w2.id, 'window', offE(650), 60,  80, 130, 'casement'),
    // South: bedroom garden view, patio doors, front door.
    opening(w3.id, 'window', offS(220), 140, 130, 100),
    opening(w3.id, 'window', offS(500), 220, 220, 0, 'french'), // patio doors
    opening(w3.id, 'door',   offS(900), 100, 210, 0),           // front door
    // West: three window bays that pour light across the great room.
    opening(w4.id, 'window', offW(150), 140, 130, 100),
    opening(w4.id, 'window', offW(430), 140, 130, 100),
    opening(w4.id, 'window', offW(700), 140, 130, 100),
    // Interior wing partition: bedroom + bathroom entries from the great room.
    opening(w5.id, 'door',   offV(200), 90, 210, 0),
    opening(w5.id, 'door',   offV(640), 80, 210, 0),
  ];

  const rooms = [
    {
      id: id('r'),
      name: 'Great Room',
      points: rect(0, 0, 750, HEIGHT),
      floorMaterial: 'oak',
      color: '#f6f1e5',
      auto: false,
    },
    {
      id: id('r'),
      name: 'Master Bedroom',
      points: rect(750, 0, WIDTH, 500),
      floorMaterial: 'carpet_beige',
      color: '#efe6d7',
      auto: false,
    },
    {
      id: id('r'),
      name: 'Bathroom',
      points: rect(750, 500, WIDTH, HEIGHT),
      floorMaterial: 'marble',
      color: '#eaf0f0',
      auto: false,
    },
  ];

  const furniture: FurnitureItem[] = [
    // ---------- Kitchen (north edge of the great room) ----------
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

    // ---------- Dining (centre of the great room) ----------
    fur('dining_table', 550, 430),
    fur('dining_chair', 500, 370, 180),
    fur('dining_chair', 550, 370, 180),
    fur('dining_chair', 600, 370, 180),
    fur('dining_chair', 500, 490, 0),
    fur('dining_chair', 550, 490, 0),
    fur('dining_chair', 600, 490, 0),
    fur('pendant', 550, 430),
    fur('large_plant', 700, 380),

    // ---------- Living (south of the great room) ----------
    fur('rug', 340, 700),
    fur('sofa', 340, 785, 0),
    fur('coffee_table', 340, 685),
    fur('tv_stand', 340, 560, 180),
    fur('armchair', 130, 720, 30),
    fur('side_table', 65, 720),
    fur('floor_lamp', 90, 610),
    fur('bookshelf', 25, 500, 90),
    fur('large_plant', 60, 90),
    fur('large_plant', 690, 780),
    fur('wall_art', 735, 640, 90),
    fur('ceiling_light', 340, 700),

    // ---------- Master bedroom ----------
    fur('bed_double', 925, 155),
    fur('nightstand', 800, 60),
    fur('nightstand', 1050, 60),
    fur('wardrobe', 1065, 380, 90),
    fur('bench', 925, 295),
    fur('curtains', 990, 22, 0),
    fur('rug', 925, 275),
    fur('ceiling_light', 900, 250),
    fur('large_plant', 795, 450),

    // ---------- Bathroom ----------
    fur('bathtub', 960, 550, 0),
    fur('vanity', 800, 700, 90),
    fur('toilet', 800, 800, 0),
    fur('shower', 1045, 800, 0),
    fur('ceiling_light', 925, 675),
  ];

  return {
    walls,
    rooms,
    furniture,
    openings,
    background: null,
    projectName: 'Sunlit open-plan home',
  };
}

function rect(x0: number, y0: number, x1: number, y1: number) {
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
}
