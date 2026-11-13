// Make the pictures the website's scroll ends on: the final street view of the
// 3D house (site/assets/house3d.js), and an AI render of that same view.
//
//   python -m http.server 5190 --directory site
//   node tools/make-site-render.mjs <out-dir>             captures only
//   node --env-file=.env.local tools/make-site-render.mjs <out-dir> --render [--only=square]
//
// Writes view-wide.jpg (3:2) and view-square.jpg (1:1) straight from the page,
// so they match what a visitor sees to the pixel. With --render each one goes
// through the same provider call, model and exterior prompt as the app's own
// AI render (workers/design-sync/src/ai-render.ts) and comes back as
// render-wide.png / render-square.png. Needs ELEVENLABS_API_KEY; never prints
// it. Look at the results before they go on the site (convert to
// site/assets/house-render-wide.webp and house-render-square.webp).
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const out = process.argv[2];
if (!out) { console.error('usage: node tools/make-site-render.mjs <out-dir> [--render]'); process.exit(1); }
mkdirSync(out, { recursive: true });
const SHAPES = [['wide', 1.5, '3:2'], ['square', 1, '1:1']];

const browser = await chromium.launch({
  channel: process.env.PW_CHANNEL ?? 'chrome',
  args: ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11'],
});
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto(`http://localhost:${process.env.PORT ?? 5190}/?t=${Date.now()}`);
await page.evaluate(() => document.querySelector('.film').scrollIntoView());
await page.waitForFunction(() => !!window.house3d, null, { timeout: 30000 });
await page.waitForTimeout(1500); // textures
for (const [name, ar] of SHAPES) {
  const url = await page.evaluate((ar) => window.house3d.snapshot(ar, 1536), ar);
  writeFileSync(join(out, `view-${name}.jpg`), Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
  console.log('captured', `view-${name}.jpg`);
}
await browser.close();
if (!process.argv.includes('--render')) process.exit(0);

const key = process.env.ELEVENLABS_API_KEY;
if (!key) { console.error('ELEVENLABS_API_KEY is not set'); process.exit(1); }
// The Worker's own wording and model, so the site shows what the app makes.
const dir = mkdtempSync(join(process.cwd(), '.site-render-'));
let prompt, model;
try {
  for (const name of ['points', 'ai-render']) {
    const js = ts.transpileModule(readFileSync(`workers/design-sync/src/${name}.ts`, 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
    }).outputText.replace("from './points'", "from './points.mjs'");
    writeFileSync(join(dir, `${name}.mjs`), js);
  }
  const worker = await import(pathToFileURL(join(dir, 'ai-render.mjs')).href);
  prompt = worker.renderPrompt('photorealistic', 'exterior');
  model = worker.ELEVENLABS_IMAGE_MODEL;
} finally { rmSync(dir, { recursive: true, force: true }); }

const API = 'https://api.elevenlabs.io';
const headers = { 'xi-api-key': key, 'content-type': 'application/json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
for (const [name, , aspect] of SHAPES.filter(([n]) => !only || n === only)) {
  const image = readFileSync(join(out, `view-${name}.jpg`)).toString('base64');
  const created = await fetch(`${API}/v1/flows/image`, {
    method: 'POST', headers,
    body: JSON.stringify({ model_id: model, prompt, resolution: '1K', aspect_ratio: aspect,
      images: [{ type: 'inline_base64', content_base64: image, mime_type: 'image/jpeg' }] }),
  });
  if (!created.ok) { console.log(`${name}: refused (${created.status})`); continue; }
  const { id } = await created.json();
  const t0 = Date.now();
  let job;
  do {
    await sleep(2000);
    job = await (await fetch(`${API}/v1/flows/image/${id}`, { headers })).json();
  } while (job.status !== 'completed' && job.status !== 'failed' && Date.now() - t0 < 180_000);
  if (job.status !== 'completed') { console.log(`${name}: ${job.status} ${job.failure_reason ?? ''}`); continue; }
  const picture = await fetch(job.content_url);
  const ext = (job.content_mime_type ?? 'image/png').split('/')[1].replace('jpeg', 'jpg');
  writeFileSync(join(out, `render-${name}.${ext}`), Buffer.from(await picture.arrayBuffer()));
  console.log('rendered', `render-${name}.${ext}`, `${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
