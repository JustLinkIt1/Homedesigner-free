// Free-tier export watermark. Applied to the EXPORT COPY of renders/photos/
// plan images only — persisted project data is never touched. Pro removes it.
import { APP_NAME } from './appInfo';

/**
 * Draw a small corner ribbon ("Made with <app>") onto an image data URL.
 * Sized relative to the image so it reads the same at any resolution.
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

  const label = `Made with ${APP_NAME}`;
  const fontPx = Math.max(13, Math.round(Math.min(img.width, img.height) * 0.022));
  ctx.font = `600 ${fontPx}px 'Plus Jakarta Sans', system-ui, sans-serif`;
  const padX = fontPx * 0.8;
  const padY = fontPx * 0.5;
  const textW = ctx.measureText(label).width;
  const boxW = textW + padX * 2;
  const boxH = fontPx + padY * 2;
  const margin = fontPx * 0.9;
  const x = img.width - boxW - margin;
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
