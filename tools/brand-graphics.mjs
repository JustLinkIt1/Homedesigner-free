// Compose the two wide brand images from real app output:
//   store/feature-1024x500.png   Play feature graphic (shown above the listing)
//   site/assets/og-banner.jpg    link preview for homedesignerapp.com (1200x630)
//
//   node tools/brand-graphics.mjs
//
// Both use the AI render of the sample home (site/assets/ai-after.webp), since
// that is the most photo-like picture the app produces. Point CHROMIUM_PATH at
// a Chrome binary when there is no Playwright-managed one.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = (path, mime) => `data:${mime};base64,${readFileSync(join(root, path)).toString('base64')}`;
const icon = data('public/icon-512.png', 'image/png');
const photo = data('site/assets/ai-after.webp', 'image/webp');

function html({ width, height, title, lines, titleSize, lineSize, iconSize, pad }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${width}px; height: ${height}px; overflow: hidden; position: relative;
    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; color: #fff;
    background: #0a0d14;
  }
  .photo { position: absolute; inset: 0 0 0 38%; background: url(${photo}) center / cover; }
  /* The text sits on solid brand colour; the photo fades in from under it. */
  .shade {
    position: absolute; inset: 0;
    background: linear-gradient(90deg, #062a86 0%, #0b4fd0 34%, rgba(13, 99, 248, 0.82) 46%, rgba(13, 99, 248, 0) 68%);
  }
  .copy { position: absolute; left: ${pad}px; top: 0; bottom: 0; width: 52%; display: flex; flex-direction: column; justify-content: center; }
  .brand { display: flex; align-items: center; gap: ${Math.round(iconSize * 0.28)}px; }
  .brand img { width: ${iconSize}px; height: ${iconSize}px; border-radius: ${Math.round(iconSize * 0.22)}px; box-shadow: 0 16px 40px rgba(0, 0, 0, 0.35); }
  .brand b { font-size: ${titleSize}px; font-weight: 800; letter-spacing: -0.03em; }
  ul { list-style: none; margin-top: ${Math.round(lineSize * 0.9)}px; }
  li { font-size: ${lineSize}px; font-weight: 650; line-height: 1.42; text-shadow: 0 2px 14px rgba(0, 0, 0, 0.3); }
  </style></head><body>
  <div class="photo"></div><div class="shade"></div>
  <div class="copy">
    <div class="brand"><img src="${icon}" alt=""><b>${title}</b></div>
    <ul>${lines.map((l) => `<li>${l}</li>`).join('')}</ul>
  </div></body></html>`;
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  channel: process.env.CHROMIUM_PATH ? undefined : process.env.PW_CHANNEL || undefined,
  args: ['--no-sandbox'],
});

const jobs = [
  {
    out: 'store/feature-1024x500.png',
    width: 1024, height: 500, pad: 56, iconSize: 92, titleSize: 54, lineSize: 30,
    title: 'HomeDesigner',
    lines: ['Floor plans in 2D', 'Walk through in 3D', 'Kitchen planner', 'AI plans and renders'],
  },
  {
    out: 'site/assets/og-banner.jpg',
    width: 1200, height: 630, pad: 64, iconSize: 108, titleSize: 64, lineSize: 36,
    title: 'HomeDesigner',
    lines: ['Floor plan maker', '3D home design', 'Kitchen planner', 'AI plans and renders'],
  },
];

for (const job of jobs) {
  const page = await browser.newPage({ viewport: { width: job.width, height: job.height }, deviceScaleFactor: 1 });
  await page.setContent(html(job));
  await page.waitForTimeout(300);
  await page.screenshot(
    job.out.endsWith('.jpg')
      ? { path: join(root, job.out), type: 'jpeg', quality: 88 }
      : { path: join(root, job.out) },
  );
  await page.close();
  console.log('wrote', job.out);
}
await browser.close();
