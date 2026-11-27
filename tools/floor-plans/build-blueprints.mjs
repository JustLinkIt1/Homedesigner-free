// Writes the /floor-plans/ blueprints (tools/floor-plans/<slug>.json) from the
// room layouts below, which follow T10a §3 (shared/research/hd-floor-plan-pages-list).
// Rooms are rectangles in cm: [id, type, name, x, y, w, h], front of the house at y = 0.
// Doors are named room pairs; this places each one in the middle of the shared
// edge, puts the entrance (and garage door) on the front wall, and a window on
// every outer wall of a room that should have one.
//
//   node tools/floor-plans/build-blueprints.mjs
//   node tools/check-plan.mjs tools/floor-plans/<slug>.json
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

const ROOF = {
  metalGable: { type: 'gable', pitch: 25, overhang: 45, thickness: 18, covering: 'metal', coveringScaleCm: 150, color: '#4a4f55' },
  tileGable: { type: 'gable', pitch: 35, overhang: 40, thickness: 18, covering: 'tile', coveringScaleCm: 100, color: '#b45f3c' },
  shingleHip: { type: 'hip', pitch: 26, overhang: 55, thickness: 18, covering: 'shingle', coveringScaleCm: 80, color: '#5d5348' },
  flatPlain: { type: 'flat', pitch: 5, overhang: 25, thickness: 22, covering: 'plain', coveringScaleCm: 100, color: '#8d9298' },
  metalShed: { type: 'shed', pitch: 12, overhang: 35, thickness: 18, covering: 'metal', coveringScaleCm: 150, color: '#8d9298' },
};
const WALL = {
  steel: { color: '#b9bcc0', material: 'steel_brushed' },
  redBrick: { color: '#9c5a44', material: 'brick_wall_001' },
  buffBrick: { color: '#c9aa7a', material: 'brick_buff_stock' },
  timber: { color: '#7d5a38', material: 'brown_planks_09' },
  whiteRender: { color: '#f0eee9' },
  creamRender: { color: '#efe6d2' },
  greyPlaster: { color: '#b8b4ac', material: 'grey_plaster' },
};

const PLANS = [
  {
    slug: 'barndominium-3-bedroom-18x12m', title: 'Barndominium, 3 bedrooms with shop', w: 1800, d: 1200,
    roof: ROOF.metalGable, exterior: WALL.steel, entrance: 'liv', garage: 'gar',
    floors: [{
      rooms: [
        ['gar', 'garage', 'Garage / Shop', 0, 0, 600, 500], ['liv', 'open_living', 'Open Living', 600, 0, 800, 500], ['kit', 'kitchen', 'Kitchen', 1400, 0, 400, 500],
        ['sto', 'storage', 'Storage', 0, 500, 300, 150], ['hall', 'hallway', 'Hallway', 300, 500, 1200, 150], ['uti', 'utility', 'Utility', 1500, 500, 300, 150],
        ['bed1', 'bedroom', 'Primary Bedroom', 0, 650, 450, 550], ['bath', 'bathroom', 'Bathroom', 450, 650, 250, 275], ['ens', 'bathroom', 'En-suite', 450, 925, 250, 275],
        ['bed2', 'bedroom', 'Bedroom 2', 700, 650, 400, 550], ['off', 'office', 'Office', 1100, 650, 300, 550], ['bed3', 'bedroom', 'Bedroom 3', 1400, 650, 400, 550],
      ],
      doors: [['gar', 'hall'], ['liv', 'kit', 'open'], ['liv', 'hall', 'open'], ['kit', 'uti'], ['sto', 'hall'], ['bed1', 'hall'], ['bed1', 'ens'],
        ['bath', 'hall'], ['bed2', 'hall'], ['off', 'hall'], ['bed3', 'hall']],
    }],
  },
  {
    slug: 'small-house-plan-2-bedroom-9x8m', title: 'Small house, 2 bedrooms', w: 900, d: 800,
    roof: ROOF.tileGable, exterior: WALL.redBrick, entrance: 'liv',
    floors: [{
      rooms: [
        ['liv', 'open_living', 'Open Living', 0, 0, 550, 400], ['kit', 'kitchen', 'Kitchen', 550, 0, 350, 400],
        ['bed1', 'bedroom', 'Bedroom 1', 0, 400, 350, 400], ['hall', 'hallway', 'Hallway', 350, 400, 200, 150], ['bath', 'bathroom', 'Bathroom', 350, 550, 200, 250],
        ['bed2', 'bedroom', 'Bedroom 2', 550, 400, 350, 400],
      ],
      doors: [['liv', 'kit', 'open'], ['liv', 'hall', 'open'], ['hall', 'bed1'], ['hall', 'bed2'], ['hall', 'bath']],
    }],
  },
  {
    slug: 'ranch-house-plan-3-bedroom-20x10m', title: 'Ranch house, 3 bedrooms with garage', w: 2000, d: 1000,
    roof: ROOF.shingleHip, exterior: WALL.buffBrick, entrance: 'liv', garage: 'gar',
    floors: [{
      rooms: [
        ['gar', 'garage', 'Garage', 0, 0, 600, 500], ['uti', 'utility', 'Utility', 600, 0, 200, 500], ['kit', 'kitchen', 'Kitchen', 800, 0, 400, 500],
        ['liv', 'open_living', 'Open Living', 1200, 0, 800, 500], ['hall', 'hallway', 'Hallway', 0, 500, 2000, 120],
        ['bed1', 'bedroom', 'Primary Bedroom', 0, 620, 450, 380], ['ens', 'bathroom', 'En-suite', 450, 620, 250, 380], ['bed2', 'bedroom', 'Bedroom 2', 700, 620, 350, 380],
        ['bath', 'bathroom', 'Bathroom', 1050, 620, 250, 380], ['bed3', 'bedroom', 'Bedroom 3', 1300, 620, 350, 380], ['sto', 'storage', 'Storage', 1650, 620, 350, 380],
      ],
      doors: [['gar', 'uti'], ['uti', 'kit'], ['uti', 'hall'], ['kit', 'liv', 'open'], ['liv', 'hall', 'open'], ['kit', 'hall'],
        ['bed1', 'hall'], ['bed1', 'ens'], ['bed2', 'hall'], ['bath', 'hall'], ['bed3', 'hall'], ['sto', 'hall']],
    }],
  },
  {
    slug: 'modern-house-plan-3-bedroom-10x9m', title: 'Modern house, 3 bedrooms on two floors', w: 1000, d: 900,
    roof: ROOF.flatPlain, exterior: WALL.whiteRender, entrance: 'liv',
    floors: [{
      rooms: [
        ['liv', 'open_living', 'Open Living', 0, 0, 600, 550], ['kit', 'kitchen', 'Kitchen', 600, 0, 400, 550],
        ['stair', 'stairwell', 'Stairs', 0, 550, 250, 350], ['hall', 'hallway', 'Hallway', 250, 550, 350, 120],
        ['wc', 'toilet', 'WC', 250, 670, 150, 230], ['sto', 'storage', 'Storage', 400, 670, 200, 230], ['off', 'office', 'Office', 600, 550, 400, 350],
      ],
      doors: [['liv', 'kit', 'open'], ['liv', 'hall', 'open'], ['stair', 'hall', 'open'], ['wc', 'hall'], ['sto', 'hall'], ['off', 'hall']],
    }, {
      rooms: [
        ['bed1', 'bedroom', 'Primary Bedroom', 0, 0, 450, 550], ['wir', 'storage', 'Walk-in Closet', 450, 0, 200, 275], ['ens', 'bathroom', 'Bathroom', 450, 275, 200, 275],
        ['bed2', 'bedroom', 'Bedroom 2', 650, 0, 350, 550],
        ['stair', 'stairwell', 'Stairs', 0, 550, 250, 350], ['land', 'hallway', 'Landing', 250, 550, 750, 120],
        ['bath', 'bathroom', 'Bathroom 2', 250, 670, 200, 230], ['bed3', 'bedroom', 'Bedroom 3', 450, 670, 550, 230],
      ],
      doors: [['stair', 'land', 'open'], ['bed1', 'land'], ['bed1', 'wir'], ['ens', 'land'], ['bed2', 'land'], ['bath', 'land'], ['bed3', 'land']],
    }],
  },
  {
    slug: 'tiny-house-floor-plan-7x2-6m', title: 'Tiny house, 7.2 x 2.6 m', w: 720, d: 260,
    roof: ROOF.metalShed, exterior: WALL.timber, entrance: 'liv',
    // Kitchen keeps only its back window: with windows on all three outer
    // walls the furnisher found no wall for the units, and a front window
    // still blocks the fridge in the corner, so the run goes on the end wall.
    noWindow: ['kit:N', 'kit:W'],
    floors: [{
      rooms: [['kit', 'kitchen', 'Kitchen', 0, 0, 240, 260], ['liv', 'open_living', 'Living and Sleeping', 240, 0, 300, 260], ['bath', 'bathroom', 'Bathroom', 540, 0, 180, 260]],
      doors: [['kit', 'liv', 'open'], ['liv', 'bath']],
    }],
  },
  {
    slug: '2-bedroom-house-plan-with-garage-12x10m', title: '2 bedroom house with garage', w: 1200, d: 1000,
    roof: ROOF.tileGable, exterior: WALL.redBrick, entrance: 'liv', garage: 'gar',
    floors: [{
      rooms: [
        ['gar', 'garage', 'Garage', 0, 0, 350, 550], ['kit', 'kitchen', 'Kitchen', 350, 0, 350, 550], ['liv', 'open_living', 'Open Living', 700, 0, 500, 550],
        ['hall', 'hallway', 'Hallway', 0, 550, 850, 120], ['uti', 'utility', 'Utility', 850, 550, 350, 120],
        ['bed1', 'bedroom', 'Bedroom 1', 0, 670, 400, 330], ['bath', 'bathroom', 'Bathroom', 400, 670, 250, 330], ['bed2', 'bedroom', 'Bedroom 2', 650, 670, 350, 330],
        ['sto', 'storage', 'Storage', 1000, 670, 200, 330],
      ],
      doors: [['gar', 'hall'], ['kit', 'liv', 'open'], ['kit', 'hall'], ['liv', 'hall', 'open'], ['uti', 'hall'], ['uti', 'sto'],
        ['bed1', 'hall'], ['bath', 'hall'], ['bed2', 'hall']],
    }],
  },
  {
    slug: '4-bedroom-house-plan-11x9m', title: '4 bedroom house on two floors', w: 1100, d: 900,
    roof: ROOF.tileGable, exterior: WALL.redBrick, entrance: 'liv',
    floors: [{
      rooms: [
        ['liv', 'open_living', 'Open Living', 0, 0, 600, 500], ['kit', 'kitchen', 'Kitchen', 600, 0, 500, 500],
        ['stair', 'stairwell', 'Stairs', 0, 500, 250, 400], ['hall', 'hallway', 'Hallway', 250, 500, 850, 120],
        ['wc', 'toilet', 'WC', 250, 620, 150, 280], ['uti', 'utility', 'Utility', 400, 620, 150, 280],
        ['bed4', 'bedroom', 'Bedroom 4', 550, 620, 400, 280], ['sto', 'storage', 'Storage', 950, 620, 150, 280],
      ],
      doors: [['liv', 'kit', 'open'], ['liv', 'hall', 'open'], ['kit', 'hall'], ['stair', 'hall', 'open'], ['wc', 'hall'], ['uti', 'hall'], ['bed4', 'hall'], ['sto', 'hall']],
    }, {
      rooms: [
        ['bed1', 'bedroom', 'Primary Bedroom', 0, 0, 450, 500], ['wir', 'storage', 'Walk-in Closet', 450, 0, 250, 250], ['ens', 'bathroom', 'Bathroom', 450, 250, 250, 250],
        ['bed2', 'bedroom', 'Bedroom 2', 700, 0, 400, 500],
        ['stair', 'stairwell', 'Stairs', 0, 500, 250, 400], ['land', 'hallway', 'Landing', 250, 500, 850, 120],
        ['bath', 'bathroom', 'Bathroom 2', 250, 620, 250, 280], ['sto', 'storage', 'Storage', 500, 620, 200, 280], ['bed3', 'bedroom', 'Bedroom 3', 700, 620, 400, 280],
      ],
      doors: [['stair', 'land', 'open'], ['bed1', 'land'], ['bed1', 'wir'], ['ens', 'land'], ['bed2', 'land'], ['bath', 'land'], ['sto', 'land'], ['bed3', 'land']],
    }],
  },
  {
    slug: 'adu-floor-plan-800-sq-ft', title: 'ADU, 2 bedrooms, 800 sq ft', w: 1000, d: 750,
    roof: ROOF.metalShed, exterior: WALL.greyPlaster, entrance: 'liv',
    floors: [{
      rooms: [
        ['liv', 'open_living', 'Open Living', 0, 0, 500, 400], ['kit', 'kitchen', 'Kitchen', 500, 0, 300, 400], ['uti', 'utility', 'Utility', 800, 0, 200, 400],
        ['bed1', 'bedroom', 'Bedroom 1', 0, 400, 350, 350], ['bath', 'bathroom', 'Bathroom', 350, 400, 250, 350], ['bed2', 'bedroom', 'Bedroom 2', 600, 400, 400, 350],
      ],
      doors: [['liv', 'kit', 'open'], ['kit', 'uti'], ['liv', 'bed1'], ['liv', 'bath'], ['kit', 'bed2']],
    }],
  },
  {
    slug: '3-bedroom-house-plan-13x9m', title: '3 bedroom house, 13 x 9 m', w: 1300, d: 900,
    roof: ROOF.tileGable, exterior: WALL.redBrick, entrance: 'liv',
    floors: [{
      rooms: [
        ['liv', 'open_living', 'Open Living', 0, 0, 600, 450], ['din', 'dining', 'Dining', 600, 0, 300, 450], ['kit', 'kitchen', 'Kitchen', 900, 0, 400, 450],
        ['uti', 'utility', 'Utility', 0, 450, 300, 120], ['hall', 'hallway', 'Hallway', 300, 450, 1000, 120],
        ['bed1', 'bedroom', 'Bedroom 1', 0, 570, 400, 330], ['bath', 'bathroom', 'Bathroom', 400, 570, 250, 330],
        ['bed2', 'bedroom', 'Bedroom 2', 650, 570, 330, 330], ['bed3', 'bedroom', 'Bedroom 3', 980, 570, 320, 330],
      ],
      doors: [['liv', 'din', 'open'], ['din', 'kit', 'open'], ['liv', 'hall', 'open'], ['uti', 'hall'], ['bed1', 'hall'], ['bath', 'hall'], ['bed2', 'hall'], ['bed3', 'hall']],
    }],
  },
  {
    slug: '30x40-house-plan-3-bedroom', title: '30x40 house, 3 bedrooms', w: 910, d: 1220,
    roof: ROOF.flatPlain, exterior: WALL.creamRender, entrance: 'liv',
    floors: [{
      rooms: [
        ['liv', 'living', 'Living Room', 0, 0, 510, 420], ['din', 'dining', 'Dining', 510, 0, 400, 420],
        ['kit', 'kitchen', 'Kitchen', 0, 420, 300, 360], ['hall', 'hallway', 'Hallway', 300, 420, 120, 360], ['bed2', 'bedroom', 'Bedroom 2', 420, 420, 490, 360],
        ['corr', 'hallway', 'Corridor', 0, 780, 910, 120],
        ['bed1', 'bedroom', 'Bedroom 1', 0, 900, 360, 320], ['bath', 'bathroom', 'Bathroom', 360, 900, 180, 160], ['ens', 'bathroom', 'En-suite', 360, 1060, 180, 160],
        ['bed3', 'bedroom', 'Bedroom 3', 540, 900, 370, 320],
      ],
      doors: [['liv', 'din', 'open'], ['liv', 'hall', 'open'], ['liv', 'kit'], ['kit', 'hall'], ['hall', 'bed2'], ['hall', 'corr', 'open'],
        ['corr', 'bed1'], ['corr', 'bath'], ['bed1', 'ens'], ['corr', 'bed3']],
    }],
  },
];

const HABITABLE = new Set(['living', 'open_living', 'kitchen', 'dining', 'bedroom', 'office', 'playroom']);
const WET = new Set(['bathroom', 'toilet', 'utility']);

function sharedEdge(a, b) {
  for (const [p, q] of [[a, b], [b, a]]) {
    if (p.x + p.w === q.x) {
      const lo = Math.max(p.y, q.y), hi = Math.min(p.y + p.h, q.y + q.h);
      if (hi > lo) return { vertical: true, at: q.x, lo, hi };
    }
    if (p.y + p.h === q.y) {
      const lo = Math.max(p.x, q.x), hi = Math.min(p.x + p.w, q.x + q.w);
      if (hi > lo) return { vertical: false, at: q.y, lo, hi };
    }
  }
  return null;
}

function build(plan) {
  const floors = plan.floors.map((floor, level) => {
    // The furnisher puts a kitchen run in every open_living room, so a floor
    // with its own kitchen gets a plain living room (the name stays).
    const hasKitchen = floor.rooms.some(([, type]) => type === 'kitchen');
    const rooms = floor.rooms.map(([id, type, name, x, y, w, h]) => ({
      id, type: type === 'open_living' && hasKitchen ? 'living' : type, name, x, y, w, h,
    }));
    const byId = new Map(rooms.map((r) => [r.id, r]));
    const openings = [];
    for (const [a, b, kind = 'door'] of floor.doors) {
      const e = sharedEdge(byId.get(a), byId.get(b));
      if (!e) throw new Error(`${plan.slug}: ${a} and ${b} share no wall`);
      const len = e.hi - e.lo;
      const width = Math.min(kind === 'open' ? 120 : 80, len - 30);
      const mid = Math.round((e.lo + e.hi) / 2);
      openings.push(e.vertical ? { kind, x: e.at, y: mid, vertical: true, width, rooms: [a, b] }
        : { kind, x: mid, y: e.at, vertical: false, width, rooms: [a, b] });
    }
    // Front door and garage door on the front wall (y = 0) of the ground floor.
    const front = [];
    if (level === 0) {
      for (const [id, kind, width] of [[plan.entrance, 'entrance', 90], [plan.garage, 'garage', 250]]) {
        if (!id) continue;
        const r = byId.get(id);
        const x = kind === 'entrance' && r.w >= 400 ? Math.round(r.x + r.w * 0.3) : Math.round(r.x + r.w / 2);
        const o = { kind, x, y: 0, vertical: false, width: Math.min(width, r.w - 60), rooms: [id] };
        openings.push(o);
        front.push(o);
      }
    }
    // Windows on the outer walls.
    for (const r of rooms) {
      const small = WET.has(r.type);
      if (!HABITABLE.has(r.type) && !small) continue;
      const edges = [];
      const skip = (side) => (plan.noWindow ?? []).includes(`${r.id}:${side}`);
      if (r.y === 0 && !skip('N')) edges.push({ vertical: false, at: 0, lo: r.x, hi: r.x + r.w });
      if (r.y + r.h === plan.d && !skip('S')) edges.push({ vertical: false, at: plan.d, lo: r.x, hi: r.x + r.w });
      if (r.x === 0 && !skip('W')) edges.push({ vertical: true, at: 0, lo: r.y, hi: r.y + r.h });
      if (r.x + r.w === plan.w && !skip('E')) edges.push({ vertical: true, at: plan.w, lo: r.y, hi: r.y + r.h });
      for (const e of edges) {
        const width = small ? 60 : Math.min(140, e.hi - e.lo - 80);
        if (width < 50) continue;
        const kind = small ? 'small_window' : 'window';
        const door = front.find((o) => !e.vertical && e.at === 0 && o.x > e.lo && o.x < e.hi);
        let spots;
        if (door) {
          // Window in the larger stretch beside the door.
          const left = door.x - door.width / 2 - e.lo, right = e.hi - (door.x + door.width / 2);
          if (Math.max(left, right) < width + 50) continue;
          spots = [left > right ? Math.round(e.lo + left / 2) : Math.round(door.x + door.width / 2 + right / 2)];
        } else if (!small && e.hi - e.lo >= 650) {
          spots = [Math.round(e.lo + (e.hi - e.lo) / 4), Math.round(e.lo + (3 * (e.hi - e.lo)) / 4)];
        } else spots = [Math.round((e.lo + e.hi) / 2)];
        for (const at of spots) {
          openings.push(e.vertical ? { kind, x: e.at, y: at, vertical: true, width, rooms: [r.id] }
            : { kind, x: at, y: e.at, vertical: false, width, rooms: [r.id] });
        }
      }
    }
    return { rooms, openings };
  });
  const stair = floors[0].rooms.find((r) => r.type === 'stairwell');
  return {
    title: plan.title, notes: '', widthCm: plan.w, depthCm: plan.d, furnished: true, source: null,
    exterior: plan.exterior, roof: plan.roof,
    ...(stair ? { stairs: { x: stair.x + stair.w / 2, y: stair.y + stair.h / 2, rotation: 0 } } : {}),
    floors,
  };
}

for (const plan of PLANS) {
  writeFileSync(join(here, `${plan.slug}.json`), `${JSON.stringify(build(plan), null, 2)}\n`);
  console.log(`wrote tools/floor-plans/${plan.slug}.json`);
}
