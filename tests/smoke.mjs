// End-to-end smoke suite. Drives the real app headless (chromium/swiftshader)
// against the Vite DEV server — window.useDesign is dev-only (src/main.tsx),
// and the store is how several assertions read state.
//
//   npm test          (fails fast; exit code 1 on any failed assertion)
//
// Set SMOKE_SKIP_3D=1 on machines without a usable GL stack — the 3D check
// then soft-passes. Everything else always hard-fails.

import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4599;
const BASE = `http://localhost:${PORT}/`;

const dev = spawn(join(root, 'node_modules', '.bin', 'vite'), ['--port', String(PORT), '--strictPort'], {
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

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failures++;
};
const store = (fn) => page.evaluate(fn);

// ---- 1. Projects screen renders, sample home opens -------------------------
await page.goto(BASE);
check('projects screen renders', await page.waitForSelector('.projects-screen', { timeout: 20000 }).then(() => true).catch(() => false));
await page.getByRole('button', { name: /Sunlit open-plan home/ }).first().click();
check('editor opens', await page.waitForSelector('.toolbar', { timeout: 15000 }).then(() => true).catch(() => false));
await page.locator('.coach-skip').click().catch(() => {});
check('2D canvas mounts', (await page.locator('.konvajs-content canvas').count()) > 0);

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

// ---- 3. Shopping list -------------------------------------------------------
await page.click('.export-wrap .tbtn');
await page.click('text=Shopping list');
check('shopping list rows', (await page.locator('.bom-table tbody tr').count()) > 10);
await page.click('.modal-foot .btn.primary');

// ---- 4. Settings round-trip -------------------------------------------------
await page.click('[aria-label="More"]');
await page.click('.more-menu [role="menuitem"]:has-text("Settings")');
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
