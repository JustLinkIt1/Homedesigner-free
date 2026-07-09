import {
  SlidersHorizontal, Sparkles, Trash2, MousePointer2, Copy, Boxes, Image as ImageIcon,
  AlignStartVertical, AlignCenterVertical, AlignEndVertical,
  AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal,
  AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter,
} from 'lucide-react';
import { useDesign } from '../store/designStore';
import { FLOOR_MATERIALS } from '../data/furnitureCatalog';
import { floorThumbnail, prepareTextureImage } from '../lib/textures';
import { toast } from '../lib/ui';
import { dist, polygonArea } from '../lib/geometry';
import { formatLength, formatArea } from '../lib/units';
import type { CustomTexture } from '../types';

const WALL_PAINTS = [
  '#f5f4f0', '#efe7d6', '#d9d2c5', '#cfd2d4', '#a7b6a0',
  '#8fb0c2', '#384a63', '#c08461', '#cda9a3', '#41454b',
];

export default function PropertiesPanel({ open = false }: { open?: boolean }) {
  const s = useDesign();
  const { selection } = s;

  const multi = s.selectedIds.length > 1;
  const wall = !multi && selection.kind === 'wall' ? s.walls.find((w) => w.id === selection.id) : null;
  const room = !multi && selection.kind === 'room' ? s.rooms.find((r) => r.id === selection.id) : null;
  const item = !multi && selection.kind === 'furniture' ? s.furniture.find((f) => f.id === selection.id) : null;
  const opening = !multi && selection.kind === 'opening' ? s.openings.find((o) => o.id === selection.id) : null;
  // Opening offset is a 0..1 fraction; show/edit its position in cm via the wall length.
  const openingWall = opening ? s.walls.find((w) => w.id === opening.wallId) : null;
  const openingWallLen = openingWall ? dist(openingWall.start, openingWall.end) : 0;

  return (
    <aside className={`sidebar right ${open ? 'open' : ''}`}>
      <div className="sidebar-head">
        <SlidersHorizontal className="icon" /> Properties
      </div>
      <div className="sidebar-scroll">
        {multi && (
          <div className="props">
            <div className="prop-card" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Boxes className="icon" style={{ color: 'var(--brand)' }} />
              <strong>{s.selectedIds.length} objects selected</strong>
            </div>
            <div className="prop-card">
              <div className="prop-label">Align</div>
              <div className="align-grid">
                <button title="Align left" onClick={() => s.alignSelected('left')}><AlignStartVertical className="icon" /></button>
                <button title="Align horizontal centres" onClick={() => s.alignSelected('hcenter')}><AlignCenterVertical className="icon" /></button>
                <button title="Align right" onClick={() => s.alignSelected('right')}><AlignEndVertical className="icon" /></button>
                <button title="Align top" onClick={() => s.alignSelected('top')}><AlignStartHorizontal className="icon" /></button>
                <button title="Align vertical centres" onClick={() => s.alignSelected('vmiddle')}><AlignCenterHorizontal className="icon" /></button>
                <button title="Align bottom" onClick={() => s.alignSelected('bottom')}><AlignEndHorizontal className="icon" /></button>
              </div>
              <div className="prop-label" style={{ marginTop: 10 }}>Distribute (3+)</div>
              <div className="align-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <button
                  title="Distribute horizontally"
                  disabled={s.selectedIds.length < 3}
                  onClick={() => s.distributeSelected('h')}
                >
                  <AlignHorizontalDistributeCenter className="icon" />
                </button>
                <button
                  title="Distribute vertically"
                  disabled={s.selectedIds.length < 3}
                  onClick={() => s.distributeSelected('v')}
                >
                  <AlignVerticalDistributeCenter className="icon" />
                </button>
              </div>
            </div>
            <button className="btn block" style={{ marginBottom: 8 }} onClick={() => s.duplicateSelection()}>
              <Copy className="icon" /> Duplicate
            </button>
            <button className="btn-danger" onClick={() => s.deleteSelected()}>
              <Trash2 className="icon" /> Delete {s.selectedIds.length} objects
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
                  if (n === 0) toast.info('No new enclosed rooms found — make sure walls form closed loops.');
                  else toast.success(`Added ${n} room${n > 1 ? 's' : ''}`);
                }}
              >
                <Sparkles className="icon" /> Auto-detect rooms
              </button>
            </div>
            {s.background ? (
              <BackgroundProps />
            ) : (
              <div className="empty-state">
                <div className="es-icon">
                  <MousePointer2 className="icon" />
                </div>
                <h3>Nothing selected</h3>
                <p>
                  Pick a wall, room or object to edit it. Or import a plan, then
                  auto-detect rooms and start decorating.
                </p>
              </div>
            )}
          </>
        )}

        {wall && (
          <div className="props">
            <div className="prop-card">
              <div className="prop-row">
                <label>Length</label>
                <span className="field-val">{formatLength(dist(wall.start, wall.end), s.units)}</span>
              </div>
              <NumberRow label="Thickness (cm)" value={wall.thickness} min={4} max={50}
                onChange={(v) => s.updateWall(wall.id, { thickness: v })} />
              <NumberRow label="Height (cm)" value={wall.height} min={100} max={400}
                onChange={(v) => s.updateWall(wall.id, { height: v })} />
            </div>
            <div className="prop-card">
              <div className="prop-label">Wall paint</div>
              <div className="paint-row">
                {WALL_PAINTS.map((c) => (
                  <button
                    key={c}
                    className={`paint-dot ${!wall.texture && wall.color.toLowerCase() === c.toLowerCase() ? 'active' : ''}`}
                    style={{ background: c }}
                    title={c}
                    onClick={() => s.updateWall(wall.id, { color: c, texture: undefined })}
                  />
                ))}
                <label className="paint-dot" style={{ background: wall.color, display: 'grid', placeItems: 'center', cursor: 'pointer' }} title="Custom color">
                  <input type="color" value={wall.color} onChange={(e) => s.updateWall(wall.id, { color: e.target.value, texture: undefined })} style={{ opacity: 0, width: 0, height: 0 }} />
                </label>
              </div>
              <button className="btn block" style={{ marginTop: 12, height: 36 }}
                onClick={() => { for (const w of s.walls) s.updateWall(w.id, { color: wall.color, texture: undefined }); }}>
                Apply to all walls
              </button>
            </div>
            <TextureCard
              label="Custom paint image"
              texture={wall.texture}
              defaultScale={100}
              onChange={(t) => s.updateWall(wall.id, { texture: t })}
              onApplyAll={(t) => { for (const w of s.walls) s.updateWall(w.id, { texture: t }); }}
              applyAllLabel="Apply to all walls"
            />
            <button className="btn-danger" onClick={() => s.deleteById('wall', wall.id)}>
              <Trash2 className="icon" /> Delete wall
            </button>
          </div>
        )}

        {room && (
          <div className="props">
            <div className="prop-card">
              <div className="prop-row">
                <label>Name</label>
                <input type="text" value={room.name} onChange={(e) => s.updateRoom(room.id, { name: e.target.value })} />
              </div>
              <div className="prop-row">
                <label>Floor area</label>
                <span className="field-val">{formatArea(polygonArea(room.points), s.units)}</span>
              </div>
            </div>
            <div className="prop-card">
              <div className="prop-label">Flooring</div>
              <div className="swatches">
                {FLOOR_MATERIALS.map((m) => (
                  <button
                    key={m.id}
                    className={`swatch ${!room.texture && room.floorMaterial === m.id ? 'active' : ''}`}
                    style={{ backgroundImage: `url(${floorThumbnail(m.kind, m.color)})` }}
                    onClick={() => s.updateRoom(room.id, { floorMaterial: m.id, texture: undefined })}
                    title={m.name}
                  >
                    <span className="sw-name">{m.name}</span>
                  </button>
                ))}
              </div>
            </div>
            <TextureCard
              label="Custom floor image"
              texture={room.texture}
              defaultScale={60}
              onChange={(t) => s.updateRoom(room.id, { texture: t })}
              onApplyAll={(t) => { for (const r of s.rooms) s.updateRoom(r.id, { texture: t }); }}
              applyAllLabel="Apply to all rooms"
            />
            <button className="btn-danger" onClick={() => s.deleteById('room', room.id)}>
              <Trash2 className="icon" /> Delete room
            </button>
          </div>
        )}

        {item && (
          <div className="props">
            <div className="prop-card">
              <div className="prop-row">
                <label>Name</label>
                <input type="text" value={item.name} onChange={(e) => s.updateFurniture(item.id, { name: e.target.value })} />
              </div>
              <NumberRow label="Width (cm)" value={item.width} min={10} max={500} onChange={(v) => s.updateFurniture(item.id, { width: v })} />
              <NumberRow label="Depth (cm)" value={item.depth} min={10} max={500} onChange={(v) => s.updateFurniture(item.id, { depth: v })} />
              <NumberRow label="Height (cm)" value={item.height} min={1} max={300} onChange={(v) => s.updateFurniture(item.id, { height: v })} />
            </div>
            <div className="prop-card">
              <div className="prop-row">
                <label>Rotation</label>
                <input type="range" min={0} max={360} step={5} value={item.rotation}
                  onChange={(e) => s.updateFurniture(item.id, { rotation: Number(e.target.value) })} />
              </div>
              <div className="prop-row">
                <label>{item.rotation}°</label>
                <input type="color" value={item.color} onChange={(e) => s.updateFurniture(item.id, { color: e.target.value })} />
              </div>
            </div>
            <button className="btn-danger" onClick={() => s.deleteById('furniture', item.id)}>
              <Trash2 className="icon" /> Delete object
            </button>
          </div>
        )}

        {opening && (
          <div className="props">
            <div className="prop-card">
              <div className="prop-row">
                <label>Type</label>
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
                  <option value="door">Door</option>
                  <option value="window">Window</option>
                </select>
              </div>
              <div className="prop-row">
                <label>Style</label>
                {opening.type === 'door' ? (
                  <select
                    value={opening.style ?? 'single'}
                    onChange={(e) => s.updateOpening(opening.id, { style: e.target.value as never })}
                  >
                    <option value="single">Single</option>
                    <option value="double">Double</option>
                    <option value="sliding">Sliding</option>
                    <option value="pocket">Pocket</option>
                    <option value="bifold">Bi-fold</option>
                    <option value="passage">Passage (no leaf)</option>
                    <option value="arch">Arch (no leaf)</option>
                  </select>
                ) : (
                  <select
                    value={opening.style ?? 'standard'}
                    onChange={(e) => {
                      const style = e.target.value as never;
                      s.updateOpening(opening.id, {
                        style,
                        ...(style === 'french' ? { sill: 0, height: 220 } : {}),
                      });
                    }}
                  >
                    <option value="standard">Standard</option>
                    <option value="french">French (full height)</option>
                    <option value="casement">Casement</option>
                    <option value="sliding">Sliding</option>
                  </select>
                )}
              </div>
              <NumberRow label="Width (cm)" value={opening.width} min={40} max={400} onChange={(v) => s.updateOpening(opening.id, { width: v })} />
              <NumberRow label="Height (cm)" value={opening.height} min={40} max={300} onChange={(v) => s.updateOpening(opening.id, { height: v })} />
              {opening.type === 'window' && (
                <NumberRow label="Sill height (cm)" value={opening.sill} min={0} max={200} onChange={(v) => s.updateOpening(opening.id, { sill: v })} />
              )}
              <NumberRow
                label="Position (cm)"
                value={Math.round(opening.offset * openingWallLen)}
                min={0}
                max={Math.round(openingWallLen)}
                onChange={(v) => openingWallLen > 0 && s.updateOpening(opening.id, { offset: Math.max(0, Math.min(1, v / openingWallLen)) })}
              />
            </div>
            <button className="btn-danger" onClick={() => s.deleteById('opening', opening.id)}>
              <Trash2 className="icon" /> Delete {opening.type}
            </button>
          </div>
        )}
      </div>
    </aside>
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
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const { src } = await prepareTextureImage(file);
      onChange({ src, scaleCm: texture?.scaleCm ?? defaultScale });
    } catch {
      toast.error("Couldn't load that image.");
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
              aria-label="Texture preview"
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label className="btn block" style={{ height: 30, fontSize: 12, cursor: 'pointer' }}>
                <ImageIcon className="icon" /> Replace
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => onFile(e.target.files?.[0])} />
              </label>
              <button className="btn block" style={{ height: 30, fontSize: 12 }} onClick={() => onChange(undefined)}>
                Remove
              </button>
            </div>
          </div>
          <div className="prop-row" style={{ alignItems: 'center' }}>
            <label style={{ minWidth: 0 }}>Pattern size (cm)</label>
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
            <label>Real-world tile size</label>
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
              {applyAllLabel ?? 'Apply everywhere'}
            </button>
          )}
        </>
      ) : (
        <label className="btn primary block" style={{ height: 38, cursor: 'pointer' }}>
          <ImageIcon className="icon" /> Upload image
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
  const bg = s.background!;
  return (
    <div className="props">
      <div className="prop-card">
        <div className="prop-label">Imported plan</div>
        <div className="prop-row">
          <label>Opacity</label>
          <input type="range" min={0.1} max={1} step={0.05} value={bg.opacity}
            onChange={(e) => s.updateBackground({ opacity: Number(e.target.value) })} />
        </div>
        <div className="prop-row">
          <label>Scale (cm/px)</label>
          <input type="number" step={0.01} value={Number(bg.scale.toFixed(3))}
            onChange={(e) => s.updateBackground({ scale: Math.max(0.01, Number(e.target.value)) })} />
        </div>
        <div className="prop-row">
          <label>Rotation</label>
          <input type="range" min={0} max={360} step={1} value={bg.rotation}
            onChange={(e) => s.updateBackground({ rotation: Number(e.target.value) })} />
        </div>
      </div>
      <button className="btn-danger" onClick={() => s.setBackground(null)}>
        <Trash2 className="icon" /> Remove background plan
      </button>
    </div>
  );
}
