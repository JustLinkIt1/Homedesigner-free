import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

const [specArg, modelsArg, outputArg] = process.argv.slice(2);
if (!specArg || !modelsArg || !outputArg) {
  console.error('Usage: node build_manifest.mjs <batch-spec.json> <models-dir> <catalog.json>');
  process.exit(1);
}

const spec = JSON.parse(await readFile(resolve(specArg), 'utf8'));
const entries = [];
for (const item of spec.entries) {
  const filename = `${item.objectKey}.glb`;
  let bytes;
  try {
    bytes = await readFile(resolve(modelsArg, filename));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      console.warn(`Skipping missing model: ${filename}`);
      continue;
    }
    throw error;
  }
  const { sourceFile: _sourceFile, objectKey: _objectKey, ...catalog } = item;
  entries.push({
    ...catalog,
    model: {
      url: `${spec.publicBaseUrl}/${spec.modelPrefix}/${filename}`,
      bytes: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      source: spec.source,
    },
  });
}

const manifest = `${JSON.stringify({ version: 1, entries }, null, 2)}\n`;
await writeFile(resolve(outputArg), manifest, 'utf8');
console.log(`Wrote ${entries.length} entries to ${basename(outputArg)}`);
