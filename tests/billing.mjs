// Promo-code entitlement check.
//
// Google grants a promo-code redemption to the PLAY ACCOUNT: the user leaves
// the app, redeems in the Play Store, and comes back. Nothing pushes that to
// us, so `recheck()` runs on every return to the foreground. The rules it has
// to obey are easy to get wrong and expensive when wrong:
//
//   * it must NEVER clear an existing entitlement — a flaky read on resume
//     revoking a paid unlock is far worse than a promo code taking one more
//     resume to show up;
//   * it must use the provider's sync() (syncPurchases) when there is one,
//     because a plain getCustomerInfo() will not see a purchase that Play has
//     never been asked about;
//   * it must be rate limited, because resume fires on every screen unlock;
//   * a thrown provider (offline) must not burn the rate limit.
//
//   node tests/billing.mjs
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = process.cwd();
const dir = mkdtempSync(join(tmpdir(), 'hdbilling-'));
const entry = join(root, '.billing-entry.tmp.ts');
writeFileSync(entry, `
export { useProStore } from '${root}/src/store/proStore.ts';
export { setProProvider } from '${root}/src/lib/pro.ts';
`);

const out = join(dir, 'bundle.mjs');
let mod;
try {
  execFileSync(join(root, 'node_modules/.bin/esbuild'), [
    entry,
    '--bundle', '--format=esm', '--platform=node',
    '--define:import.meta.env={"BASE_URL":"/","DEV":false,"PROD":true}',
    `--outfile=${out}`,
  ], { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] });
  // The store reads localStorage and Capacitor's platform probe at import time.
  const store = new Map();
  globalThis.localStorage ??= {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  globalThis.window ??= globalThis;
  globalThis.document ??= { documentElement: { lang: 'en' } };
  mod = await import(`file://${out}`);
} finally {
  rmSync(entry, { force: true });
}

const { useProStore, setProProvider } = mod;

let failures = 0;
const check = (name, ok, detail = '') => {
  if (ok) {
    console.log(`PASS  ${name}`);
  } else {
    failures++;
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

/** A provider that records what was asked of it. */
function fakeProvider({ entitled = false, synced = false, throws = false } = {}) {
  const calls = { init: 0, isEntitled: 0, sync: 0 };
  return {
    calls,
    async init() { calls.init++; if (throws) throw new Error('offline'); },
    async isEntitled() { calls.isEntitled++; return entitled; },
    async sync() { calls.sync++; return synced; },
    async getPrice() { return null; },
    async getPlans() { return []; },
    async purchase() { return false; },
    async restore() { return false; },
    async identify() { return false; },
    async disconnect() { return false; },
  };
}

// recheck() is rate limited against the wall clock, and the limiter is
// module-private by design. Drive time rather than reaching into the module:
// that also makes the throttle itself testable instead of untestable.
let clock = Date.now();
Date.now = () => clock;

/** Start a case: back past the rate limit, with a known entitlement. */
const reset = (isPro) => {
  clock += 10 * 60_000;
  useProStore.setState({ isPro, upsellFeature: null });
};

// --- a promo code redeemed outside the app is picked up ---------------------
{
  reset(false);
  const p = fakeProvider({ synced: true });
  setProProvider(p);
  const unlocked = await useProStore.getState().recheck();
  check('promo: a purchase granted outside the app unlocks Pro', unlocked === true && useProStore.getState().isPro === true);
  check('promo: the store is re-synced, not just re-read', p.calls.sync === 1 && p.calls.isEntitled === 0);
}

// --- nothing to find --------------------------------------------------------
{
  reset(false);
  const p = fakeProvider({ synced: false });
  setProProvider(p);
  const unlocked = await useProStore.getState().recheck();
  check('promo: no redemption leaves a free user free', unlocked === false && useProStore.getState().isPro === false);
}

// --- an existing entitlement is untouchable ---------------------------------
{
  reset(true);
  const p = fakeProvider({ synced: false });
  setProProvider(p);
  const unlocked = await useProStore.getState().recheck();
  check('promo: a Pro user is never downgraded by a resume check', unlocked === false && useProStore.getState().isPro === true);
  check('promo: a Pro user costs no store round trip at all', p.calls.init === 0 && p.calls.sync === 0);
}

// --- resume fires on every unlock; this must not hammer the store -----------
{
  reset(false);
  const p = fakeProvider({ synced: false });
  setProProvider(p);
  await useProStore.getState().recheck();
  await useProStore.getState().recheck();
  await useProStore.getState().recheck();
  check('promo: repeated resumes are rate limited to one check', p.calls.sync === 1, `sync called ${p.calls.sync}×`);
}

// --- offline must be retried, not silently swallowed for a minute -----------
{
  reset(false);
  const offline = fakeProvider({ throws: true });
  setProProvider(offline);
  const first = await useProStore.getState().recheck();
  const p = fakeProvider({ synced: true });
  setProProvider(p);
  const second = await useProStore.getState().recheck();
  check('promo: a failed check does not burn the rate limit', first === false && second === true, `retry gave ${second}`);
}

// --- a provider with no out-of-app redemption path still works --------------
{
  reset(false);
  const p = fakeProvider({ entitled: true });
  delete p.sync;
  setProProvider(p);
  const unlocked = await useProStore.getState().recheck();
  check('promo: a provider without sync() falls back to a plain read', unlocked === true && p.calls.isEntitled === 1);
}

rmSync(dir, { recursive: true, force: true });
if (failures) {
  console.log(`\nBILLING: ${failures} failing`);
  process.exit(1);
}
console.log('\nBILLING: all green');
