import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useDesign } from '../../store/designStore';
import { streetPlan, type StreetPlan } from '../../lib/streetPlan';
import { getGroundTexture, type GroundKind } from '../../lib/textures';

const M = 0.01; // cm -> m
const STREET_LENGTH = 180; // m, well past the fog
const noRay = () => null; // scenery: taps go through to the lawn and the house

/** Append an axis-aligned box (centre + size, metres) to a triangle list. */
function box(out: number[], cx: number, cy: number, cz: number, w: number, h: number, d: number) {
  const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2, z0 = cz - d / 2, z1 = cz + d / 2;
  const quad = (a: number[], b: number[], c: number[], e: number[]) => out.push(...a, ...b, ...c, ...a, ...c, ...e);
  quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]);
  quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]);
  quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]);
  quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]);
  quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]);
  quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]);
}

function geometryOf(positions: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  return g;
}

/** A flat slab of ground with a tiling texture at real scale. */
function Slab({ kind, color, patch, x, z, w, d, top }: { kind: GroundKind; color: string; patch: number; x: number; z: number; w: number; d: number; top: number }) {
  const map = useMemo(() => {
    // The cached texture is shared; this slab needs its own repeat.
    const t = getGroundTexture(kind, color, patch).clone();
    t.repeat.set(w / patch, d / patch);
    t.needsUpdate = true;
    return t;
  }, [kind, color, patch, w, d]);
  useEffect(() => () => map.dispose(), [map]);
  return (
    <mesh position={[x, top, z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow raycast={noRay}>
      <planeGeometry args={[w, d]} />
      <meshStandardMaterial map={map} roughness={0.92} />
    </mesh>
  );
}

/** White picket fence along x from `x0` to `x1` at depth z, with gaps. */
function fenceGeometry(x0: number, x1: number, z: number, gaps: [number, number][]): THREE.BufferGeometry {
  const out: number[] = [];
  const cuts = gaps.filter(([a, b]) => b > x0 && a < x1).sort((p, q) => p[0] - q[0]);
  const runs: [number, number][] = [];
  let from = x0;
  for (const [a, b] of cuts) {
    if (a > from) runs.push([from, a]);
    from = Math.max(from, b);
  }
  if (x1 > from) runs.push([from, x1]);
  for (const [a, b] of runs) {
    const len = b - a;
    if (len < 0.3) continue;
    // A post at each end and about every 1.8 m between.
    const bays = Math.max(1, Math.round(len / 1.8));
    for (let i = 0; i <= bays; i++) box(out, a + (len * i) / bays, 0.55, z, 0.09, 1.1, 0.09);
    box(out, (a + b) / 2, 0.3, z, len, 0.07, 0.035);
    box(out, (a + b) / 2, 0.78, z, len, 0.07, 0.035);
    const pickets = Math.max(1, Math.round(len / 0.13));
    for (let i = 0; i < pickets; i++) box(out, a + (len * (i + 0.5)) / pickets, 0.52, z + 0.03, 0.07, 0.92, 0.02);
  }
  return geometryOf(out);
}

function Street({ plan }: { plan: StreetPlan }) {
  const s = useMemo(() => {
    const cm = ([a, b]: [number, number]) => ({ mid: ((a + b) / 2) * M, size: (b - a) * M });
    const plotMid = ((plan.plot[0] + plan.plot[1]) / 2) * M;
    const edge = plan.pavement[0] * M - 0.12; // the boundary line at the back of the pavement
    const gaps: [number, number][] = [[(plan.path.at - plan.path.width / 2) * M - 0.1, (plan.path.at + plan.path.width / 2) * M + 0.1]];
    if (plan.drive) gaps.push([(plan.drive.at - plan.drive.width / 2) * M - 0.15, (plan.drive.at + plan.drive.width / 2) * M + 0.15]);
    const dashes: number[] = [];
    const roadMid = ((plan.road[0] + plan.road[1]) / 2) * M;
    for (let x = -STREET_LENGTH / 2; x < STREET_LENGTH / 2; x += 9) box(dashes, plotMid + x + 1.5, 0.016, roadMid, 3, 0.004, 0.1);
    const back = plan.back * M;
    const hedges: number[] = [];
    const sideLen = edge - back;
    for (const x of [plan.plot[0] * M, plan.plot[1] * M]) box(hedges, x, 0.65, (edge + back) / 2, 0.6, 1.3, sideLen);
    box(hedges, plotMid, 0.65, back, (plan.plot[1] - plan.plot[0]) * M + 0.6, 1.3, 0.6);
    // A hedge along the far side of the street closes the view.
    box(hedges, plotMid, 1.1, plan.farPavement[1] * M + 0.6, STREET_LENGTH, 2.2, 1.0);
    return {
      pavement: cm(plan.pavement), road: cm(plan.road), far: cm(plan.farPavement), plotMid, edge,
      fence: fenceGeometry(plan.plot[0] * M, plan.plot[1] * M, edge, gaps),
      dashes: geometryOf(dashes),
      hedges: geometryOf(hedges),
    };
  }, [plan]);
  useEffect(() => () => {
    s.fence.dispose();
    s.dashes.dispose();
    s.hedges.dispose();
  }, [s]);

  const strip = (item: { at: number; width: number; from: number }, kind: GroundKind, color: string, patch: number, top: number) => {
    const z0 = item.from * M, z1 = plan.pavement[0] * M;
    if (z1 - z0 < 0.2) return null;
    return <Slab kind={kind} color={color} patch={patch} x={item.at * M} z={(z0 + z1) / 2} w={item.width * M} d={z1 - z0} top={top} />;
  };
  // Local x runs along the street and local z out from the house towards it.
  const yaw = Math.atan2(-plan.right.y, plan.right.x);
  return (
    <group position={[plan.origin.x * M, 0, plan.origin.y * M]} rotation={[0, yaw, 0]}>
      <Slab kind="asphalt" color="#45464a" patch={4} x={s.plotMid} z={s.road.mid} w={STREET_LENGTH} d={s.road.size} top={0.012} />
      <mesh geometry={s.dashes} raycast={noRay}>
        <meshStandardMaterial color="#e6e5df" roughness={0.8} />
      </mesh>
      {[s.pavement, s.far].map((band, i) => (
        <group key={i}>
          <Slab kind="paving" color="#b4b2ac" patch={1.2} x={s.plotMid} z={band.mid} w={STREET_LENGTH} d={band.size} top={0.09} />
          {/* Kerb: the raised edge of the pavement, on its road side. */}
          <mesh position={[s.plotMid, 0.045, i === 0 ? band.mid + band.size / 2 : band.mid - band.size / 2]} receiveShadow raycast={noRay}>
            <boxGeometry args={[STREET_LENGTH, 0.09, 0.14]} />
            <meshStandardMaterial color="#a3a19a" roughness={0.9} />
          </mesh>
          <mesh position={[s.plotMid, 0.045, i === 0 ? band.mid - band.size / 2 : band.mid + band.size / 2]} raycast={noRay}>
            <boxGeometry args={[STREET_LENGTH, 0.09, 0.04]} />
            <meshStandardMaterial color="#a3a19a" roughness={0.9} />
          </mesh>
        </group>
      ))}
      {strip(plan.path, 'paving', '#c4c0b6', 0.9, 0.02)}
      {plan.drive && strip(plan.drive, 'gravel', '#a39f95', 1.6, 0.018)}
      <mesh geometry={s.fence} castShadow receiveShadow raycast={noRay}>
        <meshStandardMaterial color="#f1efe9" roughness={0.7} />
      </mesh>
      <mesh geometry={s.hedges} castShadow receiveShadow raycast={noRay}>
        <meshStandardMaterial color="#2e4c29" roughness={1} />
      </mesh>
    </group>
  );
}

/**
 * The street in front of the house: road, pavements, a path to the front door,
 * a drive, a fence along the front and hedges round the plot. Scenery only: it
 * is worked out from the ground floor's plan and none of it can be selected.
 */
export default function StreetScene() {
  const on = useDesign((st) => st.street);
  const ground = useDesign((st) => {
    const lowest = [...st.floors].sort((a, b) => a.elevation - b.elevation)[0];
    return lowest ? st.floorGeom[lowest.id] : undefined;
  });
  const plan = useMemo(() => (on && ground ? streetPlan(ground) : null), [on, ground]);
  return plan ? <Street plan={plan} /> : null;
}
