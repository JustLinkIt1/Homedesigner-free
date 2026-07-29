import { createRemoteJWKSet, jwtVerify } from 'jose';
import { fal } from '@fal-ai/client';

interface Env {
  USER_DATA: R2Bucket;
  MODEL_ASSETS: R2Bucket;
  GOOGLE_WEB_CLIENT_ID: string;
  REVENUECAT_PROJECT_ID: string;
  REVENUECAT_SECRET_KEY: string;
  FAL_KEY: string;
  MODEL_ADMIN_EMAIL: string;
  MODEL_ADMIN_SUBJECT?: string;
  MODEL_CATALOG_PUBLIC_BASE: string;
  USER_READ_LIMITER: RateLimit;
  USER_WRITE_LIMITER: RateLimit;
}

interface AuthIdentity {
  subject: string;
  email: string | null;
  emailVerified: boolean;
}

interface ProjectRecord {
  id: string;
  name: string;
  updatedAt: number;
  thumbnail?: string;
  snapshot: unknown;
}

interface Tombstone {
  id: string;
  updatedAt: number;
}

const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const allowedOrigins = new Set([
  'https://localhost',
  'capacitor://localhost',
  'https://homedesignerapp.com',
  'https://www.homedesignerapp.com',
  'https://justlinkit1.github.io',
]);

function cors(request: Request): HeadersInit {
  const origin = request.headers.get('Origin') ?? '';
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    Vary: 'Origin',
  };
  if (allowedOrigins.has(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function json(request: Request, body: unknown, status = 200, extraHeaders: HeadersInit = {}): Response {
  const headers = new Headers(cors(request));
  new Headers(extraHeaders).forEach((value, name) => headers.set(name, value));
  return Response.json(body, { status, headers });
}

async function authenticate(request: Request, env: Env): Promise<AuthIdentity> {
  const header = request.headers.get('Authorization') ?? '';
  if (!header.startsWith('Bearer ')) throw new Error('Unauthorized');
  const { payload } = await jwtVerify(header.slice(7), googleKeys, {
    audience: env.GOOGLE_WEB_CLIENT_ID,
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
  });
  if (!payload.sub) throw new Error('Unauthorized');
  return {
    subject: payload.sub,
    email: typeof payload.email === 'string' ? payload.email : null,
    emailVerified: payload.email_verified === true,
  };
}

function requireModelAdmin(identity: AuthIdentity, env: Env): void {
  const expectedEmail = env.MODEL_ADMIN_EMAIL?.trim().toLowerCase();
  const expectedSubject = env.MODEL_ADMIN_SUBJECT?.trim();
  if (
    !identity.emailVerified ||
    !expectedEmail ||
    identity.email?.toLowerCase() !== expectedEmail ||
    (expectedSubject && identity.subject !== expectedSubject)
  ) {
    throw new Error('Forbidden');
  }
}

function validId(id: unknown): id is string {
  return typeof id === 'string' && /^[a-zA-Z0-9_-]{6,100}$/.test(id);
}

function validTime(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isProject(value: unknown): value is ProjectRecord {
  if (!value || typeof value !== 'object') return false;
  const p = value as Partial<ProjectRecord>;
  return validId(p.id) && typeof p.name === 'string' && p.name.length <= 200 &&
    validTime(p.updatedAt) && p.snapshot !== undefined &&
    (p.thumbnail === undefined || (typeof p.thumbnail === 'string' && p.thumbnail.length <= 150_000));
}

function isTombstone(value: unknown): value is Tombstone {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<Tombstone>;
  return validId(item.id) && validTime(item.updatedAt);
}

async function readJson<T>(bucket: R2Bucket, key: string): Promise<T | null> {
  const object = await bucket.get(key);
  return object ? object.json<T>() : null;
}

async function listAll(bucket: R2Bucket, prefix: string): Promise<R2Object[]> {
  const objects: R2Object[] = [];
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix, cursor, limit: 1000 });
    objects.push(...page.objects);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor && objects.length < 1250);
  return objects;
}

async function sync(request: Request, env: Env, subject: string): Promise<Response> {
  const length = Number(request.headers.get('Content-Length') ?? 0);
  if (length > 12_000_000) return json(request, { error: 'Payload too large' }, 413);
  const text = await request.text();
  if (text.length > 12_000_000) return json(request, { error: 'Payload too large' }, 413);
  const input = JSON.parse(text) as { projects?: unknown[]; tombstones?: unknown[] };
  const projects = (input.projects ?? []).filter(isProject).slice(0, 250);
  const tombstones = (input.tombstones ?? []).filter(isTombstone).slice(0, 250);
  const prefix = `users/${subject}/`;

  for (const project of projects) {
    const projectKey = `${prefix}projects/${project.id}.json`;
    const deletedKey = `${prefix}deleted/${project.id}.json`;
    const [stored, deleted] = await Promise.all([
      readJson<ProjectRecord>(env.USER_DATA, projectKey),
      readJson<Tombstone>(env.USER_DATA, deletedKey),
    ]);
    if ((!stored || project.updatedAt > stored.updatedAt) && (!deleted || project.updatedAt > deleted.updatedAt)) {
      await env.USER_DATA.put(projectKey, JSON.stringify(project), { httpMetadata: { contentType: 'application/json' } });
      if (deleted) await env.USER_DATA.delete(deletedKey);
    }
  }

  for (const deleted of tombstones) {
    const projectKey = `${prefix}projects/${deleted.id}.json`;
    const deletedKey = `${prefix}deleted/${deleted.id}.json`;
    const [stored, storedDeletion] = await Promise.all([
      readJson<ProjectRecord>(env.USER_DATA, projectKey),
      readJson<Tombstone>(env.USER_DATA, deletedKey),
    ]);
    if ((!storedDeletion || deleted.updatedAt > storedDeletion.updatedAt) && (!stored || deleted.updatedAt >= stored.updatedAt)) {
      await env.USER_DATA.put(deletedKey, JSON.stringify(deleted), { httpMetadata: { contentType: 'application/json' } });
      if (stored) await env.USER_DATA.delete(projectKey);
    }
  }

  const [projectObjects, deletionObjects] = await Promise.all([
    listAll(env.USER_DATA, `${prefix}projects/`),
    listAll(env.USER_DATA, `${prefix}deleted/`),
  ]);
  const mergedProjects = (await Promise.all(projectObjects.map((item) => readJson<ProjectRecord>(env.USER_DATA, item.key))))
    .filter((item): item is ProjectRecord => item !== null);
  const mergedTombstones = (await Promise.all(deletionObjects.map((item) => readJson<Tombstone>(env.USER_DATA, item.key))))
    .filter((item): item is Tombstone => item !== null);
  return json(request, { projects: mergedProjects, tombstones: mergedTombstones });
}

interface RevenueCatActiveEntitlements {
  items?: Array<{
    entitlement_id?: string;
    expires_at?: number | null;
  }>;
}

type FalEndpoint =
  | 'fal-ai/florence-2-large/more-detailed-caption'
  | 'fal-ai/hunyuan-3d/v3.1/pro/text-to-3d'
  | 'fal-ai/hunyuan-3d/v3.1/rapid/text-to-3d';

type StudioGeneratorId = 'hunyuan-v3.1-pro' | 'hunyuan-v3.1-rapid';

const STUDIO_GENERATOR_ENDPOINTS: Record<StudioGeneratorId, Exclude<FalEndpoint, 'fal-ai/florence-2-large/more-detailed-caption'>> = {
  'hunyuan-v3.1-pro': 'fal-ai/hunyuan-3d/v3.1/pro/text-to-3d',
  'hunyuan-v3.1-rapid': 'fal-ai/hunyuan-3d/v3.1/rapid/text-to-3d',
};

function isStudioGenerationEndpoint(
  value: FalEndpoint | undefined,
): value is Exclude<FalEndpoint, 'fal-ai/florence-2-large/more-detailed-caption'> {
  return value === STUDIO_GENERATOR_ENDPOINTS['hunyuan-v3.1-pro'] ||
    value === STUDIO_GENERATOR_ENDPOINTS['hunyuan-v3.1-rapid'];
}

interface FalTask {
  endpoint: FalEndpoint;
  requestId: string;
  status: 'queued' | 'running' | 'complete' | 'failed';
  error?: string;
}

interface StagedModel {
  key: string;
  bytes: number;
  sha256: string;
  optimized: boolean;
  sourceRequestId?: string;
  thumbnailUrl?: string;
}

interface ModelStudioJob {
  version: 1;
  id: string;
  ownerSubject: string;
  createdAt: number;
  updatedAt: number;
  prompt: string;
  source?: {
    key: string;
    mime: string;
    bytes: number;
    falUrl: string;
  };
  captionTask?: FalTask;
  caption?: string;
  generationTask?: FalTask;
  generatedModel?: StagedModel;
  stagedModel?: StagedModel;
  renderModel?: StagedModel;
  published?: {
    type: string;
    modelKey: string;
    renderModelKey?: string;
    publishedAt: number;
  };
}

const JOB_PREFIX = 'admin/model-studio/jobs/';
const SOURCE_PREFIX = 'admin/model-studio/sources/';
const STAGING_PREFIX = 'staging/generated/';
const MAX_REFERENCE_BYTES = 8 * 1024 * 1024;
const MAX_MODEL_BYTES = 75 * 1024 * 1024;
const allowedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const allowedShapes = new Set([
  'box', 'sofa', 'bed', 'chair', 'table', 'lamp', 'led_strip', 'cove_light',
  'sconce', 'spotlight', 'plant', 'rug', 'tv', 'fridge', 'toilet', 'bathtub',
  'bookshelf', 'pendant', 'ceiling_light', 'mirror', 'curtains', 'stove', 'sink',
  'cabinets', 'counter', 'dishwasher', 'washer', 'shower', 'vanity', 'stairs',
  'ottoman', 'side_table', 'crib', 'monitor', 'desk_lamp', 'wall_art', 'stool',
  'tree', 'hedge', 'parasol', 'lounger', 'bbq',
]);

function jobKey(id: string): string {
  return `${JOB_PREFIX}${id}.json`;
}

function publicAssetUrl(env: Env, key: string): string {
  return `${env.MODEL_CATALOG_PUBLIC_BASE.replace(/\/$/, '')}/${key}`;
}

async function writeModelJob(env: Env, job: ModelStudioJob): Promise<void> {
  job.updatedAt = Date.now();
  await env.USER_DATA.put(jobKey(job.id), JSON.stringify(job), {
    httpMetadata: { contentType: 'application/json' },
  });
}

async function readModelJob(env: Env, id: string, subject: string): Promise<ModelStudioJob | null> {
  if (!/^[a-f0-9-]{36}$/.test(id)) return null;
  const job = await readJson<ModelStudioJob>(env.USER_DATA, jobKey(id));
  return job?.ownerSubject === subject ? job : null;
}

function clientModelJob(request: Request, env: Env, job: ModelStudioJob) {
  const base = new URL(request.url);
  const sourceUrl = job.source
    ? `${base.origin}/v1/admin/models/jobs/${job.id}/source`
    : undefined;
  const activeModel = job.stagedModel ?? job.generatedModel;
  return {
    id: job.id,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    prompt: job.prompt,
    caption: job.caption,
    sourceUrl,
    captionTask: job.captionTask ? { status: job.captionTask.status } : undefined,
    generationTask: job.generationTask ? {
      status: job.generationTask.status,
      endpoint: job.generationTask.endpoint,
      requestId: job.generationTask.requestId,
      error: job.generationTask.error,
    } : undefined,
    model: activeModel ? {
      url: publicAssetUrl(env, activeModel.key),
      bytes: activeModel.bytes,
      sha256: activeModel.sha256,
      optimized: activeModel.optimized,
      thumbnailUrl: activeModel.thumbnailUrl,
    } : undefined,
    renderModel: job.renderModel ? {
      url: publicAssetUrl(env, job.renderModel.key),
      bytes: job.renderModel.bytes,
      sha256: job.renderModel.sha256,
      optimized: job.renderModel.optimized,
    } : undefined,
    published: job.published,
  };
}

function configureFal(env: Env): void {
  if (!env.FAL_KEY?.trim()) throw new Error('Model generation is not configured');
  fal.config({ credentials: env.FAL_KEY });
}

async function submitFal(endpoint: FalEndpoint, input: Record<string, unknown>): Promise<FalTask> {
  let submitted: { request_id: string };
  if (endpoint === 'fal-ai/florence-2-large/more-detailed-caption') {
    submitted = await fal.queue.submit(endpoint, {
      input: { image_url: String(input.image_url ?? '') },
    });
  } else if (endpoint === 'fal-ai/hunyuan-3d/v3.1/pro/text-to-3d') {
    submitted = await fal.queue.submit(endpoint, {
      input: {
        prompt: String(input.prompt ?? ''),
        // Normal is the textured mode. Geometry is intentionally unavailable.
        generate_type: 'Normal',
        enable_pbr: input.enable_pbr === true,
        face_count: Number(input.face_count ?? 40_000),
      },
    });
  } else {
    submitted = await fal.queue.submit(endpoint, {
      input: {
        prompt: String(input.prompt ?? ''),
        enable_pbr: input.enable_pbr === true,
        // Rapid calls its untextured mode enable_geometry; keep it hard-disabled.
        enable_geometry: false,
      },
    });
  }
  return { endpoint, requestId: submitted.request_id, status: 'queued' };
}

async function falTaskStatus(task: FalTask): Promise<'queued' | 'running' | 'complete' | 'failed'> {
  const status = await fal.queue.status(task.endpoint, { requestId: task.requestId, logs: false });
  if (status.status === 'COMPLETED') return 'complete';
  if (status.status === 'IN_PROGRESS') return 'running';
  if (status.status === 'IN_QUEUE') return 'queued';
  return 'failed';
}

async function sha256(bytes: ArrayBuffer): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...digest].map((value) => value.toString(16).padStart(2, '0')).join('');
}

async function downloadGeneratedModel(
  env: Env,
  job: ModelStudioJob,
  modelUrl: string,
  thumbnailUrl?: string,
): Promise<StagedModel> {
  const response = await fetch(modelUrl, { redirect: 'follow' });
  if (!response.ok) throw new Error(`Generated model download failed (${response.status})`);
  const declared = Number(response.headers.get('Content-Length') ?? 0);
  if (declared > MAX_MODEL_BYTES) throw new Error('Generated model is too large');
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength < 20 || bytes.byteLength > MAX_MODEL_BYTES) throw new Error('Generated model is invalid');
  const magic = new Uint8Array(bytes, 0, 4);
  if (String.fromCharCode(...magic) !== 'glTF') throw new Error('Generated file is not a binary glTF');
  const hash = await sha256(bytes);
  const key = `${STAGING_PREFIX}${job.id}/${hash.slice(0, 16)}.glb`;
  await env.MODEL_ASSETS.put(key, bytes, {
    httpMetadata: {
      contentType: 'model/gltf-binary',
      cacheControl: 'public, max-age=300',
    },
  });
  return {
    key,
    bytes: bytes.byteLength,
    sha256: hash,
    optimized: false,
    sourceRequestId: job.generationTask?.requestId,
    thumbnailUrl,
  };
}

async function refreshModelJob(env: Env, job: ModelStudioJob): Promise<ModelStudioJob> {
  configureFal(env);
  let changed = false;
  if (job.captionTask && !['complete', 'failed'].includes(job.captionTask.status)) {
    try {
      const status = await falTaskStatus(job.captionTask);
      job.captionTask.status = status;
      if (status === 'complete') {
        const result = await fal.queue.result(job.captionTask.endpoint, { requestId: job.captionTask.requestId });
        const caption = (result.data as { results?: unknown }).results;
        if (typeof caption === 'string') {
          job.caption = caption.trim().slice(0, 2000);
          if (!job.prompt) job.prompt = job.caption.slice(0, 1024);
        }
      }
      changed = true;
    } catch {
      job.captionTask.status = 'failed';
      job.captionTask.error = 'Caption generation failed';
      changed = true;
    }
  }
  if (job.generationTask && !['complete', 'failed'].includes(job.generationTask.status)) {
    try {
      const status = await falTaskStatus(job.generationTask);
      job.generationTask.status = status;
      if (status === 'complete') {
        const result = await fal.queue.result(job.generationTask.endpoint, {
          requestId: job.generationTask.requestId,
        });
        const data = result.data as {
          model_glb?: { url?: unknown };
          model_urls?: { glb?: { url?: unknown } };
          thumbnail?: { url?: unknown };
        };
        const modelUrl = data.model_glb?.url ?? data.model_urls?.glb?.url;
        if (typeof modelUrl !== 'string' || !modelUrl.startsWith('https://')) {
          throw new Error('Fal returned no GLB');
        }
        const thumbnailUrl = typeof data.thumbnail?.url === 'string' ? data.thumbnail.url : undefined;
        job.generatedModel = await downloadGeneratedModel(env, job, modelUrl, thumbnailUrl);
      }
      changed = true;
    } catch {
      job.generationTask.status = 'failed';
      job.generationTask.error = '3D generation failed';
      changed = true;
    }
  }
  if (changed) await writeModelJob(env, job);
  return job;
}

async function createModelJob(request: Request, env: Env, identity: AuthIdentity): Promise<Response> {
  const declared = Number(request.headers.get('Content-Length') ?? 0);
  if (declared > MAX_REFERENCE_BYTES + 200_000) return json(request, { error: 'Reference image is too large' }, 413);
  const form = await request.formData();
  const image = form.get('image');
  const promptValue = form.get('prompt');
  const prompt = typeof promptValue === 'string' ? promptValue.trim().slice(0, 1024) : '';
  if (!(image instanceof File) && !prompt) return json(request, { error: 'Add a prompt or reference image' }, 400);
  if (image instanceof File && (!allowedImageTypes.has(image.type) || image.size > MAX_REFERENCE_BYTES)) {
    return json(request, { error: 'Reference must be a JPG, PNG or WebP under 8 MB' }, 400);
  }

  configureFal(env);
  const now = Date.now();
  const id = crypto.randomUUID();
  const job: ModelStudioJob = {
    version: 1,
    id,
    ownerSubject: identity.subject,
    createdAt: now,
    updatedAt: now,
    prompt,
  };
  if (image instanceof File) {
    const key = `${SOURCE_PREFIX}${id}/${image.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100) || 'reference'}`;
    const [falUrl] = await Promise.all([
      fal.storage.upload(image),
      env.USER_DATA.put(key, image.stream(), {
        httpMetadata: { contentType: image.type, cacheControl: 'private, no-store' },
      }),
    ]);
    job.source = { key, mime: image.type, bytes: image.size, falUrl };
    job.captionTask = await submitFal('fal-ai/florence-2-large/more-detailed-caption', { image_url: falUrl });
  }
  await writeModelJob(env, job);
  return json(request, { job: clientModelJob(request, env, job) }, 201);
}

async function listModelJobs(request: Request, env: Env, identity: AuthIdentity): Promise<Response> {
  const objects = (await listAll(env.USER_DATA, JOB_PREFIX))
    .sort((left, right) => right.uploaded.getTime() - left.uploaded.getTime())
    .slice(0, 40);
  const records = await Promise.all(objects.map((object) => readJson<ModelStudioJob>(env.USER_DATA, object.key)));
  const jobs = records
    .filter((job): job is ModelStudioJob => !!job && job.ownerSubject === identity.subject)
    .map((job) => clientModelJob(request, env, job));
  return json(request, { jobs });
}

async function serveModelSource(request: Request, env: Env, job: ModelStudioJob): Promise<Response> {
  if (!job.source) return json(request, { error: 'No reference image' }, 404);
  const source = await env.USER_DATA.get(job.source.key);
  if (!source) return json(request, { error: 'Reference image is unavailable' }, 404);
  return new Response(source.body, {
    headers: {
      ...cors(request),
      'Content-Type': job.source.mime,
      'Cache-Control': 'private, no-store',
    },
  });
}

async function startModelGeneration(
  request: Request,
  env: Env,
  job: ModelStudioJob,
): Promise<Response> {
  const body = await request.json() as { prompt?: unknown; enablePbr?: unknown; generator?: unknown };
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (prompt.length < 10 || prompt.length > 1024) {
    return json(request, { error: 'Prompt must be 10-1024 characters' }, 400);
  }
  if (job.generationTask && !['complete', 'failed'].includes(job.generationTask.status)) {
    return json(request, { error: 'A generation is already running' }, 409);
  }
  const generator = typeof body.generator === 'string' && Object.hasOwn(STUDIO_GENERATOR_ENDPOINTS, body.generator)
    ? body.generator as StudioGeneratorId
    : null;
  if (!generator) return json(request, { error: 'Choose a supported textured generation model' }, 400);
  if (generator === 'hunyuan-v3.1-rapid' && prompt.length > 200) {
    return json(request, { error: 'Hunyuan Rapid prompts are limited to 200 characters' }, 400);
  }
  configureFal(env);
  job.prompt = prompt;
  job.generationTask = await submitFal(STUDIO_GENERATOR_ENDPOINTS[generator], {
    prompt,
    generate_type: 'Normal',
    enable_pbr: body.enablePbr === true,
    // The custom 40k target costs more than the default but avoids delivering
    // a 500k-face model that is unsuitable for an Android furniture scene.
    face_count: 40_000,
  });
  await writeModelJob(env, job);
  return json(request, { job: clientModelJob(request, env, job) }, 202);
}

async function uploadOptimizedModel(request: Request, env: Env, job: ModelStudioJob): Promise<Response> {
  const declared = Number(request.headers.get('Content-Length') ?? 0);
  if (declared > MAX_MODEL_BYTES * 2 + 200_000) return json(request, { error: 'Model package is too large' }, 413);
  const form = await request.formData();
  const model = form.get('model');
  const renderModel = form.get('renderModel');
  if (
    !(model instanceof File) || model.size < 20 || model.size > MAX_MODEL_BYTES ||
    !(renderModel instanceof File) || renderModel.size < 20 || renderModel.size > MAX_MODEL_BYTES
  ) {
    return json(request, { error: 'Upload mobile and render GLBs under 75 MB each' }, 400);
  }
  const [modelBytes, renderBytes] = await Promise.all([model.arrayBuffer(), renderModel.arrayBuffer()]);
  if (
    String.fromCharCode(...new Uint8Array(modelBytes, 0, 4)) !== 'glTF' ||
    String.fromCharCode(...new Uint8Array(renderBytes, 0, 4)) !== 'glTF'
  ) {
    return json(request, { error: 'Files must be binary glTF models' }, 400);
  }
  const [hash, renderHash] = await Promise.all([sha256(modelBytes), sha256(renderBytes)]);
  const key = `${STAGING_PREFIX}${job.id}/${hash.slice(0, 16)}.glb`;
  const renderKey = `${STAGING_PREFIX}${job.id}/${renderHash.slice(0, 16)}.render.glb`;
  await Promise.all([
    env.MODEL_ASSETS.put(key, modelBytes, {
      httpMetadata: { contentType: 'model/gltf-binary', cacheControl: 'public, max-age=300' },
    }),
    env.MODEL_ASSETS.put(renderKey, renderBytes, {
      httpMetadata: { contentType: 'model/gltf-binary', cacheControl: 'public, max-age=300' },
    }),
  ]);
  if (job.stagedModel && job.stagedModel.key !== key) await env.MODEL_ASSETS.delete(job.stagedModel.key);
  if (job.renderModel && job.renderModel.key !== renderKey) await env.MODEL_ASSETS.delete(job.renderModel.key);
  job.stagedModel = {
    key,
    bytes: modelBytes.byteLength,
    sha256: hash,
    optimized: true,
    sourceRequestId: job.generationTask?.requestId,
    thumbnailUrl: job.generatedModel?.thumbnailUrl,
  };
  job.renderModel = {
    key: renderKey,
    bytes: renderBytes.byteLength,
    sha256: renderHash,
    optimized: true,
    sourceRequestId: job.generationTask?.requestId,
    thumbnailUrl: job.generatedModel?.thumbnailUrl,
  };
  await writeModelJob(env, job);
  return json(request, { job: clientModelJob(request, env, job) });
}

interface CatalogManifest {
  version: 1;
  entries: Record<string, unknown>[];
  overrides?: Record<string, unknown>[];
}

function cleanString(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const clean = value.trim();
  return clean && clean.length <= max ? clean : null;
}

function cleanPositive(value: unknown, max = 2000): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= max ? value : null;
}

async function publishModel(request: Request, env: Env, job: ModelStudioJob): Promise<Response> {
  if (!job.stagedModel?.optimized || !job.renderModel?.optimized) {
    return json(request, { error: 'Optimize and upload both delivery tiers before publishing' }, 409);
  }
  const generationEndpoint = job.generationTask?.endpoint;
  if (!isStudioGenerationEndpoint(generationEndpoint)) {
    return json(request, { error: 'The model has no supported generation provenance' }, 409);
  }
  const body = await request.json() as Record<string, unknown>;
  const type = cleanString(body.type, 80);
  const name = cleanString(body.name, 100);
  const category = cleanString(body.category, 50);
  const shape = cleanString(body.shape, 40);
  const color = cleanString(body.color, 20);
  const width = cleanPositive(body.width);
  const depth = cleanPositive(body.depth);
  const height = cleanPositive(body.height);
  const mode = body.mode === 'override' ? 'override' : 'entry';
  if (
    !type || !/^[a-z0-9][a-z0-9_-]*$/.test(type) || !name || !category ||
    !shape || !allowedShapes.has(shape) || !color || !/^#[a-f0-9]{6}$/i.test(color) ||
    !width || !depth || !height || body.rightsConfirmed !== true
  ) {
    return json(request, { error: 'Complete valid metadata and confirm reference rights' }, 400);
  }

  const [staged, stagedRender] = await Promise.all([
    env.MODEL_ASSETS.get(job.stagedModel.key),
    env.MODEL_ASSETS.get(job.renderModel.key),
  ]);
  if (!staged || !stagedRender) return json(request, { error: 'Staged model package is unavailable' }, 409);
  const finalKey = `models/generated/${type}/${job.stagedModel.sha256.slice(0, 16)}.glb`;
  const finalRenderKey = `models/generated/${type}/${job.renderModel.sha256.slice(0, 16)}.render.glb`;
  await Promise.all([
    env.MODEL_ASSETS.put(finalKey, staged.body, {
      httpMetadata: {
        contentType: 'model/gltf-binary',
        cacheControl: 'public, max-age=31536000, immutable',
      },
    }),
    env.MODEL_ASSETS.put(finalRenderKey, stagedRender.body, {
      httpMetadata: {
        contentType: 'model/gltf-binary',
        cacheControl: 'public, max-age=31536000, immutable',
      },
    }),
  ]);

  const manifestObject = await env.MODEL_ASSETS.get('catalog/v1/catalog.json');
  if (!manifestObject) return json(request, { error: 'Live catalogue manifest is unavailable' }, 503);
  const manifest = await manifestObject.json<CatalogManifest>();
  if (manifest.version !== 1 || !Array.isArray(manifest.entries)) {
    return json(request, { error: 'Live catalogue manifest is invalid' }, 503);
  }
  manifest.overrides ??= [];
  manifest.entries = manifest.entries.filter((entry) => entry.type !== type);
  manifest.overrides = manifest.overrides.filter((entry) => entry.type !== type);
  const model = {
    url: publicAssetUrl(env, finalKey),
    fit: body.fit === 'width' || body.fit === 'depth' || body.fit === 'stretch' ? body.fit : 'contain',
    yaw: typeof body.yaw === 'number' && Number.isFinite(body.yaw) ? body.yaw : 0,
    bytes: job.stagedModel.bytes,
    sha256: job.stagedModel.sha256,
    renderUrl: publicAssetUrl(env, finalRenderKey),
    renderBytes: job.renderModel.bytes,
    renderSha256: job.renderModel.sha256,
    source: {
      name: 'HomeDesigner AI-generated asset',
      url: `https://fal.ai/models/${generationEndpoint}`,
      author: 'HomeDesigner Model Studio',
      license: 'AI-generated',
      provider: 'fal.ai',
      model: generationEndpoint,
    },
  };
  if (mode === 'override') {
    manifest.overrides.push({ type, model });
  } else {
    manifest.entries.push({
      type, name, category, width, depth, height, color, shape,
      icon: cleanString(body.icon, 12) ?? '▣',
      pro: body.pro !== false,
      model,
    });
  }
  await env.MODEL_ASSETS.put('catalog/v1/catalog.json', JSON.stringify(manifest, null, 2), {
    httpMetadata: { contentType: 'application/json', cacheControl: 'public, max-age=60' },
  });
  job.published = { type, modelKey: finalKey, renderModelKey: finalRenderKey, publishedAt: Date.now() };
  await writeModelJob(env, job);
  return json(request, { job: clientModelJob(request, env, job), modelUrl: publicAssetUrl(env, finalKey) });
}

async function entitlement(request: Request, env: Env, subject: string): Promise<Response> {
  const appUserId = `google:${subject}`;
  const response = await fetch(
    `https://api.revenuecat.com/v2/projects/${encodeURIComponent(env.REVENUECAT_PROJECT_ID)}` +
      `/customers/${encodeURIComponent(appUserId)}/active_entitlements`,
    {
      headers: {
        Authorization: `Bearer ${env.REVENUECAT_SECRET_KEY}`,
        Accept: 'application/json',
      },
    },
  );
  // A Google account that has never been linked is a normal free customer.
  if (response.status === 404) return json(request, { isPro: false });
  if (!response.ok) return json(request, { error: 'Entitlement lookup failed' }, 502);
  const result = await response.json() as RevenueCatActiveEntitlements;
  const now = Date.now();
  const isPro = (result.items ?? []).some((item) =>
    item.entitlement_id === 'Pro' &&
    (item.expires_at === null || (typeof item.expires_at === 'number' && item.expires_at > now)));
  return json(request, { isPro });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(request) });
    const url = new URL(request.url);
    try {
      const identity = await authenticate(request, env);
      const limiter = request.method === 'GET' ? env.USER_READ_LIMITER : env.USER_WRITE_LIMITER;
      const { success } = await limiter.limit({ key: `${identity.subject}:${request.method}:${url.pathname}` });
      if (!success) {
        return json(request, { error: 'Too many requests' }, 429, { 'Retry-After': '60' });
      }
      if (request.method === 'GET' && url.pathname === '/v1/entitlement') {
        return await entitlement(request, env, identity.subject);
      }
      if (request.method === 'POST' && url.pathname === '/v1/sync') return await sync(request, env, identity.subject);
      if (request.method === 'DELETE' && url.pathname === '/v1/account') {
        const objects = await listAll(env.USER_DATA, `users/${identity.subject}/`);
        for (let i = 0; i < objects.length; i += 1000) {
          await env.USER_DATA.delete(objects.slice(i, i + 1000).map((item) => item.key));
        }
        return json(request, { deleted: objects.length });
      }

      if (url.pathname.startsWith('/v1/admin/models')) {
        requireModelAdmin(identity, env);
        if (request.method === 'GET' && url.pathname === '/v1/admin/models/jobs') {
          return await listModelJobs(request, env, identity);
        }
        if (request.method === 'POST' && url.pathname === '/v1/admin/models/jobs') {
          return await createModelJob(request, env, identity);
        }
        const match = url.pathname.match(/^\/v1\/admin\/models\/jobs\/([a-f0-9-]{36})(?:\/(source|generate|optimized|publish))?$/);
        if (match) {
          const job = await readModelJob(env, match[1], identity.subject);
          if (!job) return json(request, { error: 'Model job not found' }, 404);
          const action = match[2];
          if (request.method === 'GET' && !action) {
            const refreshed = await refreshModelJob(env, job);
            return json(request, { job: clientModelJob(request, env, refreshed) });
          }
          if (request.method === 'GET' && action === 'source') return await serveModelSource(request, env, job);
          if (request.method === 'POST' && action === 'generate') {
            return await startModelGeneration(request, env, job);
          }
          if (request.method === 'POST' && action === 'optimized') {
            return await uploadOptimizedModel(request, env, job);
          }
          if (request.method === 'POST' && action === 'publish') {
            return await publishModel(request, env, job);
          }
        }
      }
      return json(request, { error: 'Not found' }, 404);
    } catch (error) {
      const unauthorized = error instanceof Error && /JWT|Unauthorized|signature|claim/i.test(error.message);
      const forbidden = error instanceof Error && error.message === 'Forbidden';
      return json(
        request,
        { error: unauthorized ? 'Unauthorized' : forbidden ? 'Forbidden' : 'Request failed' },
        unauthorized ? 401 : forbidden ? 403 : 400,
      );
    }
  },
} satisfies ExportedHandler<Env>;
