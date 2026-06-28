import {
  Home,
  Undo2,
  Redo2,
  Import,
  FolderOpen,
  Save,
  FilePlus2,
  Grid3x3,
  Box,
} from 'lucide-react';
import { useDesign } from '../store/designStore';
import { exportProject, openProjectFile } from '../lib/projectIO';
import { confirmDialog, toast } from '../lib/ui';

export default function Toolbar({ onImport }: { onImport: () => void }) {
  const s = useDesign();

  return (
    <div className="toolbar">
      <div className="brand">
        <div className="brand-mark">
          <Home className="icon" />
        </div>
        <div className="brand-name">
          HomeDesigner
          <span className="sub">Free home planner</span>
        </div>
        <span className="free">FREE</span>
      </div>

      <div className="tool-group">
        <button className="tbtn icon-only" disabled={!s.canUndo()} onClick={() => s.undo()} title="Undo (⌘Z)" aria-label="Undo">
          <Undo2 className="icon" />
        </button>
        <button className="tbtn icon-only" disabled={!s.canRedo()} onClick={() => s.redo()} title="Redo (⇧⌘Z)" aria-label="Redo">
          <Redo2 className="icon" />
        </button>
      </div>

      <div className="tool-group">
        <button className="tbtn ghost" onClick={onImport} title="Import a 2D plan (PDF / DXF / image)">
          <Import className="icon" />
          <span>Import plan</span>
        </button>
        <button
          className="tbtn icon-only"
          title="Open a saved project"
          aria-label="Open a saved project"
          onClick={async () => {
            const snap = await openProjectFile();
            if (snap) {
              s.loadSnapshot(snap);
              toast.success('Project opened');
            }
          }}
        >
          <FolderOpen className="icon" />
        </button>
        <button
          className="tbtn icon-only"
          title="Save project to a file"
          aria-label="Save project to a file"
          onClick={async () => {
            await exportProject({
              walls: s.walls,
              rooms: s.rooms,
              furniture: s.furniture,
              openings: s.openings,
              background: s.background,
            });
            toast.success('Project saved');
          }}
        >
          <Save className="icon" />
        </button>
        <button
          className="tbtn icon-only"
          title="New project"
          aria-label="New project"
          onClick={async () => {
            const ok = await confirmDialog(
              'Start a new project?',
              'This clears the current design. Save it first if you want to keep it.',
              { confirmLabel: 'New project', danger: true },
            );
            if (ok) {
              s.newProject();
              toast.info('Started a new project');
            }
          }}
        >
          <FilePlus2 className="icon" />
        </button>
      </div>

      <div className="spacer" />

      <div className="view-toggle">
        <button className={s.view === '2d' ? 'active' : ''} onClick={() => s.setView('2d')}>
          <Grid3x3 className="icon" />
          <span>2D Plan</span>
        </button>
        <button className={s.view === '3d' ? 'active' : ''} onClick={() => s.setView('3d')}>
          <Box className="icon" />
          <span>3D View</span>
        </button>
      </div>
    </div>
  );
}
