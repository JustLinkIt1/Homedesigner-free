import { createFalClient } from '@fal-ai/client';
import { pointsFor, PRICE_VERSION } from './points';

const ENDPOINT = 'fal-ai/flux-pro/kontext';
/** ElevenLabs renders first (prepaid credits); fal is the backup. */
const ELEVENLABS_API = 'https://api.elevenlabs.io';
export const ELEVENLABS_IMAGE_MODEL = 'gemini-3.1-flash-image';
/** Jobs rendered by ElevenLabs store their generation id with this prefix. */
const ELEVENLABS_PREFIX = 'el:';
export interface RenderKeys { fal?: string; elevenlabs?: string }
const keysOf = (keys: string | RenderKeys): RenderKeys => typeof keys === 'string' ? { fal: keys } : keys;
export const renderAvailable = (keys: RenderKeys) => !!keys.fal?.trim() || !!keys.elevenlabs?.trim();
const BASE_RENDER_PROMPT = 'Turn this 3D architectural preview into a photorealistic interior photograph. '
  + 'Keep the exact same room layout, camera angle, furniture positions, openings and proportions. '
  + 'Do not add, remove, replace, resize or move furniture, walls, doors or windows. '
  + 'Preserve the input framing, perspective, aspect ratio and visible room boundaries, including cutaway or overhead views. ';

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
  modern: 'Change only surface colours and materials toward contemporary modern design: warm neutrals, natural oak, matte stone and restrained accents.',
  scandinavian: 'Change only surface colours and materials toward Scandinavian design: pale timber, soft off-whites and tactile natural fabrics.',
  industrial: 'Change only surface colours and materials toward industrial design: dark metal, warm timber and concrete textures.',
  coastal: 'Change only surface colours and materials toward coastal design: airy whites, sandy neutrals, pale timber, linen and subtle ocean-blue accents.',
  luxury: 'Change only surface colours and materials toward understated luxury: premium stone, dark timber, brushed metal and tailored upholstery.',
};
const CAMERA_PROMPT = ' Preserve the apparent time of day and direction of light. Use physically plausible lighting, natural contact shadows and realistic material detail. Keep all architecture in focus; do not introduce lens blur or change the camera lens. High-end architectural photography. No text or watermark.';
export const validRenderStyle = (style: unknown): style is RenderStyleId =>
  typeof style === 'string' && RENDER_STYLES.some(item => item.id === style);
/** What the capture shows. The app says which; anything else is read as a room. */
export type RenderView = 'interior' | 'exterior';
export const validRenderView = (view: unknown): view is RenderView => view === 'interior' || view === 'exterior';
// A house seen from the street is not a room: told to make "an interior
// photograph", the model lays a floor over the lawn and furnishes the garden.
const EXTERIOR_RENDER_PROMPT = 'Turn this 3D architectural preview into a photorealistic exterior photograph of the same house. '
  + 'Keep the exact same building: its shape, number of storeys, roof form and pitch, and the position, size and number of every window and door. '
  + 'Do not add, remove, resize or move walls, extensions, windows, doors, chimneys, dormers, cars or people. '
  + 'Preserve the input framing, camera angle, perspective and aspect ratio. '
  + 'Keep the site as drawn: any road, pavement, path, driveway, fence, hedge, lawn, patio and garden furniture stays where it is, each in the material shown. '
  + 'Add no new fences, hedges, planting, paths or objects inside the plot. Show lawns as mown grass and hedges as leafy clipped hedging. '
  + 'Beyond the plot, replace empty flat ground with a quiet backdrop of trees under a natural sky; add no other buildings. ';
const EXTERIOR_STYLE_PROMPTS: Record<RenderStyleId, string> = {
  photorealistic: 'Preserve the existing wall and roof colours and materials. Use real brickwork with mortar joints or fine render, weathered roof tiles, painted window frames, glass with soft sky reflections, worn asphalt and paving.',
  modern: 'Change only surface colours and materials toward contemporary modern design: smooth pale render or light brick, slim dark window frames and a slate-grey roof.',
  scandinavian: 'Change only surface colours and materials toward Scandinavian design: pale timber cladding, soft off-white walls, light window frames and a plain dark roof.',
  industrial: 'Change only surface colours and materials toward industrial design: dark brick, charcoal metal window frames, and standing-seam metal roofing.',
  coastal: 'Change only surface colours and materials toward coastal design: white or pale weatherboard, sandy neutrals, soft blue-grey window frames and bleached timber.',
  luxury: 'Change only surface colours and materials toward understated luxury: fine stone or handmade brick, dark bronze window frames, and natural slate roofing.',
};
export const renderPrompt = (style: RenderStyleId, view: RenderView = 'interior') => view === 'exterior'
  ? EXTERIOR_RENDER_PROMPT + EXTERIOR_STYLE_PROMPTS[style] + CAMERA_PROMPT
  : BASE_RENDER_PROMPT + STYLE_PROMPTS[style] + CAMERA_PROMPT;
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
  /** 1 when the app must stamp the homedesignerapp.com watermark on the result. */
  watermark?: number;
  /** Failed image downloads of a complete job (migration 0011). */
  delivery_failures?: number;
  /** When the image first reached the app; a delivered render is never refunded. */
  delivered_at?: number | null;
}
export interface RenderOptions {
  /** A free account asks for the cheaper watermarked render. Ignored for Pro. */
  watermark?: boolean;
  /** Pro renders are always clean at the base price. Older apps only ever sent Pro renders. */
  isPro?: boolean;
}
/** What a render costs this account, and whether its free first render can pay for it. */
export function renderTerms({ watermark = false, isPro = true }: RenderOptions = {}) {
  const marked = !isPro && watermark;
  // The free first render stays a Pro perk; free accounts start on their point grant.
  return { marked, freeEligible: isPro, price: pointsFor(isPro || marked ? 'ai_render' : 'ai_render_clean') };
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
/** ElevenLabs hands back short-lived signed links; only these hosts are fetched. */
export function validElevenLabsAssetUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port
      && (url.hostname === 'storage.googleapis.com' || url.hostname === 'elevenlabs.io' || url.hostname.endsWith('.elevenlabs.io'));
  } catch { return false; }
}
/** Width and height from a JPEG's frame header (same reader as ai-advisor's jpegSize). */
function jpegDimensions(bytes: Uint8Array) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    if (marker === 0xff) { offset += 1; continue; }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { offset += 2; continue; }
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (length < 2) return null;
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const height = (bytes[offset + 5] << 8) | bytes[offset + 6];
      const width = (bytes[offset + 7] << 8) | bytes[offset + 8];
      return width > 0 && height > 0 ? { width, height } : null;
    }
    offset += 2 + length;
  }
  return null;
}
const ASPECTS = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'] as const;
/** The model's supported aspect ratio closest to the capture, so framing survives. */
export function renderAspect(width: number, height: number): typeof ASPECTS[number] {
  const distance = (aspect: string) => {
    const [w, h] = aspect.split(':').map(Number);
    return Math.abs(Math.log(w / h) - Math.log(width / height));
  };
  return ASPECTS.reduce((best, aspect) => distance(aspect) < distance(best) ? aspect : best);
}
function base64Bytes(base64: string, limit: number) {
  const binary = atob(base64.slice(0, Math.ceil(limit / 3) * 4));
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}
/** One POST to ElevenLabs. Returns the generation id, or null if it refused or failed to answer. */
async function submitElevenLabs(key: string, job: RenderJob, image: string, view: RenderView, timeoutMs: number) {
  const base64 = image.slice(image.indexOf(',') + 1);
  const size = jpegDimensions(base64Bytes(base64, 64 * 1024));
  try {
    const response = await fetch(`${ELEVENLABS_API}/v1/flows/image`, {
      method: 'POST', signal: AbortSignal.timeout(timeoutMs),
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model_id: ELEVENLABS_IMAGE_MODEL, prompt: renderPrompt(job.style, view), resolution: '1K',
        aspect_ratio: size ? renderAspect(size.width, size.height) : '16:9',
        images: [{ type: 'inline_base64', content_base64: base64, mime_type: 'image/jpeg' }],
      }),
    });
    if (!response.ok) {
      console.error('ai-render: stage=elevenlabs-submit refused', job.id, response.status,
        (await response.text().catch(() => '')).slice(0, 300));
      return null;
    }
    const data = await response.json() as { id?: unknown };
    if (typeof data.id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(data.id)) return data.id;
    console.error('ai-render: stage=elevenlabs-submit answered without a usable id', job.id);
    return null;
  } catch (error) {
    console.error('ai-render: stage=elevenlabs-submit no answer', job.id, `${timeoutMs}ms`, errorText(error));
    return null;
  }
}
type ElevenLabsGeneration = { status?: string; content_url?: string; failure_reason?: string };
class ProviderStatusError extends Error {
  constructor(public status: number) { super(`ElevenLabs status ${status}`); }
}
async function elevenLabsGeneration(key: string, id: string) {
  const response = await fetch(`${ELEVENLABS_API}/v1/flows/image/${encodeURIComponent(id)}`, {
    headers: { 'xi-api-key': key }, signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new ProviderStatusError(response.status);
  return await response.json() as ElevenLabsGeneration;
}
/** The link to download a finished render: fal's stored URL, or a fresh signed link from ElevenLabs. */
export async function renderImageUrl(keys: string | RenderKeys, job: RenderJob) {
  if (job.status !== 'complete') return null;
  if (job.request_id?.startsWith(ELEVENLABS_PREFIX)) {
    const key = keysOf(keys).elevenlabs;
    if (!key) return null;
    const generation = await elevenLabsGeneration(key, job.request_id.slice(ELEVENLABS_PREFIX.length));
    return generation.status === 'completed' && validElevenLabsAssetUrl(generation.content_url) ? generation.content_url : null;
  }
  return validResultUrl(job.result_url) ? job.result_url : null;
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
export async function reserveRender(db: D1Database, subject: string, id: string, expectedCharge: number,
  style: RenderStyleId = 'photorealistic', options: RenderOptions = {}) {
  const existing = await readRender(db, subject, id);
  if (existing) return { job: existing, created: false };
  const now = Date.now();
  const allowance = await allowanceKey(subject);
  const { marked, freeEligible, price } = renderTerms(options);
  const eligible = freeEligible ? 1 : 0;
  await db.prepare(`INSERT INTO point_accounts(subject, created_at, updated_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING`)
    .bind(subject, now, now).run();
  try {
    // The free first render is only ever spent by a Pro account.
    const inserted = await db.prepare(`INSERT INTO ai_render_jobs(id, subject, allowance_key, status, style, watermark, charge, price_version, created_at)
      SELECT ?, ?, ?, 'reserved', ?, ?, CASE WHEN ? = 1 AND NOT EXISTS(SELECT 1 FROM ai_render_allowances WHERE subject = ?)
        THEN 0 ELSE ? END, ?, ? WHERE (CASE WHEN ? = 1 AND NOT EXISTS(SELECT 1 FROM ai_render_allowances WHERE subject = ?)
        THEN 0 ELSE ? END) = ?`).bind(id, subject, allowance, style, marked ? 1 : 0, eligible, allowance, price, PRICE_VERSION, now,
          eligible, allowance, price, expectedCharge).run();
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
const errorText = (error: unknown) => error instanceof Error ? `${error.name}: ${error.message}` : String(error);
const NOT_STARTED = 'AI render could not start. Your allowance or points were returned.';
const DID_NOT_START = 'The render did not start. Your allowance or points were returned.';
/** The app abandons any request after 30 s (src/lib/aiRender.ts, aiRequest).
 * The POST dispatches before it answers, so reading the body, reserving and
 * both provider submissions must finish inside this, measured from when the
 * request arrived, leaving about 5 s for the database and the answer.
 * Dispatching in waitUntil after the answer was cut off every time in
 * production: jobs sat "reserved" with nothing written, then failed 2 min later. */
export const RENDER_POST_DEADLINE_MS = 25_000;
const ELEVENLABS_SUBMIT_MS = 12_000;
const FAL_SUBMIT_MS = 12_000;
/** With less than this left, fal is not tried: a 2.8 MB upload cannot finish. */
const MIN_FAL_SUBMIT_MS = 2_000;
/** A job still "reserved" after this never reached a provider. */
export const STALE_RESERVED_MS = 120_000;
/** Hand a reserved job to a provider inside the caller's deadline. Whatever
 * goes wrong (refusal, timeout, deadline) the job ends failed, and the refund
 * trigger returns its allowance or points, before this returns. Returns the
 * job as it now stands. */
export async function dispatchRender(db: D1Database, keys: string | RenderKeys, job: RenderJob, image: string,
  view: RenderView = 'interior', deadline = Date.now() + RENDER_POST_DEADLINE_MS) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const outOfTime = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('dispatch deadline passed')), Math.max(0, deadline - Date.now()));
  });
  try { await Promise.race([submitRender(db, keys, job, image, view, deadline), outOfTime]); }
  catch (error) {
    console.error('ai-render: stage=dispatch failed', job.id, errorText(error));
    await failRender(db, job.subject, job.id, NOT_STARTED)
      .catch(e => console.error('ai-render: stage=dispatch could not mark the job failed', job.id, errorText(e)));
  } finally { clearTimeout(timer); }
  return (await readRender(db, job.subject, job.id)) ?? job;
}
async function submitRender(db: D1Database, keys: string | RenderKeys, job: RenderJob, image: string, view: RenderView,
  deadline: number) {
  const { fal: falKey, elevenlabs } = keysOf(keys);
  const remaining = () => deadline - Date.now();
  if (elevenlabs?.trim()) {
    const budget = Math.min(ELEVENLABS_SUBMIT_MS, remaining());
    const generation = budget > 0 ? await submitElevenLabs(elevenlabs, job, image, view, budget) : null;
    if (generation) {
      await db.prepare("UPDATE ai_render_jobs SET status = 'queued', request_id = ? WHERE subject = ? AND id = ? AND status = 'reserved'")
        .bind(ELEVENLABS_PREFIX + generation, job.subject, job.id).run();
      return;
    }
    // ElevenLabs refused or didn't answer: fal renders it instead. A lost
    // ElevenLabs request costs at most one unread generation, never the user.
  }
  if (!falKey?.trim()) {
    console.error('ai-render: stage=fal-submit skipped: no provider accepted the render and there is no fal key', job.id);
    await failRender(db, job.subject, job.id, NOT_STARTED);
    return;
  }
  const budget = Math.min(FAL_SUBMIT_MS, remaining());
  if (budget < MIN_FAL_SUBMIT_MS) {
    console.error('ai-render: stage=fal-submit skipped: deadline nearly spent', job.id, `${budget}ms left`);
    await failRender(db, job.subject, job.id, NOT_STARTED);
    return;
  }
  // The SDK retries queue POSTs (429/502/503/504 and network errors), and a
  // render is billable, so the queue submission itself is single-shot. Other
  // requests (fal storage uploads, should an SDK version upload input files
  // first) pass through. @fal-ai/client 1.10.1 does not upload a data: URI:
  // storage.transformInput uploads only Blob values and returns strings as
  // they are, so today a submit is exactly one request to queue.fal.run.
  let submitted = false;
  const client = createFalClient({ credentials: falKey, fetch: async (url, init) => {
    const target = new URL(url instanceof Request ? url.url : String(url));
    const method = (init?.method ?? (url instanceof Request ? url.method : 'GET')).toUpperCase();
    if (method === 'POST' && target.hostname === 'queue.fal.run') {
      if (submitted) throw new Error('A render submission cannot be retried automatically.');
      submitted = true;
    }
    return fetch(url, init);
  } });
  try {
    const queued = await client.queue.submit(ENDPOINT, {
      abortSignal: AbortSignal.timeout(budget), startTimeout: 120,
      input: { image_url: image, prompt: renderPrompt(job.style, view), guidance_scale: 3.5, num_images: 1,
        output_format: 'jpeg', safety_tolerance: '2', enhance_prompt: false },
    });
    await db.prepare("UPDATE ai_render_jobs SET status = 'queued', request_id = ? WHERE subject = ? AND id = ? AND status = 'reserved'")
      .bind(queued.request_id, job.subject, job.id).run();
  } catch (error) {
    console.error('ai-render: stage=fal-submit refused', job.id, `${budget}ms`, errorText(error));
    // The same key stays terminal even after refund, so it cannot redispatch.
    await failRender(db, job.subject, job.id, NOT_STARTED);
  }
}
/** Fail every job of this account still "reserved" after STALE_RESERVED_MS,
 * through failRender so the refund trigger returns allowance or points. One
 * stuck job otherwise locks the account: ai_render_guard refuses a new render
 * while any job is reserved. Safe to repeat: failRender only moves a job out of
 * reserved/queued, and the refund trigger fires only on that transition. */
export async function sweepStaleRenders(db: D1Database, subject: string, now = Date.now()) {
  const stale = await db.prepare("SELECT id FROM ai_render_jobs WHERE subject = ? AND status = 'reserved' AND created_at < ?")
    .bind(subject, now - STALE_RESERVED_MS).all<{ id: string }>();
  const ids = stale.results ?? [];
  for (const { id } of ids) {
    console.error('ai-render: stage=sweep stale reserved job failed', id);
    await failRender(db, subject, id, DID_NOT_START);
  }
  return ids.length;
}
export async function refreshRender(db: D1Database, keys: string | RenderKeys, job: RenderJob) {
  const { fal: falKey, elevenlabs } = keysOf(keys);
  if (job.status === 'queued' && Date.now() - job.created_at > 30 * 60_000) {
    await failRender(db, job.subject, job.id, 'The render timed out. Your allowance or points were returned.');
  } else if (job.status === 'reserved' && Date.now() - job.created_at > STALE_RESERVED_MS) {
    await failRender(db, job.subject, job.id, DID_NOT_START);
  } else if (job.status === 'queued' && job.request_id?.startsWith(ELEVENLABS_PREFIX)) {
    if (!elevenlabs) throw new Error('ElevenLabs is not configured');
    // Network errors are not failed generations: keep the job and allow polling again.
    const generation = await elevenLabsGeneration(elevenlabs, job.request_id.slice(ELEVENLABS_PREFIX.length));
    if (generation.status === 'completed') {
      if (!validElevenLabsAssetUrl(generation.content_url)) {
        await failRender(db, job.subject, job.id, 'No usable image was generated. Your allowance or points were returned.');
      } else {
        // The signed link expires in about an hour; the image route asks for a fresh one.
        await db.prepare("UPDATE ai_render_jobs SET status = 'complete', result_url = ? WHERE subject = ? AND id = ? AND status = 'queued'")
          .bind(generation.content_url, job.subject, job.id).run();
      }
    } else if (generation.status === 'failed') {
      await failRender(db, job.subject, job.id, generation.failure_reason === 'moderated'
        ? 'No usable image was generated. Your allowance or points were returned.'
        : 'Generation failed. Your allowance or points were returned.');
    }
  } else if (job.status === 'queued' && job.request_id) {
    if (!falKey) throw new Error('fal is not configured');
    const client = createFalClient({ credentials: falKey });
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
/** Failed downloads of a never-delivered complete job before it is refunded. */
export const DELIVERY_ATTEMPTS = 3;
const MAX_IMAGE_BYTES = 12_000_000;
const UNDELIVERED = 'The finished image could not be delivered. Your allowance or points were returned.';
export type RenderDelivery =
  | { ok: true; bytes: Uint8Array<ArrayBuffer>; contentType: string }
  | { ok: false; status: number; error: string; job?: RenderJob };
/** Refund a complete job whose image never reached the app. It becomes
 * failed, so the existing ai_render_refund trigger does the work: points back
 * (with the 'refund:ai_render:<subject>:<id>' ledger row, whose primary key
 * makes a second refund impossible) or, for a free-allowance job (charge 0),
 * the allowance restored exactly as failRender does. A paid job is refunded
 * only if its spend row exists and no refund row does yet; a delivered job
 * never. Returns true if this call refunded it. */
export async function refundUndeliveredRender(db: D1Database, subject: string, id: string, message = UNDELIVERED) {
  const result = await db.prepare(`UPDATE ai_render_jobs SET status = 'failed', error = ?1
    WHERE subject = ?2 AND id = ?3 AND status = 'complete' AND delivered_at IS NULL AND (charge = 0 OR (
      EXISTS (SELECT 1 FROM point_ledger WHERE point_ledger.id = 'ai_render:' || ?2 || ':' || ?3 AND point_ledger.kind = 'spend')
      AND NOT EXISTS (SELECT 1 FROM point_ledger WHERE point_ledger.id = 'refund:ai_render:' || ?2 || ':' || ?3)))`)
    .bind(message, subject, id).run();
  return result.meta.changes === 1;
}
async function readBounded(response: Response, max: number) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('empty image body');
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) { await reader.cancel(); throw new Error('image too large'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}
/** Fetch a complete job's image for the app.
 *
 * Terminal delivery failure (refund once, via refundUndeliveredRender), only
 * for a job never delivered before:
 *  - the provider says there is no image: a stored fal result_url that fails
 *    validResultUrl, or an ElevenLabs generation that is gone (404/410), failed,
 *    or completed without a usable link; or
 *  - DELIVERY_ATTEMPTS (3) failed downloads, counted in delivery_failures
 *    (network error, timeout, non-2xx, wrong content type, oversized body).
 * Anything else is transient: the job stays complete and the app may retry. A
 * missing provider key or an ElevenLabs status error other than 404/410 is not
 * counted (our side or the provider's API, not the image). Once any download
 * succeeds, delivered_at is set and the job is never refunded. */
export async function deliverRender(db: D1Database, keys: string | RenderKeys, job: RenderJob): Promise<RenderDelivery> {
  if (job.status !== 'complete') return { ok: false, status: 409, error: 'Image is not ready.' };
  const terminal = async (stage: string) => {
    console.error('ai-render: stage=deliver terminal', job.id, stage);
    if (job.delivered_at) return { ok: false as const, status: 502, error: 'Image download failed. Try again.' };
    const refunded = await refundUndeliveredRender(db, job.subject, job.id);
    if (!refunded) console.error('ai-render: stage=deliver not refunded (no spend row, already refunded, or state changed)', job.id);
    const now = (await readRender(db, job.subject, job.id)) ?? job;
    return now.status === 'failed'
      ? { ok: false as const, status: 410, error: now.error ?? UNDELIVERED, job: now }
      : { ok: false as const, status: 502, error: 'Image download failed. Try again.', job: now };
  };
  const attemptFailed = async (stage: string) => {
    console.error('ai-render: stage=deliver download failed', job.id, stage);
    if (job.delivered_at) return { ok: false as const, status: 502, error: 'Image download failed. Try again.' };
    await db.prepare(`UPDATE ai_render_jobs SET delivery_failures = delivery_failures + 1
      WHERE subject = ? AND id = ? AND status = 'complete' AND delivered_at IS NULL`).bind(job.subject, job.id).run();
    const now = await readRender(db, job.subject, job.id);
    if (now && now.status === 'complete' && !now.delivered_at && (now.delivery_failures ?? 0) >= DELIVERY_ATTEMPTS) {
      return terminal(`${now.delivery_failures} failed downloads`);
    }
    return { ok: false as const, status: 502, error: 'Image download failed. Try again.' };
  };
  let source: string;
  if (job.request_id?.startsWith(ELEVENLABS_PREFIX)) {
    const key = keysOf(keys).elevenlabs;
    if (!key) {
      console.error('ai-render: stage=deliver no ElevenLabs key', job.id);
      return { ok: false, status: 503, error: 'Image is not available right now. Try again later.' };
    }
    let generation: ElevenLabsGeneration;
    try { generation = await elevenLabsGeneration(key, job.request_id.slice(ELEVENLABS_PREFIX.length)); }
    catch (error) {
      if (error instanceof ProviderStatusError && (error.status === 404 || error.status === 410)) {
        return terminal(`ElevenLabs generation gone (${error.status})`);
      }
      console.error('ai-render: stage=deliver ElevenLabs status unavailable', job.id, errorText(error));
      return { ok: false, status: 502, error: 'Image download failed. Try again.' };
    }
    if (generation.status !== 'completed' || !validElevenLabsAssetUrl(generation.content_url)) {
      return terminal(`ElevenLabs generation ${generation.status ?? 'unknown'} without a usable link`);
    }
    source = generation.content_url!;
  } else {
    if (!validResultUrl(job.result_url)) return terminal('stored result_url is not a valid fal.media URL');
    source = job.result_url;
  }
  let image: Response;
  try { image = await fetch(source, { redirect: 'error', signal: AbortSignal.timeout(20_000) }); }
  catch (error) { return attemptFailed(`fetch: ${errorText(error)}`); }
  if (!image.ok) { await image.body?.cancel().catch(() => undefined); return attemptFailed(`HTTP ${image.status}`); }
  const contentType = image.headers.get('Content-Type')?.split(';')[0] ?? '';
  if (!['image/jpeg', 'image/png'].includes(contentType)) {
    await image.body?.cancel().catch(() => undefined);
    return attemptFailed(`content type ${contentType || 'missing'}`);
  }
  let bytes: Uint8Array<ArrayBuffer>;
  try { bytes = await readBounded(image, MAX_IMAGE_BYTES); }
  catch (error) { return attemptFailed(`body: ${errorText(error)}`); }
  await db.prepare('UPDATE ai_render_jobs SET delivered_at = ? WHERE subject = ? AND id = ? AND delivered_at IS NULL')
    .bind(Date.now(), job.subject, job.id).run();
  return { ok: true, bytes, contentType };
}
export function publicRender(job: RenderJob) {
  return { id: job.id, status: job.status, style: job.style, charged: job.charge, error: job.error, watermark: job.watermark === 1 };
}
