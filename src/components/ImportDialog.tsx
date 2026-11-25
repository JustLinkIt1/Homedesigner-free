import { useEffect, useRef, useState } from 'react';
import { Ruler, UploadCloud, Wand2, SlidersHorizontal, Minus, Plus } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useDesign } from '../store/designStore';
import { useI18n } from '../lib/i18n';
import { renderPlanFile, isHeic, type RenderedPlan } from '../lib/pdfImport';
import { importDxf } from '../lib/dxfImport';
import { pointInPolygon } from '../lib/geometry';
import { autoThreshold, type PixelSegment } from '../lib/autoTrace';
import { traceWallsV2, traceWallsAuto } from '../lib/wallTrace';
import { segmentsToWalls } from '../lib/wallBuilder';
import { toast } from '../lib/ui';
import { trackEvent } from '../lib/events';
import Modal from './Modal';

type Stage = 'pick' | 'raster' | 'dxf' | 'busy';

/** Import dialog footer: wraps on narrow screens instead of overflowing (25 Nov 2026). */
const FOOT_STYLE: React.CSSProperties = { flexWrap: 'wrap' };
const FOOT_BTN: React.CSSProperties = { whiteSpace: 'nowrap' };

export default function ImportDialog({ onClose }: { onClose: () => void }) {
  // Narrow selection: this dialog only needs defaults + actions, so it must
  // not re-render on every design edit (it used to subscribe to everything).
  const s = useDesign(useShallow((st) => ({
    defaultWallHeight: st.defaultWallHeight,
    defaultWallThickness: st.defaultWallThickness,
    setBackground: st.setBackground,
    updateBackground: st.updateBackground,
    importWalls: st.importWalls,
    detectRoomsFromWalls: st.detectRoomsFromWalls,
    addFloor: st.addFloor,
    requestFit: st.requestFit,
    setView: st.setView,
  })));
  const t = useI18n();
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
  const [tracing, setTracing] = useState(false);
  // Multi-page PDF: which page is shown (1-based) and the file to re-render.
  const [planFile, setPlanFile] = useState<File | null>(null);
  const [pageNo, setPageNo] = useState(1);
  const [pageBusy, setPageBusy] = useState(false);

  // dxf state
  const [dxfText, setDxfText] = useState<string | null>(null);
  const [excludeDemolished, setExcludeDemolished] = useState(false);
  const [dxfInfo, setDxfInfo] = useState<{ count: number; unit: number; floors: number; layerAware: boolean; dimensions: number; demolished: number } | null>(null);

  const cmPerPx = rendered ? (realWidthM * 100) / rendered.width : 1;

  // Effective binarization threshold: Otsu when in auto mode, else the slider.
  const effThreshold =
    rendered && autoMode ? autoThreshold(rendered.imageData) : sensitivity;

  // Recompute the live wall preview whenever inputs change. Auto mode may
  // retry across a threshold ladder when Otsu's first pick finds nothing.
  //
  // Debounced: a trace is 0.2-1.5s of straight-line main-thread work on a
  // desktop and several seconds on a phone, and these inputs include a text
  // field — running it per keystroke froze the dialog hard enough to look like
  // the import had hung.
  useEffect(() => {
    if (stage !== 'raster' || !rendered) return;
    setTracing(true);
    const id = setTimeout(() => {
      const segs = autoMode
        ? traceWallsAuto(rendered.imageData, { minLength: minLenCm / cmPerPx })
        : traceWallsV2(rendered.imageData, {
            threshold: sensitivity,
            minLength: minLenCm / cmPerPx,
          });
      setPreviewSegs(segs);
      const walls = segmentsToWalls(segs, cmPerPx, { x: 0, y: 0 }, {
        height: s.defaultWallHeight,
        thickness: s.defaultWallThickness,
      });
      setPreviewCount(walls.length);
      setTraceInfo(null);
      setTracing(false);
    }, 260);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, rendered, effThreshold, minLenCm, realWidthM]);

  const HEIC_MESSAGE = t('iPhone photo format: save it as JPG and try again.');

  // Show another page of a multi-page PDF. The background and the preview both
  // come from the new render, so scale (cm/px) is recomputed from its width.
  const changePage = async (next: number) => {
    if (!planFile || !rendered?.pageCount || pageBusy) return;
    const n = Math.min(Math.max(1, next), rendered.pageCount);
    if (n === pageNo) return;
    setPageBusy(true);
    try {
      const r = await renderPlanFile(planFile, n);
      setPageNo(n);
      setPreviewSegs([]);
      setRendered(r);
      s.setBackground({
        src: r.src,
        imgWidth: r.width,
        imgHeight: r.height,
        x: 0,
        y: 0,
        scale: (realWidthM * 100) / r.width,
        rotation: 0,
        opacity: 0.5,
      });
    } catch (err) {
      console.error(err);
      setTraceInfo(t('Could not read that file.'));
    } finally {
      setPageBusy(false);
    }
  };

  const handleFile = async (file: File) => {
    setError(null);
    const isDxf = /\.dxf$/i.test(file.name);
    const isDwg = /\.dwg$/i.test(file.name);
    try {
      if (isDxf || isDwg) {
        let text: string;
        if (isDwg) {
          // DWG is a proprietary binary format — convert to DXF in the browser
          // via LibreDWG (WASM, ~lazy-loaded only here) and reuse the whole DXF
          // pipeline below unchanged.
          setStage('busy');
          const { LibreDwg } = await import('@mlightcad/libredwg-web');
          const lib = await LibreDwg.create();
          const dxfBytes = lib.dwg_write_dxf(await file.arrayBuffer());
          if (!dxfBytes) throw new Error(t('Could not convert this DWG file. Try exporting it as DXF from your CAD app.'));
          text = new TextDecoder('utf-8').decode(dxfBytes);
        } else {
          text = await file.text();
        }
        setDxfText(text);
        const res = importDxf(text, {
          wallHeight: s.defaultWallHeight,
          wallThickness: s.defaultWallThickness,
        });
        setDxfInfo({
          count: res.walls.length,
          unit: res.unitScale,
          floors: res.storeys.filter((st) => st.walls.length > 0).length,
          layerAware: res.layerAware,
          dimensions: res.kindCounts.dimension ?? 0,
          demolished: res.demolishedCount,
        });
        setStage('dxf');
      } else {
        // HEIC is not refused up front: Safari can decode it. Where decoding fails,
        // the catch below names the format (EXEC cycle 77).
        setStage('busy');
        const r = await renderPlanFile(file, 1);
        setPlanFile(file);
        setPageNo(1);
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
      // HEIC failures are counted on their own: HEIC conversion is built in only if
      // they reach 10% of import attempts over 28 days (EXEC cycle 77).
      trackEvent('import_result', isHeic(file) ? 'fail_heic' : 'fail');
      setError(
        isHeic(file)
          ? HEIC_MESSAGE
          : err instanceof Error
            ? err.message
            : t('Could not read that file.'),
      );
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
    const segs = autoMode
      ? traceWallsAuto(rendered.imageData, { minLength: minLenCm / cmPerPx })
      : traceWallsV2(rendered.imageData, {
          threshold: sensitivity,
          minLength: minLenCm / cmPerPx,
        });
    const walls = segmentsToWalls(segs, cmPerPx, { x: 0, y: 0 }, {
      height: s.defaultWallHeight,
      thickness: s.defaultWallThickness,
    });
    if (walls.length === 0) {
      setShowAdvanced(true);
      setTraceInfo(t('No walls detected — try turning off Auto and lowering Min length, or raise Sensitivity.'));
      trackEvent('import_result', 'fail');
      return;
    }
    s.importWalls(walls, replace);
    s.detectRoomsFromWalls(); // auto-create floors from the traced walls
    s.requestFit();
    s.setView('2d');
    trackEvent('import_result', 'ok');
    onClose();
  };

  const importDxfWalls = () => {
    if (!dxfText) return;
    const res = importDxf(dxfText, {
      wallHeight: s.defaultWallHeight,
      wallThickness: s.defaultWallThickness,
      excludeDemolished,
    });
    // A CAD file names its storeys on the layers ("0._ _1_", "1._ _2_", ...),
    // and architects lay them out side by side in model space. Import each one
    // onto its own floor so the building stacks the way it is built.
    const storeys = res.storeys.filter((st) => st.walls.length > 0);
    storeys.forEach((st, i) => {
      if (i > 0) s.addFloor();
      // A CAD file is a whole plan, so it replaces what was on the floor
      // rather than leaving the old rooms and furniture standing beside it.
      s.importWalls(st.walls, true, st.openings, true);
      s.detectRoomsFromWalls(); // auto-create rooms from the imported walls
      // Carry the plan's own room names across: a label sitting inside a room
      // names it. "Living" and "Room" on two lines read top to bottom. A room
      // holding more than a few words is carrying notes, not a name.
      for (const room of useDesign.getState().rooms) {
        if (!room.auto) continue;
        const inside = st.labels
          .filter((l) => pointInPolygon(l.at, room.points))
          .sort((p, q) => p.at.y - q.at.y || p.at.x - q.at.x);
        if (inside.length === 0 || inside.length > 3) continue;
        useDesign.getState().updateRoom(room.id, { name: inside.map((l) => l.text).join(' ').slice(0, 40) });
      }
    });
    if (storeys.length > 1) {
      toast.success(`${t('Imported')} ${storeys.length} ${t('floors')}`);
    }
    s.requestFit();
    s.setView('2d');
    trackEvent('import_result', 'ok');
    onClose();
  };

  return (
    // `open` is hardcoded true: this dialog stays behind `{showImport && …}` in
    // App.tsx because it is lazy()-loaded to keep pdfjs and dxf-parser out of
    // the initial bundle. Keeping it permanently mounted just to animate its
    // exit would defeat that split, so it animates in but not out.
    <Modal open onClose={onClose} labelledBy="import-title">
      <>
        <div className="modal-head" id="import-title">
          <Ruler className="icon" /> {t('Import a 2D plan')}
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
                  <strong>{t('Drop a file here')}</strong> {t('or click to browse')}
                </p>
                <p className="muted">
                  {t('PDF & images → traced over with auto wall detection.')}<br />
                  {t('DXF / DWG (CAD) → walls imported automatically as real geometry.')}
                </p>
              </div>
              {error && <p style={{ color: 'var(--danger)', marginTop: 12 }}>{error}</p>}
              <input
                ref={fileRef}
                type="file"
                // Android's file picker greys out anything whose type it cannot
                // match, and it has no type for .dxf or .dwg, so a CAD file
                // could be seen there but not chosen. No filter on Android.
                accept={/android/i.test(navigator.userAgent) ? undefined : '.pdf,.dxf,.dwg,image/*'}
                style={{ display: 'none' }}
                onChange={onPick}
              />
            </>
          )}

          {stage === 'busy' && (
            <div style={{ textAlign: 'center', padding: 30 }}>
              <span className="spin" /> <span className="muted">{t('Rendering plan…')}</span>
            </div>
          )}

          {stage === 'raster' && rendered && (
            <>
              {/* Preview with detected walls overlaid so the result is visible
                  before committing — the trace re-runs live as inputs change. */}
              {rendered.pageCount && rendered.pageCount > 1 && (
                <div className="ai-plan-row" style={{ marginBottom: 8 }}>
                  <span>{t('Page')} {pageNo}/{rendered.pageCount}</span>
                  <div className="ai-stepper">
                    <button
                      className="btn"
                      aria-label={t('Previous page')}
                      disabled={pageNo <= 1 || pageBusy}
                      onClick={() => changePage(pageNo - 1)}
                    >
                      <Minus className="icon" />
                    </button>
                    <button
                      className="btn"
                      aria-label={t('Next page')}
                      disabled={pageNo >= rendered.pageCount || pageBusy}
                      onClick={() => changePage(pageNo + 1)}
                    >
                      <Plus className="icon" />
                    </button>
                  </div>
                </div>
              )}
              <div className="trace-preview">
                <img className="preview-img" src={rendered.src} alt={t('plan preview')} />
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
                {tracing ? (
                  <span>{t('Reading the plan…')}</span>
                ) : previewCount > 0 ? (
                  <span><strong>{previewCount}</strong> {t('walls detected — ready to trace.')}</span>
                ) : (
                  <span>{t('No walls found yet — adjust the options below.')}</span>
                )}
              </div>

              <div className="field">
                <label>{t('Real-world width of the plan:')} <span className="field-val">{realWidthM} m</span></label>
                <input
                  type="range"
                  min={3}
                  max={40}
                  step={0.5}
                  value={realWidthM}
                  onChange={(e) => setRealWidthM(Number(e.target.value))}
                  onMouseUp={recalibrate}
                />
                <p className="muted">{t('Sets the scale so dimensions come out correct')} (~{cmPerPx.toFixed(1)} cm/px).</p>
              </div>

              <label className="auto-row">
                <input type="checkbox" checked={autoMode} onChange={(e) => setAutoMode(e.target.checked)} />
                <span><strong>{t('Auto sensitivity')}</strong> — {t('pick the best threshold automatically')}{autoMode ? ` (${effThreshold})` : ''}</span>
              </label>

              <button className="link-btn" onClick={() => setShowAdvanced((v) => !v)}>
                <SlidersHorizontal className="icon" style={{ width: 14, height: 14 }} />
                {showAdvanced ? t('Hide manual options') : t('Adjust manually')}
              </button>

              {showAdvanced && (
                <>
                  {!autoMode && (
                    <div className="field">
                      <label>{t('Detection sensitivity:')} <span className="field-val">{sensitivity}</span></label>
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
                    <label>{t('Min wall length:')} <span className="field-val">{minLenCm} cm</span></label>
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
                {t('Parsed the DXF and found')} <strong style={{ color: 'var(--text)' }}>{dxfInfo.count}</strong>{' '}
                {t('wall segments.')}
              </p>
              <p className="muted">
                {t('Estimated unit scale:')} <strong style={{ color: 'var(--text)' }}>{dxfInfo.unit} cm</strong>{' '}
                {t('per drawing unit (auto-detected). Walls will be created as editable geometry.')}
              </p>
              {dxfInfo.layerAware && (
                <p className="muted">
                  {t('Layers recognised — using the wall layers only.')}
                  {dxfInfo.dimensions > 0 && ` ${t('Skipped')} ${dxfInfo.dimensions} ${t('dimension lines.')}`}
                </p>
              )}
              {dxfInfo.demolished > 0 && (
                <label className="auto-row" style={{ marginTop: 8 }}>
                  <input
                    type="checkbox"
                    checked={excludeDemolished}
                    onChange={(e) => setExcludeDemolished(e.target.checked)}
                  />
                  <span>
                    {t('Leave out the')} {dxfInfo.demolished}{' '}
                    {t('lines on demolition layers (shows the proposed state).')}
                  </span>
                </label>
              )}
              {dxfInfo.floors > 1 && (
                <p className="muted">
                  <strong style={{ color: 'var(--text)' }}>{dxfInfo.floors}</strong>{' '}
                  {t('storeys found — they will be stacked as separate floors.')}
                </p>
              )}
            </div>
          )}
        </div>

        {/* On a phone the three buttons do not fit one row: the shared .modal-foot is
            flex-end without wrapping, so it pushed Cancel off the left edge and squeezed
            the labels to three lines. Here the row wraps and labels stay on one line. */}
        <div className="modal-foot" style={FOOT_STYLE}>
          <button className="btn" style={FOOT_BTN} onClick={onClose}>
            {t('Cancel')}
          </button>
          {stage === 'raster' && (
            <>
              <button className="btn" style={FOOT_BTN} onClick={() => { recalibrate(); onClose(); }}>
                {t('Use as tracing background')}
              </button>
              <button className="btn primary" style={FOOT_BTN} onClick={() => runTrace(true)} disabled={previewCount === 0}>
                {previewCount > 0 ? `${t('Trace')} ${previewCount} ${t('walls')}` : t('Auto-trace walls')}
              </button>
            </>
          )}
          {stage === 'dxf' && (
            <button className="btn primary" style={FOOT_BTN} onClick={importDxfWalls} disabled={!dxfInfo?.count}>
              {t('Import')} {dxfInfo?.count ?? 0} {t('walls')}
            </button>
          )}
        </div>
      </>
    </Modal>
  );
}
