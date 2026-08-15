import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT } from 'jose';
import { fal } from '@fal-ai/client';

import {
  CommunityError, listThreads, readThread, readProfile, readMe, updateMe,
  createThread, createPost, editPost, reportPost, moderate, listReports, erasePerson,
  uploadCommunityImage, removeAvatar, readCommunityImage,
} from './community';

interface Env {
  USER_DATA: R2Bucket;
  MODEL_ASSETS: R2Bucket;
  GOOGLE_WEB_CLIENT_ID: string;
  REVENUECAT_PROJECT_ID: string;
  REVENUECAT_SECRET_KEY: string;
  /** JSON key for a Play Console service account with order/purchase access. */
  GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: string;
  FAL_KEY: string;
  /** Workers AI, used only by the Model Studio metadata assistant. */
  AI: Ai;
  MODEL_ADMIN_EMAIL: string;
  MODEL_ADMIN_SUBJECT?: string;
  MODEL_CATALOG_PUBLIC_BASE: string;
  USER_READ_LIMITER: RateLimit;
  USER_WRITE_LIMITER: RateLimit;
  /** Forum storage. D1, not R2 — see migrations/0001_community.sql. */
  COMMUNITY: D1Database;
  /** Bootstrap forum moderator, by verified Google email. */
  COMMUNITY_ADMIN_EMAIL: string;
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

const PLAY_PACKAGE_NAME = 'com.homedesigner.app';
const PLAY_PRO_PRODUCTS = new Set(['pro_lifetime']);
const PLAY_VERIFY_CACHE_MS = 6 * 60 * 60 * 1000;

interface PlayServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

interface PlayProductPurchaseV2 {
  productLineItem?: Array<{ productId?: string }>;
  purchaseStateContext?: { purchaseState?: string };
  orderId?: string;
  purchaseCompletionTime?: string;
  acknowledgementState?: string;
}

interface StoredPlayPurchase {
  purchase_token: string;
  product_id: string;
  account_subject: string | null;
  status: 'active' | 'revoked';
  last_verified_at: number;
}

let playAccessToken: { value: string; expiresAt: number } | null = null;

function validPurchaseToken(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 20 && value.length <= 4096
    && /^[A-Za-z0-9._:-]+$/.test(value);
}

async function getPlayAccessToken(env: Env): Promise<string> {
  if (playAccessToken && playAccessToken.expiresAt > Date.now() + 60_000) {
    return playAccessToken.value;
  }
  let service: PlayServiceAccount;
  try {
    service = JSON.parse(env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON) as PlayServiceAccount;
  } catch {
    throw new Error('Play verification credentials are not configured');
  }
  if (!service.client_email || !service.private_key) {
    throw new Error('Play verification credentials are incomplete');
  }
  const tokenUri = service.token_uri || 'https://oauth2.googleapis.com/token';
  const now = Math.floor(Date.now() / 1000);
  const key = await importPKCS8(service.private_key, 'RS256');
  const assertion = await new SignJWT({
    scope: 'https://www.googleapis.com/auth/androidpublisher',
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(service.client_email)
    .setAudience(tokenUri)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);
  const response = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!response.ok) throw new Error('Google rejected the Play service account');
  const result = await response.json() as { access_token?: string; expires_in?: number };
  if (!result.access_token) throw new Error('Google returned no Play access token');
  playAccessToken = {
    value: result.access_token,
    expiresAt: Date.now() + Math.max(60, result.expires_in ?? 3600) * 1000,
  };
  return result.access_token;
}

async function acknowledgePlayPurchase(
  env: Env,
  accessToken: string,
  productId: string,
  purchaseToken: string,
): Promise<void> {
  const response = await fetch(
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PLAY_PACKAGE_NAME}` +
      `/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    },
  );
  if (!response.ok) throw new Error(`Google Play acknowledgement failed (${response.status})`);
}

async function verifyPlayToken(
  env: Env,
  purchaseToken: string,
): Promise<{ active: boolean; productId: string | null; orderId: string | null; purchasedAt: number | null }> {
  const accessToken = await getPlayAccessToken(env);
  const response = await fetch(
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PLAY_PACKAGE_NAME}` +
      `/purchases/productsv2/tokens/${encodeURIComponent(purchaseToken)}`,
    { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } },
  );
  // Google returns 400 for a syntactically valid but unknown/invalid receipt
  // token and 404 when no purchase exists. Neither is a backend outage.
  if (response.status === 400 || response.status === 404) {
    return { active: false, productId: null, orderId: null, purchasedAt: null };
  }
  if (!response.ok) throw new Error(`Google Play verification failed (${response.status})`);
  const purchase = await response.json() as PlayProductPurchaseV2;
  const productId = purchase.productLineItem?.map((item) => item.productId)
    .find((id): id is string => typeof id === 'string' && PLAY_PRO_PRODUCTS.has(id)) ?? null;
  const active = purchase.purchaseStateContext?.purchaseState === 'PURCHASED' && productId !== null;
  if (active && purchase.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING') {
    await acknowledgePlayPurchase(env, accessToken, productId, purchaseToken);
  }
  return {
    active,
    productId,
    orderId: purchase.orderId ?? null,
    purchasedAt: purchase.purchaseCompletionTime
      ? Date.parse(purchase.purchaseCompletionTime)
      : null,
  };
}

async function persistPlayVerification(
  env: Env,
  purchaseToken: string,
  result: Awaited<ReturnType<typeof verifyPlayToken>>,
): Promise<void> {
  const now = Date.now();
  if (result.active && result.productId) {
    await env.COMMUNITY.prepare(
      `INSERT INTO play_purchases
        (purchase_token, product_id, order_id, purchased_at, status, last_verified_at)
       VALUES (?, ?, ?, ?, 'active', ?)
       ON CONFLICT(purchase_token) DO UPDATE SET
         product_id = excluded.product_id,
         order_id = COALESCE(excluded.order_id, play_purchases.order_id),
         purchased_at = COALESCE(excluded.purchased_at, play_purchases.purchased_at),
         status = 'active',
         last_verified_at = excluded.last_verified_at`,
    ).bind(purchaseToken, result.productId, result.orderId, result.purchasedAt, now).run();
    return;
  }
  await env.COMMUNITY.prepare(
    `UPDATE play_purchases SET status = 'revoked', last_verified_at = ? WHERE purchase_token = ?`,
  ).bind(now, purchaseToken).run();
}

async function verifyAndPersistPlayPurchase(env: Env, purchaseToken: string) {
  const result = await verifyPlayToken(env, purchaseToken);
  await persistPlayVerification(env, purchaseToken, result);
  return result;
}

async function verifyPlayPurchaseRequest(request: Request, env: Env): Promise<Response> {
  const length = Number(request.headers.get('Content-Length') ?? 0);
  if (length > 8_000) return json(request, { error: 'Payload too large' }, 413);
  const body = await request.json().catch(() => ({})) as { purchaseToken?: unknown };
  if (!validPurchaseToken(body.purchaseToken)) {
    return json(request, { error: 'Invalid purchase token' }, 400);
  }
  const result = await verifyAndPersistPlayPurchase(env, body.purchaseToken);
  return json(request, { active: result.active, productId: result.productId });
}

async function linkPlayPurchaseRequest(
  request: Request,
  env: Env,
  subject: string,
): Promise<Response> {
  const body = await request.json().catch(() => ({})) as { purchaseTokens?: unknown };
  if (!Array.isArray(body.purchaseTokens) || body.purchaseTokens.length === 0 || body.purchaseTokens.length > 10
    || !body.purchaseTokens.every(validPurchaseToken)) {
    return json(request, { error: 'Invalid purchase tokens' }, 400);
  }
  let isPro = false;
  for (const purchaseToken of [...new Set(body.purchaseTokens)]) {
    const result = await verifyAndPersistPlayPurchase(env, purchaseToken);
    if (!result.active) continue;
    const linked = await env.COMMUNITY.prepare(
      `UPDATE play_purchases SET account_subject = ?, linked_at = ?
       WHERE purchase_token = ? AND (account_subject IS NULL OR account_subject = ?)`,
    ).bind(subject, Date.now(), purchaseToken, subject).run();
    if ((linked.meta.changes ?? 0) === 0) {
      return json(request, { error: 'This Play purchase is linked to another account.' }, 409);
    }
    isPro = true;
  }
  return json(request, { isPro });
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
  thumbnailKey?: string;
  thumbnailMime?: string;
  /** Legacy jobs may still hold Fal's temporary URL. New jobs copy it to R2. */
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
const MAX_THUMBNAIL_BYTES = 4 * 1024 * 1024;
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
      thumbnailUrl: activeModel.thumbnailKey
        ? publicAssetUrl(env, activeModel.thumbnailKey)
        : activeModel.thumbnailUrl,
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
  let thumbnail: { key: string; mime: string } | undefined;
  if (thumbnailUrl?.startsWith('https://')) {
    try {
      const response = await fetch(thumbnailUrl, { redirect: 'follow' });
      const mime = response.headers.get('Content-Type')?.split(';')[0] ?? '';
      const declared = Number(response.headers.get('Content-Length') ?? 0);
      if (response.ok && allowedImageTypes.has(mime) && declared <= MAX_THUMBNAIL_BYTES) {
        const thumbnailBytes = await response.arrayBuffer();
        if (thumbnailBytes.byteLength > 0 && thumbnailBytes.byteLength <= MAX_THUMBNAIL_BYTES) {
          const extension = mime === 'image/png' ? 'png' : mime === 'image/jpeg' ? 'jpg' : 'webp';
          const thumbnailKey = `${STAGING_PREFIX}${job.id}/generated-thumbnail.${extension}`;
          await env.MODEL_ASSETS.put(thumbnailKey, thumbnailBytes, {
            httpMetadata: { contentType: mime, cacheControl: 'public, max-age=300' },
          });
          thumbnail = { key: thumbnailKey, mime };
        }
      }
    } catch {
      // A missing Fal preview must not discard an otherwise valid GLB.
    }
  }
  return {
    key,
    bytes: bytes.byteLength,
    sha256: hash,
    optimized: false,
    sourceRequestId: job.generationTask?.requestId,
    thumbnailKey: thumbnail?.key,
    thumbnailMime: thumbnail?.mime,
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
    thumbnailKey: job.generatedModel?.thumbnailKey,
    thumbnailMime: job.generatedModel?.thumbnailMime,
    thumbnailUrl: job.generatedModel?.thumbnailUrl,
  };
  job.renderModel = {
    key: renderKey,
    bytes: renderBytes.byteLength,
    sha256: renderHash,
    optimized: true,
    sourceRequestId: job.generationTask?.requestId,
    thumbnailKey: job.generatedModel?.thumbnailKey,
    thumbnailMime: job.generatedModel?.thumbnailMime,
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

const allowedCatalogCategories = new Set([
  'Living', 'Bedroom', 'Dining', 'Kitchen', 'Bathroom', 'Office',
  'Lighting', 'Decor', 'Outdoor',
]);

function cleanString(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const clean = value.trim();
  return clean && clean.length <= max ? clean : null;
}

function cleanPositive(value: unknown, max = 2000): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= max ? value : null;
}

// --- catalogue metadata assistant -------------------------------------------
//
// Filling the publish card by hand is where wrong data enters the catalogue: a
// shower cubicle was landing as Living / box / 100x60x90 because the old
// client-side guess only recognised sofas, chairs and TVs. An instruct model
// knows what a shower cubicle is and how big one really is, so it fills the
// card and the owner only picks new-item vs replace-existing.
//
// Runs on Workers AI (same Cloudflare account as R2 — no extra key to manage).
// Everything it returns is re-validated here against the same allow-lists
// publishModel enforces, so a hallucinated category or a 90-metre wardrobe can
// never reach the manifest.
const METADATA_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

function metadataJsonSchema(): Record<string, unknown> {
  const str = { type: 'string' };
  const num = { type: 'number' };
  return {
    type: 'object',
    properties: {
      name: str,
      type: str,
      category: { type: 'string', enum: [...allowedCatalogCategories] },
      shape: { type: 'string', enum: [...allowedShapes] },
      width: num,
      depth: num,
      height: num,
      color: str,
      icon: str,
      placement: { type: 'string', enum: ['floor', 'surface', 'wall'] },
      mountY: num,
    },
    required: ['name', 'type', 'category', 'shape', 'width', 'depth', 'height', 'color', 'icon', 'placement'],
  };
}

/** JSON mode is best-effort on Workers AI, so accept an already-parsed object,
 *  a bare JSON string, or JSON wrapped in prose/code fences. */
function parseModelJson(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== 'string') return null;
  const start = value.indexOf('{');
  const end = value.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(value.slice(start, end + 1)) as unknown;
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function slugType(value: unknown, fallback: string): string {
  const raw = typeof value === 'string' ? value : '';
  const clean = raw.toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^[^a-z0-9]+|_+$/g, '')
    .slice(0, 60);
  return /^[a-z0-9][a-z0-9_-]*$/.test(clean) ? clean : fallback;
}

async function suggestModelMetadata(request: Request, env: Env, job: ModelStudioJob): Promise<Response> {
  if (!env.AI) return json(request, { error: 'The metadata assistant is not configured' }, 503);
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const description = cleanString(body.description, 2000) ?? job.prompt ?? job.caption ?? '';
  if (description.trim().length < 3) return json(request, { error: 'Describe the model first' }, 400);

  // The mesh is only ever a proportion hint. Real-world size has to come from
  // the model's knowledge of the object — a generated GLB carries no units.
  const raw = Array.isArray(body.dimensions) ? body.dimensions : [];
  const dims = raw.length === 3 && raw.every((v) => typeof v === 'number' && Number.isFinite(v) && v > 0)
    ? raw as number[]
    : null;
  const proportions = dims
    ? `\n\nThe generated mesh measures ${(dims[0] / Math.max(...dims)).toFixed(2)} wide : ` +
      `${(dims[1] / Math.max(...dims)).toFixed(2)} tall : ${(dims[2] / Math.max(...dims)).toFixed(2)} deep ` +
      'relative to its longest side. Use this only to sanity-check which way up and which way round the object is; ' +
      'the mesh has no real-world units, so do not scale your answer from it.'
    : '';

  const system = [
    'You fill in catalogue metadata for one 3D furniture model in a home design app. Answer with JSON only.',
    '',
    '- width, depth and height are REAL-WORLD CENTIMETRES for this kind of object in a real home: the sizes a',
    '  manufacturer would print on the box. width is left-right, depth is front-back, height is floor to top.',
    '  A shower cubicle is about 90 x 90 x 200. A floor lamp is about 35 x 35 x 160. A double bed is about 150 x 200 x 50.',
    `- category: exactly one of ${[...allowedCatalogCategories].join(', ')}.`,
    `- shape: the closest renderer primitive, exactly one of ${[...allowedShapes].join(', ')}. Use "box" only when nothing fits.`,
    '- type: lower_snake_case slug, at most 60 characters, specific to this object.',
    '- name: a short Title Case label, at most 40 characters.',
    '- color: the dominant colour as #rrggbb.',
    '- icon: a single emoji.',
    '- placement: "wall" only for things fixed to a wall (TVs, wall art, sconces, upper cabinets),',
    '  "surface" for small things that sit on other furniture (table lamps, vases, books), otherwise "floor".',
    '- mountY: centimetres above the floor when placement is "wall", otherwise 0.',
  ].join('\n');

  let parsed: Record<string, unknown> | null;
  try {
    const result = await env.AI.run(METADATA_MODEL, {
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: `Describe this model as catalogue metadata:\n\n${description.trim()}${proportions}` },
      ],
      max_tokens: 400,
      response_format: { type: 'json_schema', json_schema: metadataJsonSchema() },
    }) as { response?: unknown };
    parsed = parseModelJson(result?.response);
  } catch {
    parsed = null;
  }
  if (!parsed) return json(request, { error: 'The metadata assistant could not read this model' }, 502);

  const name = cleanString(parsed.name, 40) ?? 'Generated furniture';
  const category = cleanString(parsed.category, 50);
  const shape = cleanString(parsed.shape, 40);
  const color = cleanString(parsed.color, 20);
  const icon = cleanString(parsed.icon, 12);
  const placement = parsed.placement === 'wall' || parsed.placement === 'surface' ? parsed.placement : 'floor';
  return json(request, {
    metadata: {
      type: slugType(parsed.type, slugType(name, 'generated_furniture')),
      name,
      category: category && allowedCatalogCategories.has(category) ? category : 'Living',
      shape: shape && allowedShapes.has(shape) ? shape : 'box',
      width: cleanPositive(parsed.width) ?? 100,
      depth: cleanPositive(parsed.depth) ?? 60,
      height: cleanPositive(parsed.height) ?? 90,
      color: color && /^#[a-f0-9]{6}$/i.test(color) ? color.toLowerCase() : '#8b7b6b',
      icon: icon ?? '▣',
      placement,
      mountY: placement === 'wall' ? cleanPositive(parsed.mountY, 400) ?? 90 : 0,
    },
  });
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
  const placement = body.placement === 'surface' || body.placement === 'wall' ? body.placement : 'floor';
  const mountY = typeof body.mountY === 'number' && Number.isFinite(body.mountY) && body.mountY >= 0 && body.mountY <= 2_000
    ? body.mountY
    : 0;
  if (
    !type || !/^[a-z0-9][a-z0-9_-]*$/.test(type) || !name || !category ||
    (mode === 'entry' && !allowedCatalogCategories.has(category)) ||
    !shape || !allowedShapes.has(shape) || !color || !/^#[a-f0-9]{6}$/i.test(color) ||
    !width || !depth || !height || body.rightsConfirmed !== true
  ) {
    return json(request, { error: 'Complete valid metadata and confirm reference rights' }, 400);
  }

  const [staged, stagedRender, stagedThumbnail] = await Promise.all([
    env.MODEL_ASSETS.get(job.stagedModel.key),
    env.MODEL_ASSETS.get(job.renderModel.key),
    job.stagedModel.thumbnailKey ? env.MODEL_ASSETS.get(job.stagedModel.thumbnailKey) : null,
  ]);
  if (!staged || !stagedRender) return json(request, { error: 'Staged model package is unavailable' }, 409);
  const finalKey = `models/generated/${type}/${job.stagedModel.sha256.slice(0, 16)}.glb`;
  const finalRenderKey = `models/generated/${type}/${job.renderModel.sha256.slice(0, 16)}.render.glb`;
  const thumbnailMime = job.stagedModel.thumbnailMime;
  const thumbnailExtension = thumbnailMime === 'image/png' ? 'png' : thumbnailMime === 'image/jpeg' ? 'jpg' : 'webp';
  const finalThumbnailKey = stagedThumbnail && thumbnailMime && allowedImageTypes.has(thumbnailMime)
    ? `models/generated/${type}/${job.stagedModel.sha256.slice(0, 16)}.thumbnail.${thumbnailExtension}`
    : null;
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
    ...(finalThumbnailKey && stagedThumbnail && thumbnailMime ? [
      env.MODEL_ASSETS.put(finalThumbnailKey, stagedThumbnail.body, {
        httpMetadata: {
          contentType: thumbnailMime,
          cacheControl: 'public, max-age=31536000, immutable',
        },
      }),
    ] : []),
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
    fit: body.fit === 'width' || body.fit === 'depth' || body.fit === 'height' || body.fit === 'stretch'
      ? body.fit
      : 'contain',
    yaw: typeof body.yaw === 'number' && Number.isFinite(body.yaw) ? body.yaw : 0,
    bytes: job.stagedModel.bytes,
    sha256: job.stagedModel.sha256,
    renderUrl: publicAssetUrl(env, finalRenderKey),
    renderBytes: job.renderModel.bytes,
    renderSha256: job.renderModel.sha256,
    ...(finalThumbnailKey ? { thumbnailUrl: publicAssetUrl(env, finalThumbnailKey) } : {}),
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
      placement,
      ...(placement === 'wall' ? { mountY } : {}),
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

async function revenueCatEntitled(env: Env, subject: string): Promise<boolean> {
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
  if (response.status === 404) return false;
  if (!response.ok) throw new Error('RevenueCat entitlement lookup failed');
  const result = await response.json() as RevenueCatActiveEntitlements;
  const now = Date.now();
  return (result.items ?? []).some((item) =>
    item.entitlement_id === 'Pro' &&
    (item.expires_at === null || (typeof item.expires_at === 'number' && item.expires_at > now)));
}

async function playEntitled(env: Env, subject: string): Promise<boolean> {
  const rows = await env.COMMUNITY.prepare(
    `SELECT purchase_token, product_id, account_subject, status, last_verified_at
     FROM play_purchases WHERE account_subject = ? AND status = 'active'`,
  ).bind(subject).all<StoredPlayPurchase>();
  if (rows.results.length === 0) return false;

  // Refunds must eventually revoke a cross-platform grant. Recheck stale
  // receipts against Play, but retain the last verified grant if Google is
  // temporarily unavailable rather than locking a buyer out on an outage.
  for (const row of rows.results) {
    if (Date.now() - row.last_verified_at <= PLAY_VERIFY_CACHE_MS) return true;
    try {
      const result = await verifyAndPersistPlayPurchase(env, row.purchase_token);
      if (result.active) return true;
    } catch {
      return true;
    }
  }
  return false;
}

async function entitlement(request: Request, env: Env, subject: string): Promise<Response> {
  const play = await playEntitled(env, subject);
  if (play) return json(request, { isPro: true, source: 'google_play' });
  try {
    const web = await revenueCatEntitled(env, subject);
    return json(request, { isPro: web, source: web ? 'web_billing' : null });
  } catch {
    return json(request, { error: 'Entitlement lookup failed' }, 502);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(request) });
    const url = new URL(request.url);

    // A Play receipt must be verified and acknowledged even when the buyer has
    // not created an app account yet. The token is checked with Google before
    // any grant is returned; linking it to a person remains authenticated.
    if (request.method === 'POST' && url.pathname === '/v1/play/verify') {
      const ip = request.headers.get('CF-Connecting-IP') ?? 'anon';
      const { success } = await env.USER_WRITE_LIMITER.limit({ key: `ip:${ip}:play-verify` });
      if (!success) return json(request, { error: 'Too many requests' }, 429, { 'Retry-After': '60' });
      try {
        return await verifyPlayPurchaseRequest(request, env);
      } catch {
        return json(request, { error: 'Google Play could not verify this purchase.' }, 502);
      }
    }

    // Community reads are PUBLIC and are therefore matched before
    // authenticate(). A support forum only signed-in people can read is not a
    // support forum, and Google cannot index what it cannot fetch. Writes fall
    // through to the authenticated block below.
    if (request.method === 'GET' && url.pathname.startsWith('/v1/community/')) {
      try {
        // Anonymous readers have no subject to rate limit on, so the client IP
        // stands in. Cloudflare sets this header at the edge; a caller cannot
        // spoof it.
        const ip = request.headers.get('CF-Connecting-IP') ?? 'anon';
        const { success } = await env.USER_READ_LIMITER.limit({ key: `ip:${ip}:community` });
        if (!success) return json(request, { error: 'Too many requests' }, 429, { 'Retry-After': '60' });

        const image = url.pathname.match(/^\/v1\/community\/images\/([a-f0-9-]{36})$/);
        if (image) {
          const { object, mimeType } = await readCommunityImage(env, image[1]);
          const headers = new Headers(cors(request));
          headers.set('Content-Type', mimeType);
          headers.set('Cache-Control', 'public, max-age=31536000, immutable');
          if (object.httpEtag) headers.set('ETag', object.httpEtag);
          return new Response(object.body, { headers });
        }
        if (url.pathname === '/v1/community/threads') return json(request, await listThreads(env, url));
        const thread = url.pathname.match(/^\/v1\/community\/threads\/([a-f0-9-]{36})$/);
        if (thread) return json(request, await readThread(env, thread[1]));
        const profile = url.pathname.match(/^\/v1\/community\/profiles\/([A-Za-z0-9_-]{3,24})$/);
        if (profile) return json(request, await readProfile(env, profile[1]));
      } catch (error) {
        if (error instanceof CommunityError) return json(request, { error: error.message }, error.status);
        throw error;
      }
    }

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
      if (request.method === 'POST' && url.pathname === '/v1/play/link') {
        return await linkPlayPurchaseRequest(request, env, identity.subject);
      }
      if (request.method === 'POST' && url.pathname === '/v1/sync') return await sync(request, env, identity.subject);
      if (request.method === 'DELETE' && url.pathname === '/v1/account') {
        const objects = await listAll(env.USER_DATA, `users/${identity.subject}/`);
        for (let i = 0; i < objects.length; i += 1000) {
          await env.USER_DATA.delete(objects.slice(i, i + 1000).map((item) => item.key));
        }
        // "Delete my account" has to mean the same thing everywhere. Leaving
        // someone's posts up after they erased their designs would make that
        // promise false — and the GDPR request unanswerable.
        await erasePerson(env, identity.subject);
        // The purchase remains valid on the Play account/device, but no longer
        // identifies the erased HomeDesigner account.
        await env.COMMUNITY.prepare(
          `UPDATE play_purchases SET account_subject = NULL, linked_at = NULL WHERE account_subject = ?`,
        ).bind(identity.subject).run();
        return json(request, { deleted: objects.length });
      }

      if (url.pathname.startsWith('/v1/community/')) {
        try {
          if (request.method === 'POST' && url.pathname === '/v1/community/images') {
            const kind = url.searchParams.get('kind');
            if (kind !== 'avatar' && kind !== 'post') {
              return json(request, { error: 'Choose avatar or post image.' }, 400);
            }
            return json(request, await uploadCommunityImage(env, identity, request, kind), 201);
          }
          const body = request.method === 'GET'
            ? {}
            : await request.json().catch(() => ({})) as Record<string, unknown>;
          if (request.method === 'GET' && url.pathname === '/v1/community/me') {
            return json(request, await readMe(env, identity));
          }
          if (request.method === 'POST' && url.pathname === '/v1/community/me') {
            return json(request, await updateMe(env, identity, body));
          }
          if (request.method === 'POST' && url.pathname === '/v1/community/avatar/remove') {
            return json(request, await removeAvatar(env, identity));
          }
          if (request.method === 'POST' && url.pathname === '/v1/community/threads') {
            return json(request, await createThread(env, identity, body), 201);
          }
          const reply = url.pathname.match(/^\/v1\/community\/threads\/([a-f0-9-]{36})\/posts$/);
          if (request.method === 'POST' && reply) {
            return json(request, await createPost(env, identity, reply[1], body), 201);
          }
          const post = url.pathname.match(/^\/v1\/community\/posts\/([a-f0-9-]{36})$/);
          if (request.method === 'POST' && post) {
            return json(request, await editPost(env, identity, post[1], body));
          }
          const report = url.pathname.match(/^\/v1\/community\/posts\/([a-f0-9-]{36})\/report$/);
          if (request.method === 'POST' && report) {
            return json(request, await reportPost(env, identity, report[1], body));
          }
          if (request.method === 'GET' && url.pathname === '/v1/community/reports') {
            return json(request, await listReports(env, identity));
          }
          if (request.method === 'POST' && url.pathname === '/v1/community/moderate') {
            return json(request, await moderate(env, identity, body));
          }
        } catch (error) {
          if (error instanceof CommunityError) return json(request, { error: error.message }, error.status);
          throw error;
        }
      }

      if (url.pathname.startsWith('/v1/admin/models')) {
        requireModelAdmin(identity, env);
        if (request.method === 'GET' && url.pathname === '/v1/admin/models/jobs') {
          return await listModelJobs(request, env, identity);
        }
        if (request.method === 'POST' && url.pathname === '/v1/admin/models/jobs') {
          return await createModelJob(request, env, identity);
        }
        const match = url.pathname.match(/^\/v1\/admin\/models\/jobs\/([a-f0-9-]{36})(?:\/(source|generate|optimized|metadata|publish))?$/);
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
          if (request.method === 'POST' && action === 'metadata') {
            return await suggestModelMetadata(request, env, job);
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
