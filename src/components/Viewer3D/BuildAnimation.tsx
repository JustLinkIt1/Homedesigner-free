import { useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useProgress } from '@react-three/drei';
import * as THREE from 'three';
import { useDesign } from '../../store/designStore';
import type { BackgroundPlan, FloorInfo } from '../../types';
import {
  buildTimeline, partPose, planOpacity,
  type BuildSceneDesc, type BuildTimeline, type PartKind,
} from '../../lib/buildTimeline';

/** cm -> m, matching DesignScene's M. */
const M = 0.01;
/** Most time to wait for furniture models and textures still downloading. */
const LOAD_WAIT_MS = 1000;
/** Give up quietly if DesignScene's storeys never show up. */
const FIND_WAIT_MS = 3000;

export interface BuildPart {
  obj: THREE.Object3D;
  kind: PartKind;
  storey: number;
  index: number;
  /** The object's own resting values, put back exactly at the end. */
  y: number;
  visible: boolean;
}

/**
 * The parts to animate are DesignScene's labelled groups (see FloorContent):
 * each `storey` sits directly under the scene, and inside it each wall and
 * each furniture item is one child of `walls` / `furniture`. Floors with
 * slabs, ceilings and the roof move as whole groups. Doors and windows are
 * inside their wall, so they ride with it.
 */
function collectParts(scene: THREE.Scene): { parts: BuildPart[]; desc: BuildSceneDesc } | null {
  const storeys = scene.children.filter((o) => o.name === 'storey').sort((a, b) => a.position.y - b.position.y);
  if (!storeys.length) return null;
  const parts: BuildPart[] = [];
  const add = (obj: THREE.Object3D | undefined, kind: PartKind, storey: number, index: number) => {
    if (obj) parts.push({ obj, kind, storey, index, y: obj.position.y, visible: obj.visible });
  };
  const storeyCounts = storeys.map((s, si) => {
    const group = (name: string) => s.children.find((c) => c.name === name);
    const count = (name: string) => group(name)?.children.length ?? 0;
    add(group('floors'), 'floors', si, 0);
    add(group('slabs'), 'floors', si, 0);
    group('walls')?.children.forEach((w, i) => add(w, 'wall', si, i));
    add(group('ceilings'), 'ceilings', si, 0);
    group('furniture')?.children.forEach((f, i) => add(f, 'furniture', si, i));
    add(group('roof'), 'roof', si, 0);
    return {
      floors: count('floors') + count('slabs'),
      walls: count('walls'),
      ceilings: count('ceilings'),
      furniture: count('furniture'),
      roofs: count('roof'),
    };
  });
  return { parts, desc: { storeys: storeyCounts } };
}

/**
 * Puts every part where the timeline says it is at `t` ms. This is the whole
 * per-frame effect of the animation, and the hook a recorder would drive with
 * its own frame clock. At t >= duration every part is back at exactly its
 * own resting values.
 */
export function applyBuildFrame(parts: BuildPart[], tl: BuildTimeline, t: number): void {
  for (const p of parts) {
    const pose = partPose(tl, p.kind, p.storey, p.index, t);
    p.obj.position.y = p.y + pose.dy;
    p.obj.visible = p.visible && pose.visible;
  }
}

/** The imported plan, downscaled to at most `maxPx` a side before it goes to the GPU. */
function usePlanTexture(src: string | undefined, maxPx: number): THREE.Texture | null {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    if (!src) return;
    let live = true;
    let made: THREE.Texture | null = null;
    const img = new Image();
    img.onload = () => {
      if (!live || !img.naturalWidth || !img.naturalHeight) return;
      const k = Math.min(1, maxPx / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.naturalWidth * k));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * k));
      canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
      made = new THREE.CanvasTexture(canvas);
      made.colorSpace = THREE.SRGBColorSpace;
      setTexture(made);
    };
    img.src = src;
    return () => {
      live = false;
      made?.dispose();
    };
  }, [src, maxPx]);
  return texture;
}

const lowest = (floors: FloorInfo[]): FloorInfo | undefined =>
  floors.reduce<FloorInfo | undefined>((lo, f) => (!lo || f.elevation < lo.elevation ? f : lo), undefined);

/**
 * The plan lying on the ground, placed as the 2D editor draws it: its top-left
 * corner at (x, y), turned `rotation` degrees about that corner, `scale` cm per
 * image pixel. A hair below the floors, a hair above the lawn.
 */
function PlanUnderlay({ plan, elevation, maxPx, materialRef }: {
  plan: BackgroundPlan;
  elevation: number;
  maxPx: number;
  materialRef: React.RefObject<THREE.MeshBasicMaterial>;
}) {
  const texture = usePlanTexture(plan.src, maxPx);
  const w = plan.imgWidth * plan.scale * M;
  const h = plan.imgHeight * plan.scale * M;
  if (!texture || !(w > 0) || !(h > 0)) return null;
  return (
    <group position={[plan.x * M, elevation * M - 0.005, plan.y * M]} rotation={[0, (-plan.rotation * Math.PI) / 180, 0]}>
      <mesh position={[w / 2, 0, h / 2]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={-1}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial
          ref={materialRef}
          map={texture}
          transparent
          opacity={0}
          depthWrite={false}
          toneMapped={false}
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-1}
        />
      </mesh>
    </group>
  );
}

/**
 * "Watch your plan build itself". Mounted only while it plays: it moves the
 * existing wall/furniture/floor objects through refs from one useFrame (no
 * React state per frame, nothing re-mounted or rebuilt), puts every one of
 * them back exactly at the end, and then unmounts, so afterwards it costs
 * nothing per frame. `finishRef` jumps to the end at once (a tap, a capture).
 */
export default function BuildAnimation({ lite, finishRef, onDone }: {
  lite: boolean;
  finishRef: React.MutableRefObject<(() => void) | null>;
  onDone: () => void;
}) {
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);
  const ground = useDesign((s) => lowest(s.floors));
  const plan = useDesign((s) => (ground ? s.floorGeom[ground.id]?.background ?? null : null));
  const planMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const planGroup = useRef<THREE.Group>(null);
  const run = useRef<{ parts: BuildPart[]; tl: BuildTimeline; foundAt: number; start: number | null } | null>(null);
  const mountedAt = useRef(performance.now());
  const done = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  /** Every part back at exactly its own resting values. Safe to repeat. */
  const restore = () => {
    for (const p of run.current?.parts ?? []) {
      p.obj.position.y = p.y;
      p.obj.visible = p.visible;
    }
    // A tap that skips lands in the same event: raycasts must see the walls
    // where they now are, not where the last frame drew them.
    scene.updateMatrixWorld();
    invalidate();
  };
  const finish = () => {
    if (done.current) return;
    done.current = true;
    restore();
    // Gone from this very frame, so a capture right after never shows it.
    if (planGroup.current) planGroup.current.visible = false;
    onDoneRef.current();
  };
  const latest = useRef({ finish, restore });
  latest.current = { finish, restore };
  useEffect(() => {
    finishRef.current = () => latest.current.finish();
    // Unmounted early (walk mode, leaving 3D): never leave a half-built scene.
    return () => {
      finishRef.current = null;
      latest.current.restore();
    };
  }, [finishRef]);

  useFrame(() => {
    if (done.current) return;
    const now = performance.now();
    let r = run.current;
    if (!r) {
      const found = collectParts(scene);
      if (!found) {
        if (now - mountedAt.current > FIND_WAIT_MS) finish();
        else invalidate();
        return;
      }
      r = run.current = { ...found, tl: buildTimeline(found.desc, lite), foundAt: now, start: null };
    }
    // Hold everything off (the empty lawn) while models are still arriving, up
    // to LOAD_WAIT_MS, so furniture drops in as itself rather than as the
    // stand-in shape that a model replaces in place once it loads.
    if (r.start === null && (!useProgress.getState().active || now - r.foundAt > LOAD_WAIT_MS)) r.start = now;
    const t = r.start === null ? 0 : now - r.start;
    applyBuildFrame(r.parts, r.tl, t);
    if (planMaterial.current) planMaterial.current.opacity = planOpacity(r.tl, t);
    if (t >= r.tl.duration) finish();
    else invalidate();
  });

  return (
    <group ref={planGroup}>
      {plan && ground && <PlanUnderlay plan={plan} elevation={ground.elevation} maxPx={lite ? 1024 : 2048} materialRef={planMaterial} />}
    </group>
  );
}
