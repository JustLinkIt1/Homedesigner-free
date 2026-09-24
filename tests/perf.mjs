import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'hd-perf-'));
try {
  const out = join(dir, 'perf.mjs');
  await build({ entryPoints: ['src/lib/perfTier.ts'], bundle: true, format: 'esm', platform: 'node', outfile: out });
  const { autoTierForDevice, tierCaps } = await import(pathToFileURL(out).href);
  assert.equal(autoTierForDevice({ nativeAndroid: true, touch: true, cores: 8, memory: 8 }), 'low', 'Android Auto never guesses GPU capability from CPU/RAM');
  assert.equal(autoTierForDevice({ nativeAndroid: false, touch: false, cores: 4, memory: 2 }), 'high', 'Desktop remains high');
  assert.equal(autoTierForDevice({ nativeAndroid: false, touch: true, cores: 4, memory: 2 }), 'low', 'Budget browser device remains low');
  assert.equal(autoTierForDevice({ nativeAndroid: false, touch: true, cores: 8, memory: 8 }), 'high', 'Capable non-native touch browser remains high');
  const low = tierCaps('low', true);
  assert.equal(low.shadows, false);
  assert.equal(low.contactShadows, false);
  assert.equal(low.post, false);
  assert.equal(low.maxDpr, 1);
  console.log('Performance tier tests passed');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
