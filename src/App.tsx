import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
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
  Crown,
  RotateCcw,
  RotateCw,
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
import ShoppingList from './components/ShoppingList';
import ProUpsellModal from './components/ProUpsellModal';
import ProjectsScreen from './components/ProjectsScreen';
import IntroVideo from './components/IntroVideo';
import FurnitureLockIcon from './components/FurnitureLockIcon';
import MobileSelectionDock from './components/MobileSelectionDock';
import { useProStore } from './store/proStore';
import { useAuthStore } from './store/authStore';
import { requirePro } from './lib/pro';
import { Toaster, ConfirmHost } from './components/Overlays';
import UpdateBanner from './components/UpdateBanner';
import TooltipHost from './components/TooltipHost';
import { useDesign } from './store/designStore';
import { CATALOG_BY_TYPE } from './data/furnitureCatalog';
import { TOOLS } from './data/tools';
import { sceneCapture } from './lib/renderBridge';
import { capturePlanThumbnail } from './lib/thumb';
import { useDraw, drawBridge, useConfirm, toast } from './lib/ui';
import { initNative } from './lib/native';
import { isWebGLAvailable } from './lib/webgl';
import { orbitZoom } from './lib/renderBridge';
import { useI18n, t as translate } from './lib/i18n';

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
    background, updateBackground,
    rotateDesign,
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
    background: s.background,
    updateBackground: s.updateBackground,
    setMoveLock: s.setMoveLock,
    rotateDesign: s.rotateDesign,
  })));
  const t = useI18n();
  const selectedFurnitureType = useDesign((s) =>
    s.selection.kind === 'furniture'
      ? s.furniture.find((item) => item.id === s.selection.id)?.type ?? null
      : null,
  );
  const isPro = useProStore((st) => st.isPro);
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
  // Re-probed on demand. isWebGLAvailable() caches only SUCCESS, so it will
  // happily succeed later — but nothing re-renders on its own after a GPU
  // hiccup, which stranded a tester on a permanent "not available" screen.
  const [glRetry, setGlRetry] = useState(0);
  // Projects home first — the editor opens a specific project.
  const [screen, setScreen] = useState<'projects' | 'editor'>('projects');
  // eslint-disable-next-line react-hooks/exhaustive-deps -- glRetry is the probe trigger
  const webglOk = useMemo(() => isWebGLAvailable(), [glRetry]);
  const drawing = useDraw((s) => s.active);
  const calibrating = useDraw((s) => s.calibrating);
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

  // Touch selections stay in the plan and expose a reachable quick-action dock.
  const coarsePointer = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
  // Regular furniture uses Claude's object-anchored SelectionRing. The dock is
  // reserved for stairs/openings/structure, where contextual actions such as
  // reverse, hinge and swing cannot be expressed by the generic ring.
  const contextualDockSelection =
    selection.kind !== 'furniture' || selectedFurnitureType === 'stairs';

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
    // Take the user to where the tour can actually run before showing it.
    // CoachMarks renders only in the editor's 2D view, and every step it points
    // at (.tool-dock, .view-toggle, .mobile-tabs) exists nowhere else — so
    // "Show intro again" pressed from the projects screen, or from 3D, used to
    // set a flag that nothing rendered and appeared to do nothing at all.
    setScreen('editor');
    if (useDesign.getState().view !== '2d') useDesign.getState().setView('2d');
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
    // Capture the plan while the 2D canvas is still mounted, THEN switch screens.
    capturePlanThumbnail();
    setScreen('projects');
  };

  // Leaving the 3D view always exits walk mode (e.g. switching to 2D).
  useEffect(() => {
    if (view !== '3d' && walkMode) setWalkMode(false);
  }, [view, walkMode, setWalkMode]);

  // `/buy` on the marketing site sends buyers to `/app/?buy=pro`. Open the Pro
  // sheet on arrival so the checkout they were promised is the first thing they
  // see, and drop the parameter so a refresh or a shared link does not reopen
  // it. Nothing to do for someone who already owns Pro — the sheet would not
  // render anyway (`upsellOpen && !isPro`), so just clean the URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('buy') !== 'pro') return;
    if (!useProStore.getState().isPro) useProStore.getState().openUpsell();
    params.delete('buy');
    const query = params.toString();
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`,
    );
  }, []);

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
      if (useProStore.getState().upsellOpen) {
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
    }, () => {
      // Back in the foreground, which is the only moment two different things
      // become knowable.
      //
      // First: a purchase whose result Play never delivered. The billing sheet
      // takes over the screen, so the app was backgrounded for it; if we are
      // still `busy` now that the user is back, no callback is coming and the
      // buy button would otherwise spin until the provider's timeout.
      // Second: a Play promo code redeemed in the Play Store app. RevenueCat
      // performs its own foreground purchase query; recheck() reads the
      // resulting entitlement without starting a competing syncPurchases().
      //
      // settleStranded() runs first and no-ops unless a flow is actually in
      // flight; recheck() then covers the promo case and is rate limited.
      void useProStore.getState().settleStranded().then((freed) => {
        if (freed) toast.success(translate('Pro unlocked — thank you!'));
        return useProStore.getState().recheck();
      }).then((unlocked) => {
        if (unlocked) toast.success(translate('Pro unlocked — thank you!'));
      });
    });
    // Resolve the Pro entitlement (billing on Android, mock on web).
    void useProStore.getState().refresh().finally(() => {
      void useAuthStore.getState().restoreSession();
    });
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
    } catch {
      toast.error(t('Render failed — try a lower quality'));
    } finally {
      setRendering(false);
    }
  };

  const tip = drawing
    ? null // the Finish affordance takes over while actively drawing
    : tool === 'wall'
    ? t('Click to add wall points — or type a length (e.g. 4.5) and press Enter for exact walls')
    : tool === 'halfWall'
    ? t('Click to add low divider points — ideal for kitchens, stairs and open-plan spaces')
    : tool === 'fence'
    ? t('Click to run a fence line — pick its style and height in Properties once drawn')
    : tool === 'room'
    ? t('Click corners to outline a room · click the first point to close it')
    : tool === 'kitchen'
    ? t('Click along a wall, then click again — base cabinets tile the run and face the room')
    : tool === 'furniture' && pendingFurnitureType
    ? t('Click in the plan to place it · switch to Select to move & rotate')
    : tool === 'erase'
    ? t('Click any wall, room or object to delete it')
    : tool === 'measure'
    ? calibrating
      ? null // the scale-calibration card takes over the top-centre slot
      : t('Measure a wall, then enter its real length to scale the whole drawing · Esc to clear')
    : tool === 'select' && walls.length === 0
    ? t('Pick a tool to start — try ✏️ Draw walls')
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
        <IntroVideo />
        <ProjectsScreen
          onOpenEditor={() => setScreen('editor')}
          onImport={() => setShowImport(true)}
          onHelp={() => setShowHelp(true)}
          onSettings={() => setShowSettings(true)}
        />
        {showImport && (
          <Suspense fallback={null}>
            <ImportDialog onClose={() => setShowImport(false)} />
          </Suspense>
        )}
        <AboutDialog open={showAbout} onClose={() => setShowAbout(false)} />
        <HelpPanel open={showHelp} onClose={() => setShowHelp(false)} onReplayTour={replayTour} />
        <SettingsDialog
          open={showSettings}
          onClose={() => setShowSettings(false)}
          onReplayTour={() => {
            setShowSettings(false);
            replayTour();
          }}
        />
        <ProUpsellModal />
        <UpdateBanner />
        <Toaster />
        <ConfirmHost />
        <TooltipHost />
      </div>
    );
  }

  return (
    <div
      className="app"
      style={{
        // How far the toast must sit above the bottom edge. A delete raises a
        // 6s Undo toast at 132px, which lands INSIDE the Objects sheet (58vh)
        // and paints over the grid at z-index 200 vs the sheet's 75 — so taps
        // meant for objects hit the toast instead, and its onTouchStart even
        // freezes the auto-dismiss. Lifting it clear keeps Undo reachable
        // without blocking the thing you are trying to tap.
        ['--toast-lift' as string]: drawer === 'catalog' ? 'calc(58vh + 12px)'
          : drawer === 'build' ? 'calc(42vh + 12px)'
          : undefined,
      }}
    >
      <IntroVideo />
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
            <Canvas2D
              onEditSelection={() => {
                setDrawer('props');
              }}
            />
          ) : !webglOk ? (
            <div className="stage-loading webgl-missing">
              <p>
                {t(
                  "3D view isn't available right now — the graphics driver didn't hand out a 3D canvas. This is often temporary. The 2D editor still works fully.",
                )}
              </p>
              {/* isWebGLAvailable() caches only SUCCESS, so it retries on every
                  call — but nothing re-renders this branch on its own, which
                  left the user staring at a permanent dead end after a GPU
                  hiccup. Reported by a tester whose device recovers if the app
                  is restarted. Bumping the key re-runs the probe. */}
              <button className="btn primary" onClick={() => setGlRetry((n) => n + 1)}>
                {t('Try again')}
              </button>
            </div>
          ) : walls.length === 0 ? (
            <div className="stage-loading stage-empty">
              <h3>{t('Nothing to show in 3D yet')}</h3>
              <p>{t('Draw some walls in the 2D plan, then switch back here to walk through your home.')}</p>
              <button className="btn primary" onClick={() => setView('2d')}>
                {t('Go to 2D plan')}
              </button>
            </div>
          ) : photoMode ? (
            // Photo mode covers the whole screen with its OWN WebGL canvas, so
            // keeping this one alive underneath bought nothing and cost a
            // second live context: measured 1 canvas / 3 contexts → 2 / 6 the
            // moment photo mode opened. On a phone that doubling is what a
            // tester hit as "the app was blocked when I tried photo mode", and
            // it is the same VRAM pressure that makes a mobile GPU drop the
            // context outright. Releasing it here means one heavy renderer at a
            // time; the scene remounts from cache when photo mode closes.
            <div className="stage-loading"><span className="spin" /></div>
          ) : (
            <Suspense fallback={<div className="stage-loading"><span className="spin" /> {t('Loading 3D…')}</div>}>
              <Scene3D
                onEditSelection={() => {
                  setDrawer('props');
                }}
              />
            </Suspense>
          )}

          {view === '2d' && <ToolDock />}
          {view === '2d' && tip && !tipsDismissed && (
            <div className="tip">
              <span>{tip}</span>
              <button
                className="tip-x"
                aria-label={t('Hide tips')}
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
          {/* Trace mode: the imported plan is the thing being manipulated, so
              it gets the same pill treatment as a draw in progress. */}
          {view === '2d' && tool === 'trace' && background && (
            <div className="draw-affordance">
              <span>
                {coarsePointer
                  ? t('Drag the plan to position it · pinch to scale and turn')
                  : t('Drag the plan to position it')}
              </span>
              <label className="draw-toggle" title={t('Stop the plan moving by accident')}>
                <input
                  type="checkbox"
                  checked={!!background.locked}
                  onChange={(e) => updateBackground({ locked: e.target.checked })}
                />
                {t('Lock plan')}
              </label>
              <button className="finish-btn" onClick={() => setTool('select')}>
                ✓ {t('Done')}
              </button>
            </div>
          )}

          {drawing && (
            <div className="draw-affordance">
              <span>
                {coarsePointer
                  ? tool === 'room'
                    ? t('Drag or tap · close on the first point, or finish')
                    : t('Drag or tap to place corners, then finish')
                  : `${tool === 'room' ? t('Click the first point or') : t('Double-click or')} ${t('press Enter to finish')}`}
              </span>
              {/* Exact dimensions in 3D ("beginner to architect"): retype the
                  just-drawn segment to a precise length. 2D keeps its inline
                  keyboard flow. */}
              {view === '3d' && (tool === 'wall' || tool === 'halfWall' || tool === 'fence' || tool === 'room') && (
                <span className="draw-length">
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0.1}
                    step={0.1}
                    placeholder={units === 'imperial' ? '10' : '3.5'}
                    aria-label={t('Exact length')}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter') return;
                      const v = parseFloat(e.currentTarget.value);
                      if (v > 0) {
                        drawBridge.setLength?.(units === 'imperial' ? v * 30.48 : v * 100);
                        e.currentTarget.value = '';
                      }
                    }}
                  />
                  {units === 'imperial' ? 'ft' : 'm'}
                </span>
              )}
              {tool === 'kitchen' && (
                <label className="draw-toggle" data-tip={t('Also add wall cabinets above the counter')} aria-label={t('Also add wall cabinets above the counter')}>
                  <input
                    type="checkbox"
                    checked={kitchenUppers && isPro}
                    onChange={(e) => {
                      // Uppers place Pro wall cabinets — gate behind the upsell.
                      if (e.target.checked && !requirePro('catalog')) return;
                      setKitchenUppers(e.target.checked);
                    }}
                  />
                  {t('Wall cabinets')}
                  {!isPro && <Crown className="icon pro-pill" style={{ width: 12, height: 12 }} />}
                </label>
              )}
              <button className="finish-btn" onClick={() => drawBridge.finish?.()}>
                ✓ {tool === 'room' ? t('Finish room') : t('Finish')}
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
              <button onClick={cancelPlacement} aria-label={t('Cancel placement')} data-tip={t('Cancel placement')}>
                <X className="icon" />
              </button>
            </div>
          )}

          {view === '2d' && (
            <div className="hud hud-2d">
              <div className="pill">
                <label className="toggle" data-tip={t('Grid')} aria-label={t('Grid')}>
                  <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} />
                  <Grid3x3 className="icon" style={{ width: 15, height: 15 }} /> <span className="hud-txt">{t('Grid')}</span>
                </label>
                <label className="toggle" data-tip={t('Dimensions')} aria-label={t('Dimensions')}>
                  <input type="checkbox" checked={showDimensions} onChange={(e) => setShowDimensions(e.target.checked)} />
                  <Ruler className="icon" style={{ width: 15, height: 15 }} /> <span className="hud-txt">{t('Dimensions')}</span>
                </label>
                <button
                  className={`toggle ${tool === 'measure' ? 'on' : ''}`}
                  data-tip={t('Measure a wall to scale the drawing')} aria-label={t('Measure a wall to scale the drawing')}
                  onClick={() => setTool(tool === 'measure' ? 'select' : 'measure')}
                  aria-pressed={tool === 'measure'}
                >
                  <Ruler className="icon" style={{ width: 15, height: 15 }} /> <span className="hud-txt">{t('Measure')}</span>
                </button>
                <label className="toggle" data-tip={t('Lock objects so they cannot be moved')} aria-label={t('Lock objects so they cannot be moved')}>
                  <input type="checkbox" checked={moveLock} onChange={(e) => setMoveLock(e.target.checked)} />
                  <FurnitureLockIcon style={{ width: 15, height: 15 }} /> <span className="hud-txt">{t('Lock')}</span>
                </label>
              </div>
              <div className="pill units-pill" role="group" aria-label={t('Display units')}>
                <button
                  className={units === 'metric' ? 'unit active' : 'unit'}
                  onClick={() => setUnits('metric')}
                  aria-pressed={units === 'metric'}
                  data-tip={t('Metric (m / cm)')} aria-label={t('Metric (m / cm)')}
                >
                  m
                </button>
                <button
                  className={units === 'imperial' ? 'unit active' : 'unit'}
                  onClick={() => setUnits('imperial')}
                  aria-pressed={units === 'imperial'}
                  data-tip={t('Imperial (ft / in)')} aria-label={t('Imperial (ft / in)')}
                >
                  ft
                </button>
              </div>
            </div>
          )}

          {/* 2D zoom on the right edge (mirrors 3D) so the bottom HUD row isn't
              crowded and the units pill no longer clips off-screen. */}
          {view === '2d' && (
            <div className="zoom-buttons" role="group" aria-label={t('Zoom')}>
              <button onClick={() => setZoom(zoom * 1.2)} aria-label={t('Zoom in')} data-tip={t('Zoom in')}>
                <Plus className="icon" />
              </button>
              <button onClick={() => setZoom(zoom / 1.2)} aria-label={t('Zoom out')} data-tip={t('Zoom out')}>
                <Minus className="icon" />
              </button>
              <button onClick={() => useDesign.getState().requestFit()} aria-label={t('Fit to view')} data-tip={t('Fit to view')}>
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
                  <label className="toggle" data-tip={t('Lock objects so they cannot be moved')} aria-label={t('Lock objects so they cannot be moved')}>
                    <input type="checkbox" checked={moveLock} onChange={(e) => setMoveLock(e.target.checked)} />
                    <FurnitureLockIcon style={{ width: 15, height: 15 }} /> {t('Lock')}
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
                    data-tip={t('Lighting')} aria-label={t('Lighting')}
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
                      <label className="sun-slider" data-tip={t('Time of day')} aria-label={t('Time of day')}>
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
                    data-tip={t('View')} aria-label={t('View')}
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
                        <FurnitureLockIcon style={{ width: 15, height: 15 }} /> {t('Lock objects')}
                      </label>
                      <button
                        className="toggle"
                        onClick={() => { setViewOpen(false); setWalkMode(true); }}
                      >
                        <Footprints className="icon" style={{ width: 16, height: 16 }} /> {t('Walk through')}
                      </button>
                      <div className="view-menu-sep" />
                      {/* Rotating the plan lives in Properties, which in 3D on a
                          phone is behind the Edit tab AND only shows with
                          nothing selected — so in practice it was unreachable
                          here. Surface it where you actually are. */}
                      <div className="view-menu-row">
                        <span className="view-menu-label">{t('Rotate plan')}</span>
                        <span className="view-menu-actions">
                          <button
                            data-tip={t('Rotate 90° left')}
                            aria-label={t('Rotate 90° left')}
                            onClick={() => rotateDesign(-90)}
                          >
                            <RotateCcw className="icon" style={{ width: 15, height: 15 }} />
                          </button>
                          <button
                            data-tip={t('Rotate 90° right')}
                            aria-label={t('Rotate 90° right')}
                            onClick={() => rotateDesign(90)}
                          >
                            <RotateCw className="icon" style={{ width: 15, height: 15 }} />
                          </button>
                        </span>
                      </div>
                      <div className="view-menu-sep" />
                      <button
                        className={`toggle ${lightsOn ? 'on' : ''}`}
                        onClick={() => setLightsOn(!lightsOn)}
                      >
                        <Lightbulb className="icon" style={{ width: 15, height: 15 }} /> {t('Lights')}
                      </button>
                      <label className="sun-slider" data-tip={t('Time of day')} aria-label={t('Time of day')}>
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
                  <label className="toggle" data-tip={t('Lock objects so they cannot be moved')} aria-label={t('Lock objects so they cannot be moved')}>
                    <input type="checkbox" checked={moveLock} onChange={(e) => setMoveLock(e.target.checked)} />
                    <FurnitureLockIcon style={{ width: 15, height: 15 }} /> {t('Lock')}
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
                    data-tip={t('Render image')} aria-label={t('Render image')}
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
              <div className="zoom-buttons" role="group" aria-label={t('Zoom')}>
                <button onClick={() => orbitZoom.current?.(0.8)} aria-label={t('Zoom in')} data-tip={t('Zoom in')}>
                  <Plus className="icon" />
                </button>
                <button onClick={() => orbitZoom.current?.(1.25)} aria-label={t('Zoom out')} data-tip={t('Zoom out')}>
                  <Minus className="icon" />
                </button>
              </div>
            </>
          )}

          {/* Hidden while actively drawing: the floor buttons sit top-left and
              the centered "Tap points / Finish" pill would otherwise collide
              with them on phones (and you never switch floors mid-draw). */}
          {/* Hidden while drawing AND while a draw tool is armed in 2D: the
              armed-tool tip bubble renders top-centre and collided with the
              top-left floor pills on phones (tester screenshot, v1.0.53). */}
          {!walkMode && !drawing &&
            !(view === '2d' && (tool === 'wall' || tool === 'halfWall' || tool === 'fence' || tool === 'room' || tool === 'kitchen') && !tipsDismissed) && (
            <FloorSwitcher />
          )}
        </div>
        <PropertiesPanel open={drawer === 'props'} />
        <BuildSheet open={drawer === 'build'} onClose={() => setDrawer(null)} limited={view === '3d'} />

        {/* The Objects catalog opens as a partial-height bottom sheet, so no
            backdrop — the plan stays visible above it and tappable for placing
            furniture (Planner-5D style). Props/Build keep their modal backdrop. */}
        {/* Always mounted and toggled by class, exactly like .build-sheet and
            .sidebar. Conditional rendering gave it no enter transition, so the
            scrim used to hard-cut in while the sheet it dims slid over 0.24s —
            the mismatch was very visible. */}
        <div
          className={`drawer-backdrop${drawer && drawer !== 'catalog' ? ' open' : ''}`}
          onClick={() => {
            setDrawer(null);
          }}
        />
        <div className="mobile-tabs">
          <button
            className={drawer === 'build' || buildModeActive ? 'active' : ''}
            onClick={() => setDrawer(drawer === 'build' ? null : 'build')}
            aria-pressed={drawer === 'build' || buildModeActive}
          >
            <PenTool className="icon" />{' '}
            <span className="mt-label">
              {t(activeBuildTool?.label ?? (pendingEntry?.opening ? pendingEntry.name : 'Build'))}
            </span>
          </button>
          <button
            className={drawer === 'catalog' || tool === 'furniture' ? 'active' : ''}
            onClick={toggleObjects}
            aria-pressed={drawer === 'catalog' || tool === 'furniture'}
          >
            <Sofa className="icon" /> <span className="mt-label">{t('Objects')}</span>
          </button>
          <button
            className={drawer === 'props' ? 'active' : ''}
            onClick={() => {
              if (drawer === 'props') {
                setDrawer(null);
              } else {
                setDrawer('props');
              }
            }}
          >
            <SlidersHorizontal className="icon" /> <span className="mt-label">{t('Edit')}</span>
          </button>
        </div>
        {coarsePointer && !walkMode && !drawing && drawer === null && selection.id && selection.kind &&
          contextualDockSelection && (view === '2d' || selection.kind !== 'furniture') && (
          <MobileSelectionDock
            onMore={() => {
              setDrawer('props');
            }}
          />
        )}
      </div>

      {showImport && (
        <Suspense fallback={null}>
          <ImportDialog onClose={() => setShowImport(false)} />
        </Suspense>
      )}

      <AboutDialog open={showAbout} onClose={() => setShowAbout(false)} />
      <HelpPanel open={showHelp} onClose={() => setShowHelp(false)} onReplayTour={replayTour} />
      <ShoppingList open={showList} onClose={() => setShowList(false)} />
      <SettingsDialog
        open={showSettings}
        onClose={() => setShowSettings(false)}
        onReplayTour={() => {
          setShowSettings(false);
          replayTour();
        }}
      />

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
      <UpdateBanner />
      <Toaster />
      <ConfirmHost />
      <TooltipHost />
    </div>
  );
}
