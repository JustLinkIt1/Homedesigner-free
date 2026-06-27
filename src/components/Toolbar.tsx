import { useDesign } from '../store/designStore';
import { exportProject, openProjectFile } from '../lib/projectIO';
import type { ToolMode } from '../types';

const TOOLS: { id: ToolMode; icon: string; label: string }[] = [
  { id: 'select', icon: '⤢', label: 'Select' },
  { id: 'wall', icon: '▱', label: 'Wall' },
  { id: 'room', icon: '⬛', label: 'Room' },
  { id: 'erase', icon: '⌫', label: 'Erase' },
  { id: 'pan', icon: '✥', label: 'Pan' },
];

export default function Toolbar({ onImport }: { onImport: () => void }) {
  const s = useDesign();

  return (
    <div className="toolbar">
      <div className="brand">
        <span className="logo">🏠</span>
        <span>HomeDesigner</span>
        <span className="free">FREE</span>
      </div>

      <div className="tool-group">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            className={`tbtn ${s.tool === t.id ? 'active' : ''}`}
            onClick={() => s.setTool(t.id)}
            title={t.label}
          >
            <span className="ico">{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      <div className="tool-group">
        <button className="tbtn" disabled={!s.canUndo()} onClick={() => s.undo()} title="Undo (⌘Z)">
          <span className="ico">↶</span>
        </button>
        <button className="tbtn" disabled={!s.canRedo()} onClick={() => s.redo()} title="Redo (⇧⌘Z)">
          <span className="ico">↷</span>
        </button>
      </div>

      <div className="tool-group">
        <button className="tbtn ghost" onClick={onImport} title="Import a 2D plan (PDF / DXF / image)">
          <span className="ico">📐</span>
          <span>Import plan</span>
        </button>
        <button
          className="tbtn"
          title="Open a saved project (.json)"
          onClick={async () => {
            const snap = await openProjectFile();
            if (snap) s.loadSnapshot(snap);
          }}
        >
          <span className="ico">📂</span>
        </button>
        <button
          className="tbtn"
          title="Save project to a file"
          onClick={() =>
            exportProject({
              walls: s.walls,
              rooms: s.rooms,
              furniture: s.furniture,
              openings: s.openings,
              background: s.background,
            })
          }
        >
          <span className="ico">💾</span>
        </button>
        <button
          className="tbtn"
          onClick={() => {
            if (confirm('Start a new empty project? This clears the current design.')) s.newProject();
          }}
          title="New project"
        >
          <span className="ico">✦</span>
          <span>New</span>
        </button>
      </div>

      <div className="spacer" />

      <div className="view-toggle">
        <button className={s.view === '2d' ? 'active' : ''} onClick={() => s.setView('2d')}>
          2D Plan
        </button>
        <button className={s.view === '3d' ? 'active' : ''} onClick={() => s.setView('3d')}>
          3D View
        </button>
      </div>
    </div>
  );
}
