// Plan-import regression suite.
//
// "I uploaded 3 plans and none of them produced an outline" is the single worst
// failure this app can have, and it is invisible to typecheck, lint and the
// smoke suite. This draws plans in the styles real files actually arrive in —
// filled/poche walls, double-line CAD exports, single-stroke scans, hatched
// walls, drawing frames, coloured exports, skewed noisy phone photos — runs the
// REAL tracer over them in a real browser canvas, and asserts that the building
// outline and rooms come back.
//
// It also pins RESOLUTION STABILITY: the same plan at 2000px and 3500px must
// produce about the same number of walls. It did not used to, and that is what
// turned a clean 6-wall plan into 44 fragments on a high-resolution scan.

import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const dir = mkdtempSync(join(tmpdir(), 'hdtrace-'));
const entry = join(dir, 'entry.ts');
writeFileSync(entry, `
export { traceWallsAuto, traceWallsStages } from '${root}/src/lib/wallTrace.ts';
export { autoThreshold } from '${root}/src/lib/autoTrace.ts';
export { segmentsToWalls } from '${root}/src/lib/wallBuilder.ts';
export { detectRooms, detectBuildingOutline } from '${root}/src/lib/roomDetection.ts';
export { polygonArea } from '${root}/src/lib/geometry.ts';
`);
const bundleFile = join(dir, 'bundle.js');
execFileSync(join(root, 'node_modules/.bin/esbuild'), [
  entry, '--bundle', '--format=iife', '--global-name=TR', '--platform=browser', `--outfile=${bundleFile}`,
], { stdio: 'pipe' });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--no-sandbox'],
});
const page = await browser.newPage();
await page.setContent('<canvas id="c"></canvas>');
await page.addScriptTag({ content: readFileSync(bundleFile, 'utf8') });

const rows = await page.evaluate(() => {
  const c = document.getElementById('c');
  const g = c.getContext('2d');

  // A 5-room plan authored at 2000x1400 and scaled to the requested size, so
  // the SAME drawing can be rasterised at several resolutions.
  function drawPlan(o) {
    const { W, H, style, wallW, stroke, ink, paper, rot, noise, fillRooms, frame, hatch, dense } = o;
    c.width = W; c.height = H;
    const k = W / 2000;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = paper; g.fillRect(0, 0, W, H);
    g.save();
    if (rot) { g.translate(W / 2, H / 2); g.rotate(rot); g.translate(-W / 2, -H / 2); }
    g.scale(k, k);

    const OX = 100, OY = 100, PW = 1800, PH = 1200;
    const walls = [
      [OX, OY, OX + PW, OY], [OX + PW, OY, OX + PW, OY + PH],
      [OX + PW, OY + PH, OX, OY + PH], [OX, OY + PH, OX, OY],
      [OX + 700, OY, OX + 700, OY + PH], [OX + 700, OY + 600, OX + PW, OY + 600],
    ];
    if (dense) walls.push(
      [OX + 300, OY + 600, OX + 700, OY + 600], [OX + 300, OY + 600, OX + 300, OY + PH],
      [OX + 1200, OY + 600, OX + 1200, OY + PH], [OX + 700, OY + 300, OX + 300, OY + 300],
      [OX + 1200, OY, OX + 1200, OY + 300], [OX + 1200, OY + 300, OX + PW, OY + 300],
    );
    if (frame) { g.strokeStyle = ink; g.lineWidth = 4; g.strokeRect(30, 30, 1940, 1340); }
    if (fillRooms) {
      g.fillStyle = '#e2e0da';
      g.fillRect(OX, OY, 700, PH);
      g.fillRect(OX + 700, OY, PW - 700, 600);
    }

    g.strokeStyle = ink; g.fillStyle = ink; g.lineCap = 'butt';
    if (style === 'solid') {
      g.lineWidth = wallW;
      for (const [x1, y1, x2, y2] of walls) { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); }
    } else if (style === 'double') {
      if (hatch) {
        g.lineWidth = 1.5;
        for (const [x1, y1, x2, y2] of walls) {
          const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy);
          const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
          for (let d = 0; d < L; d += 14) {
            const bx = x1 + ux * d, by = y1 + uy * d;
            g.beginPath();
            g.moveTo(bx + nx * (wallW / 2), by + ny * (wallW / 2));
            g.lineTo(bx + ux * wallW - nx * (wallW / 2), by + uy * wallW - ny * (wallW / 2));
            g.stroke();
          }
        }
      }
      g.lineWidth = stroke;
      for (const [x1, y1, x2, y2] of walls) {
        const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy);
        const nx = -dy / L * (wallW / 2), ny = dx / L * (wallW / 2);
        for (const s of [1, -1]) {
          g.beginPath();
          g.moveTo(x1 + nx * s, y1 + ny * s); g.lineTo(x2 + nx * s, y2 + ny * s); g.stroke();
        }
      }
    } else {
      g.lineWidth = stroke;
      for (const [x1, y1, x2, y2] of walls) { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); }
    }

    // Everything on a real plan that is NOT a wall.
    g.fillStyle = ink; g.font = '30px sans-serif';
    g.fillText('LIVING 24.5 m²', OX + 180, OY + 620);
    g.fillText('KITCHEN', OX + 900, OY + 320);
    g.fillText('BEDROOM 1', OX + 900, OY + 900);
    g.font = '20px sans-serif'; g.fillText('3600', OX + 320, OY - 30);
    g.strokeStyle = ink; g.lineWidth = 1;
    g.beginPath(); g.moveTo(OX, OY - 50); g.lineTo(OX + PW, OY - 50); g.stroke();
    g.beginPath(); g.moveTo(OX - 50, OY); g.lineTo(OX - 50, OY + PH); g.stroke();
    g.lineWidth = 2;
    for (const [dx, dy] of [[OX + 700, OY + 300], [OX + 700, OY + 900], [OX + 1200, OY + 600]]) {
      g.beginPath(); g.arc(dx, dy, 90, 0, Math.PI / 2); g.stroke();
    }
    g.strokeRect(OX + 150, OY + 150, 300, 180);
    g.strokeRect(OX + 1000, OY + 700, 400, 250);
    g.strokeRect(1580, 1220, 380, 140);
    g.restore();

    if (noise) {
      const im = g.getImageData(0, 0, W, H);
      const d = im.data;
      for (let i = 0; i < d.length; i += 4) {
        const n = (Math.random() - 0.5) * noise;
        d[i] += n; d[i + 1] += n; d[i + 2] += n;
      }
      g.putImageData(im, 0, 0);
    }
    return { img: g.getImageData(0, 0, W, H), W, expectRooms: dense ? 6 : 3 };
  }

  const base = {
    W: 2000, H: 1400, style: 'solid', wallW: 20, stroke: 2, ink: '#000',
    paper: '#fff', rot: 0, noise: 0, fillRooms: false, frame: false, hatch: false, dense: false,
  };
  const cases = [
    ['solid walls, 2000px', { ...base }],
    ['solid walls, 3500px scan', { ...base, W: 3500, H: 2450 }],
    ['double-line CAD, 3500px', { ...base, W: 3500, H: 2450, style: 'double', stroke: 3 }],
    ['single-stroke scan, 3500px', { ...base, W: 3500, H: 2450, style: 'single', stroke: 3 }],
    ['phone photo, 1.5° skew + noise', { ...base, W: 3000, H: 2100, rot: 1.5 * Math.PI / 180, noise: 26, paper: '#f4f1ea', ink: '#20201e' }],
    ['phone photo, 4° skew', { ...base, W: 3000, H: 2100, rot: 4 * Math.PI / 180, noise: 18, paper: '#f2efe6', ink: '#26251f' }],
    ['grey lines on cream paper', { ...base, ink: '#5a5a5a', paper: '#f6f3ec' }],
    ['blue CAD export', { ...base, style: 'double', stroke: 3, ink: '#2b4a8a' }],
    ['filled rooms', { ...base, fillRooms: true }],
    ['drawing frame + solid walls', { ...base, frame: true }],
    ['drawing frame + double-line', { ...base, frame: true, style: 'double', stroke: 3 }],
    ['hatched poche walls', { ...base, style: 'double', stroke: 3, hatch: true }],
    ['dense 10-room plan', { ...base, dense: true }],
    ['dense 10-room plan, 3500px', { ...base, dense: true, W: 3500, H: 2450 }],
    ['dense + hatch + frame', { ...base, dense: true, frame: true, style: 'double', stroke: 3, hatch: true }],
  ];

  return cases.map(([name, o]) => {
    const { img, W, expectRooms } = drawPlan(o);
    // The import dialog's defaults: a 12 m wide sheet, 40 cm minimum wall.
    const cmPerPx = (12 * 100) / W;
    const minLength = 40 / cmPerPx;
    const t0 = performance.now();
    const segs = TR.traceWallsAuto(img, { minLength });
    const ms = Math.round(performance.now() - t0);
    const walls = TR.segmentsToWalls(segs, cmPerPx, { x: 0, y: 0 }, { height: 270, thickness: 10 });
    const rooms = TR.detectRooms(walls).length;
    const outline = TR.detectBuildingOutline(walls);
    const stages = TR.traceWallsStages(img, { threshold: TR.autoThreshold(img), minLength });
    return {
      name,
      mode: stages.mode,
      walls: walls.length,
      rooms,
      expectRooms,
      // The true plan is 18 m x 12 m => 216 m2 of gross footprint at real scale;
      // at the dialog's default 12 m sheet width it comes out ~78 m2.
      outlineM2: outline ? Math.round(Math.abs(TR.polygonArea(outline)) / 10000) : 0,
      ms,
    };
  });
});
await browser.close();

let fails = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) fails++;
};

for (const r of rows) {
  const d = `walls=${r.walls} rooms=${r.rooms} outline=${r.outlineM2}m² mode=${r.mode} ${r.ms}ms`;
  check(`${r.name}: outline recovered`, r.outlineM2 >= 60 && r.outlineM2 <= 110, d);
  check(`${r.name}: rooms detected`, r.rooms >= r.expectRooms - 1, d);
  // Fragmentation guard. A 6-wall plan used to come back as 44 walls on a
  // high-resolution scan because the downsample point-sampled thin strokes.
  check(`${r.name}: not fragmented`, r.walls <= 26, d);
}

// Resolution stability: the same drawing at 2000px and 3500px must agree.
const pairs = [
  ['solid walls, 2000px', 'solid walls, 3500px scan'],
  ['dense 10-room plan', 'dense 10-room plan, 3500px'],
];
for (const [a, b] of pairs) {
  const ra = rows.find((r) => r.name === a);
  const rb = rows.find((r) => r.name === b);
  check(`resolution stable: ${a} vs 3500px`, Math.abs(ra.walls - rb.walls) <= 6,
    `${ra.walls} vs ${rb.walls}`);
}

console.log(fails ? `\nTRACE: ${fails} FAILED` : '\nTRACE: all green');
process.exit(fails ? 1 : 0);
