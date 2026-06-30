import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { FurnitureItem } from '../../types';

const M = 0.01; // cm -> m

/**
 * Manifest of real glTF furniture models, keyed by catalog type. Only types
 * listed here load a model; everything else uses the procedural mesh. Models
 * live in /public/models and are fetched lazily (their own network request),
 * so they never weigh down the initial bundle. `yaw` corrects a model whose
 * "front" doesn't face +Z. Drop in a new pack by adding entries here.
 */
export const FURNITURE_MODELS: Record<string, { url: string; yaw?: number }> = {
  sofa: { url: `${import.meta.env.BASE_URL}models/sofa.glb` },
  armchair: { url: `${import.meta.env.BASE_URL}models/armchair.glb` },
};

export function hasModel(type: string): boolean {
  return type in FURNITURE_MODELS;
}

/**
 * Renders a real glTF model normalized to the item's footprint: uniformly
 * scaled to fit width×depth (aspect preserved), recentred, and dropped so its
 * base sits on the floor. The parent group owns world position + rotation.
 */
export default function GltfFurniture({ item }: { item: FurnitureItem }) {
  const def = FURNITURE_MODELS[item.type];
  const { scene } = useGLTF(def.url);

  const node = useMemo(() => {
    const clone = scene.clone(true);
    const box = new THREE.Box3().setFromObject(clone);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    // Uniform scale fitting both footprint dimensions (keeps proportions).
    const sx = (item.width * M) / (size.x || 1);
    const sz = (item.depth * M) / (size.z || 1);
    const scale = Math.min(sx, sz);
    clone.scale.setScalar(scale);
    // Recentre horizontally and rest the base on y = 0.
    clone.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);

    clone.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    return clone;
  }, [scene, item.width, item.depth]);

  return (
    <group rotation={[0, def.yaw ?? 0, 0]}>
      <primitive object={node} />
    </group>
  );
}

// Warm the cache for the bundled models when this module loads in the 3D view.
Object.values(FURNITURE_MODELS).forEach((m) => useGLTF.preload(m.url));
