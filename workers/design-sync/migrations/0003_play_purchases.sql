-- Verified Google Play one-time purchases. Tokens are opaque store receipts;
-- they are never returned by the Worker or exposed in public diagnostics.
CREATE TABLE IF NOT EXISTS play_purchases (
  purchase_token TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  order_id TEXT,
  purchased_at INTEGER,
  account_subject TEXT,
  linked_at INTEGER,
  status TEXT NOT NULL CHECK (status IN ('active', 'revoked')),
  last_verified_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_play_purchases_account_status
  ON play_purchases(account_subject, status);
