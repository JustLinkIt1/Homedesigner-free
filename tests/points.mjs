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
} = mod;

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
