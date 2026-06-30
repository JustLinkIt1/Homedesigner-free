import { SlidersHorizontal, Sparkles, Trash2, MousePointer2, Copy, Boxes } from 'lucide-react';
import { useDesign } from '../store/designStore';
import { FLOOR_MATERIALS } from '../data/furnitureCatalog';
import { floorThumbnail } from '../lib/textures';
import { toast } from '../lib/ui';
import { dist, polygonArea } from '../lib/geometry';
import { formatLength, formatArea } from '../lib/units';

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
                    className={`paint-dot ${wall.color.toLowerCase() === c.toLowerCase() ? 'active' : ''}`}
                    style={{ background: c }}
                    title={c}
                    onClick={() => s.updateWall(wall.id, { color: c })}
                  />
                ))}
                <label className="paint-dot" style={{ background: wall.color, display: 'grid', placeItems: 'center', cursor: 'pointer' }} title="Custom color">
                  <input type="color" value={wall.color} onChange={(e) => s.updateWall(wall.id, { color: e.target.value })} style={{ opacity: 0, width: 0, height: 0 }} />
                </label>
              </div>
              <button className="btn block" style={{ marginTop: 12, height: 36 }}
                onClick={() => { for (const w of s.walls) s.updateWall(w.id, { color: wall.color }); }}>
                Apply to all walls
              </button>
            </div>
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
                    className={`swatch ${room.floorMaterial === m.id ? 'active' : ''}`}
                    style={{ backgroundImage: `url(${floorThumbnail(m.kind, m.color)})` }}
                    onClick={() => s.updateRoom(room.id, { floorMaterial: m.id })}
                    title={m.name}
                  >
                    <span className="sw-name">{m.name}</span>
                  </button>
                ))}
              </div>
            </div>
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
                    s.updateOpening(opening.id, { type, sill: type === 'door' ? 0 : 90, height: type === 'door' ? 205 : 120 });
                  }}
                >
                  <option value="door">Door</option>
                  <option value="window">Window</option>
                </select>
              </div>
              <NumberRow label="Width (cm)" value={opening.width} min={40} max={400} onChange={(v) => s.updateOpening(opening.id, { width: v })} />
              <NumberRow label="Height (cm)" value={opening.height} min={40} max={300} onChange={(v) => s.updateOpening(opening.id, { height: v })} />
              {opening.type === 'window' && (
                <NumberRow label="Sill height (cm)" value={opening.sill} min={0} max={200} onChange={(v) => s.updateOpening(opening.id, { sill: v })} />
              )}
              <NumberRow label="Position (cm)" value={opening.offset} min={0} max={2000} onChange={(v) => s.updateOpening(opening.id, { offset: v })} />
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
