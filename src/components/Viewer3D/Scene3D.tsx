import { useEffect, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Grid, SoftShadows, Environment, Lightformer } from '@react-three/drei';
import { EffectComposer, N8AO, Bloom, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import DesignScene, { useDesignBounds } from './DesignScene';
import { sceneCapture } from '../../lib/renderBridge';
import { saveImage } from '../../lib/native';
import { useDesign } from '../../store/designStore';

/** Soft, fully-offline image-based lighting (no CDN HDR fetch). */
function StudioEnvironment() {
  return (
    <Environment resolution={256} frames={1}>
      <Lightformer intensity={1.1} position={[0, 6, 0]} scale={[12, 12, 1]} rotation={[Math.PI / 2, 0, 0]} color="#ffffff" />
      <Lightformer intensity={0.8} position={[7, 3, 3]} scale={[4, 8, 1]} color="#fff3e0" />
      <Lightformer intensity={0.6} position={[-7, 3, -3]} scale={[4, 8, 1]} color="#cfe0ff" />
      <Lightformer intensity={0.3} position={[0, -4, 0]} scale={[12, 12, 1]} rotation={[-Math.PI / 2, 0, 0]} color="#202225" />
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
      const dataUrl = gl.domElement.toDataURL('image/png');
      // Restore the live view exactly.
      gl.setPixelRatio(dpr);
      gl.setSize(width, height, false);
      composer?.setSize(width, height);
      composer?.render();
      await saveImage(dataUrl, `homedesign-${Date.now()}.png`);
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

  return (
    <Canvas
      flat // composer's ToneMapping owns tone mapping; avoid double-applying
      shadows
      gl={{ antialias: true, preserveDrawingBuffer: false }}
      camera={{ position: [center[0] + radius * 0.95, radius * 1.0, center[2] + radius * 0.95], fov: 50 }}
      style={{ position: 'absolute', inset: 0 }}
      onPointerMissed={() => useDesign.getState().clearSelection()}
    >
      <color attach="background" args={['#0c0e13']} />
      <fog attach="fog" args={['#0c0e13', radius * 3, radius * 9]} />
      <SoftShadows size={24} samples={12} />

      <ambientLight intensity={0.38} />
      <hemisphereLight intensity={0.45} groundColor="#2a2c33" />
      <directionalLight
        position={[center[0] + 12, 22, center[2] + 8]}
        intensity={1.15}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-radius * 2}
        shadow-camera-right={radius * 2}
        shadow-camera-top={radius * 2}
        shadow-camera-bottom={-radius * 2}
        shadow-camera-far={80}
      />
      <directionalLight position={[center[0] - 14, 12, center[2] - 10]} intensity={0.3} color="#cdd8ff" />
      <StudioEnvironment />

      {/* Ground + grid */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[center[0], -0.01, center[2]]} receiveShadow>
        <planeGeometry args={[400, 400]} />
        <meshStandardMaterial color="#15171d" roughness={1} />
      </mesh>
      <Grid
        position={[center[0], 0, center[2]]}
        args={[120, 120]}
        cellSize={1}
        cellColor="#23262e"
        sectionSize={5}
        sectionColor="#2e3340"
        fadeDistance={radius * 6}
        infiniteGrid
      />

      <DesignScene interactive dollhouse={dollhouse} />

      <EffectComposer ref={composerRef} multisampling={8} enableNormalPass>
        <N8AO aoRadius={0.7} intensity={2.2} distanceFalloff={1} halfRes />
        <Bloom mipmapBlur intensity={0.18} luminanceThreshold={1.0} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>

      <CaptureBridge composerRef={composerRef} />

      <OrbitControls
        target={center}
        maxPolarAngle={Math.PI / 2.05}
        minDistance={2}
        maxDistance={radius * 8 + 20}
        makeDefault
      />
    </Canvas>
  );
}
