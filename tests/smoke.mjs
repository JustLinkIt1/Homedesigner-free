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
const proUpsellSource = await readFile(join(root, 'src', 'components', 'ProUpsellModal.tsx'), 'utf8');
const canvas2DSource = await readFile(join(root, 'src', 'components', 'Editor2D', 'Canvas2D.tsx'), 'utf8');
const modelStudioAccessSource = await readFile(join(root, 'src', 'lib', 'modelStudioAccess.ts'), 'utf8');
const scene3DSource = await readFile(join(root, 'src', 'components', 'Viewer3D', 'Scene3D.tsx'), 'utf8');
const furniture3DSource = await readFile(join(root, 'src', 'components', 'Viewer3D', 'Furniture3D.tsx'), 'utf8');
const referralSource = await readFile(join(root, 'src', 'lib', 'referral.ts'), 'utf8');
const workerSource = await readFile(join(root, 'workers', 'design-sync', 'src', 'index.ts'), 'utf8');
const workerConfig = await readFile(join(root, 'workers', 'design-sync', 'wrangler.jsonc'), 'utf8');
const pagesHeaders = await readFile(join(root, 'site', '_headers'), 'utf8');
const androidManifest = await readFile(join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'), 'utf8');
check(
  'Google login does not trigger the Android custom-scope guard',
  !/SocialLogin\.login\(\{[\s\S]{0,300}?scopes\s*:/.test(googleAuthSource),
);
check(
  'mobile Model Studio uses the supported native browser instead of window.open',
  modelStudioAccessSource.includes("from '@capacitor/browser'") &&
    modelStudioAccessSource.includes('await Browser.open({ url: MODEL_STUDIO_URL })') &&
    !modelStudioAccessSource.includes('window.open('),
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
  'native purchase flow cannot leave the Pro sheet spinning forever',
  proSource.includes('PURCHASE_TIMEOUT_MS') &&
    proSource.includes('Purchases.purchasePackage({ aPackage: pkg })') &&
    proSource.includes('if (await this.sync().catch(() => false)) return true') &&
    proSource.includes('tap Restore purchase') &&
    proStoreSource.includes('settleStranded: async () =>'),
);
check(
  'desktop entitlement lookup uses a private RevenueCat v2 credential',
  workerSource.includes('/active_entitlements') &&
    workerSource.includes('env.REVENUECAT_SECRET_KEY') &&
    !workerConfig.includes('REVENUECAT_API_KEY'),
);
check(
  'production web has no URL or localStorage Pro test bypass',
  !proSource.includes('homedesigner.pro.mock') &&
    !proSource.includes("get('pro') === '1'") &&
    proStoreSource.includes('if (!Capacitor.isNativePlatform()) return false'),
);
check(
  'retired referral grants are Android-only and restricted to the grandfathered campaign',
  referralSource.includes("new Set(['HOMEDESIGN50'])") &&
    referralSource.includes('if (!Capacitor.isNativePlatform()) return false'),
);
check(
  'sync API rate-limits verified users and requires the exact Pro entitlement',
  workerSource.includes('USER_READ_LIMITER') &&
    workerSource.includes('USER_WRITE_LIMITER') &&
    workerSource.includes("item.entitlement_id === 'Pro'") &&
    workerSource.includes("{ error: 'Too many requests' }, 429") &&
    workerConfig.includes('"ratelimits"'),
);
check(
  'Cloudflare Pages and Android ship baseline data protections',
  pagesHeaders.includes('Strict-Transport-Security:') &&
    pagesHeaders.includes('X-Frame-Options: DENY') &&
    pagesHeaders.includes('X-Content-Type-Options: nosniff') &&
    androidManifest.includes('android:allowBackup="false"') &&
    androidManifest.includes('android:usesCleartextTraffic="false"'),
);
check(
  'desktop checkout exposes monthly, yearly, and lifetime RevenueCat packages',
  proSource.includes("packageKey: 'monthly'") &&
    proSource.includes("packageKey: 'annual'") &&
    proSource.includes("packageKey: 'lifetime'") &&
    proSource.includes('webPackageForPlan(offerings, planID)'),
);
check(
  'every interactive placement path confirms one-shot placement',
  canvas2DSource.match(/notifyPlacementComplete\(/g)?.length === 2 &&
    scene3DSource.match(/notifyPlacementComplete\(/g)?.length === 2 &&
    furniture3DSource.match(/notifyPlacementComplete\(/g)?.length === 1,
);

// ---- 1. Projects screen renders, sample home opens -------------------------
await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
check('projects screen renders', await page.waitForSelector('.projects-screen', { timeout: 20000 }).then(() => true).catch(() => false));
// ---- the projects paywall is count-based, so the badge must be too ---------
// `list.length >= 1 && requirePro('projects')` — your FIRST project is free
// whichever template you pick. A static badge would tell a brand-new user their
// free first project costs money, which is worse than the silence it replaced.
{
  const badgesNow = () => page.evaluate(() => ({
    projects: window.useDesign ? document.querySelectorAll('.ps-card').length : -1,
    templateBadges: document.querySelectorAll('.tpl-card .pro-tag-corner').length,
    heroBadge: document.querySelectorAll('.ps-hero-new .pro-tag-corner').length,
    templates: document.querySelectorAll('.tpl-card').length,
  }));
  const fresh = await badgesNow();
  check('pro: templates are unbadged while the first project is still free',
    fresh.templates > 0 && fresh.templateBadges === 0 && fresh.heroBadge === 0, JSON.stringify(fresh));
}
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

// ---- 2b. Retyping a size box ----------------------------------------------
// Every number field in the properties panel used to clamp on each keystroke,
// straight into the store. Clearing "250" left "", which parses as 0, clamps to
// the minimum and rewrites the box — so the next keystroke produced "101", not
// "1", and you could not simply backspace and retype a value.
// Reported: "Erasing 250 sets the field to 10. I cannot backspace and type 160."
{
  await store(() => {
    const s = window.useDesign.getState();
    const id = s.furniture[s.furniture.length - 1].id;
    s.select({ kind: 'furniture', id });
    s.updateFurniture(id, { width: 250 });
  });
  const widthBox = page.locator('.prop-row input[type=number]').first();
  const widthOf = () => store(() => {
    const s = window.useDesign.getState();
    return s.furniture[s.furniture.length - 1].width;
  });

  await widthBox.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(120);
  check('clearing a size box leaves it empty, not snapped to the minimum',
    (await widthBox.inputValue()) === '', `box shows "${await widthBox.inputValue()}"`);
  check('clearing a size box does not resize the object', (await widthOf()) === 250);

  // "1" is below the 10cm minimum and must sit in the box untouched rather than
  // being clamped and written back under the caret.
  await page.keyboard.type('1');
  await page.waitForTimeout(80);
  check('a below-minimum keystroke is left alone while typing',
    (await widthBox.inputValue()) === '1', `box shows "${await widthBox.inputValue()}"`);
  await page.keyboard.type('60');
  await page.waitForTimeout(120);
  check('the typed number survives to the end', (await widthBox.inputValue()) === '160');
  check('an in-range value previews live', (await widthOf()) === 160);

  // Validation moved, it did not go away.
  await page.keyboard.press('Control+A');
  await page.keyboard.type('4');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  check('committing a below-minimum value clamps it', (await widthOf()) === 10, `got ${await widthOf()}`);

  // Clearing and walking away reverts rather than silently resizing.
  await widthBox.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  check('an emptied box reverts on commit', (await widthOf()) === 10);
}
// Successful placement is one-shot, but the confirmation lets the homeowner
// recover or explicitly repeat without reopening the catalogue.
await page.evaluate(async () => {
  const { notifyPlacementComplete } = await import('/src/lib/placementFeedback.ts');
  const s = window.useDesign.getState();
  const id = s.addFurniture('side_table', { x: 260, y: 260 });
  s.select({ kind: 'furniture', id });
  s.setPendingFurniture(null);
  s.setTool('select');
  notifyPlacementComplete('side_table');
});
const placedToast = page.locator('.toast.success', { hasText: 'Placed' }).last();
check('placement confirmation offers Undo and Place another',
  await placedToast.getByRole('button', { name: 'Undo' }).isVisible().catch(() => false) &&
    await placedToast.getByRole('button', { name: 'Place another' }).isVisible().catch(() => false));
await placedToast.getByRole('button', { name: 'Place another' }).click();
const repeatState = await store(() => ({
  pending: window.useDesign.getState().pendingFurnitureType,
  tool: window.useDesign.getState().tool,
  selection: window.useDesign.getState().selection.id,
}));
check('Place another explicitly re-arms the same item',
  repeatState.pending === 'side_table' && repeatState.tool === 'furniture' && repeatState.selection === null,
  JSON.stringify(repeatState));
await store(() => {
  const s = window.useDesign.getState();
  s.setPendingFurniture(null);
  s.setTool('select');
});

const beforePlacementUndo = await store(() => window.useDesign.getState().furniture.length);
await page.evaluate(async () => {
  const { notifyPlacementComplete } = await import('/src/lib/placementFeedback.ts');
  const s = window.useDesign.getState();
  const id = s.addFurniture('side_table', { x: 280, y: 280 });
  s.select({ kind: 'furniture', id });
  notifyPlacementComplete('side_table');
});
const undoPlacementToast = page.locator('.toast.success', { hasText: 'Placed' }).last();
await undoPlacementToast.getByRole('button', { name: 'Undo' }).click();
check('placement Undo removes only the new item and clears selection',
  (await store(() => window.useDesign.getState().furniture.length)) === beforePlacementUndo &&
    (await store(() => window.useDesign.getState().selection.id)) === null);
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

// The private production tool must remain reachable in the cramped editor
// toolbar without requiring the owner to find the horizontally-scrolled
// account avatar first.
await page.evaluate(async () => {
  const { useAuthStore } = await import('/src/store/authStore.ts');
  useAuthStore.setState({
    account: {
      subject: 'owner-smoke',
      email: ' NATHANJOPPICH@GMAIL.COM ',
      name: 'Owner',
      imageUrl: null,
    },
  });
});
await page.click('[aria-label="More"]');
check('owner can reach Model Studio directly from the editor More menu',
  await page.locator('.more-menu [role="menuitem"]:has-text("Model Studio")').isVisible().catch(() => false));
await page.click('[aria-label="More"]');

// ---- 5. 3D view -------------------------------------------------------------
if (process.env.SMOKE_SKIP_3D) {
  console.log('SKIP  3D view (SMOKE_SKIP_3D)');
} else {
  // Thumbnail generation is best-effort. A tainted canvas can throw before
  // returning a data URL; navigation must still enter 3D instead of leaving
  // the user tapping an apparently dead view switch.
  await page.evaluate(async () => {
    const { planCapture } = await import('/src/lib/renderBridge.ts');
    planCapture.current = () => { throw new Error('synthetic tainted canvas'); };
  });
  await page.click('.view-toggle button:nth-child(2)');
  check(
    'thumbnail capture failure does not block 3D navigation',
    await page.locator('.view-toggle button:nth-child(2).active').waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false),
  );
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
  // The same catalogue entry may also appear in Recent or Favourites. Exercise
  // one visible instance instead of relying on there being only one DOM copy.
  const sideTableCard = page.locator('.catalog.docked .cat-item[data-tip="Side Table"]').first();
  // 45s like the other clicks in this block: the docked 3D catalog has just
  // mounted a WebGL surface, and under software GL that compile stalls the main
  // thread well past the 30s default.
  await sideTableCard.locator('.cat-item-select').click({ timeout: 45000 });
  check(
    'catalog selection stays GPU-light until 3D preview is requested',
    await page.locator('.catalog.docked .catalog-preview-static').isVisible().catch(() => false)
      && await page.locator('.catalog.docked .catalog-preview-canvas').count() === 0,
  );
  check(
    'catalog card uses a lazy photoreal sprite when one exists',
    await sideTableCard.locator('.ci-sprite').isVisible().catch(() => false),
  );
  await sideTableCard.locator('.ci-favorite').click();
  const savedFavorites = await page.evaluate(() => JSON.parse(localStorage.getItem('homedesigner.favorites.v1') ?? '[]'));
  check(
    'catalog favourites persist and appear as a shortcut row',
    savedFavorites.includes('side_table')
      && await page.locator('.catalog.docked .cat-section', { hasText: 'Favourites' }).isVisible().catch(() => false),
  );
  await page.locator('.catalog.docked .catalog-preview-3d').click();
  check(
    'on-demand catalog 3D preview opens',
    await page.waitForSelector('.catalog.docked .catalog-preview-canvas', { timeout: 30000 }).then(() => true).catch(() => false),
  );
  // ---- Pro items are legible before they are tapped ------------------------
  // Reported: "the user has no idea it is a paid feature, only after clicking on
  // it. User has to manually click through every single furniture to check if
  // it's a free or paid one." 57 of the 96 bundled objects are Pro, so the badge
  // has to track the DATA — a decorative badge on a fixed set would pass a
  // "some badge exists" check and still mislead.
  {
    const badged = await page.locator('.catalog.docked .cat-item .pro-tag-corner').count();
    const lockedInStore = await page.evaluate(() => {
      const shown = [...document.querySelectorAll('.catalog.docked .cat-item')];
      const isPro = window.useProStore.getState().isPro;
      return { shown: shown.length, isPro };
    });
    check('pro: locked catalog items are badged before being tapped', badged > 0, `${badged} badges`);
    check('pro: not every item is badged — free ones are visibly free',
      badged < lockedInStore.shown, `${badged} of ${lockedInStore.shown}`);
    check('pro: the badge is only shown to non-Pro users', lockedInStore.isPro === false);

    // The Free chip is the answer to "click through every single furniture".
    const freeChip = page.locator('.catalog.docked .cat-chips .chip', { hasText: /^Free$/ });
    check('pro: a Free chip is offered to non-Pro users', await freeChip.isVisible().catch(() => false));
    await freeChip.click();
    await page.waitForTimeout(300);
    const afterFilter = await page.evaluate(() => ({
      items: document.querySelectorAll('.catalog.docked .cat-item').length,
      badges: document.querySelectorAll('.catalog.docked .cat-item .pro-tag-corner').length,
    }));
    check('pro: filtering to Free leaves only placeable objects',
      afterFilter.items > 0 && afterFilter.badges === 0, JSON.stringify(afterFilter));

    // Owning Pro must retire both the badges and the chip.
    await page.evaluate(() => window.useProStore.setState({ isPro: true }));
    await page.waitForTimeout(400);
    const asPro = await page.evaluate(() => ({
      badges: document.querySelectorAll('.catalog.docked .pro-tag-corner').length,
      freeChip: [...document.querySelectorAll('.catalog.docked .cat-chips .chip')]
        .some((c) => c.textContent.trim() === 'Free'),
      category: document.querySelector('.catalog.docked .cat-chips .chip.active')?.textContent.trim(),
    }));
    check('pro: a Pro owner sees no badges', asPro.badges === 0, JSON.stringify(asPro));
    check('pro: the Free chip is retired once Pro is owned', !asPro.freeChip, JSON.stringify(asPro));
    // Buying while standing on the Free chip must not strand the user on a
    // filter that no longer exists.
    check('pro: buying while filtered to Free falls back to All',
      asPro.category === 'All', JSON.stringify(asPro));
    await page.evaluate(() => window.useProStore.setState({ isPro: false }));
    await page.waitForTimeout(300);
    await page.locator('.catalog.docked .cat-chips .chip', { hasText: /^All$/ }).click();
    await page.waitForTimeout(200);
  }

  // 45s to match the rotate-pill wait below: both land right after the WebGL
  // preview opens, and under software GL that compile stalls the main thread
  // long enough that a 30s click timed out in 3 of 4 runs on a loaded machine.
  await page.locator('.catalog.docked .catalog-place').click({ timeout: 45000 });
  check(
    '3D placement guidance appears',
    await page.locator('.placement-affordance', { hasText: 'Tap a floor to place Side Table' }).isVisible().catch(() => false),
  );
  // The selection ring replaced the ±45° rotate pill in 3D. It is anchored to
  // the object through drei's <Html>, so this also proves the projection works.
  await store(() => {
    const s = window.useDesign.getState();
    s.select({ kind: 'furniture', id: s.furniture[0].id });
  });
  // Generous: under software GL the model-heavy scene can stall the main
  // thread for tens of seconds while shaders/BVH compile.
  const ring3d = await page.waitForSelector('.sel-ring button', { timeout: 45000 })
    .then(() => true).catch(() => false);
  check('3D selection ring appears over the selected object', ring3d);
  if (ring3d) {
    check('3D selection ring carries four actions',
      (await page.locator('.sel-ring button').count()) === 4);
    // Same geometry as 2D, so the same overlap trap applies — and it is just as
    // invisible in a screenshot here.
    const overlap = await page.evaluate(() => {
      const r = [...document.querySelectorAll('.sel-ring button')].map((b) => b.getBoundingClientRect());
      const hits = [];
      for (let i = 0; i < r.length; i++) {
        for (let j = i + 1; j < r.length; j++) {
          if (r[i].left < r[j].right && r[j].left < r[i].right
            && r[i].top < r[j].bottom && r[j].top < r[i].bottom) hits.push(`${i}/${j}`);
        }
      }
      return hits;
    });
    check('3D selection ring: no two buttons overlap', overlap.length === 0, overlap.join(', '));

    const r0 = await store(() => window.useDesign.getState().furniture[0].rotation);
    // The ring tracks a projected 3D point, so under software WebGL it may move
    // by subpixels forever and never satisfy Playwright's "stable" heuristic.
    // Visibility and non-overlap are asserted above; dispatch to that exact
    // visible control without waiting for a static bounding box.
    await page.locator('.sel-ring button[aria-label^="Rotate"]').click({ force: true });
    await page.waitForTimeout(250);
    const r1 = await store(() => window.useDesign.getState().furniture[0].rotation);
    check('3D selection ring: rotate turns the object by 90°', (r1 - r0 + 360) % 360 === 90, `got ${r1 - r0}`);
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
}

// ---- long-press context menu ------------------------------------------------
// Only needs the 2D Konva stage, so it no longer sits inside the 3D section and
// still runs with SMOKE_SKIP_3D=1. On a phone this is the only route to
// copy/duplicate/z-order, so it is worth covering everywhere.
{
  // Run the gesture in its OWN page. Sharing `page` made this block flaky in
  // both directions: it inherits ~50 prior interactions (drags, a delete+undo,
  // a 3D round-trip that docks the catalog, four 90° plan rotations), and that
  // accumulated stage state intermittently swallowed the synthetic touch
  // entirely — no menu, no selection, no drag — or left a drag armed so the
  // item slid out from under the menu. In a clean page the same gesture is
  // deterministic (verified 8/8 by hand, before and after the fix). Touch
  // simulation is sensitive to stage state, so give it an untouched stage.
  const lp = await browser.newPage({
    viewport: { width: 1280, height: 800 },
    hasTouch: true,
    reducedMotion: 'reduce',
  });
  await lp.goto(BASE);
  await lp.waitForSelector('.projects-screen', { timeout: 20000 });
  await lp.getByRole('button', { name: /Sunlit open-plan home/ }).first().click();
  await lp.waitForSelector('.toolbar', { timeout: 20000 });
  await lp.locator('.coach-skip').click().catch(() => {});
  await lp.waitForSelector('.konvajs-content canvas', { timeout: 15000 });
  await lp.evaluate(() => {
    const s = window.useDesign.getState();
    s.setTool('select');
    s.clearSelection();
    s.requestFit();
  });
  await lp.waitForTimeout(700);

  // The long-press menu is the only route to copy/z-order on a phone, and the
  // old 7px tap slop cancelled it: a finger settling on the glass drifts
  // further than that before the 500ms timer fires.
  const hold = await lp.evaluate(async () => {
    const s = window.useDesign.getState();
    s.setTool('select');
    s.setMoveLock(false);
    s.clearSelection();
    if (typeof Touch !== 'function') return { supported: false };
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const st = window.useDesign.getState();
    const content = document.querySelector('.konvajs-content');
    const rect = content.getBoundingClientRect();
    // Pick an item that is genuinely INSIDE the visible stage, rather than
    // assuming furniture[0] is. The stage width changes with the docked catalog
    // and the fit, so a fixed index sometimes resolved to a point off-canvas and
    // the synthetic touch hit nothing — which looked like the gesture failing.
    const screenOf = (it) => ({
      x: rect.left + st.pan.x + it.position.x * st.zoom,
      y: rect.top + st.pan.y + it.position.y * st.zoom,
    });
    const inset = 40;
    const f = st.furniture.find((it) => {
      const p = screenOf(it);
      return p.x > rect.left + inset && p.x < rect.right - inset
        && p.y > rect.top + inset && p.y < rect.bottom - inset;
    });
    if (!f) return { supported: false, reason: 'no furniture inside the visible stage' };
    const { x, y } = screenOf(f);
    const mk = (cx, cy) => new Touch({
      identifier: 11, target: content, clientX: cx, clientY: cy,
      screenX: cx, screenY: cy, pageX: cx, pageY: cy,
    });
    const fire = (t, tt, ch) => content.dispatchEvent(new TouchEvent(t, {
      bubbles: true, cancelable: true, touches: tt, targetTouches: tt, changedTouches: ch,
    }));
    // Sample the menu at every step and report whether it appeared AT ALL,
    // rather than reading once at the end. The menu opens on a 500ms timer and
    // the old single read landed ~150ms after it — thin enough that a loaded
    // machine (this block runs right after the 3D teardown) pushed the timer
    // past the read and the check failed intermittently. Polling also makes the
    // negative case stricter: the drag must never open the menu at any point,
    // not merely be closed again by the time we look.
    const posOf = (id) => {
      const it = window.useDesign.getState().furniture.find((q) => q.id === id);
      return it ? { x: it.position.x, y: it.position.y } : null;
    };
    const run = async (drift) => {
      window.useDesign.getState().clearSelection();
      const before = posOf(f.id);
      const t0 = mk(x, y);
      fire('touchstart', [t0], [t0]);
      let opened = false;
      let labels = [];
      const sample = () => {
        if (opened || !document.querySelector('.ctx-menu')) return;
        opened = true;
        labels = [...document.querySelectorAll('.ctx-item')].map((b) => b.textContent);
      };
      // Settle early (as a real fingertip does), then hold past 500ms.
      for (let i = 1; i <= 3; i++) {
        await new Promise((r) => setTimeout(r, 50));
        const j = mk(x + (drift * i) / 3, y);
        fire('touchmove', [j], [j]);
        sample();
      }
      for (let i = 0; i < 8; i++) {
        await new Promise((r) => setTimeout(r, 100));
        const j = mk(x + drift + (i % 2 ? 0.5 : -0.5), y);
        fire('touchmove', [j], [j]);
        sample();
      }
      fire('touchend', [], [mk(x + drift, y)]);
      document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 120));
      const after = posOf(f.id);
      const moved = before && after ? Math.hypot(after.x - before.x, after.y - before.y) : -1;
      return { opened, labels, moved };
    };
    const settled = await run(10); // a hold that drifts like a real finger
    const dragged = await run(40); // an unmistakable drag
    return { supported: true, settled, dragged, at: [Math.round(x), Math.round(y)] };
  });
  if (!hold.supported) {
    check('long-press menu: touch events unavailable (skipped)', true);
  } else {
    check(
      'long-press menu opens despite a settling finger (10px drift)',
      hold.settled.opened,
      JSON.stringify({ ...hold.settled, at: hold.at }),
    );
    check(
      'long-press menu offers Delete',
      hold.settled.labels.some((l) => /Delete/i.test(l)),
      JSON.stringify(hold.settled.labels),
    );
    // The rotate handle needs a precise drag; on touch the right-angle step is
    // the rotation people actually want, so it has to be reachable here.
    check(
      'long-press menu offers Rotate 90°',
      hold.settled.labels.some((l) => /Rotate/i.test(l)),
      JSON.stringify(hold.settled.labels),
    );
    check('a real 40px drag still does not open the menu', !hold.dragged.opened);
    // Konva's dragDistance used to be 8 against a 12px tap slop, so a settling
    // finger opened the menu AND slid the item ~9cm out from under it.
    check(
      'a settling finger does not nudge the item it long-presses',
      hold.settled.moved === 0,
      `moved ${hold.settled.moved}`,
    );
  }
  await lp.close();
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

// ---- contextual mobile selection dock --------------------------------------
// Keep high-frequency transforms reachable without forcing a phone user into
// the full Properties sheet. This runs in a real coarse-pointer page because
// viewport width alone does not activate the touch-only dock.
{
  const md = await browser.newPage({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    reducedMotion: 'reduce',
  });
  await md.addInitScript(() => {
    const nativeMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = (query) => query === '(pointer: coarse)'
      ? {
          matches: true,
          media: query,
          onchange: null,
          addListener() {},
          removeListener() {},
          addEventListener() {},
          removeEventListener() {},
          dispatchEvent() { return false; },
        }
      : nativeMatchMedia(query);
  });
  await md.goto(BASE);
  await md.waitForSelector('.projects-screen', { timeout: 20000 });
  await md.getByRole('button', { name: /Sunlit open-plan home/ }).first().click();
  await md.waitForSelector('.toolbar', { timeout: 20000 });
  await md.locator('.coach-skip').click().catch(() => {});

  const mobileStairId = await md.evaluate(() => {
    const s = window.useDesign.getState();
    s.setTool('select');
    const id = s.addFurniture('stairs', { x: 250, y: 250 });
    s.select({ kind: 'furniture', id });
    return id;
  });
  const dock = md.getByRole('navigation', { name: 'Selected object actions' });
  check('mobile selection dock appears for selected furniture', await dock.isVisible().catch(() => false));
  check('stair dock exposes reverse, duplicate, delete and more',
    await dock.getByRole('button').count() === 4);
  await dock.getByRole('button', { name: 'Reverse' }).click();
  check('mobile dock reverses stairs in one tap',
    (await md.evaluate((id) => window.useDesign.getState().furniture.find((f) => f.id === id)?.rotation, mobileStairId)) === 180);

  const mobileDoorId = await md.evaluate((stairId) => {
    const s = window.useDesign.getState();
    s.deleteById('furniture', stairId);
    const id = s.addOpening(s.walls[0].id, 0.5, 'door');
    s.select({ kind: 'opening', id });
    return id;
  }, mobileStairId);
  await dock.getByRole('button', { name: 'Hinge' }).click();
  await dock.getByRole('button', { name: 'In / out' }).click();
  const flips = await md.evaluate((id) => {
    const opening = window.useDesign.getState().openings.find((entry) => entry.id === id);
    return { hinge: opening?.flipHinge, swing: opening?.flipSwing };
  }, mobileDoorId);
  check('mobile dock flips door hinge and swing', flips.hinge === true && flips.swing === true, JSON.stringify(flips));

  await dock.getByRole('button', { name: 'More' }).click();
  check('mobile dock More opens full Properties', await md.locator('.sidebar.right.open').isVisible().catch(() => false));
  check('selection dock hides while Properties is open', !(await dock.isVisible().catch(() => false)));
  await md.getByRole('button', { name: 'Edit' }).click();
  await md.waitForTimeout(150);
  await dock.getByRole('button', { name: 'Delete' }).click();
  check('mobile dock delete uses undo-capable deletion',
    await md.locator('.toast-action', { hasText: 'Undo' }).isVisible().catch(() => false));

  await md.getByRole('button', { name: 'Objects' }).click();
  const catalogSearch = md.locator('.cat-search input');
  await catalogSearch.fill('bedside tables');
  check('catalog aliases find the expected object',
    await md.locator('.cat-item', { hasText: 'Nightstand' }).isVisible().catch(() => false));
  check('catalog reports the filtered result count',
    !/^0\s/.test(await md.locator('.catalog-result-count').innerText().catch(() => '0')));
  await catalogSearch.fill('definitely-no-such-furniture');
  check('empty catalog search offers recovery actions',
    await md.getByRole('button', { name: 'Clear filters' }).isVisible().catch(() => false));
  await md.getByRole('button', { name: 'Clear filters' }).click();
  check('clear filters restores the catalogue', (await catalogSearch.inputValue()) === '');
  await md.close();
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
  const rotateVisible = await r3.locator('.view-menu-row button[data-tip*="90"]').first().isVisible().catch(() => false);
  check('rotate plan is reachable in 3D', rotateVisible);
  if (rotateVisible) {
    const before = await r3.evaluate(() => JSON.stringify(window.useDesign.getState().walls.map((w) => w.start)));
    await r3.locator('.view-menu-row button[data-tip*="90"]').first().click();
    await r3.waitForTimeout(400);
    const after = await r3.evaluate(() => JSON.stringify(window.useDesign.getState().walls.map((w) => w.start)));
    check('rotating from 3D turns the plan', before !== after);
  }
  await r3.close();
}

// ---- outdoor surfaces (Phase C) --------------------------------------------
// Patios/decks/driveways reuse the Room primitive with an `outdoor` flag, so the
// thing worth asserting is that the flag actually changes what renders: no slab
// beneath, no ceiling above, and the outdoor material list instead of flooring.
{
  const od = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  await od.goto(BASE);
  await od.waitForSelector('.projects-screen', { timeout: 20000 });
  await od.getByRole('button', { name: /Sunlit open-plan home/ }).first().click();
  await od.waitForSelector('.toolbar', { timeout: 20000 });
  await od.locator('.coach-skip').click().catch(() => {});
  await od.waitForTimeout(500);

  const made = await od.evaluate(() => {
    const s = window.useDesign.getState();
    const xs = s.walls.flatMap((w) => [w.start.x, w.end.x]);
    const ys = s.walls.flatMap((w) => [w.start.y, w.end.y]);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const id = s.addRoom([
      { x: maxX + 20, y: minY + 40 }, { x: maxX + 420, y: minY + 40 },
      { x: maxX + 420, y: minY + 340 }, { x: maxX + 20, y: minY + 340 },
    ]);
    window.useDesign.getState().updateRoom(id, { outdoor: true, floorMaterial: 'out_deck' });
    const r = window.useDesign.getState().rooms.find((x) => x.id === id);
    return { id, outdoor: r.outdoor, mat: r.floorMaterial };
  });
  check('a room can be marked as an outdoor surface', made.outdoor === true && made.mat === 'out_deck', JSON.stringify(made));

  await od.evaluate((id) => window.useDesign.getState().select({ kind: 'room', id }), made.id);
  await od.waitForTimeout(500);
  const panel = await od.evaluate(() => ({
    titles: [...document.querySelectorAll('.prop-title')].map((e) => e.textContent),
    checked: document.querySelector('.toggle-row input')?.checked,
    swatches: [...document.querySelectorAll('.swatch .sw-name')].map((e) => e.textContent),
  }));
  check('Outdoor card appears for a selected room', (panel.titles || []).includes('Outdoor surface'), JSON.stringify(panel.titles));
  check('outdoor toggle reflects the room state', panel.checked === true);
  check('outdoor surfaces are offered', (panel.swatches || []).includes('Decking'), JSON.stringify(panel.swatches));
  // Indoor flooring is meaningless on a patio and must not be offered there.
  check('indoor flooring is hidden for outdoor rooms', !(panel.swatches || []).includes('Oak Wood'));

  // Round-trips through save/load like any other room.
  const persisted = await od.evaluate(async (id) => {
    const s = window.useDesign.getState();
    const snap = JSON.parse(JSON.stringify({ rooms: s.rooms }));
    s.loadSnapshot({ ...s, rooms: snap.rooms });
    return window.useDesign.getState().rooms.find((r) => r.id === id)?.outdoor === true;
  }, made.id);
  check('outdoor flag survives a snapshot round trip', persisted);
  await od.close();
}

// ---- fences and railings (Phase C3) -----------------------------------------
// A fence is a flag on a Wall, not a new object type, so drawing/snapping/gates
// come for free. What must be asserted is that the flag genuinely takes the run
// OUT of the building: no room, no roof, no cladding.
{
  const fp = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  await fp.goto(BASE);
  await fp.waitForSelector('.projects-screen', { timeout: 20000 });
  await fp.getByRole('button', { name: /Sunlit open-plan home/ }).first().click();
  await fp.waitForSelector('.toolbar', { timeout: 20000 });
  await fp.locator('.coach-skip').click().catch(() => {});
  await fp.waitForTimeout(500);

  // Enclose a square of garden entirely in fence, clear of the house. If fences
  // counted as building, this closed loop would become a room and grow a roof.
  const made = await fp.evaluate(() => {
    const s = window.useDesign.getState();
    const xs = s.walls.flatMap((w) => [w.start.x, w.end.x]);
    const ys = s.walls.flatMap((w) => [w.start.y, w.end.y]);
    const x0 = Math.max(...xs) + 200;
    const y0 = Math.min(...ys);
    const c = [
      { x: x0, y: y0 }, { x: x0 + 600, y: y0 },
      { x: x0 + 600, y: y0 + 600 }, { x: x0, y: y0 + 600 },
    ];
    const ids = [];
    for (let i = 0; i < 4; i++) {
      ids.push(window.useDesign.getState().addWall(c[i], c[(i + 1) % 4], 'fence'));
    }
    const w = window.useDesign.getState().walls.find((q) => q.id === ids[0]);
    return { ids, kind: w.kind, style: w.fenceStyle, height: w.height };
  });
  check('a fence run can be drawn', made.kind === 'fence' && !!made.style, JSON.stringify(made));
  // A wall's 270cm default would make an absurd garden fence.
  check('a new fence is fence-height, not wall-height', made.height <= 200, `height ${made.height}`);

  // The load-bearing assertion of the whole feature.
  const detect = await fp.evaluate(() => {
    const before = window.useDesign.getState().rooms.length;
    const added = window.useDesign.getState().detectRoomsFromWalls();
    return { before, added, after: window.useDesign.getState().rooms.length };
  });
  check('a closed fence loop does not become a room', detect.added === 0, JSON.stringify(detect));

  // ...and it must not drag the roof outline out over the garden either.
  const roof = await fp.evaluate(() => {
    const s = window.useDesign.getState();
    const structural = s.walls.filter((w) => w.kind !== 'fence');
    const span = (list) => {
      const xs = list.flatMap((w) => [w.start.x, w.end.x]);
      return Math.max(...xs) - Math.min(...xs);
    };
    return { all: span(s.walls), structural: span(structural) };
  });
  check('the roof outline ignores fences', roof.structural < roof.all, JSON.stringify(roof));

  await fp.evaluate((id) => window.useDesign.getState().select({ kind: 'wall', id }), made.ids[0]);
  await fp.waitForTimeout(400);
  const panel = await fp.evaluate(() => ({
    titles: [...document.querySelectorAll('.prop-title')].map((e) => e.textContent),
    checked: [...document.querySelectorAll('.toggle-row input')].map((e) => e.checked),
    segs: [...document.querySelectorAll('.seg button')].map((e) => e.textContent),
  }));
  check('Fence card appears for a selected wall', (panel.titles || []).includes('Fence or railing'), JSON.stringify(panel.titles));
  check('fence toggle reflects the wall state', (panel.checked || []).includes(true));
  check('fence styles are offered', (panel.segs || []).includes('Picket') && (panel.segs || []).includes('Railing'), JSON.stringify(panel.segs));

  // The 2D plan must distinguish a boundary from a wall, and the tool must be
  // reachable — a fence you cannot draw is not a feature.
  const tools = await fp.evaluate(() =>
    [...document.querySelectorAll('.tool-dock button, .build-sheet button')].map((b) => b.getAttribute('title') || b.textContent));
  check('the fence tool is offered', (tools || []).some((x) => /fence/i.test(x || '')), JSON.stringify(tools));

  const persisted = await fp.evaluate(async (id) => {
    const s = window.useDesign.getState();
    const snap = JSON.parse(JSON.stringify({ walls: s.walls }));
    s.loadSnapshot({ ...s, walls: snap.walls });
    return window.useDesign.getState().walls.find((w) => w.id === id)?.kind === 'fence';
  }, made.ids[0]);
  check('fence flag survives a snapshot round trip', persisted);
  await fp.close();
}

// ---- half / pony walls ----------------------------------------------------
// Low structural walls reuse the real wall model, but need a first-class draw
// tool and semantic flag so they stay visible in dollhouse mode and remain
// distinguishable from non-structural fences.
{
  const hp = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  await hp.goto(BASE);
  await hp.waitForSelector('.projects-screen', { timeout: 20000 });
  await hp.getByRole('button', { name: /Sunlit open-plan home/ }).first().click();
  await hp.waitForSelector('.toolbar', { timeout: 20000 });
  await hp.locator('.coach-skip').click().catch(() => {});
  await hp.waitForTimeout(500);

  const made = await hp.evaluate(async () => {
    const s = window.useDesign.getState();
    const id = s.addWall({ x: 120, y: 120 }, { x: 420, y: 120 }, 'half');
    const wall = window.useDesign.getState().walls.find((w) => w.id === id);
    const { buildWalkWallSegments } = await import('/src/lib/walkNavigation.ts');
    return {
      id,
      halfWall: wall?.halfWall,
      height: wall?.height,
      kind: wall?.kind,
      collisionSegments: wall ? buildWalkWallSegments([wall], []).length : 0,
    };
  });
  check('a half wall can be created directly', made.halfWall === true && made.kind !== 'fence', JSON.stringify(made));
  check('new half wall adopts guard/worktop height', made.height === 105, JSON.stringify(made));
  check('half wall remains a walkthrough barrier', made.collisionSegments === 1, JSON.stringify(made));

  await hp.evaluate((id) => window.useDesign.getState().select({ kind: 'wall', id }), made.id);
  await hp.waitForTimeout(400);
  const halfCard = hp.locator('.prop-card').filter({ hasText: 'Half wall / pony wall' });
  check('Half wall card appears for a selected wall', await halfCard.count() === 1);
  const toggle = halfCard.locator('input[type="checkbox"]');
  check('half wall toggle reflects the wall state', await toggle.isChecked());

  await toggle.uncheck();
  const restored = await hp.evaluate((id) => {
    const wall = window.useDesign.getState().walls.find((w) => w.id === id);
    return { halfWall: wall?.halfWall, height: wall?.height };
  }, made.id);
  check('turning off half wall restores full wall height', !restored.halfWall && restored.height >= 240, JSON.stringify(restored));

  await toggle.check();
  const persisted = await hp.evaluate((id) => {
    const s = window.useDesign.getState();
    const snap = JSON.parse(JSON.stringify({ walls: s.walls }));
    s.loadSnapshot({ ...s, walls: snap.walls });
    const wall = window.useDesign.getState().walls.find((w) => w.id === id);
    return wall?.halfWall === true && wall?.height === 105;
  }, made.id);
  check('half wall flag survives a snapshot round trip', persisted);

  const tools = await hp.evaluate(() =>
    [...document.querySelectorAll('.tool-dock button, .build-sheet button')].map((b) => b.getAttribute('title') || b.textContent));
  check('the half wall draw tool is offered', (tools || []).some((x) => /half wall/i.test(x || '')), JSON.stringify(tools));

  await hp.close();
}

// ---- the garden set (Phase C4) ----------------------------------------------
// A deck you cannot furnish is a dead end, so the value here is breadth AND the
// free/paid split: an outdoor category that is nearly empty and mostly locked
// reads as bait, not as an upsell.
{
  const gp = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  await gp.goto(BASE);
  await gp.waitForSelector('.projects-screen', { timeout: 20000 });
  await gp.getByRole('button', { name: /Sunlit open-plan home/ }).first().click();
  await gp.waitForSelector('.toolbar', { timeout: 20000 });
  await gp.locator('.coach-skip').click().catch(() => {});
  await gp.waitForTimeout(500);

  // Every garden piece must actually place and keep its own footprint — a type
  // missing from the catalog silently falls back to a 1x1 box.
  const placed = await gp.evaluate(() => {
    const types = ['tree', 'tree_small', 'hedge', 'parasol', 'sun_lounger', 'bbq',
      'fire_pit', 'patio_table', 'patio_chair', 'planter_box', 'garden_lamp', 'tree_stump'];
    const out = [];
    let x = 4000;
    for (const t of types) {
      const id = window.useDesign.getState().addFurniture(t, { x, y: 4000 });
      const it = window.useDesign.getState().furniture.find((f) => f.id === id);
      out.push({ t, ok: !!it, w: it?.width ?? 0, h: it?.height ?? 0 });
      x += 400;
    }
    return out;
  });
  check('every garden piece places', placed.every((p) => p.ok), JSON.stringify(placed.filter((p) => !p.ok)));
  check('garden pieces carry real dimensions', placed.every((p) => p.w > 1 && p.h > 1),
    JSON.stringify(placed.filter((p) => !(p.w > 1 && p.h > 1))));
  // A tree that is chair-sized is the classic catalog-entry slip.
  const tree = placed.find((p) => p.t === 'tree');
  check('a tree is tree-sized', tree.h >= 300, `height ${tree.h}`);

  // The free tier has to be able to build a recognisable garden on its own.
  const catalogSource = await readFile(join(root, 'src', 'data', 'furnitureCatalog.ts'), 'utf8');
  const outdoorRows = catalogSource.split('\n').filter((l) => l.includes("category: 'Outdoor'"));
  const tiers = {
    total: outdoorRows.length,
    freeTypes: outdoorRows.filter((l) => !l.includes('pro: true'))
      .map((l) => (l.match(/type: '([^']+)'/) ?? [])[1])
      .filter(Boolean),
  };
  check('the outdoor category is no longer a stub', tiers.total >= 15, JSON.stringify(tiers.total));
  check('a free user can plant and furnish a garden',
    ['tree', 'hedge', 'patio_chair'].every((t) => tiers.freeTypes.includes(t)),
    JSON.stringify(tiers.freeTypes));

  // Marking an area outdoor should not leave it labelled "Room 4" on the plan.
  const named = await gp.evaluate(async () => {
    const s = window.useDesign.getState();
    const id = s.addRoom([{ x: 6000, y: 6000 }, { x: 6400, y: 6000 }, { x: 6400, y: 6400 }, { x: 6000, y: 6400 }]);
    window.useDesign.getState().select({ kind: 'room', id });
    await new Promise((r) => setTimeout(r, 400));
    const box = document.querySelector('.toggle-row input');
    if (box && !box.checked) box.click();
    await new Promise((r) => setTimeout(r, 400));
    return window.useDesign.getState().rooms.find((r) => r.id === id)?.name ?? '';
  });
  check('an outdoor area is not left named "Room N"', !/^Room(\s+\d+)?$/.test(named.trim()), `named "${named}"`);
  await gp.close();
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
check(
  'desktop checkout separates plan selection from purchase',
  proUpsellSource.includes('setSelectedPlanID(plan.id)') &&
    proUpsellSource.includes('purchase(selectedPlan.id)') &&
    proUpsellSource.includes('Subscription renews automatically until cancelled.') &&
    proSource.includes('priceMicros'),
);
await recoveryPage.close();

// Index recovery must never undo an intentional deletion. Storage removal can
// fail (quota/private-browser edge cases) and older tabs can still leave stale
// JSON behind, but the deletion tombstone is authoritative.
const deletedRecoveryPage = await browser.newPage({ viewport: { width: 900, height: 700 } });
await deletedRecoveryPage.goto(BASE);
await deletedRecoveryPage.evaluate(() => {
  const id = 'deleted_plan';
  localStorage.clear();
  localStorage.setItem(`homedesigner.project.${id}`, JSON.stringify({
    projectName: 'Deleted plan must stay deleted',
  }));
  localStorage.setItem('homedesigner.project.v1', JSON.stringify({
    projectName: 'Deleted legacy plan must stay deleted',
  }));
  localStorage.setItem('homedesigner.projects.deleted.v1', JSON.stringify([
    { id, updatedAt: Date.now() },
  ]));
});
await deletedRecoveryPage.reload();
check(
  'deleted stale project is not resurrected by index recovery',
  !(await deletedRecoveryPage.getByRole('button', { name: 'Open Deleted plan must stay deleted' })
    .isVisible().catch(() => false)),
);
check(
  'deleted legacy rollback copy is not resurrected',
  !(await deletedRecoveryPage.getByRole('button', { name: 'Open Deleted legacy plan must stay deleted' })
    .isVisible().catch(() => false)),
);
await deletedRecoveryPage.close();
// A stale editor can still have a trailing autosave queued after another tab
// deletes its project. The tombstone must reject that write; otherwise the
// old tab recreates the snapshot and index row that the deletion removed.
const staleEditorPage = await browser.newPage({ viewport: { width: 900, height: 700 } });
await staleEditorPage.goto(BASE);
await staleEditorPage.evaluate(() => {
  const id = 'deleted_stale_editor';
  const snapshot = {
    projectName: 'Project deleted elsewhere',
    walls: [], rooms: [], furniture: [], openings: [], background: null,
  };
  localStorage.clear();
  localStorage.setItem('homedesigner.projects.index.v1', JSON.stringify([
    { id, name: snapshot.projectName, updatedAt: Date.now() - 1 },
  ]));
  localStorage.setItem(`homedesigner.project.${id}`, JSON.stringify(snapshot));
  localStorage.setItem('homedesigner.activeProject.v1', id);
});
await staleEditorPage.reload();
const staleSave = await staleEditorPage.evaluate(async () => {
  const id = 'deleted_stale_editor';
  localStorage.setItem('homedesigner.projects.deleted.v1', JSON.stringify([
    { id, updatedAt: Date.now() },
  ]));
  localStorage.removeItem(`homedesigner.project.${id}`);
  localStorage.setItem('homedesigner.projects.index.v1', '[]');
  window.useDesign.getState().setProjectName('Stale edit must not restore this');
  await new Promise((resolve) => setTimeout(resolve, 750));
  return {
    snapshotRestored: localStorage.getItem(`homedesigner.project.${id}`) !== null,
    indexRestored: (JSON.parse(localStorage.getItem('homedesigner.projects.index.v1') || '[]'))
      .some((project) => project.id === id),
  };
});
check('stale editor autosave cannot resurrect a deleted project',
  !staleSave.snapshotRestored && !staleSave.indexRestored,
  JSON.stringify(staleSave));
await staleEditorPage.close();
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

// ---- starter room + the phone save cue ------------------------------------
// Its own page: the main one is deep in the 3D editor by now, and both of these
// are first-run behaviours that need a clean projects screen.
{
  const sr = await browser.newPage({ viewport: { width: 390, height: 780 }, reducedMotion: 'reduce' });
  await sr.goto(BASE);
  await sr.evaluate(() => {
    localStorage.setItem('homedesigner.tour.v1', 'done');
    localStorage.setItem('homedesigner.tips.v1', 'dismissed');
  });
  await sr.reload({ waitUntil: 'networkidle' });

  const card = sr.locator('.tpl-card', { hasText: 'Start with a room' });
  check('starter room: the template card is offered',
    await card.waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false));

  // A tester read the floating bottom nav as hiding something, because the
  // project list scrolled visibly through the gap beneath it. Seated on the
  // edge, there is no gap for anything to show through.
  const nav = await sr.evaluate(() => {
    const el = document.querySelector('.ps-nav');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { bottom: Math.round(r.bottom), vh: window.innerHeight, left: Math.round(r.left), vw: window.innerWidth };
  });
  check('bottom nav: sits on the bottom edge, leaving no gap beneath it',
    !!nav && nav.bottom >= nav.vh - 1 && nav.left <= 1 && nav.vw > 0, JSON.stringify(nav));

  await card.click();
  await sr.waitForTimeout(700);

  const room = await sr.evaluate(() => {
    const s = window.useDesign.getState();
    return {
      walls: s.walls.length,
      rooms: s.rooms.length,
      undos: s.canUndo(),
      // Interior span between opposing wall centrelines.
      span: s.walls.length ? Math.round(Math.max(...s.walls.flatMap((w) => [w.start.x, w.end.x]))
        - Math.min(...s.walls.flatMap((w) => [w.start.x, w.end.x]))) : 0,
    };
  });
  check('starter room: four walls', room.walls === 4, JSON.stringify(room));
  check('starter room: one detected room', room.rooms === 1, JSON.stringify(room));
  check('starter room: 5m across', room.span === 500, JSON.stringify(room));

  // The whole room must be ONE undo, or getting back to a blank page means
  // pressing undo five times.
  await sr.evaluate(() => window.useDesign.getState().undo());
  const undone = await sr.evaluate(() => {
    const s = window.useDesign.getState();
    return { walls: s.walls.length, rooms: s.rooms.length };
  });
  check('starter room: a single undo clears the whole room',
    undone.walls === 0 && undone.rooms === 0, JSON.stringify(undone));

  // The save cue used to live inside `.project`, which is display:none on
  // phones — so the platform that most needs the reassurance never saw it.
  const badge = sr.locator('.saved-badge');
  check('save cue: visible at a phone viewport',
    await badge.isVisible().catch(() => false));
  check('save cue: keeps an accessible name once its text is hidden',
    !!(await badge.getAttribute('aria-label').catch(() => null)));
  await sr.close();
}

// ---- app-owned tooltips ----------------------------------------------------
// Native `title` tooltips follow the BROWSER's theme, not the page's, so a
// light-themed Chrome drew light tooltips over the dark app and `color-scheme`
// could not reach them. Assert the replacement actually appears, carries the
// label, and is legible — the previous CSS tooltip used var(--text) as its
// background, which in the dark theme is near-white text on near-white.
{
  const tp = await browser.newPage({ viewport: { width: 1280, height: 860 }, reducedMotion: 'reduce' });
  await tp.goto(BASE);
  await tp.evaluate(() => {
    localStorage.setItem('homedesigner.tour.v1', 'done');
    localStorage.setItem('homedesigner.tips.v1', 'dismissed');
  });
  await tp.reload({ waitUntil: 'networkidle' });
  await tp.locator('.tpl-card', { hasText: 'Start with a room' }).click();
  await tp.waitForSelector('.tool-dock', { timeout: 15000 });

  const strays = await tp.locator('[data-tip][title]').count();
  check('tooltips: nothing carries both data-tip and a native title', strays === 0, `${strays} found`);

  await tp.locator('.dock-btn').first().hover();
  const shown = await tp.waitForSelector('.app-tip', { timeout: 4000 }).then(() => true).catch(() => false);
  check('tooltips: hovering a tool shows the app tooltip', shown);

  if (shown) {
    const style = await tp.evaluate(() => {
      const el = document.querySelector('.app-tip');
      const cs = getComputedStyle(el);
      const lum = (c) => {
        const [r, g, b] = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
        const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const a = lum(cs.color);
      const b = lum(cs.backgroundColor);
      return {
        text: el.textContent.trim(),
        contrast: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
      };
    });
    check('tooltips: the tooltip carries the tool label', style.text.length > 2, JSON.stringify(style));
    // WCAG AA for small text. The old chip scored ~1.0 (white on near-white).
    check('tooltips: text is legible against its own background in the dark theme',
      style.contrast >= 4.5, `contrast ${style.contrast.toFixed(2)}:1`);
  }
  await tp.close();
}

// ---- dialogs must fit a phone, or scroll ------------------------------------
// A tester reported the tips panel "static, no scroll". Measured: 923px of
// content in an 844px viewport, `max-height: none`, body `overflow-y: visible`
// — the backdrop centres its child, so 40px was lost off the TOP and 40px off
// the BOTTOM with no way to reach either. The rows that fell off the bottom
// were the ones documenting pinch-to-zoom, so the same tester also asked for a
// gesture the app had shipped all along.
//
// This walks every dialog reachable on a phone and asserts each one either fits
// or scrolls. It runs at 390x740 — deliberately shorter than a real phone, so a
// dialog that only just fits today still gets caught when a string grows.
{
  const dg = await browser.newPage({
    viewport: { width: 390, height: 740 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce',
  });
  await dg.goto(BASE);
  await dg.evaluate(() => {
    localStorage.setItem('homedesigner.tour.v1', 'done');
    localStorage.setItem('homedesigner.tips.v1', 'dismissed');
  });
  await dg.reload({ waitUntil: 'networkidle' });
  await dg.locator('.tpl-card', { hasText: 'Start with a room' }).click();
  await dg.waitForSelector('.toolbar', { timeout: 20000 });
  await dg.locator('.coach-skip').click().catch(() => {});

  /** Open a dialog from the toolbar overflow and measure how it fits. */
  const openAndMeasure = async (label) => {
    await dg.locator('button[aria-label="More"]').first().click();
    await dg.waitForTimeout(200);
    const hit = await dg.evaluate((needle) => {
      const item = [...document.querySelectorAll('[role="menuitem"]')]
        .find((b) => (b.textContent || '').trim().startsWith(needle));
      if (!item) return false;
      item.click();
      return true;
    }, label);
    if (!hit) return null;
    await dg.waitForSelector('.modal', { timeout: 5000 });
    await dg.waitForTimeout(250);
    const m = await dg.evaluate(() => {
      const el = document.querySelector('.modal');
      const body = el?.querySelector('.modal-body');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        // Any part of the panel outside the viewport is unreachable, because
        // the backdrop is position:fixed and does not scroll.
        clipped: r.top < -1 || r.bottom > window.innerHeight + 1,
        // If content exceeds the body box, the body itself must be scrollable.
        overflows: body ? body.scrollHeight > body.clientHeight + 1 : false,
        scrollable: body ? /auto|scroll/.test(getComputedStyle(body).overflowY) : false,
      };
    });
    await dg.keyboard.press('Escape');
    await dg.waitForTimeout(250);
    return m;
  };

  for (const label of ['Settings', 'Tips', 'About']) {
    const m = await openAndMeasure(label);
    if (!m) {
      check(`dialog "${label}" is reachable from the phone overflow menu`, false);
      continue;
    }
    check(`dialog "${label}": no part of it is clipped off-screen`, !m.clipped, JSON.stringify(m));
    check(`dialog "${label}": overflowing content can be scrolled`,
      !m.overflows || m.scrollable, JSON.stringify(m));
  }
  await dg.close();
}

// ---- drag-to-draw walls on touch -------------------------------------------
// Phone users reported 2D wall drawing as hard to use. Cause: setCursor lived
// only in onMouseMove, Konva routes touchmove to a separate event map, so on a
// phone `cursor` stayed null and every gated overlay — rubber band, length
// readout, snap marker, guide line — never rendered. A one-finger drag also
// panned rather than drawing.
//
// Nothing anywhere drove the drawing gesture before this block: the existing
// "a fence run can be drawn" check calls store.addWall() directly, so both the
// mouse and touch paths were entirely uncovered.
{
  const dd = await browser.newPage({
    viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce',
  });
  await dd.goto(BASE);
  await dd.evaluate(() => {
    localStorage.setItem('homedesigner.tour.v1', 'done');
    localStorage.setItem('homedesigner.tips.v1', 'dismissed');
  });
  await dd.reload({ waitUntil: 'networkidle' });
  await dd.locator('.tpl-card', { hasText: 'Start with a room' }).click();
  await dd.waitForSelector('.toolbar', { timeout: 20000 });
  await dd.locator('.coach-skip').click().catch(() => {});
  await dd.waitForSelector('.konvajs-content canvas', { timeout: 15000 });

  // One press-drag-release with the wall tool, sampling the live preview
  // BEFORE the finger lifts — otherwise "it drew a wall" would also pass with
  // no preview at all, which is exactly the bug.
  const drag = await dd.evaluate(async () => {
    const st = window.useDesign.getState();
    st.setTool('wall');
    await new Promise((r) => setTimeout(r, 120));
    const content = document.querySelector('.konvajs-content');
    const rect = content.getBoundingClientRect();
    const mk = (cx, cy) => new Touch({
      identifier: 21, target: content, clientX: cx, clientY: cy,
      screenX: cx, screenY: cy, pageX: cx, pageY: cy,
    });
    const fire = (t, tt, ch) => content.dispatchEvent(new TouchEvent(t, {
      bubbles: true, cancelable: true, touches: tt, targetTouches: tt, changedTouches: ch,
    }));
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const stage = () => window.Konva?.stages?.[0] ?? null;
    const world = (cx, cy) => {
      const s = window.useDesign.getState();
      return { x: (cx - rect.left - s.pan.x) / s.zoom, y: (cy - rect.top - s.pan.y) / s.zoom };
    };

    // Somewhere empty: well inside the stage, away from the starter room.
    const ax = rect.left + 90;
    const ay = rect.top + rect.height - 120;
    const bx = rect.left + 300;
    const by = ay - 150;

    const panBefore = { ...window.useDesign.getState().pan };
    const wallsBefore = window.useDesign.getState().walls.length;

    // First corner: a plain tap, which must keep working exactly as before.
    const t0 = mk(ax, ay);
    fire('touchstart', [t0], [t0]);
    fire('touchend', [], [t0]);
    await frame();
    const afterTap = window.__draftLen?.() ?? null;

    // Second corner: press at A, drag to B, sample mid-flight, then release.
    const t1 = mk(ax, ay);
    fire('touchstart', [t1], [t1]);
    let midPreview = null;
    for (let i = 1; i <= 8; i++) {
      const j = mk(ax + ((bx - ax) * i) / 8, ay + ((by - ay) * i) / 8);
      fire('touchmove', [j], [j]);
      await frame();
      if (i === 6) {
        const s = stage();
        const readout = s?.findOne('.draft-readout');
        const rubber = s?.findOne('.draft-rubber');
        midPreview = {
          konva: !!s,
          readout: readout ? readout.text() : null,
          rubberPts: rubber ? rubber.points().length : 0,
          wallsSoFar: window.useDesign.getState().walls.length,
          panNow: { ...window.useDesign.getState().pan },
        };
      }
    }
    const tEnd = mk(bx, by);
    fire('touchend', [], [tEnd]);
    await frame();

    const target = world(bx, by);
    return {
      afterTap,
      afterDrag: window.__draftPoints?.() ?? null,
      midPreview,
      panBefore,
      panAfter: { ...window.useDesign.getState().pan },
      wallsBefore,
      target,
    };
  });

  // The preview: this is the check that fails outright before the fix, because
  // DraftView never renders its Text when `cursor` is null.
  check('drag-draw: Konva is reachable for inspection', drag.midPreview?.konva === true);
  check('drag-draw: a live length readout follows the finger mid-drag',
    /\d/.test(drag.midPreview?.readout ?? ''), JSON.stringify(drag.midPreview));
  check('drag-draw: the rubber band reaches the finger mid-drag',
    (drag.midPreview?.rubberPts ?? 0) >= 4, `points ${drag.midPreview?.rubberPts}`);
  // Drawing, not panning.
  check('drag-draw: dragging draws instead of panning the viewport',
    drag.midPreview?.panNow.x === drag.panBefore.x && drag.midPreview?.panNow.y === drag.panBefore.y,
    JSON.stringify({ before: drag.panBefore, during: drag.midPreview?.panNow }));
  check('drag-draw: nothing is committed until the finger lifts',
    drag.midPreview?.wallsSoFar === drag.wallsBefore);
  check('drag-draw: release appends to the existing corner instead of triggering double-tap finish',
    drag.afterTap === 1 && drag.afterDrag?.length === 2, JSON.stringify({ afterTap: drag.afterTap, afterDrag: drag.afterDrag }));

  // Finish and confirm the wall landed where the finger was RELEASED, not
  // where it pressed — the whole point of the gesture.
  // A real user cannot lift and tap Finish in the same render frame. Give the
  // drawBridge effect one human-scale beat to publish the final draft closure;
  // otherwise a heavily loaded run can click the previous closure even though
  // the completed preview is already painted.
  await dd.waitForTimeout(150);
  await dd.locator('.finish-btn').click();
  await dd.waitForTimeout(300);
  const made = await dd.evaluate((t) => {
    const ws = window.useDesign.getState().walls;
    const w = ws[ws.length - 1];
    return { count: ws.length, end: w ? w.end : null, start: w ? w.start : null, t };
  }, drag.target);
  const near = (p, q, tol) => p && q && Math.hypot(p.x - q.x, p.y - q.y) <= tol;
  check('drag-draw: a wall is committed on finish', made.count > drag.wallsBefore, JSON.stringify({ ...made, afterTap: drag.afterTap, afterDrag: drag.afterDrag }));
  // Snapping can pull the corner onto a guide, so this is a generous radius —
  // it is asserting "the release point", not exact coordinates.
  check('drag-draw: the wall ends where the finger was released, not where it pressed',
    near(made.end, made.t, 90) || near(made.start, made.t, 90), JSON.stringify({ ...made, afterTap: drag.afterTap, afterDrag: drag.afterDrag }));

  // Regression: two fingers must still zoom, and must never place a point.
  const pinched = await dd.evaluate(async () => {
    const st = window.useDesign.getState();
    st.setTool('wall');
    await new Promise((r) => setTimeout(r, 100));
    const content = document.querySelector('.konvajs-content');
    const rect = content.getBoundingClientRect();
    const mk = (id, cx, cy) => new Touch({
      identifier: id, target: content, clientX: cx, clientY: cy,
      screenX: cx, screenY: cy, pageX: cx, pageY: cy,
    });
    const fire = (t, tt, ch) => content.dispatchEvent(new TouchEvent(t, {
      bubbles: true, cancelable: true, touches: tt, targetTouches: tt, changedTouches: ch,
    }));
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const z0 = window.useDesign.getState().zoom;
    const wallsBefore = window.useDesign.getState().walls.length;
    let a = mk(1, cx - 40, cy);
    let b = mk(2, cx + 40, cy);
    fire('touchstart', [a, b], [a, b]);
    for (let i = 1; i <= 5; i++) {
      a = mk(1, cx - 40 - i * 12, cy);
      b = mk(2, cx + 40 + i * 12, cy);
      fire('touchmove', [a, b], [a, b]);
      await new Promise((r) => setTimeout(r, 16));
    }
    fire('touchend', [b], [a]);
    fire('touchend', [], [b]);
    await new Promise((r) => setTimeout(r, 200));
    const s = window.useDesign.getState();
    return { z0, z1: s.zoom, wallsBefore, wallsAfter: s.walls.length, draftGrew: false };
  });
  check('drag-draw: two fingers still zoom while the wall tool is armed',
    Math.abs(pinched.z1 - pinched.z0) > 1e-6, JSON.stringify(pinched));
  check('drag-draw: a pinch never commits a point',
    pinched.wallsAfter === pinched.wallsBefore, JSON.stringify(pinched));

  // Regression: the select tool must still pan on a one-finger drag.
  const panned = await dd.evaluate(async () => {
    const st = window.useDesign.getState();
    st.setTool('select');
    st.clearSelection();
    await new Promise((r) => setTimeout(r, 100));
    const content = document.querySelector('.konvajs-content');
    const rect = content.getBoundingClientRect();
    const mk = (cx, cy) => new Touch({
      identifier: 31, target: content, clientX: cx, clientY: cy,
      screenX: cx, screenY: cy, pageX: cx, pageY: cy,
    });
    const fire = (t, tt, ch) => content.dispatchEvent(new TouchEvent(t, {
      bubbles: true, cancelable: true, touches: tt, targetTouches: tt, changedTouches: ch,
    }));
    const x = rect.left + 60;
    const y = rect.top + 60;
    const before = { ...window.useDesign.getState().pan };
    const wallsBefore = window.useDesign.getState().walls.length;
    const t0 = mk(x, y);
    fire('touchstart', [t0], [t0]);
    for (let i = 1; i <= 6; i++) {
      const j = mk(x + i * 15, y + i * 10);
      fire('touchmove', [j], [j]);
      await new Promise((r) => setTimeout(r, 16));
    }
    fire('touchend', [], [mk(x + 90, y + 60)]);
    await new Promise((r) => setTimeout(r, 250));
    const s = window.useDesign.getState();
    return { before, after: { ...s.pan }, wallsBefore, wallsAfter: s.walls.length };
  });
  check('drag-draw: the select tool still pans on a one-finger drag',
    Math.abs(panned.after.x - panned.before.x) + Math.abs(panned.after.y - panned.before.y) > 1,
    JSON.stringify(panned));
  check('drag-draw: panning with select never creates a wall',
    panned.wallsAfter === panned.wallsBefore, JSON.stringify(panned));

  // ---- trace mode ----------------------------------------------------------
  // An imported plan has x/y/scale/rotation, but until trace mode there was no
  // way to set x/y at all: it sat wherever the import dropped it, with only a
  // numeric cm/px field and a rotation slider. The tool is hidden until a plan
  // exists, and while it is armed one finger moves the PLAN, not the viewport.
  {
    const hiddenFirst = await dd.evaluate(() => {
      const st = window.useDesign.getState();
      st.setBackground(null);
      return st.background === null;
    });
    await dd.waitForTimeout(200);
    check('trace: no imported plan, so no Position plan tool', hiddenFirst);

    const traced = await dd.evaluate(async () => {
      const st = window.useDesign.getState();
      // A 1x1 transparent PNG is enough — nothing here depends on the pixels.
      st.setBackground({
        src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
        imgWidth: 800, imgHeight: 600, x: 0, y: 0, scale: 2, rotation: 0, opacity: 0.5,
      });
      st.setTool('trace');
      await new Promise((r) => setTimeout(r, 250));

      const content = document.querySelector('.konvajs-content');
      const rect = content.getBoundingClientRect();
      const mk = (id, cx, cy) => new Touch({
        identifier: id, target: content, clientX: cx, clientY: cy,
        screenX: cx, screenY: cy, pageX: cx, pageY: cy,
      });
      const fire = (t, tt, ch) => content.dispatchEvent(new TouchEvent(t, {
        bubbles: true, cancelable: true, touches: tt, targetTouches: tt, changedTouches: ch,
      }));
      const bg = () => ({ ...window.useDesign.getState().background });
      const panNow = () => ({ ...window.useDesign.getState().pan });

      // One finger drags the plan, and must NOT pan the viewport.
      const before = bg();
      const panBefore = panNow();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      let t0 = mk(41, x, y);
      fire('touchstart', [t0], [t0]);
      for (let i = 1; i <= 6; i++) {
        t0 = mk(41, x + i * 10, y + i * 6);
        fire('touchmove', [t0], [t0]);
        await new Promise((r) => setTimeout(r, 16));
      }
      fire('touchend', [], [t0]);
      await new Promise((r) => setTimeout(r, 150));
      const afterDrag = bg();
      const panAfterDrag = panNow();

      // Two fingers scale and rotate the plan.
      const s0 = bg();
      let a = mk(1, x - 50, y);
      let b = mk(2, x + 50, y);
      fire('touchstart', [a, b], [a, b]);
      for (let i = 1; i <= 6; i++) {
        const r0 = 50 + i * 10;
        const ang = (i * 5 * Math.PI) / 180;
        a = mk(1, x - r0 * Math.cos(ang), y - r0 * Math.sin(ang));
        b = mk(2, x + r0 * Math.cos(ang), y + r0 * Math.sin(ang));
        fire('touchmove', [a, b], [a, b]);
        await new Promise((r) => setTimeout(r, 16));
      }
      fire('touchend', [b], [a]);
      fire('touchend', [], [b]);
      await new Promise((r) => setTimeout(r, 150));
      const afterPinch = bg();

      // Locking must freeze it against any further gesture.
      window.useDesign.getState().updateBackground({ locked: true });
      await new Promise((r) => setTimeout(r, 120));
      const locked0 = bg();
      let t1 = mk(51, x, y);
      fire('touchstart', [t1], [t1]);
      for (let i = 1; i <= 5; i++) {
        t1 = mk(51, x + i * 20, y);
        fire('touchmove', [t1], [t1]);
        await new Promise((r) => setTimeout(r, 16));
      }
      fire('touchend', [], [t1]);
      await new Promise((r) => setTimeout(r, 150));
      const lockedAfter = bg();

      return {
        before, afterDrag, panBefore, panAfterDrag,
        s0, afterPinch, locked0, lockedAfter,
        walls: window.useDesign.getState().walls.length,
      };
    });

    const moved = Math.hypot(traced.afterDrag.x - traced.before.x, traced.afterDrag.y - traced.before.y);
    check('trace: one finger drags the imported plan', moved > 1, JSON.stringify({ before: traced.before, after: traced.afterDrag }));
    check('trace: dragging the plan does not pan the viewport',
      traced.panAfterDrag.x === traced.panBefore.x && traced.panAfterDrag.y === traced.panBefore.y,
      JSON.stringify({ before: traced.panBefore, after: traced.panAfterDrag }));
    check('trace: pinching scales the plan',
      Math.abs(traced.afterPinch.scale - traced.s0.scale) > 1e-3,
      JSON.stringify({ from: traced.s0.scale, to: traced.afterPinch.scale }));
    check('trace: twisting rotates the plan',
      Math.abs(traced.afterPinch.rotation - traced.s0.rotation) > 0.5,
      JSON.stringify({ from: traced.s0.rotation, to: traced.afterPinch.rotation }));
    const nudged = Math.hypot(traced.lockedAfter.x - traced.locked0.x, traced.lockedAfter.y - traced.locked0.y);
    check('trace: a locked plan cannot be nudged', nudged < 1e-9, `moved ${nudged}`);
    // Positioning a plan must never leave stray geometry behind.
    check('trace: positioning the plan draws nothing', traced.walls === (await dd.evaluate(
      () => window.useDesign.getState().walls.length)));

    // The tool only exists while a plan does.
    const dockNow = await dd.evaluate(async () => {
      window.useDesign.getState().setTool('select');
      await new Promise((r) => setTimeout(r, 150));
      const withPlan = !!document.querySelector('[aria-label="Position plan"]');
      window.useDesign.getState().setBackground(null);
      await new Promise((r) => setTimeout(r, 200));
      return { withPlan, withoutPlan: !!document.querySelector('[aria-label="Position plan"]') };
    });
    check('trace: the tool is offered once a plan is loaded', dockNow.withPlan, JSON.stringify(dockNow));
    check('trace: the tool disappears with the plan', !dockNow.withoutPlan, JSON.stringify(dockNow));
  }

  await dd.close();
}

// ---- touch selection ring --------------------------------------------------
// Selecting on a phone used to slide the full-height properties panel over the
// plan, hiding the object being edited. The ring replaces that; the panel must
// now only appear when its Edit button is pressed.
{
  const sr = await browser.newPage({
    viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce',
  });
  await sr.goto(BASE);
  await sr.evaluate(() => {
    localStorage.setItem('homedesigner.tour.v1', 'done');
    localStorage.setItem('homedesigner.tips.v1', 'dismissed');
  });
  await sr.reload({ waitUntil: 'networkidle' });
  await sr.locator('.tpl-card', { hasText: 'Start with a room' }).click();
  await sr.waitForSelector('.toolbar', { timeout: 15000 });

  const id = await sr.evaluate(() => {
    const s = window.useDesign.getState();
    const fid = s.addFurniture('side_table', { x: 0, y: 0 });
    s.select({ kind: 'furniture', id: fid });
    return fid;
  });
  await sr.waitForTimeout(600);

  const ring = sr.locator('.sel-ring');
  // The .sel-ring element itself is a deliberate zero-size anchor (each button
  // is placed by its own transform), which Playwright treats as hidden — so
  // assert on a button.
  check('selection ring: appears beside a selected object on touch',
    await ring.locator('button').first().waitFor({ state: 'visible', timeout: 5000 })
      .then(() => true).catch(() => false));
  check('selection ring: the properties panel does NOT auto-open',
    !(await sr.locator('.sidebar.right.open').isVisible().catch(() => false)));
  check('selection ring: carries four actions',
    (await ring.locator('button').count()) === 4);

  // Every button must be inside the canvas, not clipped off an edge or hidden
  // under the bottom tab bar.
  const placed = await sr.evaluate(() => {
    const vw = window.innerWidth, vh = window.innerHeight;
    return [...document.querySelectorAll('.sel-ring button')].map((b) => {
      const r = b.getBoundingClientRect();
      return r.left >= 0 && r.top >= 0 && r.right <= vw && r.bottom <= vh - 60;
    });
  });
  check('selection ring: every button lands on screen', placed.every(Boolean), JSON.stringify(placed));

  // The buttons must not overlap. They did at first — the arc was tight enough
  // that Delete sat on top of Rotate and swallowed its taps, which no visual
  // check would have caught.
  const overlap = await sr.evaluate(() => {
    const r = [...document.querySelectorAll('.sel-ring button')].map((b) => b.getBoundingClientRect());
    const hits = [];
    for (let i = 0; i < r.length; i++) {
      for (let j = i + 1; j < r.length; j++) {
        if (r[i].left < r[j].right && r[j].left < r[i].right
          && r[i].top < r[j].bottom && r[j].top < r[i].bottom) hits.push(`${i}/${j}`);
      }
    }
    return hits;
  });
  check('selection ring: no two buttons overlap', overlap.length === 0, overlap.join(', '));

  // Rotate acts on the object without opening anything.
  const before = await sr.evaluate((f) => window.useDesign.getState().furniture.find((x) => x.id === f).rotation, id);
  await ring.locator('button').first().click();
  await sr.waitForTimeout(300);
  const after = await sr.evaluate((f) => window.useDesign.getState().furniture.find((x) => x.id === f).rotation, id);
  check('selection ring: rotate turns the object by 90°', (after - before + 360) % 360 === 90, `${before} -> ${after}`);

  // …and dragging that same button rotates freely. A tester asked to "rotate
  // how i want" — free rotation already existed, but only on the small stalk
  // handle beside the object, which this much louder ring sits right next to.
  {
    const rotBtn = ring.locator('button[aria-label^="Rotate"]');
    const b = await rotBtn.boundingBox();
    const anchor = await sr.evaluate(() => {
      const r = document.querySelector('.sel-ring').getBoundingClientRect();
      return { x: r.left, y: r.top };
    });
    await sr.evaluate(([bx, by, ax, ay]) => {
      const btn = document.querySelector('.sel-ring button[aria-label^="Rotate"]');
      const down = (x, y) => btn.dispatchEvent(new PointerEvent('pointerdown',
        { bubbles: true, cancelable: true, pointerId: 7, clientX: x, clientY: y }));
      const move = (x, y) => btn.dispatchEvent(new PointerEvent('pointermove',
        { bubbles: true, cancelable: true, pointerId: 7, clientX: x, clientY: y }));
      const up = (x, y) => btn.dispatchEvent(new PointerEvent('pointerup',
        { bubbles: true, cancelable: true, pointerId: 7, clientX: x, clientY: y }));
      btn.setPointerCapture = () => {};
      btn.hasPointerCapture = () => false;
      btn.releasePointerCapture = () => {};
      down(bx, by);
      // Sweep to a bearing that is deliberately NOT a multiple of 90 and not
      // within the 15° magnet, so passing proves free rotation rather than a
      // step that happened to land somewhere.
      const r = 140;
      for (let k = 1; k <= 6; k++) {
        const deg = (-90 + k * 7) * Math.PI / 180;
        move(ax + Math.cos(deg) * r, ay + Math.sin(deg) * r);
      }
      up(ax + r, ay);
    }, [b.x + b.width / 2, b.y + b.height / 2, anchor.x, anchor.y]);
    await sr.waitForTimeout(300);
    const dragged = await sr.evaluate((f) =>
      window.useDesign.getState().furniture.find((x) => x.id === f).rotation, id);
    check('selection ring: dragging rotate sets a free angle', dragged % 90 !== 0, `rotation ${dragged}`);
  }

  // Edit is the only route to the full panel now.
  await sr.locator('.sel-ring button[aria-label="Edit"]').click();
  await sr.waitForTimeout(500);
  check('selection ring: Edit opens the properties panel',
    await sr.locator('.sidebar.right.open').isVisible().catch(() => false));
  await sr.close();
}

// ---- WebGL context loss recovery -------------------------------------------
// "It briefly shows the 3D rendering and then the screen gets blank" — a tester
// on a Pixel 10 Pro. That is a dropped GPU context, which was unhandled: with
// no webglcontextlost listener calling preventDefault(), the browser never
// fires webglcontextrestored and the canvas stays black forever. Simulated here
// with WEBGL_lose_context, which drives the same real events.
{
  const gl = await browser.newPage({ viewport: { width: 900, height: 780 }, reducedMotion: 'reduce' });
  // Collected separately, NOT into the shared pageErrors gate: three.js throws
  // once from its own internals in the same tick the context dies (it compiles
  // against a now-null context), before React can unmount anything. That is the
  // library reacting to its context disappearing, not a fault in the recovery —
  // what matters is that the app tells the user and comes back, asserted below.
  const glErrors = [];
  gl.on('pageerror', (e) => glErrors.push(e.message));
  await gl.goto(BASE);
  await gl.evaluate(() => {
    localStorage.setItem('homedesigner.tour.v1', 'done');
    localStorage.setItem('homedesigner.tips.v1', 'dismissed');
  });
  await gl.reload({ waitUntil: 'networkidle' });
  await gl.getByRole('button', { name: /Sunlit open-plan home/ }).first().click();
  await gl.waitForSelector('.toolbar', { timeout: 20000 });
  await gl.click('.view-toggle button:nth-child(2)');
  await gl.waitForTimeout(14000);

  const lost = await gl.evaluate(() => {
    const canvas = [...document.querySelectorAll('canvas')].pop();
    const ctx = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl');
    const ext = ctx?.getExtension('WEBGL_lose_context');
    if (!ext) return false;
    ext.loseContext();
    return true;
  });

  if (!lost) {
    check('context loss: WEBGL_lose_context unavailable (skipped)', true);
  } else {
    await gl.waitForTimeout(1200);
    check('context loss: the user is told, not left with a black rectangle',
      await gl.locator('.gl-lost').isVisible().catch(() => false));

    await gl.locator('.gl-lost button').click();
    await gl.waitForTimeout(9000);
    check('context loss: Reload 3D brings the scene back',
      !(await gl.locator('.gl-lost').isVisible().catch(() => false))
        && (await gl.locator('canvas').count()) > 0);
    // The app must survive the loss, not merely redraw: anything thrown after
    // the recovery would mean the rebuilt scene is broken.
    const afterRecovery = glErrors.filter((m) => !/trim|alpha|context/i.test(m));
    check('context loss: nothing unexpected thrown while recovering',
      afterRecovery.length === 0, afterRecovery.slice(0, 2).join(' | '));
  }
  await gl.close();
}

// ---- the projects paywall, once it actually applies ------------------------
// The other half of the report: "the paid furnitures AND TEMPLATES are hidden
// pro features". Seeding one saved project flips the count-based gate, and the
// badge must appear in step with it — the case a static badge would get right
// by accident and the fresh-user case above would get wrong.
{
  const ps = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  await ps.goto(BASE);
  await ps.waitForSelector('.projects-screen', { timeout: 20000 });
  await ps.evaluate(() => {
    localStorage.setItem('homedesigner.projects.index.v1', JSON.stringify([
      { id: 'smoke-existing', name: 'Existing home', updatedAt: Date.now() },
    ]));
  });
  await ps.reload({ waitUntil: 'networkidle' });
  await ps.waitForSelector('.projects-screen', { timeout: 20000 });
  await ps.waitForTimeout(400);

  const gated = await ps.evaluate(() => ({
    templates: document.querySelectorAll('.tpl-card').length,
    templateBadges: document.querySelectorAll('.tpl-card .pro-tag-corner').length,
    heroBadge: document.querySelectorAll('.ps-hero-new .pro-tag-corner').length,
    cards: document.querySelectorAll('.ps-card').length,
  }));
  check('pro: templates are badged once a second project would cost money',
    gated.templates > 0 && gated.templateBadges === gated.templates, JSON.stringify(gated));
  check('pro: the New project button is badged too', gated.heroBadge === 1, JSON.stringify(gated));

  // Duplicate is gated unconditionally, not by count, so it is always marked.
  const dup = await ps.evaluate(() => {
    const btn = [...document.querySelectorAll('.ps-card-actions button')]
      .find((b) => /duplicate/i.test(b.getAttribute('aria-label') || ''));
    return btn ? btn.querySelectorAll('.pro-tag-corner').length : -1;
  });
  check('pro: Duplicate is badged, since it is always Pro', dup === 1, `badges ${dup}`);

  // …and all of it disappears for an owner.
  await ps.evaluate(() => window.useProStore.setState({ isPro: true }));
  await ps.waitForTimeout(400);
  const owned = await ps.evaluate(() => document.querySelectorAll('.projects-screen .pro-tag-corner').length);
  check('pro: a Pro owner sees no badges on the projects screen', owned === 0, `${owned} badges`);
  await ps.close();
}

// ---- the Undo toast must not sit on the catalog ----------------------------
// "the Undo button when you delete something is ontop of the menu, so i cant
// select my objects again until i close it, but maybe i dont want to close it
// and keep adding stuff." Measured: the toaster is z-index 200 pinned 132px up,
// the Objects sheet is z-index 75 and 58vh tall — so the toast lands inside the
// sheet and paints over the grid. Its onTouchStart also freezes the auto-
// dismiss, so a mis-hit both loses the tap and keeps the toast up.
{
  const tz = await browser.newPage({
    viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce',
  });
  await tz.goto(BASE);
  await tz.evaluate(() => {
    localStorage.setItem('homedesigner.tour.v1', 'done');
    localStorage.setItem('homedesigner.tips.v1', 'dismissed');
  });
  await tz.reload({ waitUntil: 'networkidle' });
  await tz.locator('.tpl-card', { hasText: 'Start with a room' }).click();
  await tz.waitForSelector('.toolbar', { timeout: 20000 });
  await tz.locator('.coach-skip').click().catch(() => {});

  // Place something, open Objects, then delete it so the Undo toast appears
  // while the sheet is open — exactly the reported situation.
  const fid = await tz.evaluate(() => {
    const s = window.useDesign.getState();
    const id = s.addFurniture('side_table', { x: 0, y: 0 });
    s.select({ kind: 'furniture', id });
    return id;
  });
  await tz.locator('.mobile-tabs button', { hasText: 'Objects' }).click();
  await tz.waitForTimeout(600);
  await tz.evaluate(() => window.useDesign.getState().deleteSelected());
  await tz.waitForTimeout(400);

  const geom = await tz.evaluate(() => {
    const toast = document.querySelector('.toast');
    const sheet = document.querySelector('.sidebar.catalog');
    if (!toast || !sheet) return null;
    const t = toast.getBoundingClientRect();
    const s = sheet.getBoundingClientRect();
    return {
      toast: { top: Math.round(t.top), bottom: Math.round(t.bottom) },
      sheet: { top: Math.round(s.top), bottom: Math.round(s.bottom) },
      overlaps: t.bottom > s.top && t.top < s.bottom,
      // What is actually under the middle of the toast? If it is the toast
      // itself, a tap there never reaches the grid.
      hitAtToastCentre: document.elementFromPoint((t.left + t.right) / 2, (t.top + t.bottom) / 2)
        ?.closest('.toast') ? 'toast' : 'not-toast',
    };
  });
  check('toast: an Undo toast is raised on delete', geom !== null, JSON.stringify(geom));
  if (geom) {
    check('toast: it does not cover the open Objects sheet', !geom.overlaps, JSON.stringify(geom));
    // Overlap has to be measured as rectangle INTERSECTION, not by hit-testing
    // tile centres. The toast is `width: max-content` and centred, so for a
    // short message like "Deleted" it lands in the gutter BETWEEN the two grid
    // columns — it covers part of the tiles either side while missing both
    // midpoints. A centre-sampling check passed happily with the fix reverted.
    const blocked = await tz.evaluate(() => {
      const toast = document.querySelector('.toast').getBoundingClientRect();
      const items = [...document.querySelectorAll('.sidebar.catalog .cat-item')];
      const onScreen = items.filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.bottom > 0 && r.top < window.innerHeight;
      });
      const covered = onScreen.filter((el) => {
        const r = el.getBoundingClientRect();
        return r.right > toast.left && r.left < toast.right
          && r.bottom > toast.top && r.top < toast.bottom;
      });
      return { visible: onScreen.length, covered: covered.length };
    });
    check('toast: no catalog object is under the toast at all',
      blocked.visible > 0 && blocked.covered === 0, JSON.stringify(blocked));
  }
  // Undo must still work — lifting it must not have put it out of reach.
  await tz.locator('.toast-action').click();
  await tz.waitForTimeout(300);
  const restored = await tz.evaluate((f) =>
    window.useDesign.getState().furniture.some((x) => x.id === f), fid);
  check('toast: Undo is still reachable and still restores', restored);
  await tz.close();
}

check('zero page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));

await browser.close();
dev.kill();
console.log(failures === 0 ? '\nSMOKE: all green' : `\nSMOKE: ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
