// Community forum API client.
//
// Reads are unauthenticated on purpose (see workers/design-sync/src/community.ts):
// browsing works signed out, and only writing needs a Google token. That keeps
// the sign-in prompt where it belongs — at the moment someone tries to post,
// not in front of the door.

import { getGoogleIdToken } from './googleAuth';

const BASE = (import.meta.env.VITE_CLOUD_SYNC_URL ?? '').replace(/\/$/, '');

export function isCommunityConfigured(): boolean {
  return /^https:\/\//.test(BASE);
}

export interface CommunityAuthor {
  handle: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface CommunityProfile extends CommunityAuthor {
  bio: string;
  role: string;
}

export interface ThreadSummary {
  id: string;
  category: string;
  title: string;
  createdAt: number;
  lastPostAt: number;
  replyCount: number;
  locked: boolean;
  author: CommunityAuthor;
}

export interface CommunityPost {
  id: string;
  hidden?: true;
  body?: string;
  createdAt: number;
  editedAt?: number | null;
  author?: CommunityAuthor;
}

export interface Category { id: string; name: string; blurb: string }

export interface CommunityReport {
  id: string;
  post_id: string;
  thread_id: string;
  reason: string;
  ai_verdict: string | null;
  created_at: number;
  body: string;
  handle: string;
}

/** The Worker answers errors as `{ error }` with a real status. Surfacing that
 *  message verbatim matters: "That handle is already taken" is the entire value
 *  of the response, and a generic "Request failed" would throw it away. */
async function call<T>(path: string, init?: RequestInit & { auth?: boolean }): Promise<T> {
  if (!isCommunityConfigured()) throw new Error('The community is not available yet.');
  const headers: Record<string, string> = {};
  if (init?.body) headers['Content-Type'] = 'application/json';
  if (init?.auth) headers.Authorization = `Bearer ${await getGoogleIdToken()}`;
  const response = await fetch(`${BASE}${path}`, { ...init, headers });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown> & { error?: string };
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status}).`);
  return payload as T;
}

const write = (path: string, body: unknown) =>
  call(path, { method: 'POST', body: JSON.stringify(body), auth: true });

export const listThreads = (category?: string, before?: number) =>
  call<{ categories: Category[]; threads: ThreadSummary[] }>(
    `/v1/community/threads?${new URLSearchParams({
      ...(category ? { category } : {}),
      ...(before ? { before: String(before) } : {}),
    })}`,
  );

export const readThread = (id: string) =>
  call<{ thread: ThreadSummary; posts: CommunityPost[] }>(`/v1/community/threads/${id}`);

export const readProfile = (handle: string) =>
  call<{ profile: CommunityProfile; threads: ThreadSummary[] }>(`/v1/community/profiles/${handle}`);

export const readMe = () =>
  call<{ profile: CommunityProfile; suspended: boolean }>('/v1/community/me', { auth: true });

export const updateMe = (input: { handle?: string; displayName?: string; bio?: string; avatarUrl?: string | null }) =>
  write('/v1/community/me', input) as Promise<{ profile: CommunityProfile }>;

export const createThread = (input: { category: string; title: string; body: string }) =>
  write('/v1/community/threads', input) as Promise<{ id: string }>;

export const createPost = (threadId: string, body: string) =>
  write(`/v1/community/threads/${threadId}/posts`, { body }) as Promise<{ id: string }>;

export const editPost = (postId: string, body: string) =>
  write(`/v1/community/posts/${postId}`, { body });

export const reportPost = (postId: string, reason: string) =>
  write(`/v1/community/posts/${postId}/report`, { reason });

export const listReports = () =>
  call<{ reports: CommunityReport[] }>('/v1/community/reports', { auth: true });

export const moderate = (action: string, id: string, extra: Record<string, unknown> = {}) =>
  write('/v1/community/moderate', { action, id, ...extra }) as Promise<{ ok: true }>;
