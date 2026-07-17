import { useEffect, useRef, useState, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Stage, Layer, Line, Rect, Group, Text, Circle, Arc, Image as KImage } from 'react-konva';
import Konva from 'konva';
import { useDesign } from '../../store/designStore';
import { useHtmlImage } from '../../lib/useHtmlImage';
import {
  dist,
  midpoint,
  angleDeg,
  lerp,
  snapToGrid,
  pointToSegment,
  polygonCentroid,
  boundsOf,
} from '../../lib/geometry';
import { FLOOR_BY_ID, CATALOG_BY_TYPE } from '../../data/furnitureCatalog';
import DimensionsLayer from './DimensionsLayer';
import { drawBridge, useDraw, toast } from '../../lib/ui';
import { planCapture } from '../../lib/renderBridge';
import FurnitureSymbol from './FurnitureSymbol';
import { buildSnapElements, nearestSnap, type SnapKind, type GuideLine } from '../../lib/snapping';
import { kitchenRunUnits, RUN_UNIT } from '../../lib/kitchenRun';
import { computeWallPolygons } from '../../lib/wallGeometry';
import { formatLength, type Units } from '../../lib/units';
import { selectionTick, tapMedium } from '../../lib/haptics';
import { useTheme, canvasColors } from '../../lib/theme';
import type { Point } from '../../types';
import {
  resizeBox,
  norm360,
  snapAngleTo,
  type Box,
} from './editHandles';

// Cap the Konva canvas pixel ratio. Ultra-high-DPI phones (e.g. Galaxy S25 at
// ~1440p report devicePixelRatio ~3.5) otherwise render the full-screen 2D
// Stage at 3-4x — millions of extra pixels every redraw, so panning/dragging
// crawls while a lower-DPI phone stays smooth. Touch uses 1.5x (44% fewer
// backing-buffer pixels than 2x); desktop keeps 2x. Photo/plan exports pass an
// explicit pixelRatio, so they remain full resolution.
if (typeof window !== 'undefined') {
  const touchCap = window.matchMedia?.('(pointer: coarse)').matches ? 1.5 : 2;
  Konva.pixelRatio = Math.min(window.devicePixelRatio || 1, touchCap);
}

// Touch devices need ~44px targets; mouse pointers stay precise at 16px.
const IS_COARSE =
  typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
const HANDLE_R = IS_COARSE ? 14 : 8; // radius in screen px (÷ zoom at render)

// Handle visuals (screen-space px; divided by zoom at render to stay constant).

export default function Canvas2D() {
  const C = canvasColors(useTheme((t) => t.theme));
  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const layerRef = useRef<Konva.Layer>(null);
  const gridRef = useRef<Konva.Group>(null);
  // Live pan, kept in sync with committed state. During a pan gesture we move
  // the Konva layer imperatively (see applyPan) and only commit to React state
  // on release — otherwise every pointermove (up to 120/s on high-refresh
  // phones) re-rendered the whole scene, dragging the plan to ~10fps.
  const panRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(0.35);
  const viewportChangedRef = useRef(false);
  // Non-null while a pan gesture is in progress (tracks raw pointer deltas).
  const lastPan = useRef<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });

  const s = useDesign(useShallow((st) => ({
    walls: st.walls,
    rooms: st.rooms,
    furniture: st.furniture,
    openings: st.openings,
    background: st.background,
    tool: st.tool,
    zoom: st.zoom,
    pan: st.pan,
    showGrid: st.showGrid,
    gridSize: st.gridSize,
    selection: st.selection,
    moveLock: st.moveLock,
    selectedIds: st.selectedIds,
    showDimensions: st.showDimensions,
    units: st.units,
    fitRequest: st.fitRequest,
    pendingFurnitureType: st.pendingFurnitureType,
    setViewport: st.setViewport,
    setTool: st.setTool,
    select: st.select,
    clearSelection: st.clearSelection,
    setPendingFurniture: st.setPendingFurniture,
    addWall: st.addWall,
    updateWall: st.updateWall,
    addRoom: st.addRoom,
    addKitchenRun: st.addKitchenRun,
    addFurniture: st.addFurniture,
    updateFurniture: st.updateFurniture,
    addOpening: st.addOpening,
    updateOpening: st.updateOpening,
    deleteSelected: st.deleteSelected,
    deleteById: st.deleteById,
    setSelectedIds: st.setSelectedIds,
    toggleSelected: st.toggleSelected,
    moveFurnitureGroup: st.moveFurnitureGroup,
    duplicateSelection: st.duplicateSelection,
    copySelection: st.copySelection,
    paste: st.paste,
    bringToFront: st.bringToFront,
    sendToBack: st.sendToBack,
    scaleDesign: st.scaleDesign,
    moveCorner: st.moveCorner,
    undo: st.undo,
    redo: st.redo,
  })));
  const {
    walls, rooms, furniture, openings, background,
    tool, zoom, pan, showGrid, gridSize, selection, selectedIds, showDimensions, units, moveLock,
  } = s;
  const multi = selectedIds.length > 1;
  const fmtLen = (cm: number) => formatLength(cm, units);

  const bgImage = useHtmlImage(background?.src);

  // Draft state for in-progress drawing.
  const [draft, setDraft] = useState<Point[]>([]);
  const [cursor, setCursor] = useState<Point | null>(null);
  // Tape-measure tool: first click sets A, second click freezes the A–B span.
  const [measureA, setMeasureA] = useState<Point | null>(null);
  const [measureSeg, setMeasureSeg] = useState<{ a: Point; b: Point } | null>(null);
  const [realInput, setRealInput] = useState(''); // real-world length for calibration
  // Type-a-length while chaining walls/rooms (SketchUp-style): digits typed
  // while a draft is in progress lock the next point's distance from the last
  // point along the current cursor direction; Enter commits it.
  const [lengthInput, setLengthInput] = useState('');
  const [snapKind, setSnapKind] = useState<SnapKind | 'free'>('free');
  const [snapGuide, setSnapGuide] = useState<GuideLine | null>(null);
  const snapGuideRef = useRef<GuideLine | null>(null);
  // Panning state: the ref is the source of truth for event handlers (mouse
  // moves arrive faster than React re-renders); the state only drives cursor.
  const [isPanning, _setIsPanning] = useState(false);
  const panningRef = useRef(false);
  const setIsPanning = (v: boolean) => {
    panningRef.current = v;
    _setIsPanning(v);
  };
  // Click-a-dimension-to-resize: an HTML input overlaid on the tapped wall
  // length label; committing moves that wall's end to the typed length.
  const [dimEdit, setDimEdit] = useState<{ wallId: string; x: number; y: number; value: string } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; kind: string; id: string; wp: Point | null } | null>(null);
  // Menu also captures the tap's WORLD point so Paste can land right there.
  const openMenu = (x: number, y: number, kind: string, id: string) =>
    setMenu({ x, y, kind, id, wp: worldPointer() });
  const closeMenu = () => setMenu(null);
  // Last known cursor position in world coords (for paste-at-cursor).
  const lastCursorRef = useRef<Point | null>(null);

  // Live drag-edit state for selection handles. While a handle is being
  // dragged we render from these locals and commit to the store exactly once
  // on drag end, so each gesture is a single undo step.
  const [wallEdit, setWallEdit] = useState<{ id: string; start: Point; end: Point } | null>(null);
  // Dragging a shared corner: every wall endpoint at `from` previews at `to`.
  const [cornerDrag, setCornerDrag] = useState<{ from: Point; to: Point } | null>(null);
  const [furnEdit, setFurnEdit] = useState<
    { id: string; position: Point; rotation: number; width: number; depth: number } | null
  >(null);
  // Body-dragging a piece of furniture: the id is set once (to hide its handles)
  // and the node is moved by Konva alone, WITHOUT per-frame React re-renders —
  // re-rendering the whole scene every drag frame made moving objects choppy on
  // mid-range phones. The final position is committed on drag end.
  const [draggingFurnId, setDraggingFurnId] = useState<string | null>(null);
  const [openEdit, setOpenEdit] = useState<{ id: string; offset: number } | null>(null);

  // Measure container.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // Reset draft + measurement when tool changes.
  useEffect(() => {
    setDraft([]);
    setMeasureA(null);
    setMeasureSeg(null);
    setLengthInput('');
  }, [tool]);

  // Frame the whole design when asked (after load / import) once size is known.
  const lastFit = useRef(0);
  useEffect(() => {
    if (s.fitRequest === 0 || s.fitRequest === lastFit.current || size.w === 0) return;
    lastFit.current = s.fitRequest;
    const pts = [
      ...walls.flatMap((w) => [w.start, w.end]),
      ...rooms.flatMap((r) => r.points),
      ...furniture.map((f) => f.position),
    ];
    if (pts.length === 0) return;
    const { min, max } = boundsOf(pts);
    const bw = Math.max(1, max.x - min.x);
    const bh = Math.max(1, max.y - min.y);
    const pad = 90;
    const z = Math.max(0.05, Math.min(2, Math.min(size.w / (bw + pad * 2), size.h / (bh + pad * 2))));
    s.setViewport(
      { x: size.w / 2 - ((min.x + max.x) / 2) * z, y: size.h / 2 - ((min.y + max.y) / 2) * z },
      z,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.fitRequest, size.w, size.h]);

  // Expose a framed PNG export of the whole plan (grid hidden) to the toolbar.
  // Reads live store state so the closure never goes stale.
  useEffect(() => {
    planCapture.current = () => {
      const stage = stageRef.current;
      if (!stage) return null;
      const st = useDesign.getState();
      const pts = [
        ...st.walls.flatMap((w) => [w.start, w.end]),
        ...st.rooms.flatMap((r) => r.points),
        ...st.furniture.map((f) => f.position),
      ];
      if (pts.length === 0) return null;
      const { min, max } = boundsOf(pts);
      const padCm = 70; // breathing room around the design (cm)
      const z = st.zoom;
      const rx = (min.x - padCm) * z + st.pan.x;
      const ry = (min.y - padCm) * z + st.pan.y;
      const rw = (max.x - min.x + padCm * 2) * z;
      const rh = (max.y - min.y + padCm * 2) * z;
      // Upscale toward ~2200px on the long edge for a crisp export.
      const pixelRatio = Math.max(0.5, Math.min(4, 2200 / Math.max(rw, rh)));
      const grid = gridRef.current;
      const gridWasVisible = grid?.visible() ?? false;
      if (grid) grid.visible(false);
      stage.draw();
      try {
        return stage.toDataURL({ x: rx, y: ry, width: rw, height: rh, pixelRatio, mimeType: 'image/png' });
      } finally {
        if (grid && gridWasVisible) grid.visible(true);
        stage.draw();
      }
    };
    return () => {
      planCapture.current = null;
    };
  }, []);

  // Keyboard: Enter/Escape to finish, Delete to remove, undo/redo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      const chaining = (tool === 'wall' || tool === 'room') && draft.length > 0;
      if (e.key === 'Escape') {
        if (lengthInput) {
          setLengthInput('');
          return;
        }
        setDraft([]);
        setMeasureA(null);
        setMeasureSeg(null);
        s.clearSelection();
        if (tool === 'furniture') {
          // Leave furniture mode (tucks the catalog panel away on desktop).
          s.setPendingFurniture(null);
          s.setTool('select');
        }
      } else if (e.key === 'Enter') {
        if (chaining && lengthInput) commitTypedLength();
        else finishDraft();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (chaining && lengthInput) {
          e.preventDefault();
          setLengthInput((v) => v.slice(0, -1));
        } else if (selection.id || s.selectedIds.length) {
          s.deleteSelected();
        }
      } else if (e.key.startsWith('Arrow') && !chaining) {
        // Nudge selected furniture: 1cm, or 10cm with Shift.
        const ids = s.selectedIds.length
          ? s.selectedIds
          : selection.kind === 'furniture' && selection.id
            ? [selection.id]
            : [];
        if (ids.length) {
          e.preventDefault();
          const step = e.shiftKey ? 10 : 1;
          const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
          const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
          if (dx || dy) s.moveFurnitureGroup(ids, dx, dy);
        }
      } else if (chaining && /^[0-9.]$/.test(e.key)) {
        setLengthInput((v) => (v.length < 8 ? v + e.key : v));
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        s.duplicateSelection();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c') {
        s.copySelection();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        s.paste(lastCursorRef.current ?? undefined);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        s.setSelectedIds(s.furniture.map((f) => f.id));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, draft, tool, lengthInput, cursor, units]);

  // ---- coordinate helpers ----
  const worldPointer = (): Point | null => {
    const stage = stageRef.current;
    if (!stage) return null;
    const p = stage.getPointerPosition();
    if (!p) return null;
    return { x: (p.x - pan.x) / zoom, y: (p.y - pan.y) / zoom };
  };

  // Snap a dragged wall endpoint: prefer other walls' endpoints, else grid.
  // `excludeWallId` keeps an endpoint from snapping to its own wall.
  const snapEndpoint = (p: Point, excludeWallId: string): Point => {
    let best: Point | null = null;
    let bestD = 18 / zoom;
    for (const w of walls) {
      if (w.id === excludeWallId) continue;
      for (const e of [w.start, w.end]) {
        const d = dist(p, e);
        if (d < bestD) {
          bestD = d;
          best = e;
        }
      }
    }
    if (best) return best;
    return showGrid ? snapToGrid(p, gridSize) : p;
  };

  // Snap target while dragging a shared corner: snap to OTHER corners (to merge
  // them) but ignore the endpoints belonging to the corner being dragged, which
  // would otherwise magnetize it back to its origin.
  const snapCornerTarget = (p: Point, from: Point): Point => {
    let best: Point | null = null;
    let bestD = 18 / zoom;
    for (const w of walls) {
      for (const e of [w.start, w.end]) {
        if (dist(e, from) <= 3) continue; // skip the corner being moved
        const d = dist(p, e);
        if (d < bestD) {
          bestD = d;
          best = e;
        }
      }
    }
    if (best) return best;
    return showGrid && !background ? snapToGrid(p, gridSize) : p;
  };

  // Records what kind of inference the last applySnaps() landed on, for the
  // on-canvas snap indicator.
  const snapKindRef = useRef<SnapKind | 'free'>('free');
  const lastHardSnapRef = useRef<SnapKind | null>(null);

  /**
   * CAD-style snapping while drawing walls/rooms, via the prioritized snap
   * engine (point > midpoint > guide > segment): locks onto existing/clicked
   * points, wall midpoints, axis/extension/parallel/perpendicular guide lines,
   * and wall bodies (T-junctions). Falls back to the grid when nothing is near
   * and there's no plan to trace over.
   */
  const applySnaps = (p: Point): Point => {
    // Wider catch radius on touch so a fingertip reliably grabs endpoints/guides.
    const radius = (IS_COARSE ? 22 : 14) / zoom;
    if (tool === 'wall' || tool === 'room' || tool === 'kitchen') {
      const prev = draft.length > 0 ? draft[draft.length - 1] : null;
      const els = buildSnapElements({ walls, draft, prev, radius, guides: true });
      const snap = nearestSnap(els, p);
      if (snap) {
        // Buzz once each time a hard snap (endpoint/midpoint) is freshly
        // acquired — de-duped via the transition check so drags don't rattle.
        const hard = snap.kind === 'point' || snap.kind === 'midpoint';
        if (hard && lastHardSnapRef.current !== snap.kind) selectionTick();
        lastHardSnapRef.current = hard ? snap.kind : null;
        snapKindRef.current = snap.kind;
        snapGuideRef.current = snap.guide ?? null;
        return snap.point;
      }
    }
    lastHardSnapRef.current = null;
    snapGuideRef.current = null;
    // Grid — skipped while tracing over a background so free angles aren't fought.
    if (showGrid && !background) {
      snapKindRef.current = 'grid';
      return snapToGrid(p, gridSize);
    }
    snapKindRef.current = 'free';
    return p;
  };

  const twoFinger = (t: TouchList) => {
    const a = t[0];
    const b = t[1];
    return {
      dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
      center: { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 },
    };
  };

  // Move the plan imperatively during a pan gesture: nudge the Konva layer
  // directly (scene redraw only — hit graph off, no React reconcile) and record
  // the live pan. endPan() commits it to state once on release.
  const applyPan = (x: number, y: number) => {
    panRef.current = { x, y };
    viewportChangedRef.current = true;
    const layer = layerRef.current;
    if (!layer) return;
    layer.listening(false); // skip the (expensive) hit-canvas redraw while panning
    layer.position({ x, y });
    layer.batchDraw();
  };

  // Pinch gestures update Konva directly and commit the final viewport once on
  // release. This removes two full React/Konva reconciliations per touch frame.
  const applyViewport = (nextPan: Point, nextZoom: number) => {
    panRef.current = nextPan;
    zoomRef.current = nextZoom;
    viewportChangedRef.current = true;
    const layer = layerRef.current;
    if (!layer) return;
    layer.listening(false);
    layer.position(nextPan);
    layer.scale({ x: nextZoom, y: nextZoom });
    layer.batchDraw();
  };

  // ---- interaction handlers ----
  const onWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const { deltaX, deltaY, ctrlKey, metaKey, shiftKey } = e.evt;
    // Trackpads: two-finger sideways scroll (deltaX-dominant) and shift+wheel
    // pan the plan; pinch arrives as ctrl+wheel and falls through to zoom.
    if (!ctrlKey && !metaKey && (shiftKey || Math.abs(deltaX) > Math.abs(deltaY))) {
      const dx = shiftKey && deltaX === 0 ? deltaY : deltaX;
      const dy = shiftKey && deltaX === 0 ? 0 : deltaY;
      s.setViewport({ x: pan.x - dx, y: pan.y - dy }, zoom);
      return;
    }
    const dir = deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.05, Math.min(4, zoom * dir));
    // Keep the point under the cursor fixed.
    const wx = (pointer.x - pan.x) / zoom;
    const wy = (pointer.y - pan.y) / zoom;
    s.setViewport({ x: pointer.x - wx * newZoom, y: pointer.y - wy * newZoom }, newZoom);
  };

  // Hold space to pan with any tool (standard canvas-app affordance).
  const [spacePan, setSpacePan] = useState(false);
  useEffect(() => {
    const dn = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      e.preventDefault();
      setSpacePan(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpacePan(false);
    };
    window.addEventListener('keydown', dn);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', dn);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // Core place/draw/select action at a world point — shared by mouse & touch.
  const actAt = (p: Point) => {
    const snapped = applySnaps(p);
    if (tool === 'wall') {
      setDraft((d) => [...d, snapped]);
    } else if (tool === 'room') {
      if (draft.length >= 3 && dist(snapped, draft[0]) < (IS_COARSE ? 38 : 25) / zoom) {
        s.addRoom(draft);
        setDraft([]);
      } else {
        setDraft((d) => [...d, snapped]);
      }
    } else if (tool === 'kitchen') {
      // Two taps define the run: first sets the start, second tiles cabinets.
      if (draft.length === 0) setDraft([snapped]);
      else {
        s.addKitchenRun(draft[0], snapped);
        setDraft([]);
      }
    } else if (tool === 'furniture' && s.pendingFurnitureType) {
      const type = s.pendingFurnitureType;
      const catalogEntry = CATALOG_BY_TYPE[type];
      if (catalogEntry?.opening) {
        const hit = nearestWall(p);
        if (hit && hit.dist < Math.max(hit.wall.thickness * 1.5, 40 / zoom)) {
          const len = dist(hit.wall.start, hit.wall.end) || 1;
          const half = catalogEntry.width / 2;
          // Pass a 0..1 fraction; the store clamps it so the opening fits.
          const frac = Math.max(half / len, Math.min(1 - half / len, hit.t));
          const id = s.addOpening(hit.wall.id, frac, type);
          s.select({ kind: 'opening', id });
        }
      } else {
        const id = s.addFurniture(type, snapped);
        s.select({ kind: 'furniture', id });
      }
    } else if (tool === 'measure') {
      if (!measureA) {
        setMeasureA(snapped);
        setMeasureSeg(null);
      } else {
        setMeasureSeg({ a: measureA, b: snapped });
        setMeasureA(null);
        // Pre-fill the calibration field with the current measured length.
        const cm = dist(measureA, snapped);
        setRealInput(units === 'imperial' ? (cm / 30.48).toFixed(2) : (cm / 100).toFixed(2));
      }
    } else if (tool === 'select') {
      hitTest(p);
    } else if (tool === 'erase') {
      eraseAt(p);
    }
  };

  const onMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const isMiddle = e.evt.button === 1;
    const p = worldPointer();
    if (!p) return;
    if (tool === 'pan' || isMiddle || e.evt.button === 2 || spacePan) {
      setIsPanning(true);
      // Anchor immediately so the very first mousemove already pans.
      lastPan.current = { x: e.evt.clientX, y: e.evt.clientY };
      return;
    }
    actAt(p);
  };

  // Commit a typed length: places the next draft point at that distance from
  // the last point, along the direction toward the current cursor (so angle
  // snapping/guides still apply — only the distance is overridden).
  const commitTypedLength = () => {
    const val = parseFloat(lengthInput);
    setLengthInput('');
    if (!(val > 0) || draft.length === 0 || !cursor) return;
    const last = draft[draft.length - 1];
    const lenCm = units === 'imperial' ? val * 30.48 : val * 100;
    const dx = cursor.x - last.x;
    const dy = cursor.y - last.y;
    const d = Math.hypot(dx, dy) || 1;
    const next = { x: last.x + (dx / d) * lenCm, y: last.y + (dy / d) * lenCm };
    if (tool === 'room' && draft.length >= 3 && dist(next, draft[0]) < 25 / zoom) {
      s.addRoom(draft);
      setDraft([]);
    } else {
      setDraft((d2) => [...d2, next]);
    }
  };

  // Open the length editor over a wall's dimension label.
  const openDimEdit = (wallId: string) => {
    const w = s.walls.find((x) => x.id === wallId);
    if (!w) return;
    const lenCm = dist(w.start, w.end);
    const mid = midpoint(w.start, w.end);
    // World → screen so the input sits on top of the label.
    const sx = mid.x * zoom + pan.x;
    const sy = mid.y * zoom + pan.y;
    const val = units === 'imperial' ? (lenCm / 30.48).toFixed(2) : (lenCm / 100).toFixed(2);
    s.select({ kind: 'wall', id: wallId });
    setDimEdit({ wallId, x: sx, y: sy, value: val });
  };

  // Commit the typed length: keep `start` fixed and move the wall's end (and any
  // walls sharing that corner) so the wall becomes exactly that long.
  const applyDimEdit = () => {
    setDimEdit((cur) => {
      if (!cur) return null;
      const val = parseFloat(cur.value);
      const w = s.walls.find((x) => x.id === cur.wallId);
      if (w && val > 0) {
        const lenCm = units === 'imperial' ? val * 30.48 : val * 100;
        const dx = w.end.x - w.start.x;
        const dy = w.end.y - w.start.y;
        const d = Math.hypot(dx, dy) || 1;
        const newEnd = { x: w.start.x + (dx / d) * lenCm, y: w.start.y + (dy / d) * lenCm };
        s.moveCorner(w.end, newEnd);
      }
      return null;
    });
  };

  // ---- touch: tap to act, one-finger drag from empty canvas to pan,
  // two-finger pinch to zoom & pan ----
  const pinch = useRef<{ dist: number; center: Point } | null>(null);
  // The furniture node currently being dragged (if any), so a second finger
  // starting a pinch can cancel the drag instead of flinging the object.
  const draggingFurn = useRef<Konva.Node | null>(null);
  const touchMoved = useRef(false);
  const touchStartPt = useRef<Point | null>(null);
  const touchPanEligible = useRef(false);
  const longPress = useRef<number | null>(null);
  const longPressFired = useRef(false);
  const cancelLongPress = () => {
    if (longPress.current !== null) {
      window.clearTimeout(longPress.current);
      longPress.current = null;
    }
  };

  const onTouchStart = (e: Konva.KonvaEventObject<TouchEvent>) => {
    const t = e.evt.touches;
    if (t.length === 2) {
      e.evt.preventDefault();
      pinch.current = twoFinger(t);
      touchMoved.current = true; // suppress tap
      cancelLongPress();
      // If a finger had already grabbed a furniture item, a second finger means
      // the user is pinch-zooming — cancel the drag so the object isn't moved.
      if (draggingFurn.current) {
        draggingFurn.current.stopDrag();
        draggingFurn.current = null;
        setDraggingFurnId(null);
      }
    } else if (t.length === 1) {
      touchMoved.current = false;
      touchStartPt.current = { x: t[0].clientX, y: t[0].clientY };
      // A drag that starts on empty canvas (or the traced background plan)
      // pans the viewport with ANY tool — taps still act as before.
      const target = e.target as Konva.Node;
      touchPanEligible.current =
        target === (target.getStage() as unknown as Konva.Node) || target.name() === 'bg-plan';
      if (tool === 'pan') {
        setIsPanning(true);
        lastPan.current = { x: t[0].clientX, y: t[0].clientY };
      } else if (tool === 'select') {
        // Long-press = right-click on touch: opens the same context menu
        // (copy/duplicate/z-order are otherwise unreachable on phones).
        const cx = t[0].clientX;
        const cy = t[0].clientY;
        const wp = worldPointer();
        longPress.current = window.setTimeout(() => {
          longPress.current = null;
          if (touchMoved.current || !wp) return;
          longPressFired.current = true;
          tapMedium();
          const hit = pickAt(wp);
          if (hit) {
            if (!(hit.kind === 'furniture' && selectedIds.includes(hit.id))) {
              s.select({ kind: hit.kind as never, id: hit.id });
            }
            openMenu(cx, cy, hit.kind, hit.id);
          } else {
            openMenu(cx, cy, 'empty', '');
          }
        }, 500);
      }
    }
  };

  const onTouchMove = (e: Konva.KonvaEventObject<TouchEvent>) => {
    const t = e.evt.touches;
    if (t.length === 2 && pinch.current) {
      e.evt.preventDefault();
      const stage = stageRef.current;
      if (!stage) return;
      const rect = stage.container().getBoundingClientRect();
      const next = twoFinger(t);
      const sc = { x: next.center.x - rect.left, y: next.center.y - rect.top };
      const z = zoomRef.current;
      const pn = panRef.current;
      const scale = next.dist / (pinch.current.dist || next.dist);
      const newZoom = Math.max(0.05, Math.min(4, z * scale));
      const wx = (sc.x - pn.x) / z;
      const wy = (sc.y - pn.y) / z;
      // zoom around the pinch centre and pan with finger movement
      const prevSc = { x: pinch.current.center.x - rect.left, y: pinch.current.center.y - rect.top };
      applyViewport(
        { x: sc.x - wx * newZoom + (sc.x - prevSc.x), y: sc.y - wy * newZoom + (sc.y - prevSc.y) },
        newZoom,
      );
      pinch.current = next;
    } else if (t.length === 1) {
      const cur = { x: t[0].clientX, y: t[0].clientY };
      if (!touchMoved.current) {
        // Tap slop: fingers jitter a few px — don't turn taps into drags.
        const st0 = touchStartPt.current;
        if (st0 && Math.hypot(cur.x - st0.x, cur.y - st0.y) < 7) return;
        touchMoved.current = true;
        cancelLongPress();
        if (touchPanEligible.current && !lastPan.current) {
          setIsPanning(true);
          lastPan.current = st0 ?? cur;
        }
      }
      cancelLongPress();
      if (lastPan.current) {
        applyPan(panRef.current.x + (cur.x - lastPan.current.x), panRef.current.y + (cur.y - lastPan.current.y));
        lastPan.current = cur;
      }
    }
  };

  const onTouchEnd = (e: Konva.KonvaEventObject<TouchEvent>) => {
    if (e.evt.touches.length === 0) {
      // Cancel the touchend so the browser never fires the compatibility
      // mouse events (mousedown/click) for this tap. Without this, a single
      // tap ran BOTH the touch handler and the ghost mousedown — placing
      // furniture twice and instantly closing freshly-opened drawers.
      if (e.evt.cancelable) e.evt.preventDefault();
      cancelLongPress();
      if (longPressFired.current) {
        // The long-press already opened the context menu — swallow the tap.
        longPressFired.current = false;
      } else if (!touchMoved.current && tool !== 'pan') {
        const p = worldPointer();
        if (p) actAt(p);
      }
      pinch.current = null;
      touchStartPt.current = null;
      touchPanEligible.current = false;
      endPan();
    }
  };

  const onMouseMove = () => {
    // While panning, the layer is moving imperatively — a cursor-snap setState
    // here would re-render and fight (reset) that live position. Skip it.
    if (lastPan.current) return;
    const p = worldPointer();
    if (!p) return;
    lastCursorRef.current = p;
    setCursor(applySnaps(p));
    setSnapKind(snapKindRef.current);
    setSnapGuide(snapGuideRef.current);
  };

  const onStageMouseMove = () => {
    onMouseMove();
  };
  const endPan = () => {
    setIsPanning(false);
    lastPan.current = null;
    const layer = layerRef.current;
    if (!layer) return;
    layer.listening(true); // restore hit detection now the gesture is over
    const committed = useDesign.getState();
    if (
      viewportChangedRef.current &&
      (committed.pan.x !== panRef.current.x ||
        committed.pan.y !== panRef.current.y ||
        committed.zoom !== zoomRef.current)
    ) {
      s.setViewport({ ...panRef.current }, zoomRef.current);
    } else {
      layer.batchDraw(); // rebuild the hit graph if we toggled listening
    }
    viewportChangedRef.current = false;
  };

  // Mouse panning runs on window listeners so the drag keeps working when the
  // cursor crosses the side panels or leaves the canvas — releasing anywhere
  // ends it. (Touch panning stays in the stage handlers: fingers can't hover.)
  useEffect(() => {
    if (!isPanning) return;
    const mm = (ev: MouseEvent) => {
      const cur = { x: ev.clientX, y: ev.clientY };
      if (lastPan.current) {
        // Imperative pan against the live ref — no React re-render per move.
        applyPan(panRef.current.x + (cur.x - lastPan.current.x), panRef.current.y + (cur.y - lastPan.current.y));
      }
      lastPan.current = cur;
    };
    const mu = () => endPan();
    window.addEventListener('mousemove', mm);
    window.addEventListener('mouseup', mu);
    return () => {
      window.removeEventListener('mousemove', mm);
      window.removeEventListener('mouseup', mu);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPanning]);

  const finishDraft = () => {
    if (tool === 'wall' && draft.length >= 2) {
      for (let i = 0; i < draft.length - 1; i++) s.addWall(draft[i], draft[i + 1]);
    } else if (tool === 'room' && draft.length >= 3) {
      s.addRoom(draft);
    } else if (tool === 'kitchen' && draft.length >= 1 && cursor) {
      s.addKitchenRun(draft[0], cursor);
    }
    setDraft([]);
  };

  // Expose finish() + active state to the on-canvas "Finish" affordance.
  useEffect(() => {
    drawBridge.finish = finishDraft;
    drawBridge.cancel = () => setDraft([]);
    const active =
      tool === 'room' ? draft.length >= 3
      : tool === 'wall' ? draft.length >= 2
      : tool === 'kitchen' ? draft.length >= 1
      : false;
    useDraw.getState().setActive(active);
    return () => {
      drawBridge.finish = null;
      drawBridge.cancel = null;
      useDraw.getState().setActive(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, tool]);

  // Nearest wall to a point, with the parametric position along it.
  const nearestWall = (p: Point): { wall: (typeof walls)[number]; t: number; dist: number } | null => {
    let best: { wall: (typeof walls)[number]; t: number; dist: number } | null = null;
    for (const w of walls) {
      const r = pointToSegment(p, w.start, w.end);
      if (!best || r.dist < best.dist) best = { wall: w, t: r.t, dist: r.dist };
    }
    return best;
  };

  // World-space centre point of an opening (on its wall).
  const openingPoint = (o: (typeof openings)[number]): { pt: Point; wall: (typeof walls)[number] } | null => {
    const wall = walls.find((w) => w.id === o.wallId);
    if (!wall) return null;
    return { pt: lerp(wall.start, wall.end, o.offset), wall };
  };

  // What sits under a world point (top-most first), without selecting.
  const pickAt = (p: Point): { kind: string; id: string } | null => {
    for (const o of openings) {
      const op = openingPoint(o);
      if (op && dist(p, op.pt) <= Math.max(o.width / 2, 16 / zoom)) return { kind: 'opening', id: o.id };
    }
    for (let i = furniture.length - 1; i >= 0; i--) {
      const f = furniture[i];
      const dx = p.x - f.position.x;
      const dy = p.y - f.position.y;
      const a = (-f.rotation * Math.PI) / 180;
      const lx = dx * Math.cos(a) - dy * Math.sin(a);
      const ly = dx * Math.sin(a) + dy * Math.cos(a);
      if (Math.abs(lx) <= f.width / 2 && Math.abs(ly) <= f.depth / 2) return { kind: 'furniture', id: f.id };
    }
    for (const w of walls) {
      if (pointToSegment(p, w.start, w.end).dist <= Math.max(w.thickness, 14 / zoom)) return { kind: 'wall', id: w.id };
    }
    for (const r of rooms) {
      if (pointInPoly(p, r.points)) return { kind: 'room', id: r.id };
    }
    return null;
  };

  const hitTest = (p: Point) => {
    // Openings (clickable along their wall).
    for (const o of openings) {
      const op = openingPoint(o);
      if (op && dist(p, op.pt) <= Math.max(o.width / 2, 16 / zoom)) {
        s.select({ kind: 'opening', id: o.id });
        return;
      }
    }
    // Furniture (top-most first).
    for (let i = furniture.length - 1; i >= 0; i--) {
      const f = furniture[i];
      const dx = p.x - f.position.x;
      const dy = p.y - f.position.y;
      const a = (-f.rotation * Math.PI) / 180;
      const lx = dx * Math.cos(a) - dy * Math.sin(a);
      const ly = dx * Math.sin(a) + dy * Math.cos(a);
      if (Math.abs(lx) <= f.width / 2 && Math.abs(ly) <= f.depth / 2) {
        s.select({ kind: 'furniture', id: f.id });
        return;
      }
    }
    // Walls.
    for (const w of walls) {
      if (pointToSegment(p, w.start, w.end).dist <= Math.max(w.thickness, 14 / zoom)) {
        s.select({ kind: 'wall', id: w.id });
        return;
      }
    }
    // Rooms.
    for (const r of rooms) {
      const c = polygonCentroid(r.points);
      if (dist(p, c) < 9999 && pointInPoly(p, r.points)) {
        s.select({ kind: 'room', id: r.id });
        return;
      }
    }
    s.clearSelection();
  };

  const eraseAt = (p: Point) => {
    for (const o of openings) {
      const op = openingPoint(o);
      if (op && dist(p, op.pt) <= Math.max(o.width / 2, 16 / zoom)) {
        s.deleteById('opening', o.id);
        return;
      }
    }
    for (let i = furniture.length - 1; i >= 0; i--) {
      const f = furniture[i];
      if (dist(p, f.position) <= Math.max(f.width, f.depth) / 2) {
        s.deleteById('furniture', f.id);
        return;
      }
    }
    for (const w of walls) {
      if (pointToSegment(p, w.start, w.end).dist <= Math.max(w.thickness, 14 / zoom)) {
        s.deleteById('wall', w.id);
        return;
      }
    }
    for (const r of rooms) {
      if (pointInPoly(p, r.points)) {
        s.deleteById('room', r.id);
        return;
      }
    }
  };

  // ---- grid ----
  const gridLines = useMemo(() => {
    if (!showGrid) return [];
    const lines: { pts: number[]; major: boolean }[] = [];
    const left = -pan.x / zoom;
    const top = -pan.y / zoom;
    const right = (size.w - pan.x) / zoom;
    const bottom = (size.h - pan.y) / zoom;
    const step = gridSize;
    const startX = Math.floor(left / step) * step;
    const startY = Math.floor(top / step) * step;
    for (let x = startX; x <= right; x += step) {
      const major = Math.round(x / step) % 4 === 0;
      lines.push({ pts: [x, top, x, bottom], major });
    }
    for (let y = startY; y <= bottom; y += step) {
      const major = Math.round(y / step) % 4 === 0;
      lines.push({ pts: [left, y, right, y], major });
    }
    return lines;
  }, [showGrid, pan, zoom, size, gridSize]);

  const cursorStyle =
    isPanning ? 'grabbing' :
    tool === 'pan' || spacePan ? 'grab' :
    tool === 'select' ? 'default' : 'crosshair';

  // Calibrate the whole drawing from one measured wall: factor = real / drawn.
  const applyScale = () => {
    if (!measureSeg) return;
    const measured = dist(measureSeg.a, measureSeg.b);
    const val = parseFloat(realInput);
    if (!(val > 0) || !(measured > 0)) {
      toast.error('Enter the real length of the measured wall');
      return;
    }
    const realCm = units === 'imperial' ? val * 30.48 : val * 100;
    s.scaleDesign(realCm / measured);
    setMeasureSeg(null);
    setMeasureA(null);
    toast.success(`Drawing scaled — that wall is now ${formatLength(realCm, units)}`);
  };

  // Mitered wall-body polygons, recomputed from the live (drag-preview)
  // positions so corners stay mitered while dragging a wall or a shared corner.
  const liveWalls = useMemo(() => {
    if (!wallEdit && !cornerDrag) return walls;
    return walls.map((w) => {
      let start = wallEdit && wallEdit.id === w.id ? wallEdit.start : w.start;
      let end = wallEdit && wallEdit.id === w.id ? wallEdit.end : w.end;
      if (cornerDrag) {
        if (dist(start, cornerDrag.from) <= 3) start = cornerDrag.to;
        if (dist(end, cornerDrag.from) <= 3) end = cornerDrag.to;
      }
      return start === w.start && end === w.end ? w : { ...w, start, end };
    });
  }, [walls, wallEdit, cornerDrag]);
  const wallPolys = useMemo(() => computeWallPolygons(liveWalls), [liveWalls]);

  // Keep the live pan ref in sync with committed state whenever we're not
  // mid-gesture (during a pan, applyPan owns panRef and we skip this).
  if (!lastPan.current && !pinch.current) {
    panRef.current = { x: pan.x, y: pan.y };
    zoomRef.current = zoom;
  }

  return (
    <div ref={wrapRef} style={{ position: 'absolute', inset: 0 }}>
      <Stage
        ref={stageRef}
        width={size.w}
        height={size.h}
        // Require deliberate movement before any node drag starts, so a tap or
        // small finger jitter selects without nudging furniture/walls/corners.
        dragDistance={IS_COARSE ? 8 : 3}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onStageMouseMove}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onDblClick={() => (tool === 'wall' || tool === 'room') && finishDraft()}
        onContextMenu={(e) => {
          e.evt.preventDefault();
          const p = worldPointer();
          if (!p) return;
          const hit = pickAt(p);
          if (hit) {
            if (!(hit.kind === 'furniture' && selectedIds.includes(hit.id))) {
              s.select({ kind: hit.kind as never, id: hit.id });
            }
            openMenu(e.evt.clientX, e.evt.clientY, hit.kind, hit.id);
          } else {
            openMenu(e.evt.clientX, e.evt.clientY, 'empty', '');
          }
        }}
        style={{ cursor: cursorStyle, background: 'var(--canvas-bg)' }}
      >
        <Layer ref={layerRef} x={pan.x} y={pan.y} scaleX={zoom} scaleY={zoom}>
          {/* Background plan */}
          {background && bgImage && (
            <KImage
              name="bg-plan"
              image={bgImage}
              x={background.x}
              y={background.y}
              width={background.imgWidth * background.scale}
              height={background.imgHeight * background.scale}
              rotation={background.rotation}
              opacity={background.opacity}
              listening={false}
            />
          )}

          {/* Grid */}
          <Group ref={gridRef}>
            {gridLines.map((l, i) => (
              <Line
                key={i}
                points={l.pts}
                stroke={l.major ? C.gridMajor : C.gridMinor}
                strokeWidth={(l.major ? 1.4 : 0.8) / zoom}
                listening={false}
              />
            ))}
          </Group>

          {/* Rooms (floors) */}
          {rooms.map((r) => {
            const fill = FLOOR_BY_ID[r.floorMaterial]?.color ?? r.color;
            const sel = selection.kind === 'room' && selection.id === r.id;
            const c = polygonCentroid(r.points);
            return (
              <Group key={r.id}>
                <Line
                  points={r.points.flatMap((p) => [p.x, p.y])}
                  closed
                  fill={fill}
                  opacity={sel ? 0.7 : 0.55}
                  stroke={sel ? C.selection : 'transparent'}
                  strokeWidth={(sel ? 4 : 3) / zoom}
                  shadowColor={sel ? C.selection : undefined}
                  shadowBlur={sel ? 14 / zoom : 0}
                  shadowOpacity={sel ? 0.5 : 0}
                  perfectDrawEnabled={false}
                  shadowForStrokeEnabled={false}
                  onMouseDown={() => tool === 'select' && s.select({ kind: 'room', id: r.id })}
                />
                <Text
                  x={c.x - 50}
                  y={c.y - 8}
                  width={100}
                  align="center"
                  text={r.name}
                  fontSize={14 / zoom}
                  fill={C.labelInk}
                  fontStyle="bold"
                  listening={false}
                />
              </Group>
            );
          })}

          {/* Walls — selected one drawn last so its handles sit above every
              other wall body (otherwise an adjoining wall covers the corner). */}
          {[...walls]
            .sort((a, b) => (a.id === selection.id ? 1 : 0) - (b.id === selection.id ? 1 : 0))
            .map((w) => {
            const sel = selection.kind === 'wall' && selection.id === w.id;
            // Use live edit positions for the wall being dragged.
            const live = wallEdit && wallEdit.id === w.id ? wallEdit : null;
            let start = live ? live.start : w.start;
            let end = live ? live.end : w.end;
            // Preview a shared-corner drag across every wall touching that corner.
            if (cornerDrag) {
              if (dist(start, cornerDrag.from) <= 3) start = cornerDrag.to;
              if (dist(end, cornerDrag.from) <= 3) end = cornerDrag.to;
            }
            const editing = sel && tool === 'select';
            const hr = HANDLE_R / zoom; // handle radius (cm)
            return (
              <Group key={w.id}>
                {/* Mitered visual body: a filled polygon whose corners are
                    true-mitered against whatever wall shares that endpoint,
                    so skewed/non-orthogonal corners read cleanly instead of
                    the round-cap blobs a stroked line leaves. */}
                <Line
                  points={(wallPolys.get(w.id) ?? [start, end, end, start]).flatMap((p) => [p.x, p.y])}
                  closed
                  fill={sel ? C.selection : C.wallBody}
                  perfectDrawEnabled={false}
                  listening={false}
                />
                {/* Invisible hit/drag target — unchanged interaction, just no
                    longer responsible for the visible wall body. */}
                <Line
                  points={[start.x, start.y, end.x, end.y]}
                  stroke="#000"
                  strokeWidth={w.thickness}
                  lineCap="round"
                  opacity={0}
                  // Body drag translates both endpoints together.
                  draggable={editing}
                  hitStrokeWidth={Math.max(w.thickness, 16 / zoom)}
                  onMouseDown={() => tool === 'select' && s.select({ kind: 'wall', id: w.id })}
                  onDragStart={() => {
                    s.select({ kind: 'wall', id: w.id });
                    setWallEdit({ id: w.id, start: w.start, end: w.end });
                  }}
                  onDragMove={(e) => {
                    // Konva translates the Line node by the drag delta. Read
                    // that delta, apply it to both endpoints, then zero the node
                    // so our computed points stay authoritative (no double move).
                    const dx = e.target.x();
                    const dy = e.target.y();
                    e.target.position({ x: 0, y: 0 });
                    let ns = { x: w.start.x + dx, y: w.start.y + dy };
                    let ne = { x: w.end.x + dx, y: w.end.y + dy };
                    // Snap the start endpoint to nearby joints / grid, shift end by same delta.
                    const snapped = snapEndpoint(ns, w.id);
                    const sdx = snapped.x - ns.x;
                    const sdy = snapped.y - ns.y;
                    ns = { x: ns.x + sdx, y: ns.y + sdy };
                    ne = { x: ne.x + sdx, y: ne.y + sdy };
                    setWallEdit({ id: w.id, start: ns, end: ne });
                  }}
                  onDragEnd={(e) => {
                    e.target.position({ x: 0, y: 0 });
                    setWallEdit((cur) => {
                      if (cur && cur.id === w.id) s.updateWall(w.id, { start: cur.start, end: cur.end });
                      return null;
                    });
                  }}
                />
                {/* endpoint handles + length label */}
                {editing && (
                  <>
                    <WallEndpointHandle
                      x={start.x}
                      y={start.y}
                      r={hr}
                      zoom={zoom}
                      onStart={() => setCornerDrag({ from: w.start, to: w.start })}
                      onMove={(p) => {
                        const sp = snapCornerTarget(p, w.start);
                        setCornerDrag({ from: w.start, to: sp });
                        return sp;
                      }}
                      onEnd={() => {
                        setCornerDrag((cur) => {
                          if (cur) s.moveCorner(cur.from, cur.to);
                          return null;
                        });
                      }}
                    />
                    <WallEndpointHandle
                      x={end.x}
                      y={end.y}
                      r={hr}
                      zoom={zoom}
                      onStart={() => setCornerDrag({ from: w.end, to: w.end })}
                      onMove={(p) => {
                        const sp = snapCornerTarget(p, w.end);
                        setCornerDrag({ from: w.end, to: sp });
                        return sp;
                      }}
                      onEnd={() => {
                        setCornerDrag((cur) => {
                          if (cur) s.moveCorner(cur.from, cur.to);
                          return null;
                        });
                      }}
                    />
                    <Text
                      x={midpoint(start, end).x}
                      y={midpoint(start, end).y - 22 / zoom}
                      text={fmtLen(dist(start, end))}
                      fontSize={13 / zoom}
                      fill="#fff"
                      listening={false}
                    />
                  </>
                )}
              </Group>
            );
          })}

          {/* Openings (doors & windows) */}
          {openings.map((o) => {
            const wall = walls.find((w) => w.id === o.wallId);
            if (!wall) return null;
            const len = dist(wall.start, wall.end) || 1;
            const sel = selection.kind === 'opening' && selection.id === o.id;
            const live = openEdit && openEdit.id === o.id ? openEdit : null;
            // openEdit.offset is kept in cm while dragging; o.offset is a fraction.
            const offsetCm = live ? live.offset : o.offset * len;
            const c = lerp(wall.start, wall.end, offsetCm / len);
            const ang = angleDeg(wall.start, wall.end);
            const t = wall.thickness;
            const wd = o.width;
            const editing = sel && tool === 'select';
            // Unit vector along the wall (for projecting the drag handle).
            const ux = (wall.end.x - wall.start.x) / len;
            const uy = (wall.end.y - wall.start.y) / len;
            const half = wd / 2;
            const clampOffset = (off: number) => Math.max(half, Math.min(len - half, off));
            return (
              <Group
                key={o.id}
                x={c.x}
                y={c.y}
                rotation={ang}
                onMouseDown={() => tool === 'select' && s.select({ kind: 'opening', id: o.id })}
              >
                {/* cut the wall */}
                <Rect x={-wd / 2} y={-t / 2 - 1} width={wd} height={t + 2} fill="#f1f1ec" />
                {o.type === 'door' && (o.style === 'passage' || o.style === 'arch') ? (
                  <>
                    {/* doorless opening: jambs + dashed clear-width line;
                        archways add a second dashed line for the header */}
                    <Line points={[-wd / 2, -t / 2, -wd / 2, t / 2]} stroke="#cfd6e0" strokeWidth={2 / zoom} />
                    <Line points={[wd / 2, -t / 2, wd / 2, t / 2]} stroke="#cfd6e0" strokeWidth={2 / zoom} />
                    <Line points={[-wd / 2, 0, wd / 2, 0]} stroke={sel ? C.selection : '#aeb6c2'} strokeWidth={1.4 / zoom} dash={[6 / zoom, 5 / zoom]} />
                    {o.style === 'arch' && (
                      <Line points={[-wd / 2, -t / 4, wd / 2, -t / 4]} stroke={sel ? C.selection : '#aeb6c2'} strokeWidth={1.2 / zoom} dash={[3 / zoom, 4 / zoom]} />
                    )}
                  </>
                ) : o.type === 'door' && o.style === 'pocket' ? (
                  <>
                    {/* leaf parked in the wall cavity + dashed track across */}
                    <Rect x={-wd / 2 - wd * 0.55} y={-t * 0.28} width={wd * 0.55} height={t * 0.56} fill={sel ? C.selection : '#b9a58c'} />
                    <Line points={[-wd / 2, 0, wd / 2, 0]} stroke={sel ? C.selection : '#aeb6c2'} strokeWidth={1.4 / zoom} dash={[6 / zoom, 5 / zoom]} />
                    <Line points={[-wd / 2, -t / 2, -wd / 2, t / 2]} stroke="#cfd6e0" strokeWidth={2 / zoom} />
                    <Line points={[wd / 2, -t / 2, wd / 2, t / 2]} stroke="#cfd6e0" strokeWidth={2 / zoom} />
                  </>
                ) : o.type === 'door' && o.style === 'bifold' ? (
                  <>
                    {/* folded leaves: the classic W chevron */}
                    <Line points={[-wd / 2, 0, -wd / 4, -wd * 0.3, 0, 0]} stroke={sel ? C.selection : '#8a94a2'} strokeWidth={2 / zoom} />
                    <Line points={[0, 0, wd / 4, -wd * 0.3, wd / 2, 0]} stroke={sel ? C.selection : '#8a94a2'} strokeWidth={2 / zoom} />
                    <Line points={[-wd / 2, -t / 2, -wd / 2, t / 2]} stroke="#cfd6e0" strokeWidth={2 / zoom} />
                    <Line points={[wd / 2, -t / 2, wd / 2, t / 2]} stroke="#cfd6e0" strokeWidth={2 / zoom} />
                  </>
                ) : o.type === 'door' && o.style === 'double' ? (
                  <>
                    {/* two leaves hinged at each jamb, swinging to the centre */}
                    <Line points={[-wd / 2, 0, -wd / 2, -wd / 2]} stroke={sel ? C.selection : '#cfd6e0'} strokeWidth={3 / zoom} />
                    <Arc x={-wd / 2} y={0} innerRadius={wd / 2} outerRadius={wd / 2} angle={90} rotation={270} stroke={sel ? C.selection : '#6b7480'} strokeWidth={1.5 / zoom} />
                    <Line points={[wd / 2, 0, wd / 2, -wd / 2]} stroke={sel ? C.selection : '#cfd6e0'} strokeWidth={3 / zoom} />
                    <Arc x={wd / 2} y={0} innerRadius={wd / 2} outerRadius={wd / 2} angle={90} rotation={180} stroke={sel ? C.selection : '#6b7480'} strokeWidth={1.5 / zoom} />
                    <Line points={[-wd / 2, -t / 2, -wd / 2, t / 2]} stroke="#cfd6e0" strokeWidth={2 / zoom} />
                    <Line points={[wd / 2, -t / 2, wd / 2, t / 2]} stroke="#cfd6e0" strokeWidth={2 / zoom} />
                  </>
                ) : o.type === 'door' && o.style === 'sliding' ? (
                  <>
                    {/* two offset panels, no swing */}
                    <Rect x={-wd / 2} y={-t * 0.45} width={wd * 0.55} height={t * 0.35} fill={sel ? C.selection : '#9db4c4'} />
                    <Rect x={-wd * 0.05} y={t * 0.1} width={wd * 0.55} height={t * 0.35} fill={sel ? C.selection : '#c3d2dc'} />
                    <Line points={[-wd / 2, -t / 2, -wd / 2, t / 2]} stroke="#cfd6e0" strokeWidth={2 / zoom} />
                    <Line points={[wd / 2, -t / 2, wd / 2, t / 2]} stroke="#cfd6e0" strokeWidth={2 / zoom} />
                  </>
                ) : o.type === 'door' ? (
                  <>
                    <Line points={[-wd / 2, 0, -wd / 2, -wd]} stroke={sel ? C.selection : '#cfd6e0'} strokeWidth={3 / zoom} />
                    <Arc
                      x={-wd / 2}
                      y={0}
                      innerRadius={wd}
                      outerRadius={wd}
                      angle={90}
                      rotation={270}
                      stroke={sel ? C.selection : '#6b7480'}
                      strokeWidth={1.5 / zoom}
                    />
                    <Line points={[-wd / 2, -t / 2, -wd / 2, t / 2]} stroke="#cfd6e0" strokeWidth={2 / zoom} />
                    <Line points={[wd / 2, -t / 2, wd / 2, t / 2]} stroke="#cfd6e0" strokeWidth={2 / zoom} />
                  </>
                ) : (
                  <>
                    <Rect
                      x={-wd / 2}
                      y={-t / 2}
                      width={wd}
                      height={t}
                      fill="#dcebf5"
                      stroke={sel ? C.selection : '#6aa6cc'}
                      strokeWidth={2 / zoom}
                    />
                    <Line points={[-wd / 2, 0, wd / 2, 0]} stroke="#7fb8d8" strokeWidth={1.5 / zoom} />
                    {o.style === 'french' && (
                      <Line
                        points={[-wd / 6, -t / 2, -wd / 6, t / 2, 0, t / 2, 0, -t / 2, wd / 6, -t / 2, wd / 6, t / 2]}
                        stroke="#7fb8d8"
                        strokeWidth={1.2 / zoom}
                      />
                    )}
                    {o.style === 'sliding' && (
                      <>
                        {/* two offset sashes */}
                        <Rect x={-wd / 2} y={-t * 0.38} width={wd * 0.55} height={t * 0.28} fill={sel ? C.selection : '#8fc3e0'} />
                        <Rect x={-wd * 0.05} y={t * 0.1} width={wd * 0.55} height={t * 0.28} fill={sel ? C.selection : '#b7d9ec'} />
                      </>
                    )}
                    {o.style === 'casement' && (
                      <>
                        {/* hinged sash swing, like a door but glazed */}
                        <Line points={[-wd / 2, 0, -wd / 2, -wd * 0.7]} stroke={sel ? C.selection : '#7fb8d8'} strokeWidth={2 / zoom} />
                        <Arc x={-wd / 2} y={0} innerRadius={wd * 0.7} outerRadius={wd * 0.7} angle={55} rotation={270} stroke="#7fb8d8" strokeWidth={1.2 / zoom} />
                      </>
                    )}
                  </>
                )}
                {/* drag-along-wall handle (slides the opening's offset) */}
                {editing && (
                  <Circle
                    x={0}
                    y={0}
                    radius={HANDLE_R / zoom}
                    fill={C.handleFill}
                    stroke={C.handleStroke}
                    strokeWidth={2 / zoom}
                    draggable
                    onMouseEnter={(e) => {
                      const st = e.target.getStage();
                      if (st) st.container().style.cursor = 'ew-resize';
                    }}
                    onMouseLeave={(e) => {
                      const st = e.target.getStage();
                      if (st) st.container().style.cursor = 'default';
                    }}
                    onDragStart={() => {
                      s.select({ kind: 'opening', id: o.id });
                      setOpenEdit({ id: o.id, offset: o.offset * len });
                    }}
                    onDragMove={(e) => {
                      // Project the handle's world position onto the wall axis.
                      const ap = e.target.getAbsolutePosition();
                      const st = e.target.getStage();
                      if (!st) return;
                      const wx = (ap.x - pan.x) / zoom;
                      const wy = (ap.y - pan.y) / zoom;
                      const proj = (wx - wall.start.x) * ux + (wy - wall.start.y) * uy;
                      const noff = clampOffset(proj);
                      setOpenEdit({ id: o.id, offset: noff });
                      // Keep the handle pinned to local origin; offset drives position.
                      e.target.position({ x: 0, y: 0 });
                    }}
                    onDragEnd={() => {
                      setOpenEdit((cur) => {
                        if (cur) s.updateOpening(o.id, { offset: clampOffset(cur.offset) / len });
                        return null;
                      });
                    }}
                  />
                )}
                {/* offset label while dragging (counter-rotated to stay upright) */}
                {editing && live && (
                  <Group rotation={-ang}>
                    <Text
                      x={-30 / zoom}
                      y={-t / 2 - 26 / zoom}
                      width={60 / zoom}
                      align="center"
                      text={fmtLen(offsetCm)}
                      fontSize={13 / zoom}
                      fill="#fff"
                      listening={false}
                    />
                  </Group>
                )}
              </Group>
            );
          })}

          {/* Furniture */}
          {furniture.map((f) => {
            const sel = selection.kind === 'furniture' && selection.id === f.id;
            const entry = CATALOG_BY_TYPE[f.type];
            // Live dimensions/rotation while resizing or rotating this item.
            const live = furnEdit && furnEdit.id === f.id ? furnEdit : null;
            const position = live ? live.position : f.position;
            const rotation = live ? live.rotation : f.rotation;
            const width = live ? live.width : f.width;
            const depth = live ? live.depth : f.depth;
            const editing = sel && tool === 'select';
            return (
              <Group key={f.id}>
                <Group
                  x={position.x}
                  y={position.y}
                  rotation={rotation}
                  // On touch an item must be selected before it can be dragged —
                  // the first tap only selects (brushing a stray item can't move
                  // it), a second drag moves it. Mouse keeps one-gesture drag.
                  draggable={tool === 'select' && !moveLock && (!IS_COARSE || sel || selectedIds.includes(f.id))}
                  onMouseDown={(e) => {
                    if (tool !== 'select') return;
                    e.cancelBubble = true; // don't let the stage re-select
                    if (e.evt.shiftKey) s.toggleSelected(f.id);
                    else if (!selectedIds.includes(f.id)) s.select({ kind: 'furniture', id: f.id });
                  }}
                  onDragStart={(e) => {
                    draggingFurn.current = e.target;
                    // One render to hide this item's handles; after that the drag
                    // is pure Konva (no React) until release — this is the fix
                    // for choppy object-moving on slower phones.
                    setDraggingFurnId(f.id);
                  }}
                  onDragMove={(e) => {
                    // Snap the node in place; deliberately no setState here.
                    e.target.position(snapToGrid({ x: e.target.x(), y: e.target.y() }, showGrid ? gridSize / 2 : 1));
                  }}
                  onDragEnd={(e) => {
                    draggingFurn.current = null;
                    setDraggingFurnId(null);
                    // A pinch cancelled this drag — discard it so the object stays put.
                    if (pinch.current) {
                      e.target.position({ x: f.position.x, y: f.position.y });
                      return;
                    }
                    const np = { x: e.target.x(), y: e.target.y() };
                    if (multi && selectedIds.includes(f.id)) {
                      s.moveFurnitureGroup(selectedIds, np.x - f.position.x, np.y - f.position.y);
                    } else {
                      s.updateFurniture(f.id, { position: np });
                    }
                  }}
                >
                  <Rect
                    x={-width / 2}
                    y={-depth / 2}
                    width={width}
                    height={depth}
                    fill={f.color}
                    opacity={0.55}
                    cornerRadius={Math.min(width, depth) * 0.08}
                    stroke={sel || selectedIds.includes(f.id) ? C.selection : C.furnitureOutline}
                    strokeWidth={(sel || selectedIds.includes(f.id) ? 3 : 1) / zoom}
                  />
                  <FurnitureSymbol
                    shape={entry?.shape ?? 'box'}
                    width={width}
                    depth={depth}
                    color={sel ? C.selection : C.symbolInk}
                  />
                </Group>
                {editing && draggingFurnId !== f.id && (
                  <FurnitureHandles
                    box={{ position, width, depth }}
                    rotation={rotation}
                    zoom={zoom}
                    pan={pan}
                    onResizeStart={() =>
                      setFurnEdit({ id: f.id, position, rotation, width, depth })
                    }
                    onResize={(b) =>
                      setFurnEdit({
                        id: f.id,
                        position: b.position,
                        rotation,
                        width: b.width,
                        depth: b.depth,
                      })
                    }
                    onRotateStart={() =>
                      setFurnEdit({ id: f.id, position, rotation, width, depth })
                    }
                    onRotate={(deg) =>
                      setFurnEdit({ id: f.id, position, rotation: deg, width, depth })
                    }
                    onCommit={() => {
                      setFurnEdit((cur) => {
                        if (cur && cur.id === f.id) {
                          s.updateFurniture(f.id, {
                            position: cur.position,
                            rotation: norm360(cur.rotation),
                            width: cur.width,
                            depth: cur.depth,
                          });
                        }
                        return null;
                      });
                    }}
                  />
                )}
              </Group>
            );
          })}

          {/* Dimension annotations — drawn above furniture so labels stay
              visible and tappable (in Select mode) even over objects. */}
          {showDimensions && (
            <DimensionsLayer zoom={zoom} onEditWall={tool === 'select' ? openDimEdit : undefined} />
          )}

          {/* Ghost preview of the object about to be placed */}
          {tool === 'furniture' &&
            s.pendingFurnitureType &&
            s.pendingFurnitureType !== 'door' &&
            s.pendingFurnitureType !== 'window' &&
            cursor &&
            CATALOG_BY_TYPE[s.pendingFurnitureType] && (
              <FurnitureGhost
                entry={CATALOG_BY_TYPE[s.pendingFurnitureType]}
                at={cursor}
                zoom={zoom}
              />
            )}

          {/* Draft (in-progress wall/room) */}
          {draft.length > 0 && (
            <DraftView draft={draft} cursor={cursor} tool={tool} zoom={zoom} units={units} lengthInput={lengthInput} />
          )}

          {/* Live kitchen-run ghost: tiled cabinet outlines from the start tap to
              the cursor, each showing its facing, before the second tap commits. */}
          {tool === 'kitchen' && draft.length === 1 && cursor && (
            <KitchenRunGhost a={draft[0]} b={cursor} rooms={rooms} walls={walls} zoom={zoom} color={C.selection} />
          )}

          {/* Inference guide line (axis / extension / parallel / perpendicular). */}
          {(tool === 'wall' || tool === 'room') && snapKind === 'guide' && snapGuide && (
            <Line
              points={[
                snapGuide.x0 - snapGuide.dx * 100000,
                snapGuide.y0 - snapGuide.dy * 100000,
                snapGuide.x0 + snapGuide.dx * 100000,
                snapGuide.y0 + snapGuide.dy * 100000,
              ]}
              stroke="#1f9d55"
              strokeWidth={1 / zoom}
              dash={[6 / zoom, 6 / zoom]}
              listening={false}
              opacity={0.7}
            />
          )}

          {/* Snap indicator while drawing: a point/midpoint lock (magenta), or a
              guide/segment inference (green/blue). */}
          {(tool === 'wall' || tool === 'room') && cursor && snapKind !== 'free' && snapKind !== 'grid' && (
            <SnapIndicator at={cursor} kind={snapKind} zoom={zoom} />
          )}

          {/* Tape measure (live A→cursor, or frozen A→B) */}
          {tool === 'measure' && (measureSeg || (measureA && cursor)) && (
            <MeasureView
              a={measureSeg ? measureSeg.a : (measureA as Point)}
              b={measureSeg ? measureSeg.b : (cursor as Point)}
              zoom={zoom}
              units={units}
            />
          )}
        </Layer>
      </Stage>
      {menu && <ContextMenu menu={menu} multi={multi} count={selectedIds.length} onClose={closeMenu} />}

      {/* Inline length editor over a tapped dimension label. */}
      {dimEdit && (
        <div
          className="dim-edit"
          style={{ left: dimEdit.x, top: dimEdit.y }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <input
            type="number"
            min="0"
            step="0.01"
            autoFocus
            value={dimEdit.value}
            onChange={(e) => setDimEdit((cur) => (cur ? { ...cur, value: e.target.value } : cur))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applyDimEdit();
              if (e.key === 'Escape') setDimEdit(null);
            }}
            onBlur={applyDimEdit}
          />
          <span className="dim-edit-unit">{units === 'imperial' ? 'ft' : 'm'}</span>
        </div>
      )}

      {/* Scale-from-wall calibration card (after a measurement is frozen). */}
      {tool === 'measure' && measureSeg && (
        <div className="measure-card">
          <div className="mc-title">Set scale from this wall</div>
          <div className="mc-sub">Measured: {formatLength(dist(measureSeg.a, measureSeg.b), units)}</div>
          <div className="mc-row">
            <span>Real length</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={realInput}
              autoFocus
              onChange={(e) => setRealInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applyScale();
              }}
            />
            <span className="mc-unit">{units === 'imperial' ? 'ft' : 'm'}</span>
          </div>
          <div className="mc-actions">
            <button className="mc-apply" onClick={applyScale}>Scale drawing</button>
            <button
              className="mc-dismiss"
              onClick={() => {
                setMeasureSeg(null);
                setMeasureA(null);
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Right-click context menu (HTML overlay, fixed to the pointer). */
function ContextMenu({
  menu,
  multi,
  count,
  onClose,
}: {
  menu: { x: number; y: number; kind: string; id: string; wp: Point | null };
  multi: boolean;
  count: number;
  onClose: () => void;
}) {
  const s = useDesign();
  useEffect(() => {
    const close = () => onClose();
    window.addEventListener('pointerdown', close);
    window.addEventListener('wheel', close, { passive: true });
    window.addEventListener('blur', close);
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onEsc);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('wheel', close);
      window.removeEventListener('blur', close);
      window.removeEventListener('keydown', onEsc);
    };
  }, [onClose]);

  const item = (label: string, fn: () => void, opts?: { danger?: boolean; sub?: string }) => (
    <button
      className={`ctx-item ${opts?.danger ? 'danger' : ''}`}
      onPointerDown={(e) => {
        e.stopPropagation();
        fn();
        onClose();
      }}
    >
      <span>{label}</span>
      {opts?.sub && <kbd>{opts.sub}</kbd>}
    </button>
  );

  const noun = multi ? `${count} items` : menu.kind;
  return (
    <div className="ctx-menu" style={{ left: menu.x, top: menu.y }} onPointerDown={(e) => e.stopPropagation()}>
      {menu.kind === 'empty' ? (
        <>
          {item('Paste', () => s.paste(menu.wp ?? undefined), { sub: '⌘V' })}
          {item('Select all', () => s.setSelectedIds(s.furniture.map((f) => f.id)), { sub: '⌘A' })}
        </>
      ) : (
        <>
          {(menu.kind === 'furniture' || menu.kind === 'wall' || menu.kind === 'opening') &&
            item('Duplicate', () => s.duplicateSelection(), { sub: '⌘D' })}
          {menu.kind === 'furniture' && item('Copy', () => s.copySelection(), { sub: '⌘C' })}
          {menu.kind === 'furniture' && !multi && (
            <>
              {item('Bring to front', () => s.bringToFront(menu.id))}
              {item('Send to back', () => s.sendToBack(menu.id))}
            </>
          )}
          <div className="ctx-sep" />
          {item(`Delete ${noun}`, () => s.deleteSelected(), { danger: true, sub: '⌫' })}
        </>
      )}
    </div>
  );
}

/** Translucent footprint that follows the cursor before placing furniture. */
function FurnitureGhost({
  entry,
  at,
  zoom,
}: {
  entry: { width: number; depth: number; shape: import('../../data/furnitureCatalog').Shape3D };
  at: Point;
  zoom: number;
}) {
  const C = canvasColors(useTheme((t) => t.theme));
  return (
    <Group x={at.x} y={at.y} listening={false} opacity={0.75}>
      <Rect
        x={-entry.width / 2}
        y={-entry.depth / 2}
        width={entry.width}
        height={entry.depth}
        fill="rgba(59,99,246,0.14)"
        stroke={C.selection}
        strokeWidth={1.5 / zoom}
        dash={[8 / zoom, 5 / zoom]}
        cornerRadius={Math.min(entry.width, entry.depth) * 0.08}
      />
      <FurnitureSymbol shape={entry.shape} width={entry.width} depth={entry.depth} color={C.selection} />
    </Group>
  );
}

/** Ghost preview for the kitchen-run tool: dashed base-cabinet footprints tiled
 *  from a→b, each with a front-edge tick showing which way it faces. */
function KitchenRunGhost({
  a, b, rooms, walls, zoom, color,
}: {
  a: Point; b: Point; rooms: { points: Point[] }[]; walls: { start: Point; end: Point }[]; zoom: number; color: string;
}) {
  const units = kitchenRunUnits(a, b, rooms, walls);
  const w = RUN_UNIT.width;
  const d = RUN_UNIT.depth;
  return (
    <>
      {units.map((u, i) => (
        <Group key={i} x={u.position.x} y={u.position.y} rotation={u.rotation} listening={false} opacity={0.7}>
          <Rect
            x={-w / 2}
            y={-d / 2}
            width={w}
            height={d}
            fill="rgba(59,99,246,0.14)"
            stroke={color}
            strokeWidth={1.5 / zoom}
            dash={[8 / zoom, 5 / zoom]}
            cornerRadius={4}
          />
          {/* front edge (faces +Y at rotation 0) */}
          <Line points={[-w * 0.34, d * 0.42, w * 0.34, d * 0.42]} stroke={color} strokeWidth={2.5 / zoom} listening={false} />
        </Group>
      ))}
    </>
  );
}

// Tape-measure overlay: a dashed line between two points with end ticks and a
// pill-backed distance label at the midpoint (respects the units toggle).
function MeasureView({ a, b, zoom, units }: { a: Point; b: Point; zoom: number; units: Units }) {
  const C = canvasColors(useTheme((t) => t.theme));
  const len = dist(a, b);
  const mid = midpoint(a, b);
  const dx = (b.x - a.x) / (len || 1);
  const dy = (b.y - a.y) / (len || 1);
  const nx = -dy;
  const ny = dx;
  const tick = 7 / zoom;
  const label = formatLength(len, units);
  const fs = 13 / zoom;
  const padX = 7 / zoom;
  const boxW = label.length * fs * 0.62 + padX * 2;
  const boxH = fs + 9 / zoom;
  const ACCENT = C.accent; // warm, distinct from the blue draw colour
  return (
    <Group listening={false}>
      <Line points={[a.x, a.y, b.x, b.y]} stroke={ACCENT} strokeWidth={1.6 / zoom} dash={[9 / zoom, 6 / zoom]} />
      <Line points={[a.x - nx * tick, a.y - ny * tick, a.x + nx * tick, a.y + ny * tick]} stroke={ACCENT} strokeWidth={1.6 / zoom} />
      <Line points={[b.x - nx * tick, b.y - ny * tick, b.x + nx * tick, b.y + ny * tick]} stroke={ACCENT} strokeWidth={1.6 / zoom} />
      <Circle x={a.x} y={a.y} radius={3 / zoom} fill={ACCENT} />
      <Circle x={b.x} y={b.y} radius={3 / zoom} fill={ACCENT} />
      <Rect
        x={mid.x - boxW / 2 + nx * (14 / zoom)}
        y={mid.y - boxH / 2 + ny * (14 / zoom)}
        width={boxW}
        height={boxH}
        fill={ACCENT}
        cornerRadius={boxH / 2}
      />
      <Text
        x={mid.x - boxW / 2 + nx * (14 / zoom)}
        y={mid.y - fs / 2 + ny * (14 / zoom) - 1 / zoom}
        width={boxW}
        align="center"
        text={label}
        fontSize={fs}
        fontStyle="bold"
        fill="#fff"
      />
    </Group>
  );
}

/** Inference marker at the cursor: a point/midpoint lock (magenta square) or a
 *  guide/segment inference (green/blue ring), à la SketchUp/CAD tools. */
function SnapIndicator({ at, kind, zoom }: { at: Point; kind: SnapKind; zoom: number }) {
  const r = 7 / zoom;
  if (kind === 'point' || kind === 'midpoint') {
    const color = kind === 'midpoint' ? '#1f9d55' : '#e0299b';
    return (
      <Rect
        x={at.x - r}
        y={at.y - r}
        width={r * 2}
        height={r * 2}
        stroke={color}
        strokeWidth={2 / zoom}
        fill={`${color}2e`}
        cornerRadius={kind === 'midpoint' ? r : 0}
        listening={false}
      />
    );
  }
  const color = kind === 'segment' ? '#2f7ed8' : '#1f9d55';
  return (
    <Circle x={at.x} y={at.y} radius={r} stroke={color} strokeWidth={2 / zoom} fill={`${color}22`} listening={false} />
  );
}

function DraftView({
  draft, cursor, tool, zoom, units, lengthInput,
}: { draft: Point[]; cursor: Point | null; tool: string; zoom: number; units: Units; lengthInput: string }) {
  const C = canvasColors(useTheme((t) => t.theme));
  const last = draft[draft.length - 1];
  // While typing a length, lock the ghost segment's endpoint to that distance
  // (direction still follows the mouse — angle/guide snapping still applies).
  const typedVal = parseFloat(lengthInput);
  const typing = lengthInput.length > 0 && cursor && last;
  let previewEnd = cursor;
  if (typing && typedVal > 0) {
    const lenCm = units === 'imperial' ? typedVal * 30.48 : typedVal * 100;
    const dx = cursor.x - last.x;
    const dy = cursor.y - last.y;
    const d = Math.hypot(dx, dy) || 1;
    previewEnd = { x: last.x + (dx / d) * lenCm, y: last.y + (dy / d) * lenCm };
  }
  const pts = previewEnd ? [...draft, previewEnd] : draft;
  const flat = pts.flatMap((p) => [p.x, p.y]);
  return (
    <Group listening={false}>
      <Line
        points={flat}
        closed={tool === 'room'}
        stroke={C.selection}
        strokeWidth={(tool === 'wall' ? 8 : 2) / zoom}
        lineCap="round"
        opacity={0.7}
        dash={tool === 'room' ? [10 / zoom, 6 / zoom] : undefined}
        fill={tool === 'room' ? 'rgba(76,141,255,0.12)' : undefined}
      />
      {draft.map((p, i) => (
        <Circle key={i} x={p.x} y={p.y} radius={5 / zoom} fill="#fff" stroke={C.selection} strokeWidth={2 / zoom} />
      ))}
      {cursor && last && (
        <Text
          x={midpoint(last, previewEnd ?? cursor).x}
          y={midpoint(last, previewEnd ?? cursor).y - 20 / zoom}
          text={
            lengthInput
              ? `${lengthInput}${units === 'imperial' ? ' ft' : ' m'} ▏ Enter to confirm`
              : `${formatLength(dist(last, cursor), units)}  ·  ${Math.round(((angleDeg(last, cursor) % 360) + 360) % 360)}°`
          }
          fontSize={13 / zoom}
          fill={lengthInput ? '#ffd94a' : '#fff'}
          fontStyle={lengthInput ? 'bold' : 'normal'}
        />
      )}
    </Group>
  );
}

// ---- Wall endpoint handle ----
// A draggable round handle that reports its Layer-local (cm) position.
function WallEndpointHandle({
  x, y, r, zoom, onStart, onMove, onEnd,
}: {
  x: number;
  y: number;
  r: number;
  zoom: number;
  onStart: () => void;
  onMove: (p: Point) => Point;
  onEnd: () => void;
}) {
  const C = canvasColors(useTheme((t) => t.theme));
  return (
    <Circle
      x={x}
      y={y}
      radius={r}
      fill={C.handleFill}
      stroke={C.handleStroke}
      strokeWidth={2 / zoom}
      // Grab area is much larger than the dot so corners are easy to catch
      // (especially on touch); the visible handle stays small.
      hitStrokeWidth={(IS_COARSE ? 34 : 26) / zoom}
      draggable
      onMouseEnter={(e) => {
        const st = e.target.getStage();
        if (st) st.container().style.cursor = 'move';
      }}
      onMouseLeave={(e) => {
        const st = e.target.getStage();
        if (st) st.container().style.cursor = 'default';
      }}
      onDragStart={(e) => {
        e.cancelBubble = true;
        onStart();
      }}
      onDragMove={(e) => {
        e.cancelBubble = true;
        // Snap the dragged endpoint and pin the handle to the snapped spot so
        // the visual handle and the wall endpoint stay locked together.
        const snapped = onMove({ x: e.target.x(), y: e.target.y() });
        e.target.position(snapped);
      }}
      onDragEnd={(e) => {
        e.cancelBubble = true;
        onEnd();
      }}
    />
  );
}

// ---- Furniture resize + rotate handles ----
// Rendered in a group at the item's center, rotated to its local frame, so the
// four corner handles and the rotation stalk track the (possibly rotated) box.
function FurnitureHandles({
  box, rotation, zoom, pan, onResizeStart, onResize, onRotateStart, onRotate, onCommit,
}: {
  box: Box;
  rotation: number;
  zoom: number;
  pan: Point;
  onResizeStart: () => void;
  onResize: (b: Box) => void;
  onRotateStart: () => void;
  onRotate: (deg: number) => void;
  onCommit: () => void;
}) {
  const C = canvasColors(useTheme((t) => t.theme));
  const hr = (IS_COARSE ? 11 : 7) / zoom; // corner handle radius (cm) — bigger on touch
  const grab = (IS_COARSE ? 22 : 0) / zoom; // extra invisible hit area for fingertips
  const { width, depth, position } = box;
  const corners: Point[] = [
    { x: -width / 2, y: -depth / 2 },
    { x: width / 2, y: -depth / 2 },
    { x: width / 2, y: depth / 2 },
    { x: -width / 2, y: depth / 2 },
  ];
  const stalk = 28 / zoom; // rotation stalk length above the top edge (cm)
  const rotPos: Point = { x: 0, y: -depth / 2 - stalk };

  // Convert a Konva drag event's absolute position to world (cm).
  const evtWorld = (e: Konva.KonvaEventObject<DragEvent>): Point => {
    const ap = e.target.getAbsolutePosition();
    return { x: (ap.x - pan.x) / zoom, y: (ap.y - pan.y) / zoom };
  };

  return (
    <Group x={position.x} y={position.y} rotation={rotation}>
      {/* selection bounding box */}
      <Rect
        x={-width / 2}
        y={-depth / 2}
        width={width}
        height={depth}
        stroke={C.selection}
        strokeWidth={1.5 / zoom}
        dash={[6 / zoom, 4 / zoom]}
        listening={false}
      />
      {/* rotation stalk + handle */}
      <Line
        points={[0, -depth / 2, rotPos.x, rotPos.y]}
        stroke={C.selection}
        strokeWidth={1.5 / zoom}
        listening={false}
      />
      <Circle
        x={rotPos.x}
        y={rotPos.y}
        radius={hr}
        hitStrokeWidth={grab}
        fill={C.handleFill}
        stroke={C.handleStroke}
        strokeWidth={2 / zoom}
        draggable
        onMouseEnter={(e) => {
          const st = e.target.getStage();
          if (st) st.container().style.cursor = 'grab';
        }}
        onMouseLeave={(e) => {
          const st = e.target.getStage();
          if (st) st.container().style.cursor = 'default';
        }}
        onDragStart={(e) => {
          e.cancelBubble = true;
          onRotateStart();
        }}
        onDragMove={(e) => {
          e.cancelBubble = true;
          const w = evtWorld(e);
          // Angle from center to pointer; the stalk points "up" (-90°) at 0 rot.
          const deg = (Math.atan2(w.y - position.y, w.x - position.x) * 180) / Math.PI + 90;
          onRotate(snapAngleTo(deg, 15, 5));
          // Pin handle back to its local slot; rotation drives the group.
          e.target.position(rotPos);
        }}
        onDragEnd={(e) => {
          e.cancelBubble = true;
          onCommit();
        }}
      />
      {/* corner resize handles (circles so their absolute position is the
          corner center — no offset correction needed) */}
      {corners.map((c, i) => (
        <Circle
          key={i}
          x={c.x}
          y={c.y}
          radius={hr}
          hitStrokeWidth={grab}
          fill={C.handleFill}
          stroke={C.handleStroke}
          strokeWidth={2 / zoom}
          draggable
          onMouseEnter={(e) => {
            const st = e.target.getStage();
            if (st) st.container().style.cursor = i === 0 || i === 2 ? 'nwse-resize' : 'nesw-resize';
          }}
          onMouseLeave={(e) => {
            const st = e.target.getStage();
            if (st) st.container().style.cursor = 'default';
          }}
          onDragStart={(e) => {
            e.cancelBubble = true;
            onResizeStart();
          }}
          onDragMove={(e) => {
            e.cancelBubble = true;
            const w = evtWorld(e);
            const nb = resizeBox(box, i, w, rotation, 10);
            onResize(nb);
          }}
          onDragEnd={(e) => {
            e.cancelBubble = true;
            onCommit();
          }}
        />
      ))}
      {/* size label (counter-rotated to stay upright) */}
      <Group rotation={-rotation}>
        <Text
          x={-40 / zoom}
          y={depth / 2 + 10 / zoom}
          width={80 / zoom}
          align="center"
          text={`${Math.round(width)} × ${Math.round(depth)} cm`}
          fontSize={12 / zoom}
          fill="#fff"
          listening={false}
        />
      </Group>
    </Group>
  );
}

// Local point-in-polygon (avoids importing into hot path repeatedly).
function pointInPoly(p: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    if (yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
