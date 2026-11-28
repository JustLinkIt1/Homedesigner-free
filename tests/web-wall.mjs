// Signed-out web Pro wall (W1) and the pro_checkout funnel event (E1).
//
//   * a signed-out web visitor sees real prices when the public catalogue loads,
//     and today's plain sign-in button when it does not;
//   * the anonymous catalogue id can never reach the purchase SDK, and only a
//     `google:<sub>` id can buy;
//   * Continue -> Google sign-in -> checkout for the chosen plan, with the plan
//     kept when sign-in fails, and no checkout for an account that owns Pro;
//   * pro_checkout carries one of five stage strings and nothing else.
//
// No real checkout is ever opened: the purchase SDK is replaced by a stub.
//
//   node tests/web-wall.mjs
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const rootImport = root.replaceAll('\\', '/');
const dir = mkdtempSync(join(tmpdir(), 'hdwebwall-'));
const entry = join(root, '.web-wall-entry.tmp.ts');
writeFileSync(entry, `
export { useProStore } from '${rootImport}/src/store/proStore.ts';
export { useAuthStore } from '${rootImport}/src/store/authStore.ts';
export { setProProvider, WebRevenueCatProvider, isGoogleCustomerId, webPlansFromCatalogue, loadSignedOutWebPlans } from '${rootImport}/src/lib/pro.ts';
export { wallPlans, isSignedOutPlanWall, continueWithPlan, signInFromWall } from '${rootImport}/src/lib/webCheckout.ts';
export { flush, trackEvent, PRO_CHECKOUT_STAGES } from '${rootImport}/src/lib/events.ts';
`);

// A stand-in for @revenuecat/purchases-js. It records every customer id it is
// configured with and every purchase, and never opens anything.
const sdkStub = `
const rc = globalThis.__rc;
const pkg = (id, price) => ({ identifier: id, webBillingProduct: { price: { formattedPrice: price, amountMicros: 1, currency: 'EUR' } } });
export class Purchases {
  constructor(id) { this.id = id; }
  static configure({ appUserId }) { rc.configs.push(appUserId); return new Purchases(appUserId); }
  getAppUserId() { return this.id; }
  async changeUser(id) { rc.configs.push(id); this.id = id; }
  async setAttributes() {}
  async getCustomerInfo() { return { entitlements: { active: rc.owned ? { Pro: {} } : {} } }; }
  async getOfferings() {
    return { current: { monthly: pkg('m', '€4.99'), annual: pkg('a', '€29.99'), lifetime: pkg('l', '€69.99') }, all: {} };
  }
  async purchase({ rcPackage }) {
    rc.purchases.push({ user: this.id, pkg: rcPackage.identifier });
    if (rc.next === 'cancel') throw Object.assign(new Error('The user cancelled the purchase'), { errorCode: 1 });
    return { customerInfo: { entitlements: { active: { Pro: {} } } } };
  }
}
`;

globalThis.__rc = { configs: [], purchases: [], owned: false, next: 'pay' };
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
};
globalThis.window = globalThis;
globalThis.location = { search: '' };
globalThis.addEventListener = () => {};
globalThis.document = { visibilityState: 'visible', documentElement: { lang: 'en' }, addEventListener: () => {} };

// RevenueCat public catalogue fixture + the events endpoint.
const offeringsBody = {
  current_offering_id: 'default',
  offerings: [{
    identifier: 'default',
    packages: [
      { identifier: '$rc_monthly', platform_product_identifier: 'prod_m' },
      { identifier: '$rc_annual', platform_product_identifier: 'prod_y' },
      { identifier: '$rc_six_month', platform_product_identifier: 'prod_6' },
      { identifier: '$rc_lifetime', platform_product_identifier: 'prod_l' },
    ],
  }],
};
const productBodies = {
  prod_m: { product_details: [{ current_price: { amount_micros: 4_990_000, currency: 'EUR' } }] },
  prod_y: { product_details: [{ default_purchase_option_id: 'o', purchase_options: { o: { base_price: { amount_micros: 29_990_000, currency: 'EUR' } } } }] },
  prod_l: { product_details: [{ current_price: { amount_micros: 69_990_000, currency: 'EUR' } }] },
};
const fetched = [];
const sentBodies = [];
let catalogueDown = false;
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  if (url.includes('/v1/events')) { sentBodies.push(JSON.parse(init.body)); return { status: 202, ok: true, json: async () => ({}) }; }
  fetched.push({ url, method: init.method ?? 'GET', headers: init.headers });
  if (catalogueDown) throw new TypeError('offline');
  if (url.includes('/offerings')) return { ok: true, status: 200, json: async () => offeringsBody };
  const id = new URL(url).searchParams.get('id');
  return productBodies[id]
    ? { ok: true, status: 200, json: async () => productBodies[id] }
    : { ok: false, status: 404, json: async () => ({}) };
};

let mod;
try {
  await build({
    entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: join(dir, 'bundle.mjs'),
    define: {
      'import.meta.env': JSON.stringify({
        BASE_URL: '/', DEV: false, PROD: true,
        VITE_REVENUECAT_WEB_KEY: 'rcb_test_key', VITE_CLOUD_SYNC_URL: 'https://sync.example.test',
      }),
      __APP_VERSION__: '"1.22.54"',
    },
    plugins: [{
      // The cloud entitlement read needs a real Google token; with none, the cloud says "not Pro".
      name: 'cloud-entitlement-stub',
      setup(b) {
        b.onLoad({ filter: /[\\/]cloudSync\.ts$/ }, (args) => ({
          contents: readFileSync(args.path, 'utf8').replace(
            'export async function getCloudProEntitlement(): Promise<boolean> {',
            'export async function getCloudProEntitlement(): Promise<boolean> { if (globalThis.__rc) return false;'),
          loader: 'ts',
        }));
      },
    }, {
      name: 'rc-stub',
      setup(b) {
        b.onResolve({ filter: /^@revenuecat\/purchases-js$/ }, () => ({ path: 'rc-stub', namespace: 'rc-stub' }));
        b.onLoad({ filter: /.*/, namespace: 'rc-stub' }, () => ({ contents: sdkStub, loader: 'js' }));
      },
    }],
  });
  mod = await import(pathToFileURL(join(dir, 'bundle.mjs')).href);
} finally {
  rmSync(entry, { force: true });
}
const {
  useProStore, useAuthStore, setProProvider, WebRevenueCatProvider, isGoogleCustomerId, webPlansFromCatalogue,
  loadSignedOutWebPlans, wallPlans, isSignedOutPlanWall, continueWithPlan, signInFromWall, flush, trackEvent, PRO_CHECKOUT_STAGES,
} = mod;

let failures = 0;
const check = (label, ok, detail = '') => {
  if (ok) { console.log(`  ok   ${label}`); return; }
  failures++;
  console.log(`  FAIL ${label}${detail ? `\n         ${detail}` : ''}`);
};
const rejects = async (fn) => { try { await fn(); return null; } catch (e) { return e instanceof Error ? e.message : String(e); } };

/** The pro_checkout events sent so far, then cleared. */
const drain = async () => {
  await flush();
  const out = sentBodies.flatMap((b) => b.events).filter((e) => e.event === 'pro_checkout');
  sentBodies.length = 0;
  return out;
};
const stagesOf = (events) => events.map((e) => e.detail).join();

// ---- Catalogue: prices without an account --------------------------------
{
  console.log('signed-out catalogue');
  check('only a google: id counts as a purchasing customer',
    isGoogleCustomerId('google:1234') && !isGoogleCustomerId('homedesignerapp-web-pricing') && !isGoogleCustomerId('')
    && !isGoogleCustomerId(null) && !isGoogleCustomerId(undefined) && !isGoogleCustomerId('google:') && !isGoogleCustomerId('$RCAnonymousID:abc'));

  const plans = await loadSignedOutWebPlans();
  check('loads monthly, yearly and lifetime, in that order', plans.map((p) => p.id).join() === 'monthly,yearly,lifetime', plans.map((p) => p.id).join());
  check('prices come from the catalogue (current_price and purchase_options both read)',
    /4[.,]99/.test(plans[0].priceLabel) && /29[.,]99/.test(plans[1].priceLabel) && /69[.,]99/.test(plans[2].priceLabel),
    plans.map((p) => p.priceLabel).join(' | '));
  check('micros and currency are kept for the saving comparison', plans[1].priceMicros === 29_990_000 && plans[1].currency === 'EUR');
  check('the six-month package is not offered', !plans.some((p) => p.label.includes('6')));
  check('the catalogue is read with plain GETs and nothing else',
    fetched.length === 4 && fetched.every((f) => f.method === 'GET' && f.url.startsWith('https://api.revenuecat.com/')),
    fetched.map((f) => f.method + ' ' + f.url).join('\n'));
  check('the catalogue is read for the fixed pricing placeholder, never a customer id',
    fetched.every((f) => f.url.includes('/subscribers/homedesignerapp-web-pricing/')));

  const partial = webPlansFromCatalogue(offeringsBody, { prod_y: productBodies.prod_y });
  check('a rung without a price is left out, not shown blank', partial.map((p) => p.id).join() === 'yearly');
  check('no catalogue at all gives no plans', webPlansFromCatalogue(null, {}).length === 0 && webPlansFromCatalogue({ offerings: [] }, {}).length === 0);

  catalogueDown = true;
  const failure = await rejects(() => loadSignedOutWebPlans());
  catalogueDown = false;
  check('a network failure rejects (the caller then falls back)', !!failure);
  const http500 = await rejects(() => loadSignedOutWebPlans(async () => ({ ok: false, status: 500, json: async () => ({}) })));
  check('an HTTP error rejects', !!http500);
}

// ---- The wall: grid when prices load, today's button when they do not ----
{
  console.log('wall layout');
  const three = (await loadSignedOutWebPlans());
  const base = { native: false, webBilling: true, signedIn: false, handoff: false, plans: [], signedOutPlans: three };
  check('signed-out web with prices shows the three-plan grid', wallPlans(base).length === 3 && isSignedOutPlanWall(base));
  check('signed-out web without prices has no grid (plain sign-in button, as before)',
    wallPlans({ ...base, signedOutPlans: [] }).length <= 1);
  check('one lone rung is not a grid either', wallPlans({ ...base, signedOutPlans: three.slice(0, 1) }).length <= 1);
  const own = three.slice(0, 2);
  check('signed in: the account ladder, unchanged', wallPlans({ ...base, signedIn: true, plans: own }) === own && !isSignedOutPlanWall({ ...base, signedIn: true }));
  check('signed in with no account ladder yet and no handoff: nothing (as before)', wallPlans({ ...base, signedIn: true }).length === 0);
  check('mid-handoff, signed in, ladder not back yet: the grid stays', wallPlans({ ...base, signedIn: true, handoff: true }) === three);
  check('native Android: its own ladder, never the catalogue', wallPlans({ ...base, native: true, plans: own }) === own && !isSignedOutPlanWall({ ...base, native: true }));
  check('web without a billing key: no grid', wallPlans({ ...base, webBilling: false }).length === 0 && !isSignedOutPlanWall({ ...base, webBilling: false }));

  // The store side: loads once, retries after a failure.
  let calls = 0;
  let fail = true;
  setProProvider({
    async init() {}, async isEntitled() { return false; }, async getPrice() { return null; }, async getPlans() { return []; },
    async getSignedOutPlans() { calls++; if (fail) throw new Error('offline'); return three; },
    async purchase() { return false; }, async restore() { return false; }, async identify() { return false; }, async disconnect() { return false; },
  });
  await useProStore.getState().loadSignedOutPlans();
  check('a failed catalogue load leaves the wall on the plain button', useProStore.getState().signedOutPlans.length === 0);
  fail = false;
  await useProStore.getState().loadSignedOutPlans();
  check('it retries the next time the wall opens', useProStore.getState().signedOutPlans.length === 3 && calls === 2);
  await useProStore.getState().loadSignedOutPlans();
  check('and does not refetch once loaded', calls === 2);
  useProStore.setState({ signedOutPlans: [] });
}

// ---- The anonymous id can never buy ---------------------------------------
{
  console.log('anonymous id');
  const rc = globalThis.__rc;
  const provider = new WebRevenueCatProvider();
  const priced = await provider.getSignedOutPlans();
  check('the provider lists signed-out plans', priced.length === 3);
  check('listing signed-out plans never configures the purchase SDK', rc.configs.length === 0);
  check('signed-out getPlans stays empty (the account ladder needs an account)', (await provider.getPlans()).length === 0);

  const e1 = await rejects(() => provider.purchase('yearly'));
  check('purchase signed out is refused', /Sign in with Google/.test(e1 ?? ''), String(e1));
  const e2 = await rejects(() => provider.identify('homedesignerapp-web-pricing', null, null));
  check('identify refuses the anonymous catalogue id', /Sign in with Google/.test(e2 ?? ''), String(e2));
  const e3 = await rejects(() => provider.purchase('yearly'));
  check('and a purchase after that is still refused', /Sign in with Google/.test(e3 ?? ''), String(e3));
  check('the SDK was never configured nor asked to buy for any non-google id', rc.configs.length === 0 && rc.purchases.length === 0);

  await provider.identify('google:sub-1', 'a@example.test', 'A');
  await provider.purchase('yearly');
  check('after sign-in the purchase is made for google:<sub> only',
    rc.purchases.length === 1 && rc.purchases[0].user === 'google:sub-1' && rc.configs.every((id) => id === 'google:sub-1'),
    JSON.stringify(rc));
  await provider.disconnect();
  const e4 = await rejects(() => provider.purchase('yearly'));
  check('after sign-out it is refused again', /Sign in with Google/.test(e4 ?? '') && rc.purchases.length === 1);
  rc.configs.length = 0; rc.purchases.length = 0;
  await drain();
}

// ---- Sign-in -> checkout handoff, end to end -------------------------------
{
  console.log('handoff');
  const rc = globalThis.__rc;
  const realAccount = { subject: 'sub-9', email: 'b@example.test', name: 'B', imageUrl: null };
  const pro = () => useProStore.getState();
  const reset = () => {
    rc.configs.length = 0; rc.purchases.length = 0; rc.owned = false; rc.next = 'pay';
    setProProvider(new WebRevenueCatProvider());
    useProStore.setState({ isPro: false, busy: false, plans: [], signedOutPlans: [], pendingPlanID: null, checkoutHandoff: false, upsellOpen: true, upsellFeature: 'multiFloor', upsellTrigger: 'multiFloor:add' });
    useAuthStore.setState({ account: null, busy: false, purchasesLinked: false });
  };
  /** A sign-in that behaves like authStore.signIn on success: account set, then linkAccount. */
  const goodSignIn = async () => {
    useAuthStore.setState({ account: realAccount, purchasesLinked: false });
    await pro().linkAccount({ appUserID: `google:${realAccount.subject}`, email: realAccount.email, displayName: realAccount.name });
    useAuthStore.setState({ purchasesLinked: true });
  };

  reset();
  useAuthStore.setState({ signIn: goodSignIn });
  await continueWithPlan('lifetime');
  check('sign-in then checkout opens for the CHOSEN plan, no extra tap',
    rc.purchases.length === 1 && rc.purchases[0].user === 'google:sub-9' && rc.purchases[0].pkg === 'l', JSON.stringify(rc.purchases));
  check('and it paid, so Pro is on', pro().isPro === true);
  check('the handoff flag is released', pro().checkoutHandoff === false);
  check('funnel: signin_click, signin_ok, checkout_open, paid', stagesOf(await drain()) === 'signin_click,signin_ok,checkout_open,paid');

  // Sheet closed without paying.
  reset();
  rc.next = 'cancel';
  await continueWithPlan('monthly');
  check('closing the checkout sheet ends in cancel and leaves the user not Pro', pro().isPro === false && pro().busy === false && pro().checkoutHandoff === false);
  check('funnel: signin_click, signin_ok, checkout_open, cancel', stagesOf(await drain()) === 'signin_click,signin_ok,checkout_open,cancel');

  // Failed or closed sign-in.
  reset();
  useAuthStore.setState({ signIn: async () => { /* popup closed: no account */ } });
  await continueWithPlan('lifetime');
  check('failed sign-in: no checkout, no SDK, sheet still open', rc.purchases.length === 0 && rc.configs.length === 0 && pro().upsellOpen === true);
  check('failed sign-in: the chosen plan survives', pro().pendingPlanID === 'lifetime' && pro().checkoutHandoff === false);
  check('funnel: signin_click only', stagesOf(await drain()) === 'signin_click');

  // Account already owns Pro.
  reset();
  rc.owned = true;
  useAuthStore.setState({ signIn: goodSignIn });
  await continueWithPlan('yearly');
  check('an account that owns Pro gets no checkout', rc.purchases.length === 0 && pro().isPro === true);
  check('the sheet is closed (existing owned state)', pro().upsellOpen === false);
  check('funnel: signin_click, signin_ok', stagesOf(await drain()) === 'signin_click,signin_ok');

  // Signed in but linking failed: ownership unknown, so do not sell.
  reset();
  useAuthStore.setState({ signIn: async () => { useAuthStore.setState({ account: realAccount, purchasesLinked: false }); } });
  await continueWithPlan('yearly');
  check('signed in but purchases not linked: no blind checkout', rc.purchases.length === 0 && pro().checkoutHandoff === false);
  await drain();

  // Visitor closed the sheet while Google was open.
  reset();
  useAuthStore.setState({ signIn: async () => { pro().closeUpsell(); await goodSignIn(); } });
  await continueWithPlan('yearly');
  check('sheet dismissed during sign-in: no checkout appears out of nowhere', rc.purchases.length === 0);
  await drain();

  // The plain button (no prices): sign-in events, no auto checkout.
  reset();
  useAuthStore.setState({ signIn: goodSignIn });
  await signInFromWall();
  check('fallback sign-in button: signin_click, signin_ok and no checkout', rc.purchases.length === 0 && stagesOf(await drain()) === 'signin_click,signin_ok');

  // Existing signed-in web path is measured too.
  reset();
  await goodSignIn();
  await pro().purchase('yearly');
  check('signed-in path: checkout_open, paid', stagesOf(await drain()) === 'checkout_open,paid' && rc.purchases[0].user === 'google:sub-9');
}

// ---- One plan on sale (live today: Lifetime only) -----------------------------
{
  console.log('single plan');
  const rc = globalThis.__rc;
  const lifetimeOnly = { ...offeringsBody, offerings: [{ ...offeringsBody.offerings[0], packages: [{ identifier: '$rc_lifetime', platform_product_identifier: 'prod_l' }] }] };
  const one = await loadSignedOutWebPlans(async (url) => String(url).includes('/offerings')
    ? { ok: true, status: 200, json: async () => lifetimeOnly }
    : { ok: true, status: 200, json: async () => productBodies.prod_l });
  check('a Lifetime-only catalogue yields exactly one plan with its price', one.length === 1 && one[0].id === 'lifetime' && /69[.,]99/.test(one[0].priceLabel));
  const input = { native: false, webBilling: true, signedIn: false, handoff: false, plans: [], signedOutPlans: one };
  check('the wall gets that one plan (price + Continue button), not an empty list', wallPlans(input).length === 1 && isSignedOutPlanWall(input));
  const modal = readFileSync(join(root, 'src/components/ProUpsellModal.tsx'), 'utf8');
  check('the sheet shows Continue for one signed-out plan, a grid only for two or more',
    modal.includes('shownPlans.length === 1 && (!signedIn || checkoutHandoff)') && modal.includes('shownPlans.length > 1')
    && modal.includes('showContinue && selectedPlan') && modal.includes('!showSingleSignedOutPlan && ('));
  check('zero plans keeps the plain sign-in button', wallPlans({ ...input, signedOutPlans: [] }).length === 0);

  rc.configs.length = 0; rc.purchases.length = 0; rc.owned = false; rc.next = 'pay';
  setProProvider(new WebRevenueCatProvider());
  useProStore.setState({ isPro: false, busy: false, plans: [], signedOutPlans: one, pendingPlanID: null, checkoutHandoff: false, upsellOpen: true });
  const acct = { subject: 'sub-1p', email: null, name: null, imageUrl: null };
  useAuthStore.setState({ account: null, busy: false, purchasesLinked: false, signIn: async () => {
    useAuthStore.setState({ account: acct });
    await useProStore.getState().linkAccount({ appUserID: 'google:sub-1p', email: null, displayName: null });
    useAuthStore.setState({ purchasesLinked: true });
  } });
  await drain();
  await continueWithPlan(one[0].id);
  check('after sign-in the single plan is bought for google:<sub>, never the placeholder id',
    rc.purchases.length === 1 && rc.purchases[0].user === 'google:sub-1p' && rc.purchases[0].pkg === 'l'
    && !rc.configs.includes('homedesignerapp-web-pricing'), JSON.stringify(rc));
  check('funnel stages are the same as for the grid', stagesOf(await drain()) === 'signin_click,signin_ok,checkout_open,paid');
}

// ---- pro_checkout carries a stage and nothing else ---------------------------
{
  console.log('pro_checkout payload');
  check('five stages, exactly', PRO_CHECKOUT_STAGES.join() === 'signin_click,signin_ok,checkout_open,paid,cancel');
  await drain();
  trackEvent('pro_checkout', 'yearly');
  trackEvent('pro_checkout', 'price:29.99');
  trackEvent('pro_checkout', 'google:sub-9');
  trackEvent('pro_checkout', 'a@example.test');
  trackEvent('pro_checkout');
  for (const stage of PRO_CHECKOUT_STAGES) trackEvent('pro_checkout', stage);
  const events = await drain();
  check('anything that is not a stage is dropped; each stage goes out once', stagesOf(events) === PRO_CHECKOUT_STAGES.join(), stagesOf(events));
  check('each event is exactly { event, detail }', events.every((e) => Object.keys(e).sort().join() === 'detail,event'));

  // Every pro_checkout call in the source passes a literal stage.
  const sources = ['src/lib/pro.ts', 'src/lib/webCheckout.ts', 'src/components/ProUpsellModal.tsx', 'src/store/proStore.ts', 'src/store/authStore.ts']
    .map((p) => [p, readFileSync(join(root, p), 'utf8')]);
  const calls = sources.flatMap(([p, text]) => [...text.matchAll(/trackProCheckout\(([^)]*)\)/g)].map((m) => [p, m[1]]));
  check('every trackProCheckout call passes a literal stage',
    calls.length >= 6 && calls.every(([, arg]) => PRO_CHECKOUT_STAGES.some((s) => arg === `'${s}'`)), JSON.stringify(calls));
  check("nothing else sends 'pro_checkout'", sources.every(([, text]) => !/trackEvent\(\s*'pro_checkout'/.test(text)));
  const pro = sources[0][1];
  const playStart = pro.indexOf('class DirectPlayProvider');
  const webStart = pro.indexOf('class WebRevenueCatProvider');
  check('the Android purchase path never fires pro_checkout', !/trackProCheckout/.test(pro.slice(playStart, webStart)));
  const ev = readFileSync(join(root, 'src/lib/events.ts'), 'utf8');
  const fn = ev.slice(ev.indexOf('export function trackProCheckout'), ev.indexOf('export function initEvents'));
  check('trackProCheckout returns on a native platform before sending (EXEC cycle 130, web only)',
    /if \(Capacitor\.isNativePlatform\(\)\) return;/.test(fn) && fn.indexOf('isNativePlatform') < fn.indexOf("trackEvent('pro_checkout'"));
}

rmSync(dir, { recursive: true, force: true });
if (failures) {
  console.log(`\nWEB WALL: ${failures} failing`);
  process.exit(1);
}
console.log('\nWEB WALL: all green');
process.exit(0);
