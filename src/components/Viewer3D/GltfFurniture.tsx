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
const U = (f: string) => `${import.meta.env.BASE_URL}models/${f}.glb`;

export const FURNITURE_MODELS: Record<string, { url: string; yaw?: number }> = {
  sofa: { url: U('sofa') },
  armchair: { url: U('armchair') },
  // Poly Haven CC0 pack (1k, quantized + webp-compressed at build time).
  dining_table: { url: U('dining_table') },
  dining_chair: { url: U('dining_chair') },
  coffee_table: { url: U('coffee_table') },
  nightstand: { url: U('nightstand') },
  plant: { url: U('plant') },
  large_plant: { url: U('large_plant') },
  stove: { url: U('stove') },
  desk: { url: U('desk') },
  bed_double: { url: U('bed_double') },
  bookshelf: { url: U('bookshelf') },
  side_table: { url: U('side_table') },
  bar_stool: { url: U('bar_stool') },
  bench: { url: U('bench') },
  wardrobe: { url: U('wardrobe') },
  dresser: { url: U('dresser') },
  ottoman: { url: U('ottoman') },
  // NB: no pendant/tv model — the fitter rests bases on the floor, which is
  // wrong for hanging lights, and the procedural TV (emissive screen at stand
  // height) reads better than a flat panel lying on the ground.
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

// Warm only the most common models; the rest stream in on first use so a
// 20-model library doesn't front-load the 3D view.
for (const t of ['sofa', 'armchair', 'dining_table', 'dining_chair'] as const) {
  useGLTF.preload(FURNITURE_MODELS[t].url);
}
