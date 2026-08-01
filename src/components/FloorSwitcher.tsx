import { useState } from 'react';
import { Plus, Layers, X, Crown, Copy, ChevronUp, ChevronDown } from 'lucide-react';
import { useDesign } from '../store/designStore';
import { useProStore } from '../store/proStore';
import { requirePro } from '../lib/pro';
import { confirmDialog, toast } from '../lib/ui';
import { useI18n } from '../lib/i18n';

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
  const cloneFloor = useDesign((s) => s.cloneFloor);
  const removeFloor = useDesign((s) => s.removeFloor);
  const renameFloor = useDesign((s) => s.renameFloor);
  const activeFloor = useDesign((s) => s.floors.find((f) => f.id === s.activeFloorId));
  const isPro = useProStore((s) => s.isPro);
  const t = useI18n();
  const [editing, setEditing] = useState<string | null>(null);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  if (floors.length === 0) return null;
  // Highest storey at the top of the list.
  const ordered = [...floors].sort((a, b) => b.elevation - a.elevation);

  // Gate CREATION of extra storeys only — existing multi-floor designs stay
  // fully switchable/editable/renderable regardless of entitlement.
  const handleAdd = () => {
    if (floors.length >= 1 && !requirePro('multiFloor')) return;
    addFloor();
    setMobileOpen(false);
  };

  const handleClone = (direction: 'above' | 'below') => {
    setCloneOpen(false);
    if (!requirePro('multiFloor')) return;
    cloneFloor(direction);
    setMobileOpen(false);
    toast.success(`Copied ${activeFloor?.name ?? 'floor'} ${direction}`);
  };

  return (
    <div className={`floor-switcher ${mobileOpen ? 'expanded' : ''}`} aria-label={t('Storeys')}>
      <button
        className="floor-current"
        onClick={() => setMobileOpen((v) => !v)}
        aria-expanded={mobileOpen}
        data-tip={t('Choose floor')} aria-label={t('Choose floor')}
      >
        <Layers className="icon" style={{ width: 15, height: 15 }} />
        <span>{t(activeFloor?.name ?? 'Ground floor')}</span>
        {mobileOpen
          ? <ChevronUp className="icon floor-current-caret" />
          : <ChevronDown className="icon floor-current-caret" />}
      </button>
      <button className="floor-add" onClick={handleAdd} data-tip={t('Add an empty floor above')} aria-label={t('Add an empty floor above')}>
        <Plus className="icon" style={{ width: 14, height: 14 }} /> {t('Floor')}
        {!isPro && <Crown className="icon pro-pill" style={{ width: 12, height: 12 }} />}
      </button>
      <div className="floor-clone-wrap">
        <button
          className="floor-add floor-clone"
          onClick={() => setCloneOpen((v) => !v)}
          data-tip={t("Copy this floor's walls onto a new storey")} aria-label={t("Copy this floor's walls onto a new storey")}
        >
          <Copy className="icon" style={{ width: 13, height: 13 }} /> {t('Copy floor')}
          {!isPro && <Crown className="icon pro-pill" style={{ width: 12, height: 12 }} />}
        </button>
        {cloneOpen && (
          <div className="floor-clone-menu" role="menu">
            <button role="menuitem" onClick={() => handleClone('above')}>
              <ChevronUp className="icon" style={{ width: 14, height: 14 }} /> {t('Copy above')}
            </button>
            <button role="menuitem" onClick={() => handleClone('below')}>
              <ChevronDown className="icon" style={{ width: 14, height: 14 }} /> {t('Copy below')}
            </button>
          </div>
        )}
      </div>
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
                  onClick={() => {
                    setActiveFloor(f.id);
                    setMobileOpen(false);
                  }}
                  onDoubleClick={() => setEditing(f.id)}
                  data-tip={`${f.name} — double-click to rename`} aria-label={`${f.name} — double-click to rename`}
                >
                  <Layers className="icon" style={{ width: 14, height: 14 }} />
                  <span>{t(f.name)}</span>
                </button>
              )}
              {active && floors.length > 1 && (
                <button
                  className="floor-del"
                  aria-label={`Delete ${f.name}`}
                  data-tip={`Delete ${f.name}`}
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
