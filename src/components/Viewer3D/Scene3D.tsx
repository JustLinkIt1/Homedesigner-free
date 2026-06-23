import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, SoftShadows } from '@react-three/drei';
import * as THREE from 'three';
import { useDesign } from '../../store/designStore';
import { FLOOR_BY_ID } from '../../data/furnitureCatalog';
import { dist, angleDeg, boundsOf } from '../../lib/geometry';
import Furniture3D from './Furniture3D';
import type { Room, Wall } from '../../types';

const M = 0.01; // cm -> m

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

export default function Scene3D() {
  const { walls, rooms, furniture, selection, select, clearSelection } = useDesign();

  // Frame the camera around the design's extent.
  const { center, radius } = useMemo(() => {
    const pts = [
      ...walls.flatMap((w) => [w.start, w.end]),
      ...rooms.flatMap((r) => r.points),
      ...furniture.map((f) => f.position),
    ];
    if (pts.length === 0) return { center: [0, 0, 0] as [number, number, number], radius: 8 };
    const { min, max } = boundsOf(pts);
    const cx = ((min.x + max.x) / 2) * M;
    const cz = ((min.y + max.y) / 2) * M;
    const r = (Math.max(max.x - min.x, max.y - min.y) * M) / 2 + 4;
    return { center: [cx, 0, cz] as [number, number, number], radius: r };
  }, [walls, rooms, furniture]);

  return (
    <Canvas
      shadows
      camera={{ position: [center[0] + radius, radius * 1.1, center[2] + radius], fov: 50 }}
      style={{ position: 'absolute', inset: 0 }}
      onPointerMissed={() => clearSelection()}
    >
      <color attach="background" args={['#0c0e13']} />
      <fog attach="fog" args={['#0c0e13', radius * 3, radius * 8]} />
      <SoftShadows size={24} samples={12} />

      <ambientLight intensity={0.55} />
      <hemisphereLight intensity={0.5} groundColor="#1a1c22" />
      <directionalLight
        position={[center[0] + 12, 22, center[2] + 8]}
        intensity={1.7}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-radius * 2}
        shadow-camera-right={radius * 2}
        shadow-camera-top={radius * 2}
        shadow-camera-bottom={-radius * 2}
        shadow-camera-far={80}
      />
      {/* Soft fill from the opposite side so shadowed faces stay readable. */}
      <directionalLight position={[center[0] - 14, 12, center[2] - 10]} intensity={0.5} color="#cdd8ff" />

      {/* Ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[center[0], -0.01, center[2]]} receiveShadow>
        <planeGeometry args={[400, 400]} />
        <meshStandardMaterial color="#15171d" roughness={1} />
      </mesh>
      <Grid
        position={[center[0], 0, center[2]]}
        args={[120, 120]}
        cellSize={1}
        cellColor="#23262e"
        sectionSize={5}
        sectionColor="#2e3340"
        fadeDistance={radius * 6}
        infiniteGrid
      />

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
          selected={selection.kind === 'furniture' && selection.id === f.id}
          onSelect={() => select({ kind: 'furniture', id: f.id })}
        />
      ))}

      <OrbitControls
        target={center}
        maxPolarAngle={Math.PI / 2.05}
        minDistance={2}
        maxDistance={radius * 8 + 20}
        makeDefault
      />
    </Canvas>
  );
}
