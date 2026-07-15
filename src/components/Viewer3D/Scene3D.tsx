import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { AdaptiveDpr, OrbitControls, Grid, SoftShadows, Environment, Lightformer, ContactShadows, Sky } from '@react-three/drei';
import { EffectComposer, N8AO, Bloom, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { Paintbrush, X } from 'lucide-react';
import DesignScene, { useDesignBounds, type SurfaceTap } from './DesignScene';
import WalkControls, { WalkTouchControls } from './WalkControls';
import * as THREE from 'three';
import { sceneCapture, orbitZoom } from '../../lib/renderBridge';
import { saveImage } from '../../lib/native';
import { useDesign } from '../../store/designStore';
import { useProStore } from '../../store/proStore';
import { applyWatermark } from '../../lib/watermark';
import { slugify } from '../../lib/appInfo';
import { sunModel } from '../../lib/sun';
import { finishForFace, withFaceFinish } from '../../lib/wallFaces';
import { CATALOG_BY_TYPE, FLOOR_MATERIALS } from '../../data/furnitureCatalog';
import { WALL_PAINTS, MATERIAL_GROUPS, floorMaterials, wallMaterials, materialUrl } from '../../data/materials';

export { sunModel };

/**
 * Planner-style decorate popover: tapping a wall or floor in 3D opens a palette
 * right at the tap point, grouped into material families (Paint/Basic + Wood,
 * Tile, Marble, …). Picking a swatch repaints via the normal store commits (so
 * paint jobs are undoable from the 2D editor).
 */
function PaintPopover({ tap, onClose }: { tap: SurfaceTap; onClose: () => void }) {
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
        {tap.kind === 'wall' ? (tap.wallFace ? 'Wall section' : 'Wall paint') : 'Flooring'}
        <button className="pp-close" onClick={onClose} aria-label="Close">
          <X className="icon" />
        </button>
      </div>
      <div className="pp-scroll">
        <div className="mat-group-title">{tap.kind === 'wall' ? 'Paint' : 'Basic'}</div>
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
                  title={m.name}
                  onClick={() => st.updateRoom(tap.id, { floorMaterial: m.id, texture: undefined })}
                />
              ))}
        </div>
        {MATERIAL_GROUPS.map((g) => {
          const group = items.filter((m) => m.group === g);
          if (!group.length) return null;
          return (
            <div key={g}>
              <div className="mat-group-title">{g}</div>
              <div className="pp-swatches">
                {group.map((m) => {
                  const src = materialUrl(m.id);
                  return (
                    <button
                      key={m.id}
                      className={`pp-swatch ${activeSrc === src ? 'on' : ''}`}
                      style={{ backgroundImage: `url(${src})`, backgroundSize: 'cover' }}
                      title={m.name}
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
    return () => {
      orbitZoom.current = null;
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

  const handleSurfaceTap = (tap: SurfaceTap) => {
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

  return (
    <>
    <Canvas
      // Mobile perf tier: touch devices drop post-processing + shadows and cap
      // DPR — the biggest GPU costs — to keep 3D navigation smooth on Android.
      // (High-res photo/plan exports are separate and stay full quality.)
      flat={!noPost} // when post is dropped, let three apply its own tone mapping
      shadows={!lowPower}
      frameloop={walkMode ? 'always' : 'demand'}
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
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[center[0], -0.01, center[2]]} receiveShadow>
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
    </>
  );
}
