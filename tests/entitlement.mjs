// Cross-platform Pro: does a web/Stripe purchase reach a phone?
//
// This suite exists because of a bug that every other check missed. The Worker
// decided web entitlement with `item.entitlement_id === 'Pro'`, and RevenueCat's
// v2 `active_entitlements` reports that field as the entitlement OBJECT id
// (`entlf6de9c6c3d`) — `Pro` is only the lookup key its SDKs expose. The
// comparison was therefore never true for anyone, and `GET /v1/entitlement`
// answered "not Pro" to every web buyer for as long as it existed.
//
// It was invisible on desktop, which reads its own RevenueCat Web SDK
// customerInfo (where the identifier IS the lookup key) and only falls back to
// the Worker. It was total on Android, which since the move to direct Play
// Billing ships no RevenueCat SDK at all, so that endpoint is its only route to
// a non-Play purchase. A paying customer sat with an active, unlimited grant in
// the dashboard and a locked phone in his hand.
//
// The only test covering the line asserted its exact source text. That is worth
// naming: a source-text assertion cannot distinguish a correct comparison from
// an incorrect one, it can only notice that someone edited the line — so it
// pinned the bug in place and reported green the entire time. Everything below
// runs the real matcher over real response shapes instead.
//
//   node tests/entitlement.mjs
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { build } from 'esbuild';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const rootImport = root.replaceAll('\\', '/');
const dir = mkdtempSync(join(tmpdir(), 'hdentl-'));
const entry = join(root, '.entitlement-entry.tmp.ts');
writeFileSync(entry, `export * from '${rootImport}/workers/design-sync/src/entitlements.ts';\n`);

const out = join(dir, 'bundle.mjs');
let mod;
try {
  // esbuild JS API rather than the bin shim, for the same cross-platform
  // reason as tests/points.mjs and tests/billing.mjs.
  await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: out });
  mod = await import(pathToFileURL(out).href);
} finally {
  rmSync(entry, { force: true });
}

const {
  PRO_ENTITLEMENT_ID,
  PRO_ENTITLEMENT_LOOKUP_KEY,
  entitlementLive,
  liveEntitlements,
  matchesProEntitlement,
  proIdsFromCatalogue,
} = mod;

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failures += 1;
};

const NOW = Date.UTC(2026, 7, 17, 12, 0, 0);
const YEAR = 365 * 24 * 60 * 60 * 1000;

/** Decide entitlement exactly as the Worker does, minus the network. */
const entitled = (items, { configuredId = PRO_ENTITLEMENT_ID, catalogue = null, now = NOW } = {}) => {
  const live = liveEntitlements(items, now);
  if (live.length === 0) return false;
  if (live.some((item) => matchesProEntitlement(item, configuredId))) return true;
  if (!catalogue) return false;
  const ids = proIdsFromCatalogue(catalogue);
  return live.some((item) => typeof item.entitlement_id === 'string' && ids.has(item.entitlement_id));
};

console.log('\nThe payload RevenueCat actually sends');

// Verbatim shape of GET /v2/projects/{id}/customers/{id}/active_entitlements
// for the customer in the bug report: a granted, never-expiring Pro unlock.
const REAL_GRANT = {
  object: 'list',
  items: [{ object: 'customer.active_entitlement', entitlement_id: PRO_ENTITLEMENT_ID, expires_at: null }],
  next_page: null,
  url: '/v2/projects/proja88f8624/customers/google%3A.../active_entitlements',
};

check('an active web grant unlocks Pro', entitled(REAL_GRANT.items) === true,
  'this is the exact case that left a paying customer locked out on Android');

// The regression, stated as the thing that must never be true again: the
// matcher must not depend on the API returning the SDK's lookup key.
check('the object id alone is enough — no lookup key in the payload',
  entitled([{ entitlement_id: PRO_ENTITLEMENT_ID, expires_at: null }]) === true &&
    REAL_GRANT.items.every((item) => item.entitlement_id !== PRO_ENTITLEMENT_LOOKUP_KEY),
  'a payload carrying only the entl… id must still resolve to Pro');

check('the id is the dashboard object id, not a lookup key',
  /^entl[a-z0-9]+$/.test(PRO_ENTITLEMENT_ID) && PRO_ENTITLEMENT_ID !== PRO_ENTITLEMENT_LOOKUP_KEY);

check('a subscription expiring in a year is Pro',
  entitled([{ entitlement_id: PRO_ENTITLEMENT_ID, expires_at: NOW + YEAR }]) === true);

console.log('\nWho must NOT be Pro');

check('a customer with no entitlements is free', entitled([]) === false);
check('a missing items array is free', entitled(undefined) === false);
check('an expired grant is free',
  entitled([{ entitlement_id: PRO_ENTITLEMENT_ID, expires_at: NOW - 1 }]) === false);
check('an unrelated entitlement does not unlock this app',
  entitled([{ entitlement_id: 'entl0000000000', expires_at: null }]) === false,
  'another product’s entitlement must never grant HomeDesigner Pro');
check('an unrelated entitlement is not rescued by the catalogue',
  entitled([{ entitlement_id: 'entl0000000000', expires_at: null }], {
    catalogue: [{ id: PRO_ENTITLEMENT_ID, lookup_key: PRO_ENTITLEMENT_LOOKUP_KEY }],
  }) === false);

console.log('\nExpiry, read the safe way');

check('null expires_at means a lifetime unlock', entitlementLive({ expires_at: null }, NOW) === true);
check('an absent expires_at is not treated as expired',
  entitlementLive({}, NOW) === true,
  'a field RevenueCat stopped sending would otherwise revoke every lifetime unlock at once');
check('a future timestamp is live', entitlementLive({ expires_at: NOW + 1 }, NOW) === true);
check('the exact expiry instant is over', entitlementLive({ expires_at: NOW }, NOW) === false);
check('a non-numeric expiry is not trusted as live',
  entitlementLive({ expires_at: '2026-08-17' }, NOW) === false);
check('expiry is judged per item, not per customer',
  entitled([
    { entitlement_id: PRO_ENTITLEMENT_ID, expires_at: NOW - 1 },
    { entitlement_id: 'entl0000000000', expires_at: null },
  ]) === false,
  'a live unrelated entitlement must not carry an expired Pro one');

console.log('\nRecovering from a recreated entitlement');

// The safety net: if the entitlement is rebuilt in the dashboard, the
// configured id goes stale and this same lockout returns. Resolving the lookup
// key through the project catalogue is what stops it being permanent.
const RECREATED = 'entl9f8e7d6c5b';
check('a stale configured id still resolves through the catalogue',
  entitled([{ entitlement_id: RECREATED, expires_at: null }], {
    catalogue: [
      { id: 'entl0000000000', lookup_key: 'legacy' },
      { id: RECREATED, lookup_key: PRO_ENTITLEMENT_LOOKUP_KEY },
    ],
  }) === true);
check('without the catalogue a stale id fails closed',
  entitled([{ entitlement_id: RECREATED, expires_at: null }]) === false,
  'the fallback needs project_configuration:entitlements:read; without it we must not guess');
check('the catalogue only yields ids carrying the Pro lookup key',
  proIdsFromCatalogue([
    { id: 'entlaaaaaaaaaa', lookup_key: 'plus' },
    { id: RECREATED, lookup_key: PRO_ENTITLEMENT_LOOKUP_KEY },
    { lookup_key: PRO_ENTITLEMENT_LOOKUP_KEY },
  ]).size === 1);
check('an empty catalogue grants nothing', proIdsFromCatalogue([]).size === 0);
check('a missing catalogue grants nothing', proIdsFromCatalogue(undefined).size === 0);

console.log('\nAn env override, for the day the id changes');

check('REVENUECAT_PRO_ENTITLEMENT_ID takes precedence',
  entitled([{ entitlement_id: RECREATED, expires_at: null }], { configuredId: RECREATED }) === true);
check('the override does not disable the built-in id',
  entitled([{ entitlement_id: PRO_ENTITLEMENT_ID, expires_at: null }], { configuredId: RECREATED }) === false,
  'an override names ONE entitlement; the default must not linger as a second accepted id');

console.log('\nShapes that must not throw');

for (const [name, payload] of [
  ['a null item id', [{ entitlement_id: null, expires_at: null }]],
  ['an empty item', [{}]],
  ['a numeric id', [{ entitlement_id: 42, expires_at: null }]],
]) {
  let threw = null;
  try { entitled(payload); } catch (err) { threw = err; }
  check(`${name} is rejected, not thrown on`, threw === null && entitled(payload) === false,
    threw ? String(threw) : 'resolved to Pro');
}

rmSync(dir, { recursive: true, force: true });

if (failures > 0) {
  console.error(`\nENTITLEMENT: ${failures} failed`);
  process.exit(1);
}
console.log('\nENTITLEMENT: all green');
