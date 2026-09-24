import { createFalClient } from '@fal-ai/client';
import { pointsFor, PRICE_VERSION } from './points';

const ENDPOINT = 'fal-ai/flux-pro/kontext';
const BASE_RENDER_PROMPT = 'Turn this 3D architectural preview into a photorealistic interior photograph. '
  + 'Keep the exact same room layout, camera angle, furniture positions, openings and proportions. '
  + 'Do not add, remove or move furniture, walls, doors or windows. ';

export const RENDER_STYLES = [
  { id: 'photorealistic', label: 'Photorealistic' },
  { id: 'modern', label: 'Modern' },
  { id: 'scandinavian', label: 'Scandinavian' },
  { id: 'industrial', label: 'Industrial' },
  { id: 'coastal', label: 'Coastal' },
  { id: 'luxury', label: 'Luxury' },
] as const;
export type RenderStyleId = typeof RENDER_STYLES[number]['id'];
const STYLE_PROMPTS: Record<RenderStyleId, string> = {
  photorealistic: 'Preserve the existing colours and design. Use natural wood grain, matte painted walls, woven fabric upholstery and glass with subtle reflections.',
  modern: 'Restyle finishes and furnishings as refined contemporary modern design: clean lines, warm neutrals, natural oak, matte stone and restrained accents.',
  scandinavian: 'Restyle finishes and furnishings as bright Scandinavian design: pale timber, soft off-whites, tactile natural fabrics and simple functional details.',
  industrial: 'Restyle finishes and furnishings as polished industrial design: dark metal, warm reclaimed timber, concrete textures and controlled loft-style accents.',
  coastal: 'Restyle finishes and furnishings as sophisticated coastal design: airy whites, sandy neutrals, pale timber, linen textures and subtle ocean-blue accents.',
  luxury: 'Restyle finishes and furnishings as understated luxury design: premium stone, dark timber, brushed metal, tailored upholstery and elegant layered lighting.',
};
const CAMERA_PROMPT = ' Warm natural afternoon daylight, soft realistic shadows, shot on a full frame camera at 24mm, high-end architectural interior photography. No text or watermark.';
export const validRenderStyle = (style: unknown): style is RenderStyleId =>
  typeof style === 'string' && RENDER_STYLES.some(item => item.id === style);
export const renderPrompt = (style: RenderStyleId) => BASE_RENDER_PROMPT + STYLE_PROMPTS[style] + CAMERA_PROMPT;
/** Kept for older tests and integrations that expect the original preset. */
export const RENDER_PROMPT = renderPrompt('photorealistic');

export class RenderError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export interface RenderJob {
  id: string; subject: string; status: 'reserved' | 'queued' | 'complete' | 'failed';
  style: RenderStyleId;
  charge: number; request_id: string | null; result_url: string | null;
  error: string | null; created_at: number;
}
export const validRenderId = (id: unknown): id is string => typeof id === 'string' && /^[a-f0-9-]{36}$/.test(id);

/** Only app-produced, bounded JPEG data, never arbitrary URLs (SSRF) or options. */
export function validRenderImage(image: unknown): image is string {
  return typeof image === 'string' && image.length <= 2_800_000
    && /^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(image);
}
export function validResultUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port
      && (url.hostname === 'fal.media' || url.hostname.endsWith('.fal.media'));
  } catch { return false; }
}
export async function readRender(db: D1Database, subject: string, id: string) {
  return db.prepare('SELECT * FROM ai_render_jobs WHERE subject = ? AND id = ?').bind(subject, id).first<RenderJob>();
}
export async function freeRenderAvailable(db: D1Database, subject: string) {
  return !(await db.prepare('SELECT 1 FROM ai_render_allowances WHERE subject = ?').bind(await allowanceKey(subject)).first());
}
async function allowanceKey(subject: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`ai-render-free:${subject}`));
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}
export async function failRender(db: D1Database, subject: string, id: string, message: string) {
  await db.prepare("UPDATE ai_render_jobs SET status = 'failed', error = ? WHERE subject = ? AND id = ? AND status IN ('reserved','queued')")
    .bind(message, subject, id).run();
}
/** A unique INSERT plus SQL triggers owns the allowance/debit atomically.
 * Replaying a request only returns its job; it never dispatches twice. */
export async function reserveRender(db: D1Database, subject: string, id: string, expectedCharge: number, style: RenderStyleId = 'photorealistic') {
  const existing = await readRender(db, subject, id);
  if (existing) return { job: existing, created: false };
  const now = Date.now();
  const allowance = await allowanceKey(subject);
  await db.prepare(`INSERT INTO point_accounts(subject, created_at, updated_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING`)
    .bind(subject, now, now).run();
  try {
    const inserted = await db.prepare(`INSERT INTO ai_render_jobs(id, subject, allowance_key, status, style, charge, price_version, created_at)
      SELECT ?, ?, ?, 'reserved', ?, CASE WHEN EXISTS(SELECT 1 FROM ai_render_allowances WHERE subject = ?)
        THEN ? ELSE 0 END, ?, ? WHERE (CASE WHEN EXISTS(SELECT 1 FROM ai_render_allowances WHERE subject = ?)
        THEN ? ELSE 0 END) = ?`).bind(id, subject, allowance, style, allowance, pointsFor('ai_render'), PRICE_VERSION, now,
          allowance, pointsFor('ai_render'), expectedCharge).run();
    const job = await readRender(db, subject, id);
    if (!job) throw new RenderError('The render price or free allowance changed. Refresh before trying again.', 409);
    return { job, created: inserted.meta.changes === 1 };
  } catch (error) {
    const replay = await readRender(db, subject, id);
    if (replay) return { job: replay, created: false };
    if (error instanceof RenderError) throw error;
    const message = String(error);
    if (message.includes('insufficient points')) throw new RenderError('Not enough AI points.', 402);
    if (message.includes('render free budget limit')) throw new RenderError('Free AI renders are temporarily at capacity. Please try later.', 429);
    if (message.includes('render daily limit')) throw new RenderError('Daily AI render limit reached. Try tomorrow.', 429);
    if (message.includes('render already active')) throw new RenderError('An AI render is already in progress. Resume it first.', 409);
    throw error;
  }
}
export async function dispatchRender(db: D1Database, key: string, job: RenderJob, image: string) {
  // The SDK retries queue POSTs by default, including ambiguous network errors.
  // A render is billable: allow one outgoing submission, not an implicit retry.
  let sent = false;
  const client = createFalClient({ credentials: key, fetch: async (url, init) => {
    if (sent) throw new Error('A render submission cannot be retried automatically.');
    sent = true;
    return fetch(url, init);
  } });
  try {
    const submitted = await client.queue.submit(ENDPOINT, {
      abortSignal: AbortSignal.timeout(20_000), startTimeout: 120,
      input: { image_url: image, prompt: renderPrompt(job.style), guidance_scale: 3.5, num_images: 1,
        output_format: 'jpeg', safety_tolerance: '2', enhance_prompt: false },
    });
    await db.prepare("UPDATE ai_render_jobs SET status = 'queued', request_id = ? WHERE subject = ? AND id = ? AND status = 'reserved'")
      .bind(submitted.request_id, job.subject, job.id).run();
  } catch {
    // The same key stays terminal even after refund, so it cannot redispatch.
    await failRender(db, job.subject, job.id, 'AI render could not start. Your allowance or points were returned.');
  }
}
export async function refreshRender(db: D1Database, key: string, job: RenderJob) {
  if (job.status === 'queued' && Date.now() - job.created_at > 30 * 60_000) {
    await failRender(db, job.subject, job.id, 'The render timed out. Your allowance or points were returned.');
  } else if (job.status === 'reserved' && Date.now() - job.created_at > 120_000) {
    await failRender(db, job.subject, job.id, 'The render did not start. Your allowance or points were returned.');
  } else if (job.status === 'queued' && job.request_id) {
    const client = createFalClient({ credentials: key });
    // Network errors are not failed generations: keep the job and allow polling again.
    const status = await client.queue.status(ENDPOINT, { requestId: job.request_id, logs: false, abortSignal: AbortSignal.timeout(15_000) });
    if (status.status === 'COMPLETED') {
      try {
        const result = await client.queue.result(ENDPOINT, { requestId: job.request_id, abortSignal: AbortSignal.timeout(15_000) });
        const data = result.data as { images?: { url?: string }[]; has_nsfw_concepts?: boolean[] };
        const url = data.images?.[0]?.url;
        if (!validResultUrl(url) || data.has_nsfw_concepts?.some(Boolean)) {
          await failRender(db, job.subject, job.id, 'No usable image was generated. Your allowance or points were returned.');
        } else {
          await db.prepare("UPDATE ai_render_jobs SET status = 'complete', result_url = ? WHERE subject = ? AND id = ? AND status = 'queued'")
            .bind(url, job.subject, job.id).run();
        }
      } catch (error) {
        // fal's completed-but-failed jobs return a 4xx validation error.
        const code = (error as { status?: number }).status;
        if (code && code >= 400 && code < 500 && code !== 429) {
          await failRender(db, job.subject, job.id, 'Generation failed. Your allowance or points were returned.');
        } else throw error;
      }
    }
  }
  return (await readRender(db, job.subject, job.id))!;
}
export function publicRender(job: RenderJob) {
  return { id: job.id, status: job.status, style: job.style, charged: job.charge, error: job.error };
}
