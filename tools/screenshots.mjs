// Generate Play Store assets into store/:
//   - phone / 7" / 10" tablet screenshots of the main surfaces
//   - 512x512 app icon and 1024x500 feature graphic
//
// Usage:  npm run build && node tools/screenshots.mjs
//
// Spawns `vite preview` itself; needs a dist/ build. On machines without
// a Playwright-managed Chromium, point CHROMIUM_PATH at a Chrome binary.

import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'store');
mkdirSync(outDir, { recursive: true });

const PORT = 4173;
const BASE = `http://localhost:${PORT}/`;

// Play accepts 320-3840px sides; these mirror common device classes.
const DEVICES = [
  { tag: 'phone', viewport: { width: 360, height: 780 }, scale: 3, mobile: true }, // 1080x2340
  { tag: 'tablet7', viewport: { width: 600, height: 960 }, scale: 2, mobile: true }, // 1200x1920
  { tag: 'tablet10', viewport: { width: 800, height: 1280 }, scale: 2, mobile: false }, // 1600x2560
];

const preview = spawn(
  join(root, 'node_modules', '.bin', 'vite'),
  ['preview', '--port', String(PORT), '--strictPort'],
  { cwd: root, stdio: 'ignore' },
);
const stopPreview = () => {
  try {
    preview.kill();
  } catch {
    /* already gone */
  }
};
process.on('exit', stopPreview);

// Wait for the preview server to accept connections.
for (let i = 0; ; i++) {
  try {
    const res = await fetch(BASE);
    if (res.ok) break;
  } catch {
    if (i > 40) {
      console.error('vite preview did not start — did you run `npm run build`?');
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--no-sandbox', '--no-proxy-server', '--use-gl=angle', '--use-angle=swiftshader'],
});

const shoot = async (page, name) => {
  const path = join(outDir, `${name}.png`);
  // Generous timeout: the 3D view under software GL renders frames slowly.
  await page.screenshot({ path, timeout: 120000 });
  console.log('wrote', path);
};

for (const dev of DEVICES) {
  const ctx = await browser.newContext({
    viewport: dev.viewport,
    deviceScaleFactor: dev.scale,
    isMobile: dev.mobile,
    hasTouch: dev.mobile,
  });
  const page = await ctx.newPage();
  await page.goto(BASE + '?pro=1'); // showcase the full product, no locks
  await page.waitForSelector('.welcome-card.primary');

  // 1. Sample project in the 2D editor.
  await page.click('.welcome-card.primary');
  await page.waitForSelector('.toolbar');
  await page.waitForTimeout(1200); // let the plan fit + fonts settle
  await shoot(page, `${dev.tag}-1-plan2d`);

  // 2. The same home in 3D.
  await page.click('.view-toggle button:nth-child(2)');
  await page.waitForTimeout(6000); // three.js chunk + first frame
  await shoot(page, `${dev.tag}-2-view3d`);

  // 3. Furniture catalog (drawer on touch devices, sidebar on desktop-class).
  await page.click('.view-toggle button:nth-child(1)');
  await page.waitForTimeout(600);
  // dispatchEvent: the drawer animates over the tab bar, so a hit-tested
  // click is flaky — we only need React's onClick toggle to fire.
  const objectsTab = page.locator('.mobile-tabs button', { hasText: 'Objects' });
  const drawerCatalog = await objectsTab.isVisible();
  if (drawerCatalog) await objectsTab.dispatchEvent('click');
  await page.waitForTimeout(600);
  await shoot(page, `${dev.tag}-3-catalog`);

  // 4. Projects home with the design's thumbnail card. Close the drawer
  // first so nothing overlaps the brand (home) button, which also captures
  // the plan thumbnail on the way out.
  if (drawerCatalog) await objectsTab.dispatchEvent('click');
  await page.waitForTimeout(300);
  await page.click('button.brand');
  await page.waitForSelector('.ps-card');
  await page.waitForTimeout(400);
  await shoot(page, `${dev.tag}-4-projects`);

  await ctx.close();
}

// ---- Icon (512x512) and feature graphic (1024x500) ----------------------
// Rendered from inline HTML so they always match the app's brand styling.

const house = `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%">
  <path d="M14 30 L32 16 L50 30 V50 H38 V38 H26 V50 H14 Z" fill="#ffffff"/>
  <path d="M32 16 L50 30" stroke="rgba(255,255,255,0.7)" stroke-width="3" fill="none" stroke-linecap="round"/>
</svg>`;

const assetPages = [
  {
    name: 'icon-512',
    width: 512,
    height: 512,
    html: `<div style="width:512px;height:512px;display:grid;place-items:center;
      background:linear-gradient(150deg,#3b63f6,#6d7cff)">
      <div style="width:300px;height:300px">${house}</div></div>`,
  },
  {
    name: 'feature-1024x500',
    width: 1024,
    height: 500,
    html: `<div style="width:1024px;height:500px;display:flex;align-items:center;gap:48px;
      padding:0 84px;box-sizing:border-box;background:linear-gradient(120deg,#1c2f8f,#3b63f6 55%,#6d7cff);
      font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif">
      <div style="width:200px;height:200px;flex:none;border-radius:48px;display:grid;place-items:center;
        background:rgba(255,255,255,0.14);box-shadow:0 24px 60px rgba(0,0,0,0.25)">
        <div style="width:120px;height:120px">${house}</div></div>
      <div style="color:#fff">
        <div style="font-size:64px;font-weight:800;letter-spacing:-0.02em">HomeDesigner</div>
        <div style="font-size:28px;font-weight:500;opacity:0.85;margin-top:10px">
          Draw floor plans in 2D &middot; furnish &middot; walk through in 3D</div>
      </div></div>`,
  },
];

for (const a of assetPages) {
  const page = await browser.newPage({ viewport: { width: a.width, height: a.height } });
  await page.setContent(`<body style="margin:0">${a.html}</body>`);
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(outDir, `${a.name}.png`) });
  console.log('wrote', join(outDir, `${a.name}.png`));
  await page.close();
}

await browser.close();
stopPreview();
console.log('\nStore assets ready in store/');
