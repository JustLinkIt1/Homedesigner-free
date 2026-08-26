// Record short screen-capture clips of the real app, for promo/demo videos.
//
//   npm run build && node tools/capture-clips.mjs
//   ONLY=02-draw-walls node tools/capture-clips.mjs     # just one clip
//
// Writes one .webm per clip into store/clips/. Companion to tools/screenshots.mjs
// (same preview server, same selectors, same "no intro, no tour, ?pro=1" setup) —
// that one takes stills for the Play listing, this one takes motion for a promo.
//
// GPU CAVEAT: like the screenshot harness, this falls back to ANGLE/SwiftShader
// when there is no GPU. The 2D-editor clips record fine that way. The 3D ones do
// not: measured headless, the orbit clip took 656s to record a four-second
// gesture, because every frame is a full software re-render of a shadowed,
// post-processed scene. So the 3D clips are OPT-IN — set CAPTURE_GPU=1 on a
// machine with a GPU (which also drops the software-GL flags), or CAPTURE_3D=1
// to record them in software anyway and wait. Better still, screen-record the
// Android build: it is a phone app, so that is the truest footage there is.
//
// On machines without a Playwright-managed Chromium, point CHROMIUM_PATH at a
// Chrome binary.

import { spawn } from 'node:child_process';
import { mkdirSync, renameSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'store', 'clips');
const rawDir = join(outDir, '.raw');
mkdirSync(rawDir, { recursive: true });

const PORT = 4174; // not 4173 — so this can run alongside the screenshot harness
const BASE = `http://localhost:${PORT}/`;

// Phone-portrait framing for social cuts. Landscape (LANDSCAPE=1) for the Play
// listing, which prefers it.
//
// The video size MUST equal the viewport. Playwright only ever scales a page
// DOWN to fit `recordVideo.size` — asking for a larger size does not upscale,
// it just parks the page 1:1 in the top-left of a bigger, mostly-empty frame.
// So record at true phone CSS pixels and upscale afterwards in post:
//
//   ffmpeg -i 04-to-3d.webm -vf scale=1080:-2:flags=lanczos -c:v libx264 \
//          -crf 18 -pix_fmt yuv420p 04-to-3d.mp4
//
// (Playwright ships its own ffmpeg if the system has none — look under the
// browsers path for `ffmpeg-*/ffmpeg-linux`.)
const VIEWPORT = process.env.LANDSCAPE === '1'
  ? { width: 844, height: 390 }
  : { width: 390, height: 844 };
const VIDEO = VIEWPORT;

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

const gpu = process.env.CAPTURE_GPU === '1';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: [
    '--no-sandbox',
    '--no-proxy-server',
    ...(gpu ? [] : ['--use-gl=angle', '--use-angle=swiftshader']),
  ],
});

const errors = [];
const only = process.env.ONLY;
const want3d = gpu || process.env.CAPTURE_3D === '1';

/** Record one clip. `body(page)` drives the app; the video is named `name`.
 *  Pass `{ needsGpu: true }` for clips that are not worth recording in
 *  software — see the GPU caveat above. */
const clip = async (name, body, { needsGpu = false } = {}) => {
  if (only && only !== name) return;
  if (needsGpu && !want3d) {
    console.log(`skipped ${name} — 3D clip; set CAPTURE_GPU=1 (or CAPTURE_3D=1) to record it`);
    return;
  }
  const ctx = await browser.newContext({
    viewport: VIEWPORT,
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1, // video records CSS pixels; a higher factor is wasted
    // NB: unlike the screenshot harness we do NOT force reducedMotion — the
    // app's transitions are part of what a promo video is selling.
    recordVideo: { dir: rawDir, size: VIDEO },
  });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('hd-intro-enabled', '0');
      localStorage.setItem('homedesigner.tour.v1', 'done');
    } catch {
      /* ignore */
    }
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));

  const started = Date.now();
  try {
    await page.goto(BASE + '?pro=1'); // showcase the full product, no locks
    await body(page);
  } catch (e) {
    errors.push(`[${name}] ${String(e).split('\n')[0]}`);
    console.log('SKIPPED', name, '-', String(e).split('\n')[0]);
  }

  const video = page.video();
  await ctx.close(); // flushes the video file
  if (video) {
    const dest = join(outDir, `${name}.webm`);
    try {
      rmSync(dest, { force: true });
      renameSync(await video.path(), dest);
      console.log(`wrote ${dest}  (${((Date.now() - started) / 1000).toFixed(1)}s)`);
    } catch (e) {
      errors.push(`[${name}] video: ${String(e).split('\n')[0]}`);
    }
  }
};

const openSample = async (page) => {
  await page.waitForSelector('.tpl-card');
  await page.waitForTimeout(900); // template preview renders decode
  await page.click('.tpl-card'); // first card = Sunlit open-plan sample
  await page.waitForSelector('.toolbar');
  await page.waitForTimeout(1600); // plan fit + textures/sprites decode
};
const clearSelection = (page) =>
  page.evaluate(() => window.useDesign?.getState?.().clearSelection?.()).catch(() => {});

// 1. The gallery — photoreal template previews, the app's first impression.
await clip('01-home', async (page) => {
  await page.waitForSelector('.tpl-card');
  await page.waitForTimeout(2200);
  await page.mouse.wheel(0, 420);
  await page.waitForTimeout(1400);
});

// 2. Drawing walls — the core interaction, drawn live rather than pre-made.
await clip('02-draw-walls', async (page) => {
  await page.waitForSelector('.tpl-card');
  await page.waitForTimeout(700);
  await page.click('.tpl-card:last-child'); // blank project
  await page.waitForSelector('.toolbar');
  await page.waitForTimeout(1200);

  // On a phone viewport the tool dock is behind the "Build" tab rather than
  // on screen, so the tool has to be revealed before it can be picked. Select
  // by aria-label, not nth-child: the dock interleaves `.dock-sep` separators
  // between the buttons, so positional selectors do not mean what they look
  // like. (dispatchEvent, as in screenshots.mjs — the drawer backdrop swallows
  // real pointer events.)
  const buildTab = page.locator('.mobile-tabs button').first();
  const drawer = await buildTab.isVisible();
  if (drawer) {
    await buildTab.dispatchEvent('click');
    await page.waitForTimeout(600);
  }
  await page.locator('.dock-btn[aria-label="Draw walls"]').dispatchEvent('click');
  await page.waitForTimeout(400);
  if (drawer) {
    await buildTab.dispatchEvent('click'); // close it again, back to the canvas
    await page.waitForTimeout(600);
  }

  // A closed rectangle, corner by corner, pausing so the length/angle
  // readouts are legible in the footage.
  const pts = [
    [110, 300], [290, 300], [290, 500], [110, 500], [110, 300],
  ];
  for (const [x, y] of pts) {
    await page.mouse.move(x, y, { steps: 18 });
    await page.waitForTimeout(260);
    await page.mouse.click(x, y);
    await page.waitForTimeout(340);
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1200);
});

// 3. Furnishing from the catalog.
await clip('03-furnish', async (page) => {
  await openSample(page);
  await clearSelection(page);
  const objectsTab = page.locator('.mobile-tabs button', { hasText: 'Objects' });
  if (await objectsTab.isVisible()) await objectsTab.dispatchEvent('click');
  await page.waitForTimeout(1000);
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(1200);
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(1500);
});

// 4. The 2D -> 3D reveal. The money shot, and the one that needs a real GPU.
await clip('04-to-3d', async (page) => {
  await openSample(page);
  await clearSelection(page);
  await page.waitForTimeout(900);
  await page.click('.view-toggle button:nth-child(2)');
  await page.waitForTimeout(9000); // three.js chunk + first frames
  await clearSelection(page);
  await page.waitForTimeout(2500);
}, { needsGpu: true });

// 5. Orbiting the finished home in 3D.
await clip('05-orbit-3d', async (page) => {
  await openSample(page);
  await page.click('.view-toggle button:nth-child(2)');
  await page.waitForTimeout(9000);
  await clearSelection(page);
  const cx = VIEWPORT.width / 2;
  const cy = VIEWPORT.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 0; i <= 40; i++) {
    await page.mouse.move(cx + i * 4, cy - Math.sin(i / 8) * 18, { steps: 2 });
    await page.waitForTimeout(60);
  }
  await page.mouse.up();
  await page.waitForTimeout(1200);
}, { needsGpu: true });

await browser.close();
stopPreview();
rmSync(rawDir, { recursive: true, force: true });

if (errors.length) {
  console.log('\n⚠ issues during capture:');
  for (const e of errors) console.log('  ', e);
} else {
  console.log('\n✓ no page errors during capture');
}
console.log('\nClips ready in store/clips/');
