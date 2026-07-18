import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  Minus,
  Plus,
  Maximize2,
  Grid3x3,
  Ruler,
  House,
  Footprints,
  Image as ImageIcon,
  Camera,
  ChevronDown,
  Sofa,
  SlidersHorizontal,
  Lightbulb,
  Sun,
  Moon,
  PenTool,
  X,
  Lock,
} from 'lucide-react';
import Toolbar from './components/Toolbar';
import ToolDock from './components/ToolDock';
import BuildSheet from './components/BuildSheet';
import CatalogSidebar from './components/CatalogSidebar';
import PropertiesPanel from './components/PropertiesPanel';
import Canvas2D from './components/Editor2D/Canvas2D';
import FloorSwitcher from './components/FloorSwitcher';
import AboutDialog from './components/AboutDialog';
import HelpPanel from './components/HelpPanel';
import SettingsDialog from './components/SettingsDialog';
import CoachMarks from './components/CoachMarks';
import WelcomeTour from './components/WelcomeTour';
import RotateControls from './components/Viewer3D/RotateControls';
import ShoppingList from './components/ShoppingList';
import ProUpsellModal from './components/ProUpsellModal';
import ProjectsScreen from './components/ProjectsScreen';
import { useProStore } from './store/proStore';
import { Toaster, ConfirmHost } from './components/Overlays';
import { useDesign } from './store/designStore';
import { CATALOG_BY_TYPE } from './data/furnitureCatalog';
import { TOOLS } from './data/tools';
import { sceneCapture, planCapture } from './lib/renderBridge';
import { useDraw, drawBridge, useConfirm } from './lib/ui';
import { initNative } from './lib/native';
import { isWebGLAvailable } from './lib/webgl';
import { orbitZoom } from './lib/renderBridge';
import { useI18n } from './lib/i18n';
import * as projects from './lib/projects';

// Heavy modules loaded on demand to keep the 2D-first experience light:
//  - Scene3D pulls in three + drei + postprocessing
//  - ImportDialog pulls in pdfjs (+ its worker) and dxf-parser
//  - PhotoMode pulls in the GPU path tracer
const Scene3D = lazy(() => import('./components/Viewer3D/Scene3D'));
const ImportDialog = lazy(() => import('./components/ImportDialog'));
const PhotoMode = lazy(() => import('./components/Viewer3D/PhotoMode'));

export default function App() {
  const {
    view, setView, walls, tool, setTool, zoom, showGrid, setZoom, setShowGrid,
    showDimensions, setShowDimensions, dollhouse, setDollhouse,
    walkMode, setWalkMode, pendingFurnitureType, setPendingFurniture, selection,
    units, setUnits,
    sunTime, setSunTime, lightsOn, setLightsOn,
    kitchenUppers, setKitchenUppers,
    moveLock, setMoveLock,
  } = useDesign(useShallow((s) => ({
    view: s.view,
    setView: s.setView,
    walls: s.walls,
    tool: s.tool,
    setTool: s.setTool,
    zoom: s.zoom,
    showGrid: s.showGrid,
    setZoom: s.setZoom,
    setShowGrid: s.setShowGrid,
    showDimensions: s.showDimensions,
    setShowDimensions: s.setShowDimensions,
    dollhouse: s.dollhouse,
    setDollhouse: s.setDollhouse,
    walkMode: s.walkMode,
    setWalkMode: s.setWalkMode,
    pendingFurnitureType: s.pendingFurnitureType,
    setPendingFurniture: s.setPendingFurniture,
    selection: s.selection,
    units: s.units,
    setUnits: s.setUnits,
    sunTime: s.sunTime,
    setSunTime: s.setSunTime,
    lightsOn: s.lightsOn,
    setLightsOn: s.setLightsOn,
    kitchenUppers: s.kitchenUppers,
    setKitchenUppers: s.setKitchenUppers,
    moveLock: s.moveLock,
    setMoveLock: s.setMoveLock,
  })));
  const t = useI18n();
  const [showImport, setShowImport] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showList, setShowList] = useState(false);
  const [photoMode, setPhotoMode] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [renderScale, setRenderScale] = useState(3); // supersample factor for captures
  const [renderMenuOpen, setRenderMenuOpen] = useState(false);
  const renderMenuRef = useRef<HTMLDivElement>(null);
  const [lightingOpen, setLightingOpen] = useState(false);
  const lightingRef = useRef<HTMLDivElement>(null);
  const [viewOpen, setViewOpen] = useState(false); // phone "View" popover (dollhouse/walk/lighting)
  const viewRef = useRef<HTMLDivElement>(null);
  const [drawer, setDrawer] = useState<null | 'catalog' | 'props' | 'build'>(null);
  // Projects home first — the editor opens a specific project.
  const [screen, setScreen] = useState<'projects' | 'editor'>('projects');
  const drawing = useDraw((s) => s.active);
  // One-time first-run tour + dismissible tip bar.
  const [showTour, setShowTour] = useState(false);
  const [offerTour, setOfferTour] = useState(false);
  const [tipsDismissed, setTipsDismissed] = useState(() => {
    try {
      return localStorage.getItem('homedesigner.tips.v1') === 'dismissed';
    } catch {
      return false;
    }
  });

  // --- Auto-open the Edit drawer when an object is selected on touch. ---
  // Tapping furniture on a phone otherwise "does nothing" visible: the props
  // panel lives behind the Edit tab. Auto-open it, but never fight the user:
  //  - autoOpenedRef: only auto-close what we auto-opened
  //  - suppressedIdRef: user closed while this id was selected → don't reopen
  //  - pointerDownRef: drags select on pointerdown; defer opening to pointerup
  const coarsePointer = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
  const autoOpenedRef = useRef(false);
  const suppressedIdRef = useRef<string | null>(null);
  const pointerDownRef = useRef(false);
  const drawerRef = useRef(drawer);
  drawerRef.current = drawer;
  useEffect(() => {
    const down = () => { pointerDownRef.current = true; };
    const up = () => { pointerDownRef.current = false; };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
    };
  }, []);
  useEffect(() => {
    if (!coarsePointer || screen !== 'editor') return;
    if (!selection.id) {
      if (autoOpenedRef.current && drawerRef.current === 'props') setDrawer(null);
      autoOpenedRef.current = false;
      suppressedIdRef.current = null;
      return;
    }
    // In 3D, tapping a wall or floor is a "decorate" gesture handled by the
    // in-place paint popover (the surface recolours live with the scene still
    // visible) — don't also slide the full Edit drawer over the view. The wall
    // stays selected, so the Edit tab still opens its height/thickness/delete
    // controls on demand. Furniture (no popover) and every 2D selection keep
    // auto-opening the drawer as before.
    const surfaceIn3D = view === '3d' && (selection.kind === 'wall' || selection.kind === 'room');
    const ok =
      tool === 'select' && !drawing && !surfaceIn3D &&
      drawerRef.current === null && suppressedIdRef.current !== selection.id;
    if (!ok) return;
    const open = () => {
      autoOpenedRef.current = true;
      setDrawer('props');
    };
    if (!pointerDownRef.current) {
      open();
      return;
    }
    const once = () => {
      if (useDesign.getState().selection.id === selection.id) open();
    };
    window.addEventListener('pointerup', once, { once: true });
    return () => window.removeEventListener('pointerup', once);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection.id, selection.kind, tool, drawing, screen, view]);

  // First-run tour: only on entering the editor with a truly blank project
  // (the sample home loads walls before onOpenEditor, so it never shows).
  useEffect(() => {
    if (screen !== 'editor') return;
    try {
      if (localStorage.getItem('homedesigner.tour.v1')) return;
      if (useDesign.getState().walls.length === 0) {
        localStorage.setItem('homedesigner.tour.v1', 'shown'); // never re-nag
        setOfferTour(true); // opt-in: offer the tour rather than forcing it
      }
    } catch {
      /* storage unavailable — skip the tour */
    }
  }, [screen]);

  const replayTour = () => {
    try {
      localStorage.removeItem('homedesigner.tour.v1');
      localStorage.removeItem('homedesigner.tips.v1');
    } catch {
      /* best-effort */
    }
    setTipsDismissed(false);
    setShowHelp(false);
    setOfferTour(false);
    setShowTour(true);
  };

  // Keep latest UI state for the hardware back-button handler.
  const stateRef = useRef({ photoMode, showImport, walkMode, screen, showHelp, showAbout, showList, showSettings });
  stateRef.current = { photoMode, showImport, walkMode, screen, showHelp, showAbout, showList, showSettings };

  // Going home: capture the plan synchronously (the canvas may unmount right
  // after), switch screens immediately so the tap feels instant, and finish
  // the thumbnail downscale in the background — the projects screen refreshes
  // itself when the write lands.
  const goHome = () => {
    const id = projects.getActiveId();
    const full = planCapture.current?.();
    setScreen('projects');
    if (!id || !full) return;
    (async () => {
      try {
        const img = new Image();
        img.src = full;
        await img.decode();
        const w = 240;
        const h = Math.max(1, Math.round((img.height / img.width) * w));
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#f6f5f2';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          projects.setThumbnail(id, c.toDataURL('image/jpeg', 0.6));
        }
      } catch {
        /* thumbnails are best-effort */
      }
    })();
  };

  // Leaving the 3D view always exits walk mode (e.g. switching to 2D).
  useEffect(() => {
    if (view !== '3d' && walkMode) setWalkMode(false);
  }, [view, walkMode, setWalkMode]);

  useEffect(() => {
    initNative(() => {
      const st = stateRef.current;
      // Close any open modal/overlay FIRST so hardware-back dismisses it
      // instead of falling through and exiting the app. (Reported: pressing
      // back on the Pro unlock sheet closed the whole app.)
      if (useConfirm.getState().req) {
        useConfirm.getState().answer(false);
        return true;
      }
      if (useProStore.getState().upsellFeature) {
        useProStore.getState().closeUpsell();
        return true;
      }
      if (st.showHelp) {
        setShowHelp(false);
        return true;
      }
      if (st.showAbout) {
        setShowAbout(false);
        return true;
      }
      if (st.showList) {
        setShowList(false);
        return true;
      }
      if (st.showSettings) {
        setShowSettings(false);
        return true;
      }
      if (st.walkMode) {
        setWalkMode(false);
        return true;
      }
      if (st.photoMode) {
        setPhotoMode(false);
        return true;
      }
      if (st.showImport) {
        setShowImport(false);
        return true;
      }
      const sel = useDesign.getState().selection;
      if (sel.id) {
        useDesign.getState().clearSelection();
        return true;
      }
      if (st.screen === 'editor') {
        // Editor → projects home instead of exiting the app.
        goHome();
        return true;
      }
      return false;
    });
    // Resolve the Pro entitlement (billing on Android, mock on web).
    useProStore.getState().refresh();
    // Mount-once by design: the handler reads live state via refs/getState.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close the render-quality menu on any outside click.
  useEffect(() => {
    if (!renderMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (renderMenuRef.current && !renderMenuRef.current.contains(e.target as Node)) {
        setRenderMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [renderMenuOpen]);

  // Close the lighting popover on any outside click.
  useEffect(() => {
    if (!lightingOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (lightingRef.current && !lightingRef.current.contains(e.target as Node)) {
        setLightingOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [lightingOpen]);

  // Close the phone "View" popover on any outside click.
  useEffect(() => {
    if (!viewOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (viewRef.current && !viewRef.current.contains(e.target as Node)) setViewOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [viewOpen]);

  const handleRender = async (scale = renderScale) => {
    if (!sceneCapture.current) return;
    setRenderScale(scale); // remember the last-used quality
    setRendering(true);
    // Let the spinner paint before the synchronous high-res render blocks.
    await new Promise((r) => setTimeout(r, 30));
    try {
      await sceneCapture.current(scale);
    } finally {
      setRendering(false);
    }
  };

  const tip = drawing
    ? null // the Finish affordance takes over while actively drawing
    : tool === 'wall'
    ? t('Click to add wall points — or type a length (e.g. 4.5) and press Enter for exact walls')
    : tool === 'room'
    ? t('Click corners to outline a room · click the first point to close it')
    : tool === 'kitchen'
    ? t('Click along a wall, then click again — base cabinets tile the run and face the room')
    : tool === 'furniture' && pendingFurnitureType
    ? t('Click in the plan to place it · switch to Select to move & rotate')
    : tool === 'erase'
    ? t('Click any wall, room or object to delete it')
    : tool === 'measure'
    ? t('Measure a wall, then enter its real length to scale the whole drawing · Esc to clear')
    : tool === 'select' && walls.length === 0
    ? t('Pick a tool on the left to start — try ✏️ Draw walls')
    : null;
  const pendingEntry = pendingFurnitureType ? CATALOG_BY_TYPE[pendingFurnitureType] : undefined;
  const activeBuildTool = TOOLS.find(
    (entry) => entry.id === tool && entry.id !== 'select' && entry.id !== 'pan',
  );
  const buildModeActive = !!activeBuildTool || !!pendingEntry?.opening;
  const placementAvailable = !!pendingEntry && (view === '2d' || !pendingEntry.opening);

  const cancelPlacement = () => {
    setPendingFurniture(null);
    setTool('select');
  };

  const toggleObjects = () => setDrawer(drawer === 'catalog' ? null : 'catalog');

  if (screen === 'projects') {
    return (
      <div className="app">
        <ProjectsScreen onOpenEditor={() => setScreen('editor')} onImport={() => setShowImport(true)} />
        {showImport && (
          <Suspense fallback={null}>
            <ImportDialog onClose={() => setShowImport(false)} />
          </Suspense>
        )}
        <ProUpsellModal />
        <Toaster />
        <ConfirmHost />
      </div>
    );
  }

  return (
    <div className="app">
      <Toolbar
        onImport={() => setShowImport(true)}
        onAbout={() => setShowAbout(true)}
        onHelp={() => setShowHelp(true)}
        onShoppingList={() => setShowList(true)}
        onSettings={() => setShowSettings(true)}
        onHome={goHome}
      />
      <div className="body">
        {!walkMode && (
          <CatalogSidebar
            open={drawer === 'catalog'}
            // Furniture mode docks the catalog in — but not while an opening
            // (door/window) is the armed type: those place from the build-mode
            // dock flyout and shouldn't reflow the canvas with the catalog.
            docked={tool === 'furniture' && !CATALOG_BY_TYPE[pendingFurnitureType ?? '']?.opening}
            onClose={() => setDrawer(null)}
          />
        )}
        <div className="stage-wrap">
          {view === '2d' ? (
            <Canvas2D />
          ) : !isWebGLAvailable() ? (
            <div className="stage-loading webgl-missing">
              <p>
                {t(
                  "3D view isn't available on this device — it needs WebGL, which your browser/graphics driver doesn't provide. The 2D editor still works fully.",
                )}
              </p>
            </div>
          ) : walls.length === 0 ? (
            <div className="stage-loading stage-empty">
              <h3>{t('Nothing to show in 3D yet')}</h3>
              <p>{t('Draw some walls in the 2D plan, then switch back here to walk through your home.')}</p>
              <button className="btn primary" onClick={() => setView('2d')}>
                {t('Go to 2D plan')}
              </button>
            </div>
          ) : (
            <Suspense fallback={<div className="stage-loading"><span className="spin" /> {t('Loading 3D…')}</div>}>
              <Scene3D />
            </Suspense>
          )}

          {view === '2d' && <ToolDock />}
          {view === '2d' && tip && !tipsDismissed && (
            <div className="tip">
              <span>{tip}</span>
              <button
                className="tip-x"
                aria-label="Hide tips"
                onClick={() => {
                  setTipsDismissed(true);
                  try {
                    localStorage.setItem('homedesigner.tips.v1', 'dismissed');
                  } catch {
                    /* best-effort */
                  }
                }}
              >
                ✕
              </button>
            </div>
          )}
          {drawing && (
            <div className="draw-affordance">
              <span>
                {coarsePointer
                  ? tool === 'room'
                    ? t('Tap the first point to close, or finish')
                    : t('Tap points, then finish')
                  : `${tool === 'room' ? t('Click the first point or') : t('Double-click or')} ${t('press Enter to finish')}`}
              </span>
              {tool === 'kitchen' && (
                <label className="draw-toggle" title={t('Also add wall cabinets above the counter')}>
                  <input type="checkbox" checked={kitchenUppers} onChange={(e) => setKitchenUppers(e.target.checked)} />
                  {t('Wall cabinets')}
                </label>
              )}
              <button className="finish-btn" onClick={() => drawBridge.finish?.()}>
                ✓ {t('Finish')}
              </button>
              <button className="cancel-btn" onClick={() => drawBridge.cancel?.()} aria-label={coarsePointer ? t('Cancel') : 'Cancel drawing'}>
                {coarsePointer ? '✕' : 'Esc'}
              </button>
            </div>
          )}

          {placementAvailable && !drawing && (
            <div className={`placement-affordance ${view === '3d' ? 'in-3d' : ''}`} role="status">
              <Sofa className="icon" />
              <span>
                {view === '3d'
                  ? `${t('Tap a floor to place')} ${t(pendingEntry.name)}`
                  : pendingEntry.opening
                    ? `${t('Tap a wall to place')} ${t(pendingEntry.name)}`
                    : `${t('Tap the plan to place')} ${t(pendingEntry.name)}`}
              </span>
              <button onClick={cancelPlacement} aria-label={t('Cancel placement')} title={t('Cancel placement')}>
                <X className="icon" />
              </button>
            </div>
          )}

          {view === '2d' && (
            <div className="hud hud-2d">
              <div className="pill">
                <label className="toggle" title={t('Grid')}>
                  <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} />
                  <Grid3x3 className="icon" style={{ width: 15, height: 15 }} /> <span className="hud-txt">{t('Grid')}</span>
                </label>
                <label className="toggle" title={t('Dimensions')}>
                  <input type="checkbox" checked={showDimensions} onChange={(e) => setShowDimensions(e.target.checked)} />
                  <Ruler className="icon" style={{ width: 15, height: 15 }} /> <span className="hud-txt">{t('Dimensions')}</span>
                </label>
                <label className="toggle" title={t('Lock objects so they cannot be moved')}>
                  <input type="checkbox" checked={moveLock} onChange={(e) => setMoveLock(e.target.checked)} />
                  <Lock className="icon" style={{ width: 15, height: 15 }} /> <span className="hud-txt">{t('Lock')}</span>
                </label>
              </div>
              <div className="pill units-pill" role="group" aria-label="Display units">
                <button
                  className={units === 'metric' ? 'unit active' : 'unit'}
                  onClick={() => setUnits('metric')}
                  aria-pressed={units === 'metric'}
                  title="Metric (m / cm)"
                >
                  m
                </button>
                <button
                  className={units === 'imperial' ? 'unit active' : 'unit'}
                  onClick={() => setUnits('imperial')}
                  aria-pressed={units === 'imperial'}
                  title="Imperial (ft / in)"
                >
                  ft
                </button>
              </div>
            </div>
          )}

          {/* 2D zoom on the right edge (mirrors 3D) so the bottom HUD row isn't
              crowded and the units pill no longer clips off-screen. */}
          {view === '2d' && (
            <div className="zoom-buttons" role="group" aria-label="Zoom">
              <button onClick={() => setZoom(zoom * 1.2)} aria-label="Zoom in" title="Zoom in">
                <Plus className="icon" />
              </button>
              <button onClick={() => setZoom(zoom / 1.2)} aria-label="Zoom out" title="Zoom out">
                <Minus className="icon" />
              </button>
              <button onClick={() => useDesign.getState().requestFit()} aria-label="Fit to view" title="Fit to view">
                <Maximize2 className="icon" />
              </button>
            </div>
          )}

          {view === '3d' && !walkMode && isWebGLAvailable() && (
            <>
              <div className="hud hud-3d">
                {/* Desktop: Dollhouse/Walk + Lighting shown inline. On phones
                    these fold into the single "View" popover below so the HUD
                    is one compact pill that can't run off the screen edge. */}
                <div className="hud-inline">
                <div className="pill">
                  <label className="toggle">
                    <input type="checkbox" checked={dollhouse} onChange={(e) => setDollhouse(e.target.checked)} />
                    <House className="icon" style={{ width: 15, height: 15 }} /> {t('Dollhouse')}
                  </label>
                  <button className="toggle" onClick={() => setWalkMode(true)} style={{ fontWeight: 600 }}>
                    <Footprints className="icon" style={{ width: 16, height: 16 }} /> {t('Walk through')}
                  </button>
                  <label className="toggle" title={t('Lock objects so they cannot be moved')}>
                    <input type="checkbox" checked={moveLock} onChange={(e) => setMoveLock(e.target.checked)} />
                    <Lock className="icon" style={{ width: 15, height: 15 }} /> {t('Lock')}
                  </label>
                </div>
                {/* Lighting folds the lamps toggle + time-of-day slider into a
                    popover so the HUD stays compact on phones (it used to run
                    off the right edge). */}
                <div className="pill light-pill export-wrap" ref={lightingRef}>
                  <button
                    className="toggle"
                    aria-haspopup="menu"
                    aria-expanded={lightingOpen}
                    onClick={() => setLightingOpen((o) => !o)}
                    title={t('Lighting')}
                  >
                    {sunTime < 6 || sunTime >= 20 ? (
                      <Moon className="icon" style={{ width: 15, height: 15 }} />
                    ) : (
                      <Sun className="icon" style={{ width: 15, height: 15 }} />
                    )}
                    {t('Lighting')}
                  </button>
                  {lightingOpen && (
                    <div className="export-menu lighting-menu" role="menu">
                      <button
                        className={`toggle ${lightsOn ? 'on' : ''}`}
                        onClick={() => setLightsOn(!lightsOn)}
                      >
                        <Lightbulb className="icon" style={{ width: 15, height: 15 }} /> {t('Lights')}
                      </button>
                      <label className="sun-slider" title={t('Time of day')}>
                        {sunTime < 6 || sunTime >= 20 ? (
                          <Moon className="icon" style={{ width: 15, height: 15 }} />
                        ) : (
                          <Sun className="icon" style={{ width: 15, height: 15 }} />
                        )}
                        <input
                          type="range"
                          min={0}
                          max={24}
                          step={0.5}
                          value={sunTime}
                          onChange={(e) => setSunTime(Number(e.target.value))}
                          aria-label={t('Time of day')}
                        />
                        <span className="sun-time">{`${String(Math.floor(sunTime)).padStart(2, '0')}:${sunTime % 1 ? '30' : '00'}`}</span>
                      </label>
                    </div>
                  )}
                </div>
                </div>

                {/* Phones: one grouped "View" pill folds Dollhouse + Walk +
                    Lighting into a single popover so the 3D HUD is one compact
                    control that fits beside the Edit tab (was clipping before). */}
                <div className="pill view-pill export-wrap" ref={viewRef}>
                  <button
                    className="toggle"
                    aria-haspopup="menu"
                    aria-expanded={viewOpen}
                    onClick={() => setViewOpen((o) => !o)}
                    title={t('View')}
                  >
                    <House className="icon" style={{ width: 15, height: 15 }} /> {t('View')}
                    <ChevronDown className="icon caret" style={{ width: 14, height: 14 }} />
                  </button>
                  {viewOpen && (
                    <div className="export-menu view-menu" role="menu">
                      <label className="toggle">
                        <input type="checkbox" checked={dollhouse} onChange={(e) => setDollhouse(e.target.checked)} />
                        <House className="icon" style={{ width: 15, height: 15 }} /> {t('Dollhouse')}
                      </label>
                      <label className="toggle">
                        <input type="checkbox" checked={moveLock} onChange={(e) => setMoveLock(e.target.checked)} />
                        <Lock className="icon" style={{ width: 15, height: 15 }} /> {t('Lock objects')}
                      </label>
                      <button
                        className="toggle"
                        onClick={() => { setViewOpen(false); setWalkMode(true); }}
                      >
                        <Footprints className="icon" style={{ width: 16, height: 16 }} /> {t('Walk through')}
                      </button>
                      <div className="view-menu-sep" />
                      <button
                        className={`toggle ${lightsOn ? 'on' : ''}`}
                        onClick={() => setLightsOn(!lightsOn)}
                      >
                        <Lightbulb className="icon" style={{ width: 15, height: 15 }} /> {t('Lights')}
                      </button>
                      <label className="sun-slider" title={t('Time of day')}>
                        {sunTime < 6 || sunTime >= 20 ? (
                          <Moon className="icon" style={{ width: 15, height: 15 }} />
                        ) : (
                          <Sun className="icon" style={{ width: 15, height: 15 }} />
                        )}
                        <input
                          type="range"
                          min={0}
                          max={24}
                          step={0.5}
                          value={sunTime}
                          onChange={(e) => setSunTime(Number(e.target.value))}
                          aria-label={t('Time of day')}
                        />
                        <span className="sun-time">{`${String(Math.floor(sunTime)).padStart(2, '0')}:${sunTime % 1 ? '30' : '00'}`}</span>
                      </label>
                    </div>
                  )}
                </div>
                {/* Phones: Lock stays directly visible beside View — buried in
                    the popover alone, testers reported "no lock button in 3D". */}
                <div className="pill lock-pill-3d">
                  <label className="toggle" title={t('Lock objects so they cannot be moved')}>
                    <input type="checkbox" checked={moveLock} onChange={(e) => setMoveLock(e.target.checked)} />
                    <Lock className="icon" style={{ width: 15, height: 15 }} /> {t('Lock')}
                  </label>
                </div>
              </div>
              <div className="render-actions">
                <button
                  className={`render-btn objects3d-btn ${tool === 'furniture' ? 'active' : ''}`}
                  onClick={() => {
                    if (tool === 'furniture') cancelPlacement();
                    else {
                      setTool('furniture');
                      setDrawer('catalog');
                    }
                  }}
                  aria-pressed={tool === 'furniture'}
                >
                  <Sofa className="icon" />
                  <span>{t('Objects')}</span>
                </button>
                <div className="export-wrap" ref={renderMenuRef}>
                  <button
                    className="render-btn"
                    onClick={() => setRenderMenuOpen((o) => !o)}
                    disabled={rendering}
                    aria-haspopup="menu"
                    aria-expanded={renderMenuOpen}
                    title={t('Render image')}
                  >
                    {rendering ? <span className="spin" /> : <ImageIcon className="icon" />}
                    <span>{rendering ? t('Rendering…') : t('Render image')}</span>
                    {!rendering && <ChevronDown className="icon caret" />}
                  </button>
                  {renderMenuOpen && (
                    <div className="export-menu render-menu" role="menu">
                      {/* Photo mode folded in here as the top quality tier —
                          it used to be its own button next to this one. */}
                      <button
                        role="menuitem"
                        onClick={() => {
                          setRenderMenuOpen(false);
                          setPhotoMode(true);
                        }}
                      >
                        <Camera className="icon" /> {t('Photo mode')}
                      </button>
                      {([[2, 'Standard'], [3, 'High'], [4, 'Ultra']] as const).map(([scale, label]) => (
                        <button
                          key={scale}
                          role="menuitem"
                          className={renderScale === scale ? 'active' : ''}
                          onClick={() => {
                            setRenderMenuOpen(false);
                            handleRender(scale);
                          }}
                        >
                          <ImageIcon className="icon" /> {t(label)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {/* Zoom the orbit camera (matches the 2D plan's zoom buttons). */}
              <div className="zoom-buttons" role="group" aria-label="Zoom">
                <button onClick={() => orbitZoom.current?.(0.8)} aria-label="Zoom in" title="Zoom in">
                  <Plus className="icon" />
                </button>
                <button onClick={() => orbitZoom.current?.(1.25)} aria-label="Zoom out" title="Zoom out">
                  <Minus className="icon" />
                </button>
              </div>
              <RotateControls />
            </>
          )}

          {/* Hidden while actively drawing: the floor buttons sit top-left and
              the centered "Tap points / Finish" pill would otherwise collide
              with them on phones (and you never switch floors mid-draw). */}
          {/* Hidden while drawing AND while a draw tool is armed in 2D: the
              armed-tool tip bubble renders top-centre and collided with the
              top-left floor pills on phones (tester screenshot, v1.0.53). */}
          {!walkMode && !drawing &&
            !(view === '2d' && (tool === 'wall' || tool === 'room' || tool === 'kitchen') && !tipsDismissed) && (
            <FloorSwitcher />
          )}
        </div>
        <PropertiesPanel open={drawer === 'props'} />
        <BuildSheet open={drawer === 'build'} onClose={() => setDrawer(null)} limited={view === '3d'} />

        {/* The Objects catalog opens as a partial-height bottom sheet, so no
            backdrop — the plan stays visible above it and tappable for placing
            furniture (Planner-5D style). Props/Build keep their modal backdrop. */}
        {drawer && drawer !== 'catalog' && (
          <div
            className="drawer-backdrop"
            onClick={() => {
              // A manual close while something is selected means "leave me
              // alone about this object" — suppress re-auto-opening it.
              if (drawer === 'props' && selection.id) suppressedIdRef.current = selection.id;
              autoOpenedRef.current = false;
              setDrawer(null);
            }}
          />
        )}
        <div className="mobile-tabs">
          <button
            className={drawer === 'build' || buildModeActive ? 'active' : ''}
            onClick={() => setDrawer(drawer === 'build' ? null : 'build')}
            aria-pressed={drawer === 'build' || buildModeActive}
          >
            <PenTool className="icon" />{' '}
            {t(activeBuildTool?.label ?? (pendingEntry?.opening ? pendingEntry.name : 'Build'))}
          </button>
          <button
            className={drawer === 'catalog' || tool === 'furniture' ? 'active' : ''}
            onClick={toggleObjects}
            aria-pressed={drawer === 'catalog' || tool === 'furniture'}
          >
            <Sofa className="icon" /> {t('Objects')}
          </button>
          <button
            className={drawer === 'props' ? 'active' : ''}
            onClick={() => {
              if (drawer === 'props') {
                if (selection.id) suppressedIdRef.current = selection.id;
                autoOpenedRef.current = false;
                setDrawer(null);
              } else {
                autoOpenedRef.current = false; // user-opened: never auto-close
                setDrawer('props');
              }
            }}
          >
            <SlidersHorizontal className="icon" /> {t('Edit')}
          </button>
        </div>
      </div>

      {showImport && (
        <Suspense fallback={null}>
          <ImportDialog onClose={() => setShowImport(false)} />
        </Suspense>
      )}

      {showAbout && <AboutDialog onClose={() => setShowAbout(false)} />}
      {showHelp && <HelpPanel onClose={() => setShowHelp(false)} onReplayTour={replayTour} />}
      {showList && <ShoppingList onClose={() => setShowList(false)} />}
      {showSettings && (
        <SettingsDialog
          onClose={() => setShowSettings(false)}
          onReplayTour={() => {
            setShowSettings(false);
            replayTour();
          }}
        />
      )}

      {offerTour && view === '2d' && !showImport && !photoMode && (
        <WelcomeTour
          onStart={() => {
            setOfferTour(false);
            setShowTour(true);
          }}
          onSkip={() => setOfferTour(false)}
        />
      )}

      {showTour && view === '2d' && !showImport && !photoMode && (
        <CoachMarks
          onDone={() => {
            try {
              localStorage.setItem('homedesigner.tour.v1', 'done');
            } catch {
              /* best-effort */
            }
            setShowTour(false);
          }}
        />
      )}

      {photoMode && isWebGLAvailable() && (
        <Suspense
          fallback={
            <div className="photo-overlay photo-loading">
              <span className="spin" /> Loading photorealistic renderer…
            </div>
          }
        >
          <PhotoMode onClose={() => setPhotoMode(false)} />
        </Suspense>
      )}

      <ProUpsellModal />
      <Toaster />
      <ConfirmHost />
    </div>
  );
}
