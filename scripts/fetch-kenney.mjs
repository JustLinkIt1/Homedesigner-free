// Run-once: fetch CC0 kitchen models from the Kenney Furniture Kit, optimize
// each (quantize + webp, decoder-free — matches the existing Poly Haven pack)
// into public/models/<type>.glb.
//
//   node scripts/fetch-kenney.mjs
//
// Poly Haven has no modern kitchen appliances (only vintage props), so the
// kitchen gaps are filled from Kenney's CC0 kit, which ships ready-made glTF
// (no Blender step needed). Assets are CC0 (Kenney.nl). Missing/failed items are
// skipped (that catalog type keeps its procedural mesh).
import { writeFileSync, mkdirSync, rmSync, existsSync, createWriteStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Readable } from 'node:stream';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'models');
const TMP = join(ROOT, '.kenney-tmp');
const BIN = join(ROOT, 'node_modules', '.bin', 'gltf-transform');
const ZIP_URL =
  'https://kenney.nl/media/pages/assets/furniture-kit/440e0608a4-1677580847/kenney_furniture-kit.zip';

// [catalog type, Kenney model basename]  — only kitchen types Poly Haven lacks.
const LIST = [
  ['fridge', 'kitchenFridge'],
  ['kitchen_sink', 'kitchenSink'],
];

mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });

const zipPath = join(TMP, 'kit.zip');
if (!existsSync(zipPath)) {
  const res = await fetch(ZIP_URL);
  if (!res.ok) throw new Error(`Kenney download failed: ${res.status}`);
  await new Promise((ok, err) => {
    const out = createWriteStream(zipPath);
    Readable.fromWeb(res.body).pipe(out).on('finish', ok).on('error', err);
  });
}
// Extract just the GLTF-format models we need.
execFileSync('unzip', ['-o', '-q', zipPath, 'Models/GLTF format/*', '-d', TMP], { stdio: 'pipe' });
const SRC = join(TMP, 'Models', 'GLTF format');

const ok = [];
for (const [type, base] of LIST) {
  const inFile = join(SRC, `${base}.glb`);
  const outFile = join(OUT, `${type}.glb`);
  try {
    execFileSync(BIN, ['optimize', inFile, outFile, '--compress', 'quantize',
      '--texture-compress', 'webp', '--texture-size', '512'], { stdio: 'pipe' });
    ok.push(type);
    console.log(`ok   ${type}  <- ${base}`);
  } catch (e) {
    console.log(`skip ${type}: ${String(e.message).slice(0, 100)}`);
  }
}
rmSync(TMP, { recursive: true, force: true });
writeFileSync(join(ROOT, 'scripts', 'kenney-snippets.txt'),
  ok.map((t) => `  ${t}: { url: U('${t}') },`).join('\n') + '\n');
console.log(`\n${ok.length}/${LIST.length} Kenney models ok.`);
