import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { AdaptiveDpr, OrbitControls, Grid, SoftShadows, Environment, Lightformer, ContactShadows, Sky, Html } from '@react-three/drei';
import { EffectComposer, N8AO, Bloom, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { Paintbrush, X } from 'lucide-react';
import DesignScene, { useDesignBounds, type SurfaceTap } from './DesignScene';
import { angleDeg, snapToGrid } from '../../lib/geometry';
import { activeTier, tierCaps } from '../../lib/perfTier';
import { getGroundTexture, GROUND_DEFAULTS, type GroundKind } from '../../lib/textures';
import { buildSnapElements, nearestSnap, lockToAngle } from '../../lib/snapping';
import { formatLength } from '../../lib/units';
import { drawBridge, useDraw } from '../../lib/ui';
import type { Point } from '../../types';
import WalkControls, { WalkTouchControls } from './WalkControls';
import * as THREE from 'three';
import { sceneCapture, orbitZoom, orbitFocus } from '../../lib/renderBridge';
import { saveImage } from '../../lib/native';
import { useDesign } from '../../store/designStore';
import { useProStore } from '../../store/proStore';
import { applyWatermark } from '../../lib/watermark';
import { slugify } from '../../lib/appInfo';
import { sunModel } from '../../lib/sun';
import { finishForFace, withFaceFinish } from '../../lib/wallFaces';
import { CATALOG_BY_TYPE, FLOOR_MATERIALS } from '../../data/furnitureCatalog';
import { WALL_PAINTS, MATERIAL_GROUPS, floorMaterials, wallMaterials, materialUrl } from '../../data/materials';
import { useI18n } from '../../lib/i18n';
import { isSurfacePlaceable, isWallPlaceable, supportElevationAt } from '../../lib/furniturePlacement';
import SelectionRing from '../SelectionRing';

/** cm -> m, matching DesignScene's M. */
const M3 = 0.01;

export { sunModel };

/**
 * Planner-style decorate popover: tapping a wall or floor in 3D opens a palette
 * right at the tap point, grouped into material families (Paint/Basic + Wood,
 * Tile, Marble, …). Picking a swatch repaints via the normal store commits (so
 * paint jobs are undoable from the 2D editor).
 */
function PaintPopover({ tap, onClose }: { tap: SurfaceTap; onClose: () => void }) {
  const t = useI18n();
  const wall = useDesign((st) => (tap.kind === 'wall' ? st.walls.find((w) => w.id === tap.id) : undefined));
  const room = useDesign((st) => (tap.kind === 'room' ? st.rooms.find((r) => r.id === tap.id) : undefined));
  const exists = tap.kind === 'wall' ? !!wall : !!room;
  // The tapped element may not exist anymore (undo, floor switch).
  useEffect(() => {
    if (!exists) onClose();
  }, [exists, onClose]);
  if (!exists) return null;

  const left = Math.min(Math.max(tap.x, 130), window.innerWidth - 130);
  const top = Math.max(86, tap.y - 14);
  const st = useDesign.getState();
  const items = tap.kind === 'wall' ? wallMaterials() : floorMaterials();
  const faceFinish = wall ? finishForFace(wall, tap.wallFace) : undefined;
  const activeWallColor = faceFinish?.color ?? wall?.color;
  const activeWallTexture = faceFinish?.texture ?? wall?.texture;
  const activeSrc = tap.kind === 'wall' ? activeWallTexture?.src : room?.texture?.src;
  const paintWall = (color: string, texture?: NonNullable<typeof wall>['texture']) => {
    const current = useDesign.getState().walls.find((candidate) => candidate.id === tap.id);
    if (!current) return;
    if (tap.wallFace) {
      st.updateWall(tap.id, { faceFinishes: withFaceFinish(current, tap.wallFace, { color, texture }) });
    } else {
      st.updateWall(tap.id, { color, texture });
    }
  };
  const pickMaterial = (m: (typeof items)[number]) => {
    const src = materialUrl(m.id);
    const texture = { src, scaleCm: m.scaleCm, roughness: m.roughness, metalness: m.metalness };
    if (tap.kind === 'wall') paintWall(activeWallColor ?? m.color, texture);
    else st.updateRoom(tap.id, { floorMaterial: '', color: m.color, texture });
  };

  return (
    <div className="paint-pop" style={{ left, top }}>
      <div className="pp-head">
        <Paintbrush className="icon" />
        {tap.kind === 'wall' ? (tap.wallFace ? t('Wall section') : t('Wall paint')) : t('Flooring')}
        <button className="pp-close" onClick={onClose} aria-label={t('Close')}>
          <X className="icon" />
        </button>
      </div>
      <div className="pp-scroll">
        <div className="mat-group-title">{tap.kind === 'wall' ? t('Paint') : t('Basic')}</div>
        <div className="pp-swatches">
          {tap.kind === 'wall'
            ? WALL_PAINTS.map((c) => (
                <button
                  key={c}
                  className={`pp-swatch ${!activeWallTexture && activeWallColor === c ? 'on' : ''}`}
                  style={{ background: c }}
                  data-tip={c} aria-label={c}
                  onClick={() => paintWall(c, undefined)}
                />
              ))
            : FLOOR_MATERIALS.map((m) => (
                <button
                  key={m.id}
                  className={`pp-swatch ${!room?.texture && room?.floorMaterial === m.id ? 'on' : ''}`}
                  style={{ background: m.color }}
                  data-tip={t(m.name)} aria-label={t(m.name)}
                  onClick={() => st.updateRoom(tap.id, { floorMaterial: m.id, texture: undefined })}
                />
              ))}
        </div>
        {MATERIAL_GROUPS.map((g) => {
          const group = items.filter((m) => m.group === g);
          if (!group.length) return null;
          return (
            <div key={g}>
              <div className="mat-group-title">{t(g)}</div>
              <div className="pp-swatches">
                {group.map((m) => {
                  const src = materialUrl(m.id);
                  return (
                    <button
                      key={m.id}
                      className={`pp-swatch ${activeSrc === src ? 'on' : ''}`}
                      style={{ backgroundImage: `url(${src})`, backgroundSize: 'cover' }}
                      data-tip={t(m.name)} aria-label={t(m.name)}
                      onClick={() => pickMaterial(m)}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * WebGL context loss recovery.
 *
 * A lost context is what "the 3D view showed for a second and then went blank"
 * actually is: the scene draws its first frames, the driver drops the context,
 * and the canvas stays black forever. Android drops contexts readily — when
 * memory is tight, when the app is backgrounded, and when a SECOND context is
 * created (the catalog preview does exactly that beside the live scene).
 *
 * Nothing here was handled before, and the single most important line is
 * `event.preventDefault()`: without it the browser will never fire
 * `webglcontextrestored`, so the loss is permanent by default. Reported by a
 * tester on a Pixel 10 Pro.
 */
function ContextLossGuard({
  onLost,
  onRestored,
}: {
  onLost: () => void;
  onRestored: () => void;
}) {
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const canvas = gl.domElement;
    const lost = (event: Event) => {
      // Opts into restoration. Omitting this is what makes a blank view final.
      event.preventDefault();
      onLost();
    };
    const restored = () => {
      onRestored();
      invalidate();
    };
    canvas.addEventListener('webglcontextlost', lost);
    canvas.addEventListener('webglcontextrestored', restored);
    return () => {
      canvas.removeEventListener('webglcontextlost', lost);
      canvas.removeEventListener('webglcontextrestored', restored);
    };
  }, [gl, invalidate, onLost, onRestored]);
  return null;
}

/** Coarse pointer (no hover) → treat as touch and show on-screen controls. */
const IS_TOUCH =
  typeof window !== 'undefined' &&
  window.matchMedia &&
  window.matchMedia('(pointer: coarse)').matches;

/** Soft, fully-offline image-based lighting (no CDN HDR fetch). `day` (0..1)
 *  scales the sky-dome contribution so night actually reads dark and interior
 *  fixtures take over. Re-keyed on the day bucket so the env map rebakes. */
function StudioEnvironment({ day, envResolution }: { day: number; envResolution: number }) {
  const k = 0.24 + day * 0.96; // keep a dim floor so nothing goes pure black
  return (
    <Environment resolution={envResolution} frames={1}>
      <Lightformer intensity={1.35 * k} position={[0, 6, 0]} scale={[12, 12, 1]} rotation={[Math.PI / 2, 0, 0]} color="#ffffff" />
      <Lightformer intensity={0.95 * k} position={[7, 3, 3]} scale={[4, 8, 1]} color="#fff3e0" />
      <Lightformer intensity={0.7 * k} position={[-7, 3, -3]} scale={[4, 8, 1]} color="#cfe0ff" />
      <Lightformer intensity={0.3 * k} position={[0, -4, 0]} scale={[12, 12, 1]} rotation={[-Math.PI / 2, 0, 0]} color="#202225" />
    </Environment>
  );
}

/** Draws the anchor-puck icon (white directional triangles around a disc with
 *  a blue move-cross) onto a canvas texture — matches the IKEA-style widget. */
function makeAnchorTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const cx = 128;
  const cy = 128;
  g.fillStyle = 'rgba(255,255,255,0.96)';
  g.strokeStyle = 'rgba(40,50,60,0.25)';
  g.lineWidth = 4;
  const tri = (angle: number) => {
    g.save(); g.translate(cx, cy); g.rotate(angle);
    g.beginPath(); g.moveTo(0, -120); g.lineTo(-30, -80); g.lineTo(30, -80); g.closePath();
    g.fill(); g.stroke(); g.restore();
  };
  for (let i = 0; i < 4; i++) tri((i * Math.PI) / 2);
  g.beginPath();
  g.arc(cx, cy, 62, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.strokeStyle = '#4c9fc8';
  g.fillStyle = '#4c9fc8';
  g.lineWidth = 9;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(cx - 32, cy); g.lineTo(cx + 32, cy);
  g.moveTo(cx, cy - 32); g.lineTo(cx, cy + 32);
  g.stroke();
  const head = (angle: number) => {
    g.save(); g.translate(cx, cy); g.rotate(angle);
    g.beginPath(); g.moveTo(0, -52); g.lineTo(-13, -32); g.lineTo(13, -32); g.closePath();
    g.fill(); g.restore();
  };
  for (let i = 0; i < 4; i++) head((i * Math.PI) / 2);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Movable camera anchor (IKEA-kitchen-planner style): a puck lying on the floor
 * at the orbit target. Dragging it pans camera + target together, so orbit and
 * pinch-zoom then revolve around wherever it was parked — the discoverable
 * replacement for the old hidden double-tap focus gesture.
 */
function FocusAnchor() {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as
    | (THREE.EventDispatcher & { target: THREE.Vector3; enabled: boolean; update: () => void })
    | null;
  const invalidate = useThree((s) => s.invalidate);
  const { center, radius } = useDesignBounds();
  const group = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const texture = useMemo(() => makeAnchorTexture(), []);
  // Gizmo grab priority: report our hits at distance 0 so R3F sorts the puck
  // before furniture proxies that are physically nearer the camera — otherwise
  // the anchor is visible above objects (depthTest off) but ungrabbable there.
  useEffect(() => {
    const m = meshRef.current;
    if (!m) return;
    const base = m.raycast.bind(m);
    m.raycast = (rc: THREE.Raycaster, hits: THREE.Intersection[]) => {
      const tmp: THREE.Intersection[] = [];
      base(rc, tmp);
      for (const h of tmp) {
        h.distance = 0;
        hits.push(h);
      }
    };
  }, []);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const FLOOR = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const drag = useRef<{
    cam: THREE.Camera; hit0: THREE.Vector3; target0: THREE.Vector3; camPos0: THREE.Vector3;
  } | null>(null);

  // Follow the live orbit target; keep a roughly constant screen size.
  useFrame(() => {
    const g = group.current;
    // During walk-mode transitions the default controls are briefly
    // PointerLockControls, which have no target — skip those frames.
    if (!g || !controls || !controls.target) return;
    // The drag handler below clamps the anchor to the design's neighbourhood,
    // but OrbitControls' OWN pan (two-finger drag / right-drag) moves the
    // target without that clamp — so after enough panning the anchor ended up
    // far outside the design and off screen, with no way to get it back. A
    // tester reported exactly that. Apply the same clamp continuously, moving
    // the camera by the identical delta so the view stops at the boundary
    // instead of jumping.
    if (!drag.current) {
      const m = radius + 2;
      const tx = Math.min(center[0] + m, Math.max(center[0] - m, controls.target.x));
      const tz = Math.min(center[2] + m, Math.max(center[2] - m, controls.target.z));
      if (tx !== controls.target.x || tz !== controls.target.z) {
        camera.position.x += tx - controls.target.x;
        camera.position.z += tz - controls.target.z;
        controls.target.set(tx, controls.target.y, tz);
        controls.update();
      }
    }
    g.position.set(controls.target.x, 0.02, controls.target.z);
    const s = Math.min(1.8, Math.max(0.55, camera.position.distanceTo(controls.target) * 0.075));
    g.scale.setScalar(s);
  });

  // Intersections use a camera FROZEN at pointer-down: the live camera pans
  // during the drag, and raycasting from it would feed its own motion back
  // into the delta (runaway pan).
  const planeHit = (e: ThreeEvent<PointerEvent>, cam: THREE.Camera): THREE.Vector3 | null => {
    raycaster.setFromCamera(e.pointer, cam as THREE.PerspectiveCamera);
    const out = new THREE.Vector3();
    return raycaster.ray.intersectPlane(FLOOR, out) ? out : null;
  };

  const down = (e: ThreeEvent<PointerEvent>) => {
    if (!controls) return;
    e.stopPropagation();
    (e.target as Element | null)?.setPointerCapture?.(e.pointerId);
    const cam = camera.clone();
    cam.updateMatrixWorld(true);
    const hit0 = planeHit(e, cam);
    if (!hit0) return;
    drag.current = { cam, hit0, target0: controls.target.clone(), camPos0: camera.position.clone() };
    controls.enabled = false; // orbit pauses while the anchor is being moved
  };
  const move = (e: ThreeEvent<PointerEvent>) => {
    const st = drag.current;
    if (!st || !controls) return;
    e.stopPropagation();
    const hit = planeHit(e, st.cam);
    if (!hit) return;
    // Clamp the anchor to the design's neighbourhood — parking the camera
    // target far outside (or dragging toward the horizon) ends in blank views.
    const m = radius + 2;
    const tx = Math.min(center[0] + m, Math.max(center[0] - m, st.target0.x + (hit.x - st.hit0.x)));
    const tz = Math.min(center[2] + m, Math.max(center[2] - m, st.target0.z + (hit.z - st.hit0.z)));
    const dx = tx - st.target0.x;
    const dz = tz - st.target0.z;
    controls.target.set(tx, st.target0.y, tz);
    camera.position.set(st.camPos0.x + dx, st.camPos0.y, st.camPos0.z + dz);
    controls.update();
    invalidate();
  };
  const up = (e: ThreeEvent<PointerEvent>) => {
    if (!drag.current) return;
    e.stopPropagation();
    drag.current = null;
    if (controls) controls.enabled = true;
    invalidate();
  };

  return (
    <group ref={group}>
      {/* Gizmo semantics: always visible (depthTest off, late renderOrder) so
          the anchor can be found even when it sits among furniture. */}
      <mesh
        ref={meshRef}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={999}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onClick={(e) => e.stopPropagation()}
      >
        <circleGeometry args={[0.5, 24]} />
        <meshBasicMaterial map={texture} transparent depthWrite={false} depthTest={false} opacity={0.92} />
      </mesh>
    </group>
  );
}

/** Draggable endpoint gizmos for the selected wall — "after [drawing] you
 *  should be able to drag the points to change the wall". Live preview shows
 *  a guide + dimension; release commits through the corner-aware moveCorner
 *  so joined walls stay joined. Same gizmo tricks as FocusAnchor: raycast
 *  distance forced to 0 (grab priority), frozen camera for drag raycasts,
 *  orbit paused during the drag. */
function WallEndpointHandles() {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as (THREE.EventDispatcher & { enabled: boolean }) | null;
  const invalidate = useThree((s) => s.invalidate);
  const wall = useDesign((s) =>
    s.selection.kind === 'wall' ? s.walls.find((w) => w.id === s.selection.id) : undefined,
  );
  const units = useDesign((s) => s.units);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const FLOOR = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const [preview, setPreviewState] = useState<{ end: 'start' | 'end'; p: Point } | null>(null);
  // Handlers fire from stale R3F closures — mirror live values in refs.
  const previewRef = useRef<typeof preview>(null);
  const setPreview = (v: typeof preview) => {
    previewRef.current = v;
    setPreviewState(v);
  };
  const dragRef = useRef<{ end: 'start' | 'end'; cam: THREE.Camera; orig: Point; wallId: string } | null>(null);
  const meshA = useRef<THREE.Mesh>(null);
  const meshB = useRef<THREE.Mesh>(null);
  useEffect(() => {
    for (const r of [meshA, meshB]) {
      const m = r.current;
      if (!m) continue;
      const base = m.raycast.bind(m);
      m.raycast = (rc: THREE.Raycaster, hits: THREE.Intersection[]) => {
        const tmp: THREE.Intersection[] = [];
        base(rc, tmp);
        for (const h of tmp) {
          h.distance = 0;
          hits.push(h);
        }
      };
    }
  }, [wall?.id]);
  useEffect(() => setPreview(null), [wall?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const planeHit = (e: ThreeEvent<PointerEvent>, cam: THREE.Camera): THREE.Vector3 | null => {
    raycaster.setFromCamera(e.pointer, cam as THREE.PerspectiveCamera);
    const out = new THREE.Vector3();
    return raycaster.ray.intersectPlane(FLOOR, out) ? out : null;
  };
  const down = (end: 'start' | 'end') => (e: ThreeEvent<PointerEvent>) => {
    const st = useDesign.getState();
    const w = st.selection.kind === 'wall' ? st.walls.find((x) => x.id === st.selection.id) : undefined;
    if (!w || !controls) return;
    e.stopPropagation();
    (e.target as Element | null)?.setPointerCapture?.(e.pointerId);
    const cam = camera.clone();
    cam.updateMatrixWorld(true);
    dragRef.current = { end, cam, orig: { ...w[end] }, wallId: w.id };
    controls.enabled = false;
  };
  const move = (e: ThreeEvent<PointerEvent>) => {
    const dg = dragRef.current;
    if (!dg) return;
    e.stopPropagation();
    const hit = planeHit(e, dg.cam);
    if (!hit) return;
    const st = useDesign.getState();
    const w = st.walls.find((x) => x.id === dg.wallId);
    if (!w) return;
    const other = dg.end === 'start' ? w.end : w.start;
    const p = snapCornerPoint({ x: hit.x * 100, y: hit.z * 100 }, other, dg.orig);
    setPreview({ end: dg.end, p });
    invalidate();
  };
  const up = (e: ThreeEvent<PointerEvent>) => {
    const dg = dragRef.current;
    if (!dg) return;
    e.stopPropagation();
    dragRef.current = null;
    if (controls) controls.enabled = true;
    const pv = previewRef.current;
    setPreview(null);
    if (pv && Math.hypot(pv.p.x - dg.orig.x, pv.p.y - dg.orig.y) > 1) {
      // Corner-aware: every wall sharing the original corner moves with it.
      useDesign.getState().moveCorner(dg.orig, pv.p, 3);
    }
    invalidate();
  };

  if (!wall) return null;
  const at = (end: 'start' | 'end'): Point =>
    preview && preview.end === end ? preview.p : wall[end];
  const a = at('start');
  const b = at('end');
  const segLen = Math.hypot(b.x - a.x, b.y - a.y);
  const handle = (end: 'start' | 'end', ref: typeof meshA) => {
    const p = at(end);
    return (
      <mesh
        ref={ref}
        position={[p.x * 0.01, 0.03, p.y * 0.01]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={999}
        onPointerDown={down(end)}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onClick={(e) => e.stopPropagation()}
      >
        <ringGeometry args={[0.1, 0.24, 24]} />
        <meshBasicMaterial color="#f2b705" transparent depthWrite={false} depthTest={false} opacity={0.95} />
      </mesh>
    );
  };
  return (
    <group>
      {handle('start', meshA)}
      {handle('end', meshB)}
      {preview && (
        <>
          <GuideStrip
            at={preview.end === 'start' ? b : a}
            dir={Math.atan2(b.y - a.y, b.x - a.x)}
          />
          <GhostDim
            x={((a.x + b.x) / 2) * 0.01}
            z={((a.y + b.y) / 2) * 0.01}
            y={0.6}
            text={formatLength(segLen, units)}
          />
        </>
      )}
    </group>
  );
}

/** World-cm snap radius for 3D drafting (finger-scale taps are coarse). */
const SNAP_RADIUS_CM = 30;

/** Snap a 3D-drafted point IKEA-style: existing wall endpoints/edges win
 *  (same prioritized engine as the 2D editor), then segments square up via
 *  the shared `lockToAngle` (identical to 2D) so walls stay truly square. */
export function snapDraftPoint(raw: Point, draft: Point[]): Point {
  const st = useDesign.getState();
  const prev = draft.length ? draft[draft.length - 1] : null;
  const els = buildSnapElements({ walls: st.walls, draft, prev, radius: SNAP_RADIUS_CM, guides: true });
  const hit = nearestSnap(els, raw);
  if (hit && hit.kind !== 'guide') return { ...hit.point };
  const p = hit ? { ...hit.point } : { ...raw };
  const grid = st.showGrid ? (pt: Point) => snapToGrid(pt, st.gridSize) : undefined;
  if (prev) {
    const locked = lockToAngle(prev, p, grid);
    if (locked !== p) return locked;
  }
  return grid ? grid(p) : p;
}

/** Snap for dragging an existing corner: joins to another wall's endpoint
 *  when close (ignoring the corner being moved), else squares up against the
 *  wall's fixed endpoint like snapDraftPoint. */
export function snapCornerPoint(raw: Point, other: Point, orig: Point): Point {
  const st = useDesign.getState();
  let best: Point | null = null;
  let bd = SNAP_RADIUS_CM;
  for (const w of st.walls) {
    for (const q of [w.start, w.end]) {
      if (Math.hypot(q.x - orig.x, q.y - orig.y) < 5) continue;
      const d = Math.hypot(q.x - raw.x, q.y - raw.y);
      if (d < bd) {
        bd = d;
        best = q;
      }
    }
  }
  if (best) return { ...best };
  const p = { ...raw };
  const grid = st.showGrid ? (pt: Point) => snapToGrid(pt, st.gridSize) : undefined;
  const locked = lockToAngle(other, p, grid);
  if (locked !== p) return locked;
  return grid ? grid(p) : p;
}

/** IKEA-style yellow guide: a long thin strip on the floor through `at`,
 *  along `dir` (radians). */
function GuideStrip({ at, dir }: { at: Point; dir: number }) {
  return (
    <mesh
      position={[at.x * 0.01, 0.015, at.y * 0.01]}
      rotation={[0, -dir, 0]}
      renderOrder={997}
    >
      <boxGeometry args={[80, 0.002, 0.02]} />
      <meshBasicMaterial color="#f2b705" transparent opacity={0.55} depthWrite={false} />
    </mesh>
  );
}

/**
 * The touch selection ring, anchored over the selected object in 3D.
 *
 * Same component and same four actions as the 2D plan, so the two views behave
 * identically. drei's `Html` projects the world position and updates the
 * transform imperatively, which is why this costs no React render per frame and
 * does not fight the demand-render loop — the same reason `GhostDim` below uses
 * it. Because `Html` cannot clamp to the viewport, the ring is given no bounds
 * and a forced upward fan; an object right at the edge of the view can have
 * part of its fan clipped, which is the accepted trade for tracking the camera.
 */
function SelectionRing3D({ onEdit }: { onEdit: () => void }) {
  const selection = useDesign((s) => s.selection);
  const item = useDesign((s) =>
    s.selection.kind === 'furniture' ? s.furniture.find((f) => f.id === s.selection.id) : undefined);
  const selectedIds = useDesign((s) => s.selectedIds);
  const floors = useDesign((s) => s.floors);
  const activeFloorId = useDesign((s) => s.activeFloorId);
  if (selection.kind !== 'furniture' || !item || selectedIds.length > 1) return null;

  const storey = (floors.find((f) => f.id === activeFloorId)?.elevation ?? 0) * M3;
  // Sit just above the object so the fan clears it rather than passing through.
  const top = storey + ((item.elevation ?? 0) + item.height) * M3 + 0.12;
  const st = useDesign.getState();
  return (
    <Html
      position={[item.position.x * M3, top, item.position.y * M3]}
      center
      zIndexRange={[40, 0]}
      style={{ pointerEvents: 'none' }}
    >
      <SelectionRing
        x={0}
        y={0}
        place="above"
        actions={[
          { id: 'rotate', run: () => st.updateFurniture(item.id, { rotation: (item.rotation + 90) % 360 }) },
          { id: 'duplicate', run: () => st.duplicateSelection() },
          { id: 'edit', run: onEdit },
          { id: 'delete', run: () => st.deleteSelected() },
        ]}
      />
    </Html>
  );
}

/** Floating dimension pill over a drafted segment. */
function GhostDim({ x, z, y, text }: { x: number; z: number; y: number; text: string }) {
  return (
    <Html position={[x, y, z]} center zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }}>
      <div className="ghost-dim">{text}</div>
    </Html>
  );
}

/** Translucent preview of the wall/room chain (or kitchen-run start post)
 *  being drawn on the 3D floor — build-in-3D's equivalent of the 2D draft. */
function BuildGhost({ draft, tool }: { draft: Point[]; tool: string }) {
  const st = useDesign.getState();
  const h = st.defaultWallHeight * 0.01;
  const th = Math.max(st.defaultWallThickness * 0.01, 0.06);
  const segs: { mid: Point; len: number; yaw: number }[] = [];
  if (tool !== 'kitchen') {
    for (let i = 0; i < draft.length - 1; i++) {
      const a = draft[i];
      const b = draft[i + 1];
      const len = Math.hypot(b.x - a.x, b.y - a.y) * 0.01;
      if (len < 0.01) continue;
      segs.push({
        mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        len,
        yaw: -Math.atan2(b.y - a.y, b.x - a.x),
      });
    }
  }
  const units = st.units;
  const last = draft[draft.length - 1];
  const prev = draft.length >= 2 ? draft[draft.length - 2] : null;
  const lastDir = prev ? Math.atan2(last.y - prev.y, last.x - prev.x) : 0;
  return (
    <group>
      {/* IKEA-style guides: axis cross through the latest point, plus the
          extended line of the segment just drawn — the next tap will snap
          along these, so show where "square" is. */}
      {tool !== 'kitchen' && last && (
        <>
          <GuideStrip at={last} dir={0} />
          <GuideStrip at={last} dir={Math.PI / 2} />
          {prev && <GuideStrip at={last} dir={lastDir} />}
        </>
      )}
      {draft.map((pt, i) => (
        <mesh key={`p${i}`} position={[pt.x * 0.01, h / 2, pt.y * 0.01]}>
          <cylinderGeometry args={[0.05, 0.05, h, 10]} />
          <meshBasicMaterial color="#4c6ef5" transparent opacity={0.85} depthWrite={false} />
        </mesh>
      ))}
      {segs.map((sg, i) => (
        <mesh key={`s${i}`} position={[sg.mid.x * 0.01, h / 2, sg.mid.y * 0.01]} rotation={[0, sg.yaw, 0]}>
          <boxGeometry args={[sg.len, h, th]} />
          <meshBasicMaterial color="#4c6ef5" transparent opacity={0.4} depthWrite={false} />
        </mesh>
      ))}
      {/* Live dimensions over every drafted segment (exact lengths matter —
          "beginner to architect"). */}
      {segs.map((sg, i) => (
        <GhostDim
          key={`d${i}`}
          x={sg.mid.x * 0.01}
          z={sg.mid.y * 0.01}
          y={h + 0.25}
          text={formatLength(sg.len * 100, units)}
        />
      ))}
    </group>
  );
}

/** Registers a dolly function so the on-screen +/- buttons can zoom the orbit
 *  camera (moving it toward/away from the controls' target). */
function ZoomBridge() {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as
    | (THREE.EventDispatcher & { target: THREE.Vector3; minDistance: number; maxDistance: number; update: () => void })
    | null;
  const { center, radius } = useDesignBounds();
  useEffect(() => {
    if (!controls) return;
    orbitZoom.current = (factor: number) => {
      if (!controls.target) return; // walk-transition frame
      const offset = camera.position.clone().sub(controls.target);
      const dist = Math.max(controls.minDistance, Math.min(controls.maxDistance, offset.length() * factor));
      offset.setLength(dist);
      camera.position.copy(controls.target).add(offset);
      controls.update();
    };
    // Focus anchor (IKEA-style): move the orbit target to a floor point and
    // dolly part-way in, so subsequent pinch/orbit revolve around that area.
    orbitFocus.current = (x: number, z: number) => {
      if (!controls.target) return; // walk-transition frame
      const offset = camera.position.clone().sub(controls.target);
      const dist = Math.max(3.5, offset.length() * 0.55);
      offset.setLength(dist);
      // Aim slightly above the floor (counter height) so the view doesn't tilt
      // straight down at the boards; clamp to the design's neighbourhood so a
      // programmatic focus can never park the camera in the void.
      const m = radius + 2;
      const tx = Math.min(center[0] + m, Math.max(center[0] - m, x));
      const tz = Math.min(center[2] + m, Math.max(center[2] - m, z));
      controls.target.set(tx, 0.6, tz);
      camera.position.copy(controls.target).add(offset);
      controls.update();
    };
    return () => {
      orbitZoom.current = null;
      orbitFocus.current = null;
    };
  }, [camera, controls, center, radius]);
  return null;
}

/**
 * Isolates the post-processing composer so a driver/context failure in it
 * (seen as "Cannot read properties of null (reading 'alpha')" from
 * EffectComposer.addPass on some GPUs, e.g. Pixel 10 Pro) degrades to the plain
 * 3D scene instead of taking down the whole view via the app error boundary.
 */
class PostFXBoundary extends Component<{ onFail: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFail();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** Registers a high-resolution PNG capture function for the toolbar button. */
function CaptureBridge({ composerRef }: { composerRef: React.MutableRefObject<any> }) {
  const { gl, size, scene, camera } = useThree();
  useEffect(() => {
    sceneCapture.current = async (scale = 3) => {
      const { width, height } = size;
      const dpr = gl.getPixelRatio();
      // Supersample: render renderer + composer at scale×, keeping CSS size.
      gl.setPixelRatio(1);
      gl.setSize(width * scale, height * scale, false);
      const composer = composerRef.current;
      // Post-processing degraded (e.g. context-loss on some GPUs) → render the
      // scene straight to the buffer so Render still works without effects.
      const draw = () => (composer ? composer.render() : gl.render(scene, camera));
      composer?.setSize(width * scale, height * scale);
      draw();
      let dataUrl = gl.domElement.toDataURL('image/png');
      // Restore the live view exactly.
      gl.setPixelRatio(dpr);
      gl.setSize(width, height, false);
      composer?.setSize(width, height);
      draw();
      // Free tier ships a small corner ribbon; Pro exports clean.
      if (!useProStore.getState().isPro) dataUrl = await applyWatermark(dataUrl);
      await saveImage(dataUrl, `${slugify(useDesign.getState().projectName)}-render.png`);
    };
    return () => {
      sceneCapture.current = null;
    };
  }, [gl, size, scene, camera, composerRef]);
  return null;
}

export default function Scene3D({ onEditSelection }: { onEditSelection?: () => void } = {}) {
  const { center, radius } = useDesignBounds();
  const composerRef = useRef<any>(null);
  const dollhouse = useDesign((s) => s.dollhouse);
  const walkMode = useDesign((s) => s.walkMode);
  // Build-in-3D: when a floor-drawing tool is armed (from the Build sheet),
  // floor taps place draft points instead of opening the paint palette.
  const tool = useDesign((s) => s.tool);
  const buildArmed = !walkMode && (tool === 'wall' || tool === 'halfWall' || tool === 'fence' || tool === 'room' || tool === 'kitchen');
  // In-canvas pointer handlers can hold stale closures (R3F doesn't reliably
  // refresh an object's handler set), so they re-read the store at event time.
  const armedTool = (): string | null => {
    const st = useDesign.getState();
    return !st.walkMode && (st.tool === 'wall' || st.tool === 'halfWall' || st.tool === 'fence' || st.tool === 'room' || st.tool === 'kitchen') ? st.tool : null;
  };
  const [draft, setDraftState] = useState<Point[]>([]);
  // Handlers fire from stale R3F closures, so the live draft also lives in a
  // ref; and store commits must NEVER run inside a setState updater (React dev
  // double-invokes updaters — that shipped a double-wall bug once).
  const draftRef = useRef<Point[]>([]);
  const setDraft = (d: Point[]) => {
    draftRef.current = d;
    setDraftState(d);
  };
  const setWalkMode = useDesign((s) => s.setWalkMode);
  const sunTime = useDesign((s) => s.sunTime);

  // Time-of-day sun rig (drives sky + key light + fill so window light and
  // the visible sky always agree).
  const sun = sunModel(sunTime);
  // Place the key light exactly along `sun.dir` (uniform scale, no per-axis
  // fudge) so the shadow direction matches the sky's sun instead of drifting
  // from it. Distance is irrelevant to a directional light — only the angle is.
  const sunDist = radius * 2.5 + 10;
  const sunPos: [number, number, number] = [
    center[0] + sun.dir[0] * sunDist,
    center[1] + sun.dir[1] * sunDist,
    center[2] + sun.dir[2] * sunDist,
  ];
  // A low sun throws long shadows, so the ortho shadow frustum has to widen as
  // the sun drops or the far end of every shadow is clipped away.
  const shadowExtent = radius * (1.25 + (1 - sun.day) * 0.9);

  // Textured site ground. The old flat #eceae4 plane read as "no ground at all"
  // from outside — the building floated and cast shadows onto nothing. Procedural
  // (see textures.ts) so this costs no APK bytes.
  // Grid is a drawing aid, not scenery: show it only when a build tool is armed.
  const gridVisible = !walkMode && (tool === 'wall' || tool === 'halfWall' || tool === 'fence' || tool === 'room' || tool === 'kitchen');

  const groundKind: GroundKind = 'grass';
  const groundDef = GROUND_DEFAULTS[groundKind];
  const groundTex = useMemo(() => {
    const patchM = 4;
    const t = getGroundTexture(groundKind, groundDef.color, patchM);
    // Plane is 400 m and its UVs are 0..1, so repeat = size / patch.
    t.repeat.set(400 / patchM, 400 / patchM);
    return t;
  }, [groundKind, groundDef.color]);
  // Sky wants a direction, not a world point.
  const skySun: [number, number, number] = [sun.dir[0], Math.max(0.02, sun.dir[1]), sun.dir[2]];

  // Touch input state shared between the HTML overlay and the in-Canvas controller.
  const moveRef = useRef({ x: 0, y: 0 });
  const lookRef = useRef({ x: 0, y: 0 });

  // Decorate popover state (tap a wall/floor to repaint it in place).
  const [paintTap, setPaintTap] = useState<SurfaceTap | null>(null);
  // If post-processing fails on this GPU, drop it and render the plain scene.
  const [postFailed, setPostFailed] = useState(false);
  // A dropped GPU context leaves a permanently black canvas unless we both opt
  // into restoration and rebuild the scene. `canvasKey` forces a fresh Canvas
  // when the driver never restores on its own.
  const t3 = useI18n();
  const [contextLost, setContextLost] = useState(false);
  const [canvasKey, setCanvasKey] = useState(0);
  // Graded device capability (+ user override) instead of a bare touch check, so
  // capable phones keep shadows instead of losing every effect at once.
  const caps = useMemo(() => tierCaps(activeTier(), IS_TOUCH), []);
  // `lowPower` now means "skip the expensive extras", not "is touch" — a capable
  // phone keeps shadows. Post-processing stays off for any non-`post` tier, and a
  // driver crash (postFailed) disables it permanently for this session.
  const lowPower = !caps.shadows;
  const noPost = postFailed || !caps.post;
  useEffect(() => {
    if (walkMode) setPaintTap(null);
  }, [walkMode]);

  // Close the paint palette as soon as the selection moves off the surface it
  // belongs to. Tapping furniture goes through a different path than
  // handleSurfaceTap, so a floor's palette used to stay open over an unrelated
  // selection — a 3D probe caught the popover still showing while a chair was
  // selected. Anchoring it to the selection keeps the two in step whatever
  // route the tap took.
  const selectedId = useDesign((st) => st.selection.id);
  useEffect(() => {
    if (paintTap && selectedId !== paintTap.id) setPaintTap(null);
  }, [selectedId, paintTap]);

  const addDraftPoint = (raw: Point) => {
    const st = useDesign.getState();
    const d = draftRef.current;
    // IKEA-grade snapping: existing wall points/edges, then square-to-grid.
    const p = snapDraftPoint(raw, d);
    if (st.tool === 'kitchen') {
      if (d.length === 0) {
        setDraft([p]);
      } else {
        const a = d[0];
        setDraft([]);
        st.addKitchenRun(a, p);
      }
    } else {
      setDraft([...d, p]);
    }
  };
  const finishDraft = () => {
    const st = useDesign.getState();
    const d = draftRef.current;
    setDraft([]);
    if ((st.tool === 'wall' || st.tool === 'halfWall' || st.tool === 'fence') && d.length >= 2) {
      const kind = st.tool === 'fence' ? 'fence' : st.tool === 'halfWall' ? 'half' : 'wall';
      for (let i = 0; i < d.length - 1; i++) st.addWall(d[i], d[i + 1], kind);
    } else if (st.tool === 'room' && d.length >= 3) {
      st.addRoom(d);
    }
  };
  // Reset the draft when the tool changes; expose Finish/Cancel to the shared
  // draw affordance (the same pill the 2D editor shows).
  useEffect(() => setDraft([]), [tool]);
  useEffect(() => {
    if (!buildArmed) return;
    drawBridge.finish = finishDraft;
    drawBridge.cancel = () => setDraft([]);
    // Exact dimensions: retype the just-drawn segment to a precise length
    // along its (snapped) direction — wired to the draw-affordance input.
    drawBridge.setLength = (cm: number) => {
      const st = useDesign.getState();
      if (st.tool === 'kitchen' || !(cm > 0)) return;
      const d = draftRef.current;
      if (d.length < 2) return;
      const a = d[d.length - 2];
      const b = d[d.length - 1];
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const nb = { x: a.x + ((b.x - a.x) / len) * cm, y: a.y + ((b.y - a.y) / len) * cm };
      setDraft([...d.slice(0, -1), nb]);
    };
    const min = tool === 'room' ? 3 : tool === 'wall' || tool === 'halfWall' || tool === 'fence' ? 2 : 1;
    useDraw.getState().setActive(draft.length >= min);
    return () => {
      drawBridge.finish = null;
      drawBridge.cancel = null;
      drawBridge.setLength = null;
      useDraw.getState().setActive(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildArmed, draft, tool]);

  const handleSurfaceTap = (tap: SurfaceTap) => {
    if (armedTool()) {
      // Drawing owns surface taps — floors AND walls (wall taps carry their
      // plan position too, so a kitchen run can be tapped out along a wall,
      // and the snap engine tidies the point onto the wall line).
      if (tap.position) addDraftPoint(tap.position);
      setPaintTap(null);
      return;
    }
    const st = useDesign.getState();
    const pending = st.pendingFurnitureType;
    if (pending) {
      const entry = CATALOG_BY_TYPE[pending];
      if (!entry?.opening && tap.position && tap.kind === 'wall' && isWallPlaceable(entry)) {
        const wall = st.walls.find((candidate) => candidate.id === tap.id);
        if (wall) {
          const preferredBase = tap.elevation != null
            ? tap.elevation - entry.height / 2
            : entry.mountY ?? 110;
          const maxBase = Math.max(0, wall.height - entry.height);
          const id = st.addFurniture(pending, tap.position, {
            rotation: angleDeg(wall.start, wall.end),
            elevation: Math.max(0, Math.min(maxBase, preferredBase)),
          });
          st.select({ kind: 'furniture', id });
          st.setPendingFurniture(null);
          st.setTool('select');
        }
      } else if (!entry?.opening && tap.kind === 'room' && tap.position && !isWallPlaceable(entry)) {
        const elevation = isSurfacePlaceable(entry)
          ? supportElevationAt(tap.position, st.furniture)
          : 0;
        const id = st.addFurniture(pending, tap.position, { elevation });
        st.select({ kind: 'furniture', id });
        st.setPendingFurniture(null);
        st.setTool('select');
      }
      // Placement mode owns surface taps; never open the paint palette while
      // the user is trying to add an object.
      setPaintTap(null);
      return;
    }
    setPaintTap(tap);
  };

  // Fluid interaction on demand-rendering: 'demand' keeps an idle scene at
  // 0 fps (battery), but orbit damping needs continuous frames — relying on the
  // invalidate chain stutters on loaded phones (each dropped link kills the
  // inertia). So while a pointer is down (or a wheel/pinch is happening) we
  // switch to 'always', then fall back to 'demand' shortly after the gesture —
  // long enough for the damping tail to ease out smoothly.
  const [interacting, setInteracting] = useState(false);
  const interactEndTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const beginInteract = () => {
    if (interactEndTimer.current) clearTimeout(interactEndTimer.current);
    setInteracting(true);
  };
  const scheduleInteractEnd = () => {
    if (interactEndTimer.current) clearTimeout(interactEndTimer.current);
    interactEndTimer.current = setTimeout(() => setInteracting(false), 1200);
  };
  useEffect(() => () => {
    if (interactEndTimer.current) clearTimeout(interactEndTimer.current);
  }, []);

  return (
    <div
      style={{ position: 'absolute', inset: 0 }}
      onPointerDownCapture={beginInteract}
      onPointerUpCapture={scheduleInteractEnd}
      onPointerCancelCapture={scheduleInteractEnd}
      onWheelCapture={() => {
        beginInteract();
        scheduleInteractEnd();
      }}
    >
    {/* Unmounted while the context is lost. three.js keeps drawing against the
        dead context otherwise and throws on its null attributes — the view is
        already blank at that point, so there is nothing to preserve. */}
    {!contextLost && (
    <Canvas
      key={canvasKey}
      // Mobile perf tier: touch devices drop post-processing + shadows and cap
      // DPR — the biggest GPU costs — to keep 3D navigation smooth on Android.
      // (High-res photo/plan exports are separate and stay full quality.)
      flat={!noPost} // when post is dropped, let three apply its own tone mapping
      shadows={caps.shadows}
      frameloop={walkMode || interacting ? 'always' : 'demand'}
      // MSAA + a higher DPR ceiling are the real fix for the mobile "jaggies":
      // the light tier used to ship with antialias off and DPR capped at 1.25,
      // so every wall/furniture edge stair-stepped. MSAA is cheap on modern
      // mobile GPUs; AdaptiveDpr still pulls the resolution down (smoothly, not
      // pixelated) if a frame budget slips, and the heavy costs (post-processing,
      // real-time shadows) stay gated by lowPower.
      dpr={[1, caps.maxDpr]}
      performance={{ min: lowPower ? 0.6 : 0.5, debounce: 250 }}
      gl={{ antialias: true, preserveDrawingBuffer: false, powerPreference: 'high-performance' }}
      camera={{ position: [center[0] + radius * 0.95, radius * 1.0, center[2] + radius * 0.95], fov: 50 }}
      style={{ position: 'absolute', inset: 0 }}
      onPointerMissed={() => {
        useDesign.getState().clearSelection();
        setPaintTap(null);
      }}
    >
      {/* Demand rendering keeps 120 Hz phones from redrawing an idle scene;
          AdaptiveDpr lowers interaction cost further if a frame budget slips. */}
      <ContextLossGuard
        onLost={() => setContextLost(true)}
        onRestored={() => setContextLost(false)}
      />
      <AdaptiveDpr pixelated={false} />
      {/* Soft daytime sky + gentle distance fog: gives renders a horizon and
          natural light falloff instead of a flat grey void. */}
      {/* Dome radius must sit inside the camera far plane (default 1000). */}
      <Sky
        distance={700}
        sunPosition={skySun}
        turbidity={sun.isNight ? 12 : 5}
        rayleigh={sun.isNight ? 0.4 : 1.6 + (1 - sun.day) * 2}
        mieCoefficient={0.004}
        mieDirectionalG={0.85}
      />
      {/* Distance fog for a soft horizon — kept BEYOND the max orbit distance
          (radius*8+20) so it only fades the far ground/grid, never the building
          itself. The old radius*5..14 range sat inside the zoom range, so zooming
          out washed the whole model to the fog colour ("fades to white"). */}
      <fog attach="fog" args={[sun.isNight ? '#0e1420' : '#dfe6ee', radius * 8 + 15, radius * 18 + 80]} />
      {caps.softShadows && <SoftShadows size={24} samples={12} />}

      {/* Airier interiors: lifted ambient/hemisphere + softened shadows so
          rooms behind walls read bright and clean instead of murky. */}
      <ambientLight intensity={sun.ambient * 1.4 + 0.06} />
      <hemisphereLight intensity={0.26 + sun.day * 0.42} groundColor="#3a3d45" color={sun.isNight ? '#20293a' : '#ffffff'} />
      {/* Sun key light — position, colour and intensity track time of day, so
          shadows and the light spilling through windows match the sky. */}
      <directionalLight
        position={sunPos}
        intensity={sun.sunIntensity}
        color={sun.sunColor}
        castShadow={caps.shadows}
        shadow-intensity={0.8}
        // 2048 over a frustum tightened to the design (was 1024 over ±radius*2,
        // i.e. ~4x fewer texels per metre) — shadow edges now read as edges.
        shadow-mapSize={[caps.shadowMapSize, caps.shadowMapSize]}
        // normalBias is what actually fixes acne on large flat surfaces (floors,
        // and later the roof); with it the depth bias can be much gentler, which
        // stops contact points detaching ("peter-panning").
        shadow-bias={-0.0001}
        shadow-normalBias={0.02}
        shadow-camera-left={-shadowExtent}
        shadow-camera-right={shadowExtent}
        shadow-camera-top={shadowExtent}
        shadow-camera-bottom={-shadowExtent}
        // A fixed 80 m far plane silently clipped shadows on large plans; the
        // light now sits sunDist away, so scale the far plane past it.
        shadow-camera-far={sunDist + radius * 2 + 20}
      />
      {/* Cool sky fill from the opposite side (fades at night). */}
      <directionalLight
        position={[center[0] - sun.dir[0] * 14, 12, center[2] - sun.dir[2] * 10]}
        intensity={0.1 + sun.day * 0.24}
        color="#cdd8ff"
      />
      <StudioEnvironment key={Math.round(sun.day * 4)} day={sun.day} envResolution={caps.envResolution} />

      {/* Soft contact shadows ground the furniture & walls realistically
          (desktop only — they re-render the scene each frame). */}
      {caps.contactShadows && (
        <ContactShadows
          position={[center[0], 0.015, center[2]]}
          scale={Math.max(20, radius * 4)}
          resolution={1024}
          blur={2.4}
          far={2.2}
          opacity={0.42}
          color="#100d0a"
        />
      )}

      {/* Ground + grid */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[center[0], -0.01, center[2]]}
        receiveShadow
        // NB: attached unconditionally — R3F doesn't reliably re-register an
        // object whose handler toggles between undefined and a function.
        onClick={(e) => {
          if (!armedTool()) return;
          e.stopPropagation();
          addDraftPoint({ x: e.point.x / 0.01, y: e.point.z / 0.01 });
        }}
      >
        <planeGeometry args={[400, 400]} />
        <meshStandardMaterial map={groundTex} color={groundDef.color} roughness={groundDef.roughness} />
      </mesh>
      {/* CAD grid only while actually drawing. It used to render unconditionally,
          which put survey lines across the lawn in every exterior view (and every
          render). Building tools still get their alignment reference. */}
      {gridVisible && (
        <Grid
          position={[center[0], 0, center[2]]}
          args={[120, 120]}
          cellSize={1}
          cellColor="#dadce0"
          sectionSize={5}
          sectionColor="#c6c9ce"
          fadeDistance={radius * 6}
          infiniteGrid
        />
      )}

      {/* Force solid walls while walking so the real interior is visible. */}
      <DesignScene
        interactive
        dollhouse={walkMode ? false : dollhouse}
        onSurfaceTap={walkMode ? undefined : handleSurfaceTap}
      />

      {/* Touch selection actions over the selected object. Suppressed while
          walking or while a draw tool is armed — both own the tap surface.
          Not touch-gated: this replaces the old ±45° rotate pill, which desktop
          had too, so gating it would have removed rotate from 3D on desktop. */}
      {!walkMode && !armedTool() && <SelectionRing3D onEdit={() => onEditSelection?.()} />}

      {!noPost && (
        <PostFXBoundary onFail={() => setPostFailed(true)}>
          <EffectComposer ref={composerRef} multisampling={4} enableNormalPass>
            <N8AO aoRadius={0.5} intensity={1.1} distanceFalloff={1} halfRes />
            <Bloom mipmapBlur intensity={0.18} luminanceThreshold={1.0} />
            <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
          </EffectComposer>
        </PostFXBoundary>
      )}

      <CaptureBridge composerRef={composerRef} />
      {!walkMode && <ZoomBridge />}
      {!walkMode && !buildArmed && <FocusAnchor />}
      {!walkMode && !buildArmed && <WallEndpointHandles />}
      {buildArmed && draft.length > 0 && <BuildGhost draft={draft} tool={tool} />}

      {walkMode ? (
        <WalkControls isTouch={IS_TOUCH} moveRef={moveRef} lookRef={lookRef} />
      ) : (
        <OrbitControls
          target={center}
          enableDamping
          dampingFactor={0.09}
          rotateSpeed={0.8}
          zoomSpeed={1.1}
          panSpeed={0.8}
          zoomToCursor
          screenSpacePanning
          minPolarAngle={0.05}
          maxPolarAngle={Math.PI / 2.05}
          minDistance={3}
          maxDistance={radius * 8 + 20}
          makeDefault
          regress
        />
      )}
    </Canvas>
    )}

    {/* Decorate popover, anchored at the tapped surface. */}
    {paintTap && !walkMode && <PaintPopover tap={paintTap} onClose={() => setPaintTap(null)} />}
    {/* A dropped context used to leave a silent black rectangle with no way
        back. Say so, and offer the rebuild — the driver often does not restore
        on its own, and remounting the Canvas gets a fresh context. */}
    {contextLost && (
      <div className="gl-lost" role="alert">
        <p>{t3('The 3D view was interrupted by your device.')}</p>
        <button
          className="btn primary"
          onClick={() => {
            setContextLost(false);
            setCanvasKey((k) => k + 1);
          }}
        >
          {t3('Reload 3D')}
        </button>
      </div>
    )}

    {/* Walk-mode HUD: hint, exit, and (on touch) on-screen movement controls. */}
    {walkMode && (
      <>
        <div className="walk-hint">
          {IS_TOUCH
            ? 'Left stick to move · drag the right side to look · Exit to leave'
            : 'Click to look · WASD / arrows to move · Shift to run · Esc to exit'}
        </div>
        <button className="walk-exit" onClick={() => setWalkMode(false)}>
          ✕ Exit walk
        </button>
        {IS_TOUCH && <WalkTouchControls moveRef={moveRef} lookRef={lookRef} />}
      </>
    )}
    </div>
  );
}
