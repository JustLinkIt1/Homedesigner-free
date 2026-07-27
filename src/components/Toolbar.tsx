import { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  Undo2,
  Redo2,
  Import,
  FolderOpen,
  Save,
  Grid3x3,
  Box,
  Check,
  Download,
  Ruler,
  FileImage,
  FileText,
  ClipboardList,
  Info,
  CircleHelp,
  Settings,
  MoreVertical,
} from 'lucide-react';
import { useDesign } from '../store/designStore';
import { exportProject, openProjectFile } from '../lib/projectIO';
import { exportPlanPNG, exportPlanPDF, exportPlanDXF } from '../lib/planExport';
import { toast } from '../lib/ui';
import { APP_NAME, APP_TAGLINE } from '../lib/appInfo';
import { requirePro } from '../lib/pro';
import { useProStore } from '../store/proStore';
import { useI18n } from '../lib/i18n';
import { capturePlanThumbnail } from '../lib/thumb';

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
  const s = useDesign(useShallow((st) => ({
    activeFloorId: st.activeFloorId,
    background: st.background,
    floorGeom: st.floorGeom,
    floors: st.floors,
    furniture: st.furniture,
    openings: st.openings,
    projectName: st.projectName,
    rooms: st.rooms,
    savedTick: st.savedTick,
    view: st.view,
    walls: st.walls,
    canRedo: st.canRedo,
    canUndo: st.canUndo,
    clearSelection: st.clearSelection,
    loadSnapshot: st.loadSnapshot,
    redo: st.redo,
    setProjectName: st.setProjectName,
    setView: st.setView,
    undo: st.undo,
  })));
  const isPro = useProStore((st) => st.isPro);
  const t = useI18n();
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  // Close the export menu on any outside click.
  useEffect(() => {
    if (!exportOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [exportOpen]);

  // Close the "More" overflow menu on any outside click.
  useEffect(() => {
    if (!moreOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [moreOpen]);

  const saveToFile = async () => {
    try {
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
      toast.success(t('Project file downloaded'));
    } catch {
      toast.error(t('Save failed'));
    }
  };

  const openFromFile = async () => {
    try {
      const snap = await openProjectFile();
      if (snap) {
        s.loadSnapshot(snap);
        toast.success(t('Project opened'));
      }
    } catch {
      toast.error(t('Could not open that file'));
    }
  };

  const runExport = async (kind: 'png' | 'pdf' | 'dxf') => {
    setExportOpen(false);
    // PDF export is a Pro feature (PNG stays free).
    if ((kind === 'pdf' || kind === 'dxf') && !requirePro('pdfExport')) return;
    // Clear selection so editing handles don't appear in the export, then let
    // React drop those nodes before we rasterise the stage.
    s.clearSelection();
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    try {
      if (kind === 'png') {
        const ok = await exportPlanPNG(s.projectName);
        if (ok) toast.success(t('Plan exported as PNG'));
        else toast.info(t('Nothing to export yet — add walls or rooms first'));
      } else if (kind === 'dxf') {
        const ok = await exportPlanDXF(s.projectName);
        if (ok) toast.success(t('Plan exported as a layered DXF drawing'));
        else toast.info(t('Nothing to export yet — add walls or rooms first'));
      } else {
        const pages = await exportPlanPDF(s.projectName);
        if (pages > 1) toast.success(`${t('PDF exported — one page per floor')} (${pages})`);
        else if (pages === 1) toast.success(t('Plan exported as PDF'));
        else toast.info(t('Nothing to export yet — add walls or rooms first'));
      }
    } catch {
      toast.error(t('Export failed'));
    }
  };

  return (
    <div className="toolbar">
      <button className="brand" onClick={onHome} title={t('Back to my projects')} aria-label={t('Back to my projects')}>
        <div className="brand-mark">
          <img src={`${import.meta.env.BASE_URL}brand-icon.png`} alt="" width={34} height={34} />
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
          aria-label={t('Project name')}
          spellCheck={false}
        />
        <SavedBadge tick={s.savedTick} />
      </div>

      <div className="tool-group">
        <button className="tbtn icon-only" disabled={!s.canUndo()} onClick={() => s.undo()} title={`${t('Undo')} (⌘Z)`} aria-label={t('Undo')}>
          <Undo2 className="icon" />
        </button>
        <button className="tbtn icon-only" disabled={!s.canRedo()} onClick={() => s.redo()} title={`${t('Redo')} (⇧⌘Z)`} aria-label={t('Redo')}>
          <Redo2 className="icon" />
        </button>
      </div>

      <div className="tool-group">
        <button className="tbtn ghost import-btn" onClick={onImport} title={t('Import a 2D plan (PDF / DXF / image)')}>
          <Import className="icon" />
          <span>{t('Import plan')}</span>
        </button>
        {s.view === '2d' && (
          <div className="export-wrap export-btn-wrap" ref={exportRef}>
            <button
              className="tbtn ghost"
              title={t('Export the 2D plan as PNG or PDF')}
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
                <button role="menuitem" onClick={() => runExport('dxf')}>
                  <Ruler className="icon" /> {t('DXF for CAD')}
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
        <div className="export-wrap" ref={moreRef}>
          <button
            className="tbtn icon-only"
            title={t('More')}
            aria-label={t('More')}
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((o) => !o)}
          >
            <MoreVertical className="icon" />
          </button>
          {moreOpen && (
            <div className="export-menu more-menu" role="menu">
              <button role="menuitem" onClick={() => { setMoreOpen(false); onSettings(); }}>
                <Settings className="icon" /> {t('Settings')}
              </button>
              <button role="menuitem" onClick={() => { setMoreOpen(false); onHelp(); }}>
                <CircleHelp className="icon" /> {t('Tips & shortcuts')}
              </button>
              <button role="menuitem" onClick={() => { setMoreOpen(false); onAbout(); }}>
                <Info className="icon" /> {t('About')}
              </button>
              <div className="menu-divider" role="separator" />
              <button role="menuitem" onClick={() => { setMoreOpen(false); openFromFile(); }}>
                <FolderOpen className="icon" /> {t('Open project file')}
              </button>
              <button role="menuitem" onClick={() => { setMoreOpen(false); saveToFile(); }}>
                <Save className="icon" /> {t('Save a copy')}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="spacer" />

      <div className="view-toggle">
        <button className={s.view === '2d' ? 'active' : ''} onClick={() => s.setView('2d')}>
          <Grid3x3 className="icon" />
          <span>{t('2D Plan')}</span>
        </button>
        <button
          className={s.view === '3d' ? 'active' : ''}
          onClick={() => {
            // Stash a plan thumbnail while the 2D canvas is still mounted, so a
            // project the user only ever viewed in 3D still gets a preview.
            if (s.view === '2d') capturePlanThumbnail();
            s.setView('3d');
          }}
        >
          <Box className="icon" />
          <span>{t('3D View')}</span>
        </button>
      </div>
    </div>
  );
}
