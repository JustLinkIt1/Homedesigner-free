import { useEffect, useRef, useState } from 'react';
import {
  Home,
  Undo2,
  Redo2,
  Import,
  FolderOpen,
  Save,
  Grid3x3,
  Box,
  Check,
  Download,
  FileImage,
  FileText,
  ClipboardList,
  Info,
  CircleHelp,
  Settings,
} from 'lucide-react';
import { useDesign } from '../store/designStore';
import { exportProject, openProjectFile } from '../lib/projectIO';
import { exportPlanPNG, exportPlanPDF } from '../lib/planExport';
import { toast } from '../lib/ui';
import { APP_NAME, APP_TAGLINE } from '../lib/appInfo';
import { requirePro } from '../lib/pro';
import { useProStore } from '../store/proStore';
import { useI18n } from '../lib/i18n';

function SavedBadge({ tick }: { tick: number }) {
  const [saving, setSaving] = useState(false);
  const first = useRef(true);
  const tr = useI18n();
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setSaving(true);
    const t = setTimeout(() => setSaving(false), 600);
    return () => clearTimeout(t);
  }, [tick]);
  return (
    <span className={`saved-badge ${saving ? 'saving' : ''}`}>
      {saving ? <span className="spin" style={{ width: 12, height: 12 }} /> : <Check className="icon" style={{ width: 13, height: 13 }} />}
      {saving ? tr('Saving…') : tr('Saved')}
    </span>
  );
}

export default function Toolbar({
  onImport,
  onAbout,
  onHelp,
  onShoppingList,
  onSettings,
  onHome,
}: {
  onImport: () => void;
  onAbout: () => void;
  onHelp: () => void;
  onShoppingList: () => void;
  onSettings: () => void;
  onHome: () => void;
}) {
  const s = useDesign();
  const isPro = useProStore((st) => st.isPro);
  const t = useI18n();
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  // Close the export menu on any outside click.
  useEffect(() => {
    if (!exportOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [exportOpen]);

  const runExport = async (kind: 'png' | 'pdf') => {
    setExportOpen(false);
    // PDF export is a Pro feature (PNG stays free).
    if (kind === 'pdf' && !requirePro('pdfExport')) return;
    // Clear selection so editing handles don't appear in the export, then let
    // React drop those nodes before we rasterise the stage.
    s.clearSelection();
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    try {
      if (kind === 'png') {
        const ok = await exportPlanPNG(s.projectName);
        if (ok) toast.success('Plan exported as PNG');
        else toast.info('Nothing to export yet — add walls or rooms first');
      } else {
        const pages = await exportPlanPDF(s.projectName);
        if (pages > 1) toast.success(`PDF exported — one page per floor (${pages})`);
        else if (pages === 1) toast.success('Plan exported as PDF');
        else toast.info('Nothing to export yet — add walls or rooms first');
      }
    } catch {
      toast.error('Export failed');
    }
  };

  return (
    <div className="toolbar">
      <button className="brand" onClick={onHome} title="Back to my projects" aria-label="Back to my projects">
        <div className="brand-mark">
          <Home className="icon" />
        </div>
        <div className="brand-name">
          {APP_NAME}
          <span className="sub">{APP_TAGLINE}</span>
        </div>
      </button>

      <div className="project">
        <input
          className="project-name"
          value={s.projectName}
          onChange={(e) => s.setProjectName(e.target.value)}
          onFocus={(e) => e.target.select()}
          aria-label="Project name"
          spellCheck={false}
        />
        <SavedBadge tick={s.savedTick} />
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
          <span>{t('Import plan')}</span>
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
              projectName: s.projectName,
              floors: s.floors,
              floorGeom: s.floorGeom,
              activeFloorId: s.activeFloorId,
            });
            toast.success('Project file downloaded');
          }}
        >
          <Save className="icon" />
        </button>
        <button className="tbtn icon-only" title={t('Settings')} aria-label={t('Settings')} onClick={onSettings}>
          <Settings className="icon" />
        </button>
        <button className="tbtn icon-only" title={t('Tips & shortcuts')} aria-label="Tips and shortcuts" onClick={onHelp}>
          <CircleHelp className="icon" />
        </button>
        <button className="tbtn icon-only" title={t('About')} aria-label={t('About')} onClick={onAbout}>
          <Info className="icon" />
        </button>
        {s.view === '2d' && (
          <div className="export-wrap" ref={exportRef}>
            <button
              className="tbtn ghost"
              title="Export the 2D plan as PNG or PDF"
              aria-haspopup="menu"
              aria-expanded={exportOpen}
              onClick={() => setExportOpen((o) => !o)}
            >
              <Download className="icon" />
              <span>{t('Export')}</span>
            </button>
            {exportOpen && (
              <div className="export-menu" role="menu">
                <button role="menuitem" onClick={() => runExport('png')}>
                  <FileImage className="icon" /> {t('PNG image')}
                </button>
                <button role="menuitem" onClick={() => runExport('pdf')}>
                  <FileText className="icon" /> {t('PDF document')}
                  {!isPro && <span className="pro-tag">PRO</span>}
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    setExportOpen(false);
                    onShoppingList();
                  }}
                >
                  <ClipboardList className="icon" /> {t('Shopping list')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="spacer" />

      <div className="view-toggle">
        <button className={s.view === '2d' ? 'active' : ''} onClick={() => s.setView('2d')}>
          <Grid3x3 className="icon" />
          <span>{t('2D Plan')}</span>
        </button>
        <button className={s.view === '3d' ? 'active' : ''} onClick={() => s.setView('3d')}>
          <Box className="icon" />
          <span>{t('3D View')}</span>
        </button>
      </div>
    </div>
  );
}
