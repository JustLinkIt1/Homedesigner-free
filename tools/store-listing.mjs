// Compose Play Store marketing screenshots from the raw captures.
//
//   node tools/screenshots.mjs        # raw app shots into store/
//   node tools/store-listing.mjs      # captioned marketing shots into store/listing/
//
// Separate from screenshots.mjs on purpose: capturing needs the app running and
// takes minutes, while re-composing after a copy change should take seconds.
// Iterating on caption wording is the whole point of an ASO test.
//
// Renders every locale in CAPTIONS by default; pass locales to narrow it
// (`node tools/store-listing.mjs en de`). As with screenshots.mjs, point
// CHROMIUM_PATH at a Chrome binary when there is no Playwright-managed one.
// Output is deterministic — the same inputs give byte-identical PNGs.

import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from 'playwright';
import { CANVAS, SHOTS, CAPTIONS, frameHtml } from './storeFrame.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'store');
const outDir = join(root, 'store', 'listing');
mkdirSync(outDir, { recursive: true });

// Which languages to render. Default: every locale with captions defined.
const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const locales = only.length ? only : Object.keys(CAPTIONS);

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--no-sandbox'],
});
const page = await browser.newPage({
  viewport: { width: CANVAS.width, height: CANVAS.height },
  deviceScaleFactor: 1,
});

let made = 0;
const missing = [];
for (const locale of locales) {
  const copy = { ...CAPTIONS.en, ...(CAPTIONS[locale] ?? {}) };
  for (const [i, shot] of SHOTS.entries()) {
    const raw = join(srcDir, `phone-${shot.source}.png`);
    if (!existsSync(raw)) {
      missing.push(raw);
      continue;
    }
    const dataUri = `data:image/png;base64,${readFileSync(raw).toString('base64')}`;
    await page.setContent(frameHtml({ caption: copy[shot.key], imageDataUri: dataUri }));
    // Fonts and the inlined image must be decoded before the shot, or the
    // caption renders in a fallback face and the device box comes out empty.
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => {
      const img = document.querySelector('.device img');
      return img && img.complete && img.naturalWidth > 0;
    });
    // Index prefix IS the Play listing order — the first file is the one that
    // shows in search results.
    const out = join(outDir, `${locale}-${i + 1}-${shot.key}.png`);
    await page.screenshot({ path: out });
    made++;
  }
}

await browser.close();

if (missing.length) {
  console.log('Missing raw captures — run `node tools/screenshots.mjs` first:');
  for (const m of [...new Set(missing)]) console.log('  ', m.replace(`${root}/`, ''));
}
console.log(`\nWrote ${made} listing images to store/listing/ (${locales.join(', ')})`);
console.log(`Order matters: *-1-* is the search-results slot.`);
