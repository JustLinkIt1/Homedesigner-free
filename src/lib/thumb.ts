import { planCapture } from './renderBridge';
import * as projects from './projects';

/**
 * Grabs a framed shot of the current 2D plan (via the Canvas2D capture bridge),
 * downscales it to a card-sized JPEG, and stores it as the active project's
 * thumbnail. Best-effort and synchronous up to the point it reads the capture,
 * so it MUST be called while the 2D canvas is still mounted (e.g. before
 * switching to 3D, which unmounts Canvas2D and clears the bridge). Returns
 * silently for an empty plan (nothing to preview).
 */
export function capturePlanThumbnail(): void {
  const id = projects.getActiveId();
  const full = planCapture.current?.()?.url;
  if (!id || !full) return;
  const img = new Image();
  img.src = full;
  img
    .decode()
    .then(() => {
      const w = 240;
      const h = Math.max(1, Math.round((img.height / img.width) * w));
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#f6f5f2';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      projects.setThumbnail(id, c.toDataURL('image/jpeg', 0.6));
    })
    .catch(() => {
      /* thumbnails are best-effort */
    });
}
