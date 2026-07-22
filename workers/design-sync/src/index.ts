import { createRemoteJWKSet, jwtVerify } from 'jose';

interface Env {
  USER_DATA: R2Bucket;
  GOOGLE_WEB_CLIENT_ID: string;
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
  return {
    'Access-Control-Allow-Origin': allowedOrigins.has(origin) ? origin : 'https://homedesignerapp.com',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(request: Request, body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: cors(request) });
}

async function authenticate(request: Request, env: Env): Promise<string> {
  const header = request.headers.get('Authorization') ?? '';
  if (!header.startsWith('Bearer ')) throw new Error('Unauthorized');
  const { payload } = await jwtVerify(header.slice(7), googleKeys, {
    audience: env.GOOGLE_WEB_CLIENT_ID,
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
  });
  if (!payload.sub) throw new Error('Unauthorized');
  return payload.sub;
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(request) });
    const url = new URL(request.url);
    try {
      const subject = await authenticate(request, env);
      if (request.method === 'POST' && url.pathname === '/v1/sync') return await sync(request, env, subject);
      if (request.method === 'DELETE' && url.pathname === '/v1/account') {
        const objects = await listAll(env.USER_DATA, `users/${subject}/`);
        for (let i = 0; i < objects.length; i += 1000) {
          await env.USER_DATA.delete(objects.slice(i, i + 1000).map((item) => item.key));
        }
        return json(request, { deleted: objects.length });
      }
      return json(request, { error: 'Not found' }, 404);
    } catch (error) {
      const unauthorized = error instanceof Error && /JWT|Unauthorized|signature|claim/i.test(error.message);
      return json(request, { error: unauthorized ? 'Unauthorized' : 'Sync failed' }, unauthorized ? 401 : 400);
    }
  },
} satisfies ExportedHandler<Env>;
