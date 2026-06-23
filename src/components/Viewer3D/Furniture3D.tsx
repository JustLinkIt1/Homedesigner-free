import { CATALOG_BY_TYPE, type Shape3D } from '../../data/furnitureCatalog';
import type { FurnitureItem } from '../../types';

const M = 0.01; // cm -> m

/** Build a recognizable 3D representation per furniture shape. */
export default function Furniture3D({
  item,
  selected,
  onSelect,
}: {
  item: FurnitureItem;
  selected: boolean;
  onSelect: () => void;
}) {
  const w = item.width * M;
  const d = item.depth * M;
  const h = item.height * M;
  const entry = CATALOG_BY_TYPE[item.type];
  const shape: Shape3D = entry?.shape ?? 'box';
  const color = item.color;

  return (
    <group
      position={[item.position.x * M, 0, item.position.y * M]}
      rotation={[0, (-item.rotation * Math.PI) / 180, 0]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      {selected && (
        <mesh position={[0, h / 2 + 0.01, 0]}>
          <boxGeometry args={[w + 0.06, h + 0.06, d + 0.06]} />
          <meshBasicMaterial color="#4c8dff" wireframe transparent opacity={0.7} />
        </mesh>
      )}
      <ShapeMesh shape={shape} w={w} d={d} h={h} color={color} />
    </group>
  );
}

function Box({
  w, d, h, y, color, dx = 0, dz = 0, radius = 0,
}: { w: number; d: number; h: number; y: number; color: string; dx?: number; dz?: number; radius?: number }) {
  return (
    <mesh position={[dx, y, dz]} castShadow receiveShadow>
      <boxGeometry args={[w, h, d]} />
      <meshStandardMaterial color={color} roughness={0.7} metalness={0.05} />
    </mesh>
  );
}

function ShapeMesh({
  shape, w, d, h, color,
}: { shape: Shape3D; w: number; d: number; h: number; color: string }) {
  switch (shape) {
    case 'sofa':
      return (
        <group>
          <Box w={w} d={d} h={h * 0.45} y={h * 0.225} color={color} />
          <Box w={w} d={d * 0.3} h={h} y={h * 0.5} dz={-d * 0.35} color={color} />
          <Box w={w * 0.12} d={d} h={h * 0.7} y={h * 0.35} dx={-w * 0.44} color={color} />
          <Box w={w * 0.12} d={d} h={h * 0.7} y={h * 0.35} dx={w * 0.44} color={color} />
        </group>
      );
    case 'bed':
      return (
        <group>
          <Box w={w} d={d} h={h * 0.5} y={h * 0.25} color={'#8a6f4e'} />
          <Box w={w * 0.96} d={d * 0.94} h={h * 0.3} y={h * 0.62} color={'#e9e3d6'} />
          <Box w={w} d={d * 0.12} h={h * 1.3} y={h * 0.65} dz={-d * 0.46} color={'#7a5f40'} />
          {/* pillows */}
          <Box w={w * 0.4} d={d * 0.16} h={h * 0.18} y={h * 0.82} dz={-d * 0.32} dx={-w * 0.22} color={'#ffffff'} />
          <Box w={w * 0.4} d={d * 0.16} h={h * 0.18} y={h * 0.82} dz={-d * 0.32} dx={w * 0.22} color={'#ffffff'} />
        </group>
      );
    case 'chair':
      return (
        <group>
          <Box w={w} d={d} h={h * 0.08} y={h * 0.45} color={color} />
          <Box w={w} d={d * 0.12} h={h * 0.55} y={h * 0.72} dz={-d * 0.44} color={color} />
          {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
            <Box key={i} w={w * 0.08} d={d * 0.08} h={h * 0.45} y={h * 0.225}
              dx={sx * w * 0.42} dz={sz * d * 0.42} color={'#4a3a28'} />
          ))}
        </group>
      );
    case 'table':
      return (
        <group>
          <Box w={w} d={d} h={h * 0.08} y={h * 0.94} color={color} />
          {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
            <Box key={i} w={w * 0.07} d={d * 0.07} h={h * 0.9} y={h * 0.45}
              dx={sx * w * 0.44} dz={sz * d * 0.44} color={'#5a4530'} />
          ))}
        </group>
      );
    case 'lamp':
      return (
        <group>
          <mesh position={[0, h * 0.5, 0]} castShadow>
            <cylinderGeometry args={[0.02, 0.02, h, 8]} />
            <meshStandardMaterial color="#3a3a3a" />
          </mesh>
          <mesh position={[0, h, 0]} castShadow>
            <coneGeometry args={[w * 0.6, h * 0.18, 16, 1, true]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} />
          </mesh>
          <pointLight position={[0, h * 0.95, 0]} intensity={6} distance={4} color="#ffe9c0" />
        </group>
      );
    case 'plant':
      return (
        <group>
          <mesh position={[0, h * 0.15, 0]} castShadow>
            <cylinderGeometry args={[w * 0.35, w * 0.28, h * 0.3, 12]} />
            <meshStandardMaterial color="#9c6b3f" />
          </mesh>
          <mesh position={[0, h * 0.62, 0]} castShadow>
            <sphereGeometry args={[w * 0.55, 12, 12]} />
            <meshStandardMaterial color={color} roughness={0.9} />
          </mesh>
        </group>
      );
    case 'rug':
      return (
        <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[w, d]} />
          <meshStandardMaterial color={color} roughness={1} />
        </mesh>
      );
    case 'tv':
      return (
        <group>
          <Box w={w} d={d} h={h} y={h * 0.5 + 0.4} color={'#111114'} />
          <mesh position={[0, h * 0.5 + 0.4, d * 0.55]}>
            <planeGeometry args={[w * 0.92, h * 0.86]} />
            <meshStandardMaterial color="#2a3a5a" emissive="#1a2a4a" emissiveIntensity={0.5} />
          </mesh>
        </group>
      );
    case 'fridge':
      return (
        <group>
          <Box w={w} d={d} h={h} y={h * 0.5} color={color} radius={0.04} />
          <Box w={w * 0.05} d={d * 0.05} h={h * 0.3} y={h * 0.6} dx={w * 0.4} dz={d * 0.5} color={'#888'} />
        </group>
      );
    case 'toilet':
      return (
        <group>
          <Box w={w} d={d * 0.5} h={h} y={h * 0.5} dz={-d * 0.25} color={color} />
          <mesh position={[0, h * 0.4, d * 0.1]} castShadow>
            <cylinderGeometry args={[w * 0.45, w * 0.4, h * 0.5, 16]} />
            <meshStandardMaterial color={color} roughness={0.3} />
          </mesh>
        </group>
      );
    case 'bathtub':
      return (
        <group>
          <Box w={w} d={d} h={h} y={h * 0.5} color={color} />
          <mesh position={[0, h * 0.7, 0]}>
            <boxGeometry args={[w * 0.85, h * 0.5, d * 0.8]} />
            <meshStandardMaterial color="#cfe6f0" />
          </mesh>
        </group>
      );
    case 'door':
      return <Box w={w} d={d} h={h} y={h * 0.5} color={color} />;
    case 'window':
      return (
        <mesh position={[0, h * 0.5 + 0.9, 0]}>
          <boxGeometry args={[w, h, d]} />
          <meshStandardMaterial color={color} transparent opacity={0.4} roughness={0.1} metalness={0.2} />
        </mesh>
      );
    default:
      return <Box w={w} d={d} h={h} y={h * 0.5} color={color} />;
  }
}
