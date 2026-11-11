import { useEffect, useLayoutEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useDesign } from '../../store/designStore';
import { isFence } from '../../lib/fence';
import { sunModel } from '../../lib/sun';

/**
 * Shadow stand-ins for the Battery saver tier (no shadow maps, no post), which
 * is what the Android app runs by default. Nothing here adds a render pass or
 * a per-frame cost beyond a few alpha-blended quads:
 *
 *  - SunShade: the walls' cast shadows, drawn on the CPU into one small canvas
 *    whenever the plan or the time of day changes, shown on a single quad.
 *  - ItemShade: one soft quad under a piece of furniture or a tree, leaning
 *    away from the sun. It lives inside the item's group so it follows a drag.
 */

const M = 0.01; // cm -> m
const BAKE_PX = 512;
/** Hover just above floors and rugs so neither hides the shadow lying on it. */
const SHADE_Y = 0.02;
const SHADE_TINT = '#0a1020';

type Vec2 = [number, number];

/** Ground offset of a shadow per metre of caster height, capped so a sun on
 *  the horizon cannot stretch a shadow across the whole site. */
function shadowSlope(dir: [number, number, number], cap: number): Vec2 {
  const y = Math.max(0.05, dir[1]);
  let x = -dir[0] / y;
  let z = -dir[2] / y;
  const len = Math.hypot(x, z);
  if (len > cap) {
    x *= cap / len;
    z *= cap / len;
  }
  return [x, z];
}

/** Convex hull (monotone chain). Shadows of convex prisms are hulls. */
function hull(pts: Vec2[]): Vec2[] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Vec2, a: Vec2, b: Vec2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Vec2[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: Vec2[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/**
 * Sun shadows of the building on the ground and the ground-floor rooms.
 *
 * Each wall's shadow is the hull of its footprint and that footprint slid
 * along the sun's ground direction, so the union painted here is exactly what
 * a shadow map would give for the walls (openings aside). Painting into a 2D
 * canvas makes the union free: overlapping shadows cannot darken twice, which
 * separate blended quads would.
 */
export function SunShade({
  center,
  radius,
  dir,
  strength,
}: {
  center: [number, number, number];
  radius: number;
  /** Direction to the light (sunModel().dir). */
  dir: [number, number, number];
  strength: number;
}) {
  const floors = useDesign((s) => s.floors);
  const floorGeom = useDesign((s) => s.floorGeom);
  const activeFloorId = useDesign((s) => s.activeFloorId);
  const dollhouse = useDesign((s) => s.dollhouse);
  const walkMode = useDesign((s) => s.walkMode);
  const invalidate = useThree((s) => s.invalidate);

  const bake = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = BAKE_PX;
    const scratch = document.createElement('canvas');
    scratch.width = scratch.height = BAKE_PX;
    const tex = new THREE.CanvasTexture(canvas);
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    return { canvas, scratch, tex };
  }, []);
  useEffect(() => () => bake.tex.dispose(), [bake]);

  const half = radius * 1.5;
  const [cx, , cz] = center;
  const [dx, dy, dz] = dir;

  useLayoutEffect(() => {
    const N = BAKE_PX;
    const s = bake.scratch.getContext('2d');
    const out = bake.canvas.getContext('2d');
    if (!s || !out) return;
    const [sx, sz] = shadowSlope([dx, dy, dz], 6);
    const px = (x: number) => ((x - cx) / (2 * half) + 0.5) * N;
    const py = (z: number) => ((z - cz) / (2 * half) + 0.5) * N;
    const pxPerM = N / (2 * half);
    const trace = (pts: Vec2[]) => {
      s.beginPath();
      pts.forEach(([x, z], i) => (i ? s.lineTo(px(x), py(z)) : s.moveTo(px(x), py(z))));
      s.closePath();
    };

    s.globalCompositeOperation = 'source-over';
    s.clearRect(0, 0, N, N);
    s.fillStyle = '#fff';
    s.strokeStyle = '#fff';
    s.lineJoin = 'round';

    // Same visibility rules as DesignScene: the cutaway hides storeys above
    // the active one, and only the active storey is opened up.
    const cutaway = dollhouse && !walkMode;
    const activeElevation = floors.find((f) => f.id === activeFloorId)?.elevation ?? 0;
    const visible = cutaway ? floors.filter((f) => f.elevation <= activeElevation) : floors;
    const top = Math.max(0, ...visible.map((f) => f.elevation));
    let groundClosed = false;

    for (const f of visible) {
      const g = floorGeom[f.id];
      if (!g) continue;
      const base = f.elevation * M;
      let wallTop = 0;
      for (const w of g.walls) {
        if (isFence(w)) continue; // slats and rails: too thin to read as shade
        const ax = w.start.x * M;
        const az = w.start.y * M;
        const bx = w.end.x * M;
        const bz = w.end.y * M;
        const len = Math.hypot(bx - ax, bz - az);
        if (len < 1e-4) continue;
        const t = (w.thickness * M) / 2;
        const ux = ((bx - ax) / len) * t;
        const uz = ((bz - az) / len) * t;
        const foot: Vec2[] = [
          [ax - ux - uz, az - uz + ux],
          [ax - ux + uz, az - uz - ux],
          [bx + ux + uz, bz + uz - ux],
          [bx + ux - uz, bz + uz + ux],
        ];
        const h0 = base;
        const h1 = base + w.height * M;
        wallTop = Math.max(wallTop, w.height * M);
        trace(hull([
          ...foot.map(([x, z]): Vec2 => [x + sx * h0, z + sz * h0]),
          ...foot.map(([x, z]): Vec2 => [x + sx * h1, z + sz * h1]),
        ]));
        s.fill();
      }
      const indoor = g.rooms.filter((r) => !r.outdoor && r.points.length >= 3);
      const open = cutaway && f.id === activeFloorId;
      // Whatever closes a storey from above also shades the ground: the slab
      // under an upper storey, and the ceiling or roof over a closed top one.
      const lids: { h: number; grow: number }[] = [];
      if (f.elevation > 0) lids.push({ h: base, grow: 0.1 });
      if (!open && (f.roof || f.elevation >= top)) {
        lids.push({ h: base + (wallTop || 2.7), grow: f.roof ? f.roof.overhang * M + 0.15 : 0.1 });
      }
      for (const lid of lids) {
        s.lineWidth = lid.grow * 2 * pxPerM;
        for (const r of indoor) {
          trace(r.points.map((p): Vec2 => [p.x * M + sx * lid.h, p.y * M + sz * lid.h]));
          s.fill();
          s.stroke();
        }
      }
      if (f.elevation === 0 && !open) groundClosed = true;
    }

    // A closed ground storey keeps its rooms as they were (evenly lit): on
    // this tier nothing else indoors is shaded, so a dark floor alone under a
    // roof would just read as a murky room.
    if (groundClosed) {
      s.globalCompositeOperation = 'destination-out';
      for (const f of visible) {
        if (f.elevation !== 0) continue;
        for (const r of floorGeom[f.id]?.rooms ?? []) {
          if (r.outdoor || r.points.length < 3) continue;
          trace(r.points.map((p): Vec2 => [p.x * M, p.y * M]));
          s.fill();
        }
      }
      s.globalCompositeOperation = 'source-over';
    }

    // Soften, then fade toward the border so a long evening shadow runs out
    // instead of stopping at the edge of the quad.
    out.globalCompositeOperation = 'source-over';
    out.clearRect(0, 0, N, N);
    out.filter = `blur(${Math.max(1, 0.11 * pxPerM).toFixed(1)}px)`;
    out.drawImage(bake.scratch, 0, 0);
    out.filter = 'none';
    out.globalCompositeOperation = 'destination-in';
    const fade = out.createRadialGradient(N / 2, N / 2, N * 0.34, N / 2, N / 2, N * 0.5);
    fade.addColorStop(0, 'rgba(0,0,0,1)');
    fade.addColorStop(1, 'rgba(0,0,0,0)');
    out.fillStyle = fade;
    out.fillRect(0, 0, N, N);
    out.globalCompositeOperation = 'source-over';

    bake.tex.needsUpdate = true;
    invalidate();
  }, [bake, floors, floorGeom, activeFloorId, dollhouse, walkMode, cx, cz, half, dx, dy, dz, invalidate]);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, SHADE_Y, cz]} renderOrder={-1} raycast={NO_RAYCAST}>
      <planeGeometry args={[half * 2, half * 2]} />
      <meshBasicMaterial map={bake.tex} color={SHADE_TINT} transparent opacity={strength} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

const NO_RAYCAST = () => null;

/** How deep a cast shadow on the ground is, 0..1: the share of the ground's
 *  light that comes from the key light. Full under a high sun, faint by
 *  moonlight, and fading as the sun drops (a low sun barely lights the ground,
 *  so there is little for a shadow to take away, however long it is). */
export function shadeStrength(sunIntensity: number, sunHeight: number): number {
  return Math.min(1, sunIntensity / 1.8) * Math.min(1, Math.max(0, sunHeight) / 0.6);
}

let flatQuad: THREE.PlaneGeometry | null = null;
/** Unit quad lying on the floor; meshes scale it on x/z. */
function floorQuad(): THREE.PlaneGeometry {
  if (!flatQuad) {
    flatQuad = new THREE.PlaneGeometry(1, 1);
    flatQuad.rotateX(-Math.PI / 2);
  }
  return flatQuad;
}

const blobs = new Map<string, THREE.CanvasTexture>();
/** Alpha masks for the item shadows: a soft-edged rectangle and a soft disc. */
function blobTexture(kind: 'rect' | 'disc'): THREE.CanvasTexture {
  const hit = blobs.get(kind);
  if (hit) return hit;
  const N = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = N;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(N, N);
  const smooth = (v: number) => {
    const t = Math.max(0, Math.min(1, v));
    return t * t * (3 - 2 * t);
  };
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = Math.abs((x + 0.5) / N - 0.5) * 2; // 0 centre .. 1 edge
      const v = Math.abs((y + 0.5) / N - 0.5) * 2;
      const a =
        kind === 'rect'
          ? smooth((1 - u) / 0.34) * smooth((1 - v) / 0.34)
          : smooth((1 - Math.hypot(u, v)) / 0.55);
      const i = (y * N + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  blobs.set(kind, tex);
  return tex;
}

/**
 * Soft shadow under one floor-standing item, in the item's own (rotated)
 * frame. `canopy` marks a tree: its shadow is the crown's, thrown clear of the
 * trunk, rather than a box's.
 */
export function ItemShade({
  w,
  d,
  h,
  rotationDeg,
  canopy,
}: {
  w: number;
  d: number;
  h: number;
  /** The item's plan rotation, to turn the sun into its local frame. */
  rotationDeg: number;
  canopy?: { height: number; radius: number };
}) {
  const sunTime = useDesign((s) => s.sunTime);
  const sun = sunModel(sunTime);
  const k = shadeStrength(sun.sunIntensity, sun.dir[1]);
  // World ground offset per metre of height, turned into the group's frame
  // (the group is rotated by -rotationDeg about Y).
  const [wx, wz] = shadowSlope(sun.dir, canopy ? 2.4 : 1.6);
  const th = (-rotationDeg * Math.PI) / 180;
  const lx = wx * Math.cos(th) - wz * Math.sin(th);
  const lz = wx * Math.sin(th) + wz * Math.cos(th);
  const mat = (kind: 'rect' | 'disc', opacity: number) => (
    <meshBasicMaterial
      map={blobTexture(kind)}
      color={SHADE_TINT}
      transparent
      opacity={opacity}
      depthWrite={false}
      toneMapped={false}
      polygonOffset
      polygonOffsetFactor={-1}
      polygonOffsetUnits={-1}
    />
  );

  if (canopy) {
    const ox = lx * canopy.height;
    const oz = lz * canopy.height;
    const reach = Math.hypot(ox, oz);
    const yaw = -Math.atan2(oz, ox);
    // A ball's shadow stretches along the light as the sun drops.
    const stretch = Math.min(1.9, 1 / Math.max(0.3, sun.dir[1]));
    const size = canopy.radius * 2.5;
    return (
      <group position={[0, SHADE_Y + 0.002, 0]}>
        <mesh geometry={floorQuad()} position={[ox, 0, oz]} rotation={[0, yaw, 0]} scale={[size * stretch, 1, size]} raycast={NO_RAYCAST}>
          {mat('disc', 0.06 + 0.5 * k)}
        </mesh>
        {reach > canopy.radius * 0.5 && (
          <mesh geometry={floorQuad()} position={[ox / 2, 0, oz / 2]} rotation={[0, yaw, 0]} scale={[reach + w * 0.2, 1, w * 0.26]} raycast={NO_RAYCAST}>
            {mat('rect', 0.04 + 0.4 * k)}
          </mesh>
        )}
      </group>
    );
  }

  // Bounding quad of the footprint swept along the shadow: the soft mask
  // rounds the two corners a true hexagon would not have. Unlike the cast
  // shadows above it keeps a floor of opacity at any hour: that part is the
  // contact shade under the item, which lamps and dusk light leave in place.
  const lift = Math.min(h, 1.5);
  const ox = lx * lift;
  const oz = lz * lift;
  const pad = 0.1 + 0.1 * Math.min(1, h);
  return (
    <mesh
      geometry={floorQuad()}
      position={[ox / 2, SHADE_Y + 0.002, oz / 2]}
      scale={[w + Math.abs(ox) + pad * 2, 1, d + Math.abs(oz) + pad * 2]}
      raycast={NO_RAYCAST}
    >
      {mat('rect', 0.18 + 0.26 * k)}
    </mesh>
  );
}
