import { useEffect, useRef, useState } from 'react';
import { Ruler, UploadCloud, Wand2, SlidersHorizontal } from 'lucide-react';
import { useDesign } from '../store/designStore';
import { renderPlanFile, type RenderedPlan } from '../lib/pdfImport';
import { importDxf } from '../lib/dxfImport';
import { autoThreshold, type PixelSegment } from '../lib/autoTrace';
import { traceWallsV2 } from '../lib/wallTrace';
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
  const [autoMode, setAutoMode] = useState(true); // Otsu auto-threshold (default)
  const [sensitivity, setSensitivity] = useState(150); // luminance threshold (manual)
  const [minLenCm, setMinLenCm] = useState(40);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [traceInfo, setTraceInfo] = useState<string | null>(null);
  // Live preview of what auto-trace will produce.
  const [previewSegs, setPreviewSegs] = useState<PixelSegment[]>([]);
  const [previewCount, setPreviewCount] = useState(0);

  // dxf state
  const [dxfText, setDxfText] = useState<string | null>(null);
  const [dxfInfo, setDxfInfo] = useState<{ count: number; unit: number } | null>(null);

  const cmPerPx = rendered ? (realWidthM * 100) / rendered.width : 1;

  // Effective binarization threshold: Otsu when in auto mode, else the slider.
  const effThreshold =
    rendered && autoMode ? autoThreshold(rendered.imageData) : sensitivity;

  // Recompute the live wall preview whenever inputs change.
  useEffect(() => {
    if (stage !== 'raster' || !rendered) return;
    const segs = traceWallsV2(rendered.imageData, {
      threshold: effThreshold,
      minLength: minLenCm / cmPerPx,
    });
    setPreviewSegs(segs);
    const walls = segmentsToWalls(segs, cmPerPx, { x: 0, y: 0 }, {
      height: s.defaultWallHeight,
      thickness: s.defaultWallThickness,
    });
    setPreviewCount(walls.length);
    setTraceInfo(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, rendered, effThreshold, minLenCm, realWidthM]);

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
    const segs = traceWallsV2(rendered.imageData, {
      threshold: effThreshold,
      minLength: minLenCm / cmPerPx,
    });
    const walls = segmentsToWalls(segs, cmPerPx, { x: 0, y: 0 }, {
      height: s.defaultWallHeight,
      thickness: s.defaultWallThickness,
    });
    if (walls.length === 0) {
      setShowAdvanced(true);
      setTraceInfo('No walls detected — try turning off Auto and lowering Min length, or raise Sensitivity.');
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
          <Ruler className="icon" /> Import a 2D plan
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
                <UploadCloud className="big" />
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
              {/* Preview with detected walls overlaid so the result is visible
                  before committing — the trace re-runs live as inputs change. */}
              <div className="trace-preview">
                <img className="preview-img" src={rendered.src} alt="plan preview" />
                <svg
                  className="trace-overlay"
                  viewBox={`0 0 ${rendered.width} ${rendered.height}`}
                  preserveAspectRatio="xMidYMid meet"
                >
                  {previewSegs.map((seg, i) => (
                    <line
                      key={i}
                      x1={seg.x1}
                      y1={seg.y1}
                      x2={seg.x2}
                      y2={seg.y2}
                      stroke="#3b63f6"
                      strokeWidth={Math.max(2, seg.thickness)}
                      strokeLinecap="round"
                      opacity={0.85}
                    />
                  ))}
                </svg>
              </div>
              <div className="trace-status">
                <Wand2 className="icon" style={{ color: 'var(--brand)' }} />
                {previewCount > 0 ? (
                  <span><strong>{previewCount}</strong> walls detected — ready to trace.</span>
                ) : (
                  <span>No walls found yet — adjust the options below.</span>
                )}
              </div>

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

              <label className="auto-row">
                <input type="checkbox" checked={autoMode} onChange={(e) => setAutoMode(e.target.checked)} />
                <span><strong>Auto sensitivity</strong> — pick the best threshold automatically{autoMode ? ` (${effThreshold})` : ''}</span>
              </label>

              <button className="link-btn" onClick={() => setShowAdvanced((v) => !v)}>
                <SlidersHorizontal className="icon" style={{ width: 14, height: 14 }} />
                {showAdvanced ? 'Hide manual options' : 'Adjust manually'}
              </button>

              {showAdvanced && (
                <>
                  {!autoMode && (
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
                  )}
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
                </>
              )}
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
              <button className="btn primary" onClick={() => runTrace(true)} disabled={previewCount === 0}>
                {previewCount > 0 ? `Trace ${previewCount} walls` : 'Auto-trace walls'}
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
