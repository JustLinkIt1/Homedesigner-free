// Run-once: fetch curated CC0 wall/floor textures from Poly Haven, downscale to
// 512px and encode webp into public/textures/. Albedo (diffuse) only — the PBR
// roughness/metalness live in src/data/materials.ts. Skips any asset that 404s.
//
//   node scripts/fetch-textures.mjs
//
// Node has no built-in image encoder, so we reuse the bundled Chromium (via
// Playwright) to resize + encode webp. Assets are CC0 (Poly Haven).
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'textures');
mkdirSync(OUT, { recursive: true });

// Curated set: { id (Poly Haven), group, target, scaleCm, roughness, metalness }.
const SET = [
  // Wood
  ['wood_floor', 'Wood', 'floor', 200, 0.6, 0],
  ['wood_floor_worn', 'Wood', 'floor', 200, 0.65, 0],
  ['laminate_floor_02', 'Wood', 'floor', 200, 0.55, 0],
  ['laminate_floor_03', 'Wood', 'floor', 200, 0.55, 0],
  ['herringbone_parquet', 'Wood', 'floor', 130, 0.5, 0],
  ['diagonal_parquet', 'Wood', 'floor', 130, 0.5, 0],
  ['rectangular_parquet', 'Wood', 'floor', 130, 0.5, 0],
  ['dark_wooden_planks', 'Wood', 'both', 200, 0.6, 0],
  ['brown_planks_09', 'Wood', 'wall', 200, 0.7, 0],
  // Tile
  ['floor_tiles_02', 'Tile', 'floor', 60, 0.35, 0.05],
  ['floor_tiles_06', 'Tile', 'floor', 60, 0.35, 0.05],
  ['long_white_tiles', 'Tile', 'both', 30, 0.3, 0.05],
  ['interior_tiles', 'Tile', 'floor', 60, 0.35, 0.05],
  ['checkered_pavement_tiles', 'Tile', 'floor', 40, 0.4, 0.03],
  ['brown_floor_tiles', 'Tile', 'floor', 60, 0.4, 0.03],
  // Marble & Stone
  ['marble_01', 'Marble & Stone', 'both', 120, 0.22, 0.08],
  ['marble_mosaic_tiles', 'Marble & Stone', 'floor', 60, 0.25, 0.08],
  ['terrazzo_tiles', 'Marble & Stone', 'floor', 90, 0.4, 0.03],
  ['granite_tile', 'Marble & Stone', 'floor', 80, 0.3, 0.06],
  ['granite_tile_02', 'Marble & Stone', 'floor', 80, 0.3, 0.06],
  // Concrete
  ['concrete_floor_worn_02', 'Concrete', 'both', 200, 0.85, 0],
  ['garage_floor', 'Concrete', 'floor', 200, 0.7, 0.02],
  ['granular_concrete', 'Concrete', 'both', 200, 0.9, 0],
  // Brick
  ['brick_wall_001', 'Brick', 'wall', 120, 0.9, 0],
  ['brick_wall_10', 'Brick', 'wall', 120, 0.9, 0],
  ['brown_brick_02', 'Brick', 'wall', 120, 0.9, 0],
  ['painted_brick', 'Brick', 'wall', 120, 0.85, 0],
  // Plaster
  ['beige_wall_001', 'Plaster', 'wall', 250, 0.92, 0],
  ['grey_plaster', 'Plaster', 'wall', 250, 0.92, 0],
  ['plaster_grey_04', 'Plaster', 'wall', 250, 0.92, 0],
];

const pickDiffuse = (files) => {
  const key = Object.keys(files).find((k) => /^(diffuse|diff|albedo|col)$/i.test(k));
  const node = key ? files[key] : null;
  const res = node?.['1k'] ?? node?.['2k'];
  return res?.jpg?.url ?? res?.png?.url ?? null;
};

const browser = await chromium.launch();
const page = await browser.newPage();
const ok = [];
for (const [id, group, target, scaleCm, roughness, metalness] of SET) {
  const dest = join(OUT, `${id}.webp`);
  if (existsSync(dest)) { ok.push({ id, group, target, scaleCm, roughness, metalness }); continue; }
  try {
    const meta = await fetch(`https://api.polyhaven.com/files/${id}`).then((r) => r.json());
    const url = pickDiffuse(meta);
    if (!url) { console.log(`skip ${id}: no diffuse`); continue; }
    const buf = Buffer.from(await fetch(url).then((r) => r.arrayBuffer()));
    const dataUrl = `data:image/jpeg;base64,${buf.toString('base64')}`;
    const webpB64 = await page.evaluate(async (src) => {
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = src; });
      const S = 512;
      const c = document.createElement('canvas');
      c.width = S; c.height = S;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, S, S);
      return c.toDataURL('image/webp', 0.82).split(',')[1];
    }, dataUrl);
    writeFileSync(dest, Buffer.from(webpB64, 'base64'));
    const kb = Math.round(Buffer.from(webpB64, 'base64').length / 1024);
    console.log(`ok   ${id}  (${kb} KB)`);
    ok.push({ id, group, target, scaleCm, roughness, metalness });
  } catch (e) {
    console.log(`skip ${id}: ${e.message}`);
  }
}
await browser.close();
writeFileSync(join(ROOT, 'scripts', 'textures-manifest.json'), JSON.stringify(ok, null, 2));
console.log(`\n${ok.length}/${SET.length} textures fetched → public/textures/`);
