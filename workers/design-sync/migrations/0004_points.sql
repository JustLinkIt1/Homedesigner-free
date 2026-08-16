-- AI points ledger. Points are a prepaid currency spent on metered AI features;
-- one point is worth $0.000375 of real compute (docs/AI_FEATURES_PLAN.md §2).
--
-- Two tables on purpose: `point_accounts` holds the authoritative balance so a
-- spend is a single conditional UPDATE that cannot race, and `point_ledger` is
-- an append-only audit trail. Never derive the balance by summing the ledger at
-- request time -- that turns every spend into a full scan of a table that only
-- grows.

CREATE TABLE IF NOT EXISTS point_accounts (
  subject TEXT PRIMARY KEY,
  -- May go negative on a refund or chargeback after the points were spent
  -- (guard G9). Spending is still refused while it is below zero.
  balance INTEGER NOT NULL DEFAULT 0,
  lifetime_granted INTEGER NOT NULL DEFAULT 0,
  lifetime_purchased INTEGER NOT NULL DEFAULT 0,
  lifetime_spent INTEGER NOT NULL DEFAULT 0,
  -- Set once, per verified account subject, never per install or device (G10).
  free_grant_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS point_ledger (
  -- The caller's idempotency key. A retried spend or a replayed purchase
  -- acknowledgement collides here rather than double-charging.
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('grant', 'purchase', 'spend', 'refund', 'adjust')),
  -- Signed: spends are negative, everything else positive except adjustments.
  delta INTEGER NOT NULL,
  feature TEXT,
  -- Worst-case real cost of the dispatched job, in USD millionths. Summed to
  -- reconcile what we actually owe against what the point scale assumed.
  cost_micros INTEGER,
  balance_after INTEGER NOT NULL,
  -- Play purchase token, generation job id, or the spend row a refund reverses.
  ref TEXT,
  -- Cost-table version in force when this row was written (G7), so a later
  -- price change stays auditable instead of silently rewriting history.
  price_version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_point_ledger_subject_created
  ON point_ledger(subject, created_at DESC);

-- Refunds look up the spend they reverse by its ref.
CREATE INDEX IF NOT EXISTS idx_point_ledger_ref
  ON point_ledger(ref);

-- Monthly free-grant ceiling (G10) counts grants in a window without scanning
-- the whole ledger.
CREATE INDEX IF NOT EXISTS idx_point_ledger_kind_created
  ON point_ledger(kind, created_at DESC);
