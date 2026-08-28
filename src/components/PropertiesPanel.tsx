import {
  SlidersHorizontal, Sparkles, Trash2, MousePointer2, Copy, Boxes, Image as ImageIcon,
  AlignStartVertical, AlignCenterVertical, AlignEndVertical,
  AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal,
  AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter, Crown,
  ArrowLeftRight, ArrowUpDown, RotateCcw, RotateCw, Home,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useDesign } from '../store/designStore';
import { FLOOR_MATERIALS, FLOOR_BY_ID, OUTDOOR_MATERIALS, OUTDOOR_BY_ID, CATALOG_BY_TYPE, FURNITURE_CATALOG } from '../data/furnitureCatalog';
import { requirePro } from '../lib/pro';
import { useProStore } from '../store/proStore';
import { ROOM_STYLES } from '../data/roomStyles';
import { floorThumbnail, prepareTextureImage, ROOF_COVERINGS } from '../lib/textures';
import { toast } from '../lib/ui';
import { dist, polygonArea } from '../lib/geometry';
import { formatLength, formatArea } from '../lib/units';
import { finishForFace, withFaceFinish } from '../lib/wallFaces';
import { useI18n } from '../lib/i18n';
import { roofOf } from '../lib/roof';
import { roofFootprint, roofNeedsFallback } from '../lib/roofGeometry';
import {
  structuralWalls, isFence, isHalfWall, FENCE_HEIGHTS, DEFAULT_FENCE_STYLE, HALF_WALL_HEIGHT,
} from '../lib/fence';
import type { CustomTexture, FenceStyle, OpeningStyle, RoofType, Room, Wall } from '../types';

import { MATERIAL_GROUPS, floorMaterials, wallMaterials, materialUrl, WALL_PAINTS } from '../data/materials';

// Kitchen-run slot types: a selected unit can be swapped between these in place
// (cabinet ↔ appliance) while keeping its slot footprint and facing.
const KITCHEN_SLOTS: { type: string; label: string }[] = [
  { type: 'kitchen_base_cabinet', label: 'Cabinet' },
  { type: 'kitchen_drawer_cabinet', label: 'Drawers' },
  { type: 'stove', label: 'Stove' },
  { type: 'kitchen_sink', label: 'Sink' },
  { type: 'dishwasher', label: 'Dishwasher' },
];
const KITCHEN_SLOT_TYPES = new Set(KITCHEN_SLOTS.map((k) => k.type));

// Opening styles whose catalog entry is Pro — derived from the catalog's
// `pro` flags so the Style dropdown gate can never drift from it.
const PRO_OPENING_STYLES = new Set(
  FURNITURE_CATALOG.filter((e) => e.pro && e.opening?.style).map(
    (e) => `${e.opening!.kind}:${e.opening!.style}`,
  ),
);
const isProStyle = (kind: 'door' | 'window', style: OpeningStyle) =>
  PRO_OPENING_STYLES.has(`${kind}:${style}`);

/**
 * Turns a room polygon into an outdoor surface — a patio, deck, driveway, path
 * or lawn — and picks its material.
 *
 * Deliberately the same `Room` primitive rather than a new site type: drawing,
 * editing, area, 2D rendering and deletion all come for free. The only
 * difference is in how it renders (on the ground, no slab beneath, no ceiling
 * above) and which materials it offers. Surfaces are generated procedurally, so
 * this adds no APK weight.
 */
function OutdoorCard({ room }: { room: Room }) {
  const t = useI18n();
  const updateRoom = useDesign((st) => st.updateRoom);

  const setOutdoor = (on: boolean) => {
    // A patio labelled "Room 4" on the plan reads as a mistake. Rename only
    // while the room still carries its auto-generated name — anything the user
    // has actually named is theirs and must survive the toggle.
    const auto = /^Room(\s+\d+)?$/.test(room.name.trim());
    updateRoom(room.id, {
      outdoor: on || undefined,
      ...(auto ? { name: on ? t('Terrace') : 'Room' } : {}),
      // Moving in or out of doors makes the old material meaningless, so swap to
      // a sensible default for the new mode rather than leaving oak decking or
      // asphalt carpet behind.
      floorMaterial: on ? 'out_paving' : 'oak',
      texture: undefined,
      color: on ? OUTDOOR_BY_ID.out_paving.color : FLOOR_BY_ID.oak.color,
    });
  };

  return (
    <div className="prop-card">
      <div className="prop-title">{t('Outdoor surface')}</div>
      <p className="prop-hint">
        {t('Turn this area into a patio, deck, driveway or path. It sits on the ground with no ceiling above it.')}
      </p>
      <label className="toggle-row">
        <input type="checkbox" checked={!!room.outdoor} onChange={(e) => setOutdoor(e.target.checked)} />
        <span>{t('Outdoor area')}</span>
      </label>
      {room.outdoor && (
        <div className="swatches" style={{ marginTop: 10 }}>
          {OUTDOOR_MATERIALS.map((m) => (
            <button
              key={m.id}
              className={`swatch ${room.floorMaterial === m.id ? 'active' : ''}`}
              style={{ background: m.color }}
              data-tip={t(m.name)} aria-label={t(m.name)}
              onClick={() => updateRoom(room.id, { floorMaterial: m.id, color: m.color, texture: undefined })}
            >
              <span className="sw-name">{t(m.name)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const FENCE_STYLES: { id: FenceStyle; name: string }[] = [
  { id: 'picket', name: 'Picket' },
  { id: 'privacy', name: 'Privacy' },
  { id: 'rail', name: 'Post and rail' },
  { id: 'railing', name: 'Railing' },
];

/** Make a selected structural wall low without inventing a second geometry
 * system. The optional flag gives rendering/UI the one semantic distinction
 * that raw height cannot: a deliberate pony wall should not dollhouse-fade. */
function HalfWallCard({ wall }: { wall: Wall }) {
  const t = useI18n();
  const updateWall = useDesign((st) => st.updateWall);
  const defaultWallHeight = useDesign((st) => st.defaultWallHeight);
  const openingCount = useDesign((st) => st.openings.filter((o) => o.wallId === wall.id).length);
  const half = isHalfWall(wall);
  const blocked = openingCount > 0 && !half;

  const setHalf = (on: boolean) => {
    if (!on) {
      updateWall(wall.id, { halfWall: undefined, height: defaultWallHeight });
      return;
    }
    if (openingCount > 0) {
      toast.info(t('Remove doors or windows before changing this wall.'));
      return;
    }
    updateWall(wall.id, {
      halfWall: true,
      kind: undefined,
      fenceStyle: undefined,
      height: HALF_WALL_HEIGHT,
    });
  };

  return (
    <div className="prop-card">
      <div className="prop-title">{t('Half wall / pony wall')}</div>
      <p className="prop-hint">
        {t('Use a low structural wall for kitchen dividers, stair guards and open-plan partitions.')}
      </p>
      <label className={`toggle-row${blocked ? ' disabled' : ''}`}>
        <input
          type="checkbox"
          checked={half}
          disabled={blocked}
          onChange={(e) => setHalf(e.target.checked)}
        />
        <span>{t('Half wall')}</span>
      </label>
      {blocked && <p className="prop-hint">{t('Remove doors or windows before changing this wall.')}</p>}
    </div>
  );
}

/**
 * Turn a wall into a boundary run — a garden fence or a deck railing.
 *
 * This is a flag on the wall rather than a new object type, so everything that
 * already works on walls (drawing, snapping, dragging corners, gates as
 * openings) works on a fence for free. What the flag changes is that a fence
 * never encloses a room, never carries a roof and is never clad.
 */
function FenceCard({ wall }: { wall: Wall }) {
  const t = useI18n();
  const updateWall = useDesign((st) => st.updateWall);
  const fence = isFence(wall);

  const setFence = (on: boolean) => {
    if (!on) {
      updateWall(wall.id, { kind: undefined, fenceStyle: undefined, halfWall: undefined, height: 270, thickness: 10 });
      return;
    }
    const style = wall.fenceStyle ?? DEFAULT_FENCE_STYLE;
    // A 270cm picket fence looks absurd, so adopt the height the chosen style is
    // actually built at rather than keeping the wall's.
    updateWall(wall.id, { kind: 'fence', fenceStyle: style, halfWall: undefined, height: FENCE_HEIGHTS[style] });
  };

  const setStyle = (style: FenceStyle) => {
    // Only follow the style's height while the wall is still at the previous
    // style's default — once someone has set their own height, keep it.
    const prev = FENCE_HEIGHTS[wall.fenceStyle ?? DEFAULT_FENCE_STYLE];
    const keep = Math.abs(wall.height - prev) > 0.5;
    updateWall(wall.id, { fenceStyle: style, height: keep ? wall.height : FENCE_HEIGHTS[style] });
  };

  return (
    <div className="prop-card">
      <div className="prop-title">{t('Fence or railing')}</div>
      <p className="prop-hint">
        {t('Make this a garden fence, boundary or deck railing instead of a wall. It gets no roof and never encloses a room.')}
      </p>
      <label className="toggle-row">
        <input type="checkbox" checked={fence} onChange={(e) => setFence(e.target.checked)} />
        <span>{t('Fence')}</span>
      </label>
      {fence && (
        <div className="seg" style={{ marginTop: 10, flexWrap: 'wrap' }}>
          {FENCE_STYLES.map((f) => (
            <button
              key={f.id}
              className={(wall.fenceStyle ?? DEFAULT_FENCE_STYLE) === f.id ? 'active' : ''}
              onClick={() => setStyle(f.id)}
            >
              {t(f.name)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Whole-plan orientation. A tester asked "is there a way to rotate the full
 * floor plan?" — there wasn't. Like "Detect rooms" and "Exterior" this acts on
 * the design rather than a selection, so it lives in the no-selection state.
 * Rotation turns every storey about one shared pivot, so a stack stays aligned.
 */
function PlanCard() {
  const t = useI18n();
  const rotateDesign = useDesign((st) => st.rotateDesign);
  const wallCount = useDesign((st) => st.walls.length);
  const roomCount = useDesign((st) => st.rooms.length);
  const furnCount = useDesign((st) => st.furniture.length);
  if (!wallCount && !roomCount && !furnCount) return null;

  return (
    <div className="props" style={{ paddingTop: 0 }}>
      <div className="prop-card">
        <div className="prop-title">{t('Plan')}</div>
        <p className="prop-hint">{t('Turn the whole plan — every storey rotates together.')}</p>
        <div className="prop-row">
          <label>{t('Rotate')}</label>
          <div className="align-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
            <button data-tip={t('Rotate 90° left')} aria-label={t('Rotate 90° left')} onClick={() => rotateDesign(-90)}>
              <RotateCcw className="icon" />
            </button>
            <button data-tip={t('Rotate 90° right')} aria-label={t('Rotate 90° right')} onClick={() => rotateDesign(90)}>
              <RotateCw className="icon" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * One-tap exterior cladding. Painting an outside wall face already works via the
 * 3D paint popover, but it is effectively unreachable: dollhouse mode is on by
 * default and faded walls ignore taps, so the faces you can see from outside are
 * exactly the ones that won't respond. This finishes every outward-facing face in
 * a single undoable commit, using materials already bundled with the app.
 */
function ExteriorCard() {
  const t = useI18n();
  const apply = useDesign((st) => st.applyExteriorFinish);
  const wallCount = useDesign((st) => st.walls.length);
  if (!wallCount) return null;

  const items = wallMaterials().filter((m) =>
    ['Brick', 'Plaster', 'Concrete', 'Wood'].includes(m.group),
  );

  const run = (color: string, texture?: CustomTexture) => {
    const n = apply(color, texture);
    if (n === 0) toast.info(t('No outside wall faces found — draw the outer walls first.'));
    else toast.success(`${t('Exterior applied to')} ${n} ${n > 1 ? t('faces') : t('face')}`);
  };

  return (
    <div className="props" style={{ paddingTop: 0 }}>
      <div className="prop-card">
        <div className="prop-title">{t('Exterior')}</div>
        <p className="prop-hint">{t('Clad every outside wall face in one go.')}</p>
        <div className="pp-swatches">
          {WALL_PAINTS.slice(0, 6).map((c) => (
            <button
              key={c}
              className="pp-swatch"
              style={{ background: c }}
              data-tip={c} aria-label={c}
              onClick={() => run(c, undefined)}
            />
          ))}
          {items.map((m) => {
            const src = materialUrl(m.id);
            return (
              <button
                key={m.id}
                className="pp-swatch"
                style={{ backgroundImage: `url(${src})`, backgroundSize: 'cover' }}
                data-tip={t(m.name)} aria-label={t(m.name)}
                onClick={() =>
                  run(m.color, { src, scaleCm: m.scaleCm, roughness: m.roughness, metalness: m.metalness })
                }
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

const ROOF_TYPES: { id: RoofType; label: string }[] = [
  { id: 'gable', label: 'Gable' },
  { id: 'hip', label: 'Hip' },
  { id: 'shed', label: 'Shed' },
  { id: 'flat', label: 'Flat' },
];

/**
 * Roof controls. The roof is generated from the wall outline rather than drawn,
 * so there is nothing to select — it belongs in the no-selection state alongside
 * "Detect rooms" and "Exterior".
 */
function RoofCard() {
  const t = useI18n();
  const floors = useDesign((st) => st.floors);
  const walls = useDesign((st) => st.walls);
  const setRoof = useDesign((st) => st.setRoof);
  const units = useDesign((st) => st.units);
  const roof = roofOf(floors);

  // Warn before the render silently disagrees with the picker: a markedly
  // non-rectangular plan can only take a flat roof in this version.
  const nonRect = useMemo(() => {
    const outline = roofFootprint(structuralWalls(walls), roof?.overhang ?? 0);
    return !!outline && roofNeedsFallback(outline);
  }, [walls, roof?.overhang]);

  if (!walls.length) return null;

  if (!roof) {
    return (
      <div className="props" style={{ paddingTop: 0 }}>
        <div className="prop-card">
          <div className="prop-title">{t('Roof')}</div>
          <p className="prop-hint">{t('Cover the building with a roof, built from your outer walls.')}</p>
          <button className="btn block" onClick={() => setRoof({})}>
            <Home className="icon" /> {t('Add roof')}
          </button>
        </div>
      </div>
    );
  }

  const pitched = roof.type !== 'flat';
  return (
    <div className="props" style={{ paddingTop: 0 }}>
      <div className="prop-card">
        <div className="prop-title">{t('Roof')}</div>
        <div className="swap-chips" style={{ marginBottom: 12 }}>
          {ROOF_TYPES.map((r) => (
            <button
              key={r.id}
              className={`swap-chip${roof.type === r.id ? ' on' : ''}`}
              onClick={() => setRoof({ type: r.id })}
            >
              {t(r.label)}
            </button>
          ))}
        </div>
        {nonRect && (roof.type === 'gable' || roof.type === 'hip') && (
          <p className="prop-hint">
            {t('This footprint is not rectangular enough for a pitched roof, so a flat roof is drawn instead.')}
          </p>
        )}
        {pitched && (
          <div className="prop-row">
            <label>{t('Pitch')}</label>
            <input
              type="range"
              min={5}
              max={60}
              step={1}
              value={roof.pitch}
              onChange={(e) => setRoof({ pitch: Number(e.target.value) })}
            />
            <span className="field-val">{roof.pitch}°</span>
          </div>
        )}
        <div className="prop-row">
          <label>{t('Overhang')}</label>
          <input
            type="range"
            min={0}
            max={120}
            step={5}
            value={roof.overhang}
            onChange={(e) => setRoof({ overhang: Number(e.target.value) })}
          />
          <span className="field-val">{formatLength(roof.overhang, units)}</span>
        </div>
        <div className="prop-label">{t('Covering')}</div>
        <div className="pp-swatches">
          {ROOF_COVERINGS.map((c) => (
            <button
              key={`${c.kind}-${c.color}`}
              className={`pp-swatch${roof.covering === c.kind && roof.color === c.color ? ' on' : ''}`}
              style={{ background: c.color }}
              data-tip={t(c.name)} aria-label={t(c.name)}
              onClick={() => setRoof({ covering: c.kind, color: c.color, coveringScaleCm: c.scaleCm })}
            />
          ))}
        </div>
        <button className="btn-danger block" style={{ marginTop: 12 }} onClick={() => setRoof(null)}>
          <Trash2 className="icon" /> {t('Remove roof')}
        </button>
      </div>
    </div>
  );
}

export default function PropertiesPanel({ open = false }: { open?: boolean }) {
  const s = useDesign(useShallow((st) => ({
    selection: st.selection,
    selectedIds: st.selectedIds,
    walls: st.walls,
    rooms: st.rooms,
    furniture: st.furniture,
    openings: st.openings,
    background: st.background,
    units: st.units,
    alignSelected: st.alignSelected,
    applyRoomStyle: st.applyRoomStyle,
    distributeSelected: st.distributeSelected,
    duplicateSelection: st.duplicateSelection,
    deleteSelected: st.deleteSelected,
    detectRoomsFromWalls: st.detectRoomsFromWalls,
    deleteById: st.deleteById,
    setBackground: st.setBackground,
    updateBackground: st.updateBackground,
    updateFurniture: st.updateFurniture,
    swapFurnitureType: st.swapFurnitureType,
    updateOpening: st.updateOpening,
    updateRoom: st.updateRoom,
    updateWall: st.updateWall,
  })));
  const t = useI18n();
  const isPro = useProStore((st) => st.isPro);
  // Crown marker inside <option> text (options can't render components).
  const proMark = (kind: 'door' | 'window', style: OpeningStyle) =>
    !isPro && isProStyle(kind, style) ? ' 👑' : '';
  const { selection } = s;

  const multi = s.selectedIds.length > 1;
  const wall = !multi && selection.kind === 'wall' ? s.walls.find((w) => w.id === selection.id) : null;
  const room = !multi && selection.kind === 'room' ? s.rooms.find((r) => r.id === selection.id) : null;
  const item = !multi && selection.kind === 'furniture' ? s.furniture.find((f) => f.id === selection.id) : null;
  const opening = !multi && selection.kind === 'opening' ? s.openings.find((o) => o.id === selection.id) : null;
  // Opening offset is a 0..1 fraction; show/edit its position in cm via the wall length.
  const openingWall = opening ? s.walls.find((w) => w.id === opening.wallId) : null;
  const openingWallLen = openingWall ? dist(openingWall.start, openingWall.end) : 0;
  const selectedWallFace = selection.kind === 'wall' ? selection.wallFace : undefined;
  const wallFaceFinish = wall ? finishForFace(wall, selectedWallFace) : undefined;
  const displayedWallColor = wallFaceFinish?.color ?? wall?.color ?? '#ffffff';
  const displayedWallTexture = wallFaceFinish?.texture ?? wall?.texture;
  const paintSelectedWall = (color: string, texture?: CustomTexture) => {
    if (!wall) return;
    if (selectedWallFace) {
      s.updateWall(wall.id, {
        faceFinishes: withFaceFinish(wall, selectedWallFace, { color, texture }),
      });
    } else {
      s.updateWall(wall.id, { color, texture });
    }
  };

  return (
    <aside className={`sidebar right ${open ? 'open' : ''}`}>
      <div className="sidebar-head">
        <SlidersHorizontal className="icon" /> {t('Properties')}
      </div>
      <div className="sidebar-scroll">
        {multi && (
          <div className="props">
            <div className="prop-card" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Boxes className="icon" style={{ color: 'var(--brand)' }} />
              <strong>{s.selectedIds.length} {t('objects selected')}</strong>
            </div>
            <div className="prop-card">
              <div className="prop-label">{t('Align')}</div>
              <div className="align-grid">
                <button data-tip={t('Align left')} aria-label={t('Align left')} onClick={() => s.alignSelected('left')}><AlignStartVertical className="icon" /></button>
                <button data-tip={t('Align horizontal centres')} aria-label={t('Align horizontal centres')} onClick={() => s.alignSelected('hcenter')}><AlignCenterVertical className="icon" /></button>
                <button data-tip={t('Align right')} aria-label={t('Align right')} onClick={() => s.alignSelected('right')}><AlignEndVertical className="icon" /></button>
                <button data-tip={t('Align top')} aria-label={t('Align top')} onClick={() => s.alignSelected('top')}><AlignStartHorizontal className="icon" /></button>
                <button data-tip={t('Align vertical centres')} aria-label={t('Align vertical centres')} onClick={() => s.alignSelected('vmiddle')}><AlignCenterHorizontal className="icon" /></button>
                <button data-tip={t('Align bottom')} aria-label={t('Align bottom')} onClick={() => s.alignSelected('bottom')}><AlignEndHorizontal className="icon" /></button>
              </div>
              <div className="prop-label" style={{ marginTop: 10 }}>{t('Distribute (3+)')}</div>
              <div className="align-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <button
                  data-tip={t('Distribute horizontally')} aria-label={t('Distribute horizontally')}
                  disabled={s.selectedIds.length < 3}
                  onClick={() => s.distributeSelected('h')}
                >
                  <AlignHorizontalDistributeCenter className="icon" />
                </button>
                <button
                  data-tip={t('Distribute vertically')} aria-label={t('Distribute vertically')}
                  disabled={s.selectedIds.length < 3}
                  onClick={() => s.distributeSelected('v')}
                >
                  <AlignVerticalDistributeCenter className="icon" />
                </button>
              </div>
            </div>
            <button className="btn block" style={{ marginBottom: 8 }} onClick={() => s.duplicateSelection()}>
              <Copy className="icon" /> {t('Duplicate')}
            </button>
            <button className="btn-danger" onClick={() => s.deleteSelected()}>
              <Trash2 className="icon" /> {t('Delete')} {s.selectedIds.length} {t('objects')}
            </button>
          </div>
        )}

        {!multi && !selection.id && (
          <>
            {s.walls.length > 0 && s.rooms.length === 0 && <div className="props" style={{ paddingBottom: 4 }}>
              <button
                className="btn block"
                onClick={() => {
                  const n = s.detectRoomsFromWalls();
                  if (n === 0) toast.info(t('No new enclosed rooms found — make sure walls form closed loops.'));
                  else toast.success(`${t('Added')} ${n} ${n > 1 ? t('rooms') : t('room')}`);
                }}
              >
                <Sparkles className="icon" /> {t('Auto-detect rooms')}
              </button>
            </div>}
            <PlanCard />
            <ExteriorCard />
            <RoofCard />
            {s.background ? (
              <BackgroundProps />
            ) : (
              <div className="empty-state">
                <div className="es-icon">
                  <MousePointer2 className="icon" />
                </div>
                <h3>{t('Nothing selected')}</h3>
                <p>{t('Pick a wall, room or object to edit it. Or import a plan, then auto-detect rooms and start decorating.')}</p>
              </div>
            )}
          </>
        )}

        {wall && (
          <div className="props">
            <div className="prop-card">
              <div className="prop-row">
                <label>{t('Length')}</label>
                <span className="field-val">{formatLength(dist(wall.start, wall.end), s.units)}</span>
              </div>
              <NumberRow label={t('Thickness (cm)')} value={wall.thickness} min={4} max={50}
                onChange={(v) => s.updateWall(wall.id, { thickness: v })} />
              {/* A fence can legitimately be knee-high (a railing) or head-high
                  (a privacy screen), so it does not share the wall's 100cm floor. */}
              <NumberRow label={t('Height (cm)')} value={wall.height} min={isFence(wall) ? 40 : isHalfWall(wall) ? 60 : 100} max={isHalfWall(wall) ? 200 : 400}
                onChange={(v) => s.updateWall(wall.id, { height: v })} />
            </div>
            <HalfWallCard wall={wall} />
            <FenceCard wall={wall} />
            <div className="prop-card">
              <div className="prop-label">{selectedWallFace ? t('Wall section paint') : t('Wall paint')}</div>
              <div className="paint-row">
                {WALL_PAINTS.map((c) => (
                  <button
                    key={c}
                    className={`paint-dot ${!displayedWallTexture && displayedWallColor.toLowerCase() === c.toLowerCase() ? 'active' : ''}`}
                    style={{ background: c }}
                    data-tip={c} aria-label={c}
                    onClick={() => paintSelectedWall(c, undefined)}
                  />
                ))}
                <label className="paint-dot" style={{ background: displayedWallColor, display: 'grid', placeItems: 'center', cursor: 'pointer' }} data-tip={t('Custom color')} aria-label={t('Custom color')}>
                  <input type="color" value={displayedWallColor} onChange={(e) => paintSelectedWall(e.target.value, undefined)} style={{ opacity: 0, width: 0, height: 0 }} />
                </label>
              </div>
              <button className="btn block" style={{ marginTop: 12, height: 36 }}
                onClick={() => { for (const w of s.walls) s.updateWall(w.id, { color: displayedWallColor, texture: undefined, faceFinishes: undefined }); }}>
                {t('Apply to all walls')}
              </button>
              {MATERIAL_GROUPS.map((g) => {
                const items = wallMaterials().filter((m) => m.group === g);
                if (!items.length) return null;
                return (
                  <div key={g}>
                    <div className="mat-group-title">{t(g)}</div>
                    <div className="swatches">
                      {items.map((m) => {
                        const src = materialUrl(m.id);
                        return (
                          <button
                            key={m.id}
                            className={`swatch ${displayedWallTexture?.src === src ? 'active' : ''}`}
                            style={{ backgroundImage: `url(${src})` }}
                            onClick={() => paintSelectedWall(displayedWallColor, { src, scaleCm: m.scaleCm, roughness: m.roughness, metalness: m.metalness })}
                            data-tip={t(m.name)} aria-label={t(m.name)}
                          >
                            <span className="sw-name">{t(m.name)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            <TextureCard
              label={t('Custom paint image')}
              texture={displayedWallTexture}
              defaultScale={100}
              onChange={(t) => paintSelectedWall(displayedWallColor, t)}
              onApplyAll={(t) => { for (const w of s.walls) s.updateWall(w.id, { texture: t, faceFinishes: undefined }); }}
              applyAllLabel={t('Apply to all walls')}
            />
            <button className="btn-danger" onClick={() => s.deleteById('wall', wall.id)}>
              <Trash2 className="icon" /> {t('Delete wall')}
            </button>
          </div>
        )}

        {room && (
          <div className="props">
            <div className="prop-card">
              <div className="prop-row">
                <label>{t('Name')}</label>
                <input type="text" value={t(room.name)} onChange={(e) => s.updateRoom(room.id, { name: e.target.value })} />
              </div>
              <div className="prop-row">
                <label>{t('Floor area')}</label>
                <span className="field-val">{formatArea(polygonArea(room.points), s.units)}</span>
              </div>
            </div>
            <OutdoorCard room={room} />
            {!room.outdoor && <StyleCard roomId={room.id} />}
            {!room.outdoor && (
            <div className="prop-card">
              <div className="prop-label">{t('Flooring')}</div>
              <div className="mat-group-title">{t('Basic')}</div>
              <div className="swatches">
                {FLOOR_MATERIALS.map((m) => (
                  <button
                    key={m.id}
                    className={`swatch ${!room.texture && room.floorMaterial === m.id ? 'active' : ''}`}
                    style={{ backgroundImage: `url(${floorThumbnail(m.kind, m.color)})` }}
                    onClick={() => s.updateRoom(room.id, { floorMaterial: m.id, texture: undefined })}
                    data-tip={t(m.name)} aria-label={t(m.name)}
                  >
                    <span className="sw-name">{t(m.name)}</span>
                  </button>
                ))}
              </div>
              {MATERIAL_GROUPS.map((g) => {
                const items = floorMaterials().filter((m) => m.group === g);
                if (!items.length) return null;
                return (
                  <div key={g}>
                    <div className="mat-group-title">{t(g)}</div>
                    <div className="swatches">
                      {items.map((m) => {
                        const src = materialUrl(m.id);
                        return (
                          <button
                            key={m.id}
                            className={`swatch ${room.texture?.src === src ? 'active' : ''}`}
                            style={{ backgroundImage: `url(${src})` }}
                            onClick={() => s.updateRoom(room.id, { floorMaterial: '', color: m.color, texture: { src, scaleCm: m.scaleCm, roughness: m.roughness, metalness: m.metalness } })}
                            data-tip={t(m.name)} aria-label={t(m.name)}
                          >
                            <span className="sw-name">{t(m.name)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            )}
            {!room.outdoor && (
            <TextureCard
              label={t('Custom floor image')}
              texture={room.texture}
              defaultScale={60}
              onChange={(t) => s.updateRoom(room.id, { texture: t })}
              onApplyAll={(t) => { for (const r of s.rooms) s.updateRoom(r.id, { texture: t }); }}
              applyAllLabel={t('Apply to all rooms')}
            />
            )}
            <button className="btn-danger" onClick={() => s.deleteById('room', room.id)}>
              <Trash2 className="icon" /> {t('Delete room')}
            </button>
          </div>
        )}

        {item && (
          <div className="props">
            <div className="prop-card">
              <div className="prop-row">
                <label>{t('Name')}</label>
                <input type="text" value={t(item.name)} onChange={(e) => s.updateFurniture(item.id, { name: e.target.value })} />
              </div>
              <NumberRow label={t('Width (cm)')} value={item.width} min={10} max={500} onChange={(v) => s.updateFurniture(item.id, { width: v })} />
              <NumberRow label={t('Depth (cm)')} value={item.depth} min={10} max={500} onChange={(v) => s.updateFurniture(item.id, { depth: v })} />
              <NumberRow label={t('Height (cm)')} value={item.height} min={1} max={300} onChange={(v) => s.updateFurniture(item.id, { height: v })} />
            </div>
            <div className="prop-card">
              <div className="prop-row">
                <label>{t('Rotation')}</label>
                <input type="range" min={0} max={360} step={5} value={item.rotation}
                  onChange={(e) => s.updateFurniture(item.id, { rotation: Number(e.target.value) })} />
              </div>
              {/* Exact angle entry (tester ask): the slider is coarse on small
                  phones — Blender-style numeric input for precise rotations. */}
              <NumberRow label={t('Angle (°)')} value={item.rotation} min={0} max={360}
                onChange={(v) => s.updateFurniture(item.id, { rotation: v })} />
              <div className="quick-transform" role="group" aria-label={t('Quick direction controls')}>
                <button
                  onClick={() => s.updateFurniture(item.id, { rotation: (item.rotation + 270) % 360 })}
                  aria-label={t('Rotate left 90 degrees')}
                  data-tip={t('Rotate left 90 degrees')}
                >
                  <RotateCcw className="icon" /> <span>90°</span>
                </button>
                {item.type === 'stairs' && (
                  <button
                    className="wide"
                    onClick={() => s.updateFurniture(item.id, { rotation: (item.rotation + 180) % 360 })}
                    aria-label={t('Reverse stairs')}
                    data-tip={t('Reverse stairs')}
                  >
                    <ArrowUpDown className="icon" /> <span>{t('Reverse')}</span>
                  </button>
                )}
                <button
                  onClick={() => s.updateFurniture(item.id, { rotation: (item.rotation + 90) % 360 })}
                  aria-label={t('Rotate right 90 degrees')}
                  data-tip={t('Rotate right 90 degrees')}
                >
                  <RotateCw className="icon" /> <span>90°</span>
                </button>
              </div>
              <div className="prop-row">
                <label>{t('Colour')}</label>
                <input type="color" value={item.color} onChange={(e) => s.updateFurniture(item.id, { color: e.target.value })} />
              </div>
            </div>
            {KITCHEN_SLOT_TYPES.has(item.type) && (
              <div className="prop-card">
                <div className="prop-label">{t('Kitchen unit')}</div>
                <div className="swap-chips">
                  {KITCHEN_SLOTS.map((k) => {
                    const gated = !isPro && !!CATALOG_BY_TYPE[k.type]?.pro;
                    return (
                      <button
                        key={k.type}
                        className={`swap-chip ${item.type === k.type ? 'on' : ''}`}
                        onClick={() => {
                          // Pro appliances stay behind the same gate as the catalog.
                          if (gated && !requirePro('catalog')) return;
                          s.swapFurnitureType(item.id, k.type);
                        }}
                      >
                        {t(k.label)}
                        {gated && <Crown className="icon pro-pill" style={{ width: 11, height: 11 }} />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <button className="btn-danger" onClick={() => s.deleteById('furniture', item.id)}>
              <Trash2 className="icon" /> {t('Delete object')}
            </button>
          </div>
        )}

        {opening && (
          <div className="props">
            <div className="prop-card">
              <div className="prop-row">
                <label>{t('Type')}</label>
                <select
                  value={opening.type}
                  onChange={(e) => {
                    const type = e.target.value as 'door' | 'window';
                    s.updateOpening(opening.id, {
                      type,
                      style: type === 'door' ? 'single' : 'standard',
                      sill: type === 'door' ? 0 : 90,
                      height: type === 'door' ? 205 : 120,
                    });
                  }}
                >
                  <option value="door">{t('Door')}</option>
                  <option value="window">{t('Window')}</option>
                </select>
              </div>
              <div className="prop-row">
                <label>{t('Style')}</label>
                {opening.type === 'door' ? (
                  <select
                    value={opening.style ?? 'single'}
                    onChange={(e) => {
                      const style = e.target.value as OpeningStyle;
                      if (isProStyle('door', style) && !requirePro('catalog')) return;
                      s.updateOpening(opening.id, { style });
                    }}
                  >
                    <option value="single">{t('Single')}</option>
                    <option value="double">{t('Double')}{proMark('door', 'double')}</option>
                    <option value="sliding">{t('Sliding')}{proMark('door', 'sliding')}</option>
                    <option value="pocket">{t('Pocket')}{proMark('door', 'pocket')}</option>
                    <option value="bifold">{t('Bi-fold')}{proMark('door', 'bifold')}</option>
                    <option value="passage">{t('Passage (no leaf)')}</option>
                    <option value="arch">{t('Arch (no leaf)')}{proMark('door', 'arch')}</option>
                  </select>
                ) : (
                  <select
                    value={opening.style ?? 'standard'}
                    onChange={(e) => {
                      const style = e.target.value as OpeningStyle;
                      if (isProStyle('window', style) && !requirePro('catalog')) return;
                      s.updateOpening(opening.id, {
                        style,
                        ...(style === 'french' ? { sill: 0, height: 220 } : {}),
                      });
                    }}
                  >
                    <option value="standard">{t('Standard')}</option>
                    <option value="french">{t('French (full height)')}{proMark('window', 'french')}</option>
                    <option value="casement">{t('Casement')}{proMark('window', 'casement')}</option>
                    <option value="sliding">{t('Sliding')}{proMark('window', 'sliding')}</option>
                  </select>
                )}
              </div>
              {opening.type === 'door' && opening.style !== 'passage' && opening.style !== 'arch' && (
                <div className="quick-transform opening-flips" role="group" aria-label={t('Door direction controls')}>
                  <button
                    onClick={() => s.updateOpening(opening.id, { flipHinge: !opening.flipHinge })}
                    aria-label={t('Flip hinge side')}
                    data-tip={t('Flip hinge side')}
                  >
                    <ArrowLeftRight className="icon" /> <span>{t('Hinge')}</span>
                  </button>
                  <button
                    onClick={() => s.updateOpening(opening.id, { flipSwing: !opening.flipSwing })}
                    aria-label={t('Flip swing direction')}
                    data-tip={t('Flip swing direction')}
                  >
                    <ArrowUpDown className="icon" /> <span>{t('In / out')}</span>
                  </button>
                </div>
              )}
              <NumberRow label={t('Width (cm)')} value={opening.width} min={40} max={400} onChange={(v) => s.updateOpening(opening.id, { width: v })} />
              <NumberRow label={t('Height (cm)')} value={opening.height} min={40} max={300} onChange={(v) => s.updateOpening(opening.id, { height: v })} />
              {opening.type === 'window' && (
                <NumberRow label={t('Sill height (cm)')} value={opening.sill} min={0} max={200} onChange={(v) => s.updateOpening(opening.id, { sill: v })} />
              )}
              <NumberRow
                label={t('Position (cm)')}
                value={Math.round(opening.offset * openingWallLen)}
                min={0}
                max={Math.round(openingWallLen)}
                onChange={(v) => openingWallLen > 0 && s.updateOpening(opening.id, { offset: Math.max(0, Math.min(1, v / openingWallLen)) })}
              />
            </div>
            <button className="btn-danger" onClick={() => s.deleteById('opening', opening.id)}>
              <Trash2 className="icon" /> {opening.type === 'door' ? t('Delete door') : t('Delete window')}
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

/** One-tap coordinated looks: wall paint + flooring, per room or whole home. */
function StyleCard({ roomId }: { roomId: string }) {
  const s = useDesign();
  const t = useI18n();
  const [wholeHome, setWholeHome] = useState(false);
  return (
    <div className="prop-card">
      <div className="prop-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {t('Room styles')}
        <label className="style-scope">
          <input type="checkbox" checked={wholeHome} onChange={(e) => setWholeHome(e.target.checked)} />
          {t('Whole home')}
        </label>
      </div>
      <div className="style-grid">
        {ROOM_STYLES.map((st) => {
          const mat = FLOOR_MATERIALS.find((m) => m.id === st.floorMaterial);
          return (
            <button
              key={st.id}
              className="style-chip"
              data-tip={`${t(st.name)} — ${t(mat?.name ?? '')}`} aria-label={`${t(st.name)} — ${t(mat?.name ?? '')}`}
              onClick={() => s.applyRoomStyle(wholeHome ? 'all' : roomId, st.id)}
            >
              <span
                className="style-thumb"
                style={{ backgroundImage: mat ? `url(${floorThumbnail(mat.kind, mat.color)})` : undefined }}
              >
                <span className="style-wall" style={{ background: st.wallColor }} />
              </span>
              <span className="style-name">{t(st.name)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Upload / preview / rescale a user-provided image texture. */
function TextureCard({
  label,
  texture,
  defaultScale,
  onChange,
  onApplyAll,
  applyAllLabel,
}: {
  label: string;
  texture?: CustomTexture;
  defaultScale: number;
  onChange: (texture: CustomTexture | undefined) => void;
  onApplyAll?: (texture: CustomTexture | undefined) => void;
  applyAllLabel?: string;
}) {
  const t = useI18n();
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const { src } = await prepareTextureImage(file);
      onChange({ src, scaleCm: texture?.scaleCm ?? defaultScale });
    } catch {
      toast.error(t("Couldn't load that image."));
    }
  };
  return (
    <div className="prop-card">
      <div className="prop-label">{label}</div>
      {texture ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '64px 1fr', gap: 10, alignItems: 'center', marginBottom: 10 }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: 8,
                border: '1px solid var(--border, #d0d3d8)',
                backgroundImage: `url(${texture.src})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
              aria-label={t('Texture preview')}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label className="btn block" style={{ height: 30, fontSize: 12, cursor: 'pointer' }}>
                <ImageIcon className="icon" /> {t('Replace')}
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => onFile(e.target.files?.[0])} />
              </label>
              <button className="btn block" style={{ height: 30, fontSize: 12 }} onClick={() => onChange(undefined)}>
                {t('Remove')}
              </button>
            </div>
          </div>
          <div className="prop-row" style={{ alignItems: 'center' }}>
            <label style={{ minWidth: 0 }}>{t('Pattern size (cm)')}</label>
            <input
              type="range"
              min={5}
              max={400}
              step={1}
              value={Math.round(texture.scaleCm)}
              onChange={(e) => onChange({ ...texture, scaleCm: Number(e.target.value) })}
            />
          </div>
          <div className="prop-row">
            <label>{t('Real-world tile size')}</label>
            <NumberInput
              value={texture.scaleCm}
              min={5}
              max={400}
              step={1}
              onChange={(v) => onChange({ ...texture, scaleCm: v })}
              ariaLabel={t('Real-world tile size')}
            />
          </div>
          {onApplyAll && (
            <button className="btn block" style={{ marginTop: 8, height: 34 }} onClick={() => onApplyAll(texture)}>
              {applyAllLabel ?? t('Apply everywhere')}
            </button>
          )}
        </>
      ) : (
        <label className="btn primary block" style={{ height: 38, cursor: 'pointer' }}>
          <ImageIcon className="icon" /> {t('Upload image')}
          <input
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => onFile(e.target.files?.[0])}
          />
        </label>
      )}
    </div>
  );
}

/**
 * A number box you can actually retype.
 *
 * Every one of these used to clamp on each keystroke, straight into the store.
 * That makes the field fight you: clearing "250" leaves "", which parses as 0,
 * clamps to the minimum and rewrites the box to "10" with the caret after it —
 * so the next keystroke gives "101", not "1", and reaching 160 means threading
 * a digit into a number the field keeps putting back.
 *
 * Reported by a tester: "Erasing 250 sets the field to 10. I cannot backspace
 * and type 160... let the user put any number in the field, then add
 * constraints upon validation rather than during the typing."
 *
 * So: while focused the box holds exactly what was typed, unclamped, including
 * empty and half-finished states. A value that is ALREADY legal still commits
 * live, because watching the plan resize as you type is most of the point of
 * this panel; only out-of-range and mid-typing states are held back. Blur or
 * Enter clamps and commits; Escape abandons the edit.
 */
function NumberInput({
  value, min, max, step, format = (n: number) => String(Math.round(n)), onChange, ariaLabel,
}: {
  value: number;
  min: number;
  max?: number;
  step?: number;
  format?: (n: number) => string;
  onChange: (v: number) => void;
  ariaLabel?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const clamp = (n: number) => Math.max(min, max === undefined ? n : Math.min(max, n));

  const commit = (raw: string) => {
    setDraft(null);
    const n = Number(raw);
    // An empty or unparseable box reverts to the live value. Snapping it to the
    // minimum instead would silently resize the object the moment someone
    // cleared the field and looked away.
    if (raw.trim() === '' || !Number.isFinite(n)) return;
    onChange(clamp(n));
  };

  return (
    <input
      type="number"
      inputMode="decimal"
      aria-label={ariaLabel}
      value={draft ?? format(value)}
      min={min}
      max={max}
      step={step}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        const n = Number(raw);
        if (raw.trim() !== '' && Number.isFinite(n) && n === clamp(n)) onChange(n);
      }}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          commit(e.currentTarget.value);
          e.currentTarget.blur();
        } else if (e.key === 'Escape') {
          setDraft(null);
          e.currentTarget.blur();
        }
      }}
    />
  );
}

function NumberRow({
  label, value, min, max, onChange,
}: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="prop-row">
      <label>{label}</label>
      <NumberInput value={value} min={min} max={max} onChange={onChange} ariaLabel={label} />
    </div>
  );
}

function BackgroundProps() {
  const s = useDesign();
  const t = useI18n();
  const bg = s.background!;
  return (
    <div className="props">
      <div className="prop-card">
        <div className="prop-label">{t('Imported plan')}</div>
        <div className="prop-row">
          <label>{t('Opacity')}</label>
          <input type="range" min={0.1} max={1} step={0.05} value={bg.opacity}
            onChange={(e) => s.updateBackground({ opacity: Number(e.target.value) })} />
        </div>
        <div className="prop-row">
          <label>{t('Scale (cm/px)')}</label>
          <NumberInput
            value={bg.scale}
            min={0.01}
            step={0.01}
            format={(n) => String(Number(n.toFixed(3)))}
            onChange={(v) => s.updateBackground({ scale: v })}
            ariaLabel={t('Scale (cm/px)')}
          />
        </div>
        <div className="prop-row">
          <label>{t('Rotation')}</label>
          <input type="range" min={0} max={360} step={1} value={bg.rotation}
            onChange={(e) => s.updateBackground({ rotation: Number(e.target.value) })} />
        </div>
      </div>
      <button className="btn-danger" onClick={() => s.setBackground(null)}>
        <Trash2 className="icon" /> {t('Remove background plan')}
      </button>
    </div>
  );
}
