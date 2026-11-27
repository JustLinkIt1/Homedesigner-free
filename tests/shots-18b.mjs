// Before/after shots for the 3D stair clip (customer request D).
// usage: node shots-stairs.mjs <port> <outDir> <prefix> [runs]   (run from this worktree's tests/)
// Shoots the `stairs` fixture on desktop and in a low-tier touch/mobile context
// (Android-WebView-like), plus the two bundled samples with a normal stairwell,
// which must come out identical before and after. Prints a median frame time
// for an orbit drag on the stairs fixture.
import { chromium } from 'playwright';
import { join } from 'node:path';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { FIXTURES } from './fixtures.mjs';

const [port, out, prefix, only] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const BASE = `http://localhost:${port}/`;

// The bundled samples as project snapshots.
const root = join(import.meta.dirname, '..').replaceAll('\\', '/');
const dir = mkdtempSync(join(tmpdir(), 'hdshots-'));
const entry = join(root, '.shots-entry.tmp.ts');
writeFileSync(entry, `export { SAMPLES } from '${root}/src/data/samples.ts';`);
let SAMPLES;
try {
  const bundle = join(dir, 'bundle.mjs');
  await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: bundle, logLevel: 'silent', define: { 'import.meta.env.BASE_URL': '"/"' } });
  ({ SAMPLES } = await import(pathToFileURL(bundle).href));
} finally {
  rmSync(entry, { force: true });
}
const sampleSnap = (id) => {
  const built = SAMPLES.find((s) => s.id === id).build();
  const top = [...built.floors].sort((a, b) => b.elevation - a.elevation)[0];
  return { projectName: id, ...built.floorGeom[top.id], floors: built.floors, floorGeom: built.floorGeom, activeFloorId: top.id };
};
const withStairs = SAMPLES.filter((s) => { const b = s.build(); return b.floors && Object.values(b.floorGeom).some((g) => g.furniture.some((f) => f.type.startsWith('stairs'))); }).map((s) => s.id);
console.log('samples with stairs:', withStairs.join(', '));
const noStairs = SAMPLES.map((s) => s.id).find((id) => !withStairs.includes(id));
console.log('control sample without stairs:', noStairs);
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 13; SM-A135F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';

const runs = [
  { name: 'stairs', snap: FIXTURES.stairs, perf: true },
  { name: 'stairs-mobile', snap: FIXTURES.stairs, mobile: true, perf: true },
  ...withStairs.map((id) => ({ name: `sample-${id}`, snap: sampleSnap(id) })),
  ...(noStairs ? [{ name: `sample-${noStairs}`, snap: sampleSnap(noStairs) }] : []),
  { name: 'stairs-photo', snap: FIXTURES.stairs, photo: true },
];

const swBrowser = await chromium.launch({ args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
let hwBrowser;
for (const run of runs.filter((r) => !only || only.split(',').includes(r.name))) {
  // The path tracer is far too slow on software GL: the photo case asks for the real GPU.
  // HW=1 shoots every case on the real GPU (software GL could not finish the 3D load on a busy machine).
  if ((run.photo || process.env.HW) && !hwBrowser) hwBrowser = await chromium.launch({ args: ['--no-sandbox', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu'] });
  const browser = run.photo || process.env.HW ? hwBrowser : swBrowser;
  let errors = 0;
  const ctx = await browser.newContext(run.mobile
    ? { viewport: { width: 915, height: 412 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, reducedMotion: 'reduce', userAgent: ANDROID_UA }
    : { viewport: run.photo && process.env.PHOTO_VP ? { width: +process.env.PHOTO_VP.split('x')[0], height: +process.env.PHOTO_VP.split('x')[1] } : { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  page.setDefaultTimeout(120000); page.setDefaultNavigationTimeout(180000);
  page.on('pageerror', (e) => { errors++; console.log('pageerror', run.name, e.message); });
  page.on('console', (m) => { if (m.type() === 'error' && (run.mobile || /WebGL|shader|THREE/i.test(m.text()))) { errors++; console.log('console.error', run.name, m.text().slice(0, 300)); } });
  await page.addInitScript(([snap, mobile]) => {
    if (mobile) {
      // A budget phone: the perf tier grades this as 'low'.
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 4 });
      Object.defineProperty(navigator, 'deviceMemory', { get: () => 2 });
    }
    if (localStorage.getItem('seeded')) return;
    localStorage.setItem('seeded', '1');
    localStorage.setItem('homedesigner.tour.v1', 'done'); localStorage.setItem('homedesigner.tips.v1', 'dismissed');
    const id = 'repro_' + snap.projectName;
    localStorage.setItem('homedesigner.projects.index.v1', JSON.stringify([{ id, name: snap.projectName, updatedAt: Date.now() }]));
    localStorage.setItem(`homedesigner.project.${id}`, JSON.stringify(snap));
    localStorage.setItem('homedesigner.activeProject.v1', id);
  }, [run.snap, !!run.mobile]);
  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6000);
    const open = page.getByRole('button', { name: new RegExp('Open ' + run.snap.projectName) });
    if (await open.isVisible().catch(() => false)) await open.click();
    await page.waitForTimeout(3000);
    await page.click('.view-toggle button:nth-child(2)', { timeout: 15000 });
    // The first 3D load compiles every shader on software GL: wait it out.
    await page.getByText('Loading 3D').first().waitFor({ state: 'hidden', timeout: 240000 }).catch(() => console.log('still loading 3D', run.name));
    await page.waitForTimeout(5000 + (+process.env.SETTLE_MS || 0));
    const shot = async (tag) => { await page.screenshot({ path: join(out, `${prefix}-${run.name}-${tag}.png`) }); console.log('shot', run.name, tag); };
    const canvasTier = await page.evaluate(() => { const c = document.querySelector('canvas'); return { coarse: matchMedia('(pointer: coarse)').matches, canvases: document.querySelectorAll('canvas').length, androidUa: navigator.userAgent.includes('Android'), dpr: devicePixelRatio, canvasPx: c && c.width, canvasCss: c && c.clientWidth }; });
    console.log('context', run.name, JSON.stringify(canvasTier));
    await shot('a');
    if (run.photo) {
      await page.click('.render-btn[aria-haspopup="menu"]');
      await page.getByRole('menuitem', { name: 'Photo mode' }).click();
      await page.locator('.photo-overlay').waitFor({ timeout: 60000 });
      let status = '';
      console.log('probe', await page.evaluate(() => { const g = document.createElement('canvas').getContext('webgl2'); const d = g && g.getExtension('WEBGL_debug_renderer_info'); return { webgl2: !!g, float: !!(g && g.getExtension('EXT_color_buffer_float')), renderer: d && g.getParameter(d.UNMASKED_RENDERER_WEBGL) }; }));
      // The app falls back to raster when the tracer has no sample after 6 s (a cold dev server can be that slow): reopen.
      const read = async () => { status = (await page.locator('.photo-status').innerText().catch(() => '')).replace(/\s+/g, ' '); const m = status.match(/(\d+) \/ (\d+) samples/); return m ? +m[1] : -1; };
      for (let attempt = 0; attempt < 5; attempt++) {
        let n = 0;
        for (let i = 0; i < 4; i++) { await page.waitForTimeout(3000); n = await read(); if (n < 0) break; }
        console.log('photo attempt', attempt, status);
        if (n >= 0) break;
        await page.getByRole('button', { name: 'Close' }).click();
        await page.waitForTimeout(1500);
        await page.click('.render-btn[aria-haspopup="menu"]');
        await page.getByRole('menuitem', { name: 'Photo mode' }).click();
        await page.locator('.photo-overlay').waitFor({ timeout: 60000 });
      }
      const want = +process.env.PHOTO_MIN || 4;
      const settle = async (secs) => { let n = 0; for (let i = 0; i < secs / 3; i++) { await page.waitForTimeout(3000); n = await read(); if (n < 0 || n >= want) break; } return n; };
      // Roof on first (the fixture opens with Dollhouse ticked), then the dollhouse view.
      await page.locator('.photo-dollhouse input').click();
      console.log('photo roof', run.name, 'samples', await settle(+process.env.PHOTO_SECS || 150), status);
      await shot('photo-roof');
      await page.locator('.photo-dollhouse input').click();
      console.log('photo dollhouse', run.name, 'samples', await settle(75), status);
      await shot('photo-dollhouse');
      console.log('errors', run.name, errors);
      await ctx.close();
      continue;
    }
    const dh = page.getByText('Dollhouse', { exact: true }).first();
    if (await dh.isVisible().catch(() => false)) {
      await dh.click();
      await page.waitForTimeout(7000);
      await shot('b');
    } else console.log('no Dollhouse toggle visible', run.name);
    const vp = page.viewportSize();
    const cx = vp.width / 2, cy = vp.height / 2;
    // NO_ORBIT=1 skips the orbit-drag shot and the perf batches (the drag hung the rig twice).
    if (process.env.NO_ORBIT) { console.log('errors', run.name, errors); await ctx.close(); continue; }
    if (!run.mobile) {
      await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx - 220, cy + 100, { steps: 12 }); await page.mouse.up();
      await page.waitForTimeout(4000);
      await shot('c');
    }
    if (run.perf && !run.mobile) {
      // Three batches of 200 frames each, all during a continuous orbit drag so every frame renders.
      for (let b = 0; b < 3; b++) {
        await page.evaluate(() => {
          window.__dt = []; let last = performance.now();
          const tick = (t) => { window.__dt.push(t - last); last = t; window.__raf = requestAnimationFrame(tick); };
          window.__raf = requestAnimationFrame(tick);
        });
        await page.mouse.move(cx, cy); await page.mouse.down();
        for (let i = 0; i < 60; i++) {
          await page.mouse.move(cx + 200, cy, { steps: 40 }); await page.mouse.move(cx - 200, cy, { steps: 40 });
          if (await page.evaluate(() => window.__dt.length) >= 205) break;
        }
        await page.mouse.move(cx, cy, { steps: 20 });
        await page.mouse.up();
        const dt = await page.evaluate(() => { cancelAnimationFrame(window.__raf); return window.__dt.slice(5, 205); });
        const mean = dt.reduce((a, x) => a + x, 0) / dt.length;
        dt.sort((a, b) => a - b);
        console.log('perf', run.name, 'batch', b, 'frames', dt.length, 'mean ms', mean.toFixed(2), 'median ms', dt[dt.length >> 1]?.toFixed(2), 'p90 ms', dt[Math.floor(dt.length * 0.9)]?.toFixed(2));
        await page.waitForTimeout(1500);
      }
    }
    console.log('errors', run.name, errors);
  } catch (e) {
    console.log('FAILED', run.name, e.message.split('\n')[0]);
    await page.screenshot({ path: join(out, `${prefix}-${run.name}-failed.png`) }).catch(() => {});
  }
  await ctx.close();
}
await swBrowser.close();
if (hwBrowser) await hwBrowser.close();
rmSync(dir, { recursive: true, force: true });
