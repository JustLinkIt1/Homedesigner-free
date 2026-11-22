-- Anonymous first-session events from the app. `install` is a random id the
-- app makes for itself on first run (never an account, device or advertising
-- id). No IP address and no user agent are stored. Only the six event names the
-- route accepts are ever written.
CREATE TABLE hd_events (
  id INTEGER PRIMARY KEY,
  install TEXT NOT NULL CHECK(length(install) = 36),
  event TEXT NOT NULL,
  detail TEXT CHECK(detail IS NULL OR length(detail) <= 64),
  app_version TEXT CHECK(app_version IS NULL OR length(app_version) <= 24),
  source TEXT CHECK(source IS NULL OR length(source) <= 64),
  day INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX hd_events_install_day ON hd_events (install, day);
CREATE INDEX hd_events_day_event ON hd_events (day, event);
