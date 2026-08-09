-- First-party community media and public contribution counters.
--
-- Images live in the existing private USER_DATA R2 bucket. D1 stores only the
-- opaque object key and the relationship to a profile or post, so the bucket
-- never needs to be public and arbitrary third-party image URLs are impossible.

ALTER TABLE profiles ADD COLUMN avatar_image_id TEXT;
ALTER TABLE profiles ADD COLUMN post_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS community_images (
  id          TEXT PRIMARY KEY,
  owner       TEXT NOT NULL REFERENCES profiles(subject) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('avatar', 'post')),
  object_key  TEXT NOT NULL UNIQUE,
  mime_type   TEXT NOT NULL,
  byte_size   INTEGER NOT NULL,
  post_id     TEXT REFERENCES posts(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS community_images_by_owner
  ON community_images (owner, kind, created_at DESC);
CREATE INDEX IF NOT EXISTS community_images_by_post
  ON community_images (post_id, created_at);

-- Existing forum profiles used initials, but older clients/API callers could
-- opt into a Google-hosted picture. The new policy is explicit user uploads
-- only, so clear that legacy field and count existing contributions.
UPDATE profiles SET avatar_url = NULL;
UPDATE profiles
   SET post_count = (SELECT COUNT(*) FROM posts WHERE posts.author = profiles.subject);
