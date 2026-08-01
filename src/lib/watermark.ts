// Free-tier export watermark. Applied to the EXPORT COPY of renders/photos/
// plan images only — persisted project data is never touched. Pro removes it.
import { APP_NAME, SITE_DOMAIN } from './appInfo';

/**
 * Draw a small corner ribbon ("Made with <app> · <domain>") onto an image data
 * URL. Sized relative to the image so it reads the same at any resolution.
 *
 * Deliberately NOT translated. It is a brand attribution mark, and "Made with
 * X" puts the product name FIRST in Japanese and Korean — composing it as
 * `t('Made with') + APP_NAME` would read backwards in both. Every other visible
 * string in the app goes through `t()`; this one is the logo.
 */
export async function applyWatermark(dataUrl: string): Promise<string> {
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('watermark: image decode failed'));
    img.src = dataUrl;
  });

  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl; // no 2D context — ship the original rather than fail

  ctx.drawImage(img, 0, 0);

  // The domain is the whole point of the ribbon: a shared render is the app's
  // only organic advert, and without it nobody can act on one.
  const label = `Made with ${APP_NAME} · ${SITE_DOMAIN}`;
  const setFont = (px: number) => {
    ctx.font = `600 ${px}px 'Plus Jakarta Sans', system-ui, sans-serif`;
  };
  let fontPx = Math.max(13, Math.round(Math.min(img.width, img.height) * 0.022));
  setFont(fontPx);
  const measure = () => {
    const padX = fontPx * 0.8;
    return { padX, boxW: ctx.measureText(label).width + padX * 2 };
  };
  let { padX, boxW } = measure();
  // Adding the domain roughly doubled the ribbon's width, so on a narrow or
  // portrait render it could reach past the left edge. Shrink to fit rather
  // than clip; the floor keeps it legible on a small export.
  const maxW = img.width * 0.9;
  if (boxW > maxW) {
    fontPx = Math.max(9, Math.floor(fontPx * (maxW / boxW)));
    setFont(fontPx);
    ({ padX, boxW } = measure());
  }
  const padY = fontPx * 0.5;
  const boxH = fontPx + padY * 2;
  const margin = fontPx * 0.9;
  const x = Math.max(margin, img.width - boxW - margin);
  const y = img.height - boxH - margin;

  ctx.fillStyle = 'rgba(20, 23, 28, 0.55)';
  ctx.beginPath();
  const r = boxH / 2;
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + boxW, y, x + boxW, y + boxH, r);
  ctx.arcTo(x + boxW, y + boxH, x, y + boxH, r);
  ctx.arcTo(x, y + boxH, x, y, r);
  ctx.arcTo(x, y, x + boxW, y, r);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + padX, y + boxH / 2 + fontPx * 0.05);

  return canvas.toDataURL('image/png');
}
