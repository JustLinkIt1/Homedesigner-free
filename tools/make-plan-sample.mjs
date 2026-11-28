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
// The front of the house is blueprint y = 0 (entrance and garage door), which
// the 3D view puts at world z = 0 with the house running to +z, so the outside
// shots look from -z (azimuth near 180).
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
// A cold Vite dev server takes well over 30 s to serve the first page here.
page.setDefaultTimeout(240_000);
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto('http://localhost:4318/?pro=1', { timeout: 300_000 });
await page.waitForSelector('.tpl-card');
await page.evaluate(() => window.useProStore.setState({ isPro: true }));
await page.locator('.tpl-card', { has: page.locator('img[src*="previews/blank."]') }).first().click();
await page.waitForSelector('.toolbar');
await page.waitForTimeout(800);

// Nothing selected and the pointer off the canvas before every picture: a
// selected wall draws blue handles and a length in 2D and yellow corner rings
// in 3D, and a hover draws its own highlight.
const clean = async () => {
  await page.mouse.move(0, 0);
  await page.evaluate(() => {
    const s = window.useDesign.getState();
    s.clearSelection?.();
    s.setSelectedIds?.([]);
  });
};

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
  // Frame the whole footprint with room for the dimension labels outside the
  // walls (the app's own Fit leaves 90 px, which cut deep and very wide plans),
  // then crop the picture to that frame so no empty grid is left around it.
  const canvas = page.locator('.konvajs-content canvas, canvas').first();
  const box = await canvas.boundingBox();
  const margin = 120 + 0.06 * Math.max(bp.widthCm, bp.depthCm); // cm, each side
  const z = Math.min(box.width / (bp.widthCm + 2 * margin), box.height / (bp.depthCm + 2 * margin));
  const frameW = (bp.widthCm + 2 * margin) * z, frameH = (bp.depthCm + 2 * margin) * z;
  const left = (box.width - frameW) / 2, top = (box.height - frameH) / 2;
  await page.evaluate(([x, y, z]) => window.useDesign.getState().setViewport({ x, y }, z), [left + margin * z, top + margin * z, z]);
  await clean();
  await page.waitForTimeout(700);
  await canvas.screenshot({ path: `${out}/plan-${i + 1}.png`, clip: { x: box.x + left, y: box.y + top, width: frameW, height: frameH } });
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
    // The focus-anchor puck and the wall-end handles are UI, not the house.
    s.scene.traverse((o) => { if (o.isMesh && o.renderOrder === 999 && /^(Circle|Ring)Geometry$/.test(o.geometry?.type ?? '')) o.visible = false; });
    s.invalidate();
  }, [az, el, dist, target]);
  const W = bp.widthCm / 100, D = bp.depthCm / 100;
  const xs = bp.floors.flatMap((f) => f.rooms.flatMap((r) => [r.x, r.x + r.w]));
  const cx = (Math.min(...xs) + Math.max(...xs)) / 200, cz = D / 2;
  const span = Math.max(W, D);
  // Dollhouse shots look from the front-right, high up; deep plots need more room.
  const near = D > W ? 1.5 : 1.25;
  // Outside shots: far enough that a sphere round the whole house (walls of
  // every storey plus roof) fits the narrower field of view.
  const H = info.floors.length * 2.8 + 2.5;
  const fits = await page.evaluate(() => {
    const c = window.__r3f().camera;
    const v = (c.fov * Math.PI) / 180;
    const h = 2 * Math.atan(Math.tan(v / 2) * c.aspect);
    return Math.sin(Math.min(v, h) / 2);
  });
  const whole = Number.isFinite(fits) && fits > 0 ? (1.06 * 0.5 * Math.hypot(W + 1, D + 1, H)) / fits : span * 1.9;
  const shot = async (name) => {
    await clean();
    await page.evaluate(() => window.__r3f().scene.traverse((o) => {
      if (o.isMesh && o.renderOrder === 999 && /^(Circle|Ring)Geometry$/.test(o.geometry?.type ?? '')) o.visible = false;
    }));
    await page.evaluate(() => window.__r3f().invalidate());
    await page.waitForTimeout(2500);
    await page.locator('canvas').first().screenshot({ path: `${out}/${name}`, type: 'jpeg', quality: 90 });
  };
  await page.evaluate(() => { const s = window.useDesign.getState(); s.setSunTime(14); s.setDollhouse(true); });
  await page.evaluate((id) => window.useDesign.getState().setActiveFloor(id), info.floors[0]);
  await cam(15, 56, span * near, [cx, 0, cz]);
  await shot('3d-ground.jpg');
  if (info.floors.length > 1) {
    await page.evaluate((id) => window.useDesign.getState().setActiveFloor(id), info.floors[info.floors.length - 1]);
    await cam(15, 60, span * (near + 0.1), [cx, 1.5, cz]);
    await shot('3d-upper.jpg');
  }
  await page.evaluate(() => window.useDesign.getState().setDollhouse(false));
  // 15:00 puts the sun at the front-right (-z, +x), so the front wall is lit.
  await page.evaluate(() => window.useDesign.getState().setSunTime(15));
  // From the street side: front-right three-quarter view, then a lower, more
  // head-on view of the front.
  await cam(152, 17, whole, [cx, H / 2 - 0.4, cz]);
  await shot('exterior.jpg');
  await cam(195, 9, whole, [cx, H / 2 - 0.4, cz]);
  await shot('front.jpg');
}
await browser.close();
console.log('done');
