// Modular kitchen units: the unit table, family/swap rules, worktop helpers and
// the parametric layout every unit is drawn from. Pure data and maths (no
// three.js, no DOM) so node tests can import it; KitchenUnit3D turns a layout
// into meshes and the 2D plan reads the same table.
import { CATALOG_BY_TYPE } from '../data/furnitureCatalog';
import { MATERIAL_BY_ID, type Material } from '../data/materials';
import type { FurnitureItem } from '../types';

export type UnitFamily = 'base' | 'tall' | 'wall';
export type UnitKind =
  | 'cabinet' | 'drawers' | 'corner' | 'sink' | 'hob_induction' | 'hob_gas'
  | 'oven' | 'oven_hob' | 'oven_hob_gas' | 'dishwasher' | 'counter' | 'island'
  | 'fridge_tall' | 'oven_tower' | 'larder'
  | 'wall_cabinet' | 'wall_microwave' | 'hood' | 'open_shelf' | 'open_niche';
export type HandleStyle = 'bar' | 'none';

export interface KitchenUnitDef {
  /** Catalog type id. Sizes, name and Pro flag live in the catalog entry. */
  type: string;
  family: UnitFamily;
  kind: UnitKind;
  /** Short label for the swap chips in the Properties panel. */
  label: string;
  /** Carries a worktop slab (base units). */
  worktop: boolean;
  /** Has door/drawer fronts in the item's colour ("apply colour to all"). */
  fronts: boolean;
  /** Offered as an in-place swap within its family. Corner units and the
   *  free-length counter/island have their own footprint, so they sit out. */
  swap: boolean;
}

const unit = (
  type: string, family: UnitFamily, kind: UnitKind, label: string,
  opts: { fronts?: boolean; swap?: boolean } = {},
): KitchenUnitDef => ({
  type, family, kind, label,
  worktop: family === 'base',
  fronts: opts.fronts ?? true,
  swap: opts.swap ?? true,
});

export const KITCHEN_UNITS: KitchenUnitDef[] = [
  // Base units: 90 high, 60 deep, worktop on top.
  unit('kitchen_base_cabinet', 'base', 'cabinet', 'Cabinet'),
  unit('kitchen_drawer_cabinet', 'base', 'drawers', 'Drawers'),
  unit('kitchen_sink', 'base', 'sink', 'Sink'),
  unit('stove', 'base', 'oven_hob', 'Stove'),
  unit('kitchen_range_gas', 'base', 'oven_hob_gas', 'Gas stove'),
  unit('kitchen_hob_induction', 'base', 'hob_induction', 'Induction hob'),
  unit('kitchen_hob_gas', 'base', 'hob_gas', 'Gas hob'),
  unit('kitchen_oven', 'base', 'oven', 'Oven'),
  unit('dishwasher', 'base', 'dishwasher', 'Dishwasher'),
  unit('kitchen_corner_cabinet', 'base', 'corner', 'Corner', { swap: false }),
  unit('counter', 'base', 'counter', 'Counter', { swap: false }),
  unit('island', 'base', 'island', 'Island', { swap: false }),
  // Tall units: about 210 high, 60 deep, no worktop.
  unit('kitchen_larder', 'tall', 'larder', 'Larder'),
  unit('kitchen_fridge_tall', 'tall', 'fridge_tall', 'Fridge-freezer'),
  unit('kitchen_oven_tower', 'tall', 'oven_tower', 'Oven Tower'),
  // Wall units: mounted above the worktop through the catalog `mountY`.
  unit('wall_cabinet', 'wall', 'wall_cabinet', 'Cabinet'),
  unit('kitchen_wall_microwave', 'wall', 'wall_microwave', 'Microwave'),
  unit('kitchen_hood', 'wall', 'hood', 'Hood', { fronts: false }),
  unit('kitchen_open_shelf', 'wall', 'open_shelf', 'Open Shelf', { fronts: false }),
  unit('kitchen_open_niche', 'wall', 'open_niche', 'Open Niche', { fronts: false }),
];

export const KITCHEN_UNIT_BY_TYPE: Record<string, KitchenUnitDef> =
  Object.fromEntries(KITCHEN_UNITS.map((u) => [u.type, u]));

export const isKitchenUnit = (type: string): boolean => type in KITCHEN_UNIT_BY_TYPE;
export const hasWorktop = (type: string): boolean => !!KITCHEN_UNIT_BY_TYPE[type]?.worktop;
export const hasFronts = (type: string): boolean => !!KITCHEN_UNIT_BY_TYPE[type]?.fronts;

/** Units a placed unit can become in place: the swappable units of its own
 *  family (itself included, so the chip row can show the current one). */
export function swapTargets(type: string): KitchenUnitDef[] {
  const from = KITCHEN_UNIT_BY_TYPE[type];
  if (!from || !from.swap) return [];
  return KITCHEN_UNITS.filter((u) => u.swap && u.family === from.family);
}

/**
 * Swap a placed unit for another of the same family, in place. The slot keeps
 * its width, position, facing, worktop and handle style so a run stays
 * aligned; name and height come from the new type. A different depth (a hood
 * is deeper than a wall cabinet) moves the centre so the back stays where it
 * was. Returns null when the swap is not allowed.
 */
export function swapUnit(item: FurnitureItem, newType: string): FurnitureItem | null {
  const from = KITCHEN_UNIT_BY_TYPE[item.type];
  const to = KITCHEN_UNIT_BY_TYPE[newType];
  const entry = CATALOG_BY_TYPE[newType];
  if (!from || !to || !entry) return null;
  if (!from.swap || !to.swap || from.family !== to.family) return null;
  if (newType === item.type) return item;
  const oldEntry = CATALOG_BY_TYPE[item.type];
  const next: FurnitureItem = { ...item, type: newType, name: entry.name, height: entry.height };
  if (entry.depth !== item.depth) {
    const rad = (item.rotation * Math.PI) / 180;
    const shift = (entry.depth - item.depth) / 2;
    next.depth = entry.depth;
    next.position = {
      x: item.position.x - Math.sin(rad) * shift,
      y: item.position.y + Math.cos(rad) * shift,
    };
  }
  // Fronts keep the kitchen's colour; a unit with its own finish (steel hood,
  // timber shelf) takes its own, and gives the default back on the way out.
  if (!(from.fronts && to.fronts)) next.color = entry.color;
  // An explicit elevation that was just the old type's mounting height follows
  // the new type's; a height the user chose stays.
  if (item.elevation != null && oldEntry?.mountY != null && item.elevation === oldEntry.mountY && entry.mountY != null) {
    next.elevation = entry.mountY;
  }
  return next;
}

// ---- worktop ----------------------------------------------------------------

export const DEFAULT_WORKTOP = 'quartz_white';

/** The worktop material id an item resolves to (unset or unknown: default). */
export function worktopId(item: Pick<FurnitureItem, 'worktop'>): string {
  return item.worktop && MATERIAL_BY_ID[item.worktop] ? item.worktop : DEFAULT_WORKTOP;
}

export function worktopMaterial(item: Pick<FurnitureItem, 'worktop'>): Material {
  return MATERIAL_BY_ID[worktopId(item)];
}

/** Set the worktop on every worktop-bearing unit. Other items keep identity. */
export function applyWorktopToAll(furniture: FurnitureItem[], materialId: string): FurnitureItem[] {
  return furniture.map((f) => (hasWorktop(f.type) && f.worktop !== materialId ? { ...f, worktop: materialId } : f));
}

/** Set the front colour on every unit that has fronts. */
export function applyFrontColorToAll(furniture: FurnitureItem[], color: string): FurnitureItem[] {
  return furniture.map((f) => (hasFronts(f.type) && f.color !== color ? { ...f, color } : f));
}

/** Set bar handles / handleless on every unit that has fronts. */
export function applyHandlesToAll(furniture: FurnitureItem[], handles: HandleStyle): FurnitureItem[] {
  return furniture.map((f) => (hasFronts(f.type) && (f.handles ?? 'bar') !== handles ? { ...f, handles } : f));
}

/** Height a unit is drawn at, cm. The dishwasher used to be a free-standing
 *  85 cm appliance; drawn as an integrated unit it has to reach the worktop
 *  line, so items saved with the old default height are drawn at 90. */
export function unitHeightCm(item: Pick<FurnitureItem, 'type' | 'height'>): number {
  if (item.type === 'dishwasher' && item.height === 85) return 90;
  return item.height;
}

// ---- parametric layout (metres, unit-local: x across, y up, +z front) -------

export const PLINTH_H = 0.1;
export const PLINTH_RECESS = 0.05;
export const WORKTOP_T = 0.04;
export const WORKTOP_OVERHANG = 0.02;
export const FRONT_T = 0.02;
const GAP = 0.004; // shadow line between neighbouring fronts
/** How far the gaps between fronts are recessed. Shallow on purpose: with no
 *  shadows or ambient occlusion a deep gap shows the lit edge of the next
 *  front instead of a dark line. */
const REVEAL_DEPTH = 0.003;
const PANEL_T = 0.018;
/** Height of the base-unit front line; tall units split here so doors line up. */
const BASE_LINE = 0.86;

/** Vertex tone: a multiplier on the item's colour. */
export const TONE = { front: 1, carcass: 0.84, plinth: 0.1, shadow: 0.05, reveal: 0.22, bracket: 0.12, inside: 0.72 };

export interface BoxPart {
  /** Centre. */
  x: number; y: number; z: number;
  w: number; h: number; d: number;
  tone: number;
}

export type FittingId =
  | 'tap' | 'sink_bowl' | 'hob_induction' | 'hob_gas' | 'oven_front' | 'microwave_front' | 'hood';

/** Nominal size of each fitting model (x, y, z extents in metres). */
export const FITTING_SIZE: Record<FittingId, [number, number, number]> = {
  tap: [0.115, 0.34, 0.227],
  sink_bowl: [0.5, 0.18, 0.4],
  hob_induction: [0.58, 0.007, 0.51],
  hob_gas: [0.58, 0.042, 0.51],
  oven_front: [0.595, 0.595, 0.069],
  microwave_front: [0.595, 0.38, 0.054],
  hood: [0.6, 0.755, 0.5],
};

export interface FittingPart {
  id: FittingId;
  /** Model origin in unit space. */
  x: number; y: number; z: number;
  /** Uniform scale. */
  s: number;
}

export interface UnitLayout {
  /** Plinth, carcass and fronts: one mesh in the item's colour, toned per box. */
  body: BoxPart[];
  /** Bar handles and their posts: one metal mesh. */
  handles: BoxPart[];
  /** Worktop slab pieces (several only where a sink is cut out). */
  worktop: BoxPart[];
  fittings: FittingPart[];
}

const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, tone: number): BoxPart => ({
  x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2,
  w: x1 - x0, h: y1 - y0, d: z1 - z0, tone,
});

interface FrontSpec {
  x0: number; x1: number; y0: number; y1: number;
  /** 'h': bar across (drawers, flaps). 'v': upright bar on the `side` edge. */
  handle?: 'h' | 'v';
  side?: -1 | 1;
  /** Which edge the grip (handle or shadow gap) sits on. */
  grip?: 'top' | 'bottom';
  /** Bar length override. */
  len?: number;
}

/** One door/drawer front on the unit's front plane (zf = front face). */
function addFront(out: UnitLayout, f: FrontSpec, zf: number, handles: HandleStyle) {
  const x0 = f.x0 + GAP / 2;
  const x1 = f.x1 - GAP / 2;
  let y0 = f.y0 + GAP / 2;
  let y1 = f.y1 - GAP / 2;
  if (x1 - x0 < 0.004 || y1 - y0 < 0.004) return;
  // A dark fill behind the front, a little larger than it, so the gap to the
  // next front reads as a shadow line on every quality tier. Built-in
  // appliance fascias have no fill behind them: parts of them sit further back.
  out.body.push(box(f.x0, f.x1, f.y0, f.y1, zf - FRONT_T, zf - REVEAL_DEPTH, TONE.reveal));
  const grip = f.grip ?? 'top';
  if (f.handle && handles === 'none') {
    // Handleless: the front stops short and a dark recess reads as a grip rail.
    const g = Math.min(0.022, (y1 - y0) * 0.3);
    if (grip === 'top') {
      out.body.push(box(x0, x1, y1 - g, y1, zf - FRONT_T, zf - REVEAL_DEPTH / 2, TONE.shadow));
      y1 -= g;
    } else {
      out.body.push(box(x0, x1, y0, y0 + g, zf - FRONT_T, zf - REVEAL_DEPTH / 2, TONE.shadow));
      y0 += g;
    }
  }
  out.body.push(box(x0, x1, y0, y1, zf - FRONT_T, zf, TONE.front));
  if (!f.handle || handles === 'none') return;
  const fw = x1 - x0;
  const fh = y1 - y0;
  const bar = 0.012;
  const off = 0.03; // bar stands this far off the front
  const posts = (cx: number, cy: number) =>
    out.handles.push(box(cx - 0.005, cx + 0.005, cy - 0.005, cy + 0.005, zf, zf + off - bar / 2, 1));
  if (f.handle === 'h') {
    const len = Math.min(fw - 0.04, f.len ?? Math.max(0.12, Math.min(0.32, fw * 0.4)));
    if (len < 0.04) return;
    const inset = Math.min(0.055, fh / 2);
    const cy = grip === 'top' ? y1 - inset : y0 + inset;
    const cx = (x0 + x1) / 2;
    out.handles.push(box(cx - len / 2, cx + len / 2, cy - bar / 2, cy + bar / 2, zf + off - bar, zf + off, 1));
    posts(cx - len / 2 + 0.02, cy);
    posts(cx + len / 2 - 0.02, cy);
  } else {
    const len = Math.min(fh - 0.04, f.len ?? 0.16);
    if (len < 0.04) return;
    const side = f.side ?? 1;
    const cx = side > 0 ? x1 - Math.min(0.045, fw / 2) : x0 + Math.min(0.045, fw / 2);
    const ya = grip === 'top' ? y1 - 0.05 - len : y0 + 0.05;
    out.handles.push(box(cx - bar / 2, cx + bar / 2, ya, ya + len, zf + off - bar, zf + off, 1));
    posts(cx, ya + 0.02);
    posts(cx, ya + len - 0.02);
  }
}

/** `n` doors side by side, handles meeting in pairs. */
function addDoors(
  out: UnitLayout, x0: number, x1: number, y0: number, y1: number, n: number,
  zf: number, handles: HandleStyle, grip: 'top' | 'bottom' = 'top', len?: number,
) {
  const dw = (x1 - x0) / n;
  for (let i = 0; i < n; i++) {
    // A lone door hinges left; pairs open from the middle.
    const side: -1 | 1 = n === 1 ? 1 : i % 2 === 0 ? 1 : -1;
    addFront(out, { x0: x0 + dw * i, x1: x0 + dw * (i + 1), y0, y1, handle: 'v', side, grip, len }, zf, handles);
  }
}

/** Drawer fronts stacked from y0 up; `heights` are shares of the span. */
function addDrawers(
  out: UnitLayout, x0: number, x1: number, y0: number, y1: number, shares: number[],
  zf: number, handles: HandleStyle,
) {
  const total = shares.reduce((a, b) => a + b, 0);
  let y = y0;
  for (const share of shares) {
    const top = y + ((y1 - y0) * share) / total;
    addFront(out, { x0, x1, y0: y, y1: top, handle: 'h' }, zf, handles);
    y = top;
  }
}

const doorCount = (w: number) => (w > 0.65 ? 2 : 1);

/**
 * A built-in appliance fascia with filler fronts either side when the slot is
 * wider than the (uniformly scaled) appliance. Returns the fascia's top.
 */
function addFascia(
  out: UnitLayout, id: 'oven_front' | 'microwave_front', w: number, y0: number, s: number, zf: number,
): number {
  const [fw, fh] = FITTING_SIZE[id];
  const half = (fw * s) / 2;
  out.fittings.push({ id, x: 0, y: y0, z: zf - FRONT_T, s });
  if (w / 2 - half > 0.008) {
    addFront(out, { x0: -w / 2, x1: -half, y0: y0 - GAP / 2, y1: y0 + fh * s + GAP / 2 }, zf, 'bar');
    addFront(out, { x0: half, x1: w / 2, y0: y0 - GAP / 2, y1: y0 + fh * s + GAP / 2 }, zf, 'bar');
  }
  return y0 + fh * s;
}

/**
 * Everything a unit is made of, for a slot `w` x `d` x `h` metres. Fittings
 * are scaled uniformly to the slot, never stretched.
 */
export function unitLayout(kind: UnitKind, w: number, d: number, h: number, handles: HandleStyle = 'bar'): UnitLayout {
  const out: UnitLayout = { body: [], handles: [], worktop: [], fittings: [] };
  const zf = d / 2; // front face of the fronts
  const zc = zf - FRONT_T; // carcass front
  const zb = -d / 2;
  const xl = -w / 2;
  const xr = w / 2;

  // ---- wall units: no plinth, no worktop -----------------------------------
  if (kind === 'hood') {
    const [mw, , md] = FITTING_SIZE.hood;
    const s = Math.min(w / mw, d / md, 1.6);
    out.fittings.push({ id: 'hood', x: 0, y: 0, z: zb + (md * s) / 2, s });
    return out;
  }
  if (kind === 'open_shelf') {
    const t = Math.min(0.035, h / 4);
    const inset = Math.min(0.12, w * 0.18);
    for (const y0 of [0, h - t]) {
      out.body.push(box(xl, xr, y0, y0 + t, zb, zf, TONE.front));
      for (const sx of [-1, 1]) {
        const cx = sx * (w / 2 - inset);
        out.body.push(box(cx - 0.008, cx + 0.008, y0 - 0.07, y0, zb, zb + d * 0.72, TONE.bracket));
      }
    }
    return out;
  }
  if (kind === 'open_niche') {
    const t = Math.min(PANEL_T, w / 6, h / 6);
    out.body.push(box(xl, xr, 0, t, zb, zf, TONE.front));
    out.body.push(box(xl, xr, h - t, h, zb, zf, TONE.front));
    out.body.push(box(xl, xl + t, t, h - t, zb, zf, TONE.front));
    out.body.push(box(xr - t, xr, t, h - t, zb, zf, TONE.front));
    out.body.push(box(xl + t, xr - t, t, h - t, zb, zb + 0.008, TONE.inside));
    return out;
  }
  if (kind === 'wall_cabinet' || kind === 'wall_microwave') {
    out.body.push(box(xl, xr, 0, h, zb, zc, TONE.carcass));
    if (kind === 'wall_cabinet') {
      addDoors(out, xl, xr, 0, h, doorCount(w), zf, handles, 'bottom');
    } else {
      const [mw, mh] = FITTING_SIZE.microwave_front;
      const s = Math.max(0.2, Math.min(w / 0.6, (h - 0.1) / mh, 1.3));
      void mw;
      const top = addFascia(out, 'microwave_front', w, GAP, s, zf);
      addFront(out, { x0: xl, x1: xr, y0: top + GAP / 2, y1: h, handle: 'h', grip: 'bottom' }, zf, handles);
    }
    return out;
  }

  // ---- floor-standing units ------------------------------------------------
  const island = kind === 'island';
  const tall = kind === 'fridge_tall' || kind === 'oven_tower' || kind === 'larder';
  const top = tall ? h : h - WORKTOP_T; // carcass top
  const pl = Math.min(PLINTH_H, top * 0.4);
  // Plinth: set back from the fronts (all round on an island).
  out.body.push(island
    ? box(xl + PLINTH_RECESS, xr - PLINTH_RECESS, 0, pl, zb + PLINTH_RECESS, zc - PLINTH_RECESS, TONE.plinth)
    : box(xl, xr, 0, pl, zb, zc - PLINTH_RECESS, TONE.plinth));

  if (kind === 'sink') {
    // The bowl hangs below the worktop, so the carcass is open-topped there:
    // a lowered box plus side and back panels up to the worktop.
    const [bw, bh, bd] = FITTING_SIZE.sink_bowl;
    const s = Math.max(0.2, Math.min(1, (w - 0.05) / bw, (d - 0.16) / bd));
    const bz = 0.02; // bowl centre, a little forward to leave room for the tap
    const low = Math.max(pl + 0.05, h - bh * s - 0.02);
    out.body.push(box(xl, xr, pl, low, zb, zc, TONE.carcass));
    out.body.push(box(xl, xl + PANEL_T, low, top, zb, zc, TONE.carcass));
    out.body.push(box(xr - PANEL_T, xr, low, top, zb, zc, TONE.carcass));
    out.body.push(box(xl + PANEL_T, xr - PANEL_T, low, top, zb, zb + PANEL_T, TONE.carcass));
    addDoors(out, xl, xr, pl, top, doorCount(w), zf, handles);
    // Worktop around the cut-out; the bowl's rim (30 mm) laps over the edge.
    const hx = (bw / 2 - 0.015) * s;
    const hz = (bd / 2 - 0.015) * s;
    const wf = zf + WORKTOP_OVERHANG;
    out.worktop.push(box(xl, xr, top, h, zb, bz - hz, 1));
    out.worktop.push(box(xl, xr, top, h, bz + hz, wf, 1));
    out.worktop.push(box(xl, -hx, top, h, bz - hz, bz + hz, 1));
    out.worktop.push(box(hx, xr, top, h, bz - hz, bz + hz, 1));
    out.fittings.push({ id: 'sink_bowl', x: 0, y: h, z: bz, s });
    out.fittings.push({ id: 'tap', x: 0, y: h, z: Math.max(zb + 0.04, (zb + bz - (bd / 2) * s) / 2), s: Math.max(0.6, s) });
    return out;
  }

  out.body.push(box(xl, xr, pl, top, zb, zc, TONE.carcass));

  if (tall) {
    const line = Math.min(BASE_LINE, pl + (top - pl) * 0.45);
    if (kind === 'fridge_tall') {
      // Freezer below the worktop line, fridge above; long bars meet at the split.
      addFront(out, { x0: xl, x1: xr, y0: pl, y1: line, handle: 'v', side: 1, grip: 'top', len: 0.32 }, zf, handles);
      addFront(out, { x0: xl, x1: xr, y0: line, y1: top, handle: 'v', side: 1, grip: 'bottom', len: 0.32 }, zf, handles);
    } else if (kind === 'larder') {
      const split = Math.max(line + 0.2, top - 0.64);
      addDoors(out, xl, xr, pl, split, doorCount(w), zf, handles, 'top', 0.32);
      addDoors(out, xl, xr, split, top, doorCount(w), zf, handles, 'bottom');
    } else {
      // Oven tower: pan drawers, the oven at worktop height, a microwave over
      // it and a door to the top.
      const stack = FITTING_SIZE.oven_front[1] + FITTING_SIZE.microwave_front[1];
      const s = Math.max(0.2, Math.min(w / 0.6, (top - line - 0.08) / stack, 1.3));
      addDrawers(out, xl, xr, pl, line, [1, 1], zf, handles);
      const ovenTop = addFascia(out, 'oven_front', w, line + GAP, s, zf);
      const microTop = addFascia(out, 'microwave_front', w, ovenTop + GAP, s, zf);
      addFront(out, { x0: xl, x1: xr, y0: microTop + GAP / 2, y1: top, handle: 'h', grip: 'bottom' }, zf, handles);
    }
    return out;
  }

  // Base units: fronts, then the worktop and whatever sits on it.
  const hasOven = kind === 'oven' || kind === 'oven_hob' || kind === 'oven_hob_gas';
  if (hasOven) {
    const oh = FITTING_SIZE.oven_front[1];
    const s = Math.max(0.2, Math.min(w / 0.6, (top - pl - 0.06) / oh, 1.4));
    const y0 = top - GAP - oh * s;
    addFascia(out, 'oven_front', w, y0, s, zf);
    // What is left below the oven is a shallow drawer.
    addFront(out, { x0: xl, x1: xr, y0: pl, y1: y0 - GAP / 2, handle: y0 - pl > 0.11 ? 'h' : undefined }, zf, handles);
  } else if (kind === 'drawers') {
    addDrawers(out, xl, xr, pl, top, [2, 2, 1], zf, handles);
  } else if (kind === 'hob_induction' || kind === 'hob_gas') {
    addDrawers(out, xl, xr, pl, top, [1, 1], zf, handles);
  } else if (kind === 'dishwasher') {
    addFront(out, { x0: xl, x1: xr, y0: pl, y1: top, handle: 'h', len: w * 0.62 }, zf, handles);
  } else if (kind === 'counter' || kind === 'island') {
    addDoors(out, xl, xr, pl, top, Math.max(1, Math.min(8, Math.round(w / 0.55))), zf, handles);
  } else {
    addDoors(out, xl, xr, pl, top, kind === 'corner' ? 2 : doorCount(w), zf, handles);
  }

  // Worktop: flush at the sides and back so neighbours join into one slab,
  // proud of the fronts. An island stands alone, so it overhangs all round.
  const o = WORKTOP_OVERHANG;
  out.worktop.push(island
    ? box(xl - o, xr + o, top, h, zb - o, zf + o, 1)
    : box(xl, xr, top, h, zb, zf + o, 1));

  const hob: FittingId | null =
    kind === 'hob_induction' || kind === 'oven_hob' ? 'hob_induction'
      : kind === 'hob_gas' || kind === 'oven_hob_gas' ? 'hob_gas' : null;
  if (hob) {
    const [hw, , hd] = FITTING_SIZE[hob];
    const s = Math.max(0.2, Math.min((w - 0.02) / hw, (d + o - 0.07) / hd, 1.5));
    out.fittings.push({ id: hob, x: 0, y: h, z: o / 2, s });
  }
  return out;
}

/** Cache key for a layout (millimetre resolution). */
export function layoutKey(kind: UnitKind, w: number, d: number, h: number, handles: HandleStyle): string {
  const mm = (v: number) => Math.round(v * 1000);
  return `${kind}|${mm(w)}|${mm(d)}|${mm(h)}|${handles}`;
}
