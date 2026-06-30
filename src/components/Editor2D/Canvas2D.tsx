import { useEffect, useRef, useState, useMemo } from 'react';
import { Stage, Layer, Line, Rect, Group, Text, Circle, Arc, Image as KImage } from 'react-konva';
import type Konva from 'konva';
import { useDesign } from '../../store/designStore';
import { useHtmlImage } from '../../lib/useHtmlImage';
import {
  dist,
  midpoint,
  angleDeg,
  lerp,
  snapToGrid,
  snapAngle,
  snapToEndpoints,
  pointToSegment,
  polygonCentroid,
  boundsOf,
} from '../../lib/geometry';
import { FLOOR_BY_ID, CATALOG_BY_TYPE } from '../../data/furnitureCatalog';
import DimensionsLayer from './DimensionsLayer';
import { drawBridge, useDraw, toast } from '../../lib/ui';
import { planCapture } from '../../lib/renderBridge';
import { formatLength, type Units } from '../../lib/units';
import type { Point } from '../../types';
import {
  resizeBox,
  norm360,
  snapAngleTo,
  type Box,
} from './editHandles';

// Handle visuals (screen-space px; divided by zoom at render to stay constant).
const HANDLE_FILL = '#ffffff';
const HANDLE_STROKE = '#3b63f6';

export default function Canvas2D() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const gridRef = useRef<Konva.Group>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });

  const s = useDesign();
  const {
    walls, rooms, furniture, openings, background,
    tool, zoom, pan, showGrid, gridSize, selection, selectedIds, showDimensions, units,
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
  const [snapKind, setSnapKind] = useState<'point' | 'angle' | 'axis' | 'free'>('free');
  const [isPanning, setIsPanning] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; kind: string; id: string } | null>(null);
  const openMenu = (x: number, y: number, kind: string, id: string) => setMenu({ x, y, kind, id });
  const closeMenu = () => setMenu(null);

  // Live drag-edit state for selection handles. While a handle is being
  // dragged we render from these locals and commit to the store exactly once
  // on drag end, so each gesture is a single undo step.
  const [wallEdit, setWallEdit] = useState<{ id: string; start: Point; end: Point } | null>(null);
  const [furnEdit, setFurnEdit] = useState<
    { id: string; position: Point; rotation: number; width: number; depth: number } | null
  >(null);
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
    s.setZoom(z);
    s.setPan({ x: size.w / 2 - ((min.x + max.x) / 2) * z, y: size.h / 2 - ((min.y + max.y) / 2) * z });
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
      let url: string | null = null;
      try {
        url = stage.toDataURL({ x: rx, y: ry, width: rw, height: rh, pixelRatio, mimeType: 'image/png' });
      } finally {
        if (grid && gridWasVisible) grid.visible(true);
        stage.draw();
      }
      return url;
    };
    return () => {
      planCapture.current = null;
    };
  }, []);

  // Keyboard: Enter/Escape to finish, Delete to remove, undo/redo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === 'Escape') {
        setDraft([]);
        setMeasureA(null);
        setMeasureSeg(null);
        s.clearSelection();
      } else if (e.key === 'Enter') {
        finishDraft();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selection.id || s.selectedIds.length) s.deleteSelected();
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
        s.paste();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        s.setSelectedIds(s.furniture.map((f) => f.id));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, draft, tool]);

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

  // Records what kind of inference the last applySnaps() landed on, for the
  // on-canvas snap indicator. 'point' = locked onto an existing/clicked point.
  const snapKindRef = useRef<'point' | 'angle' | 'axis' | 'free'>('free');

  /**
   * SketchUp-style snapping while drawing walls/rooms:
   *  1. Lock onto a nearby existing endpoint OR a point already clicked in this
   *     draft (so corners close and joints meet).
   *  2. Soft angle lock — only snap to 0/45/90/… when within a few degrees, so
   *     skewed walls can be drawn at any free angle.
   *  3. Axis inference — line up with the x or y of an existing/clicked point.
   *  4. Grid only when the grid is on and there's no plan to trace over.
   */
  const applySnaps = (p: Point): Point => {
    const tol = 14 / zoom;
    const chaining = (tool === 'wall' || tool === 'room') && draft.length > 0;
    const candidates: Point[] = [...walls.flatMap((w) => [w.start, w.end]), ...draft];

    // 1) exact point snap (highest priority)
    let best: Point | null = null;
    let bestD = tol;
    for (const c of candidates) {
      const d = dist(p, c);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    if (best) {
      snapKindRef.current = 'point';
      return { x: best.x, y: best.y };
    }

    if (chaining) {
      const prev = draft[draft.length - 1];
      // 2) soft angle lock (45° increments, only when close)
      const d = dist(prev, p);
      if (d > 1) {
        const deg = (Math.atan2(p.y - prev.y, p.x - prev.x) * 180) / Math.PI;
        const nearest = Math.round(deg / 45) * 45;
        let diff = Math.abs(deg - nearest);
        if (diff > 180) diff = 360 - diff;
        if (diff <= 6) {
          const ra = (nearest * Math.PI) / 180;
          snapKindRef.current = 'angle';
          return { x: prev.x + Math.cos(ra) * d, y: prev.y + Math.sin(ra) * d };
        }
      }
      // 3) axis inference: align to an existing/clicked point's x or y
      let ax = p.x;
      let ay = p.y;
      let hit = false;
      for (const c of candidates) {
        if (Math.abs(c.x - p.x) < tol) {
          ax = c.x;
          hit = true;
          break;
        }
      }
      for (const c of candidates) {
        if (Math.abs(c.y - p.y) < tol) {
          ay = c.y;
          hit = true;
          break;
        }
      }
      if (hit) {
        snapKindRef.current = 'axis';
        return { x: ax, y: ay };
      }
    }

    // 4) grid — skip while tracing over a background so free angles aren't fought
    if (showGrid && !background) {
      snapKindRef.current = 'free';
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

  // ---- interaction handlers ----
  const onWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const dir = e.evt.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.05, Math.min(4, zoom * dir));
    // Keep the point under the cursor fixed.
    const wx = (pointer.x - pan.x) / zoom;
    const wy = (pointer.y - pan.y) / zoom;
    s.setPan({ x: pointer.x - wx * newZoom, y: pointer.y - wy * newZoom });
    s.setZoom(newZoom);
  };

  // Core place/draw/select action at a world point — shared by mouse & touch.
  const actAt = (p: Point) => {
    const snapped = applySnaps(p);
    if (tool === 'wall') {
      setDraft((d) => [...d, snapped]);
    } else if (tool === 'room') {
      if (draft.length >= 3 && dist(snapped, draft[0]) < 25 / zoom) {
        s.addRoom(draft);
        setDraft([]);
      } else {
        setDraft((d) => [...d, snapped]);
      }
    } else if (tool === 'furniture' && s.pendingFurnitureType) {
      const type = s.pendingFurnitureType;
      if (type === 'door' || type === 'window') {
        const hit = nearestWall(p);
        if (hit && hit.dist < Math.max(hit.wall.thickness * 1.5, 40 / zoom)) {
          const len = dist(hit.wall.start, hit.wall.end);
          const half = (type === 'door' ? 90 : 120) / 2;
          const offset = Math.max(half, Math.min(len - half, hit.t * len));
          const id = s.addOpening(hit.wall.id, offset, type);
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
    if (tool === 'pan' || isMiddle || e.evt.button === 2) {
      setIsPanning(true);
      return;
    }
    actAt(p);
  };

  // ---- touch: tap to act, two-finger pinch to zoom & pan ----
  const pinch = useRef<{ dist: number; center: Point } | null>(null);
  const touchMoved = useRef(false);

  const onTouchStart = (e: Konva.KonvaEventObject<TouchEvent>) => {
    const t = e.evt.touches;
    if (t.length === 2) {
      e.evt.preventDefault();
      pinch.current = twoFinger(t);
      touchMoved.current = true; // suppress tap
    } else if (t.length === 1) {
      touchMoved.current = false;
      if (tool === 'pan') {
        setIsPanning(true);
        lastPan.current = { x: t[0].clientX, y: t[0].clientY };
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
      const { zoom: z, pan: pn } = useDesign.getState();
      const scale = next.dist / (pinch.current.dist || next.dist);
      const newZoom = Math.max(0.05, Math.min(4, z * scale));
      const wx = (sc.x - pn.x) / z;
      const wy = (sc.y - pn.y) / z;
      // zoom around the pinch centre and pan with finger movement
      const prevSc = { x: pinch.current.center.x - rect.left, y: pinch.current.center.y - rect.top };
      s.setPan({ x: sc.x - wx * newZoom + (sc.x - prevSc.x), y: sc.y - wy * newZoom + (sc.y - prevSc.y) });
      s.setZoom(newZoom);
      pinch.current = next;
    } else if (t.length === 1) {
      touchMoved.current = true;
      if (isPanning && lastPan.current) {
        const cur = { x: t[0].clientX, y: t[0].clientY };
        const { pan: pn } = useDesign.getState();
        s.setPan({ x: pn.x + (cur.x - lastPan.current.x), y: pn.y + (cur.y - lastPan.current.y) });
        lastPan.current = cur;
      }
    }
  };

  const onTouchEnd = (e: Konva.KonvaEventObject<TouchEvent>) => {
    if (e.evt.touches.length === 0) {
      if (!touchMoved.current && tool !== 'pan') {
        const p = worldPointer();
        if (p) actAt(p);
      }
      pinch.current = null;
      endPan();
    }
  };

  const onMouseMove = () => {
    const p = worldPointer();
    if (!p) return;
    setCursor(applySnaps(p));
    setSnapKind(snapKindRef.current);
  };

  // Pan by tracking raw pointer deltas.
  const lastPan = useRef<{ x: number; y: number } | null>(null);
  const onStageMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    onMouseMove();
    if (!isPanning) return;
    const cur = { x: e.evt.clientX, y: e.evt.clientY };
    if (lastPan.current) {
      s.setPan({ x: pan.x + (cur.x - lastPan.current.x), y: pan.y + (cur.y - lastPan.current.y) });
    }
    lastPan.current = cur;
  };
  const endPan = () => {
    setIsPanning(false);
    lastPan.current = null;
  };

  const finishDraft = () => {
    if (tool === 'wall' && draft.length >= 2) {
      for (let i = 0; i < draft.length - 1; i++) s.addWall(draft[i], draft[i + 1]);
    } else if (tool === 'room' && draft.length >= 3) {
      s.addRoom(draft);
    }
    setDraft([]);
  };

  // Expose finish() + active state to the on-canvas "Finish" affordance.
  useEffect(() => {
    drawBridge.finish = finishDraft;
    drawBridge.cancel = () => setDraft([]);
    const min = tool === 'room' ? 3 : 2;
    useDraw.getState().setActive((tool === 'wall' || tool === 'room') && draft.length >= min);
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
    const len = dist(wall.start, wall.end) || 1;
    return { pt: lerp(wall.start, wall.end, o.offset / len), wall };
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
    tool === 'pan' || isPanning ? 'grabbing' :
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

  return (
    <div ref={wrapRef} style={{ position: 'absolute', inset: 0 }}>
      <Stage
        ref={stageRef}
        width={size.w}
        height={size.h}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onStageMouseMove}
        onMouseUp={endPan}
        onMouseLeave={endPan}
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
        <Layer x={pan.x} y={pan.y} scaleX={zoom} scaleY={zoom}>
          {/* Background plan */}
          {background && bgImage && (
            <KImage
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
                stroke={l.major ? '#d2d2c9' : '#e4e4dd'}
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
                  stroke={sel ? '#3b63f6' : 'transparent'}
                  strokeWidth={(sel ? 4 : 3) / zoom}
                  shadowColor={sel ? '#3b63f6' : undefined}
                  shadowBlur={sel ? 14 / zoom : 0}
                  shadowOpacity={sel ? 0.5 : 0}
                  onMouseDown={() => tool === 'select' && s.select({ kind: 'room', id: r.id })}
                />
                <Text
                  x={c.x - 50}
                  y={c.y - 8}
                  width={100}
                  align="center"
                  text={r.name}
                  fontSize={14 / zoom}
                  fill="#0e1014"
                  fontStyle="bold"
                  listening={false}
                />
              </Group>
            );
          })}

          {/* Walls */}
          {walls.map((w) => {
            const sel = selection.kind === 'wall' && selection.id === w.id;
            // Use live edit positions for the wall being dragged.
            const live = wallEdit && wallEdit.id === w.id ? wallEdit : null;
            const start = live ? live.start : w.start;
            const end = live ? live.end : w.end;
            const editing = sel && tool === 'select';
            const hr = 8 / zoom; // handle radius (cm)
            return (
              <Group key={w.id}>
                <Line
                  points={[start.x, start.y, end.x, end.y]}
                  stroke={sel ? '#3b63f6' : '#39414e'}
                  strokeWidth={w.thickness}
                  lineCap="round"
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
                      onStart={() => setWallEdit({ id: w.id, start: w.start, end: w.end })}
                      onMove={(p) => {
                        const sp = snapEndpoint(p, w.id);
                        setWallEdit((cur) => ({ id: w.id, start: sp, end: cur ? cur.end : w.end }));
                        return sp;
                      }}
                      onEnd={() => {
                        setWallEdit((cur) => {
                          if (cur) s.updateWall(w.id, { start: cur.start, end: cur.end });
                          return null;
                        });
                      }}
                    />
                    <WallEndpointHandle
                      x={end.x}
                      y={end.y}
                      r={hr}
                      zoom={zoom}
                      onStart={() => setWallEdit({ id: w.id, start: w.start, end: w.end })}
                      onMove={(p) => {
                        const sp = snapEndpoint(p, w.id);
                        setWallEdit((cur) => ({ id: w.id, start: cur ? cur.start : w.start, end: sp }));
                        return sp;
                      }}
                      onEnd={() => {
                        setWallEdit((cur) => {
                          if (cur) s.updateWall(w.id, { start: cur.start, end: cur.end });
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

          {/* Dimension annotations */}
          {showDimensions && <DimensionsLayer zoom={zoom} />}

          {/* Openings (doors & windows) */}
          {openings.map((o) => {
            const wall = walls.find((w) => w.id === o.wallId);
            if (!wall) return null;
            const len = dist(wall.start, wall.end) || 1;
            const sel = selection.kind === 'opening' && selection.id === o.id;
            const live = openEdit && openEdit.id === o.id ? openEdit : null;
            const offset = live ? live.offset : o.offset;
            const c = lerp(wall.start, wall.end, offset / len);
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
                {o.type === 'door' ? (
                  <>
                    <Line points={[-wd / 2, 0, -wd / 2, -wd]} stroke={sel ? '#3b63f6' : '#cfd6e0'} strokeWidth={3 / zoom} />
                    <Arc
                      x={-wd / 2}
                      y={0}
                      innerRadius={wd}
                      outerRadius={wd}
                      angle={90}
                      rotation={270}
                      stroke={sel ? '#3b63f6' : '#6b7480'}
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
                      stroke={sel ? '#3b63f6' : '#6aa6cc'}
                      strokeWidth={2 / zoom}
                    />
                    <Line points={[-wd / 2, 0, wd / 2, 0]} stroke="#7fb8d8" strokeWidth={1.5 / zoom} />
                  </>
                )}
                {/* drag-along-wall handle (slides the opening's offset) */}
                {editing && (
                  <Circle
                    x={0}
                    y={0}
                    radius={8 / zoom}
                    fill={HANDLE_FILL}
                    stroke={HANDLE_STROKE}
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
                      setOpenEdit({ id: o.id, offset: o.offset });
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
                        if (cur) s.updateOpening(o.id, { offset: clampOffset(cur.offset) });
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
                      text={fmtLen(offset)}
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
                  draggable={tool === 'select'}
                  onMouseDown={(e) => {
                    if (tool !== 'select') return;
                    e.cancelBubble = true; // don't let the stage re-select
                    if (e.evt.shiftKey) s.toggleSelected(f.id);
                    else if (!selectedIds.includes(f.id)) s.select({ kind: 'furniture', id: f.id });
                  }}
                  onDragStart={() =>
                    setFurnEdit({ id: f.id, position: f.position, rotation: f.rotation, width: f.width, depth: f.depth })
                  }
                  onDragMove={(e) => {
                    const np = snapToGrid({ x: e.target.x(), y: e.target.y() }, showGrid ? gridSize / 2 : 1);
                    e.target.position(np);
                    setFurnEdit({ id: f.id, position: np, rotation: f.rotation, width: f.width, depth: f.depth });
                  }}
                  onDragEnd={(e) => {
                    const np = { x: e.target.x(), y: e.target.y() };
                    if (multi && selectedIds.includes(f.id)) {
                      s.moveFurnitureGroup(selectedIds, np.x - f.position.x, np.y - f.position.y);
                    } else {
                      s.updateFurniture(f.id, { position: np });
                    }
                    setFurnEdit(null);
                  }}
                >
                  <Rect
                    x={-width / 2}
                    y={-depth / 2}
                    width={width}
                    height={depth}
                    fill={f.color}
                    opacity={0.92}
                    cornerRadius={Math.min(width, depth) * 0.08}
                    stroke={sel || selectedIds.includes(f.id) ? '#3b63f6' : '#00000033'}
                    strokeWidth={(sel || selectedIds.includes(f.id) ? 3 : 1) / zoom}
                  />
                  {/* direction notch */}
                  <Line
                    points={[0, 0, 0, -depth / 2]}
                    stroke={sel ? '#3b63f6' : '#ffffff66'}
                    strokeWidth={2 / zoom}
                    listening={false}
                  />
                  <Text
                    x={-width / 2}
                    y={-7 / zoom}
                    width={width}
                    align="center"
                    text={entry?.icon ?? '▭'}
                    fontSize={Math.min(width, depth) * 0.5}
                    listening={false}
                  />
                </Group>
                {editing && (
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
            <DraftView draft={draft} cursor={cursor} tool={tool} zoom={zoom} units={units} />
          )}

          {/* Snap indicator while drawing: shows when the cursor is inferring a
              point (magenta), or an axis/angle lock (green). */}
          {(tool === 'wall' || tool === 'room') && cursor && snapKind !== 'free' && (
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
  menu: { x: number; y: number; kind: string; id: string };
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
          {item('Paste', () => s.paste(), { sub: '⌘V' })}
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
  entry: { width: number; depth: number; icon: string };
  at: Point;
  zoom: number;
}) {
  return (
    <Group x={at.x} y={at.y} listening={false} opacity={0.75}>
      <Rect
        x={-entry.width / 2}
        y={-entry.depth / 2}
        width={entry.width}
        height={entry.depth}
        fill="rgba(59,99,246,0.14)"
        stroke="#3b63f6"
        strokeWidth={1.5 / zoom}
        dash={[8 / zoom, 5 / zoom]}
        cornerRadius={Math.min(entry.width, entry.depth) * 0.08}
      />
      <Text
        x={-entry.width / 2}
        y={-7 / zoom}
        width={entry.width}
        align="center"
        text={entry.icon}
        fontSize={Math.min(entry.width, entry.depth) * 0.5}
      />
    </Group>
  );
}

// Tape-measure overlay: a dashed line between two points with end ticks and a
// pill-backed distance label at the midpoint (respects the units toggle).
function MeasureView({ a, b, zoom, units }: { a: Point; b: Point; zoom: number; units: Units }) {
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
  const ACCENT = '#e0533d'; // warm, distinct from the blue draw colour
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

/** Inference marker at the cursor: a point lock (magenta square) or an
 *  axis/angle lock (green ring), à la SketchUp. */
function SnapIndicator({ at, kind, zoom }: { at: Point; kind: 'point' | 'angle' | 'axis'; zoom: number }) {
  const r = 7 / zoom;
  if (kind === 'point') {
    return (
      <Group listening={false}>
        <Rect
          x={at.x - r}
          y={at.y - r}
          width={r * 2}
          height={r * 2}
          stroke="#e0299b"
          strokeWidth={2 / zoom}
          fill="rgba(224,41,155,0.18)"
          rotation={0}
        />
      </Group>
    );
  }
  const color = kind === 'angle' ? '#1f9d55' : '#2f7ed8';
  return (
    <Circle x={at.x} y={at.y} radius={r} stroke={color} strokeWidth={2 / zoom} fill={`${color}22`} listening={false} />
  );
}

function DraftView({
  draft, cursor, tool, zoom, units,
}: { draft: Point[]; cursor: Point | null; tool: string; zoom: number; units: Units }) {
  const pts = cursor ? [...draft, cursor] : draft;
  const flat = pts.flatMap((p) => [p.x, p.y]);
  const last = draft[draft.length - 1];
  return (
    <Group listening={false}>
      <Line
        points={flat}
        closed={tool === 'room'}
        stroke="#3b63f6"
        strokeWidth={(tool === 'wall' ? 8 : 2) / zoom}
        lineCap="round"
        opacity={0.7}
        dash={tool === 'room' ? [10 / zoom, 6 / zoom] : undefined}
        fill={tool === 'room' ? 'rgba(76,141,255,0.12)' : undefined}
      />
      {draft.map((p, i) => (
        <Circle key={i} x={p.x} y={p.y} radius={5 / zoom} fill="#fff" stroke="#3b63f6" strokeWidth={2 / zoom} />
      ))}
      {cursor && last && (
        <Text
          x={midpoint(last, cursor).x}
          y={midpoint(last, cursor).y - 20 / zoom}
          text={`${formatLength(dist(last, cursor), units)}  ·  ${Math.round(((angleDeg(last, cursor) % 360) + 360) % 360)}°`}
          fontSize={13 / zoom}
          fill="#fff"
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
  return (
    <Circle
      x={x}
      y={y}
      radius={r}
      fill={HANDLE_FILL}
      stroke={HANDLE_STROKE}
      strokeWidth={2 / zoom}
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
  const hr = 7 / zoom; // corner handle radius (cm)
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
        stroke="#3b63f6"
        strokeWidth={1.5 / zoom}
        dash={[6 / zoom, 4 / zoom]}
        listening={false}
      />
      {/* rotation stalk + handle */}
      <Line
        points={[0, -depth / 2, rotPos.x, rotPos.y]}
        stroke="#3b63f6"
        strokeWidth={1.5 / zoom}
        listening={false}
      />
      <Circle
        x={rotPos.x}
        y={rotPos.y}
        radius={hr}
        fill={HANDLE_FILL}
        stroke={HANDLE_STROKE}
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
          fill={HANDLE_FILL}
          stroke={HANDLE_STROKE}
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
