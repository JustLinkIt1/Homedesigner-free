import {
  SlidersHorizontal, Sparkles, Trash2, MousePointer2, Copy, Boxes, Image as ImageIcon,
  AlignStartVertical, AlignCenterVertical, AlignEndVertical,
  AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal,
  AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter, Crown,
  ArrowLeftRight, ArrowUpDown, RotateCcw, RotateCw,
} from 'lucide-react';
import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useDesign } from '../store/designStore';
import { FLOOR_MATERIALS, CATALOG_BY_TYPE, FURNITURE_CATALOG } from '../data/furnitureCatalog';
import { requirePro } from '../lib/pro';
import { useProStore } from '../store/proStore';
import { ROOM_STYLES } from '../data/roomStyles';
import { floorThumbnail, prepareTextureImage } from '../lib/textures';
import { toast } from '../lib/ui';
import { dist, polygonArea } from '../lib/geometry';
import { formatLength, formatArea } from '../lib/units';
import { finishForFace, withFaceFinish } from '../lib/wallFaces';
import { useI18n } from '../lib/i18n';
import type { CustomTexture, OpeningStyle } from '../types';

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
              title={c}
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
                title={t(m.name)}
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
                <button title={t('Align left')} onClick={() => s.alignSelected('left')}><AlignStartVertical className="icon" /></button>
                <button title={t('Align horizontal centres')} onClick={() => s.alignSelected('hcenter')}><AlignCenterVertical className="icon" /></button>
                <button title={t('Align right')} onClick={() => s.alignSelected('right')}><AlignEndVertical className="icon" /></button>
                <button title={t('Align top')} onClick={() => s.alignSelected('top')}><AlignStartHorizontal className="icon" /></button>
                <button title={t('Align vertical centres')} onClick={() => s.alignSelected('vmiddle')}><AlignCenterHorizontal className="icon" /></button>
                <button title={t('Align bottom')} onClick={() => s.alignSelected('bottom')}><AlignEndHorizontal className="icon" /></button>
              </div>
              <div className="prop-label" style={{ marginTop: 10 }}>{t('Distribute (3+)')}</div>
              <div className="align-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <button
                  title={t('Distribute horizontally')}
                  disabled={s.selectedIds.length < 3}
                  onClick={() => s.distributeSelected('h')}
                >
                  <AlignHorizontalDistributeCenter className="icon" />
                </button>
                <button
                  title={t('Distribute vertically')}
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
            <div className="props" style={{ paddingBottom: 4 }}>
              <button
                className="btn primary block"
                onClick={() => {
                  const n = s.detectRoomsFromWalls();
                  if (n === 0) toast.info(t('No new enclosed rooms found — make sure walls form closed loops.'));
                  else toast.success(`${t('Added')} ${n} ${n > 1 ? t('rooms') : t('room')}`);
                }}
              >
                <Sparkles className="icon" /> {t('Auto-detect rooms')}
              </button>
            </div>
            <ExteriorCard />
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
              <NumberRow label={t('Height (cm)')} value={wall.height} min={100} max={400}
                onChange={(v) => s.updateWall(wall.id, { height: v })} />
            </div>
            <div className="prop-card">
              <div className="prop-label">{selectedWallFace ? t('Wall section paint') : t('Wall paint')}</div>
              <div className="paint-row">
                {WALL_PAINTS.map((c) => (
                  <button
                    key={c}
                    className={`paint-dot ${!displayedWallTexture && displayedWallColor.toLowerCase() === c.toLowerCase() ? 'active' : ''}`}
                    style={{ background: c }}
                    title={c}
                    onClick={() => paintSelectedWall(c, undefined)}
                  />
                ))}
                <label className="paint-dot" style={{ background: displayedWallColor, display: 'grid', placeItems: 'center', cursor: 'pointer' }} title={t('Custom color')}>
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
                            title={t(m.name)}
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
            <StyleCard roomId={room.id} />
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
                    title={t(m.name)}
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
                            title={t(m.name)}
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
              label={t('Custom floor image')}
              texture={room.texture}
              defaultScale={60}
              onChange={(t) => s.updateRoom(room.id, { texture: t })}
              onApplyAll={(t) => { for (const r of s.rooms) s.updateRoom(r.id, { texture: t }); }}
              applyAllLabel={t('Apply to all rooms')}
            />
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
                  title={t('Rotate left 90 degrees')}
                >
                  <RotateCcw className="icon" /> <span>90°</span>
                </button>
                {item.type === 'stairs' && (
                  <button
                    className="wide"
                    onClick={() => s.updateFurniture(item.id, { rotation: (item.rotation + 180) % 360 })}
                    aria-label={t('Reverse stairs')}
                    title={t('Reverse stairs')}
                  >
                    <ArrowUpDown className="icon" /> <span>{t('Reverse')}</span>
                  </button>
                )}
                <button
                  onClick={() => s.updateFurniture(item.id, { rotation: (item.rotation + 90) % 360 })}
                  aria-label={t('Rotate right 90 degrees')}
                  title={t('Rotate right 90 degrees')}
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
                    title={t('Flip hinge side')}
                  >
                    <ArrowLeftRight className="icon" /> <span>{t('Hinge')}</span>
                  </button>
                  <button
                    onClick={() => s.updateOpening(opening.id, { flipSwing: !opening.flipSwing })}
                    aria-label={t('Flip swing direction')}
                    title={t('Flip swing direction')}
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
              title={`${t(st.name)} — ${t(mat?.name ?? '')}`}
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
            <input
              type="number"
              min={5}
              max={400}
              step={1}
              value={Math.round(texture.scaleCm)}
              onChange={(e) => onChange({ ...texture, scaleCm: Math.max(5, Math.min(400, Number(e.target.value))) })}
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

function NumberRow({
  label, value, min, max, onChange,
}: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="prop-row">
      <label>{label}</label>
      <input
        type="number"
        value={Math.round(value)}
        min={min}
        max={max}
        onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value))))}
      />
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
          <input type="number" step={0.01} value={Number(bg.scale.toFixed(3))}
            onChange={(e) => s.updateBackground({ scale: Math.max(0.01, Number(e.target.value)) })} />
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
