import { Suspense, lazy, useEffect, useRef, useState } from 'react';
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
  Sofa,
  SlidersHorizontal,
  Lightbulb,
  Sun,
  Moon,
} from 'lucide-react';
import Toolbar from './components/Toolbar';
import ToolDock from './components/ToolDock';
import CatalogSidebar from './components/CatalogSidebar';
import PropertiesPanel from './components/PropertiesPanel';
import Canvas2D from './components/Editor2D/Canvas2D';
import FloorSwitcher from './components/FloorSwitcher';
import AboutDialog from './components/AboutDialog';
import HelpPanel from './components/HelpPanel';
import ProUpsellModal from './components/ProUpsellModal';
import ProjectsScreen from './components/ProjectsScreen';
import { useProStore } from './store/proStore';
import { Toaster, ConfirmHost } from './components/Overlays';
import { useDesign } from './store/designStore';
import { CATALOG_BY_TYPE } from './data/furnitureCatalog';
import { sceneCapture, planCapture } from './lib/renderBridge';
import { useDraw, drawBridge } from './lib/ui';
import { initNative } from './lib/native';
import { isWebGLAvailable } from './lib/webgl';
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
    view, tool, zoom, showGrid, setZoom, setShowGrid,
    showDimensions, setShowDimensions, dollhouse, setDollhouse,
    walkMode, setWalkMode, pendingFurnitureType,
    units, setUnits,
    sunTime, setSunTime, lightsOn, setLightsOn,
  } = useDesign();
  const [showImport, setShowImport] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [photoMode, setPhotoMode] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [renderScale, setRenderScale] = useState(3); // supersample factor for captures
  const [drawer, setDrawer] = useState<null | 'catalog' | 'props'>(null);
  // Projects home first — the editor opens a specific project.
  const [screen, setScreen] = useState<'projects' | 'editor'>('projects');
  const drawing = useDraw((s) => s.active);

  // Keep latest UI state for the hardware back-button handler.
  const stateRef = useRef({ photoMode, showImport, walkMode, screen });
  stateRef.current = { photoMode, showImport, walkMode, screen };

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
  }, []);

  const handleRender = async () => {
    if (!sceneCapture.current) return;
    setRendering(true);
    // Let the spinner paint before the synchronous high-res render blocks.
    await new Promise((r) => setTimeout(r, 30));
    try {
      await sceneCapture.current(renderScale);
    } finally {
      setRendering(false);
    }
  };

  const tip = drawing
    ? null // the Finish affordance takes over while actively drawing
    : tool === 'wall'
    ? 'Click to add wall points — or type a length (e.g. 4.5) and press Enter for exact walls'
    : tool === 'room'
    ? 'Click corners to outline a room · click the first point to close it'
    : tool === 'furniture' && pendingFurnitureType
    ? 'Click in the plan to place it · switch to Select to move & rotate'
    : tool === 'erase'
    ? 'Click any wall, room or object to delete it'
    : tool === 'measure'
    ? 'Measure a wall, then enter its real length to scale the whole drawing · Esc to clear'
    : null;

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
        onHome={goHome}
      />
      <div className="body">
        {view === '2d' && (
          <CatalogSidebar
            open={drawer === 'catalog'}
            // Furniture mode docks the catalog in — but not while an opening
            // (door/window) is the armed type: those place from the build-mode
            // dock flyout and shouldn't reflow the canvas with the catalog.
            docked={tool === 'furniture' && !CATALOG_BY_TYPE[pendingFurnitureType ?? '']?.opening}
          />
        )}
        <div className="stage-wrap">
          {view === '2d' ? (
            <Canvas2D />
          ) : !isWebGLAvailable() ? (
            <div className="stage-loading webgl-missing">
              <p>
                3D view isn't available on this device — it needs WebGL, which your
                browser/graphics driver doesn't provide. The 2D editor still works fully.
              </p>
            </div>
          ) : (
            <Suspense fallback={<div className="stage-loading"><span className="spin" /> Loading 3D…</div>}>
              <Scene3D />
            </Suspense>
          )}

          {view === '2d' && <ToolDock />}
          {view === '2d' && tip && <div className="tip">{tip}</div>}
          {view === '2d' && drawing && (
            <div className="draw-affordance">
              <span>{tool === 'room' ? 'Click the first point or' : 'Double-click or'} press Enter to finish</span>
              <button className="finish-btn" onClick={() => drawBridge.finish?.()}>
                ✓ Finish
              </button>
              <button className="cancel-btn" onClick={() => drawBridge.cancel?.()} aria-label="Cancel drawing">
                Esc
              </button>
            </div>
          )}

          {view === '2d' && (
            <div className="hud">
              <div className="pill">
                <button onClick={() => setZoom(zoom / 1.2)} title="Zoom out"><Minus className="icon" style={{ width: 16, height: 16 }} /></button>
                <span className="val">{Math.round(zoom * 100)}%</span>
                <button onClick={() => setZoom(zoom * 1.2)} title="Zoom in"><Plus className="icon" style={{ width: 16, height: 16 }} /></button>
                <button onClick={() => useDesign.getState().requestFit()} title="Fit to view"><Maximize2 className="icon" style={{ width: 15, height: 15 }} /></button>
              </div>
              <div className="pill">
                <label className="toggle">
                  <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} />
                  <Grid3x3 className="icon" style={{ width: 15, height: 15 }} /> Grid
                </label>
                <label className="toggle">
                  <input type="checkbox" checked={showDimensions} onChange={(e) => setShowDimensions(e.target.checked)} />
                  <Ruler className="icon" style={{ width: 15, height: 15 }} /> Dimensions
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

          {view === '3d' && !walkMode && isWebGLAvailable() && (
            <>
              <div className="hud">
                <div className="pill">
                  <label className="toggle">
                    <input type="checkbox" checked={dollhouse} onChange={(e) => setDollhouse(e.target.checked)} />
                    <House className="icon" style={{ width: 15, height: 15 }} /> Dollhouse
                  </label>
                  <button className="toggle" onClick={() => setWalkMode(true)} style={{ fontWeight: 600 }}>
                    <Footprints className="icon" style={{ width: 16, height: 16 }} /> Walk through
                  </button>
                </div>
                <div className="pill light-pill">
                  <button
                    className={`toggle ${lightsOn ? 'on' : ''}`}
                    onClick={() => setLightsOn(!lightsOn)}
                    title="Toggle artificial lights (lamps, LEDs)"
                  >
                    <Lightbulb className="icon" style={{ width: 15, height: 15 }} /> Lights
                  </button>
                  <label className="sun-slider" title="Time of day — sunlight angle & warmth">
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
                      aria-label="Time of day"
                    />
                    <span className="sun-time">{`${String(Math.floor(sunTime)).padStart(2, '0')}:${sunTime % 1 ? '30' : '00'}`}</span>
                  </label>
                </div>
              </div>
              <div className="render-actions">
                <select
                  className="render-scale"
                  value={renderScale}
                  onChange={(e) => setRenderScale(Number(e.target.value))}
                  aria-label="Render quality"
                  title="Render quality"
                >
                  <option value={2}>Standard</option>
                  <option value={3}>High</option>
                  <option value={4}>Ultra</option>
                </select>
                <button className="render-btn" onClick={handleRender} disabled={rendering}>
                  {rendering ? <span className="spin" /> : <ImageIcon className="icon" />}
                  <span>{rendering ? 'Rendering…' : 'Render image'}</span>
                </button>
                <button className="render-btn photo" onClick={() => setPhotoMode(true)}>
                  <Camera className="icon" />
                  <span>Photo mode</span>
                </button>
              </div>
            </>
          )}

          {!walkMode && <FloorSwitcher />}
        </div>
        <PropertiesPanel open={drawer === 'props'} />

        {drawer && <div className="drawer-backdrop" onClick={() => setDrawer(null)} />}
        <div className="mobile-tabs">
          {view === '2d' && (
            <button
              className={drawer === 'catalog' ? 'active' : ''}
              onClick={() => setDrawer(drawer === 'catalog' ? null : 'catalog')}
            >
              <Sofa className="icon" /> Objects
            </button>
          )}
          <button
            className={drawer === 'props' ? 'active' : ''}
            onClick={() => setDrawer(drawer === 'props' ? null : 'props')}
          >
            <SlidersHorizontal className="icon" /> Edit
          </button>
        </div>
      </div>

      {showImport && (
        <Suspense fallback={null}>
          <ImportDialog onClose={() => setShowImport(false)} />
        </Suspense>
      )}

      {showAbout && <AboutDialog onClose={() => setShowAbout(false)} />}
      {showHelp && <HelpPanel onClose={() => setShowHelp(false)} />}

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
