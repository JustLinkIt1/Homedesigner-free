import { Component, Suspense, useMemo, type ReactNode } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { FurnitureItem } from '../../types';
import { CATALOG_BY_TYPE } from '../../data/furnitureCatalog';

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
  // Second Poly Haven CC0 batch (v1.0.35).
  office_chair: { url: U('office_chair') },
  console: { url: U('console') },
  mirror: { url: U('mirror') },
  cabinets: { url: U('cabinets') },
  filing_cabinet: { url: U('filing_cabinet') },
  desk_lamp: { url: U('desk_lamp') },
  office_bookshelf: { url: U('office_bookshelf') },
  lounge_chair: { url: U('lounge_chair') },
  round_dining_table: { url: U('round_dining_table') },
  // Third Poly Haven CC0 batch (v1.0.36).
  accent_chair: { url: U('accent_chair') },
  rocking_chair: { url: U('rocking_chair') },
  round_coffee_table: { url: U('round_coffee_table') },
  tall_side_table: { url: U('tall_side_table') },
  accent_table: { url: U('accent_table') },
  modern_sofa: { url: U('modern_sofa') },
  display_cabinet: { url: U('display_cabinet') },
  sideboard: { url: U('sideboard') },
  worn_bookshelf: { url: U('worn_bookshelf') },
  tea_table: { url: U('tea_table') },
  wooden_dining_chair: { url: U('wooden_dining_chair') },
  bar_chair: { url: U('bar_chair') },
  wooden_stool: { url: U('wooden_stool') },
  metal_stool: { url: U('metal_stool') },
  chest_of_drawers: { url: U('chest_of_drawers') },
  day_bed: { url: U('day_bed') },
  metal_desk: { url: U('metal_desk') },
  throw_pillows: { url: U('throw_pillows') },
  clay_planter: { url: U('clay_planter') },
  picnic_table: { url: U('picnic_table') },
  // Kenney CC0 Furniture Kit — kitchen items Poly Haven lacks + modular units.
  fridge: { url: U('fridge') },
  kitchen_sink: { url: U('kitchen_sink') },
  kitchen_base_cabinet: { url: U('kitchen_base_cabinet') },
  kitchen_drawer_cabinet: { url: U('kitchen_drawer_cabinet') },
  kitchen_corner_cabinet: { url: U('kitchen_corner_cabinet') },
  wall_cabinet: { url: U('wall_cabinet') },
  // NB: no pendant/tv model — the fitter rests bases on the floor, which is
  // wrong for hanging lights, and the procedural TV (emissive screen at stand
  // height) reads better than a flat panel lying on the ground.
};

export function modelDefinition(type: string): { url: string; yaw?: number } | undefined {
  return CATALOG_BY_TYPE[type]?.model ?? FURNITURE_MODELS[type];
}

export function hasModel(type: string): boolean {
  return !!modelDefinition(type);
}

/**
 * Renders a real glTF model normalized to the item's footprint: uniformly
 * scaled to fit width×depth (aspect preserved), recentred, and dropped so its
 * base sits on the floor. The parent group owns world position + rotation.
 */
export default function GltfFurniture({ item }: { item: FurnitureItem }) {
  const def = modelDefinition(item.type)!;
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

class ModelBoundary extends Component<
  { resetKey: string; fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidUpdate(previous: Readonly<{ resetKey: string }>) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) {
      this.setState({ failed: false });
    }
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** Load a bundled or R2 model without allowing a missing/corrupt cloud object
 * to take down the whole 3D view. The procedural representation stays usable
 * while loading and becomes the permanent fallback on error. */
export function ResilientGltfFurniture({
  item,
  fallback,
}: {
  item: FurnitureItem;
  fallback: ReactNode;
}) {
  const definition = modelDefinition(item.type);
  if (!definition) return fallback;
  return (
    <ModelBoundary resetKey={definition.url} fallback={fallback}>
      <Suspense fallback={fallback}>
        <GltfFurniture item={item} />
      </Suspense>
    </ModelBoundary>
  );
}

// Deliberately do not preload a fixed "common" set here. Importing this module
// happens both when the main 3D scene opens and when the first catalog preview
// opens; eager preloads made either action decode models the current design did
// not use. Each mounted GltfFurniture still loads and caches its own URL, so
// duplicate objects share the normal useGLTF cache without front-loading I/O.
