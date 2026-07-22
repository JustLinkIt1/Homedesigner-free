import { readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

const [baseArg, additionArg, outputArg] = process.argv.slice(2);
if (!baseArg || !additionArg || !outputArg) {
  console.error('Usage: node merge_manifests.mjs <base.json> <addition.json> <output.json>');
  process.exit(1);
}

const base = JSON.parse(await readFile(resolve(baseArg), 'utf8'));
const addition = JSON.parse(await readFile(resolve(additionArg), 'utf8'));
const entries = [...(base.entries ?? [])];
const seen = new Set(entries.map((entry) => entry.type));

for (const entry of addition.entries ?? []) {
  if (seen.has(entry.type)) {
    throw new Error(`Duplicate catalog type: ${entry.type}`);
  }
  seen.add(entry.type);
  entries.push(entry);
}

const merged = { ...base, version: Math.max(base.version ?? 1, addition.version ?? 1), entries };
await writeFile(resolve(outputArg), `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
console.log(`Wrote ${entries.length} entries to ${basename(outputArg)}`);
