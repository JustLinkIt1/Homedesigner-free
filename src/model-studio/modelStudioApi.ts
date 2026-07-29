import { getGoogleIdToken } from '../lib/googleAuth';

const API_URL = (import.meta.env.VITE_CLOUD_SYNC_URL ?? '').replace(/\/$/, '');

export type StudioTaskStatus = 'queued' | 'running' | 'complete' | 'failed';

export type StudioGeneratorId = 'hunyuan-v3.1-pro' | 'hunyuan-v3.1-rapid';

export const STUDIO_GENERATORS = [
  {
    id: 'hunyuan-v3.1-pro',
    endpoint: 'fal-ai/hunyuan-3d/v3.1/pro/text-to-3d',
    name: 'Hunyuan 3D Pro',
    description: 'Best detail · slower',
    basePrice: 0.525,
  },
  {
    id: 'hunyuan-v3.1-rapid',
    endpoint: 'fal-ai/hunyuan-3d/v3.1/rapid/text-to-3d',
    name: 'Hunyuan 3D Rapid',
    description: 'Fast drafts · lower cost',
    basePrice: 0.225,
  },
] as const satisfies ReadonlyArray<{
  id: StudioGeneratorId;
  endpoint: string;
  name: string;
  description: string;
  basePrice: number;
}>;

export interface StudioJob {
  id: string;
  createdAt: number;
  updatedAt: number;
  prompt: string;
  caption?: string;
  sourceUrl?: string;
  captionTask?: { status: StudioTaskStatus };
  generationTask?: {
    status: StudioTaskStatus;
    endpoint: string;
    requestId: string;
    error?: string;
  };
  model?: {
    url: string;
    bytes: number;
    sha256: string;
    optimized: boolean;
    thumbnailUrl?: string;
  };
  renderModel?: {
    url: string;
    bytes: number;
    sha256: string;
    optimized: boolean;
  };
  published?: {
    type: string;
    modelKey: string;
    publishedAt: number;
  };
}

export interface PublishMetadata {
  mode: 'entry' | 'override';
  type: string;
  name: string;
  category: string;
  shape: string;
  width: number;
  depth: number;
  height: number;
  color: string;
  icon: string;
  pro: boolean;
  fit: 'contain' | 'width' | 'depth' | 'stretch';
  yaw: number;
  rightsConfirmed: boolean;
}

async function authorizedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  if (!/^https:\/\//.test(API_URL)) throw new Error('Model Studio server is not configured.');
  const token = await getGoogleIdToken();
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: unknown } | null;
    const message = typeof payload?.error === 'string' ? payload.error : `Request failed (${response.status})`;
    throw new Error(message);
  }
  return response;
}

export function modelStudioConfigured(): boolean {
  return /^https:\/\//.test(API_URL);
}

export async function listStudioJobs(): Promise<StudioJob[]> {
  const response = await authorizedFetch('/v1/admin/models/jobs');
  const payload = await response.json() as { jobs?: StudioJob[] };
  return payload.jobs ?? [];
}

export async function createStudioJob(input: { prompt: string; image?: File }): Promise<StudioJob> {
  const body = new FormData();
  if (input.prompt.trim()) body.set('prompt', input.prompt.trim());
  if (input.image) body.set('image', input.image);
  const response = await authorizedFetch('/v1/admin/models/jobs', { method: 'POST', body });
  return ((await response.json()) as { job: StudioJob }).job;
}

export async function getStudioJob(id: string): Promise<StudioJob> {
  const response = await authorizedFetch(`/v1/admin/models/jobs/${encodeURIComponent(id)}`);
  return ((await response.json()) as { job: StudioJob }).job;
}

export async function getStudioSource(sourceUrl: string): Promise<Blob> {
  const url = new URL(sourceUrl);
  const response = await authorizedFetch(url.pathname);
  return response.blob();
}

export async function generateStudioModel(
  id: string,
  input: { prompt: string; enablePbr: boolean; generator: StudioGeneratorId },
): Promise<StudioJob> {
  const response = await authorizedFetch(`/v1/admin/models/jobs/${encodeURIComponent(id)}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return ((await response.json()) as { job: StudioJob }).job;
}

export async function uploadOptimizedStudioModel(id: string, model: Blob, renderModel: Blob): Promise<StudioJob> {
  const body = new FormData();
  body.set('model', new File([model], 'model.mobile.glb', { type: 'model/gltf-binary' }));
  body.set('renderModel', new File([renderModel], 'model.render.glb', { type: 'model/gltf-binary' }));
  const response = await authorizedFetch(`/v1/admin/models/jobs/${encodeURIComponent(id)}/optimized`, {
    method: 'POST',
    body,
  });
  return ((await response.json()) as { job: StudioJob }).job;
}

export async function publishStudioModel(id: string, metadata: PublishMetadata): Promise<StudioJob> {
  const response = await authorizedFetch(`/v1/admin/models/jobs/${encodeURIComponent(id)}/publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(metadata),
  });
  return ((await response.json()) as { job: StudioJob }).job;
}
