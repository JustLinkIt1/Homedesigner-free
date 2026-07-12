import { useEffect, useRef, useState } from 'react';
import { DoorOpen, Sofa } from 'lucide-react';
import { useDesign } from '../store/designStore';
import { useProStore } from '../store/proStore';
import { requirePro } from '../lib/pro';
import { TOOLS, OPENINGS } from '../data/tools';
import { tapLight } from '../lib/haptics';
import { useI18n } from '../lib/i18n';
import SymbolIcon from './SymbolIcon';

export default function ToolDock() {
  const { tool, setTool, setPendingFurniture, pendingFurnitureType } = useDesign();
  const isPro = useProStore((s) => s.isPro);
  const tr = useI18n();
  const [openingsOpen, setOpeningsOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openingsOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpeningsOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [openingsOpen]);

  const pickOpening = (type: string, locked: boolean) => {
    if (locked && !requirePro('catalog')) return;
    setPendingFurniture(pendingFurnitureType === type ? null : type);
    setOpeningsOpen(false);
  };

  const openingActive = OPENINGS.some((e) => e.type === pendingFurnitureType);

  return (
    <div className="tool-dock">
      {TOOLS.map((t, i) => {
        const Icon = t.icon;
        return (
          <div key={t.id} style={{ display: 'contents' }}>
            <button
              className={`dock-btn ${tool === t.id ? 'active' : ''}`}
              data-tip={tr(t.label)}
              aria-label={tr(t.label)}
              aria-pressed={tool === t.id}
              onClick={() => {
                tapLight();
                setTool(t.id);
              }}
            >
              <Icon className="icon" />
              <span className="dock-label">{tr(t.label)}</span>
            </button>
            {i === 2 && <div className="dock-sep" />}
          </div>
        );
      })}
      <div className="dock-sep" />

      {/* Doors & windows flyout — build-mode placement of wall openings. */}
      <div className="dock-openings" ref={wrapRef} style={{ display: 'contents' }}>
        <button
          className={`dock-btn ${openingActive ? 'active' : ''}`}
          data-tip={tr('Doors & windows')}
          aria-label="Doors and windows"
          aria-haspopup="menu"
          aria-expanded={openingsOpen}
          onClick={() => setOpeningsOpen((o) => !o)}
        >
          <DoorOpen className="icon" />
        </button>
        {openingsOpen && (
          <div className="openings-flyout" role="menu">
            <div className="of-title">{tr('Doors & windows')}</div>
            <div className="of-grid">
              {OPENINGS.map((e) => {
                const locked = !!e.pro && !isPro;
                return (
                  <button
                    key={e.type}
                    className={`of-item ${pendingFurnitureType === e.type ? 'active' : ''} ${locked ? 'locked' : ''}`}
                    role="menuitem"
                    title={tr(e.name)}
                    onClick={() => pickOpening(e.type, locked)}
                  >
                    <SymbolIcon shape={e.shape} className="of-symbol" />
                    <span>{tr(e.name)}</span>
                    {locked && <span className="of-lock">PRO</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Furniture mode: docks the catalog panel in; any build tool tucks it
          away again. Hidden on phones — the Objects tab plays this role. */}
      <button
        className={`dock-btn furniture-toggle ${tool === 'furniture' && !openingActive ? 'active' : ''}`}
        data-tip={tr('Furnish (open catalog)')}
        aria-label="Furnish — open the furniture catalog"
        aria-pressed={tool === 'furniture' && !openingActive}
        onClick={() => {
          if (tool === 'furniture') {
            setPendingFurniture(null);
            setTool('select');
          } else {
            setTool('furniture');
          }
        }}
      >
        <Sofa className="icon" />
      </button>
    </div>
  );
}
