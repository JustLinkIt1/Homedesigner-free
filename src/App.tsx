import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import Toolbar from './components/Toolbar';
import CatalogSidebar from './components/CatalogSidebar';
import PropertiesPanel from './components/PropertiesPanel';
import Canvas2D from './components/Editor2D/Canvas2D';
import Scene3D from './components/Viewer3D/Scene3D';
import ImportDialog from './components/ImportDialog';
import WelcomeModal, { shouldWelcome } from './components/WelcomeModal';
import { useDesign } from './store/designStore';
import { sceneCapture } from './lib/renderBridge';
import { initNative } from './lib/native';

// Path tracer + its shaders are heavy — only load when Photo mode opens.
const PhotoMode = lazy(() => import('./components/Viewer3D/PhotoMode'));

export default function App() {
  const { view, tool, zoom, showGrid, setZoom, setShowGrid, dollhouse, setDollhouse, walkMode, setWalkMode, pendingFurnitureType } =
    useDesign();
  const [showImport, setShowImport] = useState(false);
  const [photoMode, setPhotoMode] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [showWelcome, setShowWelcome] = useState(() => shouldWelcome());
  const [drawer, setDrawer] = useState<null | 'catalog' | 'props'>(null);

  // Keep latest UI state for the hardware back-button handler.
  const stateRef = useRef({ photoMode, showImport, walkMode });
  stateRef.current = { photoMode, showImport, walkMode };

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
      return false;
    });
  }, []);

  const handleRender = async () => {
    if (!sceneCapture.current) return;
    setRendering(true);
    // Let the spinner paint before the synchronous high-res render blocks.
    await new Promise((r) => setTimeout(r, 30));
    try {
      await sceneCapture.current(3);
    } finally {
      setRendering(false);
    }
  };

  const tip =
    tool === 'wall'
      ? 'Click to add wall points · they chain together · Enter to finish · Esc to cancel'
      : tool === 'room'
      ? 'Click corners to outline a room · click the first point to close it'
      : tool === 'furniture' && pendingFurnitureType
      ? 'Click in the plan to place the object · switch to Select to move & rotate it'
      : tool === 'erase'
      ? 'Click any wall, room or object to delete it'
      : null;

  return (
    <div className="app">
      <Toolbar onImport={() => setShowImport(true)} />
      <div className="body">
        {view === '2d' && <CatalogSidebar open={drawer === 'catalog'} />}
        <div className="stage-wrap">
          {view === '2d' ? <Canvas2D /> : <Scene3D />}

          {view === '2d' && tip && <div className="tip">{tip}</div>}

          {view === '2d' && (
            <div className="hud">
              <div className="pill">
                <button onClick={() => setZoom(zoom / 1.2)} title="Zoom out">−</button>
                <span>{Math.round(zoom * 100)}%</span>
                <button onClick={() => setZoom(zoom * 1.2)} title="Zoom in">+</button>
                <button onClick={() => useDesign.getState().requestFit()} title="Fit to view">⤢</button>
              </div>
              <div className="pill">
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={showGrid}
                    onChange={(e) => setShowGrid(e.target.checked)}
                  />
                  Grid &amp; snap
                </label>
              </div>
            </div>
          )}

          {view === '3d' && !walkMode && (
            <>
              <div className="hud">
                <div className="pill">Drag to orbit · scroll to zoom · right-drag to pan</div>
                <div className="pill">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={dollhouse}
                      onChange={(e) => setDollhouse(e.target.checked)}
                    />
                    🏠 Dollhouse
                  </label>
                </div>
                <button className="pill walk-toggle" onClick={() => setWalkMode(true)}>
                  🚶 Walk through
                </button>
              </div>
              <div className="render-actions">
                <button className="render-btn" onClick={handleRender} disabled={rendering}>
                  {rendering ? <span className="spin" /> : '🖼️'}
                  <span>{rendering ? 'Rendering…' : 'Render image'}</span>
                </button>
                <button className="render-btn photo" onClick={() => setPhotoMode(true)}>
                  <span>📷</span>
                  <span>Photo mode</span>
                </button>
              </div>
            </>
          )}
        </div>
        <PropertiesPanel open={drawer === 'props'} />

        {drawer && <div className="drawer-backdrop" onClick={() => setDrawer(null)} />}
        <div className="mobile-tabs">
          {view === '2d' && (
            <button
              className={drawer === 'catalog' ? 'active' : ''}
              onClick={() => setDrawer(drawer === 'catalog' ? null : 'catalog')}
            >
              🛋️ Objects
            </button>
          )}
          <button
            className={drawer === 'props' ? 'active' : ''}
            onClick={() => setDrawer(drawer === 'props' ? null : 'props')}
          >
            ⚙️ Edit
          </button>
        </div>
      </div>

      {showWelcome && (
        <WelcomeModal
          onImport={() => setShowImport(true)}
          onClose={() => setShowWelcome(false)}
        />
      )}

      {showImport && <ImportDialog onClose={() => setShowImport(false)} />}

      {photoMode && (
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
    </div>
  );
}
