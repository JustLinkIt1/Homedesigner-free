import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useDesign } from '../../store/designStore';
import { FLOOR_BY_ID } from '../../data/furnitureCatalog';
import { getFloorTexture, FLOOR_ROUGHNESS, customTexture, paintedBoxGeometry } from '../../lib/textures';
import { dist, boundsOf } from '../../lib/geometry';
import Furniture3D from './Furniture3D';
import type { FloorGeom, Opening, Room, Wall } from '../../types';

export const M = 0.01; // cm -> m

interface Span {
  a: number; // start along wall (cm from start)
  b: number; // end (cm)
  y0: number; // bottom (cm)
  y1: number; // top (cm)
}

/** Solid wall pieces (full height between openings, sills, and headers). */
function wallSpans(wall: Wall, openings: Opening[]): Span[] {
  const len = dist(wall.start, wall.end);
  const t = wall.thickness;
  const H = wall.height;
  const ops = openings
    .map((o) => ({ ...o, s: Math.max(0, o.offset * len - o.width / 2), e: Math.min(len, o.offset * len + o.width / 2) }))
    .filter((o) => o.e > o.s)
    .sort((p, q) => p.s - q.s);

  const spans: Span[] = [];
  let cursor = 0;
  for (const o of ops) {
    if (o.s > cursor) spans.push({ a: cursor, b: o.s, y0: 0, y1: H });
    if (o.sill > 0) spans.push({ a: o.s, b: o.e, y0: 0, y1: o.sill }); // under window
    const headerBottom = o.sill + o.height;
    if (headerBottom < H) spans.push({ a: o.s, b: o.e, y0: headerBottom, y1: H }); // lintel
    cursor = Math.max(cursor, o.e);
  }
  if (cursor < len) spans.push({ a: cursor, b: len, y0: 0, y1: H });
  if (spans.length === 0) spans.push({ a: 0, b: len, y0: 0, y1: H });

  // Extend the outermost pieces by half a thickness so corners stay solid.
  for (const s of spans) {
    if (s.a <= 0.01) s.a = -t / 2;
    if (s.b >= len - 0.01) s.b = len + t / 2;
  }
  return spans;
}

/** Per-wall fade data shared with the single dollhouse useFrame loop. */
export interface WallFade {
  mat: THREE.MeshStandardMaterial;
  nx: number;
  nz: number;
  mx: number;
  mz: number;
}

/** Screen-space tap on a paintable surface (wall body or room floor). */
export type SurfaceTap = { kind: 'wall' | 'room'; id: string; x: number; y: number };

/** A single opaque wall body chunk. When the wall carries a custom paint
 *  image, we bake real-world UVs into the geometry so pattern scale is
 *  uniform across every span regardless of size. */
function WallSpan({
  position,
  material,
  spanW,
  spanH,
  thickness,
  textured,
}: {
  position: [number, number, number];
  material: THREE.MeshStandardMaterial;
  spanW: number;
  spanH: number;
  thickness: number;
  textured: boolean;
}) {
  const geometry = useMemo(
    () => (textured ? paintedBoxGeometry(spanW, spanH, thickness) : new THREE.BoxGeometry(spanW, spanH, thickness)),
    [textured, spanW, spanH, thickness],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh position={position} geometry={geometry} material={material} castShadow receiveShadow />;
}

function WallMesh({
  wall,
  openings,
  center,
  register,
  unregister,
  onTap,
}: {
  wall: Wall;
  openings: Opening[];
  center: [number, number, number];
  register: (id: string, f: WallFade) => void;
  unregister: (id: string) => void;
  onTap?: (tap: SurfaceTap) => void;
}) {
  const dxCm = wall.end.x - wall.start.x;
  const dzCm = wall.end.y - wall.start.y;
  const angleY = -Math.atan2(dzCm, dxCm);
  const t = wall.thickness * M;
  const mx = ((wall.start.x + wall.end.x) / 2) * M;
  const mz = ((wall.start.y + wall.end.y) / 2) * M;

  const spans = useMemo(() => wallSpans(wall, openings), [wall, openings]);

  // One material shared by every span of this wall (no per-span clones). When
  // the wall has a custom paint image, the material carries the map + the
  // per-span geometry has UVs baked in metres so pattern scale is uniform.
  const mat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.92, metalness: 0 });
    if (wall.texture) {
      const tex = customTexture(wall.texture.src);
      const patternM = Math.max(0.02, wall.texture.scaleCm * M);
      tex.repeat.set(1 / patternM, 1 / patternM);
      m.map = tex;
      m.roughness = wall.texture.roughness ?? 0.92;
      m.metalness = wall.texture.metalness ?? 0;
    } else {
      m.color = new THREE.Color(wall.color);
    }
    return m;
  }, [wall.color, wall.texture?.src, wall.texture?.scaleCm, wall.texture?.roughness, wall.texture?.metalness]); // eslint-disable-line react-hooks/exhaustive-deps

  // Outward-facing horizontal normal (points away from the building centre).
  const normal = useMemo(() => {
    let nx = -dzCm;
    let nz = dxCm;
    const l = Math.hypot(nx, nz) || 1;
    nx /= l;
    nz /= l;
    if (nx * (mx - center[0]) + nz * (mz - center[2]) < 0) {
      nx = -nx;
      nz = -nz;
    }
    return { nx, nz };
  }, [dxCm, dzCm, mx, mz, center]);

  // Planner-style cap on the cut top of the wall — reads as a floor-plan edge
  // from above and makes the dollhouse view look "rendered". A warm charcoal
  // (rather than a cold blue-grey) keeps the whole scene feeling inviting.
  // Registered with the fade loop so it disappears with its wall.
  const capMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#4a453e', roughness: 0.6, metalness: 0.04 }),
    [],
  );

  // Register fade data with the parent's single loop; dispose material on unmount.
  useEffect(() => {
    register(wall.id, { mat, nx: normal.nx, nz: normal.nz, mx, mz });
    register(`${wall.id}:cap`, { mat: capMat, nx: normal.nx, nz: normal.nz, mx, mz });
    return () => {
      unregister(wall.id);
      unregister(`${wall.id}:cap`);
      mat.dispose();
      capMat.dispose();
    };
  }, [wall.id, mat, capMat, normal, mx, mz, register, unregister]);

  return (
    <group
      position={[wall.start.x * M, 0, wall.start.y * M]}
      rotation={[0, angleY, 0]}
      onClick={
        onTap
          ? (e) => {
              if (e.delta > 4) return; // an orbit drag ending here is not a tap
              // A dollhouse-faded wall is visually absent — let the tap fall
              // through to the floor behind it instead of painting a ghost.
              if (mat.opacity < 0.5) return;
              e.stopPropagation();
              onTap({ kind: 'wall', id: wall.id, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY });
            }
          : undefined
      }
    >
      {/* Solid wall body — all spans share one fadeable material */}
      {spans.map((s, i) => (
        <WallSpan
          key={i}
          position={[((s.a + s.b) / 2) * M, ((s.y0 + s.y1) / 2) * M, 0]}
          material={mat}
          spanW={(s.b - s.a) * M}
          spanH={(s.y1 - s.y0) * M}
          thickness={t}
          textured={!!wall.texture}
        />
      ))}
      {/* Dark top cap along the full wall (fades with the wall body). */}
      <mesh
        position={[(dist(wall.start, wall.end) / 2) * M, wall.height * M + 0.015, 0]}
        material={capMat}
        castShadow
      >
        <boxGeometry args={[dist(wall.start, wall.end) * M, 0.03, t + 0.016]} />
      </mesh>
      {/* Baseboards on floor-level spans (skip headers; breaks at doors). */}
      {spans
        .filter((s) => s.y0 <= 0.01 && s.b - s.a > 1)
        .map((s, i) => (
          <mesh key={`bb${i}`} position={[((s.a + s.b) / 2) * M, 0.045, 0]} castShadow receiveShadow>
            <boxGeometry args={[(s.b - s.a) * M, 0.09, t + 0.02]} />
            <meshStandardMaterial color="#efeae0" roughness={0.7} metalness={0} />
          </mesh>
        ))}
      {openings.map((o) => (
        <OpeningMesh key={o.id} opening={o} thickness={t} len={dist(wall.start, wall.end)} />
      ))}
    </group>
  );
}

// Unit quarter-fillet (radius 1, depth 1) shared by every archway; scaled per
// instance so arch corners cost no per-opening geometry.
const ARCH_FILLET_GEO = (() => {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(0, -1);
  s.absarc(1, -1, 1, Math.PI, Math.PI / 2, true);
  s.lineTo(0, 0);
  return new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false });
})();

/** Door leaf or window glass + frame, in wall-local coordinates. */
function OpeningMesh({ opening: o, thickness, len }: { opening: Opening; thickness: number; len: number }) {
  const centreCm = o.offset * len; // offset is a 0..1 fraction along the wall
  const cx = centreCm * M;
  const w = o.width * M;
  const h = o.height * M;
  const sill = o.sill * M;

  if (o.type === 'door') {
    const leftX = (centreCm - o.width / 2) * M;
    const rightX = (centreCm + o.width / 2) * M;
    const jambs = (
      <>
        <mesh position={[leftX, h / 2, 0]} castShadow>
          <boxGeometry args={[0.04, h, thickness * 1.05]} />
          <meshStandardMaterial color="#e6e8ea" roughness={0.8} />
        </mesh>
        <mesh position={[rightX, h / 2, 0]} castShadow>
          <boxGeometry args={[0.04, h, thickness * 1.05]} />
          <meshStandardMaterial color="#e6e8ea" roughness={0.8} />
        </mesh>
      </>
    );

    if (o.style === 'passage' || o.style === 'arch') {
      // Doorless opening: cased jambs only; archways get rounded top corners.
      const r = Math.min(w * 0.3, 0.45);
      const td = thickness * 0.95;
      return (
        <group>
          {jambs}
          {o.style === 'arch' &&
            [
              { x: leftX, sx: r },
              { x: rightX, sx: -r },
            ].map((f, i) => (
              <mesh key={i} geometry={ARCH_FILLET_GEO} position={[f.x, h, -td / 2]} scale={[f.sx, r, td]} castShadow>
                <meshStandardMaterial color="#e6e8ea" roughness={0.8} side={THREE.DoubleSide} />
              </mesh>
            ))}
        </group>
      );
    }

    if (o.style === 'pocket') {
      // Leaf peeking out of the wall cavity + overhead track.
      const lw = w * 0.35;
      return (
        <group>
          {jambs}
          <mesh position={[cx, h + 0.02, 0]} castShadow>
            <boxGeometry args={[w, 0.04, thickness * 0.5]} />
            <meshStandardMaterial color="#c9cdd2" roughness={0.6} metalness={0.2} />
          </mesh>
          <mesh position={[leftX + lw / 2, h / 2, 0]} castShadow>
            <boxGeometry args={[lw, h * 0.97, 0.035]} />
            <meshStandardMaterial color="#b9a58c" roughness={0.6} />
          </mesh>
        </group>
      );
    }

    if (o.style === 'bifold') {
      // Two half-leaves folded into a V.
      const seg = w / 2;
      const fold = 0.85;
      return (
        <group>
          {jambs}
          <group position={[leftX, 0, 0]} rotation={[0, -fold, 0]}>
            <mesh position={[(seg * 0.96) / 2, h / 2, 0]} castShadow>
              <boxGeometry args={[seg * 0.96, h * 0.98, 0.035]} />
              <meshStandardMaterial color="#a9744f" roughness={0.6} />
            </mesh>
          </group>
          <group position={[rightX, 0, 0]} rotation={[0, Math.PI + fold, 0]}>
            <mesh position={[(seg * 0.96) / 2, h / 2, 0]} castShadow>
              <boxGeometry args={[seg * 0.96, h * 0.98, 0.035]} />
              <meshStandardMaterial color="#96613f" roughness={0.6} />
            </mesh>
          </group>
        </group>
      );
    }

    if (o.style === 'sliding') {
      // Two glazed panels in the wall plane; one slid half-open.
      const pw = w * 0.55;
      return (
        <group>
          {jambs}
          {[0, 1].map((i) => (
            <group key={i}>
              <mesh position={[cx + (i === 0 ? -w * 0.22 : w * 0.1), h / 2, (i === 0 ? -1 : 1) * thickness * 0.18]} castShadow>
                <boxGeometry args={[pw, h * 0.98, 0.035]} />
                <meshStandardMaterial color="#c9d6de" roughness={0.4} metalness={0.15} />
              </mesh>
              <mesh position={[cx + (i === 0 ? -w * 0.22 : w * 0.1), h / 2, (i === 0 ? -1 : 1) * thickness * 0.18]}>
                <boxGeometry args={[pw * 0.86, h * 0.86, 0.02]} />
                <meshStandardMaterial color="#bfe3f2" transparent opacity={0.35} roughness={0.05} metalness={0.1} />
              </mesh>
            </group>
          ))}
        </group>
      );
    }

    if (o.style === 'double') {
      // Two half-width leaves, hinged at each jamb, both swung open.
      const leafLen = (w / 2) * 0.94;
      return (
        <group>
          {jambs}
          <group position={[leftX, 0, 0]} rotation={[0, -Math.PI / 2.6, 0]}>
            <mesh position={[leafLen / 2, h / 2, 0]} castShadow>
              <boxGeometry args={[leafLen, h * 0.99, 0.04]} />
              <meshStandardMaterial color="#a9744f" roughness={0.6} />
            </mesh>
          </group>
          {/* right leaf: local +x points at the centre when closed (yaw PI),
              then swings open by the same angle in the opposite sense */}
          <group position={[rightX, 0, 0]} rotation={[0, Math.PI + Math.PI / 2.6, 0]}>
            <mesh position={[leafLen / 2, h / 2, 0]} castShadow>
              <boxGeometry args={[leafLen, h * 0.99, 0.04]} />
              <meshStandardMaterial color="#a9744f" roughness={0.6} />
            </mesh>
          </group>
        </group>
      );
    }

    const leafLen = w * 0.94;
    return (
      <group>
        {jambs}
        {/* swung-open leaf, hinged at one jamb */}
        <group position={[leftX, 0, 0]} rotation={[0, -Math.PI / 2.6, 0]}>
          <mesh position={[leafLen / 2, h / 2, 0]} castShadow>
            <boxGeometry args={[leafLen, h * 0.99, 0.04]} />
            <meshStandardMaterial color="#a9744f" roughness={0.6} />
          </mesh>
        </group>
      </group>
    );
  }

  // window: frame ring + glazing (flat pane, sliding sashes, or open casement)
  const fr = 0.05; // frame section (m)
  const td = thickness * 0.6;
  return (
    <group>
      {o.style !== 'sliding' && o.style !== 'casement' && (
        <mesh position={[cx, sill + h / 2, 0]}>
          <boxGeometry args={[w, h, td * 0.5]} />
          <meshStandardMaterial color="#bfe3f2" transparent opacity={0.35} roughness={0.05} metalness={0.1} />
        </mesh>
      )}
      {o.style === 'sliding' &&
        [0, 1].map((i) => (
          <group key={i}>
            <mesh position={[cx + (i === 0 ? -w * 0.24 : w * 0.24), sill + h / 2, (i === 0 ? -1 : 1) * thickness * 0.16]} castShadow>
              <boxGeometry args={[w * 0.55, h * 0.94, 0.03]} />
              <meshStandardMaterial color="#dfe3e6" roughness={0.5} metalness={0.1} />
            </mesh>
            <mesh position={[cx + (i === 0 ? -w * 0.24 : w * 0.24), sill + h / 2, (i === 0 ? -1 : 1) * thickness * 0.16]}>
              <boxGeometry args={[w * 0.47, h * 0.82, 0.02]} />
              <meshStandardMaterial color="#bfe3f2" transparent opacity={0.35} roughness={0.05} metalness={0.1} />
            </mesh>
          </group>
        ))}
      {o.style === 'casement' && (
        // Sash hinged at the left jamb, swung open.
        <group position={[cx - w / 2, 0, 0]} rotation={[0, -0.5, 0]}>
          <mesh position={[(w * 0.96) / 2, sill + h / 2, 0]} castShadow>
            <boxGeometry args={[w * 0.96, h * 0.94, 0.03]} />
            <meshStandardMaterial color="#bfe3f2" transparent opacity={0.45} roughness={0.1} metalness={0.1} />
          </mesh>
        </group>
      )}
      {/* frame: top, bottom, left, right */}
      <mesh position={[cx, sill + h, 0]} castShadow>
        <boxGeometry args={[w + fr, fr, td]} />
        <meshStandardMaterial color="#eef0f2" roughness={0.7} />
      </mesh>
      <mesh position={[cx, sill, 0]} castShadow>
        <boxGeometry args={[w + fr, fr, td]} />
        <meshStandardMaterial color="#eef0f2" roughness={0.7} />
      </mesh>
      <mesh position={[cx - w / 2, sill + h / 2, 0]} castShadow>
        <boxGeometry args={[fr, h, td]} />
        <meshStandardMaterial color="#eef0f2" roughness={0.7} />
      </mesh>
      <mesh position={[cx + w / 2, sill + h / 2, 0]} castShadow>
        <boxGeometry args={[fr, h, td]} />
        <meshStandardMaterial color="#eef0f2" roughness={0.7} />
      </mesh>
      {/* French window: vertical mullions splitting the glazing into panes */}
      {o.style === 'french' &&
        [-w / 6, w / 6].map((mx, i) => (
          <mesh key={i} position={[cx + mx, sill + h / 2, 0]} castShadow>
            <boxGeometry args={[fr * 0.7, h, td * 0.9]} />
            <meshStandardMaterial color="#eef0f2" roughness={0.7} />
          </mesh>
        ))}
    </group>
  );
}

const SLAB_T = 0.22; // structural slab thickness between storeys (m)

/** Shared shape builder: a room polygon as a THREE.Shape in plan meters. */
function roomShape(room: Room): THREE.Shape {
  const shape = new THREE.Shape();
  room.points.forEach((p, i) => {
    if (i === 0) shape.moveTo(p.x * M, p.y * M);
    else shape.lineTo(p.x * M, p.y * M);
  });
  shape.closePath();
  return shape;
}

/**
 * Structural slab rendered under an upper storey (its downside is the ceiling
 * of the storey below) — without it, stacked floors float and you see clean
 * through between storeys.
 */
function SlabMesh({ room }: { room: Room }) {
  const geometry = useMemo(() => {
    const geo = new THREE.ExtrudeGeometry(roomShape(room), { depth: SLAB_T, bevelEnabled: false });
    return geo;
  }, [room.points]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <mesh geometry={geometry} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0]} castShadow receiveShadow>
      <meshStandardMaterial color="#ded9cf" roughness={0.9} metalness={0} />
    </mesh>
  );
}

/** Flat ceiling over a room at the given height (m), shown when not in dollhouse. */
function CeilingMesh({ room, height }: { room: Room; height: number }) {
  const geometry = useMemo(() => new THREE.ShapeGeometry(roomShape(room)), [room.points]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <mesh geometry={geometry} rotation={[Math.PI / 2, 0, 0]} position={[0, height, 0]} receiveShadow>
      <meshStandardMaterial color="#f4f1ea" roughness={0.95} metalness={0} side={THREE.DoubleSide} />
    </mesh>
  );
}

function FloorMesh({ room, onTap }: { room: Room; onTap?: (tap: SurfaceTap) => void }) {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    room.points.forEach((p, i) => {
      const x = p.x * M;
      const y = p.y * M;
      if (i === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    });
    shape.closePath();
    return new THREE.ShapeGeometry(shape);
  }, [room.points]);

  const mat = FLOOR_BY_ID[room.floorMaterial];
  const kind = mat?.kind ?? 'wood';
  const color = mat?.color ?? room.color;
  const proc = useMemo(() => getFloorTexture(kind, color), [kind, color]);
  // Room ShapeGeometry UVs are already in world metres, so `repeat` maps
  // directly to "tiles per metre" — 1/patternMetres tiles once per pattern.
  const custom = useMemo(() => {
    if (!room.texture) return null;
    const t = customTexture(room.texture.src);
    const patternM = Math.max(0.02, room.texture.scaleCm * M);
    t.repeat.set(1 / patternM, 1 / patternM);
    return t;
    // Fine-grained on purpose: rebuild only when the image or scale changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.texture?.src, room.texture?.scaleCm]);

  const useCustom = !!custom;
  const roughness = useCustom ? room.texture?.roughness ?? 0.6 : FLOOR_ROUGHNESS[kind];
  const metalness = useCustom
    ? room.texture?.metalness ?? 0
    : (kind === 'marble' || kind === 'tile' ? 0.08 : 0);

  return (
    <mesh
      geometry={geometry}
      rotation={[Math.PI / 2, 0, 0]}
      position={[0, 0.002, 0]}
      receiveShadow
      onClick={
        onTap
          ? (e) => {
              if (e.delta > 4) return; // orbit drag, not a tap
              e.stopPropagation();
              onTap({ kind: 'room', id: room.id, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY });
            }
          : undefined
      }
    >
      <meshStandardMaterial
        map={custom ?? proc}
        roughness={roughness}
        metalness={metalness}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

/** Camera framing derived from every storey in the design. */
export function useDesignBounds() {
  const floors = useDesign((s) => s.floors);
  const floorGeom = useDesign((s) => s.floorGeom);
  return useMemo(() => {
    const pts = [];
    let topElevation = 0;
    for (const f of floors) {
      const g = floorGeom[f.id];
      if (!g) continue;
      topElevation = Math.max(topElevation, f.elevation);
      pts.push(
        ...g.walls.flatMap((w) => [w.start, w.end]),
        ...g.rooms.flatMap((r) => r.points),
        ...g.furniture.map((fi) => fi.position),
      );
    }
    if (pts.length === 0) {
      return { center: [0, 0, 0] as [number, number, number], radius: 8 };
    }
    const { min, max } = boundsOf(pts);
    const cx = ((min.x + max.x) / 2) * M;
    const cz = ((min.y + max.y) / 2) * M;
    // Frame the whole stack: half-extent plus padding, with extra for storeys.
    const plan = (Math.max(max.x - min.x, max.y - min.y) * M) / 2 + 4;
    const r = plan + topElevation * M * 0.6;
    return { center: [cx, topElevation * M * 0.5, cz] as [number, number, number], radius: r };
  }, [floors, floorGeom]);
}

/** Walls + floors + furniture for one storey, positioned at its elevation. */
function FloorContent({
  geom,
  elevation,
  interactive,
  isTop,
  dollhouse,
  center,
  register,
  unregister,
  onSurfaceTap,
}: {
  geom: FloorGeom;
  elevation: number;
  interactive: boolean;
  isTop: boolean;
  dollhouse: boolean;
  center: [number, number, number];
  register: (id: string, f: WallFade) => void;
  unregister: (id: string) => void;
  onSurfaceTap?: (tap: SurfaceTap) => void;
}) {
  const selection = useDesign((s) => s.selection);
  const select = useDesign((s) => s.select);
  const openingsByWall = useMemo(() => {
    const m = new Map<string, Opening[]>();
    for (const o of geom.openings) {
      const arr = m.get(o.wallId) ?? [];
      arr.push(o);
      m.set(o.wallId, arr);
    }
    return m;
  }, [geom.openings]);

  // Ceiling only matters for the top storey (lower storeys get the slab of
  // the storey above); hidden in dollhouse so you can look inside from above.
  const ceilingHeight =
    (geom.walls.reduce((m, w) => Math.max(m, w.height), 0) || 270) * M;

  // Tapping a wall or floor selects it (so the Properties/Edit panel can edit
  // its height, thickness, paint or delete it — wall editing right in 3D) AND
  // opens the quick paint popover at the tap point.
  const tapSurface = (tap: SurfaceTap) => {
    select({ kind: tap.kind, id: tap.id });
    onSurfaceTap?.(tap);
  };
  const onTap = interactive ? tapSurface : undefined;

  return (
    <group position={[0, elevation * M, 0]}>
      {elevation > 0 && geom.rooms.map((r) => <SlabMesh key={`slab-${r.id}`} room={r} />)}
      {isTop && !dollhouse && geom.rooms.map((r) => (
        <CeilingMesh key={`ceil-${r.id}`} room={r} height={ceilingHeight} />
      ))}
      {geom.rooms.map((r) => (
        <FloorMesh key={r.id} room={r} onTap={onTap} />
      ))}
      {geom.walls.map((w) => (
        <WallMesh
          key={w.id}
          wall={w}
          openings={openingsByWall.get(w.id) ?? []}
          center={center}
          register={register}
          unregister={unregister}
          onTap={onTap}
        />
      ))}
      {geom.furniture.map((f) => (
        <Furniture3D
          key={f.id}
          item={f}
          selected={interactive && selection.kind === 'furniture' && selection.id === f.id}
          onSelect={() => interactive && select({ kind: 'furniture', id: f.id })}
          draggable={interactive}
          ceilingHeight={ceilingHeight}
        />
      ))}
    </group>
  );
}

/**
 * The actual home geometry for every storey, stacked at their elevations.
 * Shared by the live editor view and the path-traced Photo mode so both render
 * the same design. Only the active storey's furniture is interactive.
 */
export default function DesignScene({
  interactive = true,
  dollhouse = false,
  dollhouseInstant = false,
  onSurfaceTap,
}: {
  interactive?: boolean;
  dollhouse?: boolean;
  /** Snap wall fades instead of lerping — for progressive renders (photo
   *  mode) where the fade must be settled the moment the camera stops. */
  dollhouseInstant?: boolean;
  onSurfaceTap?: (tap: SurfaceTap) => void;
}) {
  const floors = useDesign((s) => s.floors);
  const floorGeom = useDesign((s) => s.floorGeom);
  const activeFloorId = useDesign((s) => s.activeFloorId);
  const { center } = useDesignBounds();

  // One place computes the dollhouse fade for every wall (all storeys), per frame.
  const fades = useRef(new Map<string, WallFade>());
  const register = useCallback((id: string, f: WallFade) => fades.current.set(id, f), []);
  const unregister = useCallback((id: string) => fades.current.delete(id), []);
  useFrame(({ camera }) => {
    fades.current.forEach((w) => {
      const m = w.mat;
      if (!dollhouse) {
        if (m.opacity !== 1) {
          m.opacity = 1;
          m.transparent = false;
          m.depthWrite = true;
        }
        return;
      }
      const camDot = w.nx * (camera.position.x - w.mx) + w.nz * (camera.position.z - w.mz);
      const target = camDot > 0.25 ? 0.1 : 1;
      m.transparent = true;
      m.opacity = dollhouseInstant ? target : m.opacity + (target - m.opacity) * 0.2;
      m.depthWrite = m.opacity > 0.85;
    });
  });

  return (
    <>
      {floors.map((f) => {
        const geom = floorGeom[f.id];
        if (!geom) return null;
        const topElevation = Math.max(...floors.map((x) => x.elevation));
        return (
          <FloorContent
            key={f.id}
            geom={geom}
            elevation={f.elevation}
            interactive={interactive && f.id === activeFloorId}
            isTop={f.elevation >= topElevation}
            dollhouse={dollhouse}
            center={center}
            onSurfaceTap={onSurfaceTap}
            register={register}
            unregister={unregister}
          />
        );
      })}
    </>
  );
}
