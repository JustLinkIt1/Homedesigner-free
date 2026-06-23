import { useMemo } from 'react';
import * as THREE from 'three';
import { useDesign } from '../../store/designStore';
import { FLOOR_BY_ID } from '../../data/furnitureCatalog';
import { dist, angleDeg, boundsOf } from '../../lib/geometry';
import Furniture3D from './Furniture3D';
import type { Room, Wall } from '../../types';

export const M = 0.01; // cm -> m

function WallMesh({ wall }: { wall: Wall }) {
  const len = dist(wall.start, wall.end) * M;
  const mx = ((wall.start.x + wall.end.x) / 2) * M;
  const mz = ((wall.start.y + wall.end.y) / 2) * M;
  const angle = (-angleDeg(wall.start, wall.end) * Math.PI) / 180;
  const h = wall.height * M;
  const t = wall.thickness * M;
  return (
    <mesh position={[mx, h / 2, mz]} rotation={[0, angle, 0]} castShadow receiveShadow>
      <boxGeometry args={[len + t, h, t]} />
      <meshStandardMaterial color={wall.color} roughness={0.92} metalness={0} />
    </mesh>
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
export default function DesignScene({ interactive = true }: { interactive?: boolean }) {
  const { walls, rooms, furniture, selection, select } = useDesign();
  return (
    <>
      {rooms.map((r) => (
        <FloorMesh key={r.id} room={r} />
      ))}
      {walls.map((w) => (
        <WallMesh key={w.id} wall={w} />
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
