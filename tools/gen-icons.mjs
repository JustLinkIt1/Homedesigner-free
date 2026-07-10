// Regenerate the Android launcher icon set from resources/icon-source.png
// (the Play-listing artwork: white house/blueprint glyph on a blue rounded
// square over a white page).
//
//   node tools/gen-icons.mjs
//
// Produces, per density (mdpi..xxxhdpi):
//   mipmap-*/ic_launcher.png            full-bleed blue square + glyph (legacy)
//   mipmap-*/ic_launcher_round.png      circle-clipped variant
//   mipmap-*/ic_launcher_foreground.png the WHITE GLYPH ONLY on transparency,
//                                       sized into the adaptive safe zone —
//                                       the background layer supplies the blue
// and prints the sampled brand blue for values/ic_launcher_background.xml.
// The foreground doubles as the Android 13 <monochrome> layer.

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const RES = join(root, 'android', 'app', 'src', 'main', 'res');
const SRC = join(root, 'resources', 'icon-source.png');

const LEGACY = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const FOREGROUND = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
const b64 = readFileSync(SRC).toString('base64');

const results = await page.evaluate(
  async ({ b64, LEGACY, FOREGROUND }) => {
    const img = new Image();
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = rej;
      img.src = `data:image/png;base64,${b64}`;
    });

    // Read source pixels.
    const sc = document.createElement('canvas');
    sc.width = img.width;
    sc.height = img.height;
    const sctx = sc.getContext('2d');
    sctx.drawImage(img, 0, 0);
    const data = sctx.getImageData(0, 0, sc.width, sc.height).data;
    const px = (x, y) => {
      const i = (y * sc.width + x) * 4;
      return [data[i], data[i + 1], data[i + 2]];
    };
    const isBlue = ([r, g, b]) => b > 170 && b - r > 60 && g < 180;

    // Bounding box of the blue rounded square.
    let minX = sc.width, minY = sc.height, maxX = 0, maxY = 0;
    for (let y = 0; y < sc.height; y += 2) {
      for (let x = 0; x < sc.width; x += 2) {
        if (isBlue(px(x, y))) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    const crop = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };

    // Sample the flat blue (strip near the top inside the square, away from
    // corners and glyph).
    let rs = 0, gs = 0, bs = 0, n = 0;
    for (let x = crop.x + Math.round(crop.w * 0.3); x < crop.x + crop.w * 0.7; x += 3) {
      const y = crop.y + Math.round(crop.h * 0.08);
      const p = px(x, y);
      if (isBlue(p)) {
        rs += p[0]; gs += p[1]; bs += p[2]; n++;
      }
    }
    const hex = (v) => Math.round(v / n).toString(16).padStart(2, '0');
    const blue = `#${hex(rs)}${hex(gs)}${hex(bs)}`;

    const out = {};
    const draw = (size, fn) => {
      const c = document.createElement('canvas');
      c.width = size;
      c.height = size;
      const ctx = c.getContext('2d');
      fn(ctx, size);
      return c.toDataURL('image/png').split(',')[1];
    };

    // White glyph on transparency at size g: whiteness-keyed from the crop,
    // then alpha-masked to the crop's rounded rect so the white PAGE corners
    // (outside the blue square's rounded corners) never leak into the layer.
    const glyphLayer = (g) => {
      const off = document.createElement('canvas');
      off.width = g;
      off.height = g;
      const octx = off.getContext('2d');
      octx.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, g, g);
      const id = octx.getImageData(0, 0, g, g);
      const p = id.data;
      for (let i = 0; i < p.length; i += 4) {
        const mean = (p[i] + p[i + 1] + p[i + 2]) / 3;
        // Blue field mean ≈ 127, glyph white ≈ 255 → smooth ramp between.
        const a = Math.max(0, Math.min(1, (mean - 165) / 70));
        p[i] = 255; p[i + 1] = 255; p[i + 2] = 255;
        p[i + 3] = Math.round(a * 255);
      }
      octx.putImageData(id, 0, 0);
      octx.globalCompositeOperation = 'destination-in';
      // Slightly inset with a generous radius: the mask must sit INSIDE the
      // source square's rounded corner, or its anti-aliased white edge leaks
      // through as hairline arcs.
      const inset = g * 0.015;
      octx.beginPath();
      octx.roundRect(inset, inset, g - inset * 2, g - inset * 2, g * 0.25);
      octx.fill();
      return off;
    };

    // Legacy: solid blue square + glyph (no white margins/corners).
    for (const [d, size] of Object.entries(LEGACY)) {
      const compose = (ctx, s, clipCircle) => {
        if (clipCircle) {
          ctx.beginPath();
          ctx.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2);
          ctx.clip();
        }
        ctx.fillStyle = blue;
        ctx.fillRect(0, 0, s, s);
        const g = Math.round(s * (clipCircle ? 0.84 : 0.94));
        const pad = Math.round((s - g) / 2);
        ctx.drawImage(glyphLayer(g), pad, pad);
      };
      out[`mipmap-${d}/ic_launcher.png`] = draw(size, (ctx, s) => compose(ctx, s, false));
      out[`mipmap-${d}/ic_launcher_round.png`] = draw(size, (ctx, s) => compose(ctx, s, true));
    }

    // Adaptive foreground: glyph only, centred into the safe zone (~57%).
    for (const [d, size] of Object.entries(FOREGROUND)) {
      out[`mipmap-${d}/ic_launcher_foreground.png`] = draw(size, (ctx, s) => {
        const g = Math.round(s * 0.92); // crop drawn at 92% → glyph ≈ 57%
        const pad = Math.round((s - g) / 2);
        ctx.drawImage(glyphLayer(g), pad, pad);
      });
    }
    return { out, blue, crop };
  },
  { b64, LEGACY, FOREGROUND },
);

for (const [rel, b] of Object.entries(results.out)) {
  writeFileSync(join(RES, rel), Buffer.from(b, 'base64'));
  console.log('wrote', rel);
}
console.log('sampled brand blue:', results.blue, 'crop:', JSON.stringify(results.crop));
await browser.close();
