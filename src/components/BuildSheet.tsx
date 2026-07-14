import { X } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useDesign } from '../store/designStore';
import { useProStore } from '../store/proStore';
import { requirePro } from '../lib/pro';
import { TOOLS, OPENINGS } from '../data/tools';
import { tapLight } from '../lib/haptics';
import { useI18n } from '../lib/i18n';
import SymbolIcon from './SymbolIcon';
import type { ToolMode } from '../types';

// Phone "Build" bottom sheet — the grouped home for every drawing tool, opened
// from the Build tab. Replaces the floating 7-icon dock on phones so the canvas
// stays clear and nothing runs off-screen (Planner-5D-style grouping). Tapping a
// tool arms it and dismisses the sheet so you can draw straight away.
const SHEET_TOOLS = TOOLS.filter((t) => t.id !== 'pan'); // two-finger drag pans on touch

export default function BuildSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { tool, setTool, setPendingFurniture, pendingFurnitureType } = useDesign(useShallow((s) => ({
    tool: s.tool,
    setTool: s.setTool,
    setPendingFurniture: s.setPendingFurniture,
    pendingFurnitureType: s.pendingFurnitureType,
  })));
  const isPro = useProStore((s) => s.isPro);
  const tr = useI18n();

  const pickTool = (id: ToolMode) => {
    tapLight();
    setPendingFurniture(null);
    setTool(id);
    onClose();
  };

  const pickOpening = (type: string, locked: boolean) => {
    if (locked && !requirePro('catalog')) return;
    tapLight();
    setPendingFurniture(type);
    onClose();
  };

  const openingActive = OPENINGS.some((e) => e.type === pendingFurnitureType);

  return (
    <div
      className={`build-sheet ${open ? 'open' : ''}`}
      role="dialog"
      aria-label={tr('Build')}
      aria-hidden={!open}
    >
      <div className="bs-head">
        <span className="bs-title">{tr('Build')}</span>
        <button className="bs-close" onClick={onClose} aria-label={tr('Close')}>
          <X className="icon" />
        </button>
      </div>

      <div className="bs-grid">
        {SHEET_TOOLS.map((t) => {
          const Icon = t.icon;
          const active = tool === t.id && !openingActive;
          return (
            <button
              key={t.id}
              className={`bs-tool ${active ? 'active' : ''}`}
              aria-pressed={active}
              onClick={() => pickTool(t.id)}
            >
              <Icon className="icon" />
              <span>{tr(t.label)}</span>
            </button>
          );
        })}
      </div>

      <div className="bs-section-title">{tr('Doors & windows')}</div>
      <div className="bs-grid">
        {OPENINGS.map((e) => {
          const locked = !!e.pro && !isPro;
          const active = pendingFurnitureType === e.type;
          return (
            <button
              key={e.type}
              className={`bs-tool ${active ? 'active' : ''} ${locked ? 'locked' : ''}`}
              aria-pressed={active}
              onClick={() => pickOpening(e.type, locked)}
            >
              <SymbolIcon shape={e.shape} className="icon" />
              <span>{tr(e.name)}</span>
              {locked && <span className="bs-lock">PRO</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
