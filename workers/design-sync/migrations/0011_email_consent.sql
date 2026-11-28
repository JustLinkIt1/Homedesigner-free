-- Product-update email opt-in (spec hd-email-optin, 28 Nov 2026).
-- Append-only proof of consent. One row per change; never UPDATEd.
-- Current state = the newest row (highest id) for the subject.
-- Nobody gets product email unless their newest row has opted_in = 1.
-- Undo: DROP TABLE email_consent_log;
CREATE TABLE email_consent_log (
  id INTEGER PRIMARY KEY,
  subject TEXT NOT NULL,          -- Google sub (account id)
  email TEXT NOT NULL,            -- from the verified Google ID token, never typed
  opted_in INTEGER NOT NULL CHECK(opted_in IN (0,1)),
  wording TEXT NOT NULL CHECK(length(wording) <= 32),   -- toggle text version id, e.g. "optin-v1"
  lang TEXT NOT NULL CHECK(length(lang) <= 12),
  source TEXT NOT NULL CHECK(source IN ('signin','settings','unsubscribe_link','list_unsubscribe')),
  created_at INTEGER NOT NULL     -- ms UTC
);
CREATE INDEX email_consent_subject ON email_consent_log (subject, id);
