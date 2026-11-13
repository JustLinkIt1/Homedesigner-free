// Build a furnished 3D sample of a house from a simple room list, using the
// app itself. For "send us your floor plan, get it back in 3D" samples.
//
//   npx vite --port 4318            (dev server: window.useDesign is dev-only)
//   node tools/make-plan-sample.mjs <blueprint.json> <out-dir> [--no-render]
//
// The blueprint is the AI floor plan format (src/lib/aiPlan.ts): rooms as
// rectangles in cm and openings on their shared edges, for example
//   { "title": "Sample house", "notes": "", "widthCm": 800, "depthCm": 600, "furnished": true, "source": null,
//     "exterior": { "color": "#9c5a44", "material": "brick_wall_001" },
//     "roof": { "type": "gable", "pitch": 40, "overhang": 35, "thickness": 18, "covering": "tile", "coveringScaleCm": 100, "color": "#8c4f38" },
//     "stairs": { "x": 300, "y": 300, "rotation": 90 },
//     "floors": [ { "rooms": [ { "id": "liv", "type": "living", "name": "Living Room", "x": 0, "y": 0, "w": 800, "h": 600 } ],
//                   "openings": [ { "kind": "entrance", "x": 400, "y": 600, "vertical": false, "width": 90, "rooms": ["liv"] },
//                                 { "kind": "bay", "x": 400, "y": 0, "vertical": false, "width": 200, "rooms": ["liv"] } ] } ] }
// Opening kinds: door, open, entrance (front door), garage, window, small_window, bay.
// blueprintToSnapshot builds the walls, doors, windows, floors, roof and
// furniture, so the result is exactly what the app makes.
//
// Writes project.json (opens in the app with "Open project file"), plan-<n>.png,
// 3d-ground.jpg, 3d-upper.jpg, exterior.jpg and front.jpg.
// A client's own plan is theirs: keep blueprints and outputs out of the repo.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const [bpPath, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const bp = JSON.parse(readFileSync(bpPath, 'utf8'));

const browser = await chromium.launch({ channel: 'chrome', args: ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11'] });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
await ctx.addInitScript(() => {
  localStorage.setItem('hd-intro-enabled', '0');
  localStorage.setItem('homedesigner.tour.v1', 'done');
  localStorage.setItem('hd-quality', 'high');
  localStorage.setItem('homedesigner.seen3d.v1', '1');
  localStorage.setItem('homedesigner.theme.v1', 'light');
});
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto('http://localhost:4318/?pro=1');
await page.waitForSelector('.tpl-card');
await page.evaluate(() => window.useProStore.setState({ isPro: true }));
await page.locator('.tpl-card', { has: page.locator('img[src*="previews/blank."]') }).first().click();
await page.waitForSelector('.toolbar');
await page.waitForTimeout(800);

const info = await page.evaluate(async (bp) => {
  const { blueprintToSnapshot } = await import('/src/lib/aiPlan.ts');
  const st = () => window.useDesign.getState();
  const snap = blueprintToSnapshot(bp, { allowPro: true, exterior: bp.exterior, roof: bp.roof });
  st().loadSnapshot(snap);
  st().setActiveFloor(st().floors[0].id);
  if (bp.stairs) st().addFurniture('stairs', { x: bp.stairs.x, y: bp.stairs.y }, { rotation: bp.stairs.rotation ?? 0 });
  st().clearSelection?.();
  const s = st();
  const counts = Object.values(s.floorGeom).map((g) => ({ walls: g.walls.length, rooms: g.rooms.length, openings: g.openings.length, furniture: g.furniture.length }));
  const project = JSON.stringify({ app: 'homedesigner-free', version: 1, walls: s.walls, rooms: s.rooms, furniture: s.furniture, openings: s.openings,
    background: s.background, projectName: s.projectName, floors: s.floors, floorGeom: s.floorGeom, activeFloorId: s.activeFloorId }, null, 2);
  return { counts, floors: s.floors.map((f) => f.id), project };
}, bp);
writeFileSync(`${out}/project.json`, info.project);
console.log('counts', JSON.stringify(info.counts));

// 2D plans, one per storey, with only the canvas showing.
const hideUi = await page.addStyleTag({ content: '.toolbar,.tool-dock,.properties,.props-panel,[class*="Panel"],[class*="dock"],[class*="zoom"],.coach,.toast,[role="dialog"]{visibility:hidden!important}' });
for (let i = 0; i < info.floors.length; i++) {
  await page.evaluate((id) => window.useDesign.getState().setActiveFloor(id), info.floors[i]);
  await page.waitForTimeout(700);
  const fit = page.locator('button[aria-label*="Fit" i], button[title*="Fit" i], [data-tip*="Fit" i]').first();
  if (await fit.count()) { await fit.click({ force: true }); await page.waitForTimeout(600); }
  await page.locator('.konvajs-content canvas, canvas').first().screenshot({ path: `${out}/plan-${i + 1}.png` });
}
await hideUi.evaluate((n) => n.remove());

if (!process.argv.includes('--no-render')) {
  await page.click('.view-toggle button:nth-child(2)');
  await page.waitForTimeout(9000);
  await page.addStyleTag({ content: '* { visibility: hidden !important; } canvas { visibility: visible !important; }' });
  const cam = async (az, el, dist, target) => page.evaluate(([az, el, dist, target]) => {
    const s = window.__r3f();
    const c = s.controls;
    const [tx, ty, tz] = target;
    if (c) c.target.set(tx, ty, tz);
    const a = (az * Math.PI) / 180, e = (el * Math.PI) / 180;
    s.camera.position.set(tx + dist * Math.cos(e) * Math.sin(a), ty + dist * Math.sin(e), tz + dist * Math.cos(e) * Math.cos(a));
    s.camera.lookAt(tx, ty, tz);
    c?.update();
    // The focus-anchor puck is UI, not part of the house.
    s.scene.traverse((o) => { if (o.isMesh && o.renderOrder === 999 && o.geometry?.type === 'CircleGeometry') o.visible = false; });
    s.invalidate();
  }, [az, el, dist, target]);
  const W = bp.widthCm / 100, D = bp.depthCm / 100;
  const xs = bp.floors.flatMap((f) => f.rooms.flatMap((r) => [r.x, r.x + r.w]));
  const cx = (Math.min(...xs) + Math.max(...xs)) / 200, cz = D / 2;
  const span = Math.max(W, D);
  const shot = async (name) => { await page.waitForTimeout(2500); await page.locator('canvas').first().screenshot({ path: `${out}/${name}`, type: 'jpeg', quality: 90 }); };
  await page.evaluate(() => { const s = window.useDesign.getState(); s.setSunTime(14); s.setDollhouse(true); });
  await page.evaluate((id) => window.useDesign.getState().setActiveFloor(id), info.floors[0]);
  await cam(15, 56, span * 1.25, [cx, 0, cz]);
  await shot('3d-ground.jpg');
  if (info.floors.length > 1) {
    await page.evaluate((id) => window.useDesign.getState().setActiveFloor(id), info.floors[info.floors.length - 1]);
    await cam(15, 60, span * 1.35, [cx, 1.5, cz]);
    await shot('3d-upper.jpg');
  }
  await page.evaluate(() => window.useDesign.getState().setDollhouse(false));
  await page.evaluate(() => window.useDesign.getState().setSunTime(16));
  await cam(28, 17, span * 1.55, [cx, 2.6, cz]);
  await shot('exterior.jpg');
  await cam(-20, 9, span * 1.25, [cx - 1, 2.2, cz]);
  await shot('front.jpg');
}
await browser.close();
console.log('done');
