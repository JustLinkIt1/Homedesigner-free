// Community forum routes.
//
// Split out of index.ts because the forum has a different shape to everything
// else this Worker does: the rest is one signed-in user reading and writing
// their OWN data, while a forum is mostly anonymous people reading everyone's.
//
// That difference drives the one structural rule here: **reads are public.**
// index.ts authenticates before it routes, which is right for sync and
// entitlement, but a forum nobody can read without signing in is not a forum —
// and it would be invisible to Google, which is half the point of hosting it on
// the site rather than on Discord. Public GETs are matched ahead of
// authenticate(); everything that writes still goes through it.

/** Structural copy of index.ts's AuthIdentity. Duplicated rather than imported
 *  so this module has no import back into the router that calls it. */
export interface AuthIdentity {
  subject: string;
  email: string | null;
  emailVerified: boolean;
}

export interface CommunityEnv {
  COMMUNITY: D1Database;
  USER_DATA: R2Bucket;
  AI: Ai;
  /** Bootstrap moderator, by verified Google email. Mirrors MODEL_ADMIN_EMAIL.
   *  Without this the very first forum would have no moderator and no way to
   *  appoint one: the report queue and every hide/lock/ban action are gated on
   *  a role that only a moderator could otherwise grant. */
  COMMUNITY_ADMIN_EMAIL?: string;
}

/** Fixed in code rather than a table: categories change with the product, not
 *  with user activity, and a table would invite an admin CRUD screen nobody
 *  needs. The ids are URL segments and must stay stable. */
export const CATEGORIES = [
  { id: 'help', name: 'Help & how-to', blurb: 'Stuck on something? Ask here.' },
  { id: 'showcase', name: 'Show your design', blurb: 'Share a plan or a render.' },
  { id: 'ideas', name: 'Feature ideas', blurb: 'What should we build next?' },
  { id: 'bugs', name: 'Bug reports', blurb: 'Something broken or wrong?' },
  { id: 'general', name: 'General', blurb: 'Anything else about the app.' },
] as const;

const CATEGORY_IDS = new Set<string>(CATEGORIES.map((c) => c.id));

const TITLE_MAX = 140;
const BODY_MAX = 8000;
const BIO_MAX = 400;
const DISPLAY_NAME_MAX = 40;
const PAGE_SIZE = 30;
const MAX_POST_IMAGES = 4;
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const POST_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const HANDLE_RE = /^[a-z0-9](?:[a-z0-9_-]{1,22})[a-z0-9]$/;

export interface Profile {
  subject: string;
  handle: string;
  display_name: string;
  bio: string;
  avatar_url: string | null;
  avatar_image_id: string | null;
  post_count: number;
  role: string;
  banned_until: number | null;
}

const isModerator = (p: Profile | null) => p?.role === 'moderator' || p?.role === 'admin';
const isBanned = (p: Profile | null) => !!p?.banned_until && p.banned_until > Date.now();

/** Thrown for anything the caller did wrong; index.ts maps it to a status. */
export class CommunityError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const uid = () => crypto.randomUUID();

/**
 * Handles are the one piece of identity a user picks, so they are the one place
 * impersonation is cheap. Lowercase ASCII, digits, hyphen and underscore only:
 * no spaces, no Unicode look-alikes (Cyrillic "а" reading as Latin "a"), no
 * leading or trailing punctuation.
 */
function normaliseHandle(raw: unknown): string {
  const value = String(raw ?? '').trim().toLowerCase();
  if (!HANDLE_RE.test(value)) {
    throw new CommunityError(
      'Pick a handle 3-24 characters long, using letters, numbers, hyphen or underscore.',
    );
  }
  return value;
}

function cleanText(raw: unknown, max: number, field: string): string {
  // Normalise first: a decomposed string can pass a length check and then
  // render far longer, and zero-width characters are a classic way to fake an
  // empty-looking post or a duplicate-looking handle.
  const value = String(raw ?? '').normalize('NFC').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
  if (!value) throw new CommunityError(`${field} cannot be empty.`);
  if (value.length > max) throw new CommunityError(`${field} must be ${max} characters or fewer.`);
  return value;
}

export async function loadProfile(env: CommunityEnv, subject: string): Promise<Profile | null> {
  return await env.COMMUNITY.prepare(
    `SELECT subject, handle, display_name, bio, avatar_url, avatar_image_id,
            post_count, role, banned_until FROM profiles WHERE subject = ?`,
  ).bind(subject).first<Profile>();
}

/** The public shape of a profile. `subject` is the Google id and never leaves
 *  the Worker — exposing it would let anyone correlate forum posts with the
 *  sync API's user keys. */
const imagePath = (id: string | null) => id ? `/v1/community/images/${id}` : null;

function rankFor(postCount: number): string {
  if (postCount >= 100) return 'Expert';
  if (postCount >= 25) return 'Regular';
  if (postCount >= 5) return 'Contributor';
  return 'New member';
}

const publicProfile = (p: Profile) => ({
  handle: p.handle,
  displayName: p.display_name,
  bio: p.bio,
  avatarUrl: imagePath(p.avatar_image_id),
  role: p.role,
  postCount: p.post_count,
  rank: rankFor(p.post_count),
});

const publicAuthor = (row: Record<string, unknown>) => ({
  handle: row.handle,
  displayName: row.display_name,
  avatarUrl: imagePath(typeof row.avatar_image_id === 'string' ? row.avatar_image_id : null),
  role: row.role,
  postCount: Number(row.post_count) || 0,
  rank: rankFor(Number(row.post_count) || 0),
});

/**
 * First write of any kind creates the profile. Registration is not a separate
 * step the user has to find: they sign in with Google, and the first time they
 * post they already have an identity they can then edit.
 */
/**
 * True when this signed-in person is the configured bootstrap moderator.
 * `emailVerified` is required: the email claim alone is self-asserted at the
 * provider, and without that check anyone able to set an unverified address to
 * the owner's could hand themselves the ban button.
 */
function isBootstrapAdmin(env: CommunityEnv, identity: AuthIdentity): boolean {
  const expected = env.COMMUNITY_ADMIN_EMAIL?.trim().toLowerCase();
  return !!expected && identity.emailVerified && identity.email?.toLowerCase() === expected;
}

async function ensureProfile(env: CommunityEnv, identity: AuthIdentity): Promise<Profile> {
  const existing = await loadProfile(env, identity.subject);
  if (existing) {
    // Re-applied on every load rather than only at creation, so setting the
    // variable promotes an account that already signed in — and so a
    // demotion by hand cannot be silently undone by a stale row.
    if (isBootstrapAdmin(env, identity) && existing.role !== 'admin') {
      await env.COMMUNITY.prepare('UPDATE profiles SET role = ? WHERE subject = ?')
        .bind('admin', identity.subject).run();
      return { ...existing, role: 'admin' };
    }
    return existing;
  }

  const now = Date.now();
  // Never derive a public handle from an email address. Even exposing only the
  // local part can identify someone; the user can choose a handle afterwards.
  for (let attempt = 0; attempt < 6; attempt++) {
    const handle = `member-${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`;
    if (!HANDLE_RE.test(handle)) continue;
    try {
      await env.COMMUNITY.prepare(
        `INSERT INTO profiles (subject, handle, display_name, bio, avatar_url, role, created_at, updated_at)
         VALUES (?, ?, ?, '', NULL, ?, ?, ?)`,
      ).bind(identity.subject, handle, handle,
        isBootstrapAdmin(env, identity) ? 'admin' : 'member', now, now).run();
      return (await loadProfile(env, identity.subject))!;
    } catch {
      // UNIQUE violation on handle — try another suffix.
    }
  }
  throw new CommunityError('Could not create a profile. Try again.', 500);
}

function requirePoster(profile: Profile): Profile {
  if (isBanned(profile)) {
    throw new CommunityError('Your account is suspended from posting.', 403);
  }
  return profile;
}

/**
 * Ask Workers AI whether a reported post looks abusive. Advisory ONLY — it
 * annotates the report queue so a human sees the worst first. It never hides
 * anything by itself: a false positive that silently removes a real user's
 * question is far more damaging to a small community than a rude post sitting
 * up for an hour.
 */
async function screen(env: CommunityEnv, body: string): Promise<string | null> {
  try {
    const result = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        {
          role: 'system',
          content: 'You moderate a home-design forum. Reply with one word: SPAM, ABUSE, ADULT, or OK.',
        },
        { role: 'user', content: body.slice(0, 2000) },
      ],
      max_tokens: 5,
    } as never) as { response?: string };
    const verdict = (result?.response ?? '').trim().toUpperCase().slice(0, 12);
    return /^(SPAM|ABUSE|ADULT|OK)$/.test(verdict) ? verdict : null;
  } catch {
    // Moderation assistance is best-effort; never block a report on it.
    return null;
  }
}

// ---------------------------------------------------------------- public reads

export async function listThreads(env: CommunityEnv, url: URL) {
  const category = url.searchParams.get('category');
  if (category && !CATEGORY_IDS.has(category)) {
    throw new CommunityError('Unknown category.', 404);
  }
  // Keyset pagination on the same column the index is sorted by. OFFSET would
  // get slower with every page and can skip or repeat a thread when someone
  // posts mid-scroll.
  const before = Number(url.searchParams.get('before')) || Number.MAX_SAFE_INTEGER;
  const rows = await env.COMMUNITY.prepare(
    `SELECT t.id, t.category, t.title, t.created_at, t.last_post_at, t.reply_count,
            t.locked, p.handle, p.display_name, p.avatar_image_id, p.role, p.post_count
       FROM threads t JOIN profiles p ON p.subject = t.author
      WHERE t.hidden = 0 AND t.last_post_at < ?${category ? ' AND t.category = ?' : ''}
      ORDER BY t.last_post_at DESC LIMIT ?`,
  ).bind(...(category ? [before, category, PAGE_SIZE] : [before, PAGE_SIZE])).all();

  return {
    categories: CATEGORIES,
    threads: (rows.results ?? []).map((r: Record<string, unknown>) => ({
      id: r.id,
      category: r.category,
      title: r.title,
      createdAt: r.created_at,
      lastPostAt: r.last_post_at,
      replyCount: r.reply_count,
      locked: !!r.locked,
      author: publicAuthor(r),
    })),
  };
}

export async function readThread(env: CommunityEnv, id: string) {
  const thread = await env.COMMUNITY.prepare(
    `SELECT t.id, t.category, t.title, t.created_at, t.locked, t.hidden,
            p.handle, p.display_name, p.avatar_image_id, p.role, p.post_count
       FROM threads t JOIN profiles p ON p.subject = t.author WHERE t.id = ?`,
  ).bind(id).first<Record<string, unknown>>();
  if (!thread || thread.hidden) throw new CommunityError('Thread not found.', 404);

  const posts = await env.COMMUNITY.prepare(
    `SELECT s.id, s.body, s.created_at, s.edited_at, s.hidden,
            p.handle, p.display_name, p.avatar_image_id, p.role, p.post_count
       FROM posts s JOIN profiles p ON p.subject = s.author
      WHERE s.thread_id = ? ORDER BY s.created_at ASC LIMIT 500`,
  ).bind(id).all();

  const images = await env.COMMUNITY.prepare(
    `SELECT id, post_id FROM community_images
      WHERE post_id IN (SELECT id FROM posts WHERE thread_id = ?)
      ORDER BY created_at ASC`,
  ).bind(id).all<Record<string, unknown>>();
  const imagesByPost = new Map<string, string[]>();
  for (const image of images.results ?? []) {
    const postId = String(image.post_id);
    const list = imagesByPost.get(postId) ?? [];
    list.push(imagePath(String(image.id))!);
    imagesByPost.set(postId, list);
  }

  return {
    thread: {
      id: thread.id,
      category: thread.category,
      title: thread.title,
      createdAt: thread.created_at,
      locked: !!thread.locked,
      author: publicAuthor(thread),
    },
    // A hidden post keeps its slot so the conversation still reads in order,
    // but carries no body — moderation should be visible, not a memory hole.
    posts: (posts.results ?? []).map((r: Record<string, unknown>) => (r.hidden ? {
      id: r.id, hidden: true, createdAt: r.created_at,
    } : {
      id: r.id,
      body: r.body,
      images: imagesByPost.get(String(r.id)) ?? [],
      createdAt: r.created_at,
      editedAt: r.edited_at,
      author: publicAuthor(r),
    })),
  };
}

export async function readProfile(env: CommunityEnv, handle: string) {
  const row = await env.COMMUNITY.prepare(
    `SELECT subject, handle, display_name, bio, avatar_url, avatar_image_id,
            post_count, role, banned_until FROM profiles WHERE lower(handle) = ?`,
  ).bind(handle.toLowerCase()).first<Profile>();
  if (!row) throw new CommunityError('Profile not found.', 404);
  const threads = await env.COMMUNITY.prepare(
    `SELECT id, title, category, last_post_at FROM threads
      WHERE author = ? AND hidden = 0 ORDER BY last_post_at DESC LIMIT 20`,
  ).bind(row.subject).all();
  return { profile: publicProfile(row), threads: threads.results ?? [] };
}

// --------------------------------------------------------------- authed writes

export async function readMe(env: CommunityEnv, identity: AuthIdentity) {
  const profile = await ensureProfile(env, identity);
  return { profile: publicProfile(profile), suspended: isBanned(profile) };
}

export async function updateMe(env: CommunityEnv, identity: AuthIdentity, input: Record<string, unknown>) {
  const profile = await ensureProfile(env, identity);
  const handle = input.handle === undefined ? profile.handle : normaliseHandle(input.handle);
  const displayName = input.displayName === undefined
    ? profile.display_name
    : cleanText(input.displayName, DISPLAY_NAME_MAX, 'Display name');
  // Bio is the only field allowed to be empty, so it does not go through
  // cleanText's non-empty rule.
  const bio = input.bio === undefined
    ? profile.bio
    : String(input.bio).normalize('NFC').trim().slice(0, BIO_MAX);
  // Profile pictures are managed only by the explicit first-party upload endpoints.
  try {
    await env.COMMUNITY.prepare(
      'UPDATE profiles SET handle = ?, display_name = ?, bio = ?, updated_at = ? WHERE subject = ?',
    ).bind(handle, displayName, bio, Date.now(), identity.subject).run();
  } catch {
    throw new CommunityError('That handle is already taken.', 409);
  }
  return { profile: publicProfile((await loadProfile(env, identity.subject))!) };
}

type CommunityImageKind = 'avatar' | 'post';

function detectedImageType(bytes: Uint8Array): string | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
    && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'image/webp';
  return null;
}

export async function uploadCommunityImage(
  env: CommunityEnv, identity: AuthIdentity, request: Request, kind: CommunityImageKind,
) {
  const profile = requirePoster(await ensureProfile(env, identity));
  if (kind === 'post' && !isModerator(profile)) {
    throw new CommunityError('Only moderators can add images to posts right now.', 403);
  }
  const maxBytes = kind === 'avatar' ? AVATAR_MAX_BYTES : POST_IMAGE_MAX_BYTES;
  const statedLength = Number(request.headers.get('Content-Length')) || 0;
  if (statedLength > maxBytes) {
    throw new CommunityError(`Image must be smaller than ${maxBytes / 1024 / 1024} MB.`, 413);
  }
  const body = await request.arrayBuffer();
  if (!body.byteLength || body.byteLength > maxBytes) {
    throw new CommunityError(`Image must be smaller than ${maxBytes / 1024 / 1024} MB.`, 413);
  }
  const mimeType = detectedImageType(new Uint8Array(body));
  if (!mimeType) throw new CommunityError('Use a PNG, JPEG or WebP image.', 415);

  const id = uid();
  const extension = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
  const objectKey = `users/${identity.subject}/community/${kind}/${id}.${extension}`;
  await env.USER_DATA.put(objectKey, body, {
    httpMetadata: { contentType: mimeType, cacheControl: 'public, max-age=31536000, immutable' },
  });

  try {
    await env.COMMUNITY.prepare(
      `INSERT INTO community_images (id, owner, kind, object_key, mime_type, byte_size, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, identity.subject, kind, objectKey, mimeType, body.byteLength, Date.now()).run();
  } catch (error) {
    await env.USER_DATA.delete(objectKey);
    throw error;
  }

  if (kind === 'avatar') {
    const previousId = profile.avatar_image_id;
    let previousKey: string | null = null;
    if (previousId) {
      const previous = await env.COMMUNITY.prepare(
        'SELECT object_key FROM community_images WHERE id = ? AND owner = ?',
      ).bind(previousId, identity.subject).first<{ object_key: string }>();
      previousKey = previous?.object_key ?? null;
    }
    await env.COMMUNITY.batch([
      env.COMMUNITY.prepare(
        'UPDATE profiles SET avatar_image_id = ?, avatar_url = NULL, updated_at = ? WHERE subject = ?',
      ).bind(id, Date.now(), identity.subject),
      ...(previousId ? [env.COMMUNITY.prepare('DELETE FROM community_images WHERE id = ? AND owner = ?')
        .bind(previousId, identity.subject)] : []),
    ]);
    if (previousKey) await env.USER_DATA.delete(previousKey);
    return { profile: publicProfile((await loadProfile(env, identity.subject))!) };
  }

  return { image: { id, url: imagePath(id), mimeType, byteSize: body.byteLength } };
}

export async function removeAvatar(env: CommunityEnv, identity: AuthIdentity) {
  const profile = await ensureProfile(env, identity);
  const imageId = profile.avatar_image_id;
  if (imageId) {
    const image = await env.COMMUNITY.prepare(
      'SELECT object_key FROM community_images WHERE id = ? AND owner = ?',
    ).bind(imageId, identity.subject).first<{ object_key: string }>();
    await env.COMMUNITY.batch([
      env.COMMUNITY.prepare(
        'UPDATE profiles SET avatar_image_id = NULL, avatar_url = NULL, updated_at = ? WHERE subject = ?',
      ).bind(Date.now(), identity.subject),
      env.COMMUNITY.prepare('DELETE FROM community_images WHERE id = ? AND owner = ?')
        .bind(imageId, identity.subject),
    ]);
    if (image?.object_key) await env.USER_DATA.delete(image.object_key);
  }
  return { profile: publicProfile((await loadProfile(env, identity.subject))!) };
}

export async function readCommunityImage(env: CommunityEnv, id: string) {
  const image = await env.COMMUNITY.prepare(
    'SELECT object_key, mime_type FROM community_images WHERE id = ?',
  ).bind(id).first<{ object_key: string; mime_type: string }>();
  if (!image) throw new CommunityError('Image not found.', 404);
  const object = await env.USER_DATA.get(image.object_key);
  if (!object) throw new CommunityError('Image not found.', 404);
  return { object, mimeType: image.mime_type };
}

function parseImageIds(input: unknown): string[] {
  if (input === undefined) return [];
  if (!Array.isArray(input) || input.length > MAX_POST_IMAGES) {
    throw new CommunityError(`Add up to ${MAX_POST_IMAGES} images.`);
  }
  const ids = [...new Set(input.map(String))];
  if (ids.length !== input.length || ids.some((id) => !/^[a-f0-9-]{36}$/.test(id))) {
    throw new CommunityError('Invalid image attachment.');
  }
  return ids;
}

async function attachImages(
  env: CommunityEnv, profile: Profile, imageIds: string[], postId: string,
): Promise<D1PreparedStatement[]> {
  if (!imageIds.length) return [];
  if (!isModerator(profile)) throw new CommunityError('Only moderators can add images to posts right now.', 403);
  const placeholders = imageIds.map(() => '?').join(',');
  const images = await env.COMMUNITY.prepare(
    `SELECT id FROM community_images
      WHERE owner = ? AND kind = 'post' AND post_id IS NULL AND id IN (${placeholders})`,
  ).bind(profile.subject, ...imageIds).all<{ id: string }>();
  if ((images.results ?? []).length !== imageIds.length) {
    throw new CommunityError('An image is missing, already used, or belongs to another account.', 409);
  }
  return imageIds.map((id) => env.COMMUNITY.prepare(
    `UPDATE community_images SET post_id = ?
      WHERE id = ? AND owner = ? AND kind = 'post' AND post_id IS NULL`,
  ).bind(postId, id, profile.subject));
}

export async function createThread(env: CommunityEnv, identity: AuthIdentity, input: Record<string, unknown>) {
  const profile = requirePoster(await ensureProfile(env, identity));
  const category = String(input.category ?? '');
  if (!CATEGORY_IDS.has(category)) throw new CommunityError('Pick a category.');
  const title = cleanText(input.title, TITLE_MAX, 'Title');
  const body = cleanText(input.body, BODY_MAX, 'Message');
  const imageIds = parseImageIds(input.imageIds);

  const now = Date.now();
  const threadId = uid();
  const postId = uid();
  const imageStatements = await attachImages(env, profile, imageIds, postId);
  await env.COMMUNITY.batch([
    env.COMMUNITY.prepare(
      `INSERT INTO threads (id, category, title, author, created_at, last_post_at, reply_count)
       VALUES (?, ?, ?, ?, ?, ?, 0)`,
    ).bind(threadId, category, title, profile.subject, now, now),
    env.COMMUNITY.prepare(
      'INSERT INTO posts (id, thread_id, author, body, created_at) VALUES (?, ?, ?, ?, ?)',
    ).bind(postId, threadId, profile.subject, body, now),
    env.COMMUNITY.prepare('UPDATE profiles SET post_count = post_count + 1 WHERE subject = ?')
      .bind(profile.subject),
    ...imageStatements,
  ]);
  return { id: threadId };
}

export async function createPost(
  env: CommunityEnv, identity: AuthIdentity, threadId: string, input: Record<string, unknown>,
) {
  const profile = requirePoster(await ensureProfile(env, identity));
  const body = cleanText(input.body, BODY_MAX, 'Message');
  const imageIds = parseImageIds(input.imageIds);
  const thread = await env.COMMUNITY.prepare(
    'SELECT id, locked, hidden FROM threads WHERE id = ?',
  ).bind(threadId).first<{ locked: number; hidden: number }>();
  if (!thread || thread.hidden) throw new CommunityError('Thread not found.', 404);
  if (thread.locked && !isModerator(profile)) throw new CommunityError('This thread is closed.', 403);

  const now = Date.now();
  const postId = uid();
  const imageStatements = await attachImages(env, profile, imageIds, postId);
  await env.COMMUNITY.batch([
    env.COMMUNITY.prepare(
      'INSERT INTO posts (id, thread_id, author, body, created_at) VALUES (?, ?, ?, ?, ?)',
    ).bind(postId, threadId, profile.subject, body, now),
    env.COMMUNITY.prepare(
      'UPDATE threads SET last_post_at = ?, reply_count = reply_count + 1 WHERE id = ?',
    ).bind(now, threadId),
    env.COMMUNITY.prepare('UPDATE profiles SET post_count = post_count + 1 WHERE subject = ?')
      .bind(profile.subject),
    ...imageStatements,
  ]);
  return { id: postId };
}

export async function editPost(
  env: CommunityEnv, identity: AuthIdentity, postId: string, input: Record<string, unknown>,
) {
  const profile = requirePoster(await ensureProfile(env, identity));
  const post = await env.COMMUNITY.prepare(
    'SELECT author FROM posts WHERE id = ? AND hidden = 0',
  ).bind(postId).first<{ author: string }>();
  if (!post) throw new CommunityError('Post not found.', 404);
  if (post.author !== profile.subject && !isModerator(profile)) {
    throw new CommunityError('You can only edit your own posts.', 403);
  }
  const body = cleanText(input.body, BODY_MAX, 'Message');
  await env.COMMUNITY.prepare(
    'UPDATE posts SET body = ?, edited_at = ? WHERE id = ?',
  ).bind(body, Date.now(), postId).run();
  return { ok: true };
}

export async function reportPost(
  env: CommunityEnv, identity: AuthIdentity, postId: string, input: Record<string, unknown>,
) {
  const profile = requirePoster(await ensureProfile(env, identity));
  const reason = cleanText(input.reason, 300, 'Reason');
  const post = await env.COMMUNITY.prepare(
    'SELECT body FROM posts WHERE id = ?',
  ).bind(postId).first<{ body: string }>();
  if (!post) throw new CommunityError('Post not found.', 404);

  const verdict = await screen(env, post.body);
  try {
    await env.COMMUNITY.prepare(
      'INSERT INTO reports (id, post_id, reporter, reason, ai_verdict, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).bind(uid(), postId, profile.subject, reason, verdict, Date.now()).run();
  } catch {
    // Already reported by this person — say thank you rather than error.
  }
  return { ok: true };
}

// ------------------------------------------------------------------ moderation

export async function moderate(env: CommunityEnv, identity: AuthIdentity, input: Record<string, unknown>) {
  const profile = await ensureProfile(env, identity);
  if (!isModerator(profile)) throw new CommunityError('Not allowed.', 403);
  const action = String(input.action ?? '');
  const id = String(input.id ?? '');
  if (!id) throw new CommunityError('Missing id.');

  switch (action) {
    case 'hidePost':
    case 'showPost':
      await env.COMMUNITY.prepare('UPDATE posts SET hidden = ? WHERE id = ?')
        .bind(action === 'hidePost' ? 1 : 0, id).run();
      return { ok: true };
    case 'hideThread':
    case 'showThread':
      await env.COMMUNITY.prepare('UPDATE threads SET hidden = ? WHERE id = ?')
        .bind(action === 'hideThread' ? 1 : 0, id).run();
      return { ok: true };
    case 'lock':
    case 'unlock':
      await env.COMMUNITY.prepare('UPDATE threads SET locked = ? WHERE id = ?')
        .bind(action === 'lock' ? 1 : 0, id).run();
      return { ok: true };
    case 'ban': {
      // `id` is a handle here — a moderator should never need to know or paste
      // somebody's Google subject to act on them.
      const days = Math.min(3650, Math.max(1, Number(input.days) || 7));
      await env.COMMUNITY.prepare(
        'UPDATE profiles SET banned_until = ? WHERE lower(handle) = ?',
      ).bind(Date.now() + days * 86_400_000, id.toLowerCase()).run();
      return { ok: true };
    }
    case 'unban':
      await env.COMMUNITY.prepare('UPDATE profiles SET banned_until = NULL WHERE lower(handle) = ?')
        .bind(id.toLowerCase()).run();
      return { ok: true };
    case 'resolveReport':
      await env.COMMUNITY.prepare('UPDATE reports SET resolved = 1 WHERE id = ?')
        .bind(id).run();
      return { ok: true };
    default:
      throw new CommunityError('Unknown action.');
  }
}

export async function listReports(env: CommunityEnv, identity: AuthIdentity) {
  const profile = await ensureProfile(env, identity);
  if (!isModerator(profile)) throw new CommunityError('Not allowed.', 403);
  const rows = await env.COMMUNITY.prepare(
    `SELECT r.id, r.post_id, r.reason, r.ai_verdict, r.created_at,
            s.body, s.thread_id, p.handle
       FROM reports r
       JOIN posts s ON s.id = r.post_id
       JOIN profiles p ON p.subject = s.author
      WHERE r.resolved = 0 ORDER BY r.created_at DESC LIMIT 100`,
  ).all();
  return { reports: rows.results ?? [] };
}

/**
 * Erase everything a person wrote. Called by the existing DELETE /v1/account so
 * "delete my account" means the same thing across the app and the forum — a
 * forum that kept your posts after you deleted your account would make that
 * promise a lie, and the GDPR request unanswerable.
 */
export async function erasePerson(env: CommunityEnv, subject: string): Promise<void> {
  await env.COMMUNITY.batch([
    env.COMMUNITY.prepare('DELETE FROM reports WHERE reporter = ?').bind(subject),
    env.COMMUNITY.prepare('DELETE FROM community_images WHERE owner = ?').bind(subject),
    env.COMMUNITY.prepare('DELETE FROM posts WHERE author = ?').bind(subject),
    env.COMMUNITY.prepare('DELETE FROM threads WHERE author = ?').bind(subject),
    env.COMMUNITY.prepare('DELETE FROM profiles WHERE subject = ?').bind(subject),
  ]);
}
