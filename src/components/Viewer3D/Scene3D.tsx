import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { AdaptiveDpr, OrbitControls, Grid, SoftShadows, Environment, Lightformer, ContactShadows, Sky } from '@react-three/drei';
import { EffectComposer, N8AO, Bloom, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { Paintbrush, X } from 'lucide-react';
import DesignScene, { useDesignBounds, type SurfaceTap } from './DesignScene';
import { snapToGrid } from '../../lib/geometry';
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
                  title={c}
                  onClick={() => paintWall(c, undefined)}
                />
              ))
            : FLOOR_MATERIALS.map((m) => (
                <button
                  key={m.id}
                  className={`pp-swatch ${!room?.texture && room?.floorMaterial === m.id ? 'on' : ''}`}
                  style={{ background: m.color }}
                  title={t(m.name)}
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
                      title={t(m.name)}
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

/** Coarse pointer (no hover) → treat as touch and show on-screen controls. */
const IS_TOUCH =
  typeof window !== 'undefined' &&
  window.matchMedia &&
  window.matchMedia('(pointer: coarse)').matches;

/** Soft, fully-offline image-based lighting (no CDN HDR fetch). `day` (0..1)
 *  scales the sky-dome contribution so night actually reads dark and interior
 *  fixtures take over. Re-keyed on the day bucket so the env map rebakes. */
function StudioEnvironment({ day, lowPower }: { day: number; lowPower: boolean }) {
  const k = 0.24 + day * 0.96; // keep a dim floor so nothing goes pure black
  return (
    <Environment resolution={lowPower ? 128 : 256} frames={1}>
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
    if (!g || !controls) return;
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
    const dx = hit.x - st.hit0.x;
    const dz = hit.z - st.hit0.z;
    controls.target.set(st.target0.x + dx, st.target0.y, st.target0.z + dz);
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
  return (
    <group>
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
  useEffect(() => {
    if (!controls) return;
    orbitZoom.current = (factor: number) => {
      const offset = camera.position.clone().sub(controls.target);
      const dist = Math.max(controls.minDistance, Math.min(controls.maxDistance, offset.length() * factor));
      offset.setLength(dist);
      camera.position.copy(controls.target).add(offset);
      controls.update();
    };
    // Focus anchor (IKEA-style): move the orbit target to a floor point and
    // dolly part-way in, so subsequent pinch/orbit revolve around that area.
    orbitFocus.current = (x: number, z: number) => {
      const offset = camera.position.clone().sub(controls.target);
      const dist = Math.max(3.5, offset.length() * 0.55);
      offset.setLength(dist);
      // Aim slightly above the floor (counter height) so the view doesn't tilt
      // straight down at the boards.
      controls.target.set(x, 0.6, z);
      camera.position.copy(controls.target).add(offset);
      controls.update();
    };
    return () => {
      orbitZoom.current = null;
      orbitFocus.current = null;
    };
  }, [camera, controls]);
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

export default function Scene3D() {
  const { center, radius } = useDesignBounds();
  const composerRef = useRef<any>(null);
  const dollhouse = useDesign((s) => s.dollhouse);
  const walkMode = useDesign((s) => s.walkMode);
  // Build-in-3D: when a floor-drawing tool is armed (from the Build sheet),
  // floor taps place draft points instead of opening the paint palette.
  const tool = useDesign((s) => s.tool);
  const buildArmed = !walkMode && (tool === 'wall' || tool === 'room' || tool === 'kitchen');
  // In-canvas pointer handlers can hold stale closures (R3F doesn't reliably
  // refresh an object's handler set), so they re-read the store at event time.
  const armedTool = (): string | null => {
    const st = useDesign.getState();
    return !st.walkMode && (st.tool === 'wall' || st.tool === 'room' || st.tool === 'kitchen') ? st.tool : null;
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
  const sunPos: [number, number, number] = [
    center[0] + sun.dir[0] * radius * 1.5,
    sun.dir[1] * radius * 1.6 + 4,
    center[2] + sun.dir[2] * radius * 1.5,
  ];
  // Sky wants a direction, not a world point.
  const skySun: [number, number, number] = [sun.dir[0], Math.max(0.02, sun.dir[1]), sun.dir[2]];

  // Touch input state shared between the HTML overlay and the in-Canvas controller.
  const moveRef = useRef({ x: 0, y: 0 });
  const lookRef = useRef({ x: 0, y: 0 });

  // Decorate popover state (tap a wall/floor to repaint it in place).
  const [paintTap, setPaintTap] = useState<SurfaceTap | null>(null);
  // If post-processing fails on this GPU, drop it and render the plain scene.
  const [postFailed, setPostFailed] = useState(false);
  // Touch devices get the light render tier (no post/shadows, lower DPR).
  const lowPower = IS_TOUCH;
  const noPost = postFailed || lowPower;
  useEffect(() => {
    if (walkMode) setPaintTap(null);
  }, [walkMode]);

  const snapPoint = (p: Point): Point => {
    const st = useDesign.getState();
    return st.showGrid ? snapToGrid(p, st.gridSize) : p;
  };
  const addDraftPoint = (raw: Point) => {
    const p = snapPoint(raw);
    const st = useDesign.getState();
    const d = draftRef.current;
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
    if (st.tool === 'wall' && d.length >= 2) {
      for (let i = 0; i < d.length - 1; i++) st.addWall(d[i], d[i + 1]);
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
    const min = tool === 'room' ? 3 : tool === 'wall' ? 2 : 1;
    useDraw.getState().setActive(draft.length >= min);
    return () => {
      drawBridge.finish = null;
      drawBridge.cancel = null;
      useDraw.getState().setActive(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildArmed, draft, tool]);

  const handleSurfaceTap = (tap: SurfaceTap) => {
    if (armedTool()) {
      // Drawing owns floor taps; wall taps are ignored while drawing.
      if (tap.kind === 'room' && tap.position) addDraftPoint(tap.position);
      setPaintTap(null);
      return;
    }
    const st = useDesign.getState();
    const pending = st.pendingFurnitureType;
    if (pending) {
      const entry = CATALOG_BY_TYPE[pending];
      if (!entry?.opening && tap.kind === 'room' && tap.position) {
        const id = st.addFurniture(pending, tap.position);
        st.select({ kind: 'furniture', id });
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
    <Canvas
      // Mobile perf tier: touch devices drop post-processing + shadows and cap
      // DPR — the biggest GPU costs — to keep 3D navigation smooth on Android.
      // (High-res photo/plan exports are separate and stay full quality.)
      flat={!noPost} // when post is dropped, let three apply its own tone mapping
      shadows={!lowPower}
      frameloop={walkMode || interacting ? 'always' : 'demand'}
      dpr={lowPower ? [0.85, 1.25] : [1, 2]}
      performance={{ min: lowPower ? 0.65 : 0.5, debounce: 250 }}
      gl={{ antialias: !lowPower, preserveDrawingBuffer: false, powerPreference: 'high-performance' }}
      camera={{ position: [center[0] + radius * 0.95, radius * 1.0, center[2] + radius * 0.95], fov: 50 }}
      style={{ position: 'absolute', inset: 0 }}
      onPointerMissed={() => {
        useDesign.getState().clearSelection();
        setPaintTap(null);
      }}
    >
      {/* Demand rendering keeps 120 Hz phones from redrawing an idle scene;
          AdaptiveDpr lowers interaction cost further if a frame budget slips. */}
      <AdaptiveDpr pixelated={lowPower} />
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
      {!lowPower && <SoftShadows size={24} samples={12} />}

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
        castShadow={!lowPower}
        shadow-intensity={0.8}
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0004}
        shadow-camera-left={-radius * 2}
        shadow-camera-right={radius * 2}
        shadow-camera-top={radius * 2}
        shadow-camera-bottom={-radius * 2}
        shadow-camera-far={80}
      />
      {/* Cool sky fill from the opposite side (fades at night). */}
      <directionalLight
        position={[center[0] - sun.dir[0] * 14, 12, center[2] - sun.dir[2] * 10]}
        intensity={0.1 + sun.day * 0.24}
        color="#cdd8ff"
      />
      <StudioEnvironment key={Math.round(sun.day * 4)} day={sun.day} lowPower={lowPower} />

      {/* Soft contact shadows ground the furniture & walls realistically
          (desktop only — they re-render the scene each frame). */}
      {!lowPower && (
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
        <meshStandardMaterial color="#eceae4" roughness={1} />
      </mesh>
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

      {/* Force solid walls while walking so the real interior is visible. */}
      <DesignScene
        interactive
        dollhouse={walkMode ? false : dollhouse}
        onSurfaceTap={walkMode ? undefined : handleSurfaceTap}
      />

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

    {/* Decorate popover, anchored at the tapped surface. */}
    {paintTap && !walkMode && <PaintPopover tap={paintTap} onClose={() => setPaintTap(null)} />}

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
