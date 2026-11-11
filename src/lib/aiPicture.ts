import { planCapture, sceneSnapshot } from './renderBridge';

/** The Worker refuses pictures above 1100px or ~1.2 MB (ai-advisor.ts). */
const MAX_SIDE = 1024;
const MAX_CHARS = 1_100_000;

/**
 * A small JPEG of what the designer review should look at: the framed 2D plan
 * when the plan view is mounted, otherwise the current 3D view. Best-effort:
 * resolves to undefined when neither is available, and the review then runs
 * from the room list alone.
 */
export async function planPicture(): Promise<string | undefined> {
  let source: string | undefined;
  try {
    source = planCapture.current?.()?.url ?? sceneSnapshot.current?.() ?? undefined;
  } catch {
    // A tainted canvas throws synchronously from toDataURL.
    return undefined;
  }
  if (!source) return undefined;
  const img = new Image();
  img.src = source;
  try {
    await img.decode();
  } catch {
    return undefined;
  }
  if (!img.width || !img.height) return undefined;
  const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return undefined;
  // The plan export is a transparent PNG; JPEG has no alpha.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.82, 0.6]) {
    const url = canvas.toDataURL('image/jpeg', quality);
    if (url.startsWith('data:image/jpeg;base64,') && url.length <= MAX_CHARS) return url;
  }
  return undefined;
}
