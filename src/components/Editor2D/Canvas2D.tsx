import { useEffect, useLayoutEffect, useRef, useState, useMemo } from 'react';
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
  polygonVisualCenter,
  polygonArea,
  boundsOf,
} from '../../lib/geometry';
import { FLOOR_BY_ID, CATALOG_BY_TYPE, type Shape3D } from '../../data/furnitureCatalog';
import { MATERIAL_BY_ID, materialUrl } from '../../data/materials';
import { FURNITURE_SPRITES, spriteUrl } from '../../data/furnitureSprites';
import { SPRITE_FILL } from '../../data/furnitureModels';
import { spriteBox } from '../../lib/spriteFit';
import DimensionsLayer, { DimensionPlate } from './DimensionsLayer';
import SelectionRing from '../SelectionRing';
import { drawBridge, useDraw, toast } from '../../lib/ui';
import { useI18n } from '../../lib/i18n';
import { planCapture } from '../../lib/renderBridge';
import FurnitureSymbol from './FurnitureSymbol';
import { buildSnapElements, nearestSnap, lockToAngle, type SnapKind, type GuideLine } from '../../lib/snapping';
import {
  isDragDrawTool, shouldPanOnTouch, stripDegenerateTail, roomRectangle, readoutOffsetCm, transformPlan,
} from '../../lib/drawGesture';
import { kitchenRunUnits, RUN_UNIT } from '../../lib/kitchenRun';
import { computeWallPolygons } from '../../lib/wallGeometry';
import { isFence, isHalfWall } from '../../lib/fence';
import { wallDistances } from '../../lib/distanceGuides';
import { formatLength, formatArea, type Units } from '../../lib/units';
import { measureTextPx } from '../../lib/textMeasure';

/** Konva's default line height is 1.0, which crowds a wrapped room name. */
const NAME_LINE_H = 1.12;
import { selectionTick, tapMedium } from '../../lib/haptics';
import { useTheme, canvasColors } from '../../lib/theme';
import { isSurfacePlaceable, isWallPlaceable, supportElevationAt } from '../../lib/furniturePlacement';
import { notifyPlacementComplete } from '../../lib/placementFeedback';
import type { Point, Selection, Wall } from '../../types';
import {
  resizeBox,
  scaleBox,
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

// How far a finger may wander before a tap becomes a drag/pan. This also
// bounds the long-press menu: a tester reported that holding an object never
// produced the delete menu, and the old 7px was the cause — a finger held for
// half a second on a high-DPI phone drifts well past that, so the hold turned
// into a pan instead. 12px is still under Konva's own 8px node dragDistance
// plus a fingertip's width, so deliberate drags are unaffected.
const TAP_SLOP = IS_COARSE ? 12 : 7;
/** Angle-lock tolerance while tracing a background plan (~6°). Much tighter
 *  than free drawing: the goal is to straighten a wall the user clearly meant
 *  to be square, not to reinterpret a deliberately angled one. */
const TRACE_ANGLE_LOCK = (6 * Math.PI) / 180;
const LONG_PRESS_MS = 500; // matches Android's ViewConfiguration long-press

// Handle visuals (screen-space px; divided by zoom at render to stay constant).

export default function Canvas2D({ onEditSelection }: { onEditSelection?: () => void } = {}) {
  const C = canvasColors(useTheme((t) => t.theme));
  const tr = useI18n();
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
    wallAngleLock: st.wallAngleLock,
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
    addRoomWithWalls: st.addRoomWithWalls,
    detectRoomsFromWalls: st.detectRoomsFromWalls,
    addKitchenRun: st.addKitchenRun,
    updateBackground: st.updateBackground,
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
    tool, zoom, pan, showGrid, gridSize, wallAngleLock, selection, selectedIds, showDimensions, units, moveLock,
  } = s;
  const multi = selectedIds.length > 1;
  const fmtLen = (cm: number) => formatLength(cm, units);

  const bgImage = useHtmlImage(background?.src);

  // Draft state for in-progress drawing.
  const [draft, setDraft] = useState<Point[]>([]);
  const [cursor, setCursor] = useState<Point | null>(null);
  const roomDragStartRef = useRef<Point | null>(null);
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
    { id: string; position: Point; rotation: number; width: number; depth: number; height: number } | null
  >(null);

  // Screen position of the one selected object, for the touch action ring.
  // Recomputed from live edit state so the ring follows a resize/rotate.
  const ringAnchor = useMemo(() => {
    if (selection.kind !== 'furniture' || !selection.id) return null;
    const f = furniture.find((item) => item.id === selection.id);
    if (!f) return null;
    const live = furnEdit && furnEdit.id === f.id ? furnEdit : null;
    const p = live ? live.position : f.position;
    return { id: f.id, x: p.x * zoom + pan.x, y: p.y * zoom + pan.y };
  }, [selection.kind, selection.id, furniture, furnEdit, zoom, pan]);
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
    // Switching tools mid-drag must not leave a live preview behind. Safe to
    // call the hoisted const: effects run after the render that defines it.
    endDrawDrag();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool]);

  // Frame the whole design when asked (after load / import) once size is known.
  // Keyed on BOTH the request and the measured size: the stage mounts at a
  // guessed 800×600, then the ResizeObserver reports the real (often much
  // narrower phone) size a tick later — we must re-frame for that real size, or
  // the plan stays fit to the guess and reads as over-zoomed on entry.
  const lastFit = useRef({ req: 0, w: 0, h: 0 });
  useEffect(() => {
    if (s.fitRequest === 0 || size.w === 0) return;
    const f = lastFit.current;
    if (s.fitRequest === f.req && size.w === f.w && size.h === f.h) return;
    lastFit.current = { req: s.fitRequest, w: size.w, h: size.h };
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
      // Breathing room around the design (cm) — wide enough that the overall
      // dimension lines + their text (drawn outside the walls) aren't clipped.
      const padCm = 120;
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
        const url = stage.toDataURL({ x: rx, y: ry, width: rw, height: rh, pixelRatio, mimeType: 'image/png' });
        return { url, pxPerCm: z * pixelRatio };
      } finally {
        if (grid && gridWasVisible) grid.visible(true);
        stage.draw();
      }
    };
    return () => {
      planCapture.current = null;
    };
  }, []);

  const undoDraftPoint = () => {
    setLengthInput('');
    setDraft((points) => points.slice(0, -1));
    setCursor(null);
    setSnapKind('free');
    setSnapGuide(null);
  };

  // Keyboard: Enter/Escape to finish, Delete to remove, undo/redo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      const chaining = (tool === 'wall' || tool === 'halfWall' || tool === 'fence') && draft.length > 0;
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
      } else if (chaining && (e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undoDraftPoint();
      } else if (chaining && e.key === 'Backspace' && !lengthInput) {
        e.preventDefault();
        undoDraftPoint();
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
    if (tool === 'wall' || tool === 'halfWall' || tool === 'fence' || tool === 'room' || tool === 'kitchen') {
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
    // Tracing an imported plan: the grid is deliberately NOT applied (its
    // origin and scale have nothing to do with the traced image), but that
    // used to leave a trace with no assistance at all — a tester asked for
    // "snap to grid… otherwise it's difficult to tap precisely exactly each
    // corner". Straighten near-axis segments without quantising position, at a
    // tighter tolerance so a genuinely angled wall is left alone.
    if (background && draft.length > 0
      && (tool === 'wall' || tool === 'halfWall' || tool === 'fence' || tool === 'room')) {
      const straight = lockToAngle(draft[draft.length - 1], p, undefined, TRACE_ANGLE_LOCK, wallAngleLock);
      if (straight !== p) {
        snapKindRef.current = 'grid';
        return straight;
      }
    }
    // Grid — skipped while tracing over a background so free angles aren't fought.
    if (showGrid && !background) {
      // Square-to-grid angle lock (identical to the 3D drawing): when drawing
      // a chain, pull near-45° segments exactly onto the axis so beginners get
      // straight walls without hunting for the guide line.
      if ((tool === 'wall' || tool === 'halfWall' || tool === 'fence' || tool === 'room') && draft.length > 0) {
        const locked = lockToAngle(draft[draft.length - 1], p, (pt) => snapToGrid(pt, gridSize), undefined, wallAngleLock);
        snapKindRef.current = 'grid';
        return locked;
      }
      snapKindRef.current = 'grid';
      return snapToGrid(p, gridSize);
    }
    // The angle lock otherwise lives ENTIRELY inside the grid branch, so with
    // the grid switched off there is no straightening at all. That is fine for
    // the '45' default — it is long-standing behaviour and quietly adding snap
    // to everyone's freehand drawing is not what the reviewer asked for — but
    // '90' is an explicit opt-in, and a setting that stops working because an
    // unrelated toggle is off is a bug report waiting to happen. Straighten
    // without quantising position, since the grid is off or being traced over.
    if (wallAngleLock === '90' && draft.length > 0
      && (tool === 'wall' || tool === 'halfWall' || tool === 'fence' || tool === 'room')) {
      const locked = lockToAngle(draft[draft.length - 1], p, undefined, undefined, wallAngleLock);
      if (locked !== p) {
        snapKindRef.current = 'grid';
        return locked;
      }
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
      // Trace mode rotates the imported plan by the twist between the fingers.
      angle: Math.atan2(b.clientY - a.clientY, b.clientX - a.clientX),
    };
  };

  // --- trace mode: position the imported plan ------------------------------
  // The plan has x/y/scale/rotation, but until now x/y could not be set at all:
  // it was pinned wherever the import dropped it, with only a numeric cm/px
  // field and a rotation slider to work with. Trace mode makes it draggable.
  const traceOne = useRef<{ x: number; y: number } | null>(null);
  const tracePinch = useRef<{ dist: number; center: Point; angle: number } | null>(null);
  const traceArmed = tool === 'trace' && !!background && !background.locked;

  /** Client px → plan cm. */
  const clientToWorld = (cx: number, cy: number): Point | null => {
    const stage = stageRef.current;
    if (!stage) return null;
    const r = stage.container().getBoundingClientRect();
    return {
      x: (cx - r.left - panRef.current.x) / zoomRef.current,
      y: (cy - r.top - panRef.current.y) / zoomRef.current,
    };
  };

  const nudgePlan = (about: Point, k: number, dDeg: number, dx: number, dy: number) => {
    // Read live: a fast gesture fires many moves between renders.
    const bg = useDesign.getState().background;
    if (!bg || bg.locked) return;
    s.updateBackground(transformPlan(bg, about, k, dDeg, dx, dy));
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
    if (tool === 'wall' || tool === 'halfWall' || tool === 'fence') {
      setDraft((d) => [...d, snapped]);
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
          if (isHalfWall(hit.wall)) {
            toast.info(tr('Openings need a full-height wall.'));
            return;
          }
          const len = dist(hit.wall.start, hit.wall.end) || 1;
          const half = catalogEntry.width / 2;
          // Pass a 0..1 fraction; the store clamps it so the opening fits.
          const frac = Math.max(half / len, Math.min(1 - half / len, hit.t));
          const id = s.addOpening(hit.wall.id, frac, type);
          s.select({ kind: 'opening', id });
          s.setPendingFurniture(null);
          s.setTool('select');
          notifyPlacementComplete(type);
        }
      } else {
        let position = snapped;
        let rotation = 0;
        let elevation: number | undefined;
        if (isWallPlaceable(catalogEntry)) {
          const hit = nearestWall(p);
          if (!hit || hit.dist >= Math.max(hit.wall.thickness * 2, 55 / zoom)) {
            toast.info(tr('Tap a wall to place this object.'));
            return;
          }
          position = lerp(hit.wall.start, hit.wall.end, hit.t);
          rotation = angleDeg(hit.wall.start, hit.wall.end);
          elevation = catalogEntry.mountY ?? 110;
        } else if (isSurfacePlaceable(catalogEntry)) {
          elevation = supportElevationAt(position, s.furniture);
        }
        const id = s.addFurniture(type, position, { rotation, elevation });
        s.select({ kind: 'furniture', id });
        // Object placement is deliberately one-shot. The new item stays
        // selected for moving/scaling instead of the next tap duplicating it.
        s.setPendingFurniture(null);
        s.setTool('select');
        notifyPlacementComplete(type);
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
    // Compatibility mouse events fired for a touch we have already handled.
    // Ignoring them here stops a drag-release placing its point twice.
    if (Date.now() < ghostMouseUntilRef.current) return;
    const isMiddle = e.evt.button === 1;
    const p = worldPointer();
    if (!p) return;
    // Desktop gets the same positioning gesture: press and drag the plan.
    // Scale and rotation stay on the numeric field and slider, which are more
    // precise with a mouse than a two-finger twist would be.
    if (traceArmed && e.evt.button === 0) {
      traceOne.current = { x: e.evt.clientX, y: e.evt.clientY };
      return;
    }
    if (tool === 'pan' || isMiddle || e.evt.button === 2 || spacePan) {
      setIsPanning(true);
      // Anchor immediately so the very first mousemove already pans.
      lastPan.current = { x: e.evt.clientX, y: e.evt.clientY };
      return;
    }
    if (tool === 'room' && e.evt.button === 0) {
      const start = applySnaps(p);
      roomDragStartRef.current = start;
      setDraft([start]);
      setCursor(start);
      return;
    }
    actAt(p);
  };

  const finishRoomDrag = (rawEnd: Point | null) => {
    const start = roomDragStartRef.current;
    roomDragStartRef.current = null;
    if (!start || !rawEnd) {
      setDraft([]);
      return;
    }
    const end = applySnaps(rawEnd);
    if (Math.abs(end.x - start.x) >= 40 && Math.abs(end.y - start.y) >= 40) {
      s.addRoomWithWalls(roomRectangle(start, end));
    }
    setDraft([]);
    setCursor(null);
  };

  const onMouseUp = () => {
    if (tool === 'room' && roomDragStartRef.current) finishRoomDrag(worldPointer());
  };

  useEffect(() => {
    if (tool !== 'room') return;
    const up = (event: MouseEvent) => {
      if (!roomDragStartRef.current) return;
      finishRoomDrag(clientToWorld(event.clientX, event.clientY) ?? lastCursorRef.current);
    };
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool]);

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
    setDraft((d2) => [...d2, next]);
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

  // Tapping away has to close the length editor.
  //
  // The input's `onBlur` handles this with a mouse, but NOT on touch: the Konva
  // stage is a <canvas>, which is not focusable, so tapping it never moves
  // focus and never fires blur. A tester hit exactly that and reported being
  // "stuck" in the dialog with only the keyboard's Enter to escape — on a phone
  // that is a dead end. A document-level pointerdown catches every case.
  useEffect(() => {
    if (!dimEdit) return;
    const onDown = (e: PointerEvent) => {
      if ((e.target as Element | null)?.closest?.('.dim-edit')) return;
      applyDimEdit();
    };
    // Capture: the stage stops propagation on its own pointer handlers.
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dimEdit?.wallId]);

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

  // ---- touch: tap to act, one-finger drag from empty canvas to pan (or
  // anywhere while objects are locked), two-finger pinch to zoom & pan ----
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

  // --- press-drag-release drawing (touch) ---------------------------------
  /** This one-finger touch owns a drawing gesture, so it must never pan. */
  const drawDragRef = useRef(false);
  // Some Android/WebView touchend events clear the stage pointer together
  // with `touches`. Retain the last valid world point so release still commits
  // where the finger visibly left the rubber band.
  const lastDrawPointRef = useRef<Point | null>(null);
  const pendingPreviewRef = useRef<Point | null>(null);
  const previewRafRef = useRef<number | null>(null);
  // The rAF callback fires after the event that scheduled it, possibly after a
  // re-render. Going through a ref means it always calls the CURRENT
  // publishCursor — one captured from an old render would snap against a stale
  // draft and quietly place points against the previous chain state.
  const publishRef = useRef<(p: Point) => void>(() => {});
  // A tap on touch is followed by compatibility mouse events unless they are
  // suppressed. That used to be harmless for a drag (a drag panned and never
  // committed), but now every drag-release places a point — so a leaked ghost
  // mousedown would place a SECOND point on top of it.
  const ghostMouseUntilRef = useRef(0);

  const cancelPreview = () => {
    if (previewRafRef.current !== null) cancelAnimationFrame(previewRafRef.current);
    previewRafRef.current = null;
    pendingPreviewRef.current = null;
    lastDrawPointRef.current = null;
  };

  /** Coalesce to one snap+render per frame: touchmove fires faster than frames
   *  on a 120Hz phone, and each preview is a React setState. */
  const schedulePreview = (p: Point) => {
    pendingPreviewRef.current = p;
    if (previewRafRef.current !== null) return;
    previewRafRef.current = requestAnimationFrame(() => {
      previewRafRef.current = null;
      const pt = pendingPreviewRef.current;
      if (pt) publishRef.current(pt);
    });
  };

  /** End a draw gesture without committing anything. Clearing `cursor` matters:
   *  left set, DraftView would draw a zero-length rubber band from the point
   *  just placed to itself, reading "0.00 m · 0°" under a finger that has gone. */
  const endDrawDrag = () => {
    drawDragRef.current = false;
    cancelPreview();
    setCursor(null);
    setSnapKind('free');
    setSnapGuide(null);
    snapKindRef.current = 'free';
    snapGuideRef.current = null;
    lastHardSnapRef.current = null;
  };

  useEffect(() => cancelPreview, []);

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
      // A second finger means zoom, not draw. Abandon the in-progress point —
      // `touchMoved` is already true above, so the release cannot commit one.
      if (drawDragRef.current) endDrawDrag();
      if (traceArmed) {
        // Two fingers scale and rotate the PLAN, not the viewport.
        tracePinch.current = twoFinger(t);
        traceOne.current = null;
        pinch.current = null;
      }
    } else if (t.length === 1) {
      touchMoved.current = false;
      touchStartPt.current = { x: t[0].clientX, y: t[0].clientY };
      if (traceArmed) traceOne.current = { x: t[0].clientX, y: t[0].clientY };
      // A drag that starts on empty canvas (or the traced background plan)
      // pans the viewport — but NOT with a drawing tool armed, where one
      // finger draws and panning moves to two. Lock mode extends the pan
      // surface across rooms, walls and furniture for every other tool, so a
      // plan that fills the screen is still navigable with one finger.
      const target = e.target as Konva.Node;
      touchPanEligible.current = shouldPanOnTouch({
        tool,
        moveLock,
        targetIsStage: target === target.getStage(),
        targetIsBgPlan: target.name() === 'bg-plan',
      });
      if (isDragDrawTool(tool)) {
        drawDragRef.current = true;
        const wp = worldPointer();
        // Publish synchronously, not through the rAF: the rubber band and snap
        // marker have to appear the instant the finger lands, which is most of
        // what makes the gesture feel magnetic rather than blind.
        if (wp) {
          lastDrawPointRef.current = wp;
          if (tool === 'room') {
            const start = applySnaps(wp);
            roomDragStartRef.current = start;
            setDraft([start]);
            setCursor(start);
          } else {
            publishCursor(wp);
          }
        }
      }
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
              s.select({ kind: hit.kind, id: hit.id });
            }
            openMenu(cx, cy, hit.kind, hit.id);
          } else {
            openMenu(cx, cy, 'empty', '');
          }
        }, LONG_PRESS_MS);
      }
    }
  };

  const onTouchMove = (e: Konva.KonvaEventObject<TouchEvent>) => {
    const t = e.evt.touches;
    // Trace mode moves the PLAN, so it takes both gestures before the normal
    // pan/pinch/draw handling can claim them.
    if (traceArmed && t.length === 2 && tracePinch.current) {
      e.evt.preventDefault();
      const next = twoFinger(t);
      const prev = tracePinch.current;
      const about = clientToWorld(next.center.x, next.center.y);
      if (about) {
        const k = next.dist / (prev.dist || next.dist);
        const dDeg = ((next.angle - prev.angle) * 180) / Math.PI;
        const z = zoomRef.current;
        nudgePlan(about, k, dDeg, (next.center.x - prev.center.x) / z, (next.center.y - prev.center.y) / z);
      }
      tracePinch.current = next;
      return;
    }
    if (traceArmed && t.length === 1 && traceOne.current) {
      e.evt.preventDefault();
      const cur = { x: t[0].clientX, y: t[0].clientY };
      const z = zoomRef.current;
      nudgePlan({ x: 0, y: 0 }, 1, 0, (cur.x - traceOne.current.x) / z, (cur.y - traceOne.current.y) / z);
      traceOne.current = cur;
      touchMoved.current = true;
      cancelLongPress();
      return;
    }
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
      if (drawDragRef.current) {
        // The finger is drawing: track it live and never fall through to pan.
        // `touchMoved` still has to flip past slop so the release is treated as
        // a drag rather than a tap.
        const st0 = touchStartPt.current;
        if (!touchMoved.current && st0 && Math.hypot(cur.x - st0.x, cur.y - st0.y) >= TAP_SLOP) {
          touchMoved.current = true;
        }
        cancelLongPress();
        const wp = worldPointer();
        if (wp) {
          lastDrawPointRef.current = wp;
          schedulePreview(wp);
        }
        return;
      }
      if (!touchMoved.current) {
        // Tap slop: fingers jitter a few px — don't turn taps into drags.
        const st0 = touchStartPt.current;
        if (st0 && Math.hypot(cur.x - st0.x, cur.y - st0.y) < TAP_SLOP) return;
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
      // preventDefault only works while the event is cancellable. Belt and
      // braces: a leaked ghost mousedown would now place a SECOND point on top
      // of the one this release just committed.
      ghostMouseUntilRef.current = Date.now() + 500;
      cancelLongPress();
      if (longPressFired.current) {
        // The long-press already opened the context menu — swallow the tap.
        longPressFired.current = false;
        endDrawDrag();
      } else if (drawDragRef.current) {
        // Prefer the point captured from the final touchmove. Konva may retain
        // a non-null but stale press position after the touch list is cleared,
        // which would otherwise append the starting corner twice.
        const p = lastDrawPointRef.current ?? worldPointer();
        // Cancel the queued frame BEFORE committing: otherwise it lands after
        // endDrawDrag's setCursor(null) and repaints a rubber band reaching for
        // a finger that has already lifted.
        cancelPreview();
        // Commit the RAW point — actAt re-runs applySnaps, so the placed corner
        // is exactly the previewed one, and room-closing and the kitchen run's
        // second point work on release with no extra code.
        if (tool === 'room') finishRoomDrag(p);
        else if (p) actAt(p);
        endDrawDrag();
      } else if (!touchMoved.current && tool !== 'pan') {
        const p = worldPointer();
        if (p) actAt(p);
      }
      pinch.current = null;
      touchStartPt.current = null;
      touchPanEligible.current = false;
      traceOne.current = null;
      tracePinch.current = null;
      endPan();
    }
  };

  // Android takes touches away mid-gesture (system back-swipe, notification
  // shade, the WebView's own long-press). Without this, `longPressFired` stayed
  // true because onTouchEnd never ran, and the NEXT tap was silently swallowed.
  // Konva maps DOM touchcancel onto its internal pointercancel and never emits
  // a `touchcancel` event of its own, so this has to be a plain DOM listener.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const cancel = () => {
      cancelLongPress();
      longPressFired.current = false;
      pinch.current = null;
      touchStartPt.current = null;
      touchPanEligible.current = false;
      touchMoved.current = false;
      lastPan.current = null;
      setIsPanning(false);
      traceOne.current = null;
      tracePinch.current = null;
      // Without this a snatched gesture leaves the preview frozen on screen,
      // rubber-banding to a finger that is no longer there.
      endDrawDrag();
    };
    el.addEventListener('touchcancel', cancel);
    return () => el.removeEventListener('touchcancel', cancel);
    // Mount-once by design. endDrawDrag only touches refs and useState setters,
    // all of which are stable, so the captured copy stays correct.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * The ONE place the live drawing preview is published. Everything the user
   * sees while placing a point — the rubber band, the length/angle readout, the
   * snap marker, the inference guide, the snap haptic — is gated on `cursor`,
   * and this is the only writer.
   *
   * It used to be inlined in onMouseMove, which is exactly how touch ended up
   * with none of it: Konva routes touchmove to a separate event map, so a finger
   * never reached that handler and `cursor` stayed null forever on a phone.
   * Keeping a single publisher means the two input paths cannot drift apart
   * again.
   */
  const publishCursor = (raw: Point) => {
    lastCursorRef.current = raw;
    // applySnaps also sets snapKindRef/snapGuideRef and fires the haptic tick.
    setCursor(applySnaps(raw));
    setSnapKind(snapKindRef.current);
    setSnapGuide(snapGuideRef.current);
  };
  // Kept fresh every render so the rAF preview never snaps against a stale
  // draft. Assigned here rather than beside the ref because `publishCursor` is
  // in its temporal dead zone until this point.
  publishRef.current = publishCursor;

  const onMouseMove = (e?: Konva.KonvaEventObject<MouseEvent>) => {
    if (traceArmed && traceOne.current && e) {
      const z = zoomRef.current;
      nudgePlan(
        { x: 0, y: 0 }, 1, 0,
        (e.evt.clientX - traceOne.current.x) / z,
        (e.evt.clientY - traceOne.current.y) / z,
      );
      traceOne.current = { x: e.evt.clientX, y: e.evt.clientY };
      return;
    }
    // While panning, the layer is moving imperatively — a cursor-snap setState
    // here would re-render and fight (reset) that live position. Skip it.
    if (lastPan.current) return;
    const p = worldPointer();
    if (!p) return;
    publishCursor(p);
  };

  const onStageMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    onMouseMove(e);
  };
  const endPan = () => {
    setIsPanning(false);
    lastPan.current = null;
    // A trace drag ends the same way a pan does.
    traceOne.current = null;
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
    // Finishing with a double-click/double-tap necessarily places a point on
    // the FIRST of the two, so the chain arrives here ending in a duplicate and
    // would emit a zero-length wall. Long-standing on desktop too, since
    // onMouseDown commits on press.
    const d = stripDegenerateTail(draft, 1);
    if ((tool === 'wall' || tool === 'halfWall' || tool === 'fence') && d.length >= 2) {
      const kind = tool === 'fence' ? 'fence' : tool === 'halfWall' ? 'half' : 'wall';
      for (let i = 0; i < d.length - 1; i++) s.addWall(d[i], d[i + 1], kind);
      if (tool === 'wall') s.detectRoomsFromWalls();
    } else if (tool === 'kitchen' && d.length >= 1 && cursor) {
      s.addKitchenRun(d[0], cursor);
    }
    setDraft([]);
  };

  // The browser regression suite needs to distinguish "the gesture never
  // committed" from "Finish did not flush the draft" without exposing editor
  // internals in production builds.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const testWindow = window as unknown as {
      __draftLen?: () => number;
      __draftPoints?: () => Point[];
    };
    testWindow.__draftLen = () => draft.length;
    testWindow.__draftPoints = () => draft.map((point) => ({ ...point }));
    return () => {
      delete testWindow.__draftLen;
      delete testWindow.__draftPoints;
    };
  }, [draft]);

  // Expose finish() + active state to the on-canvas "Finish" affordance.
  useEffect(() => {
    drawBridge.finish = finishDraft;
    drawBridge.cancel = () => setDraft([]);
    drawBridge.undoPoint = undoDraftPoint;
    // One point is enough to show the pill. With drag-drawing the first gesture
    // ends with a single corner placed, and requiring two left the user with no
    // ✕ on screen and no way out but switching tools. Finish still no-ops below
    // the minimum for the shape, so nothing can be committed prematurely.
    const active = isDragDrawTool(tool) && draft.length >= 1;
    useDraw.getState().setActive(active);
    return () => {
      drawBridge.finish = null;
      drawBridge.cancel = null;
      drawBridge.undoPoint = null;
      useDraw.getState().setActive(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, tool]);

  // A frozen measurement opens the calibration card (top-centre). Signal it so
  // App hides the measure tip bubble, which would otherwise overlap the card.
  useEffect(() => {
    const on = tool === 'measure' && !!measureSeg;
    useDraw.getState().setCalibrating(on);
    return () => useDraw.getState().setCalibrating(false);
  }, [tool, measureSeg]);

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

  /** Is `p` on this opening? A door is a RECTANGLE along its wall, so a radial
   *  test was wrong at both ends: it missed the outer thirds of a wide door
   *  (the tap fell through to the wall — "when I try to select the door, often
   *  it will select the wall instead") while over-claiming perpendicular to a
   *  narrow one. Matching what is drawn fixes both. */
  const hitsOpening = (p: Point, o: (typeof openings)[number]): boolean => {
    const op = openingPoint(o);
    if (!op) return false;
    const { pt, wall } = op;
    const len = dist(wall.start, wall.end) || 1;
    const ux = (wall.end.x - wall.start.x) / len;
    const uy = (wall.end.y - wall.start.y) / len;
    // Distance along the wall, and perpendicular to it.
    const along = Math.abs((p.x - pt.x) * ux + (p.y - pt.y) * uy);
    const across = Math.abs((p.x - pt.x) * -uy + (p.y - pt.y) * ux);
    const slop = 8 / zoom; // a fingertip's worth, constant on screen
    return along <= o.width / 2 + slop && across <= Math.max(wall.thickness, 14 / zoom) / 2 + slop;
  };

  // What sits under a world point (top-most first), without selecting.
  const pickAt = (p: Point): { kind: NonNullable<Selection['kind']>; id: string } | null => {
    for (const o of openings) {
      if (hitsOpening(p, o)) return { kind: 'opening', id: o.id };
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
    // Openings (clickable along their wall). Shares `hitsOpening` with pickAt —
    // the two used to carry the same radial test written out twice, so fixing
    // one would silently have left door selection broken through the other.
    for (const o of openings) {
      if (hitsOpening(p, o)) {
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
  // Label anchor per room: the visual centre (pole of inaccessibility), so
  // concave / L-shaped rooms label in open floor rather than on a partition.
  // Memoised on room geometry so it never recomputes during pan/zoom.
  const roomLabelCenters = useMemo(() => {
    const m = new Map<string, Point>();
    for (const r of rooms) m.set(r.id, polygonVisualCenter(r.points));
    return m;
  }, [rooms]);

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
        // On touch this MUST match TAP_SLOP. It used to be 8 against a slop of
        // 12, which left a 4px band where the two disagreed: a finger settling
        // ~10px still counted as a hold (so the long-press menu opened) while
        // Konva had already started dragging, so the item shifted under the
        // menu you were opening. Inside the slop, nothing moves.
        dragDistance={IS_COARSE ? TAP_SLOP : 3}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onMouseMove={onStageMouseMove}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onDblClick={() => (tool === 'wall' || tool === 'halfWall' || tool === 'fence') && finishDraft()}
        // Touch had no equivalent of double-click-to-finish: Konva emits
        // `dbltap`, which was never wired, so the pill was the only way out.
        // A common drag workflow starts the next segment at the previous
        // corner. Konva also calls that a double-tap; only finish when the
        // second gesture stayed a tap, otherwise it would erase the first
        // corner just before the dragged endpoint is committed.
        onDblTap={() => {
          // Konva reports two quick taps as a double-tap even when they are at
          // different corners. Only the conventional same-spot gesture should
          // finish; rapid point placement must keep extending the chain.
          const a = draft[draft.length - 2];
          const b = draft[draft.length - 1];
          const sameSpot = !!a && !!b && dist(a, b) < (IS_COARSE ? 38 : 25) / zoom;
          if (isDragDrawTool(tool) && tool !== 'kitchen' && tool !== 'room' && !touchMoved.current && sameSpot) {
            finishDraft();
          }
        }}
        onContextMenu={(e) => {
          e.evt.preventDefault();
          const p = worldPointer();
          if (!p) return;
          const hit = pickAt(p);
          if (hit) {
            if (!(hit.kind === 'furniture' && selectedIds.includes(hit.id))) {
              s.select({ kind: hit.kind, id: hit.id });
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

          {/* Rooms (floors) — selected one drawn last so its outline sits
              above its neighbours (mirrors the wall ordering below). */}
          {[...rooms]
            .sort((a, b) => (selection.kind === 'room' && a.id === selection.id ? 1 : 0)
              - (selection.kind === 'room' && b.id === selection.id ? 1 : 0))
            .map((r) => {
            const floorMat = FLOOR_BY_ID[r.floorMaterial];
            const fill = floorMat?.color ?? r.color;
            // A custom uploaded floor image wins; otherwise the material's
            // built-in photoreal texture drives the pattern fill.
            const texId = floorMat?.texture;
            const textureSrc = r.texture?.src ?? (texId ? materialUrl(texId) : undefined);
            const textureScaleCm = r.texture
              ? r.texture.scaleCm
              : (texId ? MATERIAL_BY_ID[texId]?.scaleCm ?? 200 : 200);
            const sel = selection.kind === 'room' && selection.id === r.id;
            return (
              <Group key={r.id}>
                <RoomFloorFill
                  points={r.points}
                  sel={sel}
                  flatFill={fill}
                  textureSrc={textureSrc}
                  textureScaleCm={textureScaleCm}
                  selectionColor={C.selection}
                  zoom={zoom}
                  onSelect={() => tool === 'select' && s.select({ kind: 'room', id: r.id })}
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
                {isFence(w) ? (
                  /* A fence is a line on the ground, not a piece of building.
                     Drawing it dashed and thin (rather than as a mitered solid
                     body) is how plans distinguish a boundary from a wall, and
                     it stops a garden edge reading as a room divider. */
                  <Line
                    points={[start.x, start.y, end.x, end.y]}
                    stroke={sel ? C.selection : C.wallEdge}
                    strokeWidth={Math.max(3, w.thickness * 0.6)}
                    dash={[18, 12]}
                    lineCap="butt"
                    perfectDrawEnabled={false}
                    shadowForStrokeEnabled={false}
                    listening={false}
                  />
                ) : (
                  /* Mitered visual body: a filled polygon whose corners are
                     true-mitered against whatever wall shares that endpoint,
                     so skewed/non-orthogonal corners read cleanly instead of
                     the round-cap blobs a stroked line leaves. */
                  <Line
                    points={(wallPolys.get(w.id) ?? [start, end, end, start]).flatMap((p) => [p.x, p.y])}
                    closed
                    fill={sel ? C.selection : C.wallBody}
                    stroke={sel ? C.selection : C.wallEdge}
                    strokeWidth={1 / zoom}
                    lineJoin="round"
                    perfectDrawEnabled={false}
                    shadowForStrokeEnabled={false}
                    listening={false}
                  />
                )}
                {isHalfWall(w) && (
                  /* Architectural plan convention: a dashed centre line makes
                     the low wall distinct without changing its selectable body. */
                  <Line
                    points={[start.x, start.y, end.x, end.y]}
                    stroke={sel ? C.selection : C.wallEdge}
                    strokeWidth={1.5 / zoom}
                    dash={[8 / zoom, 5 / zoom]}
                    lineCap="butt"
                    perfectDrawEnabled={false}
                    shadowForStrokeEnabled={false}
                    listening={false}
                  />
                )}
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
                <Group
                  scaleX={o.type === 'door' && o.flipHinge ? -1 : 1}
                  scaleY={o.type === 'door' && o.flipSwing ? -1 : 1}
                >
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
                </Group>
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
                  // One-gesture drag on every pointer type (tester: "moving
                  // furniture takes time to actually move" — the old rule made
                  // the first touch-drag only select). The 8px dragDistance slop
                  // still separates taps from drags, and the explicit Lock
                  // toggle is now the accidental-move protection.
                  draggable={tool === 'select' && !moveLock}
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
                  <FurnitureItemGraphic
                    type={f.type}
                    shape={entry?.shape ?? 'box'}
                    width={width}
                    depth={depth}
                    color={f.color}
                    symbolColor={sel ? C.selection : C.symbolInk}
                    outlineColor={C.furnitureOutline}
                    selected={sel || selectedIds.includes(f.id)}
                    selectionColor={C.selection}
                    zoom={zoom}
                    dashed={(entry?.mountY ?? 0) > 0}
                  />
                </Group>
                {editing && !multi && draggingFurnId !== f.id && showDimensions && (
                  <WallDistanceGuides
                    box={{ position, width, depth }}
                    rotation={rotation}
                    walls={walls}
                    zoom={zoom}
                    units={units}
                  />
                )}
                {editing && draggingFurnId !== f.id && (
                  <FurnitureHandles
                    box={{ position, width, depth }}
                    rotation={rotation}
                    zoom={zoom}
                    pan={pan}
                    onResizeStart={() =>
                      setFurnEdit({ id: f.id, position, rotation, width, depth, height: f.height })
                    }
                    onResize={(b, scale) =>
                      setFurnEdit({
                        id: f.id,
                        position: b.position,
                        rotation,
                        width: b.width,
                        depth: b.depth,
                        // A proportional scale carries the height with it —
                        // otherwise a "bigger" sofa is wider but the same height
                        // and reads wrong the moment you switch to 3D. The free
                        // Shift-stretch passes no scale and leaves it alone.
                        height: scale === undefined ? f.height : f.height * scale,
                      })
                    }
                    onRotateStart={() =>
                      setFurnEdit({ id: f.id, position, rotation, width, depth, height: f.height })
                    }
                    onRotate={(deg) =>
                      setFurnEdit({ id: f.id, position, rotation: deg, width, depth, height: f.height })
                    }
                    onCommit={() => {
                      setFurnEdit((cur) => {
                        if (cur && cur.id === f.id) {
                          s.updateFurniture(f.id, {
                            position: cur.position,
                            rotation: norm360(cur.rotation),
                            width: cur.width,
                            depth: cur.depth,
                            height: cur.height,
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

          {/* Room names — drawn HERE, above furniture, for the same reason the
              dimension annotations below are. They used to render inside the
              rooms group, so every sofa and bed drew straight over the label
              that was supposed to be sitting on a plate above the floor: a bed
              covered "Master Bedroom", a rug covered "Deck". */}
          {rooms.map((r) => {
            const c = roomLabelCenters.get(r.id) ?? polygonCentroid(r.points);
            // Sizing is SCREEN-space: font and box scale by 1/zoom so names
            // never wrap mid-word when zoomed out (a fixed cm box did exactly
            // that — "Great Room" became "Gre / at / Roo / m").
            const { min, max } = boundsOf(r.points);
            const screenW = (max.x - min.x) * zoom;
            const screenH = (max.y - min.y) * zoom;
            // Only label a room big enough on screen to hold one.
            if (!(screenW > 34 && screenH > 20)) return null;
            const showArea = screenH > 40;
            const areaFs = 11 / zoom;
            const lineGap = 3 / zoom;
            const nameText = tr(r.name);
            const areaText = formatArea(polygonArea(r.points), units);
            // Never wider than the room itself, so a long name in a narrow room
            // is ellipsised instead of running into the room next door —
            // "Living R" ended up printed across "Kitchen & Dining".
            const padX = 9 / zoom;
            const padY = 6 / zoom;
            // Clamp the PLATE, not the text — padding is added after the text is
            // sized, so clamping the text still let the plate itself overrun the
            // room by 2x padX. Measured on the suburban template: 8 of 13 plates
            // hung over a neighbouring room that way.
            const maxPlateW = Math.min(186 / zoom, (max.x - min.x) * 0.94);
            const avail = Math.max(0, maxPlateW - padX * 2);
            // At the default fit-the-whole-plan zoom a 5m room is only ~70
            // screen px wide, and "Sitting Room" needs ~85px at 13px bold. It
            // does not fit on one line at any honest size, so it wraps rather
            // than being cut to "Sittin…". Shrinking alone was tried and made it
            // worse — truncated AND small reads worse than truncated at full
            // size. Wrapping plus a modest shrink actually fits the longest word.
            const wantW = measureTextPx(nameText, 13 / zoom, true);
            const fit = wantW > 0 ? avail / wantW : 1;
            const nameFs = (13 / zoom) * (fit >= 1 ? 1 : fit >= 0.75 ? fit : 0.78);
            // Konva falls back to breaking mid-WORD when a single word is wider
            // than the box, which turns a 2.4m hallway into "Hal / lwa / y". If
            // the longest word cannot fit, no honest label exists at this zoom —
            // drop it and let the user zoom in, rather than print debris.
            const longestWordW = Math.max(
              ...nameText.split(/\s+/).map((w) => measureTextPx(w, nameFs, true)),
            );
            if (longestWordW > avail) return null;
            const nameLines = measureTextPx(nameText, nameFs, true) > avail ? 2 : 1;
            // Same rule for the area line: a truncated "1…" says nothing, so it
            // is shown only when it fits whole.
            const areaW = showArea ? measureTextPx(areaText, areaFs) : 0;
            const withArea = showArea && areaW <= avail;
            // Measured, not estimated. The plate and the text derive from ONE
            // width, so truncation lands exactly at the plate's inner edge and
            // the name can never hang outside its own backing.
            const textW = Math.max(0, Math.min(
              avail,
              Math.max(nameLines > 1 ? avail : measureTextPx(nameText, nameFs, true), withArea ? areaW : 0),
            ));
            const nameH = nameFs * NAME_LINE_H * nameLines;
            const plateW = textW + padX * 2;
            const plateH = (withArea ? nameH + areaFs + lineGap : nameH) + padY * 2;
            return (
              <Group key={`label-${r.id}`} listening={false}>
                <Rect
                  x={c.x - plateW / 2}
                  y={c.y - plateH / 2}
                  width={plateW}
                  height={plateH}
                  cornerRadius={Math.min(plateH / 2, 10 / zoom)}
                  fill={C.dimensionPlate}
                  stroke={C.dimensionPlateStroke}
                  strokeWidth={0.6 / zoom}
                  listening={false}
                />
                <Text
                  x={c.x - textW / 2}
                  y={c.y - (withArea ? (nameH + lineGap + areaFs) / 2 : nameH / 2)}
                  width={textW}
                  align="center"
                  text={nameText}
                  fontSize={nameFs}
                  lineHeight={NAME_LINE_H}
                  fill={C.labelInk}
                  fontStyle="bold"
                  wrap="word"
                  ellipsis
                  listening={false}
                />
                {withArea && (
                  <Text
                    x={c.x - textW / 2}
                    y={c.y - (nameH + lineGap + areaFs) / 2 + nameH + lineGap}
                    width={textW}
                    align="center"
                    text={areaText}
                    fontSize={areaFs}
                    fill={C.labelInk}
                    opacity={0.72}
                    wrap="none"
                    ellipsis
                    listening={false}
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
            <DraftView
              draft={draft} cursor={cursor} tool={tool} zoom={zoom} units={units} lengthInput={lengthInput}
              readoutDy={
                IS_COARSE && cursor
                  ? readoutOffsetCm({ screenY: cursor.y * zoom + pan.y, zoom })
                  : null
              }
            />
          )}

          {/* Live kitchen-run ghost: tiled cabinet outlines from the start tap to
              the cursor, each showing its facing, before the second tap commits. */}
          {tool === 'kitchen' && draft.length === 1 && cursor && (
            <KitchenRunGhost a={draft[0]} b={cursor} rooms={rooms} walls={walls} zoom={zoom} color={C.selection} />
          )}

          {/* Inference guide line (axis / extension / parallel / perpendicular). */}
          {(tool === 'wall' || tool === 'halfWall' || tool === 'fence' || tool === 'room') && snapKind === 'guide' && snapGuide && (
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
          {(tool === 'wall' || tool === 'halfWall' || tool === 'fence' || tool === 'room') && cursor && snapKind !== 'free' && snapKind !== 'grid' && (
            <SnapIndicator at={cursor} kind={snapKind} zoom={zoom} />
          )}

          {/* The first measure point, held until the second tap lands.
              MeasureView below needs a cursor to draw its rubber band, and
              touch has no hover — so on a phone the first tap used to produce
              no feedback whatsoever. */}
          {tool === 'measure' && measureA && !measureSeg && (
            <Group x={measureA.x} y={measureA.y} listening={false}>
              <Circle radius={9 / zoom} fill={C.selection} opacity={0.22} />
              <Circle
                radius={4.5 / zoom}
                fill={C.handleFill}
                stroke={C.selection}
                strokeWidth={2 / zoom}
              />
            </Group>
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
      {/* Touch selection actions, fanned beside the object. Replaces
          auto-opening the full-height properties drawer, which covered the very
          thing you had just selected. Single furniture selection only: a
          multi-selection has no one anchor, and walls/rooms/openings are edited
          through Properties where their own controls live. */}
      {IS_COARSE && tool === 'select' && !multi && draft.length === 0 && ringAnchor &&
        s.furniture.find((item) => item.id === ringAnchor.id)?.type !== 'stairs' && (
        <SelectionRing
          x={ringAnchor.x}
          y={ringAnchor.y}
          bounds={{ w: size.w, h: size.h }}
          actions={[
            {
              id: 'rotate',
              run: () => {
                const f = s.furniture.find((x) => x.id === ringAnchor.id);
                if (f) s.updateFurniture(f.id, { rotation: (f.rotation + 90) % 360 });
              },
              // Same 15° magnet the stalk handle uses, so the two rotation
              // affordances cannot disagree about where an angle settles.
              drag: (deg) => s.updateFurniture(ringAnchor.id, {
                rotation: norm360(snapAngleTo(deg, 15, 5)),
              }),
            },
            { id: 'duplicate', run: () => s.duplicateSelection() },
            { id: 'edit', run: () => onEditSelection?.() },
            { id: 'delete', run: () => s.deleteSelected() },
          ]}
        />
      )}
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
          <div className="mc-title">{tr('Set scale from this wall')}</div>
          <div className="mc-sub">{tr('Measured:')} {formatLength(dist(measureSeg.a, measureSeg.b), units)}</div>
          <div className="mc-row">
            <span>{tr('Real length')}</span>
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
            <button className="mc-apply" onClick={applyScale}>{tr('Scale drawing')}</button>
            <button
              className="mc-dismiss"
              onClick={() => {
                setMeasureSeg(null);
                setMeasureA(null);
              }}
            >
              {tr('Dismiss')}
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
  const t = useI18n();

  // Keep the menu on screen and grow it from the corner nearest the tap.
  // It is placed with its top-left ON the tap point, so near the right or
  // bottom edge — which on a phone is most of the screen — it used to render
  // partly outside the viewport. Flip it back over the tap point instead, and
  // move the transform-origin to match so it still appears to come from the
  // finger rather than sliding in from nowhere.
  const boxRef = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState({ x: menu.x, y: menu.y, origin: 'top left' });
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    // Correct against where the menu ACTUALLY landed, not against menu.x/menu.y.
    // `.ctx-menu` is position:fixed, but an ancestor carries a transform, which
    // makes it a containing block — so `left/top` resolve against that box, not
    // the viewport, and the menu renders offset from the pointer by the
    // toolbar's height. Comparing viewport coordinates against those values gave
    // the wrong answer (it flipped the transform-origin while leaving the
    // position untouched). Measuring the rect sidesteps the whole question.
    //
    // offsetWidth/Height rather than the rect's size: the entry animation is
    // still scaling the element, so the rect reports the visual (smaller) box.
    const width = el.offsetWidth;
    const height = el.offsetHeight;
    const r = el.getBoundingClientRect();
    const pad = 8;
    // How far the menu, at full size, spills past each viewport edge.
    const overRight = r.left + width + pad - window.innerWidth;
    const overBottom = r.top + height + pad - window.innerHeight;
    const overLeft = pad - r.left;
    const overTop = pad - r.top;
    let x = menu.x;
    let y = menu.y;
    if (overRight > 0) x -= overRight;
    if (overBottom > 0) y -= overBottom;
    if (overLeft > 0) x += overLeft;
    if (overTop > 0) y += overTop;
    setPlace({
      x,
      y,
      // Grow from the corner nearest the pointer, so a menu that had to move up
      // or left still reads as coming out of the finger.
      origin: `${overBottom > 0 ? 'bottom' : 'top'} ${overRight > 0 ? 'right' : 'left'}`,
    });
  }, [menu.x, menu.y]);

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

  const noun = multi ? `${count} ${t('items')}` : t(menu.kind);
  return (
    <div
      ref={boxRef}
      className="ctx-menu"
      style={{ left: place.x, top: place.y, ['--ctx-origin' as string]: place.origin }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {menu.kind === 'empty' ? (
        <>
          {item(t('Paste'), () => s.paste(menu.wp ?? undefined), { sub: '⌘V' })}
          {item(t('Select all'), () => s.setSelectedIds(s.furniture.map((f) => f.id)), { sub: '⌘A' })}
        </>
      ) : (
        <>
          {(menu.kind === 'furniture' || menu.kind === 'wall' || menu.kind === 'opening') &&
            item(t('Duplicate'), () => s.duplicateSelection(), { sub: '⌘D' })}
          {menu.kind === 'furniture' && item(t('Copy'), () => s.copySelection(), { sub: '⌘C' })}
          {menu.kind === 'furniture' && !multi && (
            <>
              {/* The rotate handle needs a precise drag, which is awkward with a
                  fingertip; a right-angle step is the rotation people actually
                  want when squaring furniture to a wall. */}
              {item(t('Rotate 90°'), () => {
                const f = s.furniture.find((x) => x.id === menu.id);
                if (f) s.updateFurniture(menu.id, { rotation: (f.rotation + 90) % 360 });
              })}
              {item(t('Bring to front'), () => s.bringToFront(menu.id))}
              {item(t('Send to back'), () => s.sendToBack(menu.id))}
            </>
          )}
          <div className="ctx-sep" />
          {item(`${t('Delete')} ${noun}`, () => s.deleteSelected(), { danger: true, sub: '⌫' })}
        </>
      )}
    </div>
  );
}

/**
 * Distance from the selected item to the wall each of its four sides faces.
 *
 * Rendered only while an item is selected and NOT being dragged. That is
 * deliberate: furniture `onDragMove` runs no React state updates on purpose
 * (it's what keeps dragging smooth on slower phones), so recomputing guides per
 * frame would undo that. Selection is also when the number is actually useful —
 * you place the item, then read how far it sits off the wall.
 *
 * Distances are to the wall FACE, not its centreline, because that is what a
 * tape measure reads in the real room.
 *
 * Every wall counts here, including fences and half walls — unlike room
 * detection, which filters to `structuralWalls`. A ray that ignored a fence
 * would shoot straight through a barrier the user can see and report the
 * distance to the house behind it, which is simply the wrong number.
 */
function WallDistanceGuides({
  box,
  rotation,
  walls,
  zoom,
  units,
}: {
  box: { position: Point; width: number; depth: number };
  rotation: number;
  walls: Wall[];
  zoom: number;
  units: Units;
}) {
  const C = canvasColors(useTheme((t) => t.theme));
  const px = (n: number) => n / zoom;
  const legs = wallDistances(box, rotation, walls);

  return (
    <Group listening={false}>
      {legs.map((leg, i) => {
        // Nothing found, or the item is already against the wall — a stack of
        // "0 cm" plates on a wall-hugging sofa is noise, not information.
        if (!Number.isFinite(leg.distance) || leg.distance * zoom < 20) return null;
        const to = {
          x: leg.from.x + leg.dir.x * leg.distance,
          y: leg.from.y + leg.dir.y * leg.distance,
        };
        const mid = { x: (leg.from.x + to.x) / 2, y: (leg.from.y + to.y) / 2 };
        const fs = px(11);
        // Keep the number upright regardless of how the item is rotated.
        let rot = (Math.atan2(leg.dir.y, leg.dir.x) * 180) / Math.PI;
        if (rot > 90 || rot < -90) rot += 180;
        return (
          <Group key={i}>
            <Line
              points={[leg.from.x, leg.from.y, to.x, to.y]}
              stroke={C.selection}
              strokeWidth={px(1)}
              dash={[px(5), px(4)]}
            />
            <Group x={mid.x} y={mid.y} rotation={rot}>
              <DimensionPlate
                label={formatLength(leg.distance, units)}
                fontSize={fs}
                padding={px(7)}
                fill={C.dimensionPlate}
                stroke={C.dimensionPlateStroke}
                strokeWidth={px(0.6)}
                textColor={C.dimensionText}
              />
            </Group>
          </Group>
        );
      })}
    </Group>
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
  // The marker sits exactly on the point being committed, so it cannot be moved
  // aside — but on touch a 14px marker is entirely hidden under the fingertip.
  // Drawing it larger than the finger turns it into a visible halo instead, and
  // dropping the wash keeps that ring readable against walls and floors.
  const r = (IS_COARSE ? 18 : 7) / zoom;
  const wash = IS_COARSE ? '00' : undefined;
  if (kind === 'point' || kind === 'midpoint') {
    const color = kind === 'midpoint' ? '#1f9d55' : '#e0299b';
    return (
      <Rect
        name="snap-indicator"
        x={at.x - r}
        y={at.y - r}
        width={r * 2}
        height={r * 2}
        stroke={color}
        strokeWidth={2 / zoom}
        fill={wash ? undefined : `${color}2e`}
        cornerRadius={kind === 'midpoint' ? r : 0}
        listening={false}
      />
    );
  }
  const color = kind === 'segment' ? '#2f7ed8' : '#1f9d55';
  return (
    <Circle
      name="snap-indicator"
      x={at.x} y={at.y} radius={r} stroke={color} strokeWidth={2 / zoom}
      fill={wash ? undefined : `${color}22`} listening={false}
    />
  );
}

function DraftView({
  draft, cursor, tool, zoom, units, lengthInput, readoutDy,
}: {
  draft: Point[]; cursor: Point | null; tool: string; zoom: number; units: Units;
  lengthInput: string;
  /** Non-null on touch: world-cm offset that lifts the readout off the
   *  fingertip, since on a phone the finger sits exactly on the point being
   *  placed and would otherwise cover the number it is about to commit. */
  readoutDy: number | null;
}) {
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
  const pts = tool === 'room' && draft.length === 1 && previewEnd
    ? roomRectangle(draft[0], previewEnd)
    : previewEnd ? [...draft, previewEnd] : draft;
  const flat = pts.flatMap((p) => [p.x, p.y]);
  return (
    <Group listening={false}>
      <Line
        name="draft-rubber"
        points={flat}
        closed={tool === 'room'}
        stroke={C.selection}
        strokeWidth={(tool === 'wall' ? 8 : tool === 'halfWall' ? 6 : tool === 'fence' ? 4 : 2) / zoom}
        lineCap="round"
        opacity={0.7}
        dash={tool === 'room' || tool === 'halfWall' ? [10 / zoom, 6 / zoom] : undefined}
        fill={tool === 'room' ? 'rgba(76,141,255,0.12)' : undefined}
      />
      {draft.map((p, i) => (
        <Group key={i}>
          {tool === 'room' && i === 0 && draft.length >= 3 && (
            <Circle
              x={p.x}
              y={p.y}
              radius={14 / zoom}
              fill="rgba(76,141,255,0.22)"
              stroke={C.selection}
              strokeWidth={2 / zoom}
            />
          )}
          <Circle x={p.x} y={p.y} radius={5 / zoom} fill="#fff" stroke={C.selection} strokeWidth={2 / zoom} />
          {tool === 'room' && i === 0 && draft.length >= 3 && (
            <Text
              x={p.x - 5 / zoom}
              y={p.y - 8 / zoom}
              text="✓"
              fontSize={11 / zoom}
              fontStyle="bold"
              fill={C.selection}
            />
          )}
        </Group>
      ))}
      {cursor && last && (
        <Text
          name="draft-readout"
          // Mouse: centred on the segment, where the eye already is. Touch:
          // anchored to the fingertip and pushed clear of it, because the
          // finger is sitting on the point and the segment midpoint can be
          // under it too on a short run.
          x={readoutDy === null ? midpoint(last, previewEnd ?? cursor).x : (previewEnd ?? cursor).x - 30 / zoom}
          y={
            readoutDy === null
              ? midpoint(last, previewEnd ?? cursor).y - 20 / zoom
              : (previewEnd ?? cursor).y + readoutDy
          }
          text={
            tool === 'room'
              ? `${formatLength(Math.abs(cursor.x - last.x), units)} × ${formatLength(Math.abs(cursor.y - last.y), units)}`
              : lengthInput
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
// ---- Room floor fill ----
// Renders the room polygon filled with the floor's photoreal texture (Konva
// pattern fill) when the image is available, falling back to the material's
// flat colour until it loads / for carpets that have no texture. Each room is
// its own component so `useHtmlImage` keeps a stable hook order per floor.
function RoomFloorFill({
  points, sel, flatFill, textureSrc, textureScaleCm, selectionColor, zoom, onSelect,
}: {
  points: Point[];
  sel: boolean;
  flatFill: string;
  textureSrc?: string;
  textureScaleCm: number;
  selectionColor: string;
  zoom: number;
  onSelect: () => void;
}) {
  const img = useHtmlImage(textureSrc);
  const textured = !!(textureSrc && img && img.width > 0);
  // One texture tile spans `textureScaleCm` world units, so the pattern reads
  // at a believable real-world scale regardless of zoom (Konva applies the
  // stage transform on top of this).
  const patternScale = textured ? textureScaleCm / img!.width : 1;
  return (
    <Line
      points={points.flatMap((p) => [p.x, p.y])}
      closed
      // Photoreal fills sit nearly opaque so the floor looks laid-down; flat
      // carpet colours stay lighter so the grid still reads through.
      fill={textured ? undefined : flatFill}
      fillPatternImage={textured ? img! : undefined}
      fillPatternRepeat={textured ? 'repeat' : undefined}
      fillPatternScale={textured ? { x: patternScale, y: patternScale } : undefined}
      opacity={textured ? (sel ? 1 : 0.97) : sel ? 0.85 : 0.68}
      stroke={sel ? selectionColor : 'transparent'}
      strokeWidth={(sel ? 5 : 3) / zoom}
      shadowColor={sel ? selectionColor : undefined}
      shadowBlur={sel ? 20 / zoom : 0}
      shadowOpacity={sel ? 0.75 : 0}
      perfectDrawEnabled={false}
      shadowForStrokeEnabled={false}
      onMouseDown={onSelect}
    />
  );
}

// ---- Furniture graphic (photoreal top-down sprite, vector-symbol fallback) ----
// Types with a rendered sprite (public/sprites/<type>.webp — top-down renders of
// the 3D model) draw the photo; fixtures without a model (toilet, bathtub, TV,
// lights…) and any still-loading sprite fall back to the clean line symbol.
function FurnitureItemGraphic({
  type, shape, width, depth, color, symbolColor, outlineColor, selected, selectionColor, zoom, dashed,
}: {
  type: string;
  shape: Shape3D;
  width: number;
  depth: number;
  color: string;
  symbolColor: string;
  outlineColor: string;
  selected: boolean;
  selectionColor: string;
  zoom: number;
  dashed: boolean;
}) {
  const hasSprite = FURNITURE_SPRITES.has(type);
  const img = useHtmlImage(hasSprite ? spriteUrl(type) : undefined);
  const outline = selected ? (
    <Rect
      x={-width / 2}
      y={-depth / 2}
      width={width}
      height={depth}
      cornerRadius={Math.min(width, depth) * 0.08}
      stroke={selectionColor}
      strokeWidth={3 / zoom}
      strokeScaleEnabled
      listening={false}
    />
  ) : null;

  if (hasSprite && img && img.width > 0) {
    // Flat tops fill the footprint; everything else contain-fits to preserve
    // the rendered aspect (matches how the 3D model was normalized).
    //
    // A RESIZED item fills too — see src/lib/spriteFit.ts for why.
    const { w: dw, h: dh } = spriteBox(width, depth, img.width / img.height, {
      fill: SPRITE_FILL.has(type),
      entry: CATALOG_BY_TYPE[type],
    });
    return (
      <>
        <KImage
          image={img}
          x={-dw / 2}
          y={-dh / 2}
          width={dw}
          height={dh}
          perfectDrawEnabled={false}
        />
        {outline}
      </>
    );
  }

  // Fallback: the classic flat footprint + line symbol.
  return (
    <>
      <Rect
        x={-width / 2}
        y={-depth / 2}
        width={width}
        height={depth}
        fill={color}
        opacity={0.55}
        cornerRadius={Math.min(width, depth) * 0.08}
        stroke={selected ? selectionColor : outlineColor}
        strokeWidth={(selected ? 3 : 1) / zoom}
      />
      <FurnitureSymbol shape={shape} width={width} depth={depth} color={symbolColor} dashed={dashed} />
    </>
  );
}

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
  /** `scale` is present only for a proportional drag, and carries the height. */
  onResize: (b: Box, scale?: number) => void;
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
            // Proportional about the centre by default — dragging a corner used
            // to stretch width and depth independently, so a sofa came out flat
            // and slid across the plan while you did it. Shift restores that
            // free stretch for the cases that genuinely want it (a rug, a
            // counter run). Touch has no modifier, so independent width/depth
            // stays where it already is: the properties panel inputs.
            if (e.evt.shiftKey) {
              onResize(resizeBox(box, i, w, rotation, 10));
              return;
            }
            const nb = scaleBox(box, i, w, rotation, 10);
            onResize(nb, nb.scale);
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
