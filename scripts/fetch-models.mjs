// Run-once: fetch curated CC0 furniture models from Poly Haven, pack their
// glTF (+bin +textures) into a single GLB and compress it (quantize + webp,
// decoder-free — matches the existing pack) into public/models/<type>.glb.
//
//   node scripts/fetch-models.mjs
//
// Missing/failed assets are skipped (that catalog type keeps its procedural
// mesh). Assets are CC0 (Poly Haven).
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'models');
const TMP = join(ROOT, '.model-tmp');
const BIN = join(ROOT, 'node_modules', '.bin', 'gltf-transform');
mkdirSync(OUT, { recursive: true });

// type (our catalog id)  ->  Poly Haven asset id
const LIST = [
  ['office_chair', 'modern_arm_chair_01'],
  ['console', 'ClassicConsole_01'],
  ['mirror', 'ornate_mirror_01'],
  ['cabinets', 'modern_wooden_cabinet'],
  ['filing_cabinet', 'drawer_cabinet'],
  ['desk_lamp', 'desk_lamp_arm_01'],
  ['office_bookshelf', 'Shelf_01'],
  // New catalog items (added in furnitureCatalog.ts):
  ['lounge_chair', 'mid_century_lounge_chair'],
  ['round_dining_table', 'round_wooden_table_01'],
];

const download = async (url, dest) => {
  const buf = Buffer.from(await fetch(url).then((r) => r.arrayBuffer()));
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, buf);
};

const done = [];
for (const [type, id] of LIST) {
  const outFile = join(OUT, `${type}.glb`);
  if (existsSync(outFile)) { done.push(type); continue; }
  const dir = join(TMP, type);
  try {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const meta = await fetch(`https://api.polyhaven.com/files/${id}`).then((r) => r.json());
    const node = meta.gltf?.['1k']?.gltf ?? meta.gltf?.['2k']?.gltf;
    if (!node?.url) { console.log(`skip ${type}: no gltf`); continue; }
    await download(node.url, join(dir, 'model.gltf'));
    for (const [rel, info] of Object.entries(node.include ?? {})) {
      await download(info.url, join(dir, rel));
    }
    execFileSync(BIN, [
      'optimize', join(dir, 'model.gltf'), outFile,
      '--compress', 'quantize', '--texture-compress', 'webp', '--texture-size', '512',
    ], { stdio: 'pipe' });
    const kb = Math.round((await import('node:fs')).statSync(outFile).size / 1024);
    console.log(`ok   ${type}  <- ${id}  (${kb} KB)`);
    done.push(type);
  } catch (e) {
    console.log(`skip ${type}: ${String(e.message).slice(0, 120)}`);
  }
}
rmSync(TMP, { recursive: true, force: true });
console.log(`\n${done.length}/${LIST.length} models -> public/models/  [${done.join(', ')}]`);
