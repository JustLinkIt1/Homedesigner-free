// usage: node shots2.mjs <port> <outDir> <prefix> [fixtures] [dx]   (run from a worktree's tests/ so 'playwright' resolves)
import { chromium } from 'playwright';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { FIXTURES } from './fixtures.mjs';
const [port, out, prefix, only] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const BASE = `http://localhost:${port}/`;
const browser = await chromium.launch({ args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader'] });
for (const name of (only ? only.split(',') : Object.keys(FIXTURES))) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  page.setDefaultTimeout(120000); page.setDefaultNavigationTimeout(180000);
  page.on('pageerror', e => console.log('pageerror', e.message));
  await page.addInitScript(([snap]) => {
    if (localStorage.getItem('seeded')) return;
    localStorage.setItem('seeded', '1');
    localStorage.setItem('homedesigner.tour.v1', 'done'); localStorage.setItem('homedesigner.tips.v1', 'dismissed');
    const id = 'repro_' + snap.projectName;
    localStorage.setItem('homedesigner.projects.index.v1', JSON.stringify([{ id, name: snap.projectName, updatedAt: Date.now() }]));
    localStorage.setItem(`homedesigner.project.${id}`, JSON.stringify(snap));
    localStorage.setItem('homedesigner.activeProject.v1', id);
  }, [FIXTURES[name]]);
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  const open = page.getByRole('button', { name: new RegExp('Open ' + name) });
  if (await open.isVisible().catch(() => false)) await open.click();
  await page.waitForTimeout(3000);
  await page.click('.view-toggle button:nth-child(2)');
  await page.waitForTimeout(8000);
  await page.getByText('Dollhouse', { exact: true }).first().click();
  await page.waitForTimeout(8000);
  await page.screenshot({ path: join(out, `${prefix}-${name}-a.png`) });
  console.log('shot', name, 'a');
  await page.mouse.move(640, 420); await page.mouse.down(); await page.mouse.move(420, 520, { steps: 12 }); await page.mouse.up();
  await page.waitForTimeout(4000);
  await page.screenshot({ path: join(out, `${prefix}-${name}-b.png`) });
  console.log('shot', name, 'b');
  await ctx.close();
}
await browser.close();
