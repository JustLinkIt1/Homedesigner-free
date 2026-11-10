// Run in a normal authorized local terminal. Builds only; never deploys or
// purchases, changes balances, enables AI, or submits a Google Play release.
import { spawnSync } from 'node:child_process';
import { constants, copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Expected a plain app version.');
const [major, minor, patch] = version.split('.').map(Number);
if (minor > 99 || patch > 99) throw new Error('Version cannot be represented by the Android versionCode scheme.');
const code = major * 10000 + minor * 100 + patch;
const artifact = join(root, 'outputs', `HomeDesigner-${version}-${code}.aab`);
const steps = [
  ['Verify version alignment', ['scripts/sync-version.mjs', '--check']],
  ['Full release checks and fresh production web build', ['scripts/check-ai.mjs', '--release']],
  ['Copy fresh web build into Android', ['node_modules/@capacitor/cli/bin/capacitor', 'sync', 'android']],
  ['Build signed Android bundle', ['scripts/run-gradle.mjs', 'bundleRelease']],
  ['Verify native and embedded app versions', ['scripts/verify-aab.mjs']],
];
console.log(`Prepare HomeDesigner ${version} / ${code}. No deployment or Play submission.`);
if (process.argv.includes('--plan')) {
  for (const [label, args] of steps) console.log(`${label}: node ${args.join(' ')}`);
  console.log(`Verified output: ${artifact}`);
  process.exit(0);
}
if (existsSync(artifact)) throw new Error(`Refusing to overwrite an existing release artifact: ${artifact}`);
for (const [label, args] of steps) {
  console.log(`\n${label}`);
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit', windowsHide: true });
  if (result.error || result.status !== 0) {
    console.error('STOP: release preparation failed. Do not upload an older bundle.');
    if (result.error) console.error(result.error.message);
    process.exit(result.status || 1);
  }
}
mkdirSync(join(root, 'outputs'), { recursive: true });
copyFileSync(join(root, 'android/app/build/outputs/bundle/release/app-release.aab'), artifact, constants.COPYFILE_EXCL);
const sha256 = createHash('sha256').update(readFileSync(artifact)).digest('hex');
console.log(`\nVerified AAB: ${artifact}\nSHA-256: ${sha256}`);
console.log('Still required: backend migration/deployment, device and live billing/provider checks, Play policy review, then production submission.');
