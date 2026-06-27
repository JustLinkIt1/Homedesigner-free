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
import type { Point } from '../../types';

const fmtLen = (cm: number) =>
  cm >= 100 ? `${(cm / 100).toFixed(2)} m` : `${Math.round(cm)} cm`;

export default function Canvas2D() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });

  const s = useDesign();
  const {
    walls, rooms, furniture, openings, background,
    tool, zoom, pan, showGrid, gridSize, selection,
  } = s;

  const bgImage = useHtmlImage(background?.src);

  // Draft state for in-progress drawing.
  const [draft, setDraft] = useState<Point[]>([]);
  const [cursor, setCursor] = useState<Point | null>(null);
  const [isPanning, setIsPanning] = useState(false);

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

  // Reset draft when tool changes.
  useEffect(() => {
    setDraft([]);
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

  // Keyboard: Enter/Escape to finish, Delete to remove, undo/redo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === 'Escape') {
        setDraft([]);
        s.clearSelection();
      } else if (e.key === 'Enter') {
        finishDraft();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selection.id) s.deleteSelected();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
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

  const applySnaps = (p: Point): Point => {
    // Snap to existing wall endpoints first, then angle (during chains), then grid.
    const ep = snapToEndpoints(p, walls, 18 / zoom);
    if (ep) return ep;
    let out = p;
    if ((tool === 'wall' || tool === 'room') && draft.length > 0) {
      out = snapAngle(draft[draft.length - 1], out, 15);
    }
    if (showGrid) out = snapToGrid(out, gridSize);
    return out;
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
        onContextMenu={(e) => e.evt.preventDefault()}
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
          {gridLines.map((l, i) => (
            <Line
              key={i}
              points={l.pts}
              stroke={l.major ? '#2c333f' : '#1b2029'}
              strokeWidth={(l.major ? 1.4 : 0.8) / zoom}
              listening={false}
            />
          ))}

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
                  opacity={0.55}
                  stroke={sel ? 'var(--accent)' : 'transparent'}
                  strokeWidth={3 / zoom}
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
            return (
              <Group key={w.id}>
                <Line
                  points={[w.start.x, w.start.y, w.end.x, w.end.y]}
                  stroke={sel ? 'var(--accent)' : w.color}
                  strokeWidth={w.thickness}
                  lineCap="round"
                  onMouseDown={() => tool === 'select' && s.select({ kind: 'wall', id: w.id })}
                />
                {/* endpoints */}
                {sel && (
                  <>
                    <Circle x={w.start.x} y={w.start.y} radius={7 / zoom} fill="#fff" stroke="var(--accent)" strokeWidth={2 / zoom} />
                    <Circle x={w.end.x} y={w.end.y} radius={7 / zoom} fill="#fff" stroke="var(--accent)" strokeWidth={2 / zoom} />
                    <Text
                      x={midpoint(w.start, w.end).x}
                      y={midpoint(w.start, w.end).y - 22 / zoom}
                      text={fmtLen(dist(w.start, w.end))}
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
            const c = lerp(wall.start, wall.end, o.offset / len);
            const ang = angleDeg(wall.start, wall.end);
            const sel = selection.kind === 'opening' && selection.id === o.id;
            const t = wall.thickness;
            const wd = o.width;
            return (
              <Group
                key={o.id}
                x={c.x}
                y={c.y}
                rotation={ang}
                onMouseDown={() => tool === 'select' && s.select({ kind: 'opening', id: o.id })}
              >
                {/* cut the wall */}
                <Rect x={-wd / 2} y={-t / 2 - 1} width={wd} height={t + 2} fill="#11141a" />
                {o.type === 'door' ? (
                  <>
                    <Line points={[-wd / 2, 0, -wd / 2, -wd]} stroke={sel ? 'var(--accent)' : '#cfd6e0'} strokeWidth={3 / zoom} />
                    <Arc
                      x={-wd / 2}
                      y={0}
                      innerRadius={wd}
                      outerRadius={wd}
                      angle={90}
                      rotation={270}
                      stroke={sel ? 'var(--accent)' : '#6b7480'}
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
                      fill="#16222e"
                      stroke={sel ? 'var(--accent)' : '#7fb8d8'}
                      strokeWidth={2 / zoom}
                    />
                    <Line points={[-wd / 2, 0, wd / 2, 0]} stroke="#7fb8d8" strokeWidth={1.5 / zoom} />
                  </>
                )}
              </Group>
            );
          })}

          {/* Furniture */}
          {furniture.map((f) => {
            const sel = selection.kind === 'furniture' && selection.id === f.id;
            const entry = CATALOG_BY_TYPE[f.type];
            return (
              <Group
                key={f.id}
                x={f.position.x}
                y={f.position.y}
                rotation={f.rotation}
                draggable={tool === 'select'}
                onMouseDown={() => tool === 'select' && s.select({ kind: 'furniture', id: f.id })}
                onDragMove={(e) => {
                  const np = snapToGrid({ x: e.target.x(), y: e.target.y() }, showGrid ? gridSize / 2 : 1);
                  e.target.position(np);
                }}
                onDragEnd={(e) => {
                  s.updateFurniture(f.id, { position: { x: e.target.x(), y: e.target.y() } });
                }}
              >
                <Rect
                  x={-f.width / 2}
                  y={-f.depth / 2}
                  width={f.width}
                  height={f.depth}
                  fill={f.color}
                  opacity={0.92}
                  cornerRadius={Math.min(f.width, f.depth) * 0.08}
                  stroke={sel ? 'var(--accent)' : '#00000033'}
                  strokeWidth={(sel ? 3 : 1) / zoom}
                />
                {/* direction notch */}
                <Line
                  points={[0, 0, 0, -f.depth / 2]}
                  stroke={sel ? 'var(--accent)' : '#ffffff66'}
                  strokeWidth={2 / zoom}
                  listening={false}
                />
                <Text
                  x={-f.width / 2}
                  y={-7 / zoom}
                  width={f.width}
                  align="center"
                  text={entry?.icon ?? '▭'}
                  fontSize={Math.min(f.width, f.depth) * 0.5}
                  listening={false}
                />
              </Group>
            );
          })}

          {/* Draft (in-progress wall/room) */}
          {draft.length > 0 && (
            <DraftView draft={draft} cursor={cursor} tool={tool} zoom={zoom} />
          )}
        </Layer>
      </Stage>
    </div>
  );
}

function DraftView({
  draft, cursor, tool, zoom,
}: { draft: Point[]; cursor: Point | null; tool: string; zoom: number }) {
  const pts = cursor ? [...draft, cursor] : draft;
  const flat = pts.flatMap((p) => [p.x, p.y]);
  const last = draft[draft.length - 1];
  return (
    <Group listening={false}>
      <Line
        points={flat}
        closed={tool === 'room'}
        stroke="var(--accent)"
        strokeWidth={(tool === 'wall' ? 8 : 2) / zoom}
        lineCap="round"
        opacity={0.7}
        dash={tool === 'room' ? [10 / zoom, 6 / zoom] : undefined}
        fill={tool === 'room' ? 'rgba(76,141,255,0.12)' : undefined}
      />
      {draft.map((p, i) => (
        <Circle key={i} x={p.x} y={p.y} radius={5 / zoom} fill="#fff" stroke="var(--accent)" strokeWidth={2 / zoom} />
      ))}
      {cursor && last && (
        <Text
          x={midpoint(last, cursor).x}
          y={midpoint(last, cursor).y - 20 / zoom}
          text={`${fmtLen(dist(last, cursor))}  ·  ${Math.round(((angleDeg(last, cursor) % 360) + 360) % 360)}°`}
          fontSize={13 / zoom}
          fill="#fff"
        />
      )}
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
