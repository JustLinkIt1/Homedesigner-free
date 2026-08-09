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
import type { Category, CommunityPost, CommunityProfile, ThreadSummary } from '../lib/community';

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
  return author.avatarUrl
    ? <img className="cm-avatar" src={author.avatarUrl} alt="" width={36} height={36} loading="lazy" />
    : <span className="cm-avatar cm-avatar-initial" aria-hidden>{author.displayName.charAt(0).toUpperCase()}</span>;
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

  return (
    <div className="cm-card">
      <h2>Your profile</h2>
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

function Composer({ categories, onPosted }: { categories: Category[]; onPosted: (id: string) => void }) {
  const [category, setCategory] = useState(categories[0]?.id ?? 'general');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const post = async () => {
    setBusy(true);
    setError(null);
    try {
      const { id } = await api.createThread({ category, title, body });
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
      {error && <p className="cm-error">{error}</p>}
      <button className="btn primary" disabled={busy || !title.trim() || !body.trim()} onClick={() => void post()}>
        {busy ? 'Posting…' : 'Post'}
      </button>
    </div>
  );
}

function ThreadView({ id, signedIn }: { id: string; signedIn: boolean }) {
  const [data, setData] = useState<{ thread: ThreadSummary; posts: CommunityPost[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState('');
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
      await api.createPost(id, reply);
      setReply('');
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
                  <span className="cm-muted">{ago(post.createdAt)}{post.editedAt ? ' · edited' : ''}</span>
                  {signedIn && (
                    <button className="cm-report" onClick={() => void report(post.id)}>Report</button>
                  )}
                </div>
                <Body text={post.body ?? ''} />
              </>
            )}
          </li>
        ))}
      </ol>
      {data.thread.locked ? (
        <p className="cm-muted">This discussion is closed.</p>
      ) : signedIn ? (
        <div className="cm-card">
          <label>Reply<textarea value={reply} rows={5} maxLength={8000} onChange={(e) => setReply(e.target.value)} /></label>
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
        <a className="cm-brand" href="/">HomeDesigner</a>
        <nav>
          <a href="/app/">Open the app</a>
          {me
            ? <button className="cm-linkish" onClick={() => setEditing((v) => !v)}>@{me.handle}</button>
            : null}
        </nav>
      </header>

      <main className="cm-main">
        {!api.isCommunityConfigured() ? (
          <p className="cm-error">The community is not available yet.</p>
        ) : threadId ? (
          <ThreadView id={threadId} signedIn={!!account} />
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
                ? <Composer categories={categories} onPosted={(id) => { setComposing(false); go(`?thread=${id}`); }} />
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
