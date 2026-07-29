import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { useDesign } from '../../store/designStore';
import { FLOOR_BY_ID } from '../../data/furnitureCatalog';
import { MATERIAL_BY_ID, materialUrl } from '../../data/materials';
import { getFloorTexture, FLOOR_ROUGHNESS, customTexture, paintedBoxGeometry, derivedNormalTexture, getRoofTexture, getGroundTexture, GROUND_DEFAULTS } from '../../lib/textures';
import { activeTier, tierCaps } from '../../lib/perfTier';
import { dist, boundsOf, pointInPolygon } from '../../lib/geometry';
import { stairOpeningPoints } from '../../lib/walkNavigation';
import { wallFaceAt, finishForFace } from '../../lib/wallFaces';
import { exteriorFaces } from '../../lib/exteriorFaces';
import { isFence, isHalfWall, structuralWalls, fenceRunBoxes } from '../../lib/fence';
import { buildRoofGeometry, roofOutlines } from '../../lib/roofGeometry';
import { roofOf } from '../../lib/roof';
import { useRemoteCatalog } from '../../lib/remoteCatalog';
import Furniture3D from './Furniture3D';
import type { CustomTexture, FloorGeom, FurnitureItem, Opening, Point, Roof, Room, Wall, WallFaceFinish, WallFaceRange } from '../../types';

export const M = 0.01; // cm -> m
/** Real-world size one outdoor surface tile covers, in metres. Bigger than an
 *  indoor pattern so paving and decking read at garden scale, not doll scale. */
const OUTDOOR_PATCH_M = 2;
/** Whether to synthesise normal maps — resolved once, not per material. */
const RELIEF = tierCaps(activeTier()).derivedNormals;
const NO_FACE_FINISHES: WallFaceFinish[] = [];
const NO_STAIRS: FurnitureItem[] = [];
const NORMAL_SCALE = new THREE.Vector2(0.5, 0.5);

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
export type SurfaceTap = {
  kind: 'wall' | 'room';
  id: string;
  x: number;
  y: number;
  /** Plan-space position for direct placement on a room floor. */
  position?: Point;
  /** Exact room-facing stretch when a wall face was tapped. */
  wallFace?: WallFaceRange;
};

function wallMaterial(color: string, texture?: CustomTexture): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.92, metalness: 0 });
  if (texture) {
    const map = customTexture(texture.src);
    const patternM = Math.max(0.02, texture.scaleCm * M);
    map.repeat.set(1 / patternM, 1 / patternM);
    material.map = map;
    material.roughness = texture.roughness ?? 0.92;
    material.metalness = texture.metalness ?? 0;
    // Synthesised relief (see textures.ts) — brick/plaster/stone gain real depth
    // for zero APK bytes. Skipped on the low tier, where the Sobel pass isn't
    // worth the CPU.
    if (RELIEF) {
      const nrm = derivedNormalTexture(texture.src, 1);
      nrm.repeat.copy(map.repeat);
      material.normalMap = nrm;
      material.normalScale = new THREE.Vector2(0.6, 0.6);
    }
  } else {
    material.color = new THREE.Color(color);
  }
  return material;
}

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

/** A paper-thin finish layer on one room-facing portion of a wall. Intersecting
 * it with the structural spans preserves door/window openings. */
function WallFaceSpan({
  position,
  material,
  spanW,
  spanH,
  side,
}: {
  position: [number, number, number];
  material: THREE.MeshStandardMaterial;
  spanW: number;
  spanH: number;
  side: -1 | 1;
}) {
  const geometry = useMemo(() => {
    const plane = new THREE.PlaneGeometry(spanW, spanH);
    const uv = plane.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * spanW, uv.getY(i) * spanH);
    uv.needsUpdate = true;
    return plane;
  }, [spanW, spanH]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh
      position={position}
      rotation={[0, side === 1 ? 0 : Math.PI, 0]}
      geometry={geometry}
      material={material}
      castShadow
      receiveShadow
    />
  );
}

function WallMesh({
  wall,
  rooms,
  openings,
  center,
  register,
  unregister,
  fadeable = true,
  onTap,
}: {
  wall: Wall;
  rooms: Room[];
  openings: Opening[];
  center: [number, number, number];
  register: (id: string, f: WallFade) => void;
  unregister: (id: string) => void;
  /** Half walls are already below the sight line and stay visible so their
   * capped top and room-divider role remain legible in dollhouse mode. */
  fadeable?: boolean;
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
  const mat = useMemo(
    () => wallMaterial(wall.color, wall.texture),
    [wall.color, wall.texture?.src, wall.texture?.scaleCm, wall.texture?.roughness, wall.texture?.metalness], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const faceFinishes = wall.faceFinishes ?? NO_FACE_FINISHES;
  const faceMats = useMemo(
    () => faceFinishes.map((finish) => wallMaterial(finish.color, finish.texture)),
    [faceFinishes],
  );

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
    if (fadeable) {
      register(wall.id, { mat, nx: normal.nx, nz: normal.nz, mx, mz });
      register(`${wall.id}:cap`, { mat: capMat, nx: normal.nx, nz: normal.nz, mx, mz });
      faceMats.forEach((finishMat, i) => {
        register(`${wall.id}:face:${i}`, { mat: finishMat, nx: normal.nx, nz: normal.nz, mx, mz });
      });
    }
    return () => {
      if (fadeable) {
        unregister(wall.id);
        unregister(`${wall.id}:cap`);
      }
      faceMats.forEach((finishMat, i) => {
        if (fadeable) unregister(`${wall.id}:face:${i}`);
        finishMat.dispose();
      });
      mat.dispose();
      capMat.dispose();
    };
  }, [wall.id, mat, capMat, faceMats, normal, mx, mz, fadeable, register, unregister]);

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
              const position = { x: e.point.x / M, y: e.point.z / M };
              onTap({
                kind: 'wall',
                id: wall.id,
                x: e.nativeEvent.clientX,
                y: e.nativeEvent.clientY,
                position,
                wallFace: wallFaceAt(wall, rooms, position),
              });
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
      {faceFinishes.flatMap((finish: WallFaceFinish, finishIndex) => {
        const from = Math.max(0, Math.min(1, finish.start)) * dist(wall.start, wall.end);
        const to = Math.max(0, Math.min(1, finish.end)) * dist(wall.start, wall.end);
        return spans.flatMap((span, spanIndex) => {
          const a = Math.max(span.a, from);
          const b = Math.min(span.b, to);
          if (b - a <= 0.1) return [];
          return [
            <WallFaceSpan
              key={`face-${finishIndex}-${spanIndex}`}
              position={[
                ((a + b) / 2) * M,
                ((span.y0 + span.y1) / 2) * M,
                finish.side * (t / 2 + 0.0015),
              ]}
              material={faceMats[finishIndex]}
              spanW={(b - a) * M}
              spanH={(span.y1 - span.y0) * M}
              side={finish.side}
            />,
          ];
        });
      })}
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

/**
 * A boundary run — garden fence or deck railing — in place of a solid wall.
 *
 * Every box of the fence is merged into ONE geometry. A 10m picket fence is
 * ~90 posts, rails and slats; left as individual meshes that is 90 draw calls
 * for a single garden edge, which a phone GPU feels immediately. Merged, it is
 * one. The frame (posts and rails) is merged separately from the infill so the
 * two can be shaded differently without a second material on the same buffer.
 *
 * Openings reuse the same span splitter as walls, so a gate is simply a run
 * that stops and starts again — and because every run posts both its ends, a
 * gate always gets a post on each side instead of a slat floating in mid-air.
 */
function FenceMesh({
  wall,
  openings,
  onTap,
}: {
  wall: Wall;
  openings: Opening[];
  onTap?: (tap: SurfaceTap) => void;
}) {
  const dxCm = wall.end.x - wall.start.x;
  const dzCm = wall.end.y - wall.start.y;
  const angleY = -Math.atan2(dzCm, dxCm);
  const len = dist(wall.start, wall.end);
  const mx = ((wall.start.x + wall.end.x) / 2) * M;
  const mz = ((wall.start.y + wall.end.y) / 2) * M;

  const geos = useMemo(() => {
    const runs = wallSpans(wall, openings)
      // Fences have no lintels or sills: only full-height runs are real fence.
      .filter((s) => s.y0 <= 0.01 && s.y1 >= wall.height - 0.01)
      // wallSpans overhangs the ends by half a thickness to keep wall corners
      // solid; a fence post sticking out past its own corner just looks wrong.
      .map((s) => ({ a: Math.max(0, s.a), b: Math.min(len, s.b) }));

    const frame: THREE.BufferGeometry[] = [];
    const infill: THREE.BufferGeometry[] = [];
    for (const r of runs) {
      for (const b of fenceRunBoxes(r.a, r.b, wall.height, wall.fenceStyle)) {
        const g = new THREE.BoxGeometry(b.w * M, b.h * M, b.d * M);
        // Boxes come back in wall-local cm measured from the wall start; the
        // group below is centred on the wall, so shift by half its length.
        g.translate((b.x - len / 2) * M, b.y * M, b.z * M);
        (b.part === 'slat' ? infill : frame).push(g);
      }
    }
    const join = (list: THREE.BufferGeometry[]) => {
      if (!list.length) return null;
      const merged = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      return merged;
    };
    return { frame: join(frame), infill: join(infill) };
  }, [wall, openings, len]);

  useEffect(
    () => () => {
      geos.frame?.dispose();
      geos.infill?.dispose();
    },
    [geos],
  );

  // The infill sits a shade darker than the frame so posts and rails read as
  // structure. Both derive from the wall colour, so painting a fence works
  // exactly like painting a wall.
  const mats = useMemo(() => {
    const base = new THREE.Color(wall.color);
    const railing = (wall.fenceStyle ?? 'picket') === 'railing';
    const frame = new THREE.MeshStandardMaterial({
      color: base,
      roughness: railing ? 0.45 : 0.85,
      metalness: railing ? 0.6 : 0,
    });
    const infill = new THREE.MeshStandardMaterial({
      color: base.clone().multiplyScalar(0.88),
      roughness: railing ? 0.45 : 0.88,
      metalness: railing ? 0.6 : 0,
    });
    return { frame, infill };
  }, [wall.color, wall.fenceStyle]);

  useEffect(
    () => () => {
      mats.frame.dispose();
      mats.infill.dispose();
    },
    [mats],
  );

  return (
    <group
      position={[mx, 0, mz]}
      rotation={[0, angleY, 0]}
      onClick={(e) => {
        if (!onTap) return;
        e.stopPropagation();
        onTap({ kind: 'wall', id: wall.id, x: e.clientX ?? 0, y: e.clientY ?? 0 });
      }}
    >
      {geos.frame && <mesh geometry={geos.frame} material={mats.frame} castShadow receiveShadow />}
      {geos.infill && <mesh geometry={geos.infill} material={mats.infill} castShadow receiveShadow />}
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
          <mesh position={[o.flipHinge ? rightX - lw / 2 : leftX + lw / 2, h / 2, 0]} castShadow>
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
      // Two glazed leaves in a track, one slid open.
      //
      // The previous version drew a SOLID panel and then a smaller glass box
      // inside it, so the opaque panel hid the glazing completely and the door
      // read as a flat grey slab. A real slider is a slim frame around a pane,
      // so build the frame as four bars and let the glass be the whole leaf.
      const pw = w * 0.55;
      const ph = h * 0.98;
      const bar = Math.min(0.05, pw * 0.07); // stile/rail thickness
      const dz = thickness * 0.16;           // track offset per leaf
      const frameMat = (
        <meshStandardMaterial color="#8d949b" roughness={0.35} metalness={0.75} />
      );
      const leaf = (i: number) => {
        const lx = cx + (i === 0 ? -w * 0.22 : w * 0.1);
        const z = (i === 0 ? -1 : 1) * dz;
        const half = pw / 2;
        return (
          <group key={i} position={[lx, 0, z]}>
            {/* glazing — the leaf itself, not a panel with a hole in it */}
            <mesh position={[0, ph / 2, 0]}>
              <boxGeometry args={[pw - bar * 2, ph - bar * 2, 0.012]} />
              <meshPhysicalMaterial
                color="#dff1f8"
                transparent
                opacity={0.28}
                roughness={0.04}
                metalness={0}
                transmission={0.9}
                thickness={0.01}
              />
            </mesh>
            {/* stiles */}
            <mesh position={[-half + bar / 2, ph / 2, 0]} castShadow>
              <boxGeometry args={[bar, ph, 0.045]} />{frameMat}
            </mesh>
            <mesh position={[half - bar / 2, ph / 2, 0]} castShadow>
              <boxGeometry args={[bar, ph, 0.045]} />{frameMat}
            </mesh>
            {/* rails */}
            <mesh position={[0, bar / 2, 0]} castShadow>
              <boxGeometry args={[pw, bar, 0.045]} />{frameMat}
            </mesh>
            <mesh position={[0, ph - bar / 2, 0]} castShadow>
              <boxGeometry args={[pw, bar, 0.045]} />{frameMat}
            </mesh>
            {/* pull handle on the leading stile — the detail that reads as a
                slider rather than a fixed pane */}
            <mesh position={[(i === 0 ? half - bar : -half + bar), h * 0.45, 0.035]} castShadow>
              <boxGeometry args={[0.025, h * 0.16, 0.025]} />
              <meshStandardMaterial color="#3f4348" roughness={0.35} metalness={0.8} />
            </mesh>
          </group>
        );
      };
      return (
        <group>
          {jambs}
          {/* head track + sill track, so the leaves read as running in something */}
          <mesh position={[cx, ph + bar * 0.4, 0]} castShadow>
            <boxGeometry args={[w, bar * 0.8, thickness * 0.6]} />
            <meshStandardMaterial color="#7d848b" roughness={0.4} metalness={0.7} />
          </mesh>
          <mesh position={[cx, 0.012, 0]} receiveShadow>
            <boxGeometry args={[w, 0.024, thickness * 0.6]} />
            <meshStandardMaterial color="#7d848b" roughness={0.5} metalness={0.6} />
          </mesh>
          {[0, 1].map(leaf)}
        </group>
      );
    }

    if (o.style === 'double') {
      // Two half-width leaves, hinged at each jamb, both swung open.
      const leafLen = (w / 2) * 0.94;
      const swing = o.flipSwing ? -1 : 1;
      return (
        <group>
          {jambs}
          <group position={[leftX, 0, 0]} rotation={[0, (-Math.PI / 2.6) * swing, 0]}>
            <mesh position={[leafLen / 2, h / 2, 0]} castShadow>
              <boxGeometry args={[leafLen, h * 0.99, 0.04]} />
              <meshStandardMaterial color="#a9744f" roughness={0.6} />
            </mesh>
          </group>
          {/* right leaf: local +x points at the centre when closed (yaw PI),
              then swings open by the same angle in the opposite sense */}
          <group position={[rightX, 0, 0]} rotation={[0, Math.PI + (Math.PI / 2.6) * swing, 0]}>
            <mesh position={[leafLen / 2, h / 2, 0]} castShadow>
              <boxGeometry args={[leafLen, h * 0.99, 0.04]} />
              <meshStandardMaterial color="#a9744f" roughness={0.6} />
            </mesh>
          </group>
        </group>
      );
    }

    const leafLen = w * 0.94;
    const hingeLeft = !o.flipHinge;
    const hingeX = hingeLeft ? leftX : rightX;
    const swing = o.flipSwing ? -1 : 1;
    const openYaw = (hingeLeft ? -1 : 1) * swing * (Math.PI / 2.6);
    return (
      <group>
        {jambs}
        {/* swung-open leaf, hinged at one jamb */}
        <group position={[hingeX, 0, 0]} rotation={[0, (hingeLeft ? 0 : Math.PI) + openYaw, 0]}>
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
function roomShape(room: Room, stairsBelow: FurnitureItem[] = []): THREE.Shape {
  const shape = new THREE.Shape();
  room.points.forEach((p, i) => {
    if (i === 0) shape.moveTo(p.x * M, p.y * M);
    else shape.lineTo(p.x * M, p.y * M);
  });
  shape.closePath();
  for (const stair of stairsBelow) {
    const opening = stairOpeningPoints(stair);
    // A THREE.Shape hole must sit wholly inside this room polygon. Stairs that
    // cross room boundaries remain solid until a clipped-opening model exists.
    if (!opening.every((point) => pointInPolygon(point, room.points))) continue;
    const hole = new THREE.Path();
    opening.forEach((point, index) => {
      if (index === 0) hole.moveTo(point.x * M, point.y * M);
      else hole.lineTo(point.x * M, point.y * M);
    });
    hole.closePath();
    shape.holes.push(hole);
  }
  return shape;
}

/**
 * Structural slab rendered under an upper storey (its downside is the ceiling
 * of the storey below) — without it, stacked floors float and you see clean
 * through between storeys.
 */
function SlabMesh({ room, stairsBelow }: { room: Room; stairsBelow: FurnitureItem[] }) {
  const geometry = useMemo(() => {
    const geo = new THREE.ExtrudeGeometry(roomShape(room, stairsBelow), { depth: SLAB_T, bevelEnabled: false });
    return geo;
  }, [room.points, stairsBelow]); // eslint-disable-line react-hooks/exhaustive-deps
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

/**
 * The building's roof, generated from the wall outline rather than drawn.
 *
 * Lives on the top storey and is hidden in dollhouse mode for the same reason
 * the ceiling is: you have to be able to look in from above.
 */
function RoofMesh({ walls, rooms, roof, eaveY }: { walls: Wall[]; rooms: Room[]; roof: Roof; eaveY: number }) {
  const built = useMemo(() => {
    // Fences carry no roof, and a fence running off the plot would otherwise
    // drag the eave outline out with it.
    const o = roofOutlines(structuralWalls(walls), roof.overhang);
    if (!o) return null;
    return buildRoofGeometry(o.eave, o.wall, roof, eaveY);
  }, [walls, roof, eaveY]);

  // The gable end is part of the OUTSIDE of the building, so it has to match
  // whatever the outside is clad in — brick, render, timber. Taking the plain
  // wall colour instead left a brick house with a beige triangle over its front
  // door. Look up the finish actually applied to the exterior faces; fall back
  // to the dominant wall colour when nothing has been clad.
  const infill = useMemo(() => {
    const tally = new Map<string, { n: number; color: string; texture?: CustomTexture }>();
    const bump = (color: string, texture?: CustomTexture) => {
      const key = `${color}|${texture?.src ?? ''}`;
      const hit = tally.get(key);
      if (hit) hit.n++;
      else tally.set(key, { n: 1, color, texture });
    };
    const byId = new Map(walls.map((w) => [w.id, w]));
    for (const { wallId, face } of exteriorFaces(structuralWalls(walls), rooms)) {
      const w = byId.get(wallId);
      if (!w) continue;
      const f = finishForFace(w, face);
      if (f) bump(f.color, f.texture);
      else bump(w.color, w.texture);
    }
    if (!tally.size) for (const w of walls) bump(w.color, w.texture);
    let best: { n: number; color: string; texture?: CustomTexture } = { n: 0, color: '#f2efe9' };
    tally.forEach((v) => {
      if (v.n > best.n) best = v;
    });
    return best;
  }, [walls, rooms]);

  const infillMap = useMemo(() => {
    if (!infill.texture) return null;
    const t = customTexture(infill.texture.src);
    const patternM = Math.max(0.02, infill.texture.scaleCm * M);
    t.repeat.set(1 / patternM, 1 / patternM);
    return t;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [infill.texture?.src, infill.texture?.scaleCm]);

  // Roof UVs are in metres, so repeat maps directly to tiles-per-metre.
  const customSrc = roof.texture?.src;
  const patternM = Math.max(0.05, (roof.texture?.scaleCm ?? roof.coveringScaleCm) * M);
  const map = useMemo(() => {
    const t = customSrc ? customTexture(customSrc) : getRoofTexture(roof.covering, roof.color);
    t.repeat.set(1 / patternM, 1 / patternM);
    return t;
  }, [customSrc, roof.covering, roof.color, patternM]);
  const normal = useMemo(() => {
    if (!RELIEF || !customSrc) return null; // procedural coverings paint their own shading
    const n = derivedNormalTexture(customSrc, 1);
    n.repeat.set(1 / patternM, 1 / patternM);
    return n;
  }, [customSrc, patternM]);

  useEffect(() => () => {
    built?.geometry.dispose();
    built?.infill?.dispose();
  }, [built]);
  if (!built) return null;
  return (
    <>
      <mesh geometry={built.geometry} castShadow receiveShadow>
        <meshStandardMaterial
          map={map}
          normalMap={normal}
          normalScale={NORMAL_SCALE}
          // The procedural covering already carries its colour; tinting it again
          // would double up. Only a custom image needs the roof colour as a tint.
          color={customSrc ? roof.color : '#ffffff'}
          roughness={roof.texture?.roughness ?? (roof.covering === 'metal' ? 0.45 : 0.85)}
          metalness={roof.texture?.metalness ?? (roof.covering === 'metal' ? 0.5 : 0)}
          side={THREE.DoubleSide}
        />
      </mesh>
      {built.infill && (
        // Gable ends and the strip under the eaves are masonry, so they take the
        // wall finish rather than the roof covering.
        <mesh geometry={built.infill} castShadow receiveShadow>
          <meshStandardMaterial
            map={infillMap}
            color={infillMap ? '#ffffff' : infill.color}
            roughness={infill.texture?.roughness ?? 0.9}
            metalness={infill.texture?.metalness ?? 0}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
    </>
  );
}

function FloorMesh({ room, stairsBelow, onTap }: { room: Room; stairsBelow: FurnitureItem[]; onTap?: (tap: SurfaceTap) => void }) {
  const geometry = useMemo(() => {
    return new THREE.ShapeGeometry(roomShape(room, stairsBelow));
  }, [room.points, stairsBelow]); // eslint-disable-line react-hooks/exhaustive-deps

  const mat = FLOOR_BY_ID[room.floorMaterial];
  const kind = mat?.kind ?? 'wood';
  const color = mat?.color ?? room.color;
  // Outdoor surfaces (patio, deck, driveway, path, lawn) are generated rather
  // than sampled from a photo — same reason as the site lawn, no APK cost. They
  // bypass the whole indoor floor-material path below.
  const ground = room.outdoor ? mat?.ground ?? 'paving' : null;
  const groundDef = ground ? GROUND_DEFAULTS[ground] : null;
  const groundTex = useMemo(() => {
    if (!ground) return null;
    const t = getGroundTexture(ground, groundDef?.color ?? color, OUTDOOR_PATCH_M);
    // Room ShapeGeometry UVs are in world metres, so repeat == tiles per metre.
    t.repeat.set(1 / OUTDOOR_PATCH_M, 1 / OUTDOOR_PATCH_M);
    return t;
  }, [ground, groundDef?.color, color]);
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

  // Built-in floor materials carry a photoreal image id (FloorMaterial.texture)
  // that the 2D plan already renders. Use it here too instead of falling back to
  // the low-res procedural canvas — same UV maths as the custom branch above.
  // Carpets deliberately have no image and keep the procedural weave.
  const builtInId = mat?.texture;
  const builtIn = useMemo(() => {
    if (!builtInId) return null;
    const entry = MATERIAL_BY_ID[builtInId];
    const t = customTexture(materialUrl(builtInId));
    const patternM = Math.max(0.02, (entry?.scaleCm ?? 200) * M);
    t.repeat.set(1 / patternM, 1 / patternM);
    return { texture: t, roughness: entry?.roughness, metalness: entry?.metalness };
  }, [builtInId]);

  // Relief for photoreal floors (tile grout, plank seams, stone). Only for real
  // image textures — the procedural canvas ones are already flat by design.
  const reliefSrc = room.texture?.src ?? (builtInId ? materialUrl(builtInId) : null);
  const normal = useMemo(
    () => (RELIEF && reliefSrc ? derivedNormalTexture(reliefSrc, 1) : null),
    [reliefSrc],
  );
  useEffect(() => {
    if (!normal) return;
    const r = (custom ?? builtIn?.texture)?.repeat;
    if (r) normal.repeat.copy(r);
  }, [normal, custom, builtIn]);

  const useCustom = !!custom;
  const roughness = useCustom
    ? room.texture?.roughness ?? 0.6
    : builtIn?.roughness ?? FLOOR_ROUGHNESS[kind];
  const metalness = useCustom
    ? room.texture?.metalness ?? 0
    : builtIn?.metalness ?? (kind === 'marble' || kind === 'tile' ? 0.08 : 0);

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
              onTap({
                kind: 'room',
                id: room.id,
                x: e.nativeEvent.clientX,
                y: e.nativeEvent.clientY,
                position: { x: e.point.x / M, y: e.point.z / M },
              });
            }
          : undefined
      }
    >
      <meshStandardMaterial
        map={groundTex ?? custom ?? builtIn?.texture ?? proc}
        normalMap={groundTex ? null : normal}
        normalScale={NORMAL_SCALE}
        roughness={groundDef?.roughness ?? roughness}
        metalness={groundTex ? 0 : metalness}
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
    let wallTop = 0;
    for (const f of floors) {
      const g = floorGeom[f.id];
      if (!g) continue;
      topElevation = Math.max(topElevation, f.elevation);
      wallTop = Math.max(wallTop, f.elevation + g.walls.reduce((m, w) => Math.max(m, w.height), 0));
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
    // A roof extends the model both ways, and these bounds also drive the fog
    // range and the sun's shadow frustum — miss it and the roof silently clips.
    const roof = roofOf(floors);
    const halfPlan = Math.max(max.x - min.x, max.y - min.y) / 2;
    const grow = roof ? roof.overhang : 0;
    // Pitched roofs rise across the SHORT axis, which is what halfB works out to.
    const halfShort = Math.min(max.x - min.x, max.y - min.y) / 2 + (roof?.overhang ?? 0);
    const rise = roof && roof.type !== 'flat' ? halfShort * Math.tan((roof.pitch * Math.PI) / 180) : 0;
    // Frame the whole stack: half-extent plus padding, with extra for storeys.
    const plan = (halfPlan + grow) * M + 4;
    const modelTop = roof ? wallTop * M + rise * M + roof.thickness * M : topElevation * M;
    const r = plan + modelTop * 0.6;
    return { center: [cx, modelTop * 0.5, cz] as [number, number, number], radius: r };
  }, [floors, floorGeom]);
}

/** Walls + floors + furniture for one storey, positioned at its elevation. */
function FloorContent({
  geom,
  stairsBelow,
  elevation,
  interactive,
  isTop,
  roof,
  dollhouse,
  center,
  register,
  unregister,
  onSurfaceTap,
  useRenderModels,
}: {
  geom: FloorGeom;
  stairsBelow: FurnitureItem[];
  elevation: number;
  interactive: boolean;
  isTop: boolean;
  /** Set only on the storey that carries the roof (the highest one overall —
   *  `isTop` is relative to the currently VISIBLE storeys, which in the
   *  active-floor cutaway would put the roof on the wrong level). */
  roof?: Roof;
  dollhouse: boolean;
  center: [number, number, number];
  register: (id: string, f: WallFade) => void;
  unregister: (id: string) => void;
  onSurfaceTap?: (tap: SurfaceTap) => void;
  useRenderModels: boolean;
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
    select({ kind: tap.kind, id: tap.id, wallFace: tap.kind === 'wall' ? tap.wallFace : undefined });
    onSurfaceTap?.(tap);
  };
  const onTap = interactive ? tapSurface : undefined;

  return (
    <group position={[0, elevation * M, 0]}>
      {elevation > 0 && geom.rooms.filter((r) => !r.outdoor).map((r) => <SlabMesh key={`slab-${r.id}`} room={r} stairsBelow={stairsBelow} />)}
      {isTop && !dollhouse && geom.rooms.filter((r) => !r.outdoor).map((r) => (
        <CeilingMesh key={`ceil-${r.id}`} room={r} height={ceilingHeight} />
      ))}
      {roof && !dollhouse && (
        <RoofMesh walls={geom.walls} rooms={geom.rooms} roof={roof} eaveY={ceilingHeight} />
      )}
      {geom.rooms.map((r) => (
        <FloorMesh key={r.id} room={r} stairsBelow={stairsBelow} onTap={onTap} />
      ))}
      {geom.walls.map((w) => (
        isFence(w) ? (
          // Fences take no part in the dollhouse fade — they are already open,
          // so there is no near-side face to dissolve to see past.
          <FenceMesh key={w.id} wall={w} openings={openingsByWall.get(w.id) ?? []} onTap={onTap} />
        ) : (
          <WallMesh
            key={w.id}
            wall={w}
            rooms={geom.rooms}
            openings={openingsByWall.get(w.id) ?? []}
            center={center}
            register={register}
            unregister={unregister}
            fadeable={!isHalfWall(w)}
            onTap={onTap}
          />
        )
      ))}
      {geom.furniture.map((f) => (
        <Furniture3D
          key={f.id}
          item={f}
          selected={interactive && selection.kind === 'furniture' && selection.id === f.id}
          onSelect={() => interactive && select({ kind: 'furniture', id: f.id })}
          interactive={interactive}
          draggable={interactive}
          ceilingHeight={ceilingHeight}
          preferRenderModel={useRenderModels}
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
  useRenderModels = false,
}: {
  interactive?: boolean;
  dollhouse?: boolean;
  /** Snap wall fades instead of lerping — for progressive renders (photo
   *  mode) where the fade must be settled the moment the camera stops. */
  dollhouseInstant?: boolean;
  onSurfaceTap?: (tap: SurfaceTap) => void;
  /** Load optional higher-detail catalogue tiers only for explicit renders. */
  useRenderModels?: boolean;
}) {
  // Subscribe once for the entire scene so a cached/fetched cloud manifest can
  // replace procedural fallbacks even if 3D opened before the request finished.
  const cloudCatalog = useRemoteCatalog();
  void cloudCatalog.remoteCount;
  const floors = useDesign((s) => s.floors);
  const floorGeom = useDesign((s) => s.floorGeom);
  const activeFloorId = useDesign((s) => s.activeFloorId);
  const walkMode = useDesign((s) => s.walkMode);
  const { center } = useDesignBounds();

  // One place computes the dollhouse fade for every wall (all storeys), per frame.
  const fades = useRef(new Map<string, WallFade>());
  const register = useCallback((id: string, f: WallFade) => fades.current.set(id, f), []);
  const unregister = useCallback((id: string) => fades.current.delete(id), []);
  useFrame(({ camera, invalidate }) => {
    let transitioning = false;
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
      const target = camDot > 0.25 ? 0.18 : 1;
      m.transparent = true;
      if (dollhouseInstant || Math.abs(m.opacity - target) < 0.01) {
        m.opacity = target;
      } else {
        m.opacity += (target - m.opacity) * 0.2;
        transitioning = true;
      }
      m.depthWrite = m.opacity > 0.85;
    });
    // Orbit view uses demand rendering. Finish the short wall fade after the
    // controls stop requesting frames, then sleep again when fully settled.
    if (transitioning) invalidate();
  });

  // Planner-style storey visibility: storeys ABOVE the active floor hide, so
  // zooming into (say) the ground floor is never blocked by the slab of the
  // storey above — switching floors in the FloorSwitcher reveals them again.
  const activeElevation = floors.find((f) => f.id === activeFloorId)?.elevation ?? 0;
  // The cutaway exists so the storey above does not put its slab between you
  // and the floor you are editing — which only matters when you are looking
  // INTO the building. With dollhouse off you are looking at the outside of it,
  // and hiding the upper storeys there made a two-storey house read as a
  // bungalow: the roof sat on the ground floor and the first floor was missing
  // entirely. Walk mode has always kept the whole building for the same reason.
  const cutaway = dollhouse && !walkMode;
  const visible = cutaway ? floors.filter((f) => f.elevation <= activeElevation) : floors;
  const orderedFloors = useMemo(() => [...floors].sort((a, b) => a.elevation - b.elevation), [floors]);
  const stairsBelowByFloor = useMemo(() => {
    const result = new Map<string, FurnitureItem[]>();
    orderedFloors.forEach((floor, index) => {
      if (index === 0) return;
      const below = floorGeom[orderedFloors[index - 1].id];
      result.set(floor.id, below?.furniture.filter((item) => item.type === 'stairs') ?? NO_STAIRS);
    });
    return result;
  }, [orderedFloors, floorGeom]);
  const topElevation = Math.max(...visible.map((x) => x.elevation));
  return (
    <>
      {visible.map((f) => {
        const geom = floorGeom[f.id];
        if (!geom) return null;
        const stairsBelow = stairsBelowByFloor.get(f.id) ?? NO_STAIRS;
        return (
          <FloorContent
            key={f.id}
            geom={geom}
            stairsBelow={stairsBelow}
            elevation={f.elevation}
            interactive={interactive && f.id === activeFloorId}
            isTop={f.elevation >= topElevation}
            roof={f.roof}
            // Dollhouse fade cuts open only the storey being edited; the
            // storeys below stay solid (context, not subject).
            dollhouse={dollhouse && f.id === activeFloorId}
            center={center}
            onSurfaceTap={onSurfaceTap}
            register={register}
            unregister={unregister}
            useRenderModels={useRenderModels}
          />
        );
      })}
    </>
  );
}
