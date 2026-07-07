import { useEffect, useRef, useState } from 'react';
import { MousePointer2, PenTool, Square, DoorOpen, Eraser, Hand, Ruler, Sofa } from 'lucide-react';
import { useDesign } from '../store/designStore';
import { useProStore } from '../store/proStore';
import { requirePro } from '../lib/pro';
import { FURNITURE_CATALOG } from '../data/furnitureCatalog';
import SymbolIcon from './SymbolIcon';
import type { ToolMode } from '../types';

const TOOLS: { id: ToolMode; icon: typeof MousePointer2; label: string }[] = [
  { id: 'select', icon: MousePointer2, label: 'Select & move' },
  { id: 'wall', icon: PenTool, label: 'Draw walls' },
  { id: 'room', icon: Square, label: 'Draw room' },
  { id: 'measure', icon: Ruler, label: 'Measure distance' },
  { id: 'erase', icon: Eraser, label: 'Erase' },
  { id: 'pan', icon: Hand, label: 'Pan' },
];

// Doors, windows and openings are placed like furniture but belong to the
// build flow — so they live in a dedicated dock flyout, not the catalog panel.
const OPENINGS = FURNITURE_CATALOG.filter((e) => e.category === 'Openings');

export default function ToolDock() {
  const { tool, setTool, setPendingFurniture, pendingFurnitureType } = useDesign();
  const isPro = useProStore((s) => s.isPro);
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
              data-tip={t.label}
              aria-label={t.label}
              aria-pressed={tool === t.id}
              onClick={() => setTool(t.id)}
            >
              <Icon className="icon" />
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
          data-tip="Doors & windows"
          aria-label="Doors and windows"
          aria-haspopup="menu"
          aria-expanded={openingsOpen}
          onClick={() => setOpeningsOpen((o) => !o)}
        >
          <DoorOpen className="icon" />
        </button>
        {openingsOpen && (
          <div className="openings-flyout" role="menu">
            <div className="of-title">Doors &amp; windows</div>
            <div className="of-grid">
              {OPENINGS.map((e) => {
                const locked = !!e.pro && !isPro;
                return (
                  <button
                    key={e.type}
                    className={`of-item ${pendingFurnitureType === e.type ? 'active' : ''} ${locked ? 'locked' : ''}`}
                    role="menuitem"
                    title={e.name}
                    onClick={() => pickOpening(e.type, locked)}
                  >
                    <SymbolIcon shape={e.shape} className="of-symbol" />
                    <span>{e.name}</span>
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
        data-tip="Furnish (open catalog)"
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
