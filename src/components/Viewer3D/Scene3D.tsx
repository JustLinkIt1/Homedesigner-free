import { useEffect, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Grid, SoftShadows, Environment, Lightformer, ContactShadows, Sky } from '@react-three/drei';
import { EffectComposer, N8AO, Bloom, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { Paintbrush, X } from 'lucide-react';
import DesignScene, { useDesignBounds, type SurfaceTap } from './DesignScene';
import WalkControls, { WalkTouchControls } from './WalkControls';
import { sceneCapture } from '../../lib/renderBridge';
import { saveImage } from '../../lib/native';
import { useDesign } from '../../store/designStore';
import { useProStore } from '../../store/proStore';
import { applyWatermark } from '../../lib/watermark';
import { slugify } from '../../lib/appInfo';
import { sunModel } from '../../lib/sun';
import { FLOOR_MATERIALS } from '../../data/furnitureCatalog';

export { sunModel };

/** Interior paint palette for walls (first entry is the default plaster). */
const WALL_PAINTS = [
  '#ece6db', '#ffffff', '#f5efe3', '#e9d8c3', '#dfe5dc', '#cfdce2',
  '#d7c4b7', '#c9cdd4', '#b9c7b3', '#e6c9c9', '#f0d9a8', '#4a5568',
];

/**
 * Planner-style decorate popover: tapping a wall or floor in 3D opens a tiny
 * palette right at the tap point; picking a swatch repaints via the normal
 * store commits (so paint jobs are undoable from the 2D editor).
 */
function PaintPopover({ tap, onClose }: { tap: SurfaceTap; onClose: () => void }) {
  const current = useDesign((st) =>
    tap.kind === 'wall'
      ? st.walls.find((w) => w.id === tap.id)?.color
      : st.rooms.find((r) => r.id === tap.id)?.floorMaterial,
  );
  // The tapped element may not exist anymore (undo, floor switch).
  useEffect(() => {
    if (current === undefined) onClose();
  }, [current, onClose]);
  if (current === undefined) return null;

  const left = Math.min(Math.max(tap.x, 120), window.innerWidth - 120);
  const top = Math.max(86, tap.y - 14);
  return (
    <div className="paint-pop" style={{ left, top }}>
      <div className="pp-head">
        <Paintbrush className="icon" />
        {tap.kind === 'wall' ? 'Wall paint' : 'Flooring'}
        <button className="pp-close" onClick={onClose} aria-label="Close">
          <X className="icon" />
        </button>
      </div>
      <div className="pp-swatches">
        {tap.kind === 'wall'
          ? WALL_PAINTS.map((c) => (
              <button
                key={c}
                className={`pp-swatch ${current === c ? 'on' : ''}`}
                style={{ background: c }}
                title={c}
                onClick={() => useDesign.getState().updateWall(tap.id, { color: c })}
              />
            ))
          : FLOOR_MATERIALS.map((m) => (
              <button
                key={m.id}
                className={`pp-swatch ${current === m.id ? 'on' : ''}`}
                style={{ background: m.color }}
                title={m.name}
                onClick={() => useDesign.getState().updateRoom(tap.id, { floorMaterial: m.id })}
              />
            ))}
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
function StudioEnvironment({ day }: { day: number }) {
  const k = 0.24 + day * 0.96; // keep a dim floor so nothing goes pure black
  return (
    <Environment resolution={256} frames={1}>
      <Lightformer intensity={1.35 * k} position={[0, 6, 0]} scale={[12, 12, 1]} rotation={[Math.PI / 2, 0, 0]} color="#ffffff" />
      <Lightformer intensity={0.95 * k} position={[7, 3, 3]} scale={[4, 8, 1]} color="#fff3e0" />
      <Lightformer intensity={0.7 * k} position={[-7, 3, -3]} scale={[4, 8, 1]} color="#cfe0ff" />
      <Lightformer intensity={0.3 * k} position={[0, -4, 0]} scale={[12, 12, 1]} rotation={[-Math.PI / 2, 0, 0]} color="#202225" />
    </Environment>
  );
}

/** Registers a high-resolution PNG capture function for the toolbar button. */
function CaptureBridge({ composerRef }: { composerRef: React.MutableRefObject<any> }) {
  const { gl, size } = useThree();
  useEffect(() => {
    sceneCapture.current = async (scale = 3) => {
      const { width, height } = size;
      const dpr = gl.getPixelRatio();
      // Supersample: render renderer + composer at scale×, keeping CSS size.
      gl.setPixelRatio(1);
      gl.setSize(width * scale, height * scale, false);
      const composer = composerRef.current;
      composer?.setSize(width * scale, height * scale);
      composer?.render();
      let dataUrl = gl.domElement.toDataURL('image/png');
      // Restore the live view exactly.
      gl.setPixelRatio(dpr);
      gl.setSize(width, height, false);
      composer?.setSize(width, height);
      composer?.render();
      // Free tier ships a small corner ribbon; Pro exports clean.
      if (!useProStore.getState().isPro) dataUrl = await applyWatermark(dataUrl);
      await saveImage(dataUrl, `${slugify(useDesign.getState().projectName)}-render.png`);
    };
    return () => {
      sceneCapture.current = null;
    };
  }, [gl, size, composerRef]);
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
  useEffect(() => {
    if (walkMode) setPaintTap(null);
  }, [walkMode]);

  return (
    <>
    <Canvas
      flat // composer's ToneMapping owns tone mapping; avoid double-applying
      shadows
      gl={{ antialias: true, preserveDrawingBuffer: false }}
      camera={{ position: [center[0] + radius * 0.95, radius * 1.0, center[2] + radius * 0.95], fov: 50 }}
      style={{ position: 'absolute', inset: 0 }}
      onPointerMissed={() => {
        useDesign.getState().clearSelection();
        setPaintTap(null);
      }}
    >
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
      <fog attach="fog" args={[sun.isNight ? '#0e1420' : '#dfe6ee', radius * 5, radius * 14]} />
      <SoftShadows size={24} samples={12} />

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
        castShadow
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
      <StudioEnvironment key={Math.round(sun.day * 4)} day={sun.day} />

      {/* Soft contact shadows ground the furniture & walls realistically. */}
      <ContactShadows
        position={[center[0], 0.015, center[2]]}
        scale={Math.max(20, radius * 4)}
        resolution={1024}
        blur={2.4}
        far={2.2}
        opacity={0.42}
        color="#0a0c10"
      />

      {/* Ground + grid */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[center[0], -0.01, center[2]]} receiveShadow>
        <planeGeometry args={[400, 400]} />
        <meshStandardMaterial color="#e6e8eb" roughness={1} />
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
        onSurfaceTap={walkMode ? undefined : setPaintTap}
      />

      <EffectComposer ref={composerRef} multisampling={8} enableNormalPass>
        <N8AO aoRadius={0.5} intensity={1.1} distanceFalloff={1} halfRes />
        <Bloom mipmapBlur intensity={0.18} luminanceThreshold={1.0} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>

      <CaptureBridge composerRef={composerRef} />

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
          minDistance={2}
          maxDistance={radius * 8 + 20}
          makeDefault
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
