-- Private jobs. All charges/allowances/refunds commit with the job transition.
CREATE TABLE ai_render_jobs (
  id TEXT NOT NULL,
  subject TEXT NOT NULL,
  allowance_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('reserved','queued','complete','failed')),
  charge INTEGER NOT NULL CHECK(charge >= 0),
  price_version INTEGER NOT NULL,
  request_id TEXT,
  result_url TEXT,
  error TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(subject, id)
);
CREATE INDEX ai_render_jobs_created ON ai_render_jobs(created_at);
CREATE TABLE ai_render_allowances (
  subject TEXT PRIMARY KEY,
  job_id TEXT NOT NULL
);
CREATE TRIGGER ai_render_guard BEFORE INSERT ON ai_render_jobs BEGIN
  SELECT RAISE(ABORT, 'render free budget limit') WHERE (
    SELECT COUNT(*) FROM ai_render_jobs WHERE charge = 0 AND created_at > NEW.created_at - 2592000000
  ) >= 5000 AND NEW.charge = 0;
  SELECT RAISE(ABORT, 'render already active') WHERE EXISTS (
    SELECT 1 FROM ai_render_jobs WHERE subject = NEW.subject AND status IN ('reserved','queued')
  );
  SELECT RAISE(ABORT, 'render daily limit') WHERE (
    SELECT COUNT(*) FROM ai_render_jobs WHERE subject = NEW.subject AND created_at > NEW.created_at - 86400000
  ) >= 20;
  SELECT RAISE(ABORT, 'insufficient points') WHERE NEW.charge > COALESCE((
    SELECT balance FROM point_accounts WHERE subject = NEW.subject
  ), 0);
END;
CREATE TRIGGER ai_render_reserve AFTER INSERT ON ai_render_jobs BEGIN
  INSERT INTO ai_render_allowances(subject, job_id)
    SELECT NEW.allowance_key, NEW.id WHERE NEW.charge = 0;
  UPDATE point_accounts SET balance = balance - NEW.charge,
    lifetime_spent = lifetime_spent + NEW.charge, updated_at = NEW.created_at
    WHERE subject = NEW.subject AND NEW.charge > 0;
  INSERT INTO point_ledger(id, subject, kind, delta, feature, cost_micros, balance_after, ref, price_version, created_at)
    SELECT 'ai_render:' || NEW.subject || ':' || NEW.id, NEW.subject, 'spend', -NEW.charge,
      'ai_render', 40000, balance, NEW.id, NEW.price_version, NEW.created_at
    FROM point_accounts WHERE subject = NEW.subject AND NEW.charge > 0;
END;
CREATE TRIGGER ai_render_refund AFTER UPDATE OF status ON ai_render_jobs
WHEN NEW.status = 'failed' AND OLD.status != 'failed' BEGIN
  UPDATE point_accounts SET balance = balance + NEW.charge,
    lifetime_spent = lifetime_spent - NEW.charge WHERE subject = NEW.subject AND NEW.charge > 0;
  INSERT INTO point_ledger(id, subject, kind, delta, feature, cost_micros, balance_after, ref, price_version, created_at)
    SELECT 'refund:ai_render:' || NEW.subject || ':' || NEW.id, NEW.subject, 'refund', NEW.charge,
      'ai_render', NULL, balance, NEW.id, NEW.price_version, NEW.created_at
    FROM point_accounts WHERE subject = NEW.subject AND NEW.charge > 0;
  DELETE FROM ai_render_allowances WHERE subject = NEW.allowance_key AND job_id = NEW.id AND NEW.charge = 0;
END;
