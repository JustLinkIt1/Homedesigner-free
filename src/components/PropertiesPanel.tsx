import { useDesign } from '../store/designStore';
import { FLOOR_MATERIALS } from '../data/furnitureCatalog';
import { dist, polygonArea } from '../lib/geometry';

export default function PropertiesPanel() {
  const s = useDesign();
  const { selection } = s;

  const wall = selection.kind === 'wall' ? s.walls.find((w) => w.id === selection.id) : null;
  const room = selection.kind === 'room' ? s.rooms.find((r) => r.id === selection.id) : null;
  const item =
    selection.kind === 'furniture' ? s.furniture.find((f) => f.id === selection.id) : null;
  const opening =
    selection.kind === 'opening' ? s.openings.find((o) => o.id === selection.id) : null;

  return (
    <aside className="sidebar right">
      <div className="sidebar-head">Properties</div>
      <div className="sidebar-scroll">
        {!selection.id && (
          <div className="props" style={{ paddingBottom: 4 }}>
            <button
              className="btn primary"
              style={{ width: '100%' }}
              onClick={() => {
                const n = s.detectRoomsFromWalls();
                if (n === 0) alert('No new enclosed rooms found. Make sure walls form closed loops.');
              }}
            >
              ✨ Auto-detect rooms
            </button>
          </div>
        )}

        {!selection.id && !s.background && (
          <div className="empty-hint">
            Select an element to edit it.
            <br />
            <br />
            <strong>Tip:</strong> use <em>Import plan</em> to load a PDF or DXF and auto-trace the
            walls, then <em>Auto-detect rooms</em> to create floors. Add doors &amp; windows from the
            catalog and click a wall to place them.
          </div>
        )}

        {!selection.id && s.background && <BackgroundProps />}

        {wall && (
          <div className="props">
            <div className="prop-row">
              <label>Length</label>
              <span className="field-val">{(dist(wall.start, wall.end) / 100).toFixed(2)} m</span>
            </div>
            <NumberRow
              label="Thickness (cm)"
              value={wall.thickness}
              min={4}
              max={50}
              onChange={(v) => s.updateWall(wall.id, { thickness: v })}
            />
            <NumberRow
              label="Height (cm)"
              value={wall.height}
              min={100}
              max={400}
              onChange={(v) => s.updateWall(wall.id, { height: v })}
            />
            <div className="prop-row">
              <label>Color</label>
              <input
                type="color"
                value={wall.color}
                onChange={(e) => s.updateWall(wall.id, { color: e.target.value })}
              />
            </div>
            <button className="btn-danger" onClick={() => s.deleteById('wall', wall.id)}>
              Delete wall
            </button>
          </div>
        )}

        {room && (
          <div className="props">
            <div className="prop-row">
              <label>Name</label>
              <input
                type="text"
                value={room.name}
                onChange={(e) => s.updateRoom(room.id, { name: e.target.value })}
              />
            </div>
            <div className="prop-row">
              <label>Area</label>
              <span className="field-val">
                {(Math.abs(polygonArea(room.points)) / 10000).toFixed(2)} m²
              </span>
            </div>
            <div style={{ marginBottom: 8 }}>
              <label style={{ fontSize: 12, color: 'var(--text-dim)', fontWeight: 600 }}>
                Floor material
              </label>
            </div>
            <div className="swatches" style={{ marginBottom: 14 }}>
              {FLOOR_MATERIALS.map((m) => (
                <button
                  key={m.id}
                  className={`swatch ${room.floorMaterial === m.id ? 'active' : ''}`}
                  style={{ background: m.color }}
                  onClick={() => s.updateRoom(room.id, { floorMaterial: m.id })}
                  title={m.name}
                >
                  <span className="sw-name">{m.name}</span>
                </button>
              ))}
            </div>
            <button className="btn-danger" onClick={() => s.deleteById('room', room.id)}>
              Delete room
            </button>
          </div>
        )}

        {item && (
          <div className="props">
            <div className="prop-row">
              <label>Name</label>
              <input
                type="text"
                value={item.name}
                onChange={(e) => s.updateFurniture(item.id, { name: e.target.value })}
              />
            </div>
            <NumberRow
              label="Width (cm)"
              value={item.width}
              min={10}
              max={500}
              onChange={(v) => s.updateFurniture(item.id, { width: v })}
            />
            <NumberRow
              label="Depth (cm)"
              value={item.depth}
              min={10}
              max={500}
              onChange={(v) => s.updateFurniture(item.id, { depth: v })}
            />
            <NumberRow
              label="Height (cm)"
              value={item.height}
              min={1}
              max={300}
              onChange={(v) => s.updateFurniture(item.id, { height: v })}
            />
            <div className="prop-row">
              <label>Rotation</label>
              <input
                type="range"
                min={0}
                max={360}
                step={5}
                value={item.rotation}
                onChange={(e) => s.updateFurniture(item.id, { rotation: Number(e.target.value) })}
              />
            </div>
            <div className="prop-row">
              <label>{item.rotation}°</label>
              <input
                type="color"
                value={item.color}
                onChange={(e) => s.updateFurniture(item.id, { color: e.target.value })}
              />
            </div>
            <button className="btn-danger" onClick={() => s.deleteById('furniture', item.id)}>
              Delete object
            </button>
          </div>
        )}

        {opening && (
          <div className="props">
            <div className="prop-row">
              <label>Type</label>
              <select
                value={opening.type}
                onChange={(e) => {
                  const type = e.target.value as 'door' | 'window';
                  s.updateOpening(opening.id, {
                    type,
                    sill: type === 'door' ? 0 : 90,
                    height: type === 'door' ? 205 : 120,
                  });
                }}
              >
                <option value="door">Door</option>
                <option value="window">Window</option>
              </select>
            </div>
            <NumberRow
              label="Width (cm)"
              value={opening.width}
              min={40}
              max={400}
              onChange={(v) => s.updateOpening(opening.id, { width: v })}
            />
            <NumberRow
              label="Height (cm)"
              value={opening.height}
              min={40}
              max={300}
              onChange={(v) => s.updateOpening(opening.id, { height: v })}
            />
            {opening.type === 'window' && (
              <NumberRow
                label="Sill height (cm)"
                value={opening.sill}
                min={0}
                max={200}
                onChange={(v) => s.updateOpening(opening.id, { sill: v })}
              />
            )}
            <NumberRow
              label="Position (cm)"
              value={opening.offset}
              min={0}
              max={2000}
              onChange={(v) => s.updateOpening(opening.id, { offset: v })}
            />
            <button className="btn-danger" onClick={() => s.deleteById('opening', opening.id)}>
              Delete {opening.type}
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
      <div className="empty-hint" style={{ padding: '8px 4px 14px' }}>
        Imported plan loaded. Adjust it below, then trace or refine walls.
      </div>
      <div className="prop-row">
        <label>Opacity</label>
        <input
          type="range"
          min={0.1}
          max={1}
          step={0.05}
          value={bg.opacity}
          onChange={(e) => s.updateBackground({ opacity: Number(e.target.value) })}
        />
      </div>
      <div className="prop-row">
        <label>Scale (cm/px)</label>
        <input
          type="number"
          step={0.01}
          value={Number(bg.scale.toFixed(3))}
          onChange={(e) => s.updateBackground({ scale: Math.max(0.01, Number(e.target.value)) })}
        />
      </div>
      <div className="prop-row">
        <label>Rotation</label>
        <input
          type="range"
          min={0}
          max={360}
          step={1}
          value={bg.rotation}
          onChange={(e) => s.updateBackground({ rotation: Number(e.target.value) })}
        />
      </div>
      <button className="btn-danger" onClick={() => s.setBackground(null)}>
        Remove background plan
      </button>
    </div>
  );
}
