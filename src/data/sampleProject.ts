import type { DesignSnapshot } from '../store/designStore';
import type { FurnitureItem, Opening, Wall } from '../types';
import { CATALOG_BY_TYPE } from './furnitureCatalog';

let n = 0;
const id = (p: string) => `${p}${n++}`;

const wall = (a: [number, number], b: [number, number]): Wall => ({
  id: id('w'),
  start: { x: a[0], y: a[1] },
  end: { x: b[0], y: b[1] },
  thickness: 12,
  height: 270,
  color: '#e7e3da',
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
): Opening => ({ id: id('o'), wallId, type, offset, width, height, sill });

/** A furnished two-bedroom apartment shown on first run and via "Load sample". */
export function sampleProject(): DesignSnapshot {
  n = 0;
  const w1 = wall([0, 0], [700, 0]); // top
  const w2 = wall([700, 0], [700, 500]); // right
  const w3 = wall([700, 500], [0, 500]); // bottom
  const w4 = wall([0, 500], [0, 0]); // left
  const w5 = wall([400, 0], [400, 500]); // interior vertical
  const w6 = wall([400, 300], [700, 300]); // interior horizontal
  const walls = [w1, w2, w3, w4, w5, w6];

  const openings: Opening[] = [
    opening(w5.id, 'door', 150, 90, 205, 0), // living <-> bedroom
    opening(w5.id, 'door', 430, 90, 205, 0), // living <-> kitchen
    opening(w6.id, 'door', 150, 85, 205, 0), // bedroom <-> kitchen
    opening(w3.id, 'door', 350, 100, 210, 0), // front door (living)
    opening(w1.id, 'window', 180, 150, 130, 90), // living window
    opening(w1.id, 'window', 560, 140, 130, 90), // bedroom window
    opening(w2.id, 'window', 150, 140, 130, 90), // bedroom window
    opening(w2.id, 'window', 400, 140, 110, 95), // kitchen window
  ];

  const rooms = [
    { id: id('r'), name: 'Living Room', points: rect(0, 0, 400, 500), floorMaterial: 'oak', color: '#f3ede2', auto: false },
    { id: id('r'), name: 'Bedroom', points: rect(400, 0, 700, 300), floorMaterial: 'carpet_grey', color: '#f3ede2', auto: false },
    { id: id('r'), name: 'Kitchen', points: rect(400, 300, 700, 500), floorMaterial: 'tile_white', color: '#f3ede2', auto: false },
  ];

  const furniture: FurnitureItem[] = [
    // Living room
    fur('rug', 165, 360),
    fur('sofa', 165, 445),
    fur('coffee_table', 165, 335),
    fur('tv_stand', 165, 60, 180),
    fur('armchair', 320, 415, -35),
    fur('plant', 345, 70),
    fur('dining_table', 290, 200),
    fur('dining_chair', 250, 200, 90),
    fur('dining_chair', 330, 200, -90),
    // Bedroom
    fur('bed_double', 560, 150),
    fur('nightstand', 470, 55),
    fur('nightstand', 650, 55),
    fur('wardrobe', 665, 210, 90),
    // Kitchen
    fur('island', 555, 365),
    fur('counter', 560, 472),
    fur('fridge', 435, 340),
  ];

  return { walls, rooms, furniture, openings, background: null, projectName: 'Sample apartment' };
}

function rect(x0: number, y0: number, x1: number, y1: number) {
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
}
