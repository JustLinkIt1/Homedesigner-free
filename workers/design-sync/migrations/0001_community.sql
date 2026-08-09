-- Community forum: profiles, threads, posts, reports.
--
-- D1 (SQLite) rather than the R2 bucket the rest of this Worker uses. R2 is
-- object storage: no ordering, no pagination, no counting, no joins. A forum is
-- nothing BUT ordering and pagination, so listing "newest threads in a category"
-- would mean fetching every object and sorting in memory — fine at ten threads,
-- broken at ten thousand.
--
-- Every table carries `hidden` rather than deleting rows: moderation must be
-- reversible, and a hard delete of a post orphans the replies that quote it.
-- Actual erasure is reserved for GDPR account deletion (see /v1/account).

CREATE TABLE IF NOT EXISTS profiles (
  -- The Google `sub` claim. Stable, opaque, and already what the sync Worker
  -- keys user data on, so a forum profile and a design library agree on who
  -- someone is without a second identity system.
  subject       TEXT PRIMARY KEY,
  handle        TEXT NOT NULL UNIQUE,
  display_name  TEXT NOT NULL,
  bio           TEXT NOT NULL DEFAULT '',
  -- Legacy field retained for migration compatibility. Profile pictures are
  -- opt-in uploads referenced by avatar_image_id after migration 0002.
  avatar_url    TEXT,
  role          TEXT NOT NULL DEFAULT 'member',
  -- Epoch ms. Null means not banned; a past value means the ban has expired,
  -- which lets a temporary ban lapse without a scheduled job.
  banned_until  INTEGER,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

-- Handles are compared case-insensitively so "Nathan" cannot impersonate
-- "nathan". SQLite needs this as its own index; UNIQUE above is case-sensitive.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_handle_ci ON profiles (lower(handle));

CREATE TABLE IF NOT EXISTS threads (
  id            TEXT PRIMARY KEY,
  category      TEXT NOT NULL,
  title         TEXT NOT NULL,
  author        TEXT NOT NULL REFERENCES profiles(subject),
  created_at    INTEGER NOT NULL,
  -- Denormalised so the category listing never joins against posts. A forum
  -- index page is read constantly and written rarely; paying on write is right.
  last_post_at  INTEGER NOT NULL,
  reply_count   INTEGER NOT NULL DEFAULT 0,
  locked        INTEGER NOT NULL DEFAULT 0,
  hidden        INTEGER NOT NULL DEFAULT 0
);

-- Column order matches the listing query's WHERE then ORDER BY, so SQLite can
-- satisfy both from the index without a sort.
CREATE INDEX IF NOT EXISTS threads_by_category
  ON threads (category, hidden, last_post_at DESC);
CREATE INDEX IF NOT EXISTS threads_by_author ON threads (author);

CREATE TABLE IF NOT EXISTS posts (
  id          TEXT PRIMARY KEY,
  thread_id   TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  author      TEXT NOT NULL REFERENCES profiles(subject),
  body        TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  edited_at   INTEGER,
  hidden      INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS posts_by_thread ON posts (thread_id, created_at);
CREATE INDEX IF NOT EXISTS posts_by_author ON posts (author);

CREATE TABLE IF NOT EXISTS reports (
  id          TEXT PRIMARY KEY,
  post_id     TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  reporter    TEXT NOT NULL REFERENCES profiles(subject),
  reason      TEXT NOT NULL,
  -- Workers AI's read on the post at report time. Advisory only: it sorts the
  -- queue, it never hides anything on its own.
  ai_verdict  TEXT,
  created_at  INTEGER NOT NULL,
  resolved    INTEGER NOT NULL DEFAULT 0
);

-- One report per person per post: a brigade should raise one flag, not fifty.
CREATE UNIQUE INDEX IF NOT EXISTS reports_once ON reports (post_id, reporter);
CREATE INDEX IF NOT EXISTS reports_open ON reports (resolved, created_at DESC);
