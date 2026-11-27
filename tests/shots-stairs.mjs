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

const runs = [
  { name: 'stairs', snap: FIXTURES.stairs, perf: true },
  { name: 'stairs-mobile', snap: FIXTURES.stairs, mobile: true, perf: true },
  ...withStairs.map((id) => ({ name: `sample-${id}`, snap: sampleSnap(id) })),
];

const browser = await chromium.launch({ args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader'] });
for (const run of runs.filter((r) => !only || only.split(',').includes(r.name))) {
  const ctx = await browser.newContext(run.mobile
    ? { viewport: { width: 915, height: 412 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, reducedMotion: 'reduce' }
    : { viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  page.setDefaultTimeout(120000); page.setDefaultNavigationTimeout(180000);
  page.on('pageerror', (e) => console.log('pageerror', run.name, e.message));
  page.on('console', (m) => { if (m.type() === 'error' && /WebGL|shader|THREE/i.test(m.text())) console.log('console.error', run.name, m.text().slice(0, 300)); });
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
    await page.waitForTimeout(5000);
    const shot = async (tag) => { await page.screenshot({ path: join(out, `${prefix}-${run.name}-${tag}.png`) }); console.log('shot', run.name, tag); };
    const canvasTier = await page.evaluate(() => ({ coarse: matchMedia('(pointer: coarse)').matches, canvases: document.querySelectorAll('canvas').length }));
    console.log('context', run.name, JSON.stringify(canvasTier));
    await shot('a');
    const dh = page.getByText('Dollhouse', { exact: true }).first();
    if (await dh.isVisible().catch(() => false)) {
      await dh.click();
      await page.waitForTimeout(7000);
      await shot('b');
    } else console.log('no Dollhouse toggle visible', run.name);
    const vp = page.viewportSize();
    const cx = vp.width / 2, cy = vp.height / 2;
    if (!run.mobile) {
      await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx - 220, cy + 100, { steps: 12 }); await page.mouse.up();
      await page.waitForTimeout(4000);
      await shot('c');
    }
    if (run.perf && !run.mobile) {
      await page.evaluate(() => {
        window.__dt = []; let last = performance.now();
        const tick = (t) => { window.__dt.push(t - last); last = t; window.__raf = requestAnimationFrame(tick); };
        window.__raf = requestAnimationFrame(tick);
      });
      await page.mouse.move(cx, cy); await page.mouse.down();
      for (let i = 0; i < 4; i++) { await page.mouse.move(cx + 200, cy, { steps: 40 }); await page.mouse.move(cx - 200, cy, { steps: 40 }); }
      await page.mouse.up();
      const dt = await page.evaluate(() => { cancelAnimationFrame(window.__raf); return window.__dt.slice(5); });
      dt.sort((a, b) => a - b);
      console.log('perf', run.name, 'frames', dt.length, 'median ms', dt[dt.length >> 1]?.toFixed(2), 'p90 ms', dt[Math.floor(dt.length * 0.9)]?.toFixed(2));
    }
  } catch (e) {
    console.log('FAILED', run.name, e.message.split('\n')[0]);
    await page.screenshot({ path: join(out, `${prefix}-${run.name}-failed.png`) }).catch(() => {});
  }
  await ctx.close();
}
await browser.close();
rmSync(dir, { recursive: true, force: true });
