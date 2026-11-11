import { Component, Suspense, useEffect, useMemo, type ReactNode } from 'react';
import { useGLTF } from '@react-three/drei';
import { invalidate } from '@react-three/fiber';
import * as THREE from 'three';
import type { FurnitureItem } from '../../types';
import { MATERIAL_BY_ID, materialUrl, type Material } from '../../data/materials';
import {
  FITTING_SIZE, KITCHEN_UNIT_BY_TYPE, layoutKey, unitLayout, worktopId,
  type BoxPart, type FittingId, type FittingPart, type UnitLayout,
} from '../../lib/kitchenUnits';

/**
 * The one renderer behind every modular kitchen unit (see lib/kitchenUnits).
 * A unit is at most three meshes plus its fittings:
 *
 *  - body: plinth, carcass and fronts merged into one geometry. The material
 *    carries the item's colour and the vertex colours tone it per part, so a
 *    run of identical units shares one geometry and one material.
 *  - handles: every bar and post merged, one shared metal material.
 *  - worktop: the slab, textured at real-world scale with UVs taken from the
 *    unit's place in the plan, so the pattern runs through neighbouring units.
 *
 * Nothing here runs per frame.
 */

// ---- geometry ---------------------------------------------------------------

// Per face: normal, then the four corners as signs of (x, y, z) half-extents.
const FACES: { n: [number, number, number]; c: [number, number, number][] }[] = [
  { n: [1, 0, 0], c: [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]] },
  { n: [-1, 0, 0], c: [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]] },
  { n: [0, 1, 0], c: [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]] },
  { n: [0, -1, 0], c: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]] },
  { n: [0, 0, 1], c: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] },
  { n: [0, 0, -1], c: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]] },
];

/**
 * Merge boxes into one indexed geometry. `uv` gives the worktop its plan-space
 * UVs: `ox`/`oz` are the unit centre along its own x/z axes (metres), `scale`
 * is the size one texture tile covers, and `turn` lays the image's Y along
 * the run (for images whose grain runs down them).
 */
function boxesGeometry(
  parts: BoxPart[],
  uv?: { ox: number; oz: number; scale: number; turn: boolean },
): THREE.BufferGeometry {
  const n = parts.length * 24;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const col = uv ? null : new Float32Array(n * 3);
  const uvs = uv ? new Float32Array(n * 2) : null;
  const idx: number[] = [];
  let v = 0;
  for (const p of parts) {
    for (const f of FACES) {
      const base = v;
      for (const c of f.c) {
        const x = p.x + (c[0] * p.w) / 2;
        const y = p.y + (c[1] * p.h) / 2;
        const z = p.z + (c[2] * p.d) / 2;
        pos.set([x, y, z], v * 3);
        nor.set(f.n, v * 3);
        if (col) col.set([p.tone, p.tone, p.tone], v * 3);
        if (uvs && uv) {
          // Top and bottom read the plan; edges run the pattern along the edge.
          const u = f.n[0] !== 0 ? uv.oz + z : uv.ox + x;
          const w = f.n[1] !== 0 ? uv.oz + z : y;
          uvs.set(uv.turn ? [w / uv.scale, u / uv.scale] : [u / uv.scale, w / uv.scale], v * 2);
        }
        v++;
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  if (col) geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (uvs) geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return geo;
}

interface Built {
  layout: UnitLayout;
  body: THREE.BufferGeometry | null;
  handles: THREE.BufferGeometry | null;
}

// Layouts and their merged geometry, shared by every unit of the same kind and
// size. A handful of entries in practice (unit widths are standard); capped so
// a long resize drag cannot grow it without bound.
const built = new Map<string, Built>();
function buildUnit(item: FurnitureItem, w: number, d: number, h: number): Built {
  const def = KITCHEN_UNIT_BY_TYPE[item.type];
  const handles = item.handles ?? 'bar';
  const key = layoutKey(def.kind, w, d, h, handles);
  const hit = built.get(key);
  if (hit) return hit;
  if (built.size > 160) {
    for (const b of built.values()) {
      b.body?.dispose();
      b.handles?.dispose();
    }
    built.clear();
  }
  const layout = unitLayout(def.kind, w, d, h, handles);
  const made: Built = {
    layout,
    body: layout.body.length ? boxesGeometry(layout.body) : null,
    handles: layout.handles.length ? boxesGeometry(layout.handles) : null,
  };
  built.set(key, made);
  return made;
}

// ---- materials --------------------------------------------------------------

const frontMaterials = new Map<string, THREE.MeshStandardMaterial>();
function frontMaterial(color: string): THREE.MeshStandardMaterial {
  let m = frontMaterials.get(color);
  if (!m) {
    if (frontMaterials.size > 96) frontMaterials.clear(); // colour-picker drags
    m = new THREE.MeshStandardMaterial({ color, vertexColors: true, roughness: 0.55, metalness: 0.04 });
    frontMaterials.set(color, m);
  }
  return m;
}

let handleMat: THREE.MeshStandardMaterial | null = null;
const handleMaterial = () =>
  (handleMat ??= new THREE.MeshStandardMaterial({ color: '#b7bbc0', roughness: 0.3, metalness: 0.85 }));

const worktopMaterials = new Map<string, THREE.MeshStandardMaterial>();
/**
 * One material per worktop finish. It starts as the library's flat colour and
 * takes the texture once the image has loaded; a missing or broken image just
 * leaves the flat colour in place.
 */
function worktopMaterialFor(mat: Material): THREE.MeshStandardMaterial {
  const hit = worktopMaterials.get(mat.id);
  if (hit) return hit;
  const m = new THREE.MeshStandardMaterial({ color: mat.color, roughness: mat.roughness, metalness: mat.metalness });
  worktopMaterials.set(mat.id, m);
  if (typeof Image !== 'undefined') {
    const img = new Image();
    img.onload = () => {
      const tex = new THREE.Texture(img);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.anisotropy = 8;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.needsUpdate = true;
      m.map = tex;
      m.color.set('#ffffff');
      m.needsUpdate = true;
      invalidate(); // the viewer renders on demand
    };
    img.src = materialUrl(mat.id);
  }
  return m;
}

// ---- fittings ---------------------------------------------------------------

const fittingUrl = (id: FittingId) => `${import.meta.env.BASE_URL}models/kitchen/${id}.glb`;

function FittingModel({ id }: { id: FittingId }) {
  const { scene } = useGLTF(fittingUrl(id));
  const node = useMemo(() => {
    const clone = scene.clone(true); // shares geometry and the authored materials
    clone.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    return clone;
  }, [scene]);
  return <primitive object={node} />;
}

// Less metallic than the real fittings: a flat mirror-like box can catch a
// dark patch of the environment and read as black.
const STEEL = { color: '#a4a8ad', roughness: 0.45, metalness: 0.35 };
const DARK = { color: '#141416', roughness: 0.3, metalness: 0.2 };

/** Plain stand-in drawn while a fitting loads, and for good if its file is
 *  missing: the right size and place, none of the detail. */
function StandIn({ id }: { id: FittingId }) {
  const [w, h, d] = FITTING_SIZE[id];
  switch (id) {
    case 'tap':
      return (
        <group>
          <mesh position={[0, h / 2, 0]}>
            <cylinderGeometry args={[0.014, 0.018, h, 10]} />
            <meshStandardMaterial {...STEEL} />
          </mesh>
          <mesh position={[0, h - 0.02, 0.09]}>
            <boxGeometry args={[0.02, 0.02, 0.2]} />
            <meshStandardMaterial {...STEEL} />
          </mesh>
        </group>
      );
    case 'sink_bowl':
      return (
        <group>
          <mesh position={[0, -h + 0.005, 0]}>
            <boxGeometry args={[w - 0.06, 0.01, d - 0.06]} />
            <meshStandardMaterial {...STEEL} />
          </mesh>
          {([[-1, 0], [1, 0], [0, -1], [0, 1]] as const).map(([sx, sz], i) => (
            <mesh key={i} position={[sx * (w / 2 - 0.02), -h / 2 + 0.002, sz * (d / 2 - 0.02)]}>
              <boxGeometry args={[sx ? 0.04 : w, h + 0.004, sz ? 0.04 : d]} />
              <meshStandardMaterial {...STEEL} />
            </mesh>
          ))}
        </group>
      );
    case 'hob_induction':
    case 'hob_gas':
      return (
        <mesh position={[0, 0.004, 0]}>
          <boxGeometry args={[w, 0.008, d]} />
          <meshStandardMaterial {...(id === 'hob_gas' ? STEEL : DARK)} />
        </mesh>
      );
    case 'oven_front':
    case 'microwave_front':
      return (
        <group>
          <mesh position={[0, h / 2, 0.011]}>
            <boxGeometry args={[w, h, 0.022]} />
            <meshStandardMaterial {...DARK} />
          </mesh>
          <mesh position={[0, h * 0.82, 0.045]}>
            <boxGeometry args={[w * 0.75, 0.014, 0.014]} />
            <meshStandardMaterial {...STEEL} />
          </mesh>
        </group>
      );
    case 'hood':
      return (
        <group>
          <mesh position={[0, 0.03, 0]}>
            <boxGeometry args={[w, 0.06, d]} />
            <meshStandardMaterial {...STEEL} />
          </mesh>
          <mesh position={[0, (h + 0.06) / 2, -d / 2 + 0.14]}>
            <boxGeometry args={[0.3, h - 0.06, 0.28]} />
            <meshStandardMaterial {...STEEL} />
          </mesh>
        </group>
      );
  }
}

class FittingBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    // A missing fitting is expected to be survivable: the stand-in stays.
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function Fitting({ part }: { part: FittingPart }) {
  const standIn = <StandIn id={part.id} />;
  return (
    <group position={[part.x, part.y, part.z]} scale={part.s}>
      <FittingBoundary fallback={standIn}>
        <Suspense fallback={standIn}>
          <FittingModel id={part.id} />
        </Suspense>
      </FittingBoundary>
    </group>
  );
}

// ---- the unit ---------------------------------------------------------------

export default function KitchenUnit3D({
  item, w, d, h,
}: {
  item: FurnitureItem;
  /** Slot size in metres. */
  w: number; d: number; h: number;
}) {
  const { layout, body, handles } = buildUnit(item, w, d, h);
  const mat = MATERIAL_BY_ID[worktopId(item)];
  const rad = (item.rotation * Math.PI) / 180;
  const px = item.position.x * 0.01;
  const pz = item.position.y * 0.01;
  // The unit centre along its own axes: units in one run share the frame, so
  // their slabs sample one continuous sheet of the material, laid along the run.
  const ox = px * Math.cos(rad) + pz * Math.sin(rad);
  const oz = -px * Math.sin(rad) + pz * Math.cos(rad);
  const scale = mat.scaleCm * 0.01;
  const turn = !!mat.grainY;
  const worktop = useMemo(
    () => (layout.worktop.length ? boxesGeometry(layout.worktop, { ox, oz, scale, turn }) : null),
    [layout, ox, oz, scale, turn],
  );
  useEffect(() => () => worktop?.dispose(), [worktop]);
  // Where two runs meet at a corner their slabs overlap by the front overhang.
  // Runs a quarter turn apart sit a millimetre apart in height, so the two
  // (differently oriented) surfaces never fight over the same pixels.
  const lift = Math.abs(Math.round(item.rotation / 90)) % 2 === 1 ? 0.001 : 0;

  return (
    <group>
      {body && <mesh geometry={body} material={frontMaterial(item.color)} castShadow receiveShadow />}
      {handles && <mesh geometry={handles} material={handleMaterial()} castShadow />}
      {worktop && (
        <mesh geometry={worktop} material={worktopMaterialFor(mat)} position={[0, lift, 0]} castShadow receiveShadow />
      )}
      {layout.fittings.map((part, i) => (
        <group key={`${part.id}${i}`} position={[0, part.y >= h - 1e-6 ? lift : 0, 0]}>
          <Fitting part={part} />
        </group>
      ))}
    </group>
  );
}
