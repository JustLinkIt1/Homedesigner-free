import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import Toolbar from './components/Toolbar';
import CatalogSidebar from './components/CatalogSidebar';
import PropertiesPanel from './components/PropertiesPanel';
import Canvas2D from './components/Editor2D/Canvas2D';
import Scene3D from './components/Viewer3D/Scene3D';
import ImportDialog from './components/ImportDialog';
import { useDesign } from './store/designStore';
import { sceneCapture } from './lib/renderBridge';
import { initNative } from './lib/native';

// Path tracer + its shaders are heavy — only load when Photo mode opens.
const PhotoMode = lazy(() => import('./components/Viewer3D/PhotoMode'));

export default function App() {
  const { view, tool, zoom, showGrid, setZoom, setShowGrid, dollhouse, setDollhouse, pendingFurnitureType } =
    useDesign();
  const [showImport, setShowImport] = useState(false);
  const [photoMode, setPhotoMode] = useState(false);
  const [rendering, setRendering] = useState(false);

  // Keep latest UI state for the hardware back-button handler.
  const stateRef = useRef({ photoMode, showImport });
  stateRef.current = { photoMode, showImport };

  useEffect(() => {
    initNative(() => {
      const st = stateRef.current;
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
        {view === '2d' && <CatalogSidebar />}
        <div className="stage-wrap">
          {view === '2d' ? <Canvas2D /> : <Scene3D />}

          {view === '2d' && tip && <div className="tip">{tip}</div>}

          {view === '2d' && (
            <div className="hud">
              <div className="pill">
                <button onClick={() => setZoom(zoom / 1.2)} title="Zoom out">−</button>
                <span>{Math.round(zoom * 100)}%</span>
                <button onClick={() => setZoom(zoom * 1.2)} title="Zoom in">+</button>
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

          {view === '3d' && (
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
        <PropertiesPanel />
      </div>

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
