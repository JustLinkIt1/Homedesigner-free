import { useEffect, useRef, useState } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import {
  OrbitControls, Sky, Environment, Lightformer, ContactShadows,
} from '@react-three/drei';
import { EffectComposer, N8AO, Bloom, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { Pathtracer, usePathtracer } from '@react-three/gpu-pathtracer';
import { GradientEquirectTexture } from 'three-gpu-pathtracer';
import * as THREE from 'three';
import DesignScene, { useDesignBounds } from './DesignScene';
import { photoCapture } from '../../lib/renderBridge';
import { saveImage } from '../../lib/native';
import { slugify } from '../../lib/appInfo';
import { sunModel } from '../../lib/sun';
import { useDesign } from '../../store/designStore';
import { useProStore } from '../../store/proStore';
import { applyWatermark } from '../../lib/watermark';
import { requestReviewAfterPhotoSave } from '../../lib/appReview';

const MAX_SAMPLES = 200;

/** Synchronous probe: can this GPU run the path tracer? Most phones can't
 *  (no EXT_color_buffer_float), so we decide the mode BEFORE mounting the
 *  heavy tracer and render a raster "beauty" view instead. */
function pathtracerSupported(): boolean {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    const ok = !!gl && !!gl.getExtension('EXT_color_buffer_float');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return ok;
  } catch {
    return false;
  }
}

/* ---------------------------------------------------------------- path-traced */

/** Lives inside <Pathtracer> so it can use its context. */
function PathtracedContent({
  center,
  dollhouse,
  onSamples,
  onUnsupported,
}: {
  center: [number, number, number];
  dollhouse: boolean;
  onSamples: (n: number) => void;
  onUnsupported: () => void;
}) {
  const { pathtracer, reset, update } = usePathtracer();
  const { scene, gl } = useThree();

  // The dollhouse fade edits material opacities the tracer has already baked;
  // re-sync them whenever the camera settles or the toggle flips. (The fade is
  // instant in photo mode, so two frames after a change it is final.)
  const syncMaterials = () => {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        (pathtracer as unknown as { updateMaterials?: () => void })?.updateMaterials?.();
        reset();
      }),
    );
  };
  useEffect(() => {
    syncMaterials();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dollhouse]);

  useEffect(() => {
    const glCtx = gl.getContext();
    const ext =
      'getExtension' in glCtx ? (glCtx as WebGL2RenderingContext).getExtension('EXT_color_buffer_float') : null;
    if (!ext) onUnsupported();
  }, [gl, onUnsupported]);

  // Offline gradient sky → image-based lighting (no CDN fetch).
  useEffect(() => {
    const env = new GradientEquirectTexture(1024);
    env.topColor.set('#aac6ff');
    env.bottomColor.set('#fef7ec');
    env.exponent = 1.5;
    env.update();
    scene.environment = env;
    scene.background = new THREE.Color('#0c0e13');
    update();
    reset();
    return () => {
      env.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    photoCapture.current = async () => {
      let dataUrl = gl.domElement.toDataURL('image/png');
      if (!useProStore.getState().isPro) dataUrl = await applyWatermark(dataUrl);
      await saveImage(dataUrl, `${slugify(useDesign.getState().projectName)}-photo.png`);
    };
    return () => {
      photoCapture.current = null;
    };
  }, [gl]);

  useFrame(() => {
    if (pathtracer) onSamples(Math.min(MAX_SAMPLES, Math.floor(pathtracer.samples)));
  });

  return (
    <>
      <DesignScene interactive={false} dollhouse={dollhouse} dollhouseInstant useRenderModels />
      <OrbitControls
        makeDefault
        target={center}
        onChange={() => reset()}
        onEnd={dollhouse ? syncMaterials : undefined}
      />
    </>
  );
}

/* --------------------------------------------------------------------- raster */

/** Supersampled PNG capture of the raster beauty view (works on every GPU). */
function RasterCapture({ composerRef }: { composerRef: React.MutableRefObject<any> }) {
  const { gl, size } = useThree();
  useEffect(() => {
    photoCapture.current = async () => {
      const scale = useProStore.getState().isPro ? 3 : 2;
      const { width, height } = size;
      const dpr = gl.getPixelRatio();
      gl.setPixelRatio(1);
      gl.setSize(width * scale, height * scale, false);
      composerRef.current?.setSize(width * scale, height * scale);
      composerRef.current?.render();
      let dataUrl = gl.domElement.toDataURL('image/png');
      gl.setPixelRatio(dpr);
      gl.setSize(width, height, false);
      composerRef.current?.setSize(width, height);
      composerRef.current?.render();
      if (!useProStore.getState().isPro) dataUrl = await applyWatermark(dataUrl);
      await saveImage(dataUrl, `${slugify(useDesign.getState().projectName)}-photo.png`);
    };
    return () => {
      photoCapture.current = null;
    };
  }, [gl, size, composerRef]);
  return null;
}

/** A real-time "beauty" view: the same time-of-day sun rig and film look as the
 *  3D scene, but rendered with the standard rasteriser so it runs anywhere. */
function RasterContent({
  center,
  radius,
  dollhouse,
}: {
  center: [number, number, number];
  radius: number;
  dollhouse: boolean;
}) {
  const composerRef = useRef<any>(null);
  const sunTime = useDesign((s) => s.sunTime);
  const sun = sunModel(sunTime);
  const sunPos: [number, number, number] = [
    center[0] + sun.dir[0] * radius * 1.5,
    sun.dir[1] * radius * 1.6 + 4,
    center[2] + sun.dir[2] * radius * 1.5,
  ];
  const skySun: [number, number, number] = [sun.dir[0], Math.max(0.02, sun.dir[1]), sun.dir[2]];
  const k = 0.18 + sun.day * 0.82;

  return (
    <>
      <Sky distance={700} sunPosition={skySun} turbidity={sun.isNight ? 12 : 5}
        rayleigh={sun.isNight ? 0.4 : 1.6 + (1 - sun.day) * 2} mieCoefficient={0.004} mieDirectionalG={0.85} />
      <fog attach="fog" args={[sun.isNight ? '#0e1420' : '#dfe6ee', radius * 5, radius * 14]} />
      {/* NB: no drei <SoftShadows> here — it globally patches the shadow shader
          and the live 3D canvas underneath already applies it; a second copy
          double-defines the PCSS functions and fails to compile. */}
      <ambientLight intensity={sun.ambient} />
      <hemisphereLight intensity={0.18 + sun.day * 0.3} groundColor="#2a2c33" color={sun.isNight ? '#20293a' : '#ffffff'} />
      <directionalLight
        position={sunPos} intensity={sun.sunIntensity} color={sun.sunColor} castShadow
        shadow-mapSize={[1024, 1024]} shadow-bias={-0.0004}
        shadow-camera-left={-radius * 2} shadow-camera-right={radius * 2}
        shadow-camera-top={radius * 2} shadow-camera-bottom={-radius * 2} shadow-camera-far={80} />
      <directionalLight position={[center[0] - sun.dir[0] * 14, 12, center[2] - sun.dir[2] * 10]}
        intensity={0.1 + sun.day * 0.24} color="#cdd8ff" />
      <Environment resolution={256} frames={1}>
        <Lightformer intensity={1.1 * k} position={[0, 6, 0]} scale={[12, 12, 1]} rotation={[Math.PI / 2, 0, 0]} color="#ffffff" />
        <Lightformer intensity={0.8 * k} position={[7, 3, 3]} scale={[4, 8, 1]} color="#fff3e0" />
        <Lightformer intensity={0.6 * k} position={[-7, 3, -3]} scale={[4, 8, 1]} color="#cfe0ff" />
      </Environment>
      <ContactShadows position={[center[0], 0.015, center[2]]} scale={Math.max(20, radius * 4)}
        resolution={1024} blur={2.4} far={2.2} opacity={0.42} color="#0a0c10" />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[center[0], -0.01, center[2]]} receiveShadow>
        <planeGeometry args={[400, 400]} />
        <meshStandardMaterial color="#e6e8eb" roughness={1} />
      </mesh>

      <DesignScene interactive={false} dollhouse={dollhouse} dollhouseInstant useRenderModels />

      <EffectComposer ref={composerRef} multisampling={8} enableNormalPass>
        <N8AO aoRadius={0.5} intensity={1.1} distanceFalloff={1} halfRes />
        <Bloom mipmapBlur intensity={0.18} luminanceThreshold={1.0} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
      <RasterCapture composerRef={composerRef} />
      <OrbitControls makeDefault target={center} enableDamping dampingFactor={0.09} />
    </>
  );
}

/* ----------------------------------------------------------------------- shell */

export default function PhotoMode({ onClose }: { onClose: () => void }) {
  const { center, radius } = useDesignBounds();
  const [mode, setMode] = useState<'trace' | 'raster'>(() =>
    pathtracerSupported() ? 'trace' : 'raster',
  );
  const [samples, setSamples] = useState(0);
  // Same dollhouse flag as the 3D view, so framing carries over naturally.
  const dollhouse = useDesign((s) => s.dollhouse);
  const setDollhouse = useDesign((s) => s.setDollhouse);

  // Safety net: if the tracer probe passed but samples never advance, fall
  // back to the raster beauty view instead of a stalled bar.
  useEffect(() => {
    if (mode !== 'trace' || samples > 0) return;
    const t = window.setTimeout(() => {
      if (samples === 0) setMode('raster');
    }, 6000);
    return () => window.clearTimeout(t);
  }, [mode, samples]);

  const done = samples >= MAX_SAMPLES;
  const pct = Math.round((samples / MAX_SAMPLES) * 100);
  const canSave = mode === 'raster' || samples > 0;

  const savePhoto = async () => {
    const capture = photoCapture.current;
    if (!capture) return;
    await capture();
    await requestReviewAfterPhotoSave();
  };

  return (
    <div className="photo-overlay">
      {mode === 'trace' ? (
        <Canvas
          gl={{ preserveDrawingBuffer: true, antialias: false }}
          camera={{ position: [center[0] + radius, radius * 1.0, center[2] + radius], fov: 50 }}
          style={{ position: 'absolute', inset: 0 }}
        >
          <Pathtracer enabled samples={MAX_SAMPLES} bounces={5} tiles={[3, 3]}>
            <PathtracedContent
              center={center}
              dollhouse={dollhouse}
              onSamples={setSamples}
              onUnsupported={() => setMode('raster')}
            />
          </Pathtracer>
        </Canvas>
      ) : (
        <Canvas
          flat
          shadows
          gl={{ antialias: true, preserveDrawingBuffer: true }}
          camera={{ position: [center[0] + radius * 0.95, radius * 1.0, center[2] + radius * 0.95], fov: 50 }}
          style={{ position: 'absolute', inset: 0 }}
        >
          <RasterContent center={center} radius={radius} dollhouse={dollhouse} />
        </Canvas>
      )}

      <label className="photo-dollhouse" data-tip="Fade the walls facing the camera" aria-label="Fade the walls facing the camera">
        <input type="checkbox" checked={dollhouse} onChange={(e) => setDollhouse(e.target.checked)} />
        🏠 Dollhouse
      </label>

      <div className="photo-bar">
        <div className="photo-status">
          <span className="logo">📷</span>
          <div>
            <div className="photo-title">
              {mode === 'raster'
                ? 'Photo mode'
                : done
                  ? 'Render complete'
                  : 'Rendering photorealistic image…'}
            </div>
            <div className="photo-sub">
              {mode === 'raster' ? (
                'Frame your shot, then save a high-resolution photo'
              ) : (
                <>
                  {samples} / {MAX_SAMPLES} samples
                  <div className="photo-progress">
                    <div className="photo-progress-fill" style={{ width: `${pct}%` }} />
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="photo-actions">
          <button className="btn" onClick={onClose}>
            Close
          </button>
          <button className="btn primary" disabled={!canSave} onClick={() => void savePhoto()}>
            💾 Save photo
          </button>
        </div>
      </div>

      <div className="photo-hint">
        {mode === 'raster'
          ? 'Drag to orbit · pinch to zoom · Save for a crisp high-res photo'
          : 'Drag to orbit · scroll to zoom · the image refines as it renders'}
      </div>
    </div>
  );
}
