import { useEffect, useState } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Pathtracer, usePathtracer } from '@react-three/gpu-pathtracer';
import { GradientEquirectTexture } from 'three-gpu-pathtracer';
import * as THREE from 'three';
import DesignScene, { useDesignBounds } from './DesignScene';
import { photoCapture } from '../../lib/renderBridge';
import { saveImage } from '../../lib/native';
import { slugify } from '../../lib/appInfo';
import { useDesign } from '../../store/designStore';
import { useProStore } from '../../store/proStore';
import { applyWatermark } from '../../lib/watermark';

const MAX_SAMPLES = 400;

/** Lives inside <Pathtracer> so it can use its context. */
function PathtracedContent({
  center,
  onSamples,
}: {
  center: [number, number, number];
  onSamples: (n: number) => void;
}) {
  const { pathtracer, reset, update } = usePathtracer();
  const { scene, gl } = useThree();

  // Offline gradient sky → image-based lighting (no CDN fetch).
  useEffect(() => {
    const env = new GradientEquirectTexture(1024);
    env.topColor.set('#aac6ff');
    env.bottomColor.set('#fef7ec');
    env.exponent = 1.5;
    env.update();
    scene.environment = env;
    scene.background = new THREE.Color('#0c0e13');
    // Rebuild the tracer with the new environment + geometry, then restart.
    update();
    reset();
    return () => {
      env.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Expose a save-to-PNG action for the toolbar / overlay button.
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

  // Live progressive sample readout.
  useFrame(() => {
    if (pathtracer) onSamples(Math.min(MAX_SAMPLES, Math.floor(pathtracer.samples)));
  });

  return (
    <>
      <DesignScene interactive={false} />
      <OrbitControls makeDefault target={center} onChange={() => reset()} />
    </>
  );
}

export default function PhotoMode({ onClose }: { onClose: () => void }) {
  const { center, radius } = useDesignBounds();
  const [samples, setSamples] = useState(0);
  const done = samples >= MAX_SAMPLES;
  const pct = Math.round((samples / MAX_SAMPLES) * 100);

  return (
    <div className="photo-overlay">
      <Canvas
        gl={{ preserveDrawingBuffer: true, antialias: false }}
        camera={{ position: [center[0] + radius, radius * 1.0, center[2] + radius], fov: 50 }}
        style={{ position: 'absolute', inset: 0 }}
      >
        <Pathtracer enabled samples={MAX_SAMPLES} bounces={5} tiles={[3, 3]}>
          <PathtracedContent center={center} onSamples={setSamples} />
        </Pathtracer>
      </Canvas>

      <div className="photo-bar">
        <div className="photo-status">
          <span className="logo">📷</span>
          <div>
            <div className="photo-title">{done ? 'Render complete' : 'Rendering photorealistic image…'}</div>
            <div className="photo-sub">
              {samples} / {MAX_SAMPLES} samples
              <div className="photo-progress">
                <div className="photo-progress-fill" style={{ width: `${pct}%` }} />
              </div>
            </div>
          </div>
        </div>
        <div className="photo-actions">
          <button className="btn" onClick={onClose}>
            Close
          </button>
          <button className="btn primary" onClick={() => photoCapture.current?.()}>
            💾 Save PNG
          </button>
        </div>
      </div>

      <div className="photo-hint">Drag to orbit · scroll to zoom · the image refines as it renders</div>
    </div>
  );
}
