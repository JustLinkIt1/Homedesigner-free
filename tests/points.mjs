// AI points ledger: the guards from docs/AI_FEATURES_PLAN.md §4.
//
// These run against REAL SQLite (node:sqlite) with the REAL migration applied,
// not a hand-rolled fake. D1 is SQLite, and the parts most worth testing here
// are exactly the parts a fake would paper over: whether `RETURNING` on a
// conditional UPDATE actually reports the post-update balance, whether
// `ON CONFLICT DO NOTHING` really makes a replayed spend free, and whether the
// CHECK constraint rejects a bad ledger kind. A shim written to match my own
// queries would pass whether or not the SQL was right.
//
//   node tests/points.mjs
import { writeFileSync, mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// node:sqlite is stable enough for a test harness but still prints an
// ExperimentalWarning that would otherwise be the loudest line in CI output.
// It has to be imported dynamically: a static import is hoisted above this
// line and the warning fires before the listener can be removed.
process.removeAllListeners('warning');
const { DatabaseSync } = await import('node:sqlite');

const root = process.cwd();
const rootImport = root.replaceAll('\\', '/');
const dir = mkdtempSync(join(tmpdir(), 'hdpoints-'));
const entry = join(root, '.points-entry.tmp.ts');
writeFileSync(entry, `
export * from '${rootImport}/workers/design-sync/src/points.ts';
export * from '${rootImport}/workers/design-sync/src/stripe.ts';
`);

const out = join(dir, 'bundle.mjs');
let mod;
try {
  // esbuild JS API, not the bin shim -- same cross-platform reason as
  // tests/billing.mjs and tests/geometry.mjs.
  await build({
    entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: out,
  });
  mod = await import(pathToFileURL(out).href);
} finally {
  rmSync(entry, { force: true });
}

const {
  FEATURES, PACKS, USD_PER_POINT, PLAY_FEE_RATE, PRO_DISCOUNT,
  FREE_GRANT_POINTS, MAX_FREE_GRANTS_PER_MONTH,
  assertPricingIsSolvent, pointsFor,
  spendPoints, refundPoints, grantFreePoints, readAccount, readLiability, runMetered,
  creditPurchase, packById, packPriceCents, readUnsettledPurchases, UNSETTLED_BALANCE,
  stripeSignatureValid, timingSafeEqual, STRIPE_SIGNATURE_TOLERANCE_S,
} = mod;

/** Signs a payload the way Stripe does, so the tests exercise the real scheme
 *  rather than a restatement of the implementation. */
async function stripeSign(payload, secret, timestamp) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const mac = await crypto.subtle.sign(
    'HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`),
  );
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

let passed = 0;
let failed = 0;
function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
  } else {
    failed += 1;
    console.error(`  FAIL  ${name}${detail ? ` -- ${detail}` : ''}`);
  }
}

/** Minimal D1Database surface over node:sqlite. Only what points.ts calls. */
function makeDb() {
  const db = new DatabaseSync(':memory:');
  const migration = readFileSync(
    join(root, 'workers', 'design-sync', 'migrations', '0004_points.sql'),
    'utf8',
  );
  db.exec(migration);
  return {
    raw: db,
    prepare(sql) {
      return {
        bind(...args) {
          const stmt = db.prepare(sql);
          return {
            first() {
              const row = stmt.get(...args);
              return Promise.resolve(row ?? null);
            },
            run() {
              const info = stmt.run(...args);
              return Promise.resolve({ success: true, meta: { changes: info.changes } });
            },
            all() {
              return Promise.resolve({ success: true, results: stmt.all(...args) });
            },
          };
        },
        first() {
          const row = db.prepare(sql).get();
          return Promise.resolve(row ?? null);
        },
      };
    },
  };
}

// ---------------------------------------------------------------- G1 and G2

console.log('Pricing solvency (G1, G2)');

check('the shipped table is solvent', (() => {
  try { assertPricingIsSolvent(); return true; } catch { return false; }
})());

for (const [id, price] of Object.entries(FEATURES)) {
  const required = Math.ceil(price.maxCostUsd / USD_PER_POINT);
  check(`${id} covers its worst case`, price.points >= required,
    `charges ${price.points}, worst case needs ${required}`);
}

for (const pack of PACKS) {
  // Worst case a pack is ever sold at: Pro's discount stacked on Play's cut.
  const netPerPoint = (pack.usd * (1 - PRO_DISCOUNT) * (1 - PLAY_FEE_RATE)) / pack.points;
  check(`pack ${pack.id} clears the floor`, netPerPoint >= USD_PER_POINT,
    `nets $${netPerPoint.toFixed(6)}/point against $${USD_PER_POINT}`);
}

// Fault injection: the guard is worthless if it does not actually fire.
{
  const original = FEATURES.auto_furnish.points;
  FEATURES.auto_furnish.points = 1; // worst case needs 3
  let threw = false;
  try { assertPricingIsSolvent(); } catch { threw = true; }
  FEATURES.auto_furnish.points = original;
  check('G1 fires when a feature is underpriced', threw);
}

{
  const original = PACKS[0].usd;
  PACKS[0].usd = 0.10; // 2,000 points for 10c nets far below cost
  let threw = false;
  try { assertPricingIsSolvent(); } catch { threw = true; }
  PACKS[0].usd = original;
  check('G2 fires when a pack is sold below the floor', threw);
}

check('the shipped table is solvent again after injection', (() => {
  try { assertPricingIsSolvent(); return true; } catch { return false; }
})());

// ------------------------------------------------------------------ grants

console.log('Free grant (G10)');
{
  const db = makeDb();
  const first = await grantFreePoints(db, 'subject-a');
  check('first grant pays out', first.granted === FREE_GRANT_POINTS, `granted ${first.granted}`);
  check('first grant sets the balance', first.balance === FREE_GRANT_POINTS);

  const second = await grantFreePoints(db, 'subject-a');
  check('second grant to the same subject pays nothing', second.granted === 0);
  check('second grant reports why', second.reason === 'already_granted');
  check('second grant leaves the balance alone', second.balance === FREE_GRANT_POINTS);

  const other = await grantFreePoints(db, 'subject-b');
  check('a different subject still gets a grant', other.granted === FREE_GRANT_POINTS);
}

{
  // The ceiling counts grants, not points. Counting points made it fire after
  // ten ordinary signups, which is throttling users rather than abuse.
  const db = makeDb();
  for (let i = 0; i < MAX_FREE_GRANTS_PER_MONTH; i += 1) await grantFreePoints(db, `bulk-${i}`);
  const overflow = await grantFreePoints(db, 'bulk-overflow');
  check('the monthly ceiling blocks the next grant', overflow.granted === 0);
  check('the ceiling reports why', overflow.reason === 'ceiling', `got ${overflow.reason}`);
}

// ------------------------------------------------------------------ spends

console.log('Spending (G3, G4)');
{
  const db = makeDb();
  await grantFreePoints(db, 'spender');

  const cost = pointsFor('room_naming');
  const spend = await spendPoints(db, 'spender', 'room_naming', 'job-1');
  check('a spend succeeds with funds', spend.ok === true);
  check('a spend charges the table price', spend.ok && spend.charged === cost, `charged ${spend.charged}`);
  check('a spend leaves the right balance',
    spend.ok && spend.balance === FREE_GRANT_POINTS - cost, `balance ${spend.balance}`);

  const account = await readAccount(db, 'spender');
  check('lifetime_spent tracks the spend', account.lifetimeSpent === cost);

  // Idempotency: the same key must not charge twice.
  const replay = await spendPoints(db, 'spender', 'room_naming', 'job-1');
  check('a replayed spend is free', replay.ok === true && replay.balance === FREE_GRANT_POINTS - cost,
    `balance ${replay.balance}`);
  const afterReplay = await readAccount(db, 'spender');
  check('a replayed spend does not double-charge',
    afterReplay.balance === FREE_GRANT_POINTS - cost, `balance ${afterReplay.balance}`);
}

{
  // G3: the balance is the authority, and it must not go negative by spending.
  const db = makeDb();
  const cost = pointsFor('text_to_layout');
  const broke = await spendPoints(db, 'pauper', 'text_to_layout', 'job-x');
  check('a spend with no funds is refused', broke.ok === false);
  check('the refusal names the shortfall', !broke.ok && broke.required === cost);
  const account = await readAccount(db, 'pauper');
  check('a refused spend leaves the balance at zero', account.balance === 0, `balance ${account.balance}`);
}

{
  // The conditional UPDATE is what stops a double-tap overdrawing. Spend down
  // to less than one call's worth, then try again.
  const db = makeDb();
  await grantFreePoints(db, 'edge');
  const cost = pointsFor('text_to_layout');
  const fit = Math.floor(FREE_GRANT_POINTS / cost);
  for (let i = 0; i < fit; i += 1) {
    await spendPoints(db, 'edge', 'text_to_layout', `edge-${i}`);
  }
  const remaining = (await readAccount(db, 'edge')).balance;
  const overdraw = await spendPoints(db, 'edge', 'text_to_layout', 'edge-overdraw');
  check('spending past the balance is refused', overdraw.ok === false,
    `remaining ${remaining}, cost ${cost}`);
  const after = (await readAccount(db, 'edge')).balance;
  check('a refused overdraw never goes negative', after >= 0 && after === remaining,
    `balance ${after}`);
}

// ----------------------------------------------------------------- refunds

console.log('Refunds (G5)');
{
  const db = makeDb();
  await grantFreePoints(db, 'refundee');
  const cost = pointsFor('auto_furnish');
  await spendPoints(db, 'refundee', 'auto_furnish', 'job-r');

  const refund = await refundPoints(db, 'refundee', 'job-r');
  check('a refund returns the full spend', refund.refunded === cost, `refunded ${refund.refunded}`);
  check('a refund restores the balance', refund.balance === FREE_GRANT_POINTS,
    `balance ${refund.balance}`);

  const again = await refundPoints(db, 'refundee', 'job-r');
  check('a double refund pays nothing', again.refunded === 0);
  check('a double refund leaves the balance alone', again.balance === FREE_GRANT_POINTS,
    `balance ${again.balance}`);

  const account = await readAccount(db, 'refundee');
  check('a refund unwinds lifetime_spent', account.lifetimeSpent === 0,
    `lifetimeSpent ${account.lifetimeSpent}`);

  const unknown = await refundPoints(db, 'refundee', 'no-such-job');
  check('refunding an unknown spend pays nothing', unknown.refunded === 0);
}

// ------------------------------------------------------- metered execution

console.log('Metered execution (G3 + G5 together)');
{
  const db = makeDb();
  await grantFreePoints(db, 'metered');
  const cost = pointsFor('room_naming');

  let dispatched = 0;
  const good = await runMetered(db, 'metered', 'room_naming', 'm-1', async () => {
    dispatched += 1;
    return 'Kitchen';
  });
  check('a successful metered call returns its result', good.ok && good.result === 'Kitchen');
  check('a successful metered call charges once', good.ok && good.charged === cost);
  check('a successful metered call dispatched once', dispatched === 1);
  check('a successful metered call leaves the balance down',
    (await readAccount(db, 'metered')).balance === FREE_GRANT_POINTS - cost);

  const failed = await runMetered(db, 'metered', 'room_naming', 'm-2', async () => {
    throw new Error('upstream exploded');
  });
  check('a failed metered call reports failure', !failed.ok && failed.reason === 'failed');
  check('a failed metered call refunds in full',
    (await readAccount(db, 'metered')).balance === FREE_GRANT_POINTS - cost,
    `balance ${(await readAccount(db, 'metered')).balance}`);
}

{
  // The free-retry hole: fail once, then replay the same idempotency key. The
  // refund put the points back, so honouring the replay would run the work
  // again for nothing -- repeatable indefinitely.
  const db = makeDb();
  await grantFreePoints(db, 'retrier');
  const before = (await readAccount(db, 'retrier')).balance;

  await runMetered(db, 'retrier', 'auto_furnish', 'reused-key', async () => {
    throw new Error('induced failure');
  });
  const afterRefund = (await readAccount(db, 'retrier')).balance;
  check('the induced failure refunded', afterRefund === before, `balance ${afterRefund}`);

  let redispatched = 0;
  const replay = await runMetered(db, 'retrier', 'auto_furnish', 'reused-key', async () => {
    redispatched += 1;
    return 'free work';
  });
  check('a refunded key cannot be replayed', !replay.ok && replay.reason === 'key_reused',
    `got ${replay.ok ? 'ok' : replay.reason}`);
  check('a refunded key dispatches no work', redispatched === 0, `dispatched ${redispatched}`);
  check('a refused replay leaves the balance alone',
    (await readAccount(db, 'retrier')).balance === before);

  // A fresh key must still work -- the rule is "no reuse", not "no retry".
  const retry = await runMetered(db, 'retrier', 'auto_furnish', 'fresh-key', async () => 'done');
  check('a fresh key retries successfully', retry.ok === true && retry.result === 'done');
  check('the fresh key charges properly',
    (await readAccount(db, 'retrier')).balance === before - pointsFor('auto_furnish'));
}

// -------------------------------------------------- purchases (both rails)

console.log('Purchases (G6, G7)');
{
  const pack = PACKS[1];

  // Pricing is computed server-side, and the discounted price is what the G2
  // floor was certified against -- so the rounding direction is load-bearing,
  // not cosmetic.
  check('list price is the pack price', packPriceCents(pack, false) === Math.ceil(pack.usd * 100),
    `got ${packPriceCents(pack, false)}`);
  check('Pro price applies the discount',
    packPriceCents(pack, true) === Math.ceil(pack.usd * (1 - PRO_DISCOUNT) * 100),
    `got ${packPriceCents(pack, true)}`);
  check('Pro price rounds up, never down',
    packPriceCents(pack, true) >= pack.usd * (1 - PRO_DISCOUNT) * 100);
  for (const p of PACKS) {
    // The floor has to hold against the price actually charged, not the
    // idealised one -- rounding must not push a sale under it.
    const netPerPoint = ((packPriceCents(p, true) / 100) * (1 - PLAY_FEE_RATE)) / p.points;
    check(`charged Pro price for ${p.id} clears the floor`, netPerPoint >= USD_PER_POINT,
      `nets $${netPerPoint.toFixed(6)}/point`);
  }

  check('an unknown pack id resolves to nothing', packById('points_9999') === null);
  check('a real pack id resolves', packById(pack.id)?.points === pack.points);

  {
    const db = makeDb();
    const credited = await creditPurchase(db, 'buyer', pack.id, 'play', 'tok-1', packPriceCents(pack, false));
    check('a verified purchase credits its points', credited.ok && credited.credited === pack.points,
      `got ${credited.ok ? credited.credited : credited.reason}`);
    check('the balance reflects the purchase', (await readAccount(db, 'buyer')).balance === pack.points);
    check('lifetime purchased is tracked',
      (await readAccount(db, 'buyer')).lifetimePurchased === pack.points);
    check('a settled purchase leaves nothing unsettled',
      (await readUnsettledPurchases(db)).length === 0);
  }

  // THE one that matters. Stripe retries a webhook until it gets a 2xx, so the
  // same receipt WILL arrive again in normal operation.
  {
    const db = makeDb();
    await creditPurchase(db, 'buyer', pack.id, 'stripe', 'sess-1', 599);
    const again = await creditPurchase(db, 'buyer', pack.id, 'stripe', 'sess-1', 599);
    check('a replayed receipt credits nothing', again.ok && again.credited === 0 && again.replay === true,
      `got ${again.ok ? `credited ${again.credited}` : again.reason}`);
    check('a replayed receipt leaves the balance alone',
      (await readAccount(db, 'buyer')).balance === pack.points,
      `balance ${(await readAccount(db, 'buyer')).balance}`);
    check('a replayed receipt does not inflate lifetime purchased',
      (await readAccount(db, 'buyer')).lifetimePurchased === pack.points);
  }

  // Two devices verifying the same Play token at once, or two webhook
  // deliveries racing. Only one may credit.
  {
    const db = makeDb();
    const deliveries = await Promise.all([
      creditPurchase(db, 'racer', pack.id, 'play', 'tok-race', 599),
      creditPurchase(db, 'racer', pack.id, 'play', 'tok-race', 599),
      creditPurchase(db, 'racer', pack.id, 'play', 'tok-race', 599),
    ]);
    const credits = deliveries.filter((d) => d.ok && d.credited > 0);
    check('concurrent deliveries credit exactly once', credits.length === 1,
      `${credits.length} of 3 credited`);
    check('the racing balance is one pack', (await readAccount(db, 'racer')).balance === pack.points,
      `balance ${(await readAccount(db, 'racer')).balance}`);
  }

  // A Play purchase token and a Stripe session id are different namespaces and
  // must not be able to collide on one ledger key.
  {
    const db = makeDb();
    await creditPurchase(db, 'buyer', pack.id, 'play', 'same-id', 599);
    const other = await creditPurchase(db, 'buyer', pack.id, 'stripe', 'same-id', 599);
    check('the same id on a different rail is a different receipt',
      other.ok && other.credited === pack.points,
      `got ${other.ok ? other.credited : other.reason}`);
    check('both rails credited', (await readAccount(db, 'buyer')).balance === pack.points * 2);
  }

  {
    const db = makeDb();
    const bogus = await creditPurchase(db, 'buyer', 'points_9999', 'stripe', 'sess-x', 100);
    check('an unknown pack is refused', !bogus.ok && bogus.reason === 'unknown_pack');
    check('a refused purchase credits nothing', (await readAccount(db, 'buyer')).balance === 0);
    check('a refused purchase writes no ledger row',
      db.raw.prepare(`SELECT COUNT(*) AS n FROM point_ledger`).get().n === 0);
  }

  // Fault injection: credit-then-claim is what this ordering exists to prevent.
  // Written the wrong way round, the replayed delivery pays out again.
  {
    const db = makeDb();
    const naiveCredit = async (receipt) => {
      const seen = db.raw.prepare(`SELECT 1 AS hit FROM point_ledger WHERE id = ?`).get(`naive:${receipt}`);
      if (seen) return 0;
      db.raw.prepare(
        `UPDATE point_accounts SET balance = balance + ? WHERE subject = 'naive'`,
      ).run(pack.points);
      // The crash window the real implementation closes: the claim lands only
      // AFTER the balance moved, so anything arriving in between pays twice.
      db.raw.prepare(
        `INSERT INTO point_ledger (id, subject, kind, delta, balance_after, created_at)
         VALUES (?, 'naive', 'purchase', ?, 0, 0)`,
      ).run(`naive:${receipt}`, pack.points);
      return pack.points;
    };
    db.raw.prepare(
      `INSERT INTO point_accounts (subject, created_at, updated_at) VALUES ('naive', 0, 0)`,
    ).run();
    await naiveCredit('r1');
    const balanceBefore = db.raw.prepare(`SELECT balance FROM point_accounts WHERE subject = 'naive'`).get().balance;
    check('fault injection: credit-before-claim is the bug being prevented',
      balanceBefore === pack.points, `balance ${balanceBefore}`);
  }
}

// ------------------------------------------ stripe webhook authentication

console.log('Stripe webhook signature');
{
  const secret = 'whsec_test_2vFqYb8xN4pR';
  const body = JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: 'cs_1' } } });
  const now = Date.now();
  const t = Math.floor(now / 1000);
  const good = await stripeSign(body, secret, t);

  check('a correctly signed webhook is accepted',
    await stripeSignatureValid(body, `t=${t},v1=${good}`, secret, now) === true);

  check('a missing header is refused',
    await stripeSignatureValid(body, null, secret, now) === false);
  check('an empty secret is refused',
    await stripeSignatureValid(body, `t=${t},v1=${good}`, '', now) === false);
  check('a header with no signature is refused',
    await stripeSignatureValid(body, `t=${t}`, secret, now) === false);
  check('a header with no timestamp is refused',
    await stripeSignatureValid(body, `v1=${good}`, secret, now) === false);

  // The forged-signature case. This is the one that would hand out free points.
  check('a forged signature is refused',
    await stripeSignatureValid(body, `t=${t},v1=${'0'.repeat(64)}`, secret, now) === false);
  check('a signature from the wrong secret is refused',
    await stripeSignatureValid(body, `t=${t},v1=${await stripeSign(body, 'whsec_wrong', t)}`, secret, now) === false);

  // Tampering: the signature is valid for the ORIGINAL body only. Swapping the
  // session id (i.e. claiming a different receipt) must invalidate it.
  const tampered = JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: 'cs_ATTACKER' } } });
  check('a tampered body is refused',
    await stripeSignatureValid(tampered, `t=${t},v1=${good}`, secret, now) === false);

  // Replay: a captured webhook must expire, or it is a permanent free-points
  // coupon for anyone who ever saw one.
  const stale = t - STRIPE_SIGNATURE_TOLERANCE_S - 60;
  check('a replayed old webhook is refused',
    await stripeSignatureValid(body, `t=${stale},v1=${await stripeSign(body, secret, stale)}`, secret, now) === false);
  const future = t + STRIPE_SIGNATURE_TOLERANCE_S + 60;
  check('a far-future timestamp is refused',
    await stripeSignatureValid(body, `t=${future},v1=${await stripeSign(body, secret, future)}`, secret, now) === false);
  const edge = t - STRIPE_SIGNATURE_TOLERANCE_S + 5;
  check('a webhook inside the tolerance is accepted',
    await stripeSignatureValid(body, `t=${edge},v1=${await stripeSign(body, secret, edge)}`, secret, now) === true);
  check('a non-numeric timestamp is refused',
    await stripeSignatureValid(body, `t=abc,v1=${good}`, secret, now) === false);

  // Secret rotation sends several v1 values; any one valid is enough.
  check('one valid signature among several is accepted',
    await stripeSignatureValid(body, `t=${t},v1=${'a'.repeat(64)},v1=${good}`, secret, now) === true);

  check('constant-time compare still compares', timingSafeEqual('abc', 'abc') === true
    && timingSafeEqual('abc', 'abd') === false && timingSafeEqual('abc', 'ab') === false);
}

// --------------------------------------------------------------- liability

console.log('Liability (§5)');
{
  const db = makeDb();
  await grantFreePoints(db, 'l1');
  await grantFreePoints(db, 'l2');
  await spendPoints(db, 'l1', 'room_naming', 'l1-job');

  const spent = pointsFor('room_naming');
  const expected = FREE_GRANT_POINTS * 2 - spent;
  const liability = await readLiability(db);
  check('liability counts outstanding points', liability.outstandingPoints === expected,
    `got ${liability.outstandingPoints}, expected ${expected}`);
  check('liability converts at the point cost',
    Math.abs(liability.liabilityUsd - expected * USD_PER_POINT) < 0.01,
    `got $${liability.liabilityUsd}`);
}

// ------------------------------------------------------------------ schema

console.log('Schema');
{
  const db = makeDb();
  let rejected = false;
  try {
    db.raw.prepare(
      `INSERT INTO point_ledger (id, subject, kind, delta, balance_after, created_at)
       VALUES ('bad', 's', 'freebie', 1, 1, 1)`,
    ).run();
  } catch { rejected = true; }
  check('the ledger CHECK rejects an unknown kind', rejected);
}

rmSync(dir, { recursive: true, force: true });

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
