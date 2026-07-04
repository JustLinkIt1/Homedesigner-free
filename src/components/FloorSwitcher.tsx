import { useState } from 'react';
import { Plus, Layers, X, Crown } from 'lucide-react';
import { useDesign } from '../store/designStore';
import { useProStore } from '../store/proStore';
import { requirePro } from '../lib/pro';
import { confirmDialog, toast } from '../lib/ui';

/**
 * Storey switcher: stacked top→bottom like a building. Click a floor to edit
 * it, "+" to add one above, double-click to rename, × to remove. Shown in both
 * the 2D and 3D views so you can move between levels anywhere.
 */
export default function FloorSwitcher() {
  const floors = useDesign((s) => s.floors);
  const activeFloorId = useDesign((s) => s.activeFloorId);
  const setActiveFloor = useDesign((s) => s.setActiveFloor);
  const addFloor = useDesign((s) => s.addFloor);
  const removeFloor = useDesign((s) => s.removeFloor);
  const renameFloor = useDesign((s) => s.renameFloor);
  const isPro = useProStore((s) => s.isPro);
  const [editing, setEditing] = useState<string | null>(null);

  if (floors.length === 0) return null;
  // Highest storey at the top of the list.
  const ordered = [...floors].sort((a, b) => b.elevation - a.elevation);

  // Gate CREATION of extra storeys only — existing multi-floor designs stay
  // fully switchable/editable/renderable regardless of entitlement.
  const handleAdd = () => {
    if (floors.length >= 1 && !requirePro('multiFloor')) return;
    addFloor();
  };

  return (
    <div className="floor-switcher" aria-label="Storeys">
      <button className="floor-add" onClick={handleAdd} title="Add a floor above">
        <Plus className="icon" style={{ width: 14, height: 14 }} /> Floor
        {!isPro && <Crown className="icon pro-pill" style={{ width: 12, height: 12 }} />}
      </button>
      <div className="floor-list">
        {ordered.map((f) => {
          const active = f.id === activeFloorId;
          return (
            <div key={f.id} className={`floor-row ${active ? 'active' : ''}`}>
              {editing === f.id ? (
                <input
                  className="floor-edit"
                  defaultValue={f.name}
                  autoFocus
                  onBlur={(e) => {
                    renameFloor(f.id, e.target.value.trim());
                    setEditing(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') setEditing(null);
                  }}
                />
              ) : (
                <button
                  className="floor-btn"
                  onClick={() => setActiveFloor(f.id)}
                  onDoubleClick={() => setEditing(f.id)}
                  title={`${f.name} — double-click to rename`}
                >
                  <Layers className="icon" style={{ width: 14, height: 14 }} />
                  <span>{f.name}</span>
                </button>
              )}
              {active && floors.length > 1 && (
                <button
                  className="floor-del"
                  aria-label={`Delete ${f.name}`}
                  title={`Delete ${f.name}`}
                  onClick={async () => {
                    const ok = await confirmDialog(
                      `Delete ${f.name}?`,
                      'Everything on this storey will be removed. This can be undone.',
                      { confirmLabel: 'Delete floor', danger: true },
                    );
                    if (ok) {
                      removeFloor(f.id);
                      toast.info(`Removed ${f.name}`);
                    }
                  }}
                >
                  <X className="icon" style={{ width: 13, height: 13 }} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
