// Model↔catalogue proportion check.
//
// GltfFurniture scales a GLB to the catalogue FOOTPRINT and keeps the model's
// own proportions (`scale = min(width/size.x, depth/size.z)`); `item.height` is
// deliberately not part of that minimum. That is correct only while the model's
// shape roughly matches the catalogue entry it is bound to. When it does not,
// the object silently renders at the wrong size — a bathtub came out 24cm tall
// against a catalogue height of 55cm, and nothing anywhere failed.
//
// This reproduces the renderer's own arithmetic over every bundled GLB and
// reports the height it will actually draw. Pure Node: the glTF JSON chunk
// carries POSITION accessor min/max per primitive, and node transforms compose
// to a world bounding box without decoding a single vertex — so meshopt- and
// Draco-compressed models measure fine with no decoder.
//
//   node tests/models.mjs
import { readFileSync, readdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = process.cwd();

// --- catalogue (via esbuild, same trick as tests/geometry.mjs) ---------------
const dir = mkdtempSync(join(tmpdir(), 'hdmodels-'));
const entry = join(root, '.models-entry.tmp.ts');
writeFileSync(entry, `
export { CATALOG_BY_TYPE } from '${root}/src/data/furnitureCatalog.ts';
export { MODEL_FILE, MODEL_FIT, MODEL_YAW } from '${root}/src/data/furnitureModels.ts';
`);
const bundle = join(dir, 'b.mjs');
execFileSync(join(root, 'node_modules/.bin/esbuild'), [
  entry, '--bundle', '--format=esm', '--platform=node',
  '--define:import.meta.env.BASE_URL="/"', `--outfile=${bundle}`,
], { stdio: 'pipe' });
rmSync(entry, { force: true });
const { CATALOG_BY_TYPE, MODEL_FILE, MODEL_FIT, MODEL_YAW } = await import(bundle);

let fails = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) fails++;
};

// --- world-space bounding box straight from the glTF JSON -------------------
function worldBox(glbPath) {
  const b = readFileSync(glbPath);
  if (b.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB');
  const jsonLen = b.readUInt32LE(12);
  const gltf = JSON.parse(b.subarray(20, 20 + jsonLen).toString('utf8'));
  const acc = gltf.accessors ?? [];

  const matOf = (n) => {
    if (n.matrix) {
      const m = n.matrix; // glTF matrices are column-major
      return [[m[0], m[4], m[8], m[12]], [m[1], m[5], m[9], m[13]],
        [m[2], m[6], m[10], m[14]], [m[3], m[7], m[11], m[15]]];
    }
    const [tx, ty, tz] = n.translation ?? [0, 0, 0];
    const [x, y, z, w] = n.rotation ?? [0, 0, 0, 1];
    const [sx, sy, sz] = n.scale ?? [1, 1, 1];
    const R = [
      [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
      [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
      [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
    ];
    const s = [sx, sy, sz];
    return [
      [R[0][0] * s[0], R[0][1] * s[1], R[0][2] * s[2], tx],
      [R[1][0] * s[0], R[1][1] * s[1], R[1][2] * s[2], ty],
      [R[2][0] * s[0], R[2][1] * s[1], R[2][2] * s[2], tz],
      [0, 0, 0, 1],
    ];
  };
  const mul = (A, B) => A.map((row, i) =>
    [0, 1, 2, 3].map((j) => [0, 1, 2, 3].reduce((a, k) => a + row[k] * B[k][j], 0)));
  const xf = (M, p) => [0, 1, 2].map((i) => M[i][0] * p[0] + M[i][1] * p[1] + M[i][2] * p[2] + M[i][3]);

  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  const walk = (ni, P) => {
    const n = gltf.nodes[ni];
    const M = mul(P, matOf(n));
    if (n.mesh != null) {
      for (const prim of gltf.meshes[n.mesh].primitives ?? []) {
        const a = acc[prim.attributes?.POSITION];
        if (!a?.min) continue;
        for (const cx of [a.min[0], a.max[0]]) {
          for (const cy of [a.min[1], a.max[1]]) {
            for (const cz of [a.min[2], a.max[2]]) {
              const w = xf(M, [cx, cy, cz]);
              for (let i = 0; i < 3; i++) {
                lo[i] = Math.min(lo[i], w[i]);
                hi[i] = Math.max(hi[i], w[i]);
              }
            }
          }
        }
      }
    }
    for (const c of n.children ?? []) walk(c, M);
  };
  const I = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
  for (const s of gltf.scenes ?? []) for (const ni of s.nodes ?? []) walk(ni, I);
  if (!Number.isFinite(lo[0])) throw new Error('no positioned geometry');
  return [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
}

/** Height GltfFurniture will actually draw, in cm. Mirrors its arithmetic
 *  (src/components/Viewer3D/GltfFurniture.tsx) including the yaw-aware
 *  width/depth swap for quarter-turned models. */
function renderedHeightCm(size, entry, fit, yaw = 0) {
  const [x, y, z] = size;
  const quarter = Math.abs(Math.sin(yaw)) > Math.abs(Math.cos(yaw));
  const w = quarter ? entry.depth : entry.width;
  const d = quarter ? entry.width : entry.depth;
  const sx = (w / 100) / (x || 1);
  const sy = (entry.height / 100) / (y || 1);
  const sz = (d / 100) / (z || 1);
  if (fit === 'stretch') return entry.height; // fills height by construction
  const scale = fit === 'width' ? sx : fit === 'depth' ? sz : fit === 'height' ? sy : Math.min(sx, sz);
  return y * scale * 100;
}

// --- run over every bundled model ------------------------------------------
const modelsDir = join(root, 'public', 'models');
const present = new Set(readdirSync(modelsDir).filter((f) => f.endsWith('.glb')).map((f) => f.replace(/\.glb$/, '')));

// The check is deliberately ASYMMETRIC.
//
// Drawing SHORTER than the catalogue height is always a defect: the footprint
// fit only shrinks a model when its footprint is proportionally wider than the
// catalogue box, so a short draw means it is undersized in plan too — this is
// exactly the reported "tiny furniture".
//
// Drawing TALLER is often correct. `height` on some entries is the functional
// height, not the model's maximum extent: `bed_double` is 50cm (mattress top)
// while the model legitimately carries a 158cm headboard. Flagging that as a
// failure would train everyone to ignore this test.
const TOO_SHORT = 0.75;
const SUSPICIOUSLY_TALL = 2.5;
const offenders = [];
const tall = [];
let measured = 0;

for (const [type, file] of Object.entries(MODEL_FILE)) {
  if (!present.has(file)) continue;
  const entry = CATALOG_BY_TYPE[type];
  if (!entry) continue;
  let size;
  try {
    size = worldBox(join(modelsDir, `${file}.glb`));
  } catch (e) {
    offenders.push(`${type}: unreadable (${e.message})`);
    continue;
  }
  measured++;
  const fit = MODEL_FIT[type];
  const drawn = renderedHeightCm(size, entry, fit, MODEL_YAW[type] ?? 0);
  const ratio = drawn / entry.height;
  const line = `${type} ${drawn.toFixed(0)}cm vs ${entry.height}cm (${(ratio * 100).toFixed(0)}%)`;
  if (ratio < TOO_SHORT) offenders.push(line);
  else if (ratio > SUSPICIOUSLY_TALL) tall.push(line);
}
if (tall.length) console.log(`NOTE  taller than nominal (often fine — headboards, backrests): ${tall.join(' | ')}`);

check(`measured ${measured} bundled models`, measured > 0);
check(
  'no bundled model draws under three-quarters of its catalogue height',
  offenders.length === 0,
  `${offenders.length} undersized: ${offenders.join(' | ')}`,
);

// Guard the arithmetic itself: a cube bound to a cube entry must draw exactly.
{
  const cube = [1, 1, 1];
  const e = { width: 50, depth: 50, height: 50 };
  check('fit maths: matching proportions draw exactly', Math.abs(renderedHeightCm(cube, e, undefined) - 50) < 0.01);
  // A model twice as wide as the catalogue assumes gets halved by the footprint
  // fit — the exact mechanism behind the reported "tiny furniture".
  check('fit maths: an over-wide model is shrunk by the footprint fit',
    Math.abs(renderedHeightCm([2, 1, 1], e, undefined) - 25) < 0.01);
  check('fit maths: height fit ignores footprint',
    Math.abs(renderedHeightCm([2, 1, 1], e, 'height') - 50) < 0.01);
}

console.log(fails ? `\nMODELS: ${fails} FAILED` : '\nMODELS: all green');
process.exit(fails ? 1 : 0);
