-- Purchase settlement must not use a balance sentinel: chargebacks can leave
-- real balances negative. Legacy -1 rows are ambiguous and require reconciliation
-- against their provider receipt; never automatically credit them a second time.
ALTER TABLE point_ledger ADD COLUMN purchase_settled INTEGER NOT NULL DEFAULT 0
  CHECK (purchase_settled IN (0, 1));
UPDATE point_ledger SET purchase_settled = 1
  WHERE kind = 'purchase' AND balance_after != -1;

-- An old Worker may finish a credit while the new Worker is deploying. Its last
-- step updates balance_after only AFTER crediting the account. Mark that write
-- settled too, including a legitimate -1 resulting balance. Do not infer that
-- existing -1 rows completed: those remain on the manual reconciliation list.
CREATE TRIGGER point_purchase_legacy_settlement
AFTER UPDATE OF balance_after ON point_ledger
WHEN NEW.kind = 'purchase' AND NEW.purchase_settled = 0
  AND NEW.ref IS NOT NULL AND NEW.ref NOT LIKE 'pending-purchase:%'
BEGIN
  UPDATE point_ledger SET purchase_settled = 1 WHERE id = NEW.id;
END;
