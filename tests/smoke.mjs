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
  env: {
    ...process.env,
    // A public-format placeholder exercises the signed-out desktop checkout
    // UI without contacting RevenueCat or opening a real payment sheet.
    VITE_REVENUECAT_WEB_KEY: 'rcb_smoke_test',
  },
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
// `reducedMotion: 'reduce'` makes this suite deterministic: <MotionConfig
// reducedMotion="user"> collapses every overlay animation to an instant state
// change, so a dialog is gone from the DOM the moment it closes and clicks never
// land on a still-fading backdrop. It also means the whole suite exercises the
// reduced-motion path. Animation itself is asserted separately, in a second
// context that leaves motion on — otherwise "all green" would be compatible with
// having shipped no animation at all.
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

// Keep the smoke suite deterministic and exercise the versioned cloud catalog
// without depending on the public R2 endpoint or downloading a GLB.
const smokeModel = await readFile(join(root, 'public', 'models', 'side_table.glb'));
await page.route('https://pub-6583adc5c7ee4926ae2b8037175a5dfc.r2.dev/models/tests/cloud-smoke-tv.glb', (route) =>
  route.fulfill({
    contentType: 'model/gltf-binary',
    headers: { 'access-control-allow-origin': '*' },
    body: smokeModel,
  }),
);
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
      overrides: [{
        type: 'tv_stand',
        model: {
          url: 'https://pub-6583adc5c7ee4926ae2b8037175a5dfc.r2.dev/models/tests/cloud-smoke-tv.glb',
          fit: 'width',
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
const mainSource = await readFile(join(root, 'src', 'main.tsx'), 'utf8');
const authStoreSource = await readFile(join(root, 'src', 'store', 'authStore.ts'), 'utf8');
const proStoreSource = await readFile(join(root, 'src', 'store', 'proStore.ts'), 'utf8');
const proSource = await readFile(join(root, 'src', 'lib', 'pro.ts'), 'utf8');
const workerSource = await readFile(join(root, 'workers', 'design-sync', 'src', 'index.ts'), 'utf8');
const workerConfig = await readFile(join(root, 'workers', 'design-sync', 'wrangler.jsonc'), 'utf8');
check(
  'Google login does not trigger the Android custom-scope guard',
  !/SocialLogin\.login\(\{[\s\S]{0,300}?scopes\s*:/.test(googleAuthSource),
);
check(
  'Google login avoids the plugin 8.3.38 invalid-JWT decoder',
  !googleAuthSource.includes('SocialLogin.decodeIdToken') && googleAuthSource.includes('result.profile.id'),
);
check(
  'Google login retries after temporary initialization and stale provider sessions',
  googleAuthSource.includes('initializePromise = null') &&
    googleAuthSource.includes('const existing = await SocialLogin.isLoggedIn') &&
    googleAuthSource.includes("await SocialLogin.logout({ provider: 'google' }).catch"),
);
check(
  'desktop OAuth callback recovers from an opener-less popup tab',
  googleAuthSource.includes('finishStrandedGooglePopup') &&
    googleAuthSource.includes('claims?.nonce !== pending.nonce') &&
    googleAuthSource.includes("claims?.aud !== GOOGLE_WEB_CLIENT_ID") &&
    googleAuthSource.includes('new BroadcastChannel(`google_oauth_${pending.nonce}`)') &&
    mainSource.includes('const completedGooglePopup = finishStrandedGooglePopup()'),
);
check(
  'desktop session restore rejects an expired persisted Google token',
  googleAuthSource.includes('cached.jwt && tokenIsFresh(cached.jwt)') &&
    googleAuthSource.includes('if (Capacitor.isNativePlatform()) return true'),
);
check(
  'sign-out clears local account state even when online cleanup fails',
    authStoreSource.includes('set({ account: null, ready: true })') &&
    authStoreSource.includes('const cleanup = await Promise.race') &&
    authStoreSource.includes('new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000))') &&
    proStoreSource.includes('Clear account-derived state before touching the network'),
);
check(
  'linking Google retroactively syncs legacy Play purchases',
  proSource.includes('Purchases.syncPurchases()') && proSource.includes('Purchases.logIn({ appUserID })'),
);
check(
  'desktop entitlement lookup uses a private RevenueCat v2 credential',
  workerSource.includes('/active_entitlements') &&
    workerSource.includes('env.REVENUECAT_SECRET_KEY') &&
    !workerConfig.includes('REVENUECAT_API_KEY'),
);
check(
  'desktop checkout exposes monthly, yearly, and lifetime RevenueCat packages',
  proSource.includes("packageKey: 'monthly'") &&
    proSource.includes("packageKey: 'annual'") &&
    proSource.includes("packageKey: 'lifetime'") &&
    proSource.includes('webPackageForPlan(offerings, planID)'),
);

// ---- 1. Projects screen renders, sample home opens -------------------------
await page.goto(BASE);
check('projects screen renders', await page.waitForSelector('.projects-screen', { timeout: 20000 }).then(() => true).catch(() => false));
const desktopSettings = page.locator('.ps-head .ps-settings-btn');
check('desktop header shows Settings beside Language', await desktopSettings.isVisible().catch(() => false));
await desktopSettings.click();
check('desktop header Settings opens', await page.locator('.modal.settings').isVisible().catch(() => false));
await page.locator('.modal.settings .modal-foot .btn.primary').click();
await page.getByRole('button', { name: /Sunlit open-plan home/ }).first().click();
check('editor opens', await page.waitForSelector('.toolbar', { timeout: 15000 }).then(() => true).catch(() => false));
await page.locator('.coach-skip').click().catch(() => {});
check('2D canvas mounts', (await page.locator('.konvajs-content canvas').count()) > 0);

// A configured desktop build must offer web checkout. Because purchases are
// attached to the stable Google customer ID, signed-out visitors first get a
// clear sign-in action instead of the old Android-only link.
await page.locator('.floor-add').first().click();
check(
  'desktop Pro checkout asks signed-out visitors to link Google',
  await page.locator('.pro-upsell .pro-buy', { hasText: 'Sign in with Google' }).isVisible().catch(() => false),
);
check(
  'desktop Pro checkout no longer redirects to Android when configured',
  !(await page.locator('.pro-upsell .pro-buy', { hasText: 'Get the Android app' }).isVisible().catch(() => false)),
);
await page.locator('.pro-upsell .pro-later').click();

// With object movement locked, a phone user must be able to start a one-finger
// pan on the plan itself (room/wall/furniture), not only in the margin around it.
const lockedInteriorPan = await page.evaluate(async () => {
  const state = window.useDesign.getState();
  const room = state.rooms[0];
  if (!room || typeof Touch !== 'function') return { supported: false, dx: 0, dy: 0 };
  state.setTool('select');
  state.setMoveLock(true);
  // Let React refresh Canvas2D's gesture-handler closure with moveLock=true.
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const before = { ...window.useDesign.getState().pan };
  const zoom = window.useDesign.getState().zoom;
  const center = room.points.reduce(
    (sum, point) => ({ x: sum.x + point.x / room.points.length, y: sum.y + point.y / room.points.length }),
    { x: 0, y: 0 },
  );
  const content = document.querySelector('.konvajs-content');
  const rect = content.getBoundingClientRect();
  const x = rect.left + before.x + center.x * zoom;
  const y = rect.top + before.y + center.y * zoom;
  const touch = (clientX, clientY) => new Touch({
    identifier: 7, target: content, clientX, clientY,
    screenX: clientX, screenY: clientY, pageX: clientX, pageY: clientY,
  });
  const fire = (type, touches, changedTouches) => content.dispatchEvent(new TouchEvent(type, {
    bubbles: true, cancelable: true, touches, targetTouches: touches, changedTouches,
  }));
  const start = touch(x, y);
  fire('touchstart', [start], [start]);
  const moved = touch(x + 42, y + 28);
  fire('touchmove', [moved], [moved]);
  fire('touchend', [], [moved]);
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const after = window.useDesign.getState().pan;
  window.useDesign.getState().setMoveLock(false);
  return { supported: true, dx: after.x - before.x, dy: after.y - before.y };
});
check(
  'locked 2D plan pans from inside a room with one finger',
  lockedInteriorPan.supported && lockedInteriorPan.dx > 30 && lockedInteriorPan.dy > 18,
  JSON.stringify(lockedInteriorPan),
);

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
  const cloudTv = await page.evaluate(async () => {
    const { modelDefinition } = await import('/src/components/Viewer3D/GltfFurniture.tsx');
    return modelDefinition('tv_stand');
  });
  check(
    'cloud catalog can upgrade a bundled furniture model',
    cloudTv?.url.endsWith('/models/tests/cloud-smoke-tv.glb') && cloudTv.fit === 'width',
    JSON.stringify(cloudTv),
  );
  // The docked catalog used to animate in via `transition: margin-left`, and
  // that transition could wedge — the CSSTransition stayed `running`, the
  // computed margin never left -281px, and the whole panel sat off the left
  // edge of the screen. That was the long-standing "Side Table" flake: not a
  // timing issue in the test, a panel that genuinely never arrived. Assert it
  // is actually on screen rather than merely present in the DOM.
  await page.waitForFunction(() => {
    const el = document.querySelector('.catalog.docked');
    return !!el && el.getBoundingClientRect().left >= 0;
  }, null, { timeout: 15000 }).catch(() => {});
  const dockRect = await page.evaluate(() => {
    const el = document.querySelector('.catalog.docked');
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { left: Math.round(b.left), width: Math.round(b.width), margin: getComputedStyle(el).marginLeft };
  });
  check(
    'docked 3D catalog is on screen, not parked off the left edge',
    !!dockRect && dockRect.left >= 0 && dockRect.width > 100,
    JSON.stringify(dockRect),
  );
  await page.locator('.catalog.docked .cat-item[title="Side Table"]').click();
  check(
    'catalog opens 3D model preview',
    // 30s, not 15s: the preview spins up a SECOND WebGL context alongside the
    // live 3D scene. That is genuinely slow under swiftshader — and it only
    // started happening once the docked panel was fixed to actually be on
    // screen, because an off-screen panel never rendered its preview at all.
    await page.waitForSelector('.catalog.docked .catalog-preview-canvas', { timeout: 30000 }).then(() => true).catch(() => false),
  );
  await page.locator('.catalog.docked .catalog-place').click({ timeout: 30000 });
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

// ---- tester feedback: whole-plan rotation + the touch long-press menu -------
// Both come from Play Console test reports: "Is there a way to rotate the full
// floor plan?" and "I had a hard time deleting an object... tap and hold ...
// apparently, it doesn't work that way."
{
  const rot = await page.evaluate(async () => {
    const s = window.useDesign.getState();
    const span = () => {
      const ws = window.useDesign.getState().walls;
      const xs = ws.flatMap((w) => [w.start.x, w.end.x]);
      const ys = ws.flatMap((w) => [w.start.y, w.end.y]);
      return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    };
    const wallsJson = () => JSON.stringify(window.useDesign.getState().walls);
    const before = span();
    const beforeWalls = wallsJson();
    const beforeRot = window.useDesign.getState().furniture.map((f) => f.rotation);
    const beforeOpenings = JSON.stringify(window.useDesign.getState().openings);
    s.rotateDesign(90);
    await new Promise((r) => setTimeout(r, 50));
    const after = span();
    const afterRot = window.useDesign.getState().furniture.map((f) => f.rotation);
    const afterOpenings = JSON.stringify(window.useDesign.getState().openings);
    // Three more right turns must land exactly back on the original geometry.
    for (let i = 0; i < 3; i++) window.useDesign.getState().rotateDesign(90);
    await new Promise((r) => setTimeout(r, 50));
    return {
      before, after, beforeWalls, backWalls: wallsJson(),
      turned: afterRot.every((r, i) => ((r - beforeRot[i]) % 360 + 360) % 360 === 90),
      openingsUntouched: beforeOpenings === afterOpenings,
    };
  });
  check(
    'rotate plan: 90° swaps the plan bounding box',
    Math.abs(rot.after.w - rot.before.h) < 0.01 && Math.abs(rot.after.h - rot.before.w) < 0.01,
    JSON.stringify({ before: rot.before, after: rot.after }),
  );
  check('rotate plan: furniture turns with the building', rot.turned);
  check('rotate plan: openings stay on their walls', rot.openingsUntouched);
  check('rotate plan: four right turns restore the plan exactly', rot.backWalls === rot.beforeWalls);

  // The 3D section above left the viewer mounted; the long-press gesture lives
  // on the 2D Konva stage, so go back to the plan first.
  await page.click('.view-toggle button:nth-child(1)');
  await page.waitForSelector('.konvajs-content canvas', { timeout: 15000 });
  // Leave furniture mode so the docked catalog retracts, then re-fit. The 3D
  // section leaves the catalog docked, which makes the 2D canvas ~280px
  // narrower — enough that the item this block targets can sit outside the
  // visible stage and the synthetic touch lands on nothing. (Before the docking
  // transition was removed this happened to work, because the panel was still
  // mid-slide when the rect was measured.)
  await store(() => {
    const s = window.useDesign.getState();
    s.setTool('select');
    s.clearSelection();
    s.requestFit();
  });
  await page.waitForTimeout(700);

  // The long-press menu is the only route to copy/z-order on a phone, and the
  // old 7px tap slop cancelled it: a finger settling on the glass drifts
  // further than that before the 500ms timer fires.
  const hold = await page.evaluate(async () => {
    const s = window.useDesign.getState();
    s.setTool('select');
    s.setMoveLock(false);
    s.clearSelection();
    if (typeof Touch !== 'function') return { supported: false };
    const f = s.furniture[0];
    if (!f) return { supported: false };
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const st = window.useDesign.getState();
    const content = document.querySelector('.konvajs-content');
    const rect = content.getBoundingClientRect();
    const x = rect.left + st.pan.x + f.position.x * st.zoom;
    const y = rect.top + st.pan.y + f.position.y * st.zoom;
    const mk = (cx, cy) => new Touch({
      identifier: 11, target: content, clientX: cx, clientY: cy,
      screenX: cx, screenY: cy, pageX: cx, pageY: cy,
    });
    const fire = (t, tt, ch) => content.dispatchEvent(new TouchEvent(t, {
      bubbles: true, cancelable: true, touches: tt, targetTouches: tt, changedTouches: ch,
    }));
    const run = async (drift) => {
      window.useDesign.getState().clearSelection();
      const t0 = mk(x, y);
      fire('touchstart', [t0], [t0]);
      // Settle early (as a real fingertip does), then hold past 500ms.
      for (let i = 1; i <= 3; i++) {
        await new Promise((r) => setTimeout(r, 50));
        const j = mk(x + (drift * i) / 3, y);
        fire('touchmove', [j], [j]);
      }
      for (let i = 0; i < 5; i++) {
        await new Promise((r) => setTimeout(r, 100));
        const j = mk(x + drift + (i % 2 ? 0.5 : -0.5), y);
        fire('touchmove', [j], [j]);
      }
      const opened = !!document.querySelector('.ctx-menu');
      const labels = [...document.querySelectorAll('.ctx-item')].map((b) => b.textContent);
      fire('touchend', [], [mk(x + drift, y)]);
      document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 120));
      return { opened, labels };
    };
    const settled = await run(10); // a hold that drifts like a real finger
    const dragged = await run(40); // an unmistakable drag
    return { supported: true, settled, dragged };
  });
  if (!hold.supported) {
    check('long-press menu: touch events unavailable (skipped)', true);
  } else {
    check(
      'long-press menu opens despite a settling finger (10px drift)',
      hold.settled.opened,
      JSON.stringify(hold.settled),
    );
    check(
      'long-press menu offers Delete',
      hold.settled.labels.some((l) => /Delete/i.test(l)),
      JSON.stringify(hold.settled.labels),
    );
    check('a real 40px drag still does not open the menu', !hold.dragged.opened);
  }
}

// ---- shared dialog shell: Escape, a11y, and real motion --------------------
// Before <Modal> none of the seven dialogs closed on Escape, none trapped focus
// and only one carried a role. All of that is now in one place, so assert it
// once against a representative dialog.
// Uses its own page on the projects screen, where Settings has a direct button —
// the main `page` is deep in the 3D editor by now and its state is not worth
// unwinding just to open a dialog.
{
  const a11y = await browser.newPage({ viewport: { width: 1100, height: 800 }, reducedMotion: 'reduce' });
  await a11y.goto(BASE);
  // Mark the first-run tour as seen BEFORE the app boots. CoachMarks installs a
  // document-level Escape handler of its own, and on a fresh profile it was
  // racing this block's Escape — the source of an intermittent failure here.
  await a11y.evaluate(() => localStorage.setItem('homedesigner.tour.v1', 'done'));
  await a11y.reload();
  await a11y.waitForSelector('.projects-screen', { timeout: 20000 });
  await a11y.locator('.ps-head .ps-settings-btn').click();
  // Let the dialog mount and its key/focus effect attach before driving it. The
  // listener is installed in an effect, so a keypress dispatched in the same
  // tick as the opening click lands before anything is listening.
  await a11y.waitForTimeout(400);
  const shown = await a11y.locator('.modal.settings').isVisible().catch(() => false);
  check('settings dialog opens', shown);
  if (shown) {
    check(
      'dialog announces itself (role + aria-modal + label)',
      await a11y.evaluate(() => {
        const el = document.querySelector('.modal.settings');
        if (!el) return false;
        const id = el.getAttribute('aria-labelledby');
        return el.getAttribute('role') === 'dialog'
          && el.getAttribute('aria-modal') === 'true'
          && !!id && !!document.getElementById(id);
      }),
    );
    check(
      'focus moves into the dialog on open',
      await a11y.evaluate(() => !!document.querySelector('.modal.settings')?.contains(document.activeElement)),
    );
    // Before <Modal> not one dialog in the app responded to Escape.
    // Poll rather than waiting a fixed slice: the panel is removed only once its
    // exit finishes, and under software rendering that lands around 0.6s once
    // Playwright's own round-trips are counted.
    await a11y.keyboard.press('Escape');
    let closed = false;
    for (let i = 0; i < 25 && !closed; i++) {
      closed = (await a11y.locator('.modal.settings').count()) === 0;
      if (!closed) await a11y.waitForTimeout(60);
    }
    check('Escape closes the dialog', closed);
  }
  await a11y.close();
}

// Motion is disabled for the rest of this suite (reducedMotion: 'reduce'), which
// is what keeps it deterministic — but that means nothing above would fail if the
// animations were never wired up. This context leaves motion ON and checks that a
// closing dialog actually lingers for a frame instead of vanishing instantly.
{
  const motionPage = await browser.newPage({ viewport: { width: 1100, height: 800 } });
  await motionPage.goto(BASE);
  await motionPage.waitForSelector('.projects-screen', { timeout: 20000 });
  await motionPage.locator('.ps-head .ps-settings-btn').click();
  const opened = await motionPage.locator('.modal.settings').isVisible().catch(() => false);
  check('motion context: settings dialog opens', opened);
  if (opened) {
    await motionPage.locator('.modal.settings .modal-foot .btn.primary').click();
    // Immediately after the close click the panel must STILL be there (it is
    // animating out). With no exit animation this is 0 and the check fails —
    // which is the point: it is what stops "all green" from being compatible
    // with having shipped no animation.
    const during = await motionPage.locator('.modal.settings').count();
    // ...and it must still finish. A never-completing exit would leave a
    // backdrop swallowing every click, which is exactly what an earlier draft
    // of <Modal> did (mixed element- and variant-level transitions).
    let gone = false;
    for (let i = 0; i < 25 && !gone; i++) {
      gone = (await motionPage.locator('.modal.settings').count()) === 0;
      if (!gone) await motionPage.waitForTimeout(60);
    }
    check('dialog animates out instead of vanishing in one frame', during === 1 && gone,
      `during=${during} gone=${gone}`);
  }
  await motionPage.close();
}

// ---- onboarding: tour depth, and the Tips panel in a non-English locale -----
// Testers reported the tour "isn't thorough enough" and that the home screen's
// "Need inspiration?" destination wasn't translated — the whole Tips panel had
// shipped in English for all 12 locales.
{
  const fr = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
  await fr.goto(BASE);
  await fr.evaluate(() => localStorage.setItem('homedesigner.lang.v1', 'fr'));
  await fr.reload();
  await fr.waitForSelector('.projects-screen', { timeout: 20000 });

  const banner = await fr.locator('.ps-inspire').innerText().catch(() => '');
  check('inspiration banner is translated', /inspiration/i.test(banner) && !/Explore ideas/.test(banner));

  await fr.locator('.ps-inspire').click();
  await fr.waitForTimeout(500);
  const help = await fr.locator('.modal.help-panel').innerText().catch(() => '');
  check('Tips panel opens from the inspiration banner', help.length > 50);
  // The section headings and footer are the giveaway if i18n regresses.
  check(
    'Tips panel is translated, not English',
    !/Drawing walls & rooms|Measure & scale|Floors & 3D|Got it|Tips & (gestures|shortcuts)/.test(help),
    JSON.stringify(help.slice(0, 80)),
  );
  await fr.keyboard.press('Escape');
  await fr.waitForTimeout(400);

  // The tour is offered only on a blank project, and is opt-in.
  await fr.locator('button', { hasText: /Nouveau projet|New project/i }).first().click();
  await fr.waitForSelector('.toolbar', { timeout: 20000 });
  await fr.waitForTimeout(700);
  const offered = await fr.locator('.welcome-tour').isVisible().catch(() => false);
  check('first-run tour is offered on a blank project', offered);
  if (offered) {
    await fr.locator('.welcome-tour .btn.primary').click();
    await fr.waitForTimeout(700);
    const bubble = await fr.locator('.coach-bubble').innerText().catch(() => '');
    check('tour is translated', bubble.length > 20 && !/Build tools|Draw walls and rooms/.test(bubble));
    // Walk it end to end. This is the real check: a step whose anchor is
    // missing silently skips, and a bubble taller than the placement estimate
    // used to run off a phone screen and strand the Next button.
    let seen = 0;
    for (let i = 0; i < 12; i++) {
      if (!(await fr.locator('.coach-bubble').isVisible().catch(() => false))) break;
      seen++;
      const next = fr.locator('.coach-next');
      if (!(await next.isVisible().catch(() => false))) break;
      await next.click();
      await fr.waitForTimeout(350);
    }
    check('every tour step resolves an anchor and stays on screen', seen === 8, `saw ${seen}`);
  }
  await fr.close();
}

// ---- rotate the plan from 3D ------------------------------------------------
// It lived only in Properties, which in 3D on a phone is behind the Edit tab AND
// only appears with nothing selected — so in practice it was unreachable there.
if (!process.env.SMOKE_SKIP_3D) {
  const r3 = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
  await r3.goto(BASE);
  await r3.waitForSelector('.projects-screen', { timeout: 20000 });
  await r3.getByRole('button', { name: /Sunlit open-plan home/ }).first().click();
  await r3.waitForSelector('.toolbar', { timeout: 20000 });
  await r3.locator('.coach-skip').click().catch(() => {});
  await r3.waitForTimeout(500);
  await r3.click('.view-toggle button:nth-child(2)');
  await r3.waitForTimeout(14000);
  await r3.locator('.view-pill > button').click();
  await r3.waitForTimeout(400);
  const rotateVisible = await r3.locator('.view-menu-row button[title*="90"]').first().isVisible().catch(() => false);
  check('rotate plan is reachable in 3D', rotateVisible);
  if (rotateVisible) {
    const before = await r3.evaluate(() => JSON.stringify(window.useDesign.getState().walls.map((w) => w.start)));
    await r3.locator('.view-menu-row button[title*="90"]').first().click();
    await r3.waitForTimeout(400);
    const after = await r3.evaluate(() => JSON.stringify(window.useDesign.getState().walls.map((w) => w.start)));
    check('rotating from 3D turns the plan', before !== after);
  }
  await r3.close();
}

// ---- 6. No page errors ------------------------------------------------------
// Old releases could leave a project JSON without a corresponding index row.
// A reload must recover it so the next authenticated sync uploads it.
const recoveryPage = await browser.newPage({ viewport: { width: 900, height: 700 } });
await recoveryPage.goto(BASE);
await recoveryPage.evaluate(() => {
  localStorage.setItem('homedesigner.project.recovered_legacy', JSON.stringify({
    projectName: 'Recovered legacy plan',
  }));
});
await recoveryPage.reload();
check(
  'orphaned legacy project is re-indexed for cloud sync',
  await recoveryPage.getByRole('button', { name: 'Open Recovered legacy plan' })
    .isVisible().catch(() => false),
);
await recoveryPage.close();

// ---- update offer on startup ----------------------------------------------
// A fresh page with a version.json claiming a newer release. This is the whole
// point of the feature and it is invisible to every other check.
{
  const upd = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  let served = { version: '9.9.9' };
  await upd.route('**/version.json*', (r) =>
    r.fulfill({ contentType: 'application/json', body: JSON.stringify(served) }));
  await upd.goto(BASE, { waitUntil: 'networkidle' });
  const banner = upd.locator('.update-banner');
  check('update: banner offers a newer version',
    await banner.waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false));
  check('update: banner names the version',
    ((await banner.textContent().catch(() => '')) || '').includes('9.9.9'));

  await upd.locator('.update-banner .ub-close').click();
  await upd.reload({ waitUntil: 'networkidle' });
  await upd.waitForTimeout(1200);
  check('update: a dismissed version stops asking', !(await banner.isVisible().catch(() => false)));

  served = { version: '9.9.10' };
  await upd.reload({ waitUntil: 'networkidle' });
  check('update: a newer release asks again',
    await banner.waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false));

  // And the running version must never prompt.
  const pkgVersion = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version;
  served = { version: pkgVersion };
  await upd.evaluate(() => localStorage.removeItem('homedesigner.update.dismissed'));
  await upd.reload({ waitUntil: 'networkidle' });
  await upd.waitForTimeout(1200);
  check('update: no prompt when already up to date', !(await banner.isVisible().catch(() => false)));
  await upd.close();
}

check('zero page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));

await browser.close();
dev.kill();
console.log(failures === 0 ? '\nSMOKE: all green' : `\nSMOKE: ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
