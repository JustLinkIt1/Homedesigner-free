import { Component, Suspense, useMemo, type ReactNode } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { FurnitureItem } from '../../types';
import { CATALOG_BY_TYPE, type CatalogEntry } from '../../data/furnitureCatalog';
import { MODEL_FILE, MODEL_YAW, MODEL_FIT } from '../../data/furnitureModels';

const M = 0.01; // cm -> m

/**
 * Manifest of real glTF furniture models, keyed by catalog type. Only types
 * listed here load a model; everything else uses the procedural mesh. Models
 * live in /public/models and are fetched lazily (their own network request),
 * so they never weigh down the initial bundle. `yaw` corrects a model whose
 * "front" doesn't face +Z. Drop in a new pack by adding entries here.
 */
const U = (f: string) => `${import.meta.env.BASE_URL}models/${f}.glb`;

// Built from the shared MODEL_FILE map (src/data/furnitureModels.ts) so the 3D
// viewer and the 2D top-down sprites always load the same glTF per type.
// NB: no pendant/tv model — the fitter rests bases on the floor, which is wrong
// for hanging lights, and the procedural TV reads better than a flat panel.
export const FURNITURE_MODELS: Record<
  string,
  { url: string; yaw?: number; fit?: 'contain' | 'width' | 'depth' | 'stretch' }
> = Object.fromEntries(
  Object.entries(MODEL_FILE).map(([type, file]) => [
    type,
    { url: U(file), yaw: MODEL_YAW[type], fit: MODEL_FIT[type] },
  ]),
);

export function modelDefinition(type: string): NonNullable<CatalogEntry['model']> | undefined {
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

    const sx = (item.width * M) / (size.x || 1);
    const sz = (item.depth * M) / (size.z || 1);
    if (def.fit === 'stretch') {
      // Fill width×depth×height independently — for boxy cabinetry whose model
      // is authored at the wrong size, so it reaches true counter/upper height.
      const sy = (item.height * M) / (size.y || 1);
      clone.scale.set(sx, sy, sz);
      clone.position.set(
        -center.x * sx,
        -box.min.y * sy + (def.offsetY ?? 0) * M,
        -center.z * sz,
      );
    } else {
      // Uniform scale fitting both footprint dimensions (keeps proportions).
      const scale = def.fit === 'width' ? sx : def.fit === 'depth' ? sz : Math.min(sx, sz);
      clone.scale.setScalar(scale);
      // Recentre horizontally and rest the base on y = 0.
      clone.position.set(
        -center.x * scale,
        -box.min.y * scale + (def.offsetY ?? 0) * M,
        -center.z * scale,
      );
    }

    clone.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    return clone;
  }, [scene, item.width, item.depth, item.height, def.fit, def.offsetY]);

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
