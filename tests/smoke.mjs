// End-to-end smoke suite. Drives the real app headless (chromium/swiftshader)
// against the Vite DEV server — window.useDesign is dev-only (src/main.tsx),
// and the store is how several assertions read state.
//
//   npm test          (fails fast; exit code 1 on any failed assertion)
//
// Set SMOKE_SKIP_3D=1 on machines without a usable GL stack — the 3D check
// then soft-passes. Everything else always hard-fails.

import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4599;
const BASE = `http://localhost:${PORT}/`;

// Launch Vite through Node so the smoke suite is portable: Windows cannot
// spawn the extensionless `.bin/vite` shim directly.
const viteEntry = join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const dev = spawn(process.execPath, [viteEntry, '--port', String(PORT), '--strictPort'], {
  cwd: root,
  stdio: 'ignore',
});
process.on('exit', () => {
  try {
    dev.kill();
  } catch {
    /* gone */
  }
});
for (let i = 0; ; i++) {
  try {
    const r = await fetch(BASE);
    if (r.ok) break;
  } catch {
    /* not up yet */
  }
  if (i > 120) {
    console.error('FATAL: vite dev server did not start');
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 250));
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

// Keep the smoke suite deterministic and exercise the versioned cloud catalog
// without depending on the public R2 endpoint or downloading a GLB.
await page.route('https://pub-6583adc5c7ee4926ae2b8037175a5dfc.r2.dev/catalog/v1/catalog.json', (route) =>
  route.fulfill({
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify({
      version: 1,
      entries: [{
        type: 'cloud_smoke_chair',
        name: 'Cloud Smoke Chair',
        category: 'Living',
        width: 62,
        depth: 68,
        height: 84,
        color: '#8a735f',
        shape: 'chair',
        icon: 'C',
        model: {
          url: 'https://pub-6583adc5c7ee4926ae2b8037175a5dfc.r2.dev/models/tests/cloud-smoke-chair.glb',
          source: {
            name: 'Smoke test fixture',
            url: 'https://example.com/smoke-fixture',
            license: 'CC0',
          },
        },
      }],
    }),
  }),
);

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failures++;
};
const store = (fn, arg) => page.evaluate(fn, arg);

// Android's Credential Manager provider automatically adds openid/email/profile.
// Passing even those defaults through `options.scopes` activates the plugin's
// custom-scope MainActivity guard and rejects before Google Sign-In opens.
const googleAuthSource = await readFile(join(root, 'src', 'lib', 'googleAuth.ts'), 'utf8');
check(
  'Google login does not trigger the Android custom-scope guard',
  !/SocialLogin\.login\(\{[\s\S]{0,300}?scopes\s*:/.test(googleAuthSource),
);

// ---- 1. Projects screen renders, sample home opens -------------------------
await page.goto(BASE);
check('projects screen renders', await page.waitForSelector('.projects-screen', { timeout: 20000 }).then(() => true).catch(() => false));
await page.getByRole('button', { name: /Sunlit open-plan home/ }).first().click();
check('editor opens', await page.waitForSelector('.toolbar', { timeout: 15000 }).then(() => true).catch(() => false));
await page.locator('.coach-skip').click().catch(() => {});
check('2D canvas mounts', (await page.locator('.konvajs-content canvas').count()) > 0);

// A single structural wall can border several rooms. Painting from 3D must
// resolve to the room-bounded face under the tap instead of the whole length.
const faceRanges = await page.evaluate(async () => {
  const { wallFaceAt, withFaceFinish } = await import('/src/lib/wallFaces.ts');
  const wall = {
    id: 'long', start: { x: 0, y: 0 }, end: { x: 1000, y: 0 },
    thickness: 12, height: 270, color: '#ffffff',
  };
  const rooms = [
    { id: 'a', name: 'A', points: [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }], floorMaterial: 'oak', color: '#fff' },
    { id: 'b', name: 'B', points: [{ x: 400, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 300 }, { x: 400, y: 300 }], floorMaterial: 'oak', color: '#fff' },
  ];
  const a = wallFaceAt(wall, rooms, { x: 200, y: 6 });
  const b = wallFaceAt(wall, rooms, { x: 700, y: 6 });
  const finishes = withFaceFinish(
    { ...wall, faceFinishes: [{ ...a, color: '#ff0000' }] },
    b,
    { color: '#0000ff' },
  );
  return { a, b, finishes };
});
check('wall paint resolves first room face', faceRanges.a.start === 0 && faceRanges.a.end === 0.4 && faceRanges.a.side === 1);
check('wall paint resolves adjacent room face', faceRanges.b.start === 0.4 && faceRanges.b.end === 1 && faceRanges.b.side === 1);
check('adjacent wall finishes stay separate', faceRanges.finishes.length === 2);

// Walk navigation must use the same structural openings as the rendered wall,
// and stair endpoints must remain correct after furniture rotation.
const walkNavigation = await page.evaluate(async () => {
  const { buildWalkWallSegments, isAtStairEnd, stairLanding, stairOpeningPoints } = await import('/src/lib/walkNavigation.ts');
  const wall = {
    id: 'wall', start: { x: 0, y: 0 }, end: { x: 1000, y: 0 },
    thickness: 12, height: 270, color: '#ffffff',
  };
  const opening = {
    id: 'door', wallId: 'wall', type: 'door', style: 'passage',
    offset: 0.5, width: 100, height: 210, sill: 0,
  };
  const segments = buildWalkWallSegments([wall], [opening]);
  const stair = {
    id: 'stairs', type: 'stairs', name: 'Stairs', position: { x: 500, y: 500 },
    rotation: 90, width: 100, depth: 250, height: 280, color: '#999999',
  };
  const high = stairLanding(stair, 'high');
  const safe = stairLanding(
    { ...stair, position: { x: 130, y: 660 }, rotation: 90 },
    'high',
    [{ id: 'landing', name: 'Landing', points: [{ x: 0, y: 500 }, { x: 550, y: 500 }, { x: 550, y: 800 }, { x: 0, y: 800 }], floorMaterial: 'oak', color: '#fff' }],
  );
  const stairwell = stairOpeningPoints(stair);
  return {
    segmentCount: segments.length,
    doorwayStart: segments[0]?.bx,
    doorwayEnd: segments[1]?.ax,
    rotatedHighDetected: isAtStairEnd(stair, 3.8, 5, 'high'),
    high,
    safe,
    stairwell,
  };
});
check('walk collision leaves door opening clear',
  walkNavigation.segmentCount === 2 && walkNavigation.doorwayStart < 4.5 && walkNavigation.doorwayEnd > 5.5,
  JSON.stringify(walkNavigation));
check('rotated stair landing is detected', walkNavigation.rotatedHighDetected && walkNavigation.high.x < 3);
check('invalid stair landing falls back inside destination room',
  walkNavigation.safe.x > 0 && walkNavigation.safe.x < 5.5 && walkNavigation.safe.z > 5 && walkNavigation.safe.z < 8,
  JSON.stringify(walkNavigation.safe));
check('rotated stairwell follows furniture footprint',
  Math.min(...walkNavigation.stairwell.map((p) => p.x)) === 375 && Math.max(...walkNavigation.stairwell.map((p) => p.x)) === 625,
  JSON.stringify(walkNavigation.stairwell));

const mapleStairs = await page.evaluate(async () => {
  const { SAMPLE_BY_ID } = await import('/src/data/samples.ts');
  const { stairLanding, stairOpeningPoints } = await import('/src/lib/walkNavigation.ts');
  const { pointInPolygon } = await import('/src/lib/geometry.ts');
  const sample = SAMPLE_BY_ID['family-house'].build();
  const floors = [...sample.floors].sort((a, b) => a.elevation - b.elevation);
  const stair = sample.floorGeom[floors[0].id].furniture.find((item) => item.type === 'stairs');
  const upperRooms = sample.floorGeom[floors[1].id].rooms;
  const landing = stairLanding(stair, 'high', upperRooms);
  const opening = stairOpeningPoints(stair);
  return {
    rotation: stair.rotation,
    landing,
    landingInside: upperRooms.some((room) => pointInPolygon({ x: landing.x * 100, y: landing.z * 100 }, room.points)),
    openingInside: upperRooms.some((room) => opening.every((point) => pointInPolygon(point, room.points))),
  };
});
check('Maple stairs rise toward the indoor upper landing',
  mapleStairs.rotation === 270 && mapleStairs.landingInside,
  JSON.stringify(mapleStairs));
check('Maple stair footprint can cut the upper floor slab',
  mapleStairs.openingInside,
  JSON.stringify(mapleStairs));

// ---- 2. Place, select, nudge, undo toast ----------------------------------
const before = await store(() => window.useDesign.getState().furniture.length);
await store(() => window.useDesign.getState().addFurniture('side_table', { x: 200, y: 200 }));
const placed = await store(() => window.useDesign.getState().furniture.length);
check('furniture places', placed === before + 1);

await store(() => {
  const s = window.useDesign.getState();
  s.select({ kind: 'furniture', id: s.furniture[s.furniture.length - 1].id });
});
const x0 = await store(() => {
  const s = window.useDesign.getState();
  return s.furniture[s.furniture.length - 1].position.x;
});
await page.keyboard.press('ArrowRight');
await page.keyboard.press('Shift+ArrowRight');
const x1 = await store(() => {
  const s = window.useDesign.getState();
  return s.furniture[s.furniture.length - 1].position.x;
});
check('arrow-key nudge (+11cm)', Math.round(x1 - x0) === 11, `got ${x1 - x0}`);

await page.keyboard.press('Delete');
await page.waitForTimeout(300);
check('delete shows Undo toast', await page.locator('.toast-action', { hasText: 'Undo' }).isVisible().catch(() => false));
await page.click('.toast-action');
await page.waitForTimeout(200);
check('undo restores item', (await store(() => window.useDesign.getState().furniture.length)) === placed);

const stairId = await store(() => {
  const s = window.useDesign.getState();
  const id = s.addFurniture('stairs', { x: 250, y: 250 });
  s.select({ kind: 'furniture', id });
  return id;
});
await page.setViewportSize({ width: 390, height: 844 });
await page.getByRole('button', { name: 'Edit' }).click();
const reverseStairs = page.getByRole('button', { name: 'Reverse stairs' });
check('selected stairs show quick reverse control', await reverseStairs.isVisible().catch(() => false));
await reverseStairs.click();
check(
  'quick reverse turns stairs 180°',
  (await store((id) => window.useDesign.getState().furniture.find((f) => f.id === id)?.rotation, stairId)) === 180,
);
await store((id) => window.useDesign.getState().deleteById('furniture', id), stairId);

const doorId = await store(() => {
  const s = window.useDesign.getState();
  const id = s.addOpening(s.walls[0].id, 0.5, 'door');
  s.select({ kind: 'opening', id });
  return id;
});
const flipHinge = page.getByRole('button', { name: 'Flip hinge side' });
check('selected door shows quick hinge control', await flipHinge.isVisible().catch(() => false));
await flipHinge.click();
check(
  'quick hinge control mirrors door',
  (await store((id) => window.useDesign.getState().openings.find((o) => o.id === id)?.flipHinge, doorId)) === true,
);
await store((id) => window.useDesign.getState().deleteById('opening', id), doorId);
await page.getByRole('button', { name: 'Edit' }).click();
await page.setViewportSize({ width: 1280, height: 800 });

// ---- 3. Shopping list -------------------------------------------------------
await page.click('.export-wrap .tbtn');
await page.click('text=Shopping list');
check('shopping list rows', (await page.locator('.bom-table tbody tr').count()) > 10);
await page.click('.modal-foot .btn.primary');

// ---- 4. Settings round-trip -------------------------------------------------
await page.click('[aria-label="More"]');
await page.click('.more-menu [role="menuitem"]:has-text("Settings")');
check('settings shows Google account controls', await page.locator('.google-signin').isVisible());
check('unconfigured Google sign-in is safely disabled', await page.locator('.google-signin').isDisabled());
await page.click('.seg button:has-text("Dark")');
const dark = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
check('dark theme applies', dark === 'dark');
await page.click('.seg button:has-text("System")');
await page.click('.modal-foot .btn.primary');

// ---- 5. 3D view -------------------------------------------------------------
if (process.env.SMOKE_SKIP_3D) {
  console.log('SKIP  3D view (SMOKE_SKIP_3D)');
} else {
  await page.click('.view-toggle button:nth-child(2)');
  await page.waitForTimeout(15000);
  const webglMissing = await page.locator('.webgl-missing').isVisible().catch(() => false);
  check('3D mounts (no webgl-missing)', !webglMissing);
  const objectsButton = page.locator('.objects3d-btn');
  check('3D Objects entry point appears', await objectsButton.isVisible().catch(() => false));
  await objectsButton.click();
  check('3D object catalog opens', await page.locator('.catalog.docked').isVisible().catch(() => false));
  check(
    'cloud catalog manifest loads',
    await page.locator('.catalog.docked .cat-item', { hasText: 'Cloud Smoke Chair' })
      .waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false),
  );
  await page.locator('.catalog.docked .cat-item[title="Side Table"]').click();
  check(
    'catalog opens 3D model preview',
    await page.waitForSelector('.catalog.docked .catalog-preview-canvas', { timeout: 15000 }).then(() => true).catch(() => false),
  );
  await page.locator('.catalog.docked .catalog-place').click();
  check(
    '3D placement guidance appears',
    await page.locator('.placement-affordance', { hasText: 'Tap a floor to place Side Table' }).isVisible().catch(() => false),
  );
  // Rotate pill drives store rotation.
  await store(() => {
    const s = window.useDesign.getState();
    s.select({ kind: 'furniture', id: s.furniture[0].id });
  });
  // Generous: under software GL the model-heavy scene can stall the main
  // thread for tens of seconds while shaders/BVH compile.
  const pill = await page.waitForSelector('.rotate3d-pill', { timeout: 45000 }).then(() => true).catch(() => false);
  check('3D rotate pill appears', pill);
  if (pill) {
    const r0 = await store(() => window.useDesign.getState().furniture[0].rotation);
    await page.click('.rotate3d-pill button >> nth=1');
    await page.waitForTimeout(200);
    const r1 = await store(() => window.useDesign.getState().furniture[0].rotation);
    check('3D rotate +45°', (r1 - r0 + 360) % 360 === 45, `got ${r1 - r0}`);
  }
}

// ---- 6. No page errors ------------------------------------------------------
check('zero page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));

await browser.close();
dev.kill();
console.log(failures === 0 ? '\nSMOKE: all green' : `\nSMOKE: ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
