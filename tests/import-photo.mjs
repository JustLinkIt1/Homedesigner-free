// Import-photo fixes: big-image downscale, HEIC detection.
//
//   node tests/import-photo.mjs   (set CHROMIUM_PATH if playwright has no browser)
//
// 1. fitWithin / isHeic are pure and checked directly.
// 2. A plan photographed at 5600x3920 is traced twice: full size, and downscaled
//    to 4000 px exactly the way renderImage does it (canvas drawImage). Walls
//    converted to metres with the dialog's rule (cm/px = width_m*100/width_px)
//    must land in the same places within a small tolerance, which is what keeps
//    the scale slider, the trace and the preview overlay right after a downscale.
import { writeFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { build } from 'esbuild';

const root = process.cwd().split(String.fromCharCode(92)).join('/');
const dir = mkdtempSync(join(tmpdir(), 'hdphoto-'));
writeFileSync(join(dir, 'entry.ts'), `
export { fitWithin, isHeic, MAX_TRACE_SIDE } from '${root}/src/lib/pdfImport.ts';
export { traceWallsAuto } from '${root}/src/lib/wallTrace.ts';
`);
const out = join(dir, 'bundle.js');
await build({
  entryPoints: [join(dir, 'entry.ts')], bundle: true, format: 'iife', globalName: 'IP',
  platform: 'browser', outfile: out, external: ['pdfjs-dist*'],
  // pdfImport pulls in pdfjs and a worker URL; stub them, the pure helpers need neither.
  plugins: [{
    name: 'stub-pdfjs',
    setup(b) {
      b.onResolve({ filter: /^pdfjs-dist/ }, (a) => ({ path: a.path, namespace: 'stub' }));
      b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export const GlobalWorkerOptions = {}; export const getDocument = () => ({}); export default "";', loader: 'js' }));
    },
  }],
});

let fails = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) fails++;
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setContent('<canvas id="c"></canvas><canvas id="d"></canvas>');
await page.addScriptTag({ content: readFileSync(out, 'utf8') });

const r = await page.evaluate(() => {
  const { fitWithin, isHeic } = IP;
  const sizes = {
    small: fitWithin(3000, 2000),
    exact: fitWithin(4000, 3000),
    wide: fitWithin(8000, 6000),
    tall: fitWithin(3000, 6000),
    odd: fitWithin(5001, 3333),
    sliver: fitWithin(20000, 3),
  };
  const heic = [
    isHeic({ name: 'a.jpg', type: 'image/heic' }), isHeic({ name: 'a.jpg', type: 'image/heif' }),
    isHeic({ name: 'IMG_1.HEIC', type: '' }), isHeic({ name: 'x.heif', type: 'application/octet-stream' }),
    isHeic({ name: 'a.jpg', type: 'image/jpeg' }), isHeic({ name: 'plan.pdf', type: 'application/pdf' }),
  ];

  // Trace the same drawing at full size and downscaled.
  const W = 5600, H = 3920;
  const full = document.getElementById('c');
  full.width = W; full.height = H;
  const g = full.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  g.strokeStyle = '#111'; g.lineWidth = 36; g.lineCap = 'butt';
  const line = (a, b, c, d) => { g.beginPath(); g.moveTo(a, b); g.lineTo(c, d); g.stroke(); };
  line(400, 400, 5200, 400); line(5200, 400, 5200, 3500); line(5200, 3500, 400, 3500); line(400, 3500, 400, 400);
  line(2400, 400, 2400, 3500); line(2400, 2000, 5200, 2000);

  const fit = fitWithin(W, H);
  const small = document.getElementById('d');
  small.width = fit.width; small.height = fit.height;
  const sg = small.getContext('2d');
  sg.fillStyle = '#fff'; sg.fillRect(0, 0, fit.width, fit.height);
  sg.drawImage(full, 0, 0, fit.width, fit.height);

  const widthM = 14;
  const metres = (cv) => {
    const cmPerPx = (widthM * 100) / cv.width;
    const segs = IP.traceWallsAuto(cv.getContext('2d').getImageData(0, 0, cv.width, cv.height), { minLength: 40 / cmPerPx });
    return segs.map((s) => [s.x1, s.y1, s.x2, s.y2].map((v) => (v * cmPerPx) / 100));
  };
  return { sizes, heic, fit, a: metres(full), b: metres(small) };
});
await browser.close();

const eq = (a, b) => a.width === b.width && a.height === b.height;
check('fitWithin leaves a small image alone', eq(r.sizes.small, { width: 3000, height: 2000 }));
check('fitWithin leaves exactly 4000 alone', eq(r.sizes.exact, { width: 4000, height: 3000 }));
check('fitWithin 8000x6000 -> 4000x3000', eq(r.sizes.wide, { width: 4000, height: 3000 }));
check('fitWithin portrait: longer side (height) becomes 4000', eq(r.sizes.tall, { width: 2000, height: 4000 }));
check('fitWithin keeps aspect ratio on odd sizes', r.sizes.odd.width === 4000 && Math.abs(r.sizes.odd.height - 3333 * 4000 / 5001) <= 0.5);
check('fitWithin never returns a zero side', r.sizes.sliver.width === 4000 && r.sizes.sliver.height >= 1);
check('isHeic by MIME and by extension, not JPG/PDF', r.heic.join() === 'true,true,true,true,false,false', r.heic.join());
check('5600x3920 is downscaled to 4000x2800', r.fit.width === 4000 && r.fit.height === 2800);

// Same walls in the same metre positions. Compare total wall length and the
// bounding box of everything traced, both in metres.
const stats = (segs) => {
  const xs = segs.flatMap((s) => [s[0], s[2]]), ys = segs.flatMap((s) => [s[1], s[3]]);
  return {
    n: segs.length,
    len: segs.reduce((t, s) => t + Math.hypot(s[2] - s[0], s[3] - s[1]), 0),
    x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys),
  };
};
const A = stats(r.a), B = stats(r.b);
console.log('full', JSON.stringify(A), '\ndown', JSON.stringify(B));
check('both traces found walls', A.n > 0 && B.n > 0);
const tol = 0.15; // metres
check('bounding box matches within 15 cm',
  [A.x0 - B.x0, A.x1 - B.x1, A.y0 - B.y0, A.y1 - B.y1].every((d) => Math.abs(d) <= tol));
check('total wall length matches within 2%', Math.abs(A.len - B.len) / A.len < 0.02, `${A.len.toFixed(2)} vs ${B.len.toFixed(2)}`);

console.log(fails ? `\nIMPORT-PHOTO: ${fails} FAILED` : '\nIMPORT-PHOTO: all green');
process.exit(fails ? 1 : 0);
