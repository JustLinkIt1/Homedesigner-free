import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useDesign } from '../../store/designStore';
import { FLOOR_BY_ID } from '../../data/furnitureCatalog';
import { dist, boundsOf } from '../../lib/geometry';
import Furniture3D from './Furniture3D';
import type { Opening, Room, Wall } from '../../types';

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
    .map((o) => ({ ...o, s: Math.max(0, o.offset - o.width / 2), e: Math.min(len, o.offset + o.width / 2) }))
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

function WallMesh({
  wall,
  openings,
  center,
  dollhouse,
}: {
  wall: Wall;
  openings: Opening[];
  center: [number, number, number];
  dollhouse: boolean;
}) {
  const dxCm = wall.end.x - wall.start.x;
  const dzCm = wall.end.y - wall.start.y;
  const angleY = -Math.atan2(dzCm, dxCm);
  const t = wall.thickness * M;
  const mx = ((wall.start.x + wall.end.x) / 2) * M;
  const mz = ((wall.start.y + wall.end.y) / 2) * M;

  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const spans = useMemo(() => wallSpans(wall, openings), [wall, openings]);

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

  // Dollhouse: fade walls the camera is "outside" of so interiors stay visible.
  useFrame(({ camera }) => {
    const m = matRef.current;
    if (!m) return;
    if (!dollhouse) {
      if (m.opacity !== 1) {
        m.opacity = 1;
        m.transparent = false;
        m.depthWrite = true;
      }
      return;
    }
    const camDot = normal.nx * (camera.position.x - mx) + normal.nz * (camera.position.z - mz);
    const target = camDot > 0.25 ? 0.1 : 1;
    m.transparent = true;
    m.opacity += (target - m.opacity) * 0.2;
    m.depthWrite = m.opacity > 0.85;
  });

  return (
    <group position={[wall.start.x * M, 0, wall.start.y * M]} rotation={[0, angleY, 0]}>
      {/* Solid wall body (one shared, dollhouse-fadeable material) */}
      {spans.map((s, i) => {
        const L = (s.b - s.a) * M;
        const Hp = (s.y1 - s.y0) * M;
        return (
          <mesh
            key={i}
            position={[((s.a + s.b) / 2) * M, ((s.y0 + s.y1) / 2) * M, 0]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[L, Hp, t]} />
            {i === 0 ? (
              <meshStandardMaterial ref={matRef} color={wall.color} roughness={0.92} metalness={0} />
            ) : (
              <MatClone source={matRef} color={wall.color} />
            )}
          </mesh>
        );
      })}
      {openings.map((o) => (
        <OpeningMesh key={o.id} opening={o} thickness={t} />
      ))}
    </group>
  );
}

/** Mirrors the lead segment's material so every span fades together. */
function MatClone({
  source,
  color,
}: {
  source: React.RefObject<THREE.MeshStandardMaterial>;
  color: string;
}) {
  const ref = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(() => {
    const src = source.current;
    const m = ref.current;
    if (!src || !m) return;
    m.opacity = src.opacity;
    m.transparent = src.transparent;
    m.depthWrite = src.depthWrite;
  });
  return <meshStandardMaterial ref={ref} color={color} roughness={0.92} metalness={0} transparent />;
}

/** Door leaf or window glass + frame, in wall-local coordinates. */
function OpeningMesh({ opening: o, thickness }: { opening: Opening; thickness: number }) {
  const cx = o.offset * M;
  const w = o.width * M;
  const h = o.height * M;
  const sill = o.sill * M;

  if (o.type === 'door') {
    const leafLen = w * 0.94;
    const hingeX = (o.offset - o.width / 2) * M;
    return (
      <group>
        {/* jambs */}
        <mesh position={[(o.offset - o.width / 2) * M, h / 2, 0]} castShadow>
          <boxGeometry args={[0.04, h, thickness * 1.05]} />
          <meshStandardMaterial color="#e6e8ea" roughness={0.8} />
        </mesh>
        <mesh position={[(o.offset + o.width / 2) * M, h / 2, 0]} castShadow>
          <boxGeometry args={[0.04, h, thickness * 1.05]} />
          <meshStandardMaterial color="#e6e8ea" roughness={0.8} />
        </mesh>
        {/* swung-open leaf, hinged at one jamb */}
        <group position={[hingeX, 0, 0]} rotation={[0, -Math.PI / 2.6, 0]}>
          <mesh position={[leafLen / 2, h / 2, 0]} castShadow>
            <boxGeometry args={[leafLen, h * 0.99, 0.04]} />
            <meshStandardMaterial color="#a9744f" roughness={0.6} />
          </mesh>
        </group>
      </group>
    );
  }

  // window: frame ring + glass pane
  const fr = 0.05; // frame section (m)
  const td = thickness * 0.6;
  return (
    <group>
      <mesh position={[cx, sill + h / 2, 0]}>
        <boxGeometry args={[w, h, td * 0.5]} />
        <meshStandardMaterial color="#bfe3f2" transparent opacity={0.35} roughness={0.05} metalness={0.1} />
      </mesh>
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
    </group>
  );
}

function FloorMesh({ room }: { room: Room }) {
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

  const color = FLOOR_BY_ID[room.floorMaterial]?.color ?? room.color;
  return (
    <mesh geometry={geometry} rotation={[Math.PI / 2, 0, 0]} position={[0, 0.002, 0]} receiveShadow>
      <meshStandardMaterial color={color} roughness={0.85} side={THREE.DoubleSide} />
    </mesh>
  );
}

/** Camera framing derived from everything in the design. */
export function useDesignBounds() {
  const { walls, rooms, furniture } = useDesign();
  return useMemo(() => {
    const pts = [
      ...walls.flatMap((w) => [w.start, w.end]),
      ...rooms.flatMap((r) => r.points),
      ...furniture.map((f) => f.position),
    ];
    if (pts.length === 0) {
      return { center: [0, 0, 0] as [number, number, number], radius: 8 };
    }
    const { min, max } = boundsOf(pts);
    const cx = ((min.x + max.x) / 2) * M;
    const cz = ((min.y + max.y) / 2) * M;
    const r = (Math.max(max.x - min.x, max.y - min.y) * M) / 2 + 4;
    return { center: [cx, 0, cz] as [number, number, number], radius: r };
  }, [walls, rooms, furniture]);
}

/**
 * The actual home geometry (walls, floors, furniture). Shared by the live
 * editor view and the path-traced Photo mode so both render the same design.
 */
export default function DesignScene({
  interactive = true,
  dollhouse = false,
}: {
  interactive?: boolean;
  dollhouse?: boolean;
}) {
  const { walls, rooms, furniture, openings, selection, select } = useDesign();
  const { center } = useDesignBounds();
  const openingsByWall = useMemo(() => {
    const m = new Map<string, Opening[]>();
    for (const o of openings) {
      const arr = m.get(o.wallId) ?? [];
      arr.push(o);
      m.set(o.wallId, arr);
    }
    return m;
  }, [openings]);
  return (
    <>
      {rooms.map((r) => (
        <FloorMesh key={r.id} room={r} />
      ))}
      {walls.map((w) => (
        <WallMesh
          key={w.id}
          wall={w}
          openings={openingsByWall.get(w.id) ?? []}
          center={center}
          dollhouse={dollhouse}
        />
      ))}
      {furniture.map((f) => (
        <Furniture3D
          key={f.id}
          item={f}
          selected={interactive && selection.kind === 'furniture' && selection.id === f.id}
          onSelect={() => interactive && select({ kind: 'furniture', id: f.id })}
        />
      ))}
    </>
  );
}
