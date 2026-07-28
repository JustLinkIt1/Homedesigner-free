// Run-once: fetch curated CC0 furniture models from Poly Haven, pack their
// glTF (+bin +textures) into a single GLB and compress it (quantize + webp,
// decoder-free — matches the existing pack) into public/models/<type>.glb.
//
//   node scripts/fetch-models.mjs
//
// Missing/failed assets are skipped (that catalog type keeps its procedural
// mesh). Oversized results (>1.3MB) are dropped. Prints ready-to-paste catalog
// + manifest snippets for the models that succeeded. Assets are CC0 (Poly Haven).
import { writeFileSync, mkdirSync, rmSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'models');
const TMP = join(ROOT, '.model-tmp');
const BIN = join(ROOT, 'node_modules', '.bin', 'gltf-transform');
mkdirSync(OUT, { recursive: true });

// [type, polyhavenId, name, category, w, d, h, shape, color]
const LIST = [
  ['accent_chair', 'GreenChair_01', 'Accent Chair', 'Living', 70, 72, 80, 'chair', '#7f8a72'],
  ['rocking_chair', 'Rockingchair_01', 'Rocking Chair', 'Living', 62, 95, 105, 'chair', '#7a5a3a'],
  ['round_coffee_table', 'coffee_table_round_01', 'Round Coffee Table', 'Living', 90, 90, 42, 'table', '#9c6b3f'],
  ['tall_side_table', 'side_table_tall_01', 'Tall Side Table', 'Living', 42, 42, 62, 'side_table', '#8a5a30'],
  ['accent_table', 'small_wooden_table_01', 'Accent Table', 'Living', 60, 60, 52, 'table', '#9c6b3f'],
  ['modern_sofa', 'sofa_02', 'Modern Sofa', 'Living', 200, 92, 80, 'sofa', '#8a8f96'],
  ['display_cabinet', 'vintage_cabinet_01', 'Display Cabinet', 'Living', 100, 45, 120, 'box', '#7a5a3a'],
  ['sideboard', 'painted_wooden_cabinet', 'Sideboard', 'Living', 120, 45, 88, 'box', '#b7b0a0'],
  ['worn_bookshelf', 'wooden_bookshelf_worn', 'Rustic Bookshelf', 'Living', 90, 30, 180, 'bookshelf', '#8a5a30'],
  ['tea_table', 'chinese_tea_table', 'Tea Table', 'Living', 100, 60, 38, 'table', '#6f4b2e'],
  ['wooden_dining_chair', 'WoodenChair_01', 'Wooden Chair', 'Dining', 45, 50, 95, 'chair', '#8a5a30'],
  ['bar_chair', 'bar_chair_round_01', 'Bar Chair', 'Kitchen', 40, 40, 98, 'stool', '#6e6e72'],
  ['wooden_stool', 'wooden_stool_01', 'Wooden Stool', 'Kitchen', 35, 35, 46, 'stool', '#9c6b3f'],
  ['metal_stool', 'metal_stool_01', 'Metal Stool', 'Kitchen', 36, 36, 66, 'stool', '#6e6e72'],
  ['chest_of_drawers', 'vintage_wooden_drawer_01', 'Chest of Drawers', 'Bedroom', 90, 45, 95, 'box', '#7a5a3a'],
  ['day_bed', 'vintage_day_bed', 'Day Bed', 'Bedroom', 100, 200, 60, 'bed', '#b6a98f'],
  ['metal_desk', 'metal_office_desk', 'Metal Desk', 'Office', 140, 70, 75, 'table', '#6e6e72'],
  ['throw_pillows', 'throw_pillows_01', 'Throw Pillows', 'Decor', 55, 45, 22, 'box', '#cbb89a'],
  ['clay_planter', 'planter_pot_clay', 'Clay Planter', 'Decor', 40, 40, 45, 'plant', '#a5673f'],
  ['picnic_table', 'wooden_picnic_table', 'Picnic Table', 'Outdoor', 150, 140, 75, 'table', '#9c7a4f'],
  // --- Garden set (Phase C4). A deck or patio you cannot furnish is a dead end,
  // and the Outdoor category was five items deep. Poly Haven has no BBQ,
  // parasol, lounger or usable tree (their trees are 200-465MB scans that
  // survive no amount of compression) — those are built procedurally instead.
  ['patio_set', 'outdoor_table_chair_set_01', 'Bistro Set', 'Outdoor', 110, 180, 90, 'table', '#8a6f4f'],
  ['garden_chair', 'plastic_monobloc_chair_01', 'Garden Chair', 'Outdoor', 55, 55, 85, 'chair', '#d8d4c8'],
  ['fire_pit', 'stone_fire_pit', 'Fire Pit', 'Outdoor', 140, 140, 40, 'box', '#6b6660'],
  ['planter_box', 'planter_box_01', 'Planter Box', 'Outdoor', 90, 40, 40, 'plant', '#7a5e40'],
  ['planter_box_long', 'planter_box_02', 'Long Planter', 'Outdoor', 120, 40, 40, 'plant', '#7a5e40'],
  ['tree_stump', 'tree_stump_01', 'Tree Stump Seat', 'Outdoor', 60, 60, 45, 'box', '#6f5233'],
  ['garden_gnome', 'garden_gnome', 'Garden Gnome', 'Outdoor', 25, 25, 40, 'box', '#a8603f'],
  ['garden_lamp', 'street_lamp_01', 'Garden Lamp', 'Outdoor', 30, 30, 240, 'lamp', '#4a4a4a'],
  ['outdoor_bin', 'metal_trash_can', 'Outdoor Bin', 'Outdoor', 45, 45, 70, 'box', '#6e6e72'],
  ['watering_can', 'watering_can_metal_01', 'Watering Can', 'Outdoor', 30, 20, 30, 'box', '#9aa0a6'],
];

const download = async (url, dest) => {
  const buf = Buffer.from(await fetch(url).then((r) => r.arrayBuffer()));
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, buf);
};
const MAX = 1.3 * 1024 * 1024;
const ok = [];
for (const row of LIST) {
  const [type, id] = row;
  const outFile = join(OUT, `${type}.glb`);
  const dir = join(TMP, type);
  try {
    if (!existsSync(outFile)) {
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      const meta = await fetch(`https://api.polyhaven.com/files/${id}`).then((r) => r.json());
      const node = meta.gltf?.['1k']?.gltf ?? meta.gltf?.['2k']?.gltf;
      if (!node?.url) { console.log(`skip ${type}: no gltf`); continue; }
      await download(node.url, join(dir, 'model.gltf'));
      for (const [rel, info] of Object.entries(node.include ?? {})) await download(info.url, join(dir, rel));
      const size = (tex) => execFileSync(BIN, ['optimize', join(dir, 'model.gltf'), outFile,
        '--compress', 'quantize', '--texture-compress', 'webp', '--texture-size', String(tex)], { stdio: 'pipe' });
      size(512);
      if (statSync(outFile).size > MAX) size(256); // second, tighter pass if heavy
    }
    if (statSync(outFile).size > MAX) { console.log(`drop ${type}: ${Math.round(statSync(outFile).size/1024)}KB too big`); rmSync(outFile, { force: true }); continue; }
    console.log(`ok   ${type}  <- ${id}  (${Math.round(statSync(outFile).size/1024)} KB)`);
    ok.push(row);
  } catch (e) {
    console.log(`skip ${type}: ${String(e.message).slice(0, 100)}`);
  }
}
rmSync(TMP, { recursive: true, force: true });

// Emit paste-ready snippets.
const manifest = ok.map(([t]) => `  ${t}: { url: U('${t}') },`).join('\n');
const catalog = ok.map(([t, , name, cat, w, d, h, shape, color]) =>
  `  { type: '${t}', pro: true, name: '${name}', category: '${cat}', width: ${w}, depth: ${d}, height: ${h}, color: '${color}', shape: '${shape}', icon: '🪑' },`).join('\n');
writeFileSync(join(ROOT, 'scripts', 'models-snippets.txt'), `MANIFEST:\n${manifest}\n\nCATALOG:\n${catalog}\n`);
console.log(`\n${ok.length}/${LIST.length} models ok. Snippets -> scripts/models-snippets.txt`);
