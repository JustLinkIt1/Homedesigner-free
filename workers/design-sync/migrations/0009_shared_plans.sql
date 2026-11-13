-- A plan handed to someone by link (homedesignerapp.com/app/?plan=<id>).
-- `payload` is a small plan description (rooms, doors, windows, outside finish
-- and roof), not a project: the app builds and furnishes the project from it on
-- arrival. Rows are written by the site owner; the only public route reads one
-- row by its id. Deleting the row withdraws the link.
CREATE TABLE shared_plans (
  id TEXT PRIMARY KEY CHECK(length(id) BETWEEN 10 AND 24),
  payload TEXT NOT NULL CHECK(length(payload) <= 60000),
  note TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER,
  opened INTEGER NOT NULL DEFAULT 0,
  last_opened_at INTEGER
);
