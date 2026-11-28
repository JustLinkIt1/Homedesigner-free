// Writes the /kitchen-layouts/ plans (SEO S2, 28 Nov 2026) from the sizes below.
//
//   node tools/kitchen-layouts/build-kitchen-plans.mjs
//
// tools/kitchen-layouts/<slug>-metric.json and <slug>-feet.json are what the
// "Open this kitchen size" buttons open: one empty kitchen of the example size,
// its walls, one door (`entrance`, so tools/check-plan.mjs passes) and one window, `furnished: false`. Shared plans keep rooms
// and openings only (tools/share-plan.mjs), so the pictured units are not in
// them, and the page says so ("You place the units yourself."). English pages
// have a metric and a feet room (separate rooms, never conversions); fr/de pages
// use the metric one. The share ids are fixed in ids.json; the SQL is made with
//   node tools/share-plan.mjs tools/kitchen-layouts/<slug>-metric.json --id <id> --days 3650
//
// tools/kitchen-layouts/render/<slug>.json is the metric room WITH the example
// arrangement, for the 3D and 2D pictures only. Free catalog items only
// (src/data/furnitureCatalog.ts): kitchen_base_cabinet, kitchen_sink, stove,
// fridge; the island page's island is base cabinets back to back.
// `furniture` items use the app's FurnitureItem fields: `type`, centre `x`/`y`
// in cm, `rotation` in degrees as the furnisher sets it (src/lib/aiPlan.ts
// ROTATION: back against N 0, E 90, S 180, W 270). `dollhouseCamera` (az, el,
// near) moves the 3D picture's camera in tools/make-plan-sample.mjs so the open
// door leaf of a small room does not stand in front of the units.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const FT = (ft) => Math.round(ft * 30.48);
// Catalog sizes (width along the wall, depth from it), furnitureCatalog.ts. Free items only.
const SIZE = {
  kitchen_base_cabinet: [55, 60], kitchen_sink: [90, 60], stove: [60, 60], fridge: [70, 70], counter: [200, 60],
};
// Inner face of the walls: DEFAULT_WALL_THICKNESS 12 / 2 + 2, as the furnisher (aiPlan.ts).
const INSET = 8;
const ROT = { N: 0, E: 90, S: 180, W: 270 };

/** One empty kitchen: walls, a door and a window, each given as [side, centre along that wall]. */
function room(title, w, d, { door, window }) {
  const opening = (kind, [side, at], width) => (side === 'N' || side === 'S'
    ? { kind, x: at, y: side === 'N' ? 0 : d, vertical: false, width, rooms: ['kit'] }
    : { kind, x: side === 'W' ? 0 : w, y: at, vertical: true, width, rooms: ['kit'] });
  return {
    title, notes: '', widthCm: w, depthCm: d, furnished: false, source: null,
    floors: [{
      rooms: [{ id: 'kit', type: 'kitchen', name: 'Kitchen', x: 0, y: 0, w, h: d }],
      openings: [opening('entrance', door, 90), opening('window', window, 120)],
    }],
  };
}

/** Units in a row with their backs against `side`, starting at `from` (cm along that wall). */
function run(w, d, side, from, types) {
  const items = [];
  let at = from;
  for (const type of types) {
    const [uw, ud] = SIZE[type];
    const mid = at + uw / 2;
    const off = INSET + ud / 2;
    const [x, y] = side === 'N' ? [mid, off] : side === 'S' ? [mid, d - off] : side === 'W' ? [off, mid] : [w - off, mid];
    items.push({ type, x, y, rotation: ROT[side] });
    at += uw;
  }
  return items;
}

const B = 'kitchen_base_cabinet';
const S0 = INSET + 60; // where a second run starts, past the first run's depth

export const LAYOUTS = [
  {
    slug: 'small-kitchen', title: 'Small kitchen', camera: { az: -12, el: 64, near: 1.6 },
    metric: [300, 240, 'klsmall300x240'], feet: [10, 8, 'klsmall10x8ft'],
    open: (w) => ({ door: ['S', w - 60], window: ['N', Math.round(w * 0.55)] }),
    furnish: (w, d) => [...run(w, d, 'N', INSET, [B, 'kitchen_sink', B, 'stove']), ...run(w, d, 'W', S0, [B, 'fridge'])],
  },
  {
    slug: 'l-shaped-kitchen', title: 'L-shaped kitchen', camera: { az: -12, el: 64, near: 1.6 },
    metric: [360, 300, 'kllshaped360x300'], feet: [12, 10, 'kllshaped12x10ft'],
    open: (w) => ({ door: ['S', w - 70], window: ['N', Math.round(w / 2)] }),
    furnish: (w, d) => [...run(w, d, 'N', INSET, [B, B, 'kitchen_sink', B, B]), ...run(w, d, 'W', S0, [B, 'stove', 'fridge'])],
  },
  {
    slug: 'galley-kitchen', title: 'Galley kitchen',
    metric: [240, 400, 'klgalley240x400'], feet: [8, 13, 'klgalley8x13ft'],
    open: (w) => ({ door: ['S', Math.round(w / 2)], window: ['N', Math.round(w / 2)] }),
    furnish: (w, d) => [...run(w, d, 'W', INSET, ['fridge', B, 'kitchen_sink', B, B]), ...run(w, d, 'E', INSET, [B, 'stove', B, B, B])],
  },
  {
    slug: 'u-shaped-kitchen', title: 'U-shaped kitchen', camera: { az: 8, el: 68, near: 1.6 },
    metric: [300, 330, 'klushaped300x330'], feet: [10, 11, 'klushaped10x11ft'],
    open: (w) => ({ door: ['S', Math.round(w / 2)], window: ['N', Math.round(w / 2)] }),
    furnish: (w, d) => [
      ...run(w, d, 'N', INSET + 10, [B, B, 'kitchen_sink', B]),
      ...run(w, d, 'W', S0, [B, 'stove', B]),
      ...run(w, d, 'E', S0, [B, B, 'fridge']),
    ],
  },
  {
    slug: 'kitchen-island', title: 'Kitchen with island',
    metric: [420, 400, 'klisland420x400'], feet: [14, 13, 'klisland14x13ft'],
    open: (w, d) => ({ door: ['S', w - 80], window: ['E', Math.round(d / 2)] }),
    furnish: (w, d) => {
      const wall = run(w, d, 'N', INSET, ['fridge', B, 'kitchen_sink', B, 'stove', B]);
      // The free island: three base cabinets facing the wall run and three back to
      // back with them facing the room, 1 m clear of the wall run.
      const x0 = w / 2 - 82.5;
      const back = S0 + 100 + 60; // the line where the two rows meet
      const island = [0, 1, 2].flatMap((i) => [
        { type: B, x: x0 + 27.5 + i * 55, y: back - 30, rotation: ROT.S },
        { type: B, x: x0 + 27.5 + i * 55, y: back + 30, rotation: ROT.N },
      ]);
      return [...wall, ...island];
    },
  },
];

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const ids = {};
  for (const l of LAYOUTS) {
    const [mw, md, mid] = l.metric;
    const [fw, fd, fid] = l.feet;
    const metric = room(`${l.title}, ${String(mw / 100)} × ${String(md / 100)} m`, mw, md, l.open(mw, md));
    const feet = room(`${l.title}, ${fw} × ${fd} ft`, FT(fw), FT(fd), l.open(FT(fw), FT(fd)));
    writeFileSync(join(here, `${l.slug}-metric.json`), `${JSON.stringify(metric, null, 2)}\n`);
    writeFileSync(join(here, `${l.slug}-feet.json`), `${JSON.stringify(feet, null, 2)}\n`);
    ids[`${l.slug}-metric`] = mid;
    ids[`${l.slug}-feet`] = fid;
    const furniture = l.furnish(mw, md);
    const boxes = [];
    for (const f of furniture) {
      if (!SIZE[f.type]) throw new Error(`${l.slug}: ${f.type} is not a free catalog item`);
      const [uw, ud] = SIZE[f.type];
      const [hx, hy] = f.rotation % 180 ? [ud / 2, uw / 2] : [uw / 2, ud / 2];
      const box = [f.x - hx, f.y - hy, f.x + hx, f.y + hy];
      if (box[0] < INSET - 0.01 || box[2] > mw - INSET + 0.01 || box[1] < INSET - 0.01 || box[3] > md - INSET + 0.01) {
        throw new Error(`${l.slug}: ${f.type} at ${f.x},${f.y} runs into a wall`);
      }
      for (const o of boxes) {
        if (box[0] < o[2] - 0.01 && box[2] > o[0] + 0.01 && box[1] < o[3] - 0.01 && box[3] > o[1] + 0.01) {
          throw new Error(`${l.slug}: ${f.type} at ${f.x},${f.y} overlaps another unit`);
        }
      }
      boxes.push(box);
    }
    writeFileSync(join(here, 'render', `${l.slug}.json`), `${JSON.stringify({ ...metric, furnished: true, furniture, ...(l.camera ? { dollhouseCamera: l.camera } : {}) }, null, 2)}\n`);
    console.log(`wrote tools/kitchen-layouts/${l.slug}-metric.json, ${l.slug}-feet.json, render/${l.slug}.json (${furniture.length} items)`);
  }
  writeFileSync(join(here, 'ids.json'), `${JSON.stringify(ids, null, 2)}\n`);
  console.log('wrote tools/kitchen-layouts/ids.json');
}
