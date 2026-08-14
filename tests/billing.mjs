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
import { writeFileSync, mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const rootImport = root.replaceAll('\\', '/');
const dir = mkdtempSync(join(tmpdir(), 'hdbilling-'));
const entry = join(root, '.billing-entry.tmp.ts');
writeFileSync(entry, `
export { useProStore } from '${rootImport}/src/store/proStore.ts';
export { setProProvider, playPackage, describeMissingProduct, webPlansFromOfferings, collectStoreDiagnostics } from '${rootImport}/src/lib/pro.ts';
`);

const out = join(dir, 'bundle.mjs');
let mod;
try {
  // esbuild JS API, not the bin shim: on Unix the installer replaces
  // node_modules/esbuild/bin/esbuild with the native binary, which `node`
  // cannot run. The API works on every platform. Same trick as
  // tests/geometry.mjs.
  await build({
    entryPoints: [entry], bundle: true, format: 'esm', platform: 'node',
    define: { 'import.meta.env': '{"BASE_URL":"/","DEV":false,"PROD":true}' },
    outfile: out,
  });
  // The store reads localStorage and Capacitor's platform probe at import time.
  const store = new Map();
  globalThis.localStorage ??= {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  globalThis.window ??= globalThis;
  globalThis.document ??= { documentElement: { lang: 'en' } };
  mod = await import(pathToFileURL(out));
} finally {
  rmSync(entry, { force: true });
}

const { useProStore, setProProvider, playPackage, describeMissingProduct, webPlansFromOfferings, collectStoreDiagnostics } = mod;

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

// --- a promo redeemed while the app was CLOSED --------------------------------
// The gap a tester hit: "the pro code is marked OK in the Play Store but the app
// does not seem to recognize it." recheck() syncs, but it only runs on RESUME.
// Redeeming while the app is closed is followed by a COLD LAUNCH, where refresh()
// is the only entitlement path — and it used to call getCustomerInfo() alone,
// which cannot see a purchase Play was never asked about.
{
  reset(false);
  const p = fakeProvider({ entitled: false, synced: true });
  setProProvider(p);
  await useProStore.getState().refresh();
  check('promo: a code redeemed while the app was closed is found on launch',
    useProStore.getState().isPro === true);
  check('promo: startup syncs with the store, not just a plain read', p.calls.sync === 1);
}
{
  // …but the sync must not become the only signal: a provider without one still
  // has to fall back, and the price/plan lookups must still run either way.
  reset(false);
  const p = fakeProvider({ entitled: true });
  delete p.sync;
  setProProvider(p);
  await useProStore.getState().refresh();
  check('promo: startup still works for a provider that cannot sync',
    useProStore.getState().isPro === true && p.calls.isEntitled === 1);
}

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

// --- no native store call may be awaited without a bound --------------------
//
// Google Play Billing can leave a promise pending FOREVER when its service
// connection cannot be established (sideloaded build, wedged Play Services, no
// Play account). The plugin reports that as silence, not as an error, so an
// unguarded `await` is an unbounded hang: the buy button spins with Restore
// disabled beside it and the user has no way forward. Reported on 1.22.0 as
// "hit the buy subscription button and it hangs."
//
// A comment asking future code to remember this would not survive. This walks
// the real source instead: for every `Purchases.<method>(` call, it climbs the
// enclosing parentheses and fails unless one of them belongs to a
// `withTimeout(`. Verified by fault injection — unwrapping any single call
// makes this fail.
{
  const whole = readFileSync(join(root, 'src/lib/pro.ts'), 'utf8');
  // Only the NATIVE provider talks to Play Billing. The web provider is
  // RevenueCat Web Billing over Stripe — ordinary HTTP, which fails rather
  // than hangs — so policing it would be noise.
  const from = whole.indexOf('class RevenueCatProvider');
  const to = whole.indexOf('class WebRevenueCatProvider');
  if (from < 0 || to < 0 || to < from) throw new Error('pro.ts no longer has the two provider classes');
  const src = whole.slice(from, to);
  const GUARDED = /Purchases\.(getCustomerInfo|getOfferings|purchasePackage|purchaseStoreProduct|restorePurchases|syncPurchases|logIn|logOut|setEmail|setDisplayName|configure)\s*\(/g;

  /** True when `idx` sits inside the argument list of some `withTimeout(`. */
  const insideWithTimeout = (text, idx) => {
    let depth = 0;
    for (let i = idx - 1; i >= 0; i--) {
      const c = text[i];
      if (c === ')') depth++;
      else if (c === '(') {
        // An unbalanced '(' is a call we are nested inside. Whose is it?
        if (depth === 0) {
          if (/withTimeout\s*$/.test(text.slice(Math.max(0, i - 20), i))) return true;
        } else depth--;
      }
    }
    return false;
  };

  const unguarded = [];
  for (const m of src.matchAll(GUARDED)) {
    if (!insideWithTimeout(src, m.index)) {
      unguarded.push(`${m[1]} at char ${m.index}`);
    }
  }
  check('every native store call is wrapped in withTimeout()', unguarded.length === 0, unguarded.join(', '));

  // The purchase sheet is driven by a human typing a password, so its bound has
  // to be far longer than a read's — a short one would cancel real purchases.
  const purchaseBound = /export const PURCHASE_TIMEOUT_MS = ([\d_]+)/.exec(whole);
  const readBound = /const STORE_TIMEOUT_MS = ([\d_]+)/.exec(whole);
  const asNum = (m) => (m ? Number(m[1].replace(/_/g, '')) : 0);
  check('the purchase bound is far longer than the read bound',
    asNum(purchaseBound) >= 60_000 && asNum(purchaseBound) > asNum(readBound) * 4,
    `purchase ${asNum(purchaseBound)}ms vs read ${asNum(readBound)}ms`);

  // A timeout must not be reported to the user as a failed purchase: Promise
  // .race stops us waiting, it cannot cancel a transaction Play already took.
  check('a timed-out purchase re-checks entitlement before reporting failure',
    /!== PURCHASE_TIMEOUT[\s\S]{0,600}?this\.sync\(\)/.test(src));
}

// --- checkout identity and Android Activity contract -----------------------
// RevenueCat can sell to an anonymous install, but that entitlement cannot be
// found by email or followed safely to desktop/another phone. The Pro sheet
// must therefore make Google identity a distinct step before checkout.
//
// RevenueCat's Capacitor Android integration also requires `standard` or
// `singleTop`: Play and banking apps can background HomeDesigner during a
// purchase, and `singleTask` can prevent the result reaching the SDK.
{
  const modal = readFileSync(join(root, 'src/components/ProUpsellModal.tsx'), 'utf8');
  check('native checkout signs the user in before starting Play Billing',
    modal.includes('const requiresAccount = native || webBilling') &&
      modal.includes('const needsAccount = requiresAccount && !account') &&
      modal.includes('const onPrimaryAction = needsAccount ? signIn : purchase'));
  check('restore is attached to an identified account',
    modal.includes('{(native || webBilling) && account && ('));

  // Android now sells the same ladder as web, so the plan grid must not be
  // web-only — but a store offering only the lifetime unlock keeps the single
  // button rather than rendering a grid of one.
  check('the plan grid is offered on Android too',
    modal.includes('const showPlanChoices = requiresAccount && !!account && plans.length > 1'));

  // The buy button must not be gated on auth-store busy. `authBusy` also covers
  // BACKGROUND account sync, and while it was OR'd into the button's state a
  // sync that never settled left the primary button rendering a bare spinner
  // AND disabled. Reported with a screenshot of a spinning "Unlock Pro" and
  // "No but i never click anything": no purchase was ever started, so no Play
  // sheet could ever open and nothing ever timed out. Sign-in may wait on auth;
  // buying may not.
  check('the buy button is not disabled by background account sync',
    modal.includes('const actionBusy = needsAccount ? authBusy : busy;'),
    'actionBusy folds authBusy into checkout again');

  // The strand itself: unbounded network. Every `busy` flag clears in a
  // `finally`, which is worthless if the awaited promise never settles.
  const cloud = readFileSync(join(root, 'src/lib/cloudSync.ts'), 'utf8');
  check('every cloud request is bounded',
    !/[^h]\bfetch\(`\$\{SYNC_URL\}/.test(cloud) && cloud.includes('function fetchWithTimeout'),
    'a raw fetch() to the sync Worker can hang forever');
  const auth = readFileSync(join(root, 'src/store/authStore.ts'), 'utf8');
  check('no auth path awaits an unbounded promise',
    !/await Promise\.allSettled/.test(auth) && !/await signInWithGoogle\(\)/.test(auth),
    'an unbounded await can strand busy and freeze the Pro sheet');

  const manifest = readFileSync(join(root, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
  check('Android uses RevenueCat-compatible singleTop launch mode',
    manifest.includes('android:launchMode="singleTop"') && !manifest.includes('android:launchMode="singleTask"'));
}

// --- Android must only ever be handed a package Play can sell ---------------
//
// A RevenueCat package holds one product PER app, so one offering can carry a
// Play product, a Web Billing product and a Test Store product side by side.
// This project's CURRENT offering (`default`) carries only the latter two; the
// Play `pro_unlock` sits in a different, non-current offering. Selecting
// `availablePackages[0]` therefore picks a product Play has never heard of —
// and Play does not report that as an error. No sheet opens, the promise never
// settles, and the buy button spins until the 180s bound: reported twice as
// "clicking on the 'unlock pro' button hangs ... 'still waiting for the play
// store'", with $0 ever reaching RevenueCat.
//
// Fault-injected: reverting either call site to firstAvailablePackage fails
// this, and so does dropping the identifier match.
{
  const whole = readFileSync(join(root, 'src/lib/pro.ts'), 'utf8');
  const from = whole.indexOf('class RevenueCatProvider');
  const to = whole.indexOf('class WebRevenueCatProvider');
  const native = whole.slice(from, to);

  check('Android selects its package by Play product id, not by position',
    /const PLAY_PLAN_PRODUCTS/.test(whole) && /function playPackage\(/.test(whole));
  check('Android checkout never falls back to a positional package',
    !/firstAvailablePackage/.test(native),
    'firstAvailablePackage still reachable from the native provider');
  check('every Play plan maps to a distinct product id',
    new Set(['pro_monthly', 'pro_yearly', 'pro_lifetime']
      .filter((id) => whole.includes(`productID: '${id}'`))).size === 3);
  // pro_unlock is promo-only: Google will not reprice a product with a live
  // promotion, so it must never be offered for sale again — while still
  // granting Pro to everyone who already holds it, via the entitlement.
  check('the promo-only pro_unlock is never sellable',
    !/productID: 'pro_unlock'/.test(whole));

  // Play appends the purchase option / base plan to a product id, so an exact
  // match alone would miss `pro_unlock:prounlock`.
  check('the Play product match tolerates the purchase-option suffix',
    /startsWith\(`\$\{productID\}:`\)/.test(whole));

  // Exercise the real selector against the shape the dashboard actually serves.
  // A real package always carries a price; `priceless` below covers the case
  // where Play could not supply one.
  const pkgs = (...ids) => ({
    availablePackages: ids.map((id) => ({ product: { identifier: id, priceString: '$64.99' } })),
  });
  const webOnlyCurrent = {
    current: pkgs('pro_monthly_web'),
    all: { default: pkgs('pro_monthly_web'), 'Pro unlcok': pkgs('pro_lifetime') },
  };
  check('a web-only current offering still resolves to the Play product',
    playPackage(webOnlyCurrent)?.product.identifier === 'pro_lifetime');
  check('a suffixed Play product id still resolves',
    playPackage({ all: { o: pkgs('pro_lifetime:prolifetime') } })?.product.identifier === 'pro_lifetime:prolifetime');
  check('no Play product means no purchase attempt at all',
    playPackage({ current: webOnlyCurrent.current, all: { default: webOnlyCurrent.all.default } }) === null);

  // The ladder: each plan must resolve to ITS OWN product, never a neighbour's —
  // charging for the wrong tier is the one outcome worse than not selling.
  const ladder = { current: pkgs('pro_monthly', 'pro_yearly', 'pro_lifetime'), all: {} };
  check('each plan buys its own Play product',
    playPackage(ladder, 'monthly')?.product.identifier === 'pro_monthly' &&
      playPackage(ladder, 'yearly')?.product.identifier === 'pro_yearly' &&
      playPackage(ladder, 'lifetime')?.product.identifier === 'pro_lifetime');
  check('an unnamed plan defaults to lifetime, not to the first package',
    playPackage(ladder)?.product.identifier === 'pro_lifetime');
  check('a plan whose product is missing never silently buys another',
    playPackage({ current: pkgs('pro_lifetime'), all: {} }, 'yearly') === null);

  // RevenueCat reads a one-time product's price from Play's backwards-compatible
  // purchase option alone (getOneTimePurchaseOfferDetails, singular). When Play
  // has none to report the package still arrives — just priceless — and handing
  // that to purchasePackage opens no sheet and never settles: the 180-second
  // spinner reported as "infinite spin before I even get a buy button".
  // getPlans already refuses to advertise a priceless product; checkout has to
  // refuse to buy one, or the two disagree about what is sellable.
  const priceless = { current: { availablePackages: [{ product: { identifier: 'pro_lifetime' } }] }, all: {} };
  check('a priceless Play package is never handed to checkout',
    playPackage(priceless) === null && playPackage(priceless, 'lifetime') === null);
  check('an empty price string is refused as well as a missing one',
    playPackage({ current: { availablePackages: [{ product: { identifier: 'pro_lifetime', priceString: '' } }] }, all: {} },
      'lifetime') === null);
  // A priceless package must be SKIPPED, not abort the search: the sellable
  // product may sit behind it in another offering.
  check('a priceless package does not mask a sellable one behind it',
    playPackage({
      current: { availablePackages: [{ product: { identifier: 'pro_lifetime' } }] },
      all: { 'Pro unlcok': pkgs('pro_lifetime') },
    }, 'lifetime')?.product.priceString === '$64.99');
  check('checkout and the plan list agree on what is sellable',
    /priceString/.test(whole.slice(whole.indexOf('function playPackageForProduct'),
      whole.indexOf('export function playPackage'))),
    'playPackageForProduct no longer requires a price');

  // With device logs unavailable for anyone but us, and multiple users hitting
  // this at once, the "not available" error has to name its own cause. The three
  // causes have completely different fixes and were previously indistinguishable.
  check('an empty store says the store returned nothing',
    /returned no products/.test(describeMissingProduct({ current: null, all: {} })));
  check('a store offering only foreign products says so',
    / 1 product\(s\), none of them the one this app sells/.test(
      describeMissingProduct({ current: pkgs('pro_unlock'), all: {} })));
  check('a priceless but correct product is reported as priceless, not missing',
    /without a price/.test(describeMissingProduct(
      { current: { availablePackages: [{ product: { identifier: 'pro_lifetime' } }] }, all: {} })));
  check('the cause is named per plan, not just for the default',
    /without a price/.test(describeMissingProduct(
      { current: { availablePackages: [{ product: { identifier: 'pro_yearly' } }] }, all: {} }, 'yearly')));

  // --- the web launch discount ---------------------------------------------
  // This makes a CLAIM ABOUT PRICE that the app cannot verify: RevenueCat
  // applies the discount at checkout but `purchases-js` never exposes it, so
  // the percentage is mirrored from the dashboard. Advertising a discount on
  // the wrong product would show a price the checkout will not honour.
  const webPkg = (identifier, formattedPrice, amountMicros) => ({
    lifetime: { webBillingProduct: { identifier, price: { formattedPrice, amountMicros, currency: 'USD' } } },
  });
  const discounted = webPlansFromOfferings({ current: webPkg('pro_lifetime_web_v2', '$59.99', 59990000), all: {} })[0];
  // Asserts the amount, not the currency symbol: Node's default locale renders
  // "USD 30.00" where a browser renders "$30.00".
  check('the discounted product shows a struck-through list price',
    discounted?.originalPriceLabel === '$59.99' && /30\.00/.test(discounted?.priceLabel ?? ''),
    `got ${discounted?.originalPriceLabel} -> ${discounted?.priceLabel}`);
  // $59.99 at 50% is $29.995. Rounded UP so the advertised price can never sit
  // below what the processor charges.
  check('a half-cent discount rounds up, never below the charged price',
    discounted?.priceMicros === 30000000, `priceMicros ${discounted?.priceMicros}`);
  // A product the dashboard does NOT discount must never be advertised as cut.
  const undiscounted = webPlansFromOfferings({ current: webPkg('pro_lifetime_web', '$59.99', 59990000), all: {} })[0];
  check('a product outside the discount is never shown as discounted',
    undiscounted?.originalPriceLabel === undefined && undiscounted?.priceLabel === '$59.99');

  // --- the pasteable store diagnostic ---------------------------------------
  // Users paste diagnostics into public forums, and the affordance is
  // discoverable no matter how it is hidden. Safety comes from CONTENT: store
  // configuration only, never identity and never a credential. A leaked Google
  // ID token is replayable against the sync Worker until it expires.
  {
    const p = fakeProvider({});
    p.getPlans = async () => [{ id: 'lifetime', label: 'Lifetime', priceLabel: '$30.00' }];
    setProProvider(p);
    const report = await collectStoreDiagnostics();
    check('the diagnostic reports the store configuration',
      /app \d/.test(report) && /platform /.test(report) && /lifetime=\$30\.00/.test(report),
      JSON.stringify(report));
    // The safety promise, asserted rather than trusted to review.
    const leaks = ['@', 'token', 'jwt', 'Bearer', 'subject', 'appUserID', 'google:', 'email'];
    const found = leaks.filter((needle) => report.toLowerCase().includes(needle.toLowerCase()));
    check('the diagnostic carries no identity, account or credential data',
      found.length === 0, `leaked: ${found.join(', ')}`);
  }

  // The legacy unlock must not be resellable even when the store still offers it.
  check('a lingering pro_unlock package is never selected',
    playPackage({ current: pkgs('pro_unlock'), all: {} }) === null &&
      playPackage({ current: pkgs('pro_unlock'), all: {} }, 'lifetime') === null);
}

// --- the buy button must always stop spinning -------------------------------
// `busy` gates the spinner and disables Restore. Whatever the provider does,
// it has to come back.
{
  reset(false);
  setProProvider({
    ...fakeProvider({}),
    purchase: () => Promise.reject(new Error('Play Store unavailable')),
  });
  await useProStore.getState().purchase();
  check('a rejected purchase clears busy', useProStore.getState().busy === false);

  reset(false);
  setProProvider({
    ...fakeProvider({}),
    restore: () => Promise.reject(new Error('Play Store unavailable')),
  });
  await useProStore.getState().restore();
  check('a rejected restore clears busy', useProStore.getState().busy === false);
}

// --- a purchase the Play sheet never reported back on ----------------------
//
// The billing sheet takes over the screen, so the app is backgrounded for it.
// Android can destroy the host Activity behind that sheet, and a PENDING
// purchase never calls back at all — either way the promise the buy button is
// waiting on never settles. Resume is the only moment we can tell, and until
// 1.22.2 nothing on that path cleared `busy`, so the button kept spinning.
{
  // Stranded, and the purchase had in fact gone through.
  reset(false);
  const p = fakeProvider({ synced: true });
  p.purchase = () => new Promise(() => {}); // never settles, exactly like Play
  setProProvider(p);
  void useProStore.getState().purchase();
  await new Promise((r) => setTimeout(r, 20));
  check('a stranded purchase leaves the button busy until resume', useProStore.getState().busy === true);

  const freed = await useProStore.getState().settleStranded();
  check('resume frees a stranded buy button', useProStore.getState().busy === false);
  check('resume claims the purchase Play never reported', freed === true && useProStore.getState().isPro === true);
}
{
  // Stranded, and nothing was actually bought: free the button, grant nothing.
  reset(false);
  const p = fakeProvider({ synced: false });
  p.purchase = () => new Promise(() => {});
  setProProvider(p);
  void useProStore.getState().purchase();
  await new Promise((r) => setTimeout(r, 20));
  const freed = await useProStore.getState().settleStranded();
  check('an unpaid stranded purchase still frees the button',
    useProStore.getState().busy === false && freed === false && useProStore.getState().isPro === false);
}
{
  // The store being unreachable must not strand the user either — a spinner
  // they cannot dismiss is worse than one they can retry.
  reset(false);
  const p = fakeProvider({ throws: true });
  p.purchase = () => new Promise(() => {});
  setProProvider(p);
  void useProStore.getState().purchase();
  await new Promise((r) => setTimeout(r, 20));
  await useProStore.getState().settleStranded();
  check('an offline resume still frees the button', useProStore.getState().busy === false);
}
{
  // Nothing in flight: resume must not touch entitlement or invent a toast.
  reset(false);
  const p = fakeProvider({ synced: true });
  setProProvider(p);
  const freed = await useProStore.getState().settleStranded();
  check('resume is a no-op when no purchase is in flight',
    freed === false && p.calls.sync === 0 && useProStore.getState().isPro === false);
}

rmSync(dir, { recursive: true, force: true });
if (failures) {
  console.log(`\nBILLING: ${failures} failing`);
  process.exit(1);
}
console.log('\nBILLING: all green');
