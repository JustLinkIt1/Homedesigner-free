// Sync the app version from package.json into the Android build.
//
//   node scripts/sync-version.mjs          # write android/app/build.gradle
//   node scripts/sync-version.mjs --check  # verify only (CI / pre-release)
//
// versionName is the package.json semver; versionCode is derived as
// major*10000 + minor*100 + patch so every release sorts strictly upward
// (Play requires a monotonically increasing integer).

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gradlePath = join(root, 'android', 'app', 'build.gradle');

const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
if (!m) {
  console.error(`package.json version "${version}" is not plain semver (x.y.z) — refusing to sync.`);
  process.exit(1);
}
const [major, minor, patch] = m.slice(1).map(Number);
if (minor > 99 || patch > 99) {
  console.error(`minor/patch must be <= 99 for the versionCode scheme (got ${version}).`);
  process.exit(1);
}
const versionCode = major * 10000 + minor * 100 + patch;

const gradle = readFileSync(gradlePath, 'utf8');
const next = gradle
  .replace(/versionCode \d+/, `versionCode ${versionCode}`)
  .replace(/versionName "[^"]*"/, `versionName "${version}"`);

if (!next.includes(`versionCode ${versionCode}`) || !next.includes(`versionName "${version}"`)) {
  console.error('Could not find versionCode/versionName lines in android/app/build.gradle.');
  process.exit(1);
}

if (process.argv.includes('--check')) {
  if (gradle === next) {
    console.log(`OK: android build.gradle matches ${version} (versionCode ${versionCode}).`);
  } else {
    console.error(`OUT OF SYNC: run "npm run sync-version" (expected ${version} / ${versionCode}).`);
    process.exit(1);
  }
} else if (gradle === next) {
  console.log(`Already in sync: ${version} (versionCode ${versionCode}).`);
} else {
  writeFileSync(gradlePath, next);
  console.log(`Synced android build.gradle to ${version} (versionCode ${versionCode}).`);
}
