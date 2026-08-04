// Verify a release AAB actually contains what it claims — BOTH halves.
//
// A shipped bug this exists to prevent: `npx cap sync` only COPIES `dist/`, it
// never rebuilds it. So a release built without running `npm run build` first
// gets a correct native wrapper (versionCode/versionName are written into
// build.gradle by sync-version.mjs) wrapped around whatever stale web bundle
// happened to be on disk. Users got a v1.10.0 app reporting itself as a much
// later release, and the checks at the time — reading versionCode and
// versionName out of AndroidManifest — could not see it, because the manifest
// is the half that was always right.
//
//   node scripts/verify-aab.mjs [path/to/app-release.aab]

import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const root = process.cwd();
const aab = process.argv[2]
  ?? join(root, 'android', 'app', 'build', 'outputs', 'bundle', 'release', 'app-release.aab');
const expected = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;

let fails = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) fails++;
};

if (!existsSync(aab)) {
  console.error(`No AAB at ${aab}`);
  process.exit(1);
}

/** versionCode from the semver, matching scripts/sync-version.mjs. */
const [major, minor, patch] = expected.split('.').map(Number);
const expectedCode = major * 10000 + minor * 100 + patch;

// --- native half: the proto AndroidManifest --------------------------------
const manifest = execFileSync('unzip', ['-p', aab, 'base/manifest/AndroidManifest.xml'], {
  maxBuffer: 1 << 26,
});
const varint = (n) => {
  const b = [];
  for (;;) {
    const x = n & 0x7f;
    n >>>= 7;
    b.push(x | (n ? 0x80 : 0));
    if (!n) return Buffer.from(b);
  }
};
check(`native versionName is ${expected}`, manifest.includes(Buffer.from(expected)));
check(`native versionCode is ${expectedCode}`, manifest.includes(varint(expectedCode)));

// --- web half: the bundle users actually run -------------------------------
// APP_VERSION is injected by Vite `define` from package.json at BUILD time, so
// the literal appearing here proves when dist/ was built — which is the whole
// point of this script.
const listing = execFileSync('unzip', ['-l', aab], { encoding: 'utf8', maxBuffer: 1 << 26 });
const jsFiles = listing
  .split('\n')
  .map((l) => l.trim().split(/\s+/).pop())
  .filter((f) => f && f.startsWith('base/assets/public/assets/') && f.endsWith('.js'));

check('the AAB contains a web bundle', jsFiles.length > 0, `${jsFiles.length} js files`);

let sawExpected = false;
const strays = new Set();
for (const f of jsFiles) {
  const src = execFileSync('unzip', ['-p', aab, f], { encoding: 'latin1', maxBuffer: 1 << 26 });
  if (src.includes(`"${expected}"`)) sawExpected = true;
  // Any OTHER app-shaped version literal in the entry chunk is the stale-dist
  // signature. Library versions live in vendor chunks, so only look at index-*.
  if (/\/index-[^/]+\.js$/.test(f)) {
    for (const m of src.matchAll(/"(\d+\.\d+\.\d+)"/g)) {
      if (m[1] !== expected && /^1\.\d{1,2}\.\d{1,2}$/.test(m[1])) strays.add(m[1]);
    }
  }
}
check(`web bundle was built at ${expected}`, sawExpected,
  'dist/ is stale — run `npm run build` before `npx cap sync`');
check('no other app version is baked into the entry chunk', strays.size === 0,
  [...strays].join(', '));

// --- the assets the app loads at runtime -----------------------------------
const glbs = (listing.match(/base\/assets\/public\/models\/[^\s]+\.glb/g) ?? []).length;
check('bundled models are present', glbs > 0, `${glbs} .glb`);

console.log(fails ? `\nAAB: ${fails} FAILED` : `\nAAB: all green (${expected} / ${expectedCode})`);
process.exit(fails ? 1 : 0);
