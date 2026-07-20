// Generates all app-icon assets from the single brand source
// (brand/homedesigner-icon-src.png — the royal-blue rounded-square icon with the
// white house/blueprint/F glyph):
//   • Android legacy launcher (ic_launcher / ic_launcher_round) — full-bleed icon
//   • Android adaptive foreground (white glyph, transparent, in the safe zone)
//     over the existing @color/ic_launcher_background (#0D63F8)
//   • Web favicon + apple-touch icon + the in-app brand chip
//
//   node scripts/gen-icons.mjs
//
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'brand', 'homedesigner-icon-src.png');
const RES = path.join(ROOT, 'android', 'app', 'src', 'main', 'res');
const PUB = path.join(ROOT, 'public');

// ---- 1. Tight-crop the blue rounded square out of the white margin ----
const { data, info } = await sharp(SRC).raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H, channels: C } = info;
const isWhite = (i) => data[i] > 245 && data[i + 1] > 245 && data[i + 2] > 245;
let minX = W, minY = H, maxX = 0, maxY = 0;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * C;
    if (!isWhite(i)) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
}
// Square crop centred on the blue rect.
const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
const side = Math.max(maxX - minX, maxY - minY);
const left = Math.max(0, Math.round(cx - side / 2));
const top = Math.max(0, Math.round(cy - side / 2));
const sq = Math.min(side, W - left, H - top);
const squareIcon = await sharp(SRC).extract({ left, top, width: sq, height: sq }).png().toBuffer();

// ---- 2. White glyph on transparent ----
// The glyph is white, but so is the outer margin around the rounded square, so
// colour alone can't tell them apart. Flood-fill "white" inward from the border
// to mark the EXTERIOR margin; the interior glyph is enclosed by blue and never
// reached. alpha = min(R,G,B) (smooth edges) zeroed wherever it's exterior.
const raw = await sharp(SRC).ensureAlpha().raw().toBuffer();
const CC = 4;
const whiteish = (p) => Math.min(raw[p * CC], raw[p * CC + 1], raw[p * CC + 2]) > 200;
const exterior = new Uint8Array(W * H);
const stack = [];
for (let x = 0; x < W; x++) { stack.push(x, (H - 1) * W + x); }
for (let y = 0; y < H; y++) { stack.push(y * W, y * W + W - 1); }
while (stack.length) {
  const p = stack.pop();
  if (exterior[p] || !whiteish(p)) continue;
  exterior[p] = 1;
  const x = p % W, y = (p / W) | 0;
  if (x > 0) stack.push(p - 1);
  if (x < W - 1) stack.push(p + 1);
  if (y > 0) stack.push(p - W);
  if (y < H - 1) stack.push(p + W);
}
const glyphAlpha = Buffer.alloc(W * H * 4);
let gMinX = W, gMinY = H, gMaxX = 0, gMaxY = 0;
for (let p = 0; p < W * H; p++) {
  const i = p * C;
  const a = exterior[p] ? 0 : Math.min(data[i], data[i + 1], data[i + 2]);
  glyphAlpha[p * 4] = 255; glyphAlpha[p * 4 + 1] = 255; glyphAlpha[p * 4 + 2] = 255; glyphAlpha[p * 4 + 3] = a;
  if (a > 140) { const x = p % W, y = (p / W) | 0; if (x < gMinX) gMinX = x; if (x > gMaxX) gMaxX = x; if (y < gMinY) gMinY = y; if (y > gMaxY) gMaxY = y; }
}
const gW = gMaxX - gMinX + 1, gH = gMaxY - gMinY + 1;
const glyph = await sharp(glyphAlpha, { raw: { width: W, height: H, channels: 4 } })
  .extract({ left: gMinX, top: gMinY, width: gW, height: gH }).png().toBuffer();

// Foreground layer: glyph at ~60% of a transparent square (adaptive safe zone).
async function foreground(size) {
  const inner = Math.round(size * 0.6);
  const g = await sharp(glyph).resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: g, gravity: 'center' }]).png().toBuffer();
}

const write = (p, buf) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, buf); };

// ---- 3. Android mipmaps ----
const LAUNCHER = { 'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192 };
const FOREGROUND = { 'mdpi': 108, 'hdpi': 162, 'xhdpi': 216, 'xxhdpi': 324, 'xxxhdpi': 432 };
for (const [dpi, px] of Object.entries(LAUNCHER)) {
  const icon = await sharp(squareIcon).resize(px, px).png().toBuffer();
  write(path.join(RES, `mipmap-${dpi}`, 'ic_launcher.png'), icon);
  write(path.join(RES, `mipmap-${dpi}`, 'ic_launcher_round.png'), icon);
}
for (const [dpi, px] of Object.entries(FOREGROUND)) {
  write(path.join(RES, `mipmap-${dpi}`, 'ic_launcher_foreground.png'), await foreground(px));
}

// ---- 4. Web icons + in-app brand chip ----
write(path.join(PUB, 'favicon.png'), await sharp(squareIcon).resize(64, 64).png().toBuffer());
write(path.join(PUB, 'apple-touch-icon.png'), await sharp(squareIcon).resize(180, 180).png().toBuffer());
write(path.join(PUB, 'icon-192.png'), await sharp(squareIcon).resize(192, 192).png().toBuffer());
write(path.join(PUB, 'icon-512.png'), await sharp(squareIcon).resize(512, 512).png().toBuffer());
write(path.join(PUB, 'brand-icon.png'), await sharp(squareIcon).resize(96, 96).png().toBuffer());

console.log(`Icons generated. Blue-square crop: ${sq}px; glyph: ${gW}x${gH}.`);
