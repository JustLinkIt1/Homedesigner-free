import { useRef, useState } from 'react';
import { useDesign } from '../store/designStore';
import { renderPlanFile, type RenderedPlan } from '../lib/pdfImport';
import { importDxf } from '../lib/dxfImport';
import { traceWalls } from '../lib/autoTrace';
import { segmentsToWalls } from '../lib/wallBuilder';

type Stage = 'pick' | 'raster' | 'dxf' | 'busy';

export default function ImportDialog({ onClose }: { onClose: () => void }) {
  const s = useDesign();
  const fileRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>('pick');
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // raster (pdf/image) state
  const [rendered, setRendered] = useState<RenderedPlan | null>(null);
  const [realWidthM, setRealWidthM] = useState(12);
  const [sensitivity, setSensitivity] = useState(150); // luminance threshold
  const [minLenCm, setMinLenCm] = useState(40);
  const [traceInfo, setTraceInfo] = useState<string | null>(null);

  // dxf state
  const [dxfText, setDxfText] = useState<string | null>(null);
  const [dxfInfo, setDxfInfo] = useState<{ count: number; unit: number } | null>(null);

  const cmPerPx = rendered ? (realWidthM * 100) / rendered.width : 1;

  const handleFile = async (file: File) => {
    setError(null);
    const isDxf = /\.dxf$/i.test(file.name);
    try {
      if (isDxf) {
        const text = await file.text();
        setDxfText(text);
        const res = importDxf(text, {
          wallHeight: s.defaultWallHeight,
          wallThickness: s.defaultWallThickness,
        });
        setDxfInfo({ count: res.walls.length, unit: res.unitScale });
        setStage('dxf');
      } else {
        setStage('busy');
        const r = await renderPlanFile(file);
        setRendered(r);
        // Default placement & calibration.
        s.setBackground({
          src: r.src,
          imgWidth: r.width,
          imgHeight: r.height,
          x: 0,
          y: 0,
          scale: (12 * 100) / r.width,
          rotation: 0,
          opacity: 0.5,
        });
        setStage('raster');
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Could not read that file.');
      setStage('pick');
    }
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  };

  const recalibrate = () => {
    if (rendered) s.updateBackground({ scale: cmPerPx });
  };

  const runTrace = (replace: boolean) => {
    if (!rendered) return;
    recalibrate();
    const segs = traceWalls(rendered.imageData, {
      threshold: sensitivity,
      minLength: minLenCm / cmPerPx,
    });
    const walls = segmentsToWalls(segs, cmPerPx, { x: 0, y: 0 }, {
      height: s.defaultWallHeight,
      thickness: s.defaultWallThickness,
    });
    if (walls.length === 0) {
      setTraceInfo('No walls detected — try lowering Min length or raising Sensitivity.');
      return;
    }
    s.importWalls(walls, replace);
    s.detectRoomsFromWalls(); // auto-create floors from the traced walls
    s.requestFit();
    s.setView('2d');
    onClose();
  };

  const importDxfWalls = () => {
    if (!dxfText) return;
    const res = importDxf(dxfText, {
      wallHeight: s.defaultWallHeight,
      wallThickness: s.defaultWallThickness,
    });
    s.importWalls(res.walls, true);
    s.detectRoomsFromWalls(); // auto-create floors from the imported walls
    s.requestFit();
    s.setView('2d');
    onClose();
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          📐 Import a 2D plan
        </div>
        <div className="modal-body">
          {stage === 'pick' && (
            <>
              <div
                className={`dropzone ${drag ? 'drag' : ''}`}
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDrag(true);
                }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDrag(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) handleFile(f);
                }}
              >
                <div className="big">⬆️</div>
                <p>
                  <strong>Drop a file here</strong> or click to browse
                </p>
                <p className="muted">
                  PDF &amp; images → traced over with auto wall detection.<br />
                  DXF (CAD) → walls imported automatically as real geometry.
                </p>
              </div>
              {error && <p style={{ color: 'var(--danger)', marginTop: 12 }}>{error}</p>}
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.dxf,image/*"
                style={{ display: 'none' }}
                onChange={onPick}
              />
            </>
          )}

          {stage === 'busy' && (
            <div style={{ textAlign: 'center', padding: 30 }}>
              <span className="spin" /> <span className="muted">Rendering plan…</span>
            </div>
          )}

          {stage === 'raster' && rendered && (
            <>
              <img className="preview-img" src={rendered.src} alt="plan preview" />
              <div className="field">
                <label>Real-world width of the plan: <span className="field-val">{realWidthM} m</span></label>
                <input
                  type="range"
                  min={3}
                  max={40}
                  step={0.5}
                  value={realWidthM}
                  onChange={(e) => setRealWidthM(Number(e.target.value))}
                  onMouseUp={recalibrate}
                />
                <p className="muted">Sets the scale so dimensions come out correct (~{cmPerPx.toFixed(1)} cm/px).</p>
              </div>
              <div className="field">
                <label>Detection sensitivity: <span className="field-val">{sensitivity}</span></label>
                <input
                  type="range"
                  min={80}
                  max={220}
                  step={5}
                  value={sensitivity}
                  onChange={(e) => setSensitivity(Number(e.target.value))}
                />
              </div>
              <div className="field">
                <label>Min wall length: <span className="field-val">{minLenCm} cm</span></label>
                <input
                  type="range"
                  min={15}
                  max={150}
                  step={5}
                  value={minLenCm}
                  onChange={(e) => setMinLenCm(Number(e.target.value))}
                />
              </div>
              {traceInfo && <p style={{ color: 'var(--accent-2)' }}>{traceInfo}</p>}
            </>
          )}

          {stage === 'dxf' && dxfInfo && (
            <div>
              <p className="muted">
                Parsed the DXF and found <strong style={{ color: 'var(--text)' }}>{dxfInfo.count}</strong>{' '}
                wall segments.
              </p>
              <p className="muted">
                Estimated unit scale: <strong style={{ color: 'var(--text)' }}>{dxfInfo.unit} cm</strong> per drawing
                unit (auto-detected). Walls will be created as editable geometry.
              </p>
            </div>
          )}
        </div>

        <div className="modal-foot">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          {stage === 'raster' && (
            <>
              <button className="btn" onClick={() => { recalibrate(); onClose(); }}>
                Use as tracing background
              </button>
              <button className="btn primary" onClick={() => runTrace(true)}>
                Auto-trace walls
              </button>
            </>
          )}
          {stage === 'dxf' && (
            <button className="btn primary" onClick={importDxfWalls} disabled={!dxfInfo?.count}>
              Import {dxfInfo?.count ?? 0} walls
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
