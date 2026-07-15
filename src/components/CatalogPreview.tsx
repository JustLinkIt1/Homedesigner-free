import { Suspense, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { Bounds, Center, OrbitControls } from '@react-three/drei';
import type { CatalogEntry } from '../data/furnitureCatalog';
import type { FurnitureItem } from '../types';
import { ResilientGltfFurniture } from './Viewer3D/GltfFurniture';
import { ShapeMesh } from './Viewer3D/Furniture3D';

function PreviewObject({ entry }: { entry: CatalogEntry }) {
  const item = useMemo<FurnitureItem>(() => ({
    id: `preview-${entry.type}`,
    type: entry.type,
    name: entry.name,
    position: { x: 0, y: 0 },
    rotation: 0,
    width: entry.width,
    depth: entry.depth,
    height: entry.height,
    color: entry.color,
  }), [entry]);

  const fallback = (
    <ShapeMesh
      shape={entry.shape}
      w={entry.width / 100}
      d={entry.depth / 100}
      h={entry.height / 100}
      color={entry.color}
    />
  );
  return <ResilientGltfFurniture item={item} fallback={fallback} />;
}

/** A single lightweight canvas is reused for the selected catalog item. */
export default function CatalogPreview({ entry }: { entry: CatalogEntry }) {
  return (
    <div className="catalog-preview-canvas" aria-label={`3D preview of ${entry.name}`}>
      <Canvas
        key={entry.type}
        frameloop="demand"
        dpr={[0.9, 1.25]}
        camera={{ position: [2.6, 1.9, 2.6], fov: 38, near: 0.01, far: 100 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
      >
        <ambientLight intensity={1.7} />
        <directionalLight position={[3, 5, 4]} intensity={2.2} />
        <directionalLight position={[-3, 2, -2]} intensity={0.8} />
        <Suspense fallback={null}>
          <Bounds fit clip observe margin={1.25}>
            <Center bottom>
              <PreviewObject entry={entry} />
            </Center>
          </Bounds>
        </Suspense>
        <OrbitControls
          makeDefault
          enablePan={false}
          enableZoom
          minPolarAngle={Math.PI * 0.16}
          maxPolarAngle={Math.PI * 0.48}
        />
      </Canvas>
    </div>
  );
}
