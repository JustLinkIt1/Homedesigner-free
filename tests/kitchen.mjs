// Modular kitchen: the unit table, family swaps, worktop finishes and the
// parametric layout every unit is drawn from. Pure logic, no browser.
//
//   node tests/kitchen.mjs
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = process.cwd();
const dir = mkdtempSync(join(tmpdir(), 'hd-kitchen-'));
const sourceRoot = root.replaceAll('\\', '/');
const entry = join(root, '.kitchen-entry.tmp.ts');
writeFileSync(entry, `
export * from '${sourceRoot}/src/lib/kitchenUnits.ts';
export * from '${sourceRoot}/src/lib/kitchenRun.ts';
export { CATALOG_BY_TYPE, FURNITURE_CATALOG } from '${sourceRoot}/src/data/furnitureCatalog.ts';
export { MATERIALS, MATERIAL_BY_ID, MATERIAL_GROUPS, worktopMaterials, floorMaterials, wallMaterials } from '${sourceRoot}/src/data/materials.ts';
export { MODEL_FILE } from '${sourceRoot}/src/data/furnitureModels.ts';
export { SYMBOLS } from '${sourceRoot}/src/lib/symbols.ts';
`);
const bundle = join(dir, 'app.mjs');
try {
  await build({
    entryPoints: [entry], bundle: true, format: 'esm', platform: 'node',
    define: { 'import.meta.env.BASE_URL': '"/"' }, outfile: bundle, logLevel: 'silent',
  });
} finally {
  rmSync(entry, { force: true });
}
const app = await import(pathToFileURL(bundle).href);
rmSync(dir, { recursive: true, force: true });

let passed = 0;
let failed = 0;
const check = (name, ok, detail = '') => {
  if (ok) passed++;
  else { failed++; console.error(`  FAIL  ${name}${detail ? ` -- ${detail}` : ''}`); }
};
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

const {
  KITCHEN_UNITS, KITCHEN_UNIT_BY_TYPE, CATALOG_BY_TYPE, FURNITURE_CATALOG, MATERIALS, MATERIAL_BY_ID,
  MATERIAL_GROUPS, MODEL_FILE, SYMBOLS,
} = app;

// ---- the unit table ---------------------------------------------------------
check('every unit type is unique', new Set(KITCHEN_UNITS.map((u) => u.type)).size === KITCHEN_UNITS.length);
{
  const bad = [];
  for (const u of KITCHEN_UNITS) {
    const e = CATALOG_BY_TYPE[u.type];
    if (!e) { bad.push(`${u.type}: no catalog entry`); continue; }
    if (e.category !== 'Kitchen') bad.push(`${u.type}: category ${e.category}`);
    if (u.family === 'base') {
      if (e.height !== 90) bad.push(`${u.type}: base unit is ${e.height} high`);
      if (u.swap && e.depth !== 60) bad.push(`${u.type}: base unit is ${e.depth} deep`);
      if (e.mountY != null) bad.push(`${u.type}: base unit is wall-mounted`);
      if (!u.worktop) bad.push(`${u.type}: base unit without a worktop`);
    } else if (u.family === 'tall') {
      if (e.height < 200 || e.height > 230) bad.push(`${u.type}: tall unit is ${e.height} high`);
      if (e.depth !== 60) bad.push(`${u.type}: tall unit is ${e.depth} deep`);
      if (e.mountY != null || u.worktop) bad.push(`${u.type}: tall unit is mounted or has a worktop`);
    } else {
      if (!(e.mountY > 90)) bad.push(`${u.type}: wall unit has no mounting height above the worktop`);
      if (e.depth > 50 || u.worktop) bad.push(`${u.type}: wall unit is ${e.depth} deep or has a worktop`);
    }
    if (MODEL_FILE[u.type]) bad.push(`${u.type}: still mapped to a GLB model`);
    if (!SYMBOLS[e.shape]) bad.push(`${u.type}: no plan symbol for shape ${e.shape}`);
  }
  check('every unit has a catalog entry that fits its family', bad.length === 0, bad.join(' | '));
}
check('appliances are the standard 60 cm',
  ['stove', 'kitchen_range_gas', 'kitchen_hob_induction', 'kitchen_hob_gas', 'kitchen_oven', 'dishwasher',
    'kitchen_fridge_tall', 'kitchen_oven_tower', 'kitchen_wall_microwave', 'kitchen_hood']
    .every((t) => CATALOG_BY_TYPE[t]?.width === 60));
check('the legacy type ids are still units',
  ['kitchen_base_cabinet', 'kitchen_drawer_cabinet', 'kitchen_corner_cabinet', 'kitchen_sink', 'stove',
    'dishwasher', 'wall_cabinet', 'counter', 'island'].every((t) => app.isKitchenUnit(t)));
check('free-standing pieces are not units', !app.isKitchenUnit('fridge') && !app.isKitchenUnit('cabinets') && !app.isKitchenUnit('sofa'));
{
  const free = KITCHEN_UNITS.filter((u) => !CATALOG_BY_TYPE[u.type]?.pro).map((u) => u.type).sort();
  check('what was free stays free, and only the open shelving joins it',
    JSON.stringify(free) === JSON.stringify(['counter', 'kitchen_base_cabinet', 'kitchen_open_niche', 'kitchen_open_shelf', 'kitchen_sink', 'stove']),
    free.join(','));
  check('the specialised units are Pro',
    ['kitchen_hob_gas', 'kitchen_hob_induction', 'kitchen_oven', 'kitchen_range_gas', 'kitchen_oven_tower',
      'kitchen_fridge_tall', 'kitchen_larder', 'kitchen_wall_microwave', 'kitchen_hood']
      .every((t) => CATALOG_BY_TYPE[t]?.pro === true));
}
check('every Kitchen catalog entry with a kitchen_ id is a unit',
  FURNITURE_CATALOG.filter((e) => e.type.startsWith('kitchen_')).every((e) => app.isKitchenUnit(e.type)));

// ---- swaps ------------------------------------------------------------------
{
  const bad = [];
  for (const u of KITCHEN_UNITS) {
    const targets = app.swapTargets(u.type);
    if (!u.swap) { if (targets.length) bad.push(`${u.type}: not swappable but offers targets`); continue; }
    if (!targets.some((t) => t.type === u.type)) bad.push(`${u.type}: missing from its own chip row`);
    for (const t of targets) if (t.family !== u.family || !t.swap) bad.push(`${u.type} -> ${t.type}`);
    const all = KITCHEN_UNITS.filter((t) => t.swap && t.family === u.family);
    if (targets.length !== all.length) bad.push(`${u.type}: ${targets.length} of ${all.length} family units offered`);
  }
  check('swap targets are exactly the swappable units of the same family', bad.length === 0, bad.join(' | '));
}
check('a non-unit has nothing to swap to', app.swapTargets('sofa').length === 0);

const item = (type, patch = {}) => {
  const e = CATALOG_BY_TYPE[type];
  return {
    id: `t-${type}`, type, name: e.name, position: { x: 200, y: 36 }, rotation: 0,
    width: e.width, depth: e.depth, height: e.height, color: e.color, ...patch,
  };
};
{
  const cab = item('kitchen_base_cabinet', { color: '#22304f', worktop: 'granite_black', handles: 'none', rotation: 90, extra: { keep: true } });
  const sink = app.swapUnit(cab, 'kitchen_sink');
  check('a swap keeps the slot, facing, colour, worktop, handles and unknown fields',
    sink && sink.type === 'kitchen_sink' && sink.name === 'Kitchen Sink' && sink.id === cab.id
    && sink.width === 55 && sink.depth === 60 && sink.rotation === 90 && sink.position.x === 200 && sink.position.y === 36
    && sink.color === '#22304f' && sink.worktop === 'granite_black' && sink.handles === 'none' && sink.extra?.keep === true,
    JSON.stringify(sink));
  check('a swap does not mutate the item', cab.type === 'kitchen_base_cabinet');
  check('swapping to the same type is a no-op', app.swapUnit(cab, 'kitchen_base_cabinet') === cab);
  check('a swap across families is refused',
    app.swapUnit(cab, 'kitchen_larder') === null && app.swapUnit(cab, 'wall_cabinet') === null
    && app.swapUnit(item('kitchen_larder'), 'stove') === null && app.swapUnit(item('wall_cabinet'), 'dishwasher') === null);
  check('corner, counter and island do not swap',
    app.swapUnit(cab, 'kitchen_corner_cabinet') === null && app.swapUnit(item('kitchen_corner_cabinet'), 'kitchen_base_cabinet') === null
    && app.swapUnit(item('counter'), 'kitchen_base_cabinet') === null && app.swapUnit(cab, 'island') === null);
  check('a swap to an unknown or non-kitchen type is refused',
    app.swapUnit(cab, 'nope') === null && app.swapUnit(cab, 'sofa') === null && app.swapUnit(item('sofa'), 'kitchen_sink') === null);

  // Wall cabinet (35 deep) -> hood (50 deep): the back must stay on the wall.
  for (const rotation of [0, 90, 180, 270, 37]) {
    const wall = item('wall_cabinet', { rotation, position: { x: 300, y: 400 }, color: '#22304f' });
    const hood = app.swapUnit(wall, 'kitchen_hood');
    const rad = (rotation * Math.PI) / 180;
    const back = (f) => ({ x: f.position.x + Math.sin(rad) * f.depth / 2, y: f.position.y - Math.cos(rad) * f.depth / 2 });
    const a = back(wall);
    const b = back(hood);
    check(`wall cabinet -> hood at ${rotation} deg keeps its back in place`,
      hood.depth === 50 && hood.width === 80 && near(a.x, b.x, 1e-9) && near(a.y, b.y, 1e-9) && hood.height === 75);
    if (rotation === 0) {
      check('a hood takes its own steel finish, and a cabinet gets fronts back',
        hood.color === CATALOG_BY_TYPE.kitchen_hood.color
        && app.swapUnit(hood, 'wall_cabinet').color === CATALOG_BY_TYPE.wall_cabinet.color);
    }
  }
  const placed = item('wall_cabinet', { elevation: 120 });
  check('an elevation that was the old mounting height follows the new type',
    app.swapUnit(placed, 'kitchen_hood').elevation === CATALOG_BY_TYPE.kitchen_hood.mountY
    && app.swapUnit(item('wall_cabinet', { elevation: 137 }), 'kitchen_hood').elevation === 137
    && !('elevation' in app.swapUnit(item('wall_cabinet'), 'kitchen_hood')));
}

// ---- worktop ----------------------------------------------------------------
check('the default worktop is white quartz', app.DEFAULT_WORKTOP === 'quartz_white' && MATERIAL_BY_ID.quartz_white?.worktop === true);
check('an item without a worktop uses the default', app.worktopId(item('kitchen_base_cabinet')) === 'quartz_white');
check('an unknown worktop id falls back to the default', app.worktopId({ worktop: 'not_a_material' }) === 'quartz_white');
check('a chosen worktop resolves to its material',
  app.worktopMaterial({ worktop: 'granite_black' }).color === '#26272a' && app.worktopId({ worktop: 'walnut_slab' }) === 'walnut_slab');
{
  const ids = app.worktopMaterials().map((m) => m.id);
  const expected = [
    'quartz_white', 'granite_black', 'marble_calacatta', 'marble_nero', 'travertine', 'slate_dark', 'terrazzo_slab',
    'concrete_smooth', 'butcher_block_oak', 'walnut_slab', 'steel_brushed',
    'marble_01', 'concrete_floor_worn_02', 'wood_floor', 'dark_wooden_planks',
  ];
  check('the worktop list is the fifteen flagged materials',
    ids.length === expected.length && expected.every((id) => ids.includes(id)), ids.join(','));
  check('tiles are not offered as worktops', !ids.includes('hex_tile_white') && !ids.includes('zellige_green'));
  const spec = {
    quartz_white: ['White Quartz', 'Marble & Stone', 'both', 120, 0.3, 0.04, '#ecebe7'],
    granite_black: ['Black Granite', 'Marble & Stone', 'both', 100, 0.25, 0.1, '#26272a'],
    marble_calacatta: ['Calacatta Marble', 'Marble & Stone', 'both', 160, 0.2, 0.06, '#efece6'],
    marble_nero: ['Nero Marble', 'Marble & Stone', 'both', 160, 0.2, 0.08, '#1f1f22'],
    travertine: ['Travertine', 'Marble & Stone', 'both', 140, 0.5, 0.02, '#d9c9ad'],
    slate_dark: ['Dark Slate', 'Marble & Stone', 'both', 120, 0.6, 0.04, '#3d4247'],
    terrazzo_slab: ['Terrazzo Slab', 'Marble & Stone', 'both', 110, 0.35, 0.03, '#dcd6cb'],
    concrete_smooth: ['Smooth Concrete', 'Concrete', 'both', 200, 0.6, 0.02, '#b3b1ad'],
    butcher_block_oak: ['Oak Butcher Block', 'Wood', 'both', 120, 0.5, 0, '#c69a62'],
    walnut_slab: ['Walnut', 'Wood', 'both', 160, 0.5, 0, '#6b4630'],
    steel_brushed: ['Brushed Steel', 'Metal', 'both', 100, 0.35, 0.85, '#b9bcc0'],
    hex_tile_white: ['White Hex Tile', 'Tile', 'both', 40, 0.3, 0.05, '#e9e8e3'],
    zellige_green: ['Green Zellige', 'Tile', 'wall', 40, 0.25, 0.06, '#4f7a66'],
  };
  const wrong = Object.entries(spec).filter(([id, [name, group, target, scaleCm, roughness, metalness, color]]) => {
    const m = MATERIAL_BY_ID[id];
    return !m || m.name !== name || m.group !== group || m.target !== target || m.scaleCm !== scaleCm
      || m.roughness !== roughness || m.metalness !== metalness || m.color !== color;
  }).map(([id]) => id);
  check('the thirteen new library materials match their spec', wrong.length === 0, wrong.join(','));
  check('images whose grain runs down them are turned to follow the run',
    MATERIAL_BY_ID.butcher_block_oak.grainY === true && MATERIAL_BY_ID.wood_floor.grainY === true && !MATERIAL_BY_ID.walnut_slab.grainY);
  check('material ids are unique', new Set(MATERIALS.map((m) => m.id)).size === MATERIALS.length);
  check('every material group is listed for the pickers', MATERIALS.every((m) => MATERIAL_GROUPS.includes(m.group)) && MATERIAL_GROUPS.includes('Metal'));
  const floor = app.floorMaterials().map((m) => m.id);
  const wall = app.wallMaterials().map((m) => m.id);
  check('new materials reach the floor and wall pickers by target',
    floor.includes('quartz_white') && wall.includes('quartz_white') && floor.includes('hex_tile_white')
    && wall.includes('zellige_green') && !floor.includes('zellige_green') && floor.includes('steel_brushed'));
}
{
  const sofa = item('sofa');
  const tallUnit = item('kitchen_larder');
  const upper = item('wall_cabinet');
  const shelf = item('kitchen_open_shelf');
  const before = [item('kitchen_base_cabinet'), item('kitchen_sink', { worktop: 'marble_01' }), item('counter'), item('island'), sofa, tallUnit, upper, shelf];
  const after = app.applyWorktopToAll(before, 'granite_black');
  check('apply-to-all sets the worktop on every worktop-bearing unit',
    after.slice(0, 4).every((f) => f.worktop === 'granite_black'));
  check('apply-to-all leaves everything else untouched (same objects)',
    after[4] === sofa && after[5] === tallUnit && after[6] === upper && after[7] === shelf && !('worktop' in after[5]));
  check('apply-to-all does not mutate its input', before[0].worktop === undefined && before[1].worktop === 'marble_01' && after !== before);
  const again = app.applyWorktopToAll(after, 'granite_black');
  check('re-applying the same worktop changes no item', again.every((f, i) => f === after[i]));

  const painted = app.applyFrontColorToAll(before, '#22304f');
  check('apply-colour reaches every unit with fronts and nothing else',
    painted.slice(0, 4).every((f) => f.color === '#22304f') && painted[5].color === '#22304f' && painted[6].color === '#22304f'
    && painted[4] === sofa && painted[7] === shelf && app.applyFrontColorToAll([item('kitchen_hood')], '#22304f')[0].color !== '#22304f');
  const bare = app.applyHandlesToAll(before, 'none');
  check('apply-handles reaches every unit with fronts and nothing else',
    bare.slice(0, 4).every((f) => f.handles === 'none') && bare[5].handles === 'none' && bare[6].handles === 'none'
    && bare[4] === sofa && bare[7] === shelf);
  check('bar handles are the default, so applying them to fresh units changes nothing',
    app.applyHandlesToAll(before, 'bar').every((f, i) => f === before[i]));
}
check('an old 85 cm dishwasher is drawn at worktop height; a chosen height is kept',
  app.unitHeightCm({ type: 'dishwasher', height: 85 }) === 90 && app.unitHeightCm({ type: 'dishwasher', height: 80 }) === 80
  && app.unitHeightCm({ type: 'kitchen_base_cabinet', height: 85 }) === 85);

// ---- layout -----------------------------------------------------------------
const finite = (parts) => parts.every((p) => [p.x, p.y, p.z, p.w, p.h, p.d].every(Number.isFinite) && p.w > 0 && p.h > 0 && p.d > 0);
const span = (parts, axis, size) => ({
  min: Math.min(...parts.map((p) => p[axis] - p[size] / 2)),
  max: Math.max(...parts.map((p) => p[axis] + p[size] / 2)),
});
{
  const bad = [];
  for (const u of KITCHEN_UNITS) {
    const e = CATALOG_BY_TYPE[u.type];
    for (const handles of ['bar', 'none']) {
      for (const scale of [1, 0.75, 1.5]) {
        const [w, d, h] = [e.width * scale / 100, e.depth / 100, e.height / 100];
        const L = app.unitLayout(u.kind, w, d, h, handles);
        const tag = `${u.type}/${handles}/x${scale}`;
        if (!finite(L.body) || !finite(L.handles) || !finite(L.worktop)) bad.push(`${tag}: degenerate box`);
        if (L.fittings.some((f) => ![f.x, f.y, f.z, f.s].every(Number.isFinite) || f.s <= 0)) bad.push(`${tag}: bad fitting`);
        if (handles === 'none' && L.handles.length) bad.push(`${tag}: handleless unit has handles`);
        if (!!L.worktop.length !== u.worktop) bad.push(`${tag}: worktop presence`);
        if (u.kind !== 'hood' && !L.body.length) bad.push(`${tag}: nothing to draw`);
        // Nothing may poke out of the sides: neighbours sit flush.
        const side = u.kind === 'island' ? app.WORKTOP_OVERHANG : 0;
        for (const p of [...L.body, ...L.handles, ...L.worktop]) {
          if (Math.abs(p.x) + p.w / 2 > w / 2 + side + 1e-9) { bad.push(`${tag}: part beyond the slot sides`); break; }
        }
        for (const f of L.fittings) {
          const fw = app.FITTING_SIZE[f.id][0] * f.s;
          if (f.id !== 'tap' && fw > w + 1e-9) bad.push(`${tag}: ${f.id} wider than the slot`);
        }
        if (u.worktop) {
          const y = span(L.worktop, 'y', 'h');
          const x = span(L.worktop, 'x', 'w');
          const z = span(L.worktop, 'z', 'd');
          if (!near(y.max, h) || !near(y.max - y.min, 0.04)) bad.push(`${tag}: worktop is not a 4 cm slab on top`);
          if (!near(x.min, -w / 2 - side) || !near(x.max, w / 2 + side)) bad.push(`${tag}: worktop does not span the slot`);
          if (!near(z.max, d / 2 + 0.02)) bad.push(`${tag}: front overhang is not 2 cm`);
          if (!near(z.min, -d / 2 - side)) bad.push(`${tag}: worktop back is not flush`);
        }
      }
    }
  }
  check('every unit lays out cleanly at standard, narrow and wide slots', bad.length === 0, bad.slice(0, 6).join(' | '));
}
{
  const fit = (kind, w, d = 0.6, h = 0.9) => app.unitLayout(kind, w, d, h).fittings;
  const ids = (kind, w, d, h) => fit(kind, w, d, h).map((f) => f.id).sort().join(',');
  check('units carry the right fittings',
    ids('sink', 0.9) === 'sink_bowl,tap' && ids('oven_hob', 0.6) === 'hob_induction,oven_front'
    && ids('oven_hob_gas', 0.6) === 'hob_gas,oven_front' && ids('hob_gas', 0.6) === 'hob_gas'
    && ids('hob_induction', 0.6) === 'hob_induction' && ids('oven', 0.6) === 'oven_front'
    && ids('oven_tower', 0.6, 0.6, 2.1) === 'microwave_front,oven_front' && ids('wall_microwave', 0.6, 0.35, 0.6) === 'microwave_front'
    && ids('hood', 0.6, 0.5, 0.75) === 'hood' && ids('cabinet', 0.55) === '' && ids('fridge_tall', 0.6, 0.6, 2.1) === '');
  const oven = fit('oven', 0.6)[0];
  check('a 60 cm oven is full size, flush on the carcass front, under the worktop',
    near(oven.s, 1) && near(oven.z, 0.3 - app.FRONT_T) && oven.y + 0.595 <= 0.86 && oven.y > 0.1);
  check('a narrower slot scales the oven down uniformly', near(fit('oven', 0.55)[0].s, 0.55 / 0.6));
  const hob = fit('hob_induction', 0.6)[0];
  check('a hob sits on the worktop, full size at 60 cm', near(hob.y, 0.9) && near(hob.s, 1));
  const [bowl, tap] = ['sink_bowl', 'tap'].map((id) => fit('sink', 0.9).find((f) => f.id === id));
  check('the sink bowl rim sits at the worktop surface with the tap behind it',
    near(bowl.y, 0.9) && near(tap.y, 0.9) && tap.z < bowl.z - 0.2 * bowl.s && tap.z > -0.3);
  const sinkTop = app.unitLayout('sink', 0.9, 0.6, 0.9).worktop;
  const overHole = sinkTop.some((p) => Math.abs(p.x - bowl.x) < p.w / 2 && Math.abs(p.z - bowl.z) < p.d / 2);
  check('the worktop is cut out under the sink bowl', sinkTop.length === 4 && !overHole);
  const tower = app.unitLayout('oven_tower', 0.6, 0.6, 2.1).fittings;
  const o = tower.find((f) => f.id === 'oven_front');
  const m = tower.find((f) => f.id === 'microwave_front');
  check('the oven tower stacks the microwave above the oven, inside the unit',
    m.y >= o.y + 0.595 * o.s && m.y + 0.38 * m.s < 2.1 && o.y > 0.8);
  const hood = fit('hood', 0.6, 0.5, 0.75)[0];
  check('the hood hangs from the base of its slot, back to the wall', near(hood.y, 0) && near(hood.s, 1) && near(hood.z, 0));
  check('layout keys separate handle styles and sizes',
    app.layoutKey('cabinet', 0.55, 0.6, 0.9, 'bar') !== app.layoutKey('cabinet', 0.55, 0.6, 0.9, 'none')
    && app.layoutKey('cabinet', 0.55, 0.6, 0.9, 'bar') !== app.layoutKey('cabinet', 0.6, 0.6, 0.9, 'bar'));
}

// ---- the kitchen-run tool is unchanged --------------------------------------
{
  check('run unit footprints are the catalog cabinets', app.RUN_UNIT.width === 55 && app.RUN_UNIT.depth === 60
    && CATALOG_BY_TYPE.wall_cabinet.width === 80 && CATALOG_BY_TYPE.wall_cabinet.depth === 35 && CATALOG_BY_TYPE.wall_cabinet.mountY === 120);
  const room = [{ points: [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }] }];
  const a = { x: 20, y: 36 };
  const b = { x: 350, y: 36 };
  const base = app.kitchenRunUnits(a, b, room, []);
  // 330 cm of 55 cm cabinets: six, centred on the segment, facing the room (+y).
  const expectBase = [47.5, 102.5, 157.5, 212.5, 267.5, 322.5];
  check('a 330 cm run tiles six base cabinets at the same positions as before',
    base.length === 6 && base.every((u, i) => near(u.position.x, expectBase[i]) && near(u.position.y, 36) && u.rotation === 0),
    JSON.stringify(base));
  const upper = app.kitchenUpperUnits(a, b, room, []);
  const expectUpper = [65, 145, 225, 305];
  check('the same run tiles four wall cabinets, set back to the base units\' backs',
    upper.length === 4 && upper.every((u, i) => near(u.position.x, expectUpper[i]) && near(u.position.y, 36 - 12.5) && u.rotation === 0),
    JSON.stringify(upper));
  const flipped = app.kitchenRunUnits({ x: 20, y: 264 }, { x: 350, y: 264 }, room, []);
  check('a run on the far wall turns to face the room', flipped.every((u) => u.rotation === 180));
  const down = app.kitchenRunUnits({ x: 36, y: 20 }, { x: 36, y: 240 }, room, []);
  check('a run down a side wall keeps its 55 cm pitch',
    down.length === 4 && down.every((u, i) => near(u.position.y, 20 + 27.5 + 55 * i) && near(u.position.x, 36)));
  check('a mis-tap cannot explode into thousands of cabinets', app.kitchenRunUnits({ x: 0, y: 0 }, { x: 1e6, y: 0 }, [], []).length === 60);
  check('a run is made of worktop-bearing base cabinets and wall cabinets',
    KITCHEN_UNIT_BY_TYPE.kitchen_base_cabinet.worktop && KITCHEN_UNIT_BY_TYPE.wall_cabinet.family === 'wall');
}

console.log(failed ? `\nKITCHEN: ${failed} FAILED (${passed} passed)` : `KITCHEN: all ${passed} checks passed`);
process.exit(failed ? 1 : 0);
