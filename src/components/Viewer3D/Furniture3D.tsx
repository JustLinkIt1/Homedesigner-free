import { Suspense, type ReactNode } from 'react';
import { CATALOG_BY_TYPE, type Shape3D } from '../../data/furnitureCatalog';
import GltfFurniture, { hasModel } from './GltfFurniture';
import type { FurnitureItem } from '../../types';

const M = 0.01; // cm -> m

/** Lighten (amt>0) / darken (amt<0) a hex color by an integer amount. */
function shade(hex: string, amt: number): string {
  const h = hex.replace('#', '');
  if (h.length < 6) return hex;
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const r = clamp(parseInt(h.slice(0, 2), 16) + amt);
  const g = clamp(parseInt(h.slice(2, 4), 16) + amt);
  const b = clamp(parseInt(h.slice(4, 6), 16) + amt);
  return `rgb(${r},${g},${b})`;
}

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
      {hasModel(item.type) ? (
        // Real model loads lazily; show the procedural mesh until it arrives.
        <Suspense fallback={<ShapeMesh shape={shape} w={w} d={d} h={h} color={color} />}>
          <GltfFurniture item={item} />
        </Suspense>
      ) : (
        <ShapeMesh shape={shape} w={w} d={d} h={h} color={color} />
      )}
    </group>
  );
}

function Box({
  w, d, h, y, color, dx = 0, dz = 0, radius = 0, roughness = 0.7, metalness = 0.05,
}: { w: number; d: number; h: number; y: number; color: string; dx?: number; dz?: number; radius?: number; roughness?: number; metalness?: number }) {
  void radius;
  return (
    <mesh position={[dx, y, dz]} castShadow receiveShadow>
      <boxGeometry args={[w, h, d]} />
      <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />
    </mesh>
  );
}

/** Cylindrical leg / post helper. */
function Leg({
  r, h, y, color = '#4a3a28', dx = 0, dz = 0,
}: { r: number; h: number; y: number; color?: string; dx?: number; dz?: number }) {
  return (
    <mesh position={[dx, y, dz]} castShadow>
      <cylinderGeometry args={[r, r, h, 10]} />
      <meshStandardMaterial color={color} roughness={0.6} metalness={0.2} />
    </mesh>
  );
}

/** Four legs (box or cylinder) at the corners of a w x d footprint. */
function FourLegs({
  w, d, h, y, color = '#4a3a28', inset = 0.42, thick = 0.07,
}: { w: number; d: number; h: number; y: number; color?: string; inset?: number; thick?: number }) {
  const corners: Array<[number, number]> = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
  return (
    <>
      {corners.map(([sx, sz], i) => (
        <Box key={i} w={w * thick} d={d * thick} h={h} y={y}
          dx={sx * w * inset} dz={sz * d * inset} color={color} />
      ))}
    </>
  );
}

function ShapeMesh({
  shape, w, d, h, color,
}: { shape: Shape3D; w: number; d: number; h: number; color: string }) {
  switch (shape) {
    case 'sofa': {
      const seatTop = h * 0.45;
      return (
        <group>
          {/* base / frame */}
          <Box w={w} d={d} h={h * 0.32} y={h * 0.16} color={shade(color, -18)} />
          {/* seat cushions */}
          <Box w={w * 0.46} d={d * 0.7} h={h * 0.16} y={seatTop} dx={-w * 0.24} dz={d * 0.06} color={color} roughness={0.95} />
          <Box w={w * 0.46} d={d * 0.7} h={h * 0.16} y={seatTop} dx={w * 0.24} dz={d * 0.06} color={color} roughness={0.95} />
          {/* back cushions */}
          <Box w={w * 0.46} d={d * 0.24} h={h * 0.5} y={h * 0.55} dx={-w * 0.24} dz={-d * 0.34} color={shade(color, 10)} roughness={0.95} />
          <Box w={w * 0.46} d={d * 0.24} h={h * 0.5} y={h * 0.55} dx={w * 0.24} dz={-d * 0.34} color={shade(color, 10)} roughness={0.95} />
          {/* arms */}
          <Box w={w * 0.1} d={d} h={h * 0.6} y={h * 0.36} dx={-w * 0.45} color={color} />
          <Box w={w * 0.1} d={d} h={h * 0.6} y={h * 0.36} dx={w * 0.45} color={color} />
          {/* feet */}
          <FourLegs w={w} d={d} h={h * 0.12} y={h * 0.06} color={'#2c2c30'} inset={0.42} thick={0.05} />
        </group>
      );
    }
    case 'bed':
      return (
        <group>
          {/* frame */}
          <Box w={w} d={d} h={h * 0.32} y={h * 0.28} color={'#8a6f4e'} />
          {/* mattress */}
          <Box w={w * 0.96} d={d * 0.94} h={h * 0.26} y={h * 0.57} color={'#e9e3d6'} roughness={0.9} />
          {/* duvet (foot two-thirds) */}
          <Box w={w * 0.96} d={d * 0.6} h={h * 0.3} y={h * 0.6} dz={d * 0.18} color={shade(color, 6)} roughness={0.95} />
          {/* headboard */}
          <Box w={w} d={d * 0.1} h={h * 1.3} y={h * 0.65} dz={-d * 0.46} color={'#7a5f40'} />
          {/* pillows */}
          <Box w={w * 0.4} d={d * 0.18} h={h * 0.2} y={h * 0.78} dz={-d * 0.32} dx={-w * 0.22} color={'#ffffff'} roughness={0.95} />
          <Box w={w * 0.4} d={d * 0.18} h={h * 0.2} y={h * 0.78} dz={-d * 0.32} dx={w * 0.22} color={'#ffffff'} roughness={0.95} />
          {/* legs */}
          <FourLegs w={w} d={d} h={h * 0.12} y={h * 0.06} color={'#5a4530'} inset={0.46} thick={0.05} />
        </group>
      );
    case 'chair':
      return (
        <group>
          {/* seat */}
          <Box w={w} d={d} h={h * 0.1} y={h * 0.45} color={color} roughness={0.85} />
          {/* seat cushion */}
          <Box w={w * 0.86} d={d * 0.86} h={h * 0.06} y={h * 0.53} color={shade(color, 14)} roughness={0.95} />
          {/* backrest */}
          <Box w={w} d={d * 0.1} h={h * 0.5} y={h * 0.72} dz={-d * 0.44} color={color} />
          <FourLegs w={w} d={d} h={h * 0.45} y={h * 0.225} color={shade(color, -45)} inset={0.42} thick={0.08} />
        </group>
      );
    case 'stool':
      return (
        <group>
          <mesh position={[0, h * 0.92, 0]} castShadow>
            <cylinderGeometry args={[w * 0.5, w * 0.5, h * 0.12, 16]} />
            <meshStandardMaterial color={color} roughness={0.85} />
          </mesh>
          <Leg r={w * 0.05} h={h * 0.86} y={h * 0.43} color={shade(color, -30)} dx={-w * 0.32} dz={-d * 0.32} />
          <Leg r={w * 0.05} h={h * 0.86} y={h * 0.43} color={shade(color, -30)} dx={w * 0.32} dz={-d * 0.32} />
          <Leg r={w * 0.05} h={h * 0.86} y={h * 0.43} color={shade(color, -30)} dx={-w * 0.32} dz={d * 0.32} />
          <Leg r={w * 0.05} h={h * 0.86} y={h * 0.43} color={shade(color, -30)} dx={w * 0.32} dz={d * 0.32} />
        </group>
      );
    case 'ottoman':
      return (
        <group>
          <Box w={w} d={d} h={h * 0.75} y={h * 0.45} color={color} roughness={0.95} />
          <FourLegs w={w} d={d} h={h * 0.2} y={h * 0.1} color={'#3a2c1e'} inset={0.4} thick={0.07} />
        </group>
      );
    case 'side_table':
      return (
        <group>
          <Box w={w} d={d} h={h * 0.1} y={h * 0.95} color={color} roughness={0.55} />
          <Box w={w} d={d} h={h * 0.08} y={h * 0.5} color={shade(color, -10)} roughness={0.6} />
          <FourLegs w={w} d={d} h={h * 0.9} y={h * 0.45} color={shade(color, -35)} inset={0.42} thick={0.08} />
        </group>
      );
    case 'table':
      return (
        <group>
          <Box w={w} d={d} h={h * 0.08} y={h * 0.94} color={color} roughness={0.55} />
          <FourLegs w={w} d={d} h={h * 0.9} y={h * 0.45} color={shade(color, -35)} inset={0.44} thick={0.07} />
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
    case 'bookshelf': {
      const shelves = Math.max(3, Math.round(h / 0.4));
      const t = h * 0.012; // shelf thickness
      const sideT = w * 0.06;
      const items: ReactNode[] = [];
      // sides, top, bottom, back
      items.push(<Box key="ls" w={sideT} d={d} h={h} y={h * 0.5} dx={-w * 0.5 + sideT * 0.5} color={color} />);
      items.push(<Box key="rs" w={sideT} d={d} h={h} y={h * 0.5} dx={w * 0.5 - sideT * 0.5} color={color} />);
      items.push(<Box key="bk" w={w} d={d * 0.06} h={h} y={h * 0.5} dz={-d * 0.47} color={shade(color, -25)} />);
      for (let i = 0; i <= shelves; i++) {
        const sy = (i / shelves) * h;
        items.push(<Box key={`sh${i}`} w={w - sideT * 2} d={d * 0.9} h={t} y={Math.min(h - t * 0.5, Math.max(t * 0.5, sy))} color={shade(color, 12)} />);
      }
      // a few colored "books" on alternating shelves
      const bookColors = ['#a23b3b', '#3b6ea2', '#3ba25b', '#a2913b', '#7a3ba2'];
      for (let i = 1; i < shelves; i += 1) {
        if (i % 1 !== 0) continue;
        const sy = (i / shelves) * h + t;
        const bw = (w - sideT * 2) * 0.7;
        items.push(
          <Box key={`bk${i}`} w={bw} d={d * 0.7} h={(h / shelves) * 0.7} y={sy + (h / shelves) * 0.35}
            dx={-(w - sideT * 2) * 0.08} color={bookColors[i % bookColors.length]} roughness={0.85} />,
        );
      }
      return <group>{items}</group>;
    }
    case 'crib':
      return (
        <group>
          {/* mattress base */}
          <Box w={w * 0.92} d={d * 0.92} h={h * 0.18} y={h * 0.4} color={'#f3ecdd'} roughness={0.9} />
          {/* rails (slatted look via thin top/bottom rails) */}
          <Box w={w} d={d * 0.05} h={h * 0.06} y={h * 0.95} dz={-d * 0.47} color={color} />
          <Box w={w} d={d * 0.05} h={h * 0.06} y={h * 0.95} dz={d * 0.47} color={color} />
          <Box w={w * 0.05} d={d} h={h * 0.06} y={h * 0.95} dx={-w * 0.47} color={color} />
          <Box w={w * 0.05} d={d} h={h * 0.06} y={h * 0.95} dx={w * 0.47} color={color} />
          {/* corner posts */}
          <FourLegs w={w} d={d} h={h} y={h * 0.5} color={color} inset={0.47} thick={0.06} />
        </group>
      );
    case 'pendant':
      return (
        <group>
          {/* cord from ceiling */}
          <mesh position={[0, h * 1.2, 0]}>
            <cylinderGeometry args={[0.006, 0.006, h * 1.4, 6]} />
            <meshStandardMaterial color="#222" />
          </mesh>
          {/* shade */}
          <mesh position={[0, h * 0.5, 0]} castShadow>
            <coneGeometry args={[w * 0.5, h * 0.7, 20, 1, true]} />
            <meshStandardMaterial color={color} side={2} roughness={0.5} metalness={0.3} />
          </mesh>
          {/* bulb */}
          <mesh position={[0, h * 0.3, 0]}>
            <sphereGeometry args={[w * 0.16, 12, 12]} />
            <meshStandardMaterial color="#fff6d8" emissive="#ffe9b0" emissiveIntensity={1.4} />
          </mesh>
          <pointLight position={[0, h * 0.25, 0]} intensity={8} distance={5} color="#ffe9c0" castShadow />
        </group>
      );
    case 'ceiling_light':
      return (
        <group>
          <mesh position={[0, h * 0.4, 0]}>
            <cylinderGeometry args={[w * 0.5, w * 0.5, h, 24]} />
            <meshStandardMaterial color={color} emissive="#fff4d6" emissiveIntensity={0.8} roughness={0.4} />
          </mesh>
          <pointLight position={[0, 0, 0]} intensity={7} distance={6} color="#fff1d0" />
        </group>
      );
    case 'desk_lamp':
      return (
        <group>
          {/* base */}
          <mesh position={[0, h * 0.04, 0]} castShadow>
            <cylinderGeometry args={[w * 0.45, w * 0.5, h * 0.08, 16]} />
            <meshStandardMaterial color={shade(color, -10)} roughness={0.4} metalness={0.3} />
          </mesh>
          {/* arm */}
          <mesh position={[0, h * 0.45, -d * 0.05]} rotation={[0.25, 0, 0]} castShadow>
            <cylinderGeometry args={[w * 0.06, w * 0.06, h * 0.8, 8]} />
            <meshStandardMaterial color={color} roughness={0.4} metalness={0.4} />
          </mesh>
          {/* head */}
          <mesh position={[0, h * 0.85, d * 0.18]} rotation={[1.0, 0, 0]} castShadow>
            <coneGeometry args={[w * 0.45, h * 0.35, 16, 1, true]} />
            <meshStandardMaterial color={color} side={2} emissive="#ffe9b0" emissiveIntensity={0.5} roughness={0.5} />
          </mesh>
          <pointLight position={[0, h * 0.8, d * 0.3]} intensity={3} distance={2.5} color="#ffe9c0" />
        </group>
      );
    case 'mirror':
      return (
        <group>
          {/* frame */}
          <Box w={w} d={d} h={h} y={h * 0.5} color={shade(color, -60)} roughness={0.5} metalness={0.4} />
          {/* glass */}
          <mesh position={[0, h * 0.5, d * 0.55]}>
            <planeGeometry args={[w * 0.88, h * 0.9]} />
            <meshStandardMaterial color="#dfeef4" roughness={0.05} metalness={0.9} envMapIntensity={1} />
          </mesh>
        </group>
      );
    case 'wall_art':
      return (
        <group>
          <Box w={w} d={d} h={h} y={h * 0.5} color={shade(color, -50)} roughness={0.5} />
          <mesh position={[0, h * 0.5, d * 0.55]}>
            <planeGeometry args={[w * 0.86, h * 0.86]} />
            <meshStandardMaterial color={color} roughness={0.85} />
          </mesh>
        </group>
      );
    case 'curtains':
      return (
        <group>
          {/* rod */}
          <mesh position={[0, h * 0.99, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[w * 0.02, w * 0.02, w * 1.04, 8]} />
            <meshStandardMaterial color="#5a5a5a" metalness={0.5} roughness={0.4} />
          </mesh>
          {/* folded panels: several thin vertical pleats */}
          {Array.from({ length: 10 }).map((_, i) => {
            const fx = (i / 9 - 0.5) * w * 0.94;
            const fd = (i % 2 === 0 ? 1 : -1) * d * 0.18;
            return (
              <Box key={i} w={w * 0.12} d={d * 0.2} h={h * 0.96} y={h * 0.48} dx={fx} dz={fd}
                color={i % 2 === 0 ? color : shade(color, -18)} roughness={0.95} />
            );
          })}
        </group>
      );
    case 'stove':
      return (
        <group>
          {/* body */}
          <Box w={w} d={d} h={h} y={h * 0.5} color={color} roughness={0.4} metalness={0.3} />
          {/* oven door / window */}
          <mesh position={[0, h * 0.32, d * 0.51]}>
            <planeGeometry args={[w * 0.8, h * 0.45]} />
            <meshStandardMaterial color="#1a1a1f" roughness={0.2} metalness={0.5} />
          </mesh>
          {/* control panel */}
          <Box w={w} d={d * 0.96} h={h * 0.08} y={h * 0.66} dz={-d * 0.02} color={shade(color, -25)} />
          {/* cooktop */}
          <Box w={w * 0.98} d={d * 0.98} h={h * 0.02} y={h * 1.0} color={'#26262b'} roughness={0.3} />
          {/* burners */}
          {([[-1, -1], [1, -1], [-1, 1], [1, 1]] as Array<[number, number]>).map(([sx, sz], i) => (
            <mesh key={i} position={[sx * w * 0.26, h * 1.01, sz * d * 0.26]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[w * 0.06, w * 0.14, 20]} />
              <meshStandardMaterial color="#3a3a40" roughness={0.4} metalness={0.5} side={2} />
            </mesh>
          ))}
        </group>
      );
    case 'sink':
      return (
        <group>
          {/* counter / cabinet body */}
          <Box w={w} d={d} h={h * 0.9} y={h * 0.45} color={color} roughness={0.5} />
          {/* counter top */}
          <Box w={w} d={d} h={h * 0.06} y={h * 0.92} color={shade(color, -8)} roughness={0.35} />
          {/* basin (recessed) */}
          <mesh position={[0, h * 0.86, 0]}>
            <boxGeometry args={[w * 0.55, h * 0.16, d * 0.6]} />
            <meshStandardMaterial color="#cfd6da" roughness={0.2} metalness={0.4} />
          </mesh>
          {/* faucet */}
          <mesh position={[0, h * 1.0, -d * 0.28]} castShadow>
            <cylinderGeometry args={[w * 0.03, w * 0.03, h * 0.2, 8]} />
            <meshStandardMaterial color="#b8bcc0" metalness={0.8} roughness={0.2} />
          </mesh>
          <mesh position={[0, h * 1.1, -d * 0.18]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[w * 0.025, w * 0.025, d * 0.22, 8]} />
            <meshStandardMaterial color="#b8bcc0" metalness={0.8} roughness={0.2} />
          </mesh>
        </group>
      );
    case 'vanity':
      return (
        <group>
          {/* cabinet */}
          <Box w={w} d={d} h={h * 0.85} y={h * 0.425} color={color} roughness={0.6} />
          {/* counter */}
          <Box w={w * 1.02} d={d * 1.02} h={h * 0.07} y={h * 0.88} color={'#e9e6df'} roughness={0.3} />
          {/* basin */}
          <mesh position={[0, h * 0.9, 0]}>
            <cylinderGeometry args={[w * 0.18, w * 0.14, h * 0.1, 18]} />
            <meshStandardMaterial color="#f2f4f6" roughness={0.2} />
          </mesh>
          {/* faucet */}
          <mesh position={[0, h * 1.0, -d * 0.25]}>
            <cylinderGeometry args={[w * 0.02, w * 0.02, h * 0.16, 8]} />
            <meshStandardMaterial color="#b8bcc0" metalness={0.8} roughness={0.2} />
          </mesh>
        </group>
      );
    case 'cabinets':
      return (
        <group>
          {/* body */}
          <Box w={w} d={d} h={h * 0.9} y={h * 0.45} color={color} roughness={0.6} />
          {/* counter top */}
          <Box w={w * 1.02} d={d * 1.04} h={h * 0.08} y={h * 0.94} color={shade(color, -30)} roughness={0.35} />
          {/* doors split */}
          <mesh position={[-w * 0.25, h * 0.45, d * 0.51]}>
            <planeGeometry args={[w * 0.44, h * 0.78]} />
            <meshStandardMaterial color={shade(color, -12)} roughness={0.55} />
          </mesh>
          <mesh position={[w * 0.25, h * 0.45, d * 0.51]}>
            <planeGeometry args={[w * 0.44, h * 0.78]} />
            <meshStandardMaterial color={shade(color, -12)} roughness={0.55} />
          </mesh>
          {/* handles */}
          <Box w={w * 0.015} d={d * 0.04} h={h * 0.18} y={h * 0.45} dx={-w * 0.05} dz={d * 0.54} color={'#888'} metalness={0.7} />
          <Box w={w * 0.015} d={d * 0.04} h={h * 0.18} y={h * 0.45} dx={w * 0.05} dz={d * 0.54} color={'#888'} metalness={0.7} />
        </group>
      );
    case 'dishwasher':
    case 'washer':
      return (
        <group>
          <Box w={w} d={d} h={h} y={h * 0.5} color={color} roughness={0.35} metalness={0.3} />
          {/* door */}
          <mesh position={[0, h * 0.48, d * 0.51]}>
            <planeGeometry args={[w * 0.82, h * 0.7]} />
            <meshStandardMaterial color={shade(color, -18)} roughness={0.3} metalness={0.2} />
          </mesh>
          {/* round window for washer */}
          {shape === 'washer' && (
            <mesh position={[0, h * 0.45, d * 0.52]}>
              <circleGeometry args={[w * 0.28, 24]} />
              <meshStandardMaterial color="#2a3a44" roughness={0.1} metalness={0.6} />
            </mesh>
          )}
          {/* control strip */}
          <Box w={w * 0.96} d={d * 0.02} h={h * 0.08} y={h * 0.9} dz={d * 0.5} color={shade(color, -30)} />
        </group>
      );
    case 'shower':
      return (
        <group>
          {/* tray */}
          <Box w={w} d={d} h={h * 0.04} y={h * 0.02} color={'#e6ebee'} roughness={0.3} />
          {/* glass walls (two sides) */}
          <mesh position={[0, h * 0.5, d * 0.5]}>
            <boxGeometry args={[w, h, 0.01]} />
            <meshStandardMaterial color="#cfe6ee" transparent opacity={0.22} roughness={0.05} metalness={0.2} />
          </mesh>
          <mesh position={[-w * 0.5, h * 0.5, 0]}>
            <boxGeometry args={[0.01, h, d]} />
            <meshStandardMaterial color="#cfe6ee" transparent opacity={0.22} roughness={0.05} metalness={0.2} />
          </mesh>
          {/* shower head */}
          <mesh position={[w * 0.3, h * 0.92, -d * 0.3]}>
            <cylinderGeometry args={[w * 0.1, w * 0.1, h * 0.03, 16]} />
            <meshStandardMaterial color="#b8bcc0" metalness={0.8} roughness={0.2} />
          </mesh>
        </group>
      );
    case 'monitor':
      return (
        <group>
          {/* screen */}
          <Box w={w} d={d * 0.2} h={h * 0.75} y={h * 0.7} color={'#15151a'} />
          <mesh position={[0, h * 0.7, d * 0.12]}>
            <planeGeometry args={[w * 0.92, h * 0.66]} />
            <meshStandardMaterial color="#1b3a6b" emissive="#16335f" emissiveIntensity={0.6} />
          </mesh>
          {/* stand neck + base */}
          <Box w={w * 0.06} d={d * 0.1} h={h * 0.35} y={h * 0.2} color={'#2a2a30'} />
          <Box w={w * 0.4} d={d} h={h * 0.04} y={h * 0.02} color={'#2a2a30'} />
        </group>
      );
    case 'stairs': {
      const steps = Math.max(6, Math.round(h / 0.18));
      const stepH = h / steps;
      const stepD = d / steps;
      return (
        <group>
          {Array.from({ length: steps }).map((_, i) => (
            <Box key={i} w={w} d={stepD} h={stepH}
              y={stepH * (i + 0.5)}
              dz={-d * 0.5 + stepD * (i + 0.5)}
              color={i % 2 === 0 ? color : shade(color, -14)}
              roughness={0.7} />
          ))}
        </group>
      );
    }
    default:
      return <Box w={w} d={d} h={h} y={h * 0.5} color={color} />;
  }
}
