/**
 * AI points: the metered currency behind the Workers AI features.
 *
 * The rules this file exists to make unbreakable are the guards in
 * `docs/AI_FEATURES_PLAN.md` §4. The important ones structurally:
 *
 * - G1/G2 price against the *worst case* and refuse to sell below the floor.
 *   `assertPricingIsSolvent()` runs at module load, so a bad edit to the table
 *   fails the Worker at startup rather than at the till.
 * - G3 the client is never the authority on a balance. Nothing here accepts a
 *   balance, a price or a point count from a request body.
 * - G7 the cost table lives here, server-side and versioned. An old install
 *   must never be able to charge last year's rate.
 */

/** Real compute a single point is sold to cover. */
export const USD_PER_POINT = 0.000375;

/**
 * Bumped whenever a price or point cost below changes. Written onto every
 * ledger row so history stays readable after a repricing.
 */
export const PRICE_VERSION = 4;

/**
 * Google's cut. The plan models both tiers and notes the 30% case is the one
 * that quietly breaks a plan built on 15% -- so the floor guard assumes 30%
 * until the tier is confirmed on the dashboard. Being wrong in this direction
 * refuses a sale; being wrong the other way makes one at a loss.
 */
export const PLAY_FEE_RATE = 0.30;

export type FeatureId =
  | 'ai_render'
  | 'ai_render_clean'
  | 'room_naming'
  | 'colour_scheme'
  | 'listing_description'
  | 'auto_furnish'
  | 'text_to_layout'
  | 'design_review'
  | 'voice_tour'
  | 'plan_design';

interface FeaturePrice {
  /** Points charged. Must satisfy G1 against `maxCostUsd`. */
  points: number;
  /**
   * Worst-case real cost of one call, including *every* add-on the endpoint
   * can charge for. Not the typical cost -- G1 is explicit about this.
   */
  maxCostUsd: number;
  label: string;
}

/**
 * Workers AI figures are the only ones in the plan not verified against a
 * vendor price page. They are also ~1/500th of a 3D generation, so the blast
 * radius of the estimate being wrong is small -- but they are deliberately
 * rounded *up* here.
 */
export const FEATURES: Record<FeatureId, FeaturePrice> = {
  /**
   * One AI render: with the homedesignerapp.com watermark, or clean for Pro.
   * A free account pays the small premium below to drop the watermark. Both
   * cost the same to make: ~1,000 prepaid ElevenLabs credits, or $0.04 when
   * fal renders it as the backup.
   */
  ai_render: { points: 150, maxCostUsd: 0.04, label: 'AI render' },
  ai_render_clean: { points: 200, maxCostUsd: 0.04, label: 'AI render without watermark' },
  room_naming: { points: 10, maxCostUsd: 0.0002, label: 'Room naming' },
  colour_scheme: { points: 25, maxCostUsd: 0.0005, label: 'Colour scheme' },
  listing_description: { points: 25, maxCostUsd: 0.0005, label: 'Description' },
  auto_furnish: { points: 50, maxCostUsd: 0.001, label: 'Auto-furnish' },
  text_to_layout: { points: 100, maxCostUsd: 0.002, label: 'Text to layout' },
  /**
   * Claude Opus 5.5 at $4 in / $20 out per million tokens, from the caps in
   * ai-advisor.ts: up to ~4,800 input tokens (prompt, plan text, one picture
   * of at most 1100px) = $0.019, plus REVIEW_MAX_TOKENS of output = $0.048.
   */
  design_review: { points: 200, maxCostUsd: 0.068, label: 'Designer review' },
  /**
   * The script: ~2,600 input tokens ($0.011) plus TOUR_MAX_TOKENS of output
   * ($0.030). The narration: MAX_TOUR_CHARS on ElevenLabs Flash at $0.04 per
   * 1,000 characters ($0.036). Priced at list rates on purpose -- startup
   * credits make the early calls free, and the price has to still hold on the
   * day they run out.
   */
  voice_tour: { points: 250, maxCostUsd: 0.078, label: 'Voice tour' },
  /**
   * One plan, new or revised: the same call either way, so the same price.
   * Up to ~5,000 input tokens (instructions, brief, and the current plan when
   * revising) = $0.020, plus PLAN_MAX_TOKENS of output at medium effort =
   * $0.080. See ai-plan.ts for the caps.
   */
  plan_design: { points: 300, maxCostUsd: 0.1, label: 'AI plan' },
};

/**
 * What designing one room end to end actually costs: a generated layout, a
 * furnishing pass, a colour scheme and a name.
 *
 * This exists so packs can be advertised in units of *work* ("about 10 rooms")
 * rather than an abstract point count. It is the honest version of a
 * conversion lever: it makes the value of a pack legible instead of pressuring
 * anyone, and it is computed here rather than in the client so an old install
 * cannot quote a stale figure (G7).
 */
export const TYPICAL_ROOM_POINTS =
  100 /* text_to_layout */ + 50 /* auto_furnish */ + 25 /* colour_scheme */ + 10 /* room_naming */;

/** Point packs, in the order they are offered. Prices are list, in USD. */
export const PACKS = [
  { id: 'points_2000', points: 2_000, usd: 1.99, label: 'Starter' },
  { id: 'points_6000', points: 6_000, usd: 5.99, label: 'Popular' },
  { id: 'points_15000', points: 15_000, usd: 14.99, label: 'Studio' },
] as const;

/** Pro's standing discount on point purchases. */
export const PRO_DISCOUNT = 0.30;

/**
 * One grant per verified account subject (G10), never per install.
 *
 * Sized to cover one complete room end to end -- layout, furnishing, colours
 * and naming is ~185 points -- and then to do it a second time, because a
 * first attempt is rarely the one someone keeps. That is enough to show what
 * the features actually do; it is deliberately not enough to live on.
 */
export const FREE_GRANT_POINTS = 400;

/**
 * Ceiling on free grants issued in a rolling month, counted in **grants**.
 *
 * The second half of G10: the per-subject flag stops one person farming, this
 * stops a bulk signup run doing it at scale. Counting points here instead of
 * grants was a real bug -- at a 1,000-point grant a 10,000-*point* ceiling is
 * ten users a month, which would have throttled ordinary signups rather than
 * abuse.
 *
 * AI render is now a Pro-only metered feature: a Pro account can spend this
 * grant on two renders ($0.08), in addition to its separate free render.
 * Unsubscribed accounts still cannot dispatch the fal render endpoint.
 */
export const MAX_FREE_GRANTS_PER_MONTH = 5_000;

/**
 * G1: points charged must cover the worst case the endpoint can bill.
 * G2: net revenue per point must never fall below the real cost per point.
 *
 * Throws rather than returning a flag: there is no sensible degraded mode for
 * "we are configured to sell at a loss".
 */
export function assertPricingIsSolvent(): void {
  for (const [id, price] of Object.entries(FEATURES)) {
    const required = Math.ceil(price.maxCostUsd / USD_PER_POINT);
    if (price.points < required) {
      throw new Error(
        `Points table violates G1: ${id} charges ${price.points} but its worst case needs ${required}`,
      );
    }
  }

  for (const pack of PACKS) {
    // The worst case a pack can be sold at: Pro's discount on top of Play's cut.
    const netPerPoint = (pack.usd * (1 - PRO_DISCOUNT) * (1 - PLAY_FEE_RATE)) / pack.points;
    if (netPerPoint < USD_PER_POINT) {
      throw new Error(
        `Pack ${pack.id} violates G2: nets $${netPerPoint.toFixed(6)}/point against a $${USD_PER_POINT} cost`,
      );
    }
  }
}

assertPricingIsSolvent();

/**
 * G4: the max cost of *this* job from *its actual options*, not the feature's
 * headline price. Today every metered feature is a flat Workers AI call, so
 * this is a lookup -- but it is the seam a future add-on has to pass through,
 * which is the whole point of it existing before there is an add-on.
 */
export function maxCostUsdFor(feature: FeatureId, _options: Record<string, unknown> = {}): number {
  return FEATURES[feature].maxCostUsd;
}

export function pointsFor(feature: FeatureId, options: Record<string, unknown> = {}): number {
  const listed = FEATURES[feature].points;
  const required = Math.ceil(maxCostUsdFor(feature, options) / USD_PER_POINT);
  // If a job's actual options cost more than the headline, charge the real
  // requirement. This is what stops a new flag going unpriced (G4).
  return Math.max(listed, required);
}

export interface PointAccount {
  subject: string;
  balance: number;
  lifetimeGranted: number;
  lifetimePurchased: number;
  lifetimeSpent: number;
  freeGrantAt: number | null;
}

interface AccountRow {
  subject: string;
  balance: number;
  lifetime_granted: number;
  lifetime_purchased: number;
  lifetime_spent: number;
  free_grant_at: number | null;
}

function toAccount(row: AccountRow): PointAccount {
  return {
    subject: row.subject,
    balance: row.balance,
    lifetimeGranted: row.lifetime_granted,
    lifetimePurchased: row.lifetime_purchased,
    lifetimeSpent: row.lifetime_spent,
    freeGrantAt: row.free_grant_at,
  };
}

export async function readAccount(db: D1Database, subject: string): Promise<PointAccount> {
  const row = await db
    .prepare(
      `SELECT subject, balance, lifetime_granted, lifetime_purchased, lifetime_spent, free_grant_at
       FROM point_accounts WHERE subject = ?`,
    )
    .bind(subject)
    .first<AccountRow>();
  if (row) return toAccount(row);
  return {
    subject,
    balance: 0,
    lifetimeGranted: 0,
    lifetimePurchased: 0,
    lifetimeSpent: 0,
    freeGrantAt: null,
  };
}

async function ensureAccount(db: D1Database, subject: string, now: number): Promise<void> {
  await db
    .prepare(
      `INSERT INTO point_accounts (subject, created_at, updated_at)
       VALUES (?, ?, ?) ON CONFLICT(subject) DO NOTHING`,
    )
    .bind(subject, now, now)
    .run();
}

async function writeLedger(
  db: D1Database,
  entry: {
    id: string;
    subject: string;
    kind: 'grant' | 'purchase' | 'spend' | 'refund' | 'adjust';
    delta: number;
    feature: string | null;
    costMicros: number | null;
    balanceAfter: number;
    ref: string | null;
    now: number;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO point_ledger
         (id, subject, kind, delta, feature, cost_micros, balance_after, ref, price_version, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
    )
    .bind(
      entry.id,
      entry.subject,
      entry.kind,
      entry.delta,
      entry.feature,
      entry.costMicros,
      entry.balanceAfter,
      entry.ref,
      PRICE_VERSION,
      entry.now,
    )
    .run();
}

export type SpendResult =
  | { ok: true; charged: number; balance: number; spendId: string; replay: boolean }
  | { ok: false; reason: 'insufficient'; balance: number; required: number }
  | { ok: false; reason: 'key_reused'; balance: number };

/**
 * G3: deducts server-side, before any dispatch.
 *
 * D1 batch is transactional: claim the unique ledger key, debit only an
 * unsettled claim, and settle its balance together. A race or process failure
 * cannot separate the debit from its idempotency record. Replays never dispatch
 * more provider work; `runMetered` refuses them explicitly.
 */
export async function spendPoints(
  db: D1Database,
  subject: string,
  feature: FeatureId,
  idempotencyKey: string,
  options: Record<string, unknown> = {},
): Promise<SpendResult> {
  const now = Date.now();
  const cost = pointsFor(feature, options);

  await ensureAccount(db, subject, now);
  const result = await db.batch([
    db.prepare(`INSERT INTO point_ledger
      (id, subject, kind, delta, feature, cost_micros, balance_after, ref, price_version, created_at)
      SELECT ?, subject, 'spend', ?, ?, ?, -1, ?, ?, ? FROM point_accounts
      WHERE subject = ? AND balance >= ? ON CONFLICT(id) DO NOTHING`)
      .bind(idempotencyKey, -cost, feature, Math.round(maxCostUsdFor(feature, options) * 1_000_000), idempotencyKey, PRICE_VERSION, now, subject, cost),
    db.prepare(`UPDATE point_accounts SET balance = balance - ?, lifetime_spent = lifetime_spent + ?, updated_at = ?
      WHERE subject = ? AND EXISTS (SELECT 1 FROM point_ledger
      WHERE id = ? AND subject = ? AND kind = 'spend' AND balance_after = -1)`)
      .bind(cost, cost, now, subject, idempotencyKey, subject),
    db.prepare(`UPDATE point_ledger SET balance_after = (SELECT balance FROM point_accounts WHERE subject = ?)
      WHERE id = ? AND subject = ? AND kind = 'spend' AND balance_after = -1`)
      .bind(subject, idempotencyKey, subject),
  ]);
  const account = await readAccount(db, subject);
  if ((result[0].meta.changes ?? 0) > 0) {
    return { ok: true, charged: cost, balance: account.balance, spendId: idempotencyKey, replay: false };
  }
  const existing = await db.prepare(`SELECT subject, kind, feature, delta FROM point_ledger WHERE id = ?`)
    .bind(idempotencyKey).first<{ subject: string; kind: string; feature: string; delta: number }>();
  if (!existing) return { ok: false, reason: 'insufficient', balance: account.balance, required: cost };
  const reversed = await db.prepare(`SELECT 1 AS hit FROM point_ledger WHERE id = ?`)
    .bind(`refund:${idempotencyKey}`).first<{ hit: number }>();
  if (reversed || existing.subject !== subject || existing.kind !== 'spend' || existing.feature !== feature || existing.delta !== -cost) {
    return { ok: false, reason: 'key_reused', balance: account.balance };
  }
  return { ok: true, charged: cost, balance: account.balance, spendId: idempotencyKey, replay: true };
}

/**
 * G5: a failed job returns its points. We may still owe the vendor for the
 * call -- that is the failure budget, and it is why the modelled margin is not
 * the gross margin.
 *
 * Keyed off the spend's id so a double refund is impossible.
 */
export async function refundPoints(
  db: D1Database,
  subject: string,
  spendId: string,
): Promise<{ refunded: number; balance: number }> {
  const now = Date.now();
  const spend = await db
    .prepare(`SELECT delta, feature FROM point_ledger WHERE id = ? AND subject = ? AND kind = 'spend'`)
    .bind(spendId, subject)
    .first<{ delta: number; feature: string | null }>();
  if (!spend) return { refunded: 0, balance: (await readAccount(db, subject)).balance };

  const amount = Math.abs(spend.delta);
  const refundId = `refund:${spendId}`;
  const pendingRef = `pending:${spendId}`;

  const result = await db.batch([
    db.prepare(`INSERT INTO point_ledger
      (id, subject, kind, delta, feature, cost_micros, balance_after, ref, price_version, created_at)
      VALUES (?, ?, 'refund', ?, ?, NULL, -1, ?, ?, ?) ON CONFLICT(id) DO NOTHING`)
      .bind(refundId, subject, amount, spend.feature, pendingRef, PRICE_VERSION, now),
    db.prepare(`UPDATE point_accounts SET balance = balance + ?, lifetime_spent = lifetime_spent - ?, updated_at = ?
      WHERE subject = ? AND EXISTS (SELECT 1 FROM point_ledger
      WHERE id = ? AND subject = ? AND kind = 'refund' AND ref = ?)`)
      .bind(amount, amount, now, subject, refundId, subject, pendingRef),
    db.prepare(`UPDATE point_ledger SET balance_after = (SELECT balance FROM point_accounts WHERE subject = ?), ref = ?
      WHERE id = ? AND subject = ? AND kind = 'refund' AND ref = ?`)
      .bind(subject, spendId, refundId, subject, pendingRef),
  ]);
  return { refunded: (result[0].meta.changes ?? 0) > 0 ? amount : 0, balance: (await readAccount(db, subject)).balance };
}

/**
 * G10: one grant per verified account subject, plus a rolling monthly ceiling.
 *
 * Callers must pass an identity that is `emailVerified`; an unverified Google
 * account is not a person for grant purposes.
 */
export async function grantFreePoints(
  db: D1Database,
  subject: string,
): Promise<{ granted: number; balance: number; reason?: 'already_granted' | 'ceiling' }> {
  const now = Date.now();
  await ensureAccount(db, subject, now);

  const account = await readAccount(db, subject);
  if (account.freeGrantAt) {
    return { granted: 0, balance: account.balance, reason: 'already_granted' };
  }

  const monthAgo = now - 30 * 24 * 60 * 60 * 1000;
  const issued = await db
    .prepare(`SELECT COUNT(*) AS grants FROM point_ledger WHERE kind = 'grant' AND created_at >= ?`)
    .bind(monthAgo)
    .first<{ grants: number }>();
  if ((issued?.grants ?? 0) >= MAX_FREE_GRANTS_PER_MONTH) {
    return { granted: 0, balance: account.balance, reason: 'ceiling' };
  }

  const updated = await db
    .prepare(
      `UPDATE point_accounts
         SET balance = balance + ?, lifetime_granted = lifetime_granted + ?, free_grant_at = ?, updated_at = ?
       WHERE subject = ? AND free_grant_at IS NULL
       RETURNING balance`,
    )
    .bind(FREE_GRANT_POINTS, FREE_GRANT_POINTS, now, now, subject)
    .first<{ balance: number }>();
  if (!updated) {
    // Lost the race against a concurrent grant; the other one applied.
    const fresh = await readAccount(db, subject);
    return { granted: 0, balance: fresh.balance, reason: 'already_granted' };
  }

  await writeLedger(db, {
    id: `grant:${subject}`,
    subject,
    kind: 'grant',
    delta: FREE_GRANT_POINTS,
    feature: null,
    costMicros: null,
    balanceAfter: updated.balance,
    ref: null,
    now,
  });

  return { granted: FREE_GRANT_POINTS, balance: updated.balance };
}

export type Pack = (typeof PACKS)[number];

export function packById(id: unknown): Pack | null {
  return PACKS.find((pack) => pack.id === id) ?? null;
}

/**
 * What this buyer pays, in whole cents, computed server-side (G7).
 *
 * Rounded UP. A half-cent rounded down is a half-cent of margin given away on
 * every discounted sale, and the G2 floor is checked against the discounted
 * price -- so rounding the other way would sell fractionally under the floor
 * the solvency guard just certified.
 */
export function packPriceCents(pack: Pack, isPro: boolean): number {
  return Math.ceil(pack.usd * (isPro ? 1 - PRO_DISCOUNT : 1) * 100);
}

/** Where the money came from. Namespaces receipt ids so a Play purchase token
 *  and a Stripe session id can never collide on one ledger key. */
export type PurchaseSource = 'play' | 'stripe';

/**
 * Legacy purchase sentinel. Do not use to determine settlement: real balances
 * can be negative after adjustments. Migration 0007 adds an explicit flag.
 */
export const UNSETTLED_BALANCE = -1;

export type CreditResult =
  | { ok: true; credited: number; balance: number; replay: boolean }
  | { ok: false; reason: 'unknown_pack' | 'receipt_reused' | 'unsettled' };

/**
 * Credits a paid pack. The single entry point for money becoming points, used
 * by both the Play and Stripe rails.
 *
 * Claim, credit and settlement are one D1 transaction. A unique per-attempt
 * nonce ensures only a newly inserted receipt can move the balance; retries
 * cannot credit an existing (including legacy unsettled) receipt again.
 *
 * The caller is responsible for having verified the receipt with the payment
 * provider first -- this function trusts `receiptId` and does not re-check it.
 */
export async function creditPurchase(
  db: D1Database,
  subject: string,
  packId: unknown,
  source: PurchaseSource,
  receiptId: string,
  paidCents: number,
): Promise<CreditResult> {
  const pack = packById(packId);
  if (!pack) return { ok: false, reason: 'unknown_pack' };

  const now = Date.now();
  const id = `purchase:${source}:${receiptId}`;
  await ensureAccount(db, subject, now);

  const pendingRef = `pending-purchase:${crypto.randomUUID()}`;
  const results = await db.batch([db
    .prepare(
      `INSERT INTO point_ledger
         (id, subject, kind, delta, feature, cost_micros, balance_after, ref, price_version, created_at, purchase_settled)
       VALUES (?, ?, 'purchase', ?, NULL, ?, ?, ?, ?, ?, 0)
       ON CONFLICT(id) DO NOTHING`,
    )
    .bind(
      id,
      subject,
      pack.points,
      // For a purchase row this column carries money RECEIVED, not compute
      // cost -- the opposite direction to a spend row. It is stored because
      // §5's reserve ratio reconciles cash taken against compute owed, and
      // that sum is impossible after the fact if the amount is not on the row.
      paidCents * 10_000,
      UNSETTLED_BALANCE,
      pendingRef,
      PRICE_VERSION,
      now,
    ),
    db.prepare(
      `UPDATE point_accounts
         SET balance = balance + ?, lifetime_purchased = lifetime_purchased + ?, updated_at = ?
       WHERE subject = ? AND EXISTS (
         SELECT 1 FROM point_ledger WHERE id = ? AND subject = ? AND kind = 'purchase'
           AND ref = ? AND purchase_settled = 0
       )`,
    ).bind(pack.points, pack.points, now, subject, id, subject, pendingRef),
    db.prepare(
      `UPDATE point_ledger
       SET balance_after = (SELECT balance FROM point_accounts WHERE subject = ?),
           ref = ?, purchase_settled = 1
       WHERE id = ? AND subject = ? AND kind = 'purchase' AND ref = ? AND purchase_settled = 0`,
    ).bind(subject, receiptId, id, subject, pendingRef),
  ]);

  if (!results[0].meta.changes) {
    const existing = await db.prepare(
      `SELECT subject, kind, delta, purchase_settled FROM point_ledger WHERE id = ?`,
    ).bind(id).first<{ subject: string; kind: string; delta: number; purchase_settled: number }>();
    if (!existing || existing.subject !== subject || existing.kind !== 'purchase' || existing.delta !== pack.points) {
      return { ok: false, reason: 'receipt_reused' };
    }
    if (existing.purchase_settled !== 1) return { ok: false, reason: 'unsettled' };
    // Someone already claimed this receipt. Report the balance as it stands
    // rather than the balance at claim time: the caller wants to render a
    // current figure, and a replayed webhook is not a second sale.
    const account = await readAccount(db, subject);
    return { ok: true, credited: 0, balance: account.balance, replay: true };
  }

  const account = await readAccount(db, subject);
  return { ok: true, credited: pack.points, balance: account.balance, replay: false };
}

/**
 * Legacy ambiguous purchases requiring provider/account reconciliation.
 * New purchases settle atomically, so cannot leave partial rows behind.
 */
export async function readUnsettledPurchases(db: D1Database): Promise<
  Array<{ id: string; subject: string; delta: number; createdAt: number }>
> {
  const result = await db
    .prepare(
      `SELECT id, subject, delta, created_at AS createdAt FROM point_ledger
       WHERE kind = 'purchase' AND purchase_settled = 0 ORDER BY created_at`,
    )
    .bind()
    .all<{ id: string; subject: string; delta: number; createdAt: number }>();
  return result.results ?? [];
}

export type MeteredOutcome<T> =
  | { ok: true; result: T; charged: number; balance: number }
  | { ok: false; reason: 'insufficient'; balance: number; required: number }
  | { ok: false; reason: 'key_reused'; balance: number }
  | { ok: false; reason: 'failed'; balance: number; error: string };

/**
 * Runs a metered feature with the guards attached, so an individual endpoint
 * cannot forget one.
 *
 * G3: the spend happens *before* `work()` is dispatched, server-side.
 * G5: any throw refunds the points. We may still owe the vendor for the call
 *     -- the user is not the one who should absorb our failure.
 *
 * A feature that returns a value is charged; a feature that throws is not.
 * There is deliberately no partial charge: at these prices the accounting cost
 * of a half-refund exceeds the amount in dispute.
 */
export async function runMetered<T>(
  db: D1Database,
  subject: string,
  feature: FeatureId,
  idempotencyKey: string,
  work: () => Promise<T>,
  options: Record<string, unknown> = {},
): Promise<MeteredOutcome<T>> {
  const spend = await spendPoints(db, subject, feature, idempotencyKey, options);
  if (!spend.ok) {
    return spend.reason === 'key_reused'
      ? { ok: false, reason: 'key_reused', balance: spend.balance }
      : { ok: false, reason: 'insufficient', balance: spend.balance, required: spend.required };
  }
  // The balance/ledger are idempotent, but generated text is not cached. Never
  // treat a prior charge as permission to run arbitrary provider work again.
  if (spend.replay) return { ok: false, reason: 'key_reused', balance: spend.balance };

  try {
    const result = await work();
    return { ok: true, result, charged: spend.charged, balance: spend.balance };
  } catch (error) {
    const refund = await refundPoints(db, subject, spend.spendId);
    return {
      ok: false,
      reason: 'failed',
      balance: refund.balance,
      error: error instanceof Error ? error.message : 'AI request failed',
    };
  }
}

/**
 * §5's liability figure: points sold or granted but not yet spent are a debt
 * payable in compute. This is the single number that says whether we can
 * honour what has already been paid for.
 */
export async function readLiability(db: D1Database): Promise<{
  outstandingPoints: number;
  liabilityUsd: number;
}> {
  const row = await db
    .prepare(`SELECT COALESCE(SUM(balance), 0) AS outstanding FROM point_accounts WHERE balance > 0`)
    .first<{ outstanding: number }>();
  const outstanding = row?.outstanding ?? 0;
  return {
    outstandingPoints: outstanding,
    liabilityUsd: Number((outstanding * USD_PER_POINT).toFixed(2)),
  };
}
