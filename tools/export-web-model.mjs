// Export a sample home from the real 3D view as a GLB for the website.
//
//   npx vite --port 4318          (dev server; window.useDesign is dev-only)
//   node tools/export-web-model.mjs [sampleId] [out.glb]
//
// Loads the sample in the app, switches to 3D at the high quality tier (so
// furniture uses its render models), then runs three's GLTFExporter over the
// storeys DesignScene draws. Ceilings are left out so the house can be seen
// into from above. Each node keeps its kind (walls / floors / roof / furniture
// / slabs) as the name of its parent group, which site/assets/house3d.js uses
// to build the scroll animation. Compress the result afterwards with
// gltf-transform (see the comment at the end).
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const sample = process.argv[2] ?? 'open-plan';
const out = process.argv[3] ?? 'house-raw.glb';
const browser = await chromium.launch({
  channel: process.env.PW_CHANNEL ?? 'chrome',
  args: ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11'],
});
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.addInitScript(() => {
  localStorage.setItem('hd-intro-enabled', '0');
  localStorage.setItem('homedesigner.tour.v1', 'done');
  localStorage.setItem('hd-quality', 'high');
  localStorage.setItem('homedesigner.seen3d.v1', '1');
});
await page.goto('http://localhost:4318/?pro=1');
await page.waitForSelector('.tpl-card');
await page.evaluate(() => window.useProStore.setState({ isPro: true }));
// Open it the way a user does: the template card whose preview is this sample.
await page.locator('.tpl-card', { has: page.locator(`img[src*="previews/${sample}."]`) }).first().click();
await page.waitForSelector('.toolbar');
await page.waitForTimeout(1200);
await page.click('.view-toggle button:nth-child(2)');
// Dollhouse mode drops the roof and fades walls; the website wants the whole house.
await page.evaluate(() => window.useDesign.getState().setDollhouse(false));
await page.waitForTimeout(9000); // furniture GLBs and textures stream in

const b64 = await page.evaluate(async () => {
  if (!window.__r3f) throw new Error('no window.__r3f: run against the dev server');
  const state = window.__r3f();
  const { GLTFExporter } = await import('/node_modules/three/examples/jsm/exporters/GLTFExporter.js');
  const storeys = [];
  state.scene.traverse((o) => { if (o.name === 'storey') storeys.push(o); });
  if (!storeys.length) throw new Error('no storey groups: is DesignScene up to date?');
  for (const s of storeys) {
    s.traverse((o) => {
      if (o.name === 'ceilings') o.visible = false;
      // Tap targets hide via material.visible, which GLTFExporter ignores.
      if (o.isMesh && [].concat(o.material).every((m) => m.visible === false)) o.visible = false;
      // Undo the dollhouse fade so every wall exports solid.
      const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of mats) if (m.opacity < 1 && m.userData?.fade !== false) { m.opacity = 1; m.transparent = false; }
    });
  }
  const glb = await new GLTFExporter().parseAsync(storeys, { binary: true, onlyVisible: true, maxTextureSize: 1024 });
  let bin = '';
  const bytes = new Uint8Array(glb);
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
});
writeFileSync(out, Buffer.from(b64, 'base64'));
console.log('wrote', out, (Buffer.byteLength(b64, 'base64') / 1e6).toFixed(1), 'MB');
await browser.close();
// Then: npx @gltf-transform/cli optimize <raw> site/assets/house.glb --compress meshopt --texture-compress webp --texture-size 1024
