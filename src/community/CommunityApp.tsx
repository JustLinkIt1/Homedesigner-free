// The /community forum. Web only — see main.tsx.
//
// Deliberately its own screen rather than a route inside the editor: it shares
// nothing with the design store, and lazy-loading it keeps every byte of this
// out of the Android bundle.
//
// Routing is read straight from the URL rather than pulled in as a router
// dependency. Three shapes is not enough state to justify one:
//   /community                     category + thread list
//   /community?thread=<uuid>       one thread
//   /community?profile=<handle>    one profile

import { useCallback, useEffect, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import * as api from '../lib/community';
import type { Category, CommunityPost, CommunityProfile, CommunityReport, ThreadSummary } from '../lib/community';

const ago = (ts: number): string => {
  const mins = Math.max(1, Math.round((Date.now() - ts) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days}d ago`;
};

const go = (search: string) => {
  window.history.pushState({}, '', `${window.location.pathname}${search}`);
  window.dispatchEvent(new PopStateEvent('popstate'));
};

function Avatar({ author }: { author?: api.CommunityAuthor }) {
  if (!author) return <span className="cm-avatar cm-avatar-gone" aria-hidden />;
  const avatarUrl = api.mediaUrl(author.avatarUrl);
  return avatarUrl
    ? <img className="cm-avatar" src={avatarUrl} alt="" width={36} height={36} loading="lazy" />
    : <span className="cm-avatar cm-avatar-initial" aria-hidden>{author.displayName.charAt(0).toUpperCase()}</span>;
}

const canPostImages = (profile: CommunityProfile | null) =>
  profile?.role === 'admin' || profile?.role === 'moderator';

function MemberMeta({ author }: { author: api.CommunityAuthor }) {
  const role = author.role === 'admin' ? 'Admin' : author.role === 'moderator' ? 'Moderator' : 'Member';
  return (
    <span className="cm-member-meta">
      <span className={`cm-role cm-role-${author.role}`}>{role}</span>
      <span>{author.rank}</span>
      <span>{author.postCount} {author.postCount === 1 ? 'post' : 'posts'}</span>
    </span>
  );
}

function PostImages({ images }: { images?: string[] }) {
  if (!images?.length) return null;
  return (
    <div className={`cm-post-images cm-post-images-${Math.min(images.length, 4)}`}>
      {images.map((path) => (
        <a key={path} href={api.mediaUrl(path) ?? '#'} target="_blank" rel="noopener noreferrer">
          <img src={api.mediaUrl(path) ?? ''} alt="Attached community screenshot" loading="lazy" />
        </a>
      ))}
    </div>
  );
}

function validateImage(file: File, maxBytes: number): string | null {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return 'Use a PNG, JPEG or WebP image.';
  if (file.size > maxBytes) return `Image must be smaller than ${maxBytes / 1024 / 1024} MB.`;
  return null;
}

/** Posts are plain text, rendered as paragraphs. NOT markdown and NOT HTML:
 *  user-generated HTML is an XSS hole, and a markdown renderer is a dependency
 *  plus a sanitiser plus an ongoing CVE feed for a forum this size. */
function Body({ text }: { text: string }) {
  return (
    <div className="cm-body">
      {text.split(/\n{2,}/).map((para, i) => <p key={i}>{para}</p>)}
    </div>
  );
}

function SignInPrompt({ what }: { what: string }) {
  const signIn = useAuthStore((s) => s.signIn);
  return (
    <div className="cm-signin">
      <p>Sign in with Google to {what}.</p>
      <button className="btn primary" onClick={() => void signIn()}>Sign in with Google</button>
    </div>
  );
}

function ProfileEditor({ profile, onSaved }: { profile: CommunityProfile; onSaved: (p: CommunityProfile) => void }) {
  const [handle, setHandle] = useState(profile.handle);
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [bio, setBio] = useState(profile.bio);
  const [busy, setBusy] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const { profile: saved } = await api.updateMe({ handle, displayName, bio });
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  const chooseAvatar = async (file?: File) => {
    if (!file) return;
    const problem = validateImage(file, 2 * 1024 * 1024);
    if (problem) { setError(problem); return; }
    setAvatarBusy(true);
    setError(null);
    try {
      const result = await api.uploadImage('avatar', file);
      if (result.profile) onSaved(result.profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload profile picture.');
    } finally {
      setAvatarBusy(false);
    }
  };

  const clearAvatar = async () => {
    setAvatarBusy(true);
    setError(null);
    try {
      const { profile: saved } = await api.removeAvatar();
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove profile picture.');
    } finally {
      setAvatarBusy(false);
    }
  };

  return (
    <div className="cm-card">
      <h2>Your profile</h2>
      <div className="cm-avatar-editor">
        <Avatar author={profile} />
        <div>
          <strong>Profile picture</strong>
          <p className="cm-muted">Optional. We never import your Google profile photo.</p>
          <div className="cm-inline-actions">
            <label className="btn cm-upload-btn">
              {avatarBusy ? 'Uploading…' : profile.avatarUrl ? 'Replace photo' : 'Upload photo'}
              <input type="file" accept="image/png,image/jpeg,image/webp" disabled={avatarBusy}
                onChange={(e) => void chooseAvatar(e.target.files?.[0])} />
            </label>
            {profile.avatarUrl && (
              <button className="btn" disabled={avatarBusy} onClick={() => void clearAvatar()}>Remove</button>
            )}
          </div>
        </div>
      </div>
      <label>Handle<input value={handle} maxLength={24} onChange={(e) => setHandle(e.target.value)} /></label>
      <label>Display name<input value={displayName} maxLength={40} onChange={(e) => setDisplayName(e.target.value)} /></label>
      <label>Bio<textarea value={bio} maxLength={400} rows={3} onChange={(e) => setBio(e.target.value)} /></label>
      {error && <p className="cm-error">{error}</p>}
      <button className="btn primary" disabled={busy} onClick={() => void save()}>
        {busy ? 'Saving…' : 'Save profile'}
      </button>
    </div>
  );
}

function Composer({ categories, allowImages, onPosted }: {
  categories: Category[]; allowImages: boolean; onPosted: (id: string) => void;
}) {
  const [category, setCategory] = useState(categories[0]?.id ?? 'general');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [images, setImages] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const post = async () => {
    setBusy(true);
    setError(null);
    try {
      const imageIds: string[] = [];
      for (const file of images) {
        const uploaded = await api.uploadImage('post', file);
        if (uploaded.image) imageIds.push(uploaded.image.id);
      }
      const { id } = await api.createThread({ category, title, body, imageIds });
      onPosted(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not post.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cm-card">
      <h2>Start a discussion</h2>
      <label>Category
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label>Title<input value={title} maxLength={140} onChange={(e) => setTitle(e.target.value)} /></label>
      <label>Message<textarea value={body} maxLength={8000} rows={6} onChange={(e) => setBody(e.target.value)} /></label>
      {allowImages && (
        <label className="cm-file-field">Screenshots (optional, up to 4)
          <input type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={(e) => {
            const selected = Array.from(e.target.files ?? []).slice(0, 4);
            const problem = selected.map((file) => validateImage(file, 5 * 1024 * 1024)).find(Boolean);
            if (problem) { setError(problem); return; }
            setImages(selected);
          }} />
          {images.length > 0 && <span className="cm-muted">{images.length} image{images.length === 1 ? '' : 's'} selected</span>}
        </label>
      )}
      {error && <p className="cm-error">{error}</p>}
      <button className="btn primary" disabled={busy || !title.trim() || !body.trim()} onClick={() => void post()}>
        {busy ? 'Posting…' : 'Post'}
      </button>
    </div>
  );
}

function ThreadView({ id, me }: { id: string; me: CommunityProfile | null }) {
  const [data, setData] = useState<{ thread: ThreadSummary; posts: CommunityPost[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [images, setImages] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.readThread(id).then(setData).catch((e) => setError(e.message));
  }, [id]);
  useEffect(load, [load]);

  if (error) return <p className="cm-error">{error}</p>;
  if (!data) return <p className="cm-muted">Loading…</p>;

  const send = async () => {
    setBusy(true);
    try {
      const imageIds: string[] = [];
      for (const file of images) {
        const uploaded = await api.uploadImage('post', file);
        if (uploaded.image) imageIds.push(uploaded.image.id);
      }
      await api.createPost(id, reply, imageIds);
      setReply('');
      setImages([]);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reply.');
    } finally {
      setBusy(false);
    }
  };

  const report = async (postId: string) => {
    const reason = window.prompt('What is wrong with this post?');
    if (!reason) return;
    try {
      await api.reportPost(postId, reason);
      window.alert('Thanks — a moderator will look at it.');
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Could not report.');
    }
  };

  return (
    <>
      <button className="cm-back" onClick={() => go('')}>← All discussions</button>
      <h1>{data.thread.title}</h1>
      <ol className="cm-posts">
        {data.posts.map((post) => (
          <li key={post.id} className={post.hidden ? 'cm-post cm-hidden' : 'cm-post'}>
            {post.hidden ? (
              <p className="cm-muted">This post was removed by a moderator.</p>
            ) : (
              <>
                <div className="cm-post-head">
                  <Avatar author={post.author} />
                  <button className="cm-linkish" onClick={() => go(`?profile=${post.author?.handle}`)}>
                    {post.author?.displayName}
                  </button>
                  {post.author && <MemberMeta author={post.author} />}
                  <span className="cm-muted">{ago(post.createdAt)}{post.editedAt ? ' · edited' : ''}</span>
                  {me && (
                    <button className="cm-report" onClick={() => void report(post.id)}>Report</button>
                  )}
                </div>
                <Body text={post.body ?? ''} />
                <PostImages images={post.images} />
              </>
            )}
          </li>
        ))}
      </ol>
      {data.thread.locked ? (
        <p className="cm-muted">This discussion is closed.</p>
      ) : me ? (
        <div className="cm-card">
          <label>Reply<textarea value={reply} rows={5} maxLength={8000} onChange={(e) => setReply(e.target.value)} /></label>
          {canPostImages(me) && (
            <label className="cm-file-field">Screenshots (optional, up to 4)
              <input type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={(e) => {
                const selected = Array.from(e.target.files ?? []).slice(0, 4);
                const problem = selected.map((file) => validateImage(file, 5 * 1024 * 1024)).find(Boolean);
                if (problem) { setError(problem); return; }
                setImages(selected);
              }} />
              {images.length > 0 && <span className="cm-muted">{images.length} image{images.length === 1 ? '' : 's'} selected</span>}
            </label>
          )}
          <button className="btn primary" disabled={busy || !reply.trim()} onClick={() => void send()}>
            {busy ? 'Posting…' : 'Reply'}
          </button>
        </div>
      ) : <SignInPrompt what="reply" />}
    </>
  );
}

function ProfileView({ handle }: { handle: string }) {
  const [data, setData] = useState<{ profile: CommunityProfile; threads: ThreadSummary[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api.readProfile(handle).then(setData).catch((e) => setError(e.message)); }, [handle]);
  if (error) return <p className="cm-error">{error}</p>;
  if (!data) return <p className="cm-muted">Loading…</p>;
  return (
    <>
      <button className="cm-back" onClick={() => go('')}>← All discussions</button>
      <div className="cm-profile-head">
        <Avatar author={data.profile} />
        <div>
          <h1>{data.profile.displayName}</h1>
          <p className="cm-muted">@{data.profile.handle}</p>
          <MemberMeta author={data.profile} />
        </div>
      </div>
      {data.profile.bio && <Body text={data.profile.bio} />}
      <h2>Recent discussions</h2>
      <ul className="cm-threads">
        {data.threads.map((t) => (
          <li key={t.id}>
            <button className="cm-linkish" onClick={() => go(`?thread=${t.id}`)}>{t.title}</button>
          </li>
        ))}
      </ul>
    </>
  );
}

function ModeratorPanel({ onClose }: { onClose: () => void }) {
  const [reports, setReports] = useState<CommunityReport[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api.listReports().then((data) => setReports(data.reports)).catch((err) => {
      setError(err instanceof Error ? err.message : 'Could not load reports.');
    });
  }, []);
  useEffect(load, [load]);

  const act = async (report: CommunityReport, action: string, id: string, extra?: Record<string, unknown>) => {
    setBusy(report.id);
    setError(null);
    try {
      await api.moderate(action, id, extra);
      if (action !== 'resolveReport') await api.moderate('resolveReport', report.id);
      setReports((current) => current.filter((item) => item.id !== report.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Moderation action failed.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <button className="cm-back" onClick={onClose}>← Community</button>
      <h1>Moderator queue</h1>
      <p className="cm-muted">AI labels only help prioritise reports. Every action below is decided by you.</p>
      {error && <p className="cm-error">{error}</p>}
      {reports.length === 0 && !error && <p className="cm-muted">No unresolved reports.</p>}
      <ul className="cm-posts">
        {reports.map((report) => (
          <li key={report.id} className="cm-post">
            <div className="cm-post-head">
              <strong>@{report.handle}</strong>
              <span className="cm-muted">{ago(report.created_at)}</span>
              {report.ai_verdict && <span className="cm-muted">AI: {report.ai_verdict}</span>}
            </div>
            <p><strong>Report:</strong> {report.reason}</p>
            <Body text={report.body} />
            <div className="cm-cats">
              <button disabled={busy === report.id} onClick={() => go(`?thread=${report.thread_id}`)}>Open thread</button>
              <button disabled={busy === report.id} onClick={() => void act(report, 'hidePost', report.post_id)}>Hide post</button>
              <button disabled={busy === report.id} onClick={() => void act(report, 'lock', report.thread_id)}>Lock thread</button>
              <button disabled={busy === report.id} onClick={() => void act(report, 'ban', report.handle, { days: 7 })}>Ban 7 days</button>
              <button disabled={busy === report.id} onClick={() => void act(report, 'resolveReport', report.id)}>Dismiss report</button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

export default function CommunityApp() {
  const account = useAuthStore((s) => s.account);
  const [route, setRoute] = useState(() => new URLSearchParams(window.location.search));
  const [categories, setCategories] = useState<Category[]>([]);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [category, setCategory] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<CommunityProfile | null>(null);
  const [composing, setComposing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [moderating, setModerating] = useState(false);

  useEffect(() => {
    const onPop = () => setRoute(new URLSearchParams(window.location.search));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const load = useCallback(() => {
    api.listThreads(category)
      .then((d) => { setCategories(d.categories); setThreads(d.threads); })
      .catch((e) => setError(e.message));
  }, [category]);
  useEffect(load, [load]);

  // The profile is fetched only once someone is signed in — this is also what
  // creates it on the server, so a first-time visitor gets an identity without
  // ever seeing a registration form.
  useEffect(() => {
    if (!account) { setMe(null); return; }
    api.readMe().then((d) => setMe(d.profile)).catch(() => setMe(null));
  }, [account]);

  const threadId = route.get('thread');
  const profileHandle = route.get('profile');

  return (
    <div className="cm-shell">
      <header className="cm-head">
        <a className="cm-brand" href="/">
          <img src="/brand-icon.png" alt="" width="34" height="34" />
          <span>HomeDesigner</span>
        </a>
        <nav>
          <a className="cm-nav-button" href="/app/">Open the app</a>
          {me && (me.role === 'admin' || me.role === 'moderator') && (
            <button className="cm-nav-button" onClick={() => setModerating(true)}>Moderate</button>
          )}
          {me
            ? <button className="cm-nav-button cm-account-button" onClick={() => setEditing((v) => !v)}>
                <Avatar author={me} /><span>@{me.handle}</span>
              </button>
            : null}
        </nav>
      </header>

      <main className="cm-main">
        {!api.isCommunityConfigured() ? (
          <p className="cm-error">The community is not available yet.</p>
        ) : moderating && me && (me.role === 'admin' || me.role === 'moderator') ? (
          <ModeratorPanel onClose={() => setModerating(false)} />
        ) : threadId ? (
          <ThreadView id={threadId} me={me} />
        ) : profileHandle ? (
          <ProfileView handle={profileHandle} />
        ) : (
          <>
            <h1>Community &amp; support</h1>
            <p className="cm-muted">
              Ask a question, share a design, or tell us what to build next.
              Reading is open to everyone; posting needs a Google sign-in.
            </p>

            {editing && me && <ProfileEditor profile={me} onSaved={(p) => { setMe(p); setEditing(false); }} />}

            <div className="cm-cats">
              <button className={!category ? 'active' : ''} onClick={() => setCategory(undefined)}>All</button>
              {categories.map((c) => (
                <button key={c.id} className={category === c.id ? 'active' : ''}
                  onClick={() => setCategory(c.id)} title={c.blurb}>{c.name}</button>
              ))}
            </div>

            {account
              ? (composing
                ? <Composer categories={categories} allowImages={canPostImages(me)}
                    onPosted={(id) => { setComposing(false); go(`?thread=${id}`); }} />
                : <button className="btn primary" onClick={() => setComposing(true)}>Start a discussion</button>)
              : <SignInPrompt what="post" />}

            {error && <p className="cm-error">{error}</p>}
            {threads.length === 0 && !error && (
              <p className="cm-muted">No discussions yet. Be the first.</p>
            )}
            <ul className="cm-threads">
              {threads.map((t) => (
                <li key={t.id} className="cm-thread">
                  <Avatar author={t.author} />
                  <div>
                    <button className="cm-linkish cm-thread-title" onClick={() => go(`?thread=${t.id}`)}>
                      {t.title}
                    </button>
                    <MemberMeta author={t.author} />
                    <p className="cm-muted">
                      {t.author.displayName} · {ago(t.lastPostAt)} · {t.replyCount} {t.replyCount === 1 ? 'reply' : 'replies'}
                      {t.locked ? ' · closed' : ''}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>

      <footer className="cm-foot">
        <a href="/privacy.html">Privacy</a>
        <span className="cm-muted">Be kind. Posts that attack people rather than ideas get removed.</span>
      </footer>
    </div>
  );
}
