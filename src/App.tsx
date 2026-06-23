import { useState } from 'react';
import Toolbar from './components/Toolbar';
import CatalogSidebar from './components/CatalogSidebar';
import PropertiesPanel from './components/PropertiesPanel';
import Canvas2D from './components/Editor2D/Canvas2D';
import Scene3D from './components/Viewer3D/Scene3D';
import ImportDialog from './components/ImportDialog';
import { useDesign } from './store/designStore';

export default function App() {
  const { view, tool, zoom, showGrid, setZoom, setShowGrid, pendingFurnitureType } = useDesign();
  const [showImport, setShowImport] = useState(false);

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
            <div className="hud">
              <div className="pill">Drag to orbit · scroll to zoom · right-drag to pan</div>
            </div>
          )}
        </div>
        <PropertiesPanel />
      </div>

      {showImport && <ImportDialog onClose={() => setShowImport(false)} />}
    </div>
  );
}
