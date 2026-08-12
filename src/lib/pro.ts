// Pro entitlement plumbing. This is the ONLY file that knows how purchases
// happen; everything else consumes useProStore / requirePro(). On Android the
// provider is RevenueCat (Google Play Billing, one non-consumable
// `pro_unlock`); on the web it is RevenueCat Web Billing backed by Stripe.
// Builds without a Web Billing key retain the old Play Store link.
import { Capacitor } from '@capacitor/core';
import { useProStore } from '../store/proStore';
import { APP_VERSION, PLAY_STORE_URL } from './appInfo';
import { getCloudProEntitlement } from './cloudSync';

export type ProFeature = 'multiFloor' | 'pdfExport' | 'catalog' | 'projects';
export type ProPlanID = 'monthly' | 'yearly' | 'lifetime';

export interface ProPlan {
  id: ProPlanID;
  label: string;
  priceLabel: string;
  /** The undiscounted list price, present ONLY when a discount is actually
   *  applied to `priceLabel`. Rendered struck through beside the live price. */
  originalPriceLabel?: string;
  /** Exact web price data for truthful comparisons. Absent on native plans. */
  priceMicros?: number;
  currency?: string;
}

export function withTimeout<T>(promise: Promise<T>, ms: number, msg: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(msg)), ms)),
  ]);
}

/**
 * Every native call goes through Google Play Billing, and Play Billing can sit
 * FOREVER when its service connection cannot be established — a sideloaded
 * build, wedged Play Services, no Play account on the device. The plugin
 * surfaces that as a promise that never settles, not as an error, so an
 * unguarded `await` is an unbounded hang with no way out.
 *
 * Reported on 1.22.0: "hit the buy subscription button and it hangs." The buy
 * button renders a spinner while `busy`, and `busy` only clears in a `finally`
 * — so a promise that never settles leaves the sheet spinning forever with
 * Restore disabled beside it.
 *
 * Read-shaped calls get a short bound; anything that opens the Play sheet gets
 * a long one, because a human is typing a password into it.
 */
export const STORE_TIMEOUT_MS = 12_000;
export const PURCHASE_TIMEOUT_MS = 180_000;
/** Sentinel: a purchase that ran out of time is NOT a purchase that failed. */
const PURCHASE_TIMEOUT = 'homedesigner:purchase-timeout';

export interface ProProvider {
  init(): Promise<void>;
  /** Resolve the CURRENT entitlement. Reject (throw) on transport errors —
   *  never resolve false just because the network is down. */
  isEntitled(): Promise<boolean>;
  getPrice(): Promise<string | null>;
  getPlans(): Promise<ProPlan[]>;
  /** Returns true if the user completed the purchase. */
  purchase(planID?: ProPlanID): Promise<boolean>;
  /** Returns true if a previous purchase was restored. */
  restore(): Promise<boolean>;
  /** Push the store account's purchases up and re-read ownership, without any
   *  user interaction. This is how a Play promo code — redeemed OUTSIDE the app,
   *  in the Play Store — becomes visible to us. Optional: only the native
   *  provider has an out-of-app redemption path. */
  sync?(): Promise<boolean>;
  /** Switch RevenueCat from an anonymous customer to a stable account. */
  identify(appUserID: string, email: string | null, displayName: string | null): Promise<boolean>;
  /** Return to a fresh anonymous RevenueCat customer on account sign-out. */
  disconnect(): Promise<boolean>;
}

/** RevenueCat public SDK key (Android). Safe to embed — this is the client-
 *  facing key, not the secret API key. */
const REVENUECAT_ANDROID_KEY = 'goog_JtJREnLfSrMrpUMYtcLYwfNmnPC';
/** RevenueCat public Web Billing SDK key. Like the Android SDK key, this is a
 * public application identifier rather than a secret. */
const REVENUECAT_WEB_KEY = (import.meta.env.VITE_REVENUECAT_WEB_KEY ?? '').trim();
/** Preferred entitlement identifier. Kept resilient below: any active
 *  entitlement counts as Pro, so a dashboard rename can't lock buyers out. */
const ENTITLEMENT_ID = 'Pro';
/** The Google Play products this app SELLS, one per plan, cheapest first.
 *  Android checkout must be handed a package backed by one of THESE and nothing
 *  else — see `playPackage()`.
 *
 *  `pro_unlock` is deliberately absent. It is the original $6.99 lifetime
 *  unlock, and it still grants the `Pro` entitlement — every past buyer and
 *  every redeemed community promo code keeps working, because entitlement is
 *  what `isEntitled()`/`restore()` read, not this list. But Google will not
 *  reprice a product with a live promotion attached, and the community
 *  campaign's 497 codes run to Aug 2027, so the sellable lifetime product is
 *  `pro_lifetime` and `pro_unlock` survives for redemptions only. Play product
 *  ids can never be renamed, reused or deleted — only deactivated. */
const PLAY_PLAN_PRODUCTS: ReadonlyArray<{ id: ProPlanID; label: string; productID: string }> = [
  { id: 'monthly', label: 'Monthly', productID: 'pro_monthly' },
  { id: 'yearly', label: 'Yearly', productID: 'pro_yearly' },
  { id: 'lifetime', label: 'Lifetime', productID: 'pro_lifetime' },
];

/** True only when the customer holds the product's configured Pro entitlement.
 * Other RevenueCat entitlements must not silently unlock this app. */
function hasProEntitlement(customerInfo: any): boolean {
  const active = customerInfo?.entitlements?.active ?? {};
  return active[ENTITLEMENT_ID] !== undefined;
}

/** First purchasable package across ALL offerings, preferring the current one.
 *  Guards against the wrong offering being marked "current" in the dashboard:
 *  if current has no packages at all, we scan the rest.
 *
 *  WEB ONLY — last resort when no named plan package matches. Never use this on
 *  Android: position tells you nothing about which store owns the product, and
 *  buying a non-Play product hangs the sheet forever. Use `playPackage()`. */
function firstAvailablePackage(offerings: any): any | null {
  const pools: any[] = [];
  if (offerings?.current) pools.push(offerings.current);
  for (const off of Object.values(offerings?.all ?? {})) pools.push(off);
  for (const off of pools) {
    const pkg = (off as any)?.availablePackages?.[0];
    if (pkg) return pkg;
  }
  return null;
}

/**
 * The package Google Play can actually sell, chosen by product identifier
 * rather than by position.
 *
 * A RevenueCat package holds one product PER app, so a single offering can
 * carry a Play product, a Web Billing product and a Test Store product side by
 * side. Taking `availablePackages[0]` therefore says nothing about which store
 * the product belongs to, and this project's CURRENT offering (`default`) is
 * populated entirely with non-Play products — the Play `pro_unlock` lives in a
 * different, non-current offering. `firstAvailablePackage` only skips offerings
 * that are EMPTY, so a current offering full of products Play cannot sell walks
 * straight past it.
 *
 * Handing `purchasePackage` one of those is not an error the SDK reports: Play
 * is asked to open a sheet for a product it has never heard of, so no sheet
 * appears and the promise never settles. That is indistinguishable from "the
 * button hangs" — reported on 1.22.4 and again on 1.22.6 as "clicking on the
 * 'unlock pro' button hangs for a long time, then a message reads 'still
 * waiting for the play store'", with no purchase ever reaching RevenueCat.
 *
 * Returning null when the Play product is absent is deliberate: "Pro upgrade is
 * not available right now" is a far better outcome than a spinner that cannot
 * end, and it can never charge for the wrong thing.
 *
 * Selecting by id rather than by `offering.monthly`/`.annual`/`.lifetime` is the
 * same argument: those accessors report the package SLOT, which says nothing
 * about which store owns the product sitting in it.
 */
function playPackageForProduct(offerings: any, productID: string): any | null {
  for (const off of offeringPools(offerings)) {
    for (const pkg of (off as any)?.availablePackages ?? []) {
      const id: unknown = pkg?.product?.identifier;
      // Play appends the purchase option / base plan to a product id
      // (`pro_unlock:prounlock`, `pro_yearly:pro-yearly`).
      if (typeof id !== 'string' || !(id === productID || id.startsWith(`${productID}:`))) continue;
      // A matching id is not sufficient. RevenueCat derives a one-time
      // product's price from Play's BACKWARDS-COMPATIBLE purchase option alone
      // — `ProductDetails.getOneTimePurchaseOfferDetails()`, the singular
      // accessor; the `...List()` one that carries purchase options and
      // discount offers is never read by the SDK we ship. When Play has
      // nothing to report through it (a new purchase option that has not
      // propagated, one unavailable in this country, or one the legacy
      // accessor cannot express) the package still arrives — just priceless.
      //
      // Handing THAT to `purchasePackage` reproduces the exact hang this
      // function exists to prevent: Play opens no sheet and the promise never
      // settles. `getPlans` already declines to advertise a priceless product,
      // so checkout has to decline to buy one too. Otherwise the two disagree
      // about what is sellable, and the disagreement reaches the user as a
      // three-minute spinner instead of a sentence they can act on.
      if (typeof pkg?.product?.priceString !== 'string' || pkg.product.priceString === '') continue;
      return pkg;
    }
  }
  return null;
}

/**
 * Why checkout found nothing, in a sentence a user can paste to support.
 *
 * "Pro upgrade is not available right now" is honest but inert: it is identical
 * whether the store returned nothing at all, returned only products this app
 * does not sell, or returned the right product priceless. Those have completely
 * different fixes, and the difference lives in data no user can reach and — with
 * device logs off the table for anyone but us — that nobody can retrieve after
 * the fact. Reported by multiple users at once, which is exactly when a
 * self-reporting error is worth more than a tidy one.
 *
 * Deliberately short and free of raw dumps: enough to name the cause, not a
 * stack trace pasted into a review.
 */
export function describeMissingProduct(offerings: any, planID?: ProPlanID): string {
  const base = 'Pro upgrade is not available right now.';
  const products: string[] = [];
  let priceless = 0;
  for (const off of offeringPools(offerings)) {
    for (const pkg of (off as any)?.availablePackages ?? []) {
      const id = pkg?.product?.identifier;
      if (typeof id !== 'string') continue;
      products.push(id);
      if (!pkg?.product?.priceString) priceless += 1;
    }
  }
  if (products.length === 0) {
    return `${base} The store returned no products for this account or country. Please try again later.`;
  }
  const wanted = planID
    ? PLAY_PLAN_PRODUCTS.filter((p) => p.id === planID).map((p) => p.productID)
    : PLAY_PLAN_PRODUCTS.map((p) => p.productID);
  const matched = products.some((id) => wanted.some((w) => id === w || id.startsWith(`${w}:`)));
  if (matched && priceless > 0) {
    return `${base} The store listed it without a price, so it cannot be sold here yet. Please try again later.`;
  }
  return `${base} The store is offering ${products.length} product(s), none of them the one this app sells. `
    + 'This is a store configuration problem — please report it.';
}

export function playPackage(offerings: any, planID?: ProPlanID): any | null {
  // With no plan named, prefer the best-value end of the ladder — lifetime, then
  // yearly, then monthly — so a build whose subscriptions are not live yet still
  // sells the one-time unlock rather than nothing.
  const wanted = planID
    ? PLAY_PLAN_PRODUCTS.filter((plan) => plan.id === planID)
    : [...PLAY_PLAN_PRODUCTS].reverse();
  for (const plan of wanted) {
    const pkg = playPackageForProduct(offerings, plan.productID);
    if (pkg) return pkg;
  }
  // Deliberately NO "just take whatever the offering hands us" fallback, which
  // is what RevenueCat's sample app does and looks like the obvious
  // simplification. Tried, and it reintroduces the 1.22.7 hang: Web Billing
  // products carry a priceString too (`pro_monthly_web` at $64.99 in the
  // fixtures), so neither presence nor price distinguishes them from a Play
  // product, and `purchasePackage` on one opens no sheet and never settles.
  // Selecting by product id is the only signal that does.
  return null;
}

const WEB_PLAN_DEFINITIONS: Array<{
  id: ProPlanID;
  label: string;
  packageKey: 'monthly' | 'annual' | 'lifetime';
}> = [
  { id: 'monthly', label: 'Monthly', packageKey: 'monthly' },
  { id: 'yearly', label: 'Yearly', packageKey: 'annual' },
  { id: 'lifetime', label: 'Lifetime', packageKey: 'lifetime' },
];

function offeringPools(offerings: any): any[] {
  const pools: any[] = [];
  if (offerings?.current) pools.push(offerings.current);
  for (const offering of Object.values(offerings?.all ?? {})) {
    if (offering !== offerings?.current) pools.push(offering);
  }
  return pools;
}

function webPackageForPlan(offerings: any, planID: ProPlanID): any | null {
  const definition = WEB_PLAN_DEFINITIONS.find((plan) => plan.id === planID);
  if (!definition) return null;
  for (const offering of offeringPools(offerings)) {
    const pkg = offering?.[definition.packageKey];
    if (pkg) return pkg;
  }
  return null;
}

/**
 * The automatic Web Billing discount, mirrored from the RevenueCat dashboard.
 *
 * This has to be duplicated here, and that is worth understanding before
 * touching it. RevenueCat applies the discount at CHECKOUT, but the web SDK
 * does not expose it: every `discount` field in `purchases-js` is marked
 * "Excluded from this release type", so `price.formattedPrice` is always the
 * undiscounted list price. Without mirroring it, the app advertises 59.99 and
 * then charges 29.99 — the customer only discovers the offer at the payment
 * sheet, which is the one place it cannot persuade anyone to start.
 *
 * THIS MUST BE KEPT IN SYNC WITH THE DASHBOARD. It is a claim about price made
 * without the ability to verify it: if the `launch-offer-50` discount is
 * deactivated or changed in RevenueCat and this is not, the app advertises a
 * price the checkout will not honour. Set `percent: 0` the moment the dashboard
 * discount ends, and the struck-through price disappears on its own.
 */
const WEB_DISCOUNT = {
  /** RevenueCat dashboard identifier, for whoever has to reconcile these. */
  id: 'launch-offer-50',
  percent: 50,
  /** Only these products carry the discount in the dashboard. */
  productIDs: ['pro_lifetime_web_v2'],
};

/** Re-format `amountMicros` in the SAME currency and locale conventions the
 *  store used, so the discounted price cannot disagree with the list price it
 *  sits beside (currency symbol, separators, fraction digits). */
function formatWebPrice(amountMicros: number, currency: string): string | null {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency })
      .format(amountMicros / 1_000_000);
  } catch {
    // An unknown currency code must not take the price label down with it.
    return null;
  }
}

export function webPlansFromOfferings(offerings: any): ProPlan[] {
  return WEB_PLAN_DEFINITIONS.flatMap((definition) => {
    const pkg = webPackageForPlan(offerings, definition.id);
    const price = pkg?.webBillingProduct?.price;
    const priceLabel = price?.formattedPrice;
    if (!priceLabel) return [];
    const micros = typeof price.amountMicros === 'number' ? price.amountMicros : undefined;
    const currency = typeof price.currency === 'string' ? price.currency : undefined;

    // Only claim a discount for the products the dashboard actually discounts,
    // and only when the arithmetic produces a real, formattable price.
    const productID: unknown = pkg?.webBillingProduct?.identifier;
    const eligible = WEB_DISCOUNT.percent > 0
      && typeof productID === 'string'
      && WEB_DISCOUNT.productIDs.includes(productID)
      && micros !== undefined && currency !== undefined;
    // Rounded UP to the whole cent, deliberately. A percentage off a .99 price
    // lands on a half cent ($59.99 → $29.995) and the payment processor's own
    // rounding is not something this app can see. Rounding up can only ever
    // advertise a price at or above what is charged — the customer pays the same
    // or a cent less. Rounding down would advertise a price the checkout does
    // not honour, which is the one outcome worth designing against.
    const discountedMicros = eligible && micros !== undefined
      ? Math.ceil((micros * (100 - WEB_DISCOUNT.percent) / 100) / 10_000) * 10_000
      : undefined;
    const discounted = discountedMicros !== undefined && currency !== undefined
      ? formatWebPrice(discountedMicros, currency)
      : null;

    return [{
      id: definition.id,
      label: definition.label,
      priceLabel: discounted ?? priceLabel,
      ...(discounted ? { originalPriceLabel: priceLabel } : {}),
      // The comparison maths (yearly saving) must use what the customer is
      // actually charged, not the struck-through price.
      priceMicros: discounted ? discountedMicros : micros,
      currency,
    }];
  });
}

/**
 * A pasteable description of what the STORE returned, for diagnosing "I can't
 * buy" reports from users whose devices we will never attach a cable to.
 *
 * Deliberately safe to hand to a stranger, because it will be: a diagnostics
 * affordance is discoverable no matter how it is hidden, and obscurity is not a
 * security control. Safety here comes from CONTENT, not from where the button
 * lives. So this reports store CONFIGURATION only:
 *
 *   included — offering/package/product identifiers, price strings, currency,
 *     product type, app version, platform. Every one of these is already public
 *     in the Play listing or already rendered on the paywall.
 *   EXCLUDED — any auth token (a leaked Google ID token is replayable against
 *     the sync Worker until it expires), the account email, the Google subject,
 *     and the RevenueCat app user ID derived from it. People paste diagnostics
 *     into public forums.
 *
 * It grants an attacker nothing: purchases are verified server-side by Play and
 * RevenueCat, so knowing a product id buys no entitlement.
 */
export async function collectStoreDiagnostics(): Promise<string> {
  const lines: string[] = [
    `app ${APP_VERSION}`,
    `platform ${Capacitor.isNativePlatform() ? 'android' : 'web'}`,
  ];
  try {
    const provider = getProProvider();
    await provider.init();
    const plans = await provider.getPlans();
    lines.push(`plans ${plans.length ? plans.map((p) => `${p.id}=${p.priceLabel}`).join(' ') : '(none)'}`);
  } catch (err) {
    lines.push(`plans FAILED: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (Capacitor.isNativePlatform()) {
    try {
      const { Purchases } = await import('@revenuecat/purchases-capacitor');
      const offerings: any = await withTimeout(
        Purchases.getOfferings(), STORE_TIMEOUT_MS, 'getOfferings timed out');
      lines.push(`current offering: ${offerings?.current?.identifier ?? '(none)'}`);
      for (const [name, off] of Object.entries(offerings?.all ?? {})) {
        const pkgs = ((off as any)?.availablePackages ?? []).map((p: any) =>
          `${p?.identifier}/${p?.product?.identifier}`
          + `@${p?.product?.priceString || 'NO PRICE'}`
          + `/${p?.product?.productType ?? '?'}`);
        lines.push(`offering ${name}: ${pkgs.length ? pkgs.join(' ') : '(empty)'}`);
      }
    } catch (err) {
      lines.push(`offerings FAILED: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return lines.join('\n');
}

export function isWebBillingConfigured(): boolean {
  return REVENUECAT_WEB_KEY.startsWith('rcb_') || REVENUECAT_WEB_KEY.startsWith('strp_');
}

class RevenueCatProvider implements ProProvider {
  private configured = false;
  private configuring: Promise<void> | null = null;

  private async sdk() {
    // A build without the key must never reach the native SDK: RevenueCat
    // throws IllegalArgumentException on a blank key, and Capacitor rethrows
    // plugin exceptions as fatal RuntimeExceptions — i.e. the app crashes on
    // launch. Rejecting here keeps the cached entitlement and disables
    // purchasing gracefully instead.
    if (!REVENUECAT_ANDROID_KEY) {
      throw new Error('Billing is not available in this build (no RevenueCat key).');
    }
    const { Purchases, LOG_LEVEL } = await import('@revenuecat/purchases-capacitor');
    if (!this.configured) {
      this.configuring ??= withTimeout(
        // Log level BEFORE configure(), or the configure/BillingClient handshake
        // is the one part that never reaches logcat — and that handshake is
        // exactly what goes quiet when the Play sheet never opens. A purchase
        // that hangs produces no error, no callback and no sheet, so the SDK's
        // own log is the only witness to where it stopped. RevenueCat writes to
        // logcat only (never to the UI, never off-device), so this is invisible
        // to users and costs them nothing.
        Purchases.setLogLevel({ level: LOG_LEVEL.VERBOSE })
          .catch(() => { /* logging is diagnostic; never block configure on it */ })
          .then(() => Purchases.configure({ apiKey: REVENUECAT_ANDROID_KEY })),
        8000,
        'Could not connect to the store. Check your connection and try again.',
      ).then(() => { this.configured = true; }).finally(() => { this.configuring = null; });
      await this.configuring;
    }
    return Purchases;
  }

  async init(): Promise<void> {
    await this.sdk();
  }

  async isEntitled(): Promise<boolean> {
    const Purchases = await this.sdk();
    const { customerInfo } = await withTimeout(
      Purchases.getCustomerInfo(), STORE_TIMEOUT_MS, 'Timed out reading your purchases');
    return hasProEntitlement(customerInfo);
  }

  async getPrice(): Promise<string | null> {
    const Purchases = await this.sdk();
    const offerings = await withTimeout(
      Purchases.getOfferings(), STORE_TIMEOUT_MS, 'Timed out loading store products');
    // Must be the SAME package checkout will use, or the sheet promises a price
    // Play is not about to charge.
    const pkg = playPackage(offerings);
    return pkg?.product.priceString ?? null;
  }

  async getPlans(): Promise<ProPlan[]> {
    const Purchases = await this.sdk();
    const offerings = await withTimeout(
      Purchases.getOfferings(), STORE_TIMEOUT_MS, 'Timed out loading store products');
    // Only plans Play can actually sell are offered. A plan whose product is
    // missing (not yet live, or unavailable in this country) is left out rather
    // than shown and then failing at checkout.
    return PLAY_PLAN_PRODUCTS.flatMap(({ id, label, productID }) => {
      const product = playPackageForProduct(offerings, productID)?.product;
      if (!product?.priceString) return [];
      return [{
        id,
        label,
        priceLabel: product.priceString,
        // Play reports a plain number plus a currency code; the upsell's
        // yearly-saving maths compares micros within one currency.
        priceMicros: typeof product.price === 'number' ? Math.round(product.price * 1_000_000) : undefined,
        currency: typeof product.currencyCode === 'string' ? product.currencyCode : undefined,
      }];
    });
  }

  async purchase(planID?: ProPlanID): Promise<boolean> {
    const Purchases = await this.sdk();
    const offerings = await withTimeout(
      Purchases.getOfferings(), STORE_TIMEOUT_MS, 'Timed out loading store products');
    // Logged BEFORE selection, so it is captured on the "not available right
    // now" path too — that path throws, and the offerings that produced it are
    // otherwise gone. This is the ground truth the dashboard cannot give us:
    // what Play actually returned to THIS device, in THIS country, for THIS
    // account. RevenueCat's Android SDK drops any product Play does not know,
    // so a product missing here is missing in Play, not in our selection code.
    console.warn('[pro] offerings', JSON.stringify({
      current: offerings?.current?.identifier ?? null,
      offerings: Object.fromEntries(Object.entries(offerings?.all ?? {}).map(([name, off]: [string, any]) =>
        [name, (off?.availablePackages ?? []).map((p: any) =>
          `${p?.identifier}/${p?.product?.identifier}@${p?.product?.priceString ?? 'NO PRICE'}`)])),
    }));
    const pkg = playPackage(offerings, planID);
    if (!pkg) throw new Error(describeMissingProduct(offerings, planID));
    // Breadcrumb for "it spins and no Play sheet ever appears". Capacitor
    // mirrors console.* into logcat, so this lands beside RevenueCat's own
    // VERBOSE lines and answers the question the SDK's silence cannot: which
    // package did we actually hand over?
    //
    // It logs the fields that DECIDE the outcome, which are not the ones this
    // file selects on. purchasePackage sends the native side only `identifier`
    // and `presentedOfferingContext` (see the plugin's PurchasesPlugin.kt) —
    // `product` is never transmitted. The SDK then looks the package up again
    // in its own cached offering. So a package can match on product id and
    // carry a perfectly good price, and still name an offering/identifier pair
    // the SDK cannot resolve — at which point Play is never asked to open
    // anything. `console.warn`, not `.log`: the lint gate allows only warn/error.
    console.warn('[pro] purchasePackage', JSON.stringify({
      planID: planID ?? '(default)',
      packageID: pkg?.identifier,
      offering: pkg?.presentedOfferingContext?.offeringIdentifier ?? pkg?.offeringIdentifier,
      productID: pkg?.product?.identifier,
      price: pkg?.product?.priceString,
      productType: pkg?.product?.productType,
      hasDefaultOption: !!pkg?.product?.defaultOption,
    }));
    let customerInfo;
    try {
      ({ customerInfo } = await withTimeout(
        Purchases.purchasePackage({ aPackage: pkg }), PURCHASE_TIMEOUT_MS, PURCHASE_TIMEOUT));
    } catch (err) {
      if (!(err instanceof Error) || err.message !== PURCHASE_TIMEOUT) throw err;
      // Running out of time is not the same as failing. Play may still have
      // taken the money on its own schedule, and `Promise.race` only stops us
      // WAITING — it cannot cancel the transaction. So ask the store what it
      // actually believes before telling the user anything: reporting a
      // completed purchase as a failure is the one outcome worth avoiding.
      if (await this.sync().catch(() => false)) return true;
      // `err` is the sentinel withTimeout() threw a line above; anything else was
      // already rethrown. The real Play error never arrives (its promise is still
      // pending), so there is no upstream cause to attach — and Error.cause would
      // need lib ES2022, which this project deliberately does not use.
      // eslint-disable-next-line preserve-caught-error -- no upstream cause exists
      throw new Error("The Play Store didn't answer. If you were charged, tap Restore purchase.");
    }
    // purchasePackage resolving (not throwing) means Play charged the user, so
    // the transaction itself succeeded. If the entitlement is missing from
    // customerInfo (product not attached to an entitlement in the RevenueCat
    // dashboard), falling through to `false` would silently swallow a PAID
    // purchase — treat any owned product as success instead.
    if (hasProEntitlement(customerInfo)) return true;
    const owned: string[] = customerInfo?.allPurchasedProductIdentifiers ?? [];
    return owned.length > 0;
  }

  async restore(): Promise<boolean> {
    const Purchases = await this.sdk();
    const { customerInfo } = await withTimeout(
      Purchases.restorePurchases(), PURCHASE_TIMEOUT_MS, 'The Play Store took too long. Try again in a moment.');
    return hasProEntitlement(customerInfo);
  }

  async sync(): Promise<boolean> {
    // Google grants a promo-code redemption to the PLAY ACCOUNT, not to the
    // app: the user leaves, redeems in the Play Store (or via a redeem link),
    // and comes back. Play Billing's guidance is to query purchases when the
    // app resumes; syncPurchases() is RevenueCat's equivalent — it uploads the
    // device's Play purchases; the recomputed customer is then read back.
    const Purchases = await this.sdk();
    await withTimeout(Purchases.syncPurchases(), STORE_TIMEOUT_MS, 'Timed out syncing your purchases');
    const { customerInfo } = await withTimeout(
      Purchases.getCustomerInfo(), STORE_TIMEOUT_MS, 'Timed out reading your purchases');
    return hasProEntitlement(customerInfo)
      || (customerInfo?.allPurchasedProductIdentifiers?.length ?? 0) > 0;
  }

  async identify(appUserID: string, email: string | null, displayName: string | null): Promise<boolean> {
    const Purchases = await this.sdk();
    const { customerInfo } = await withTimeout(
      Purchases.logIn({ appUserID }), STORE_TIMEOUT_MS, 'Timed out linking your account');
    await withTimeout(Promise.all([
      Purchases.setEmail({ email }),
      Purchases.setDisplayName({ displayName }),
    ]), STORE_TIMEOUT_MS, 'Timed out linking your account');
    const ownsPro = (info: typeof customerInfo) =>
      hasProEntitlement(info) || (info.allPurchasedProductIdentifiers?.length ?? 0) > 0;
    if (ownsPro(customerInfo)) return true;

    // Account linking was added after the first Pro sales. Those customers
    // purchased under a RevenueCat anonymous ID, so logIn() alone may leave
    // the new Google ID empty. Re-sync the current Play account once while
    // linking; RevenueCat aliases an anonymous owner to this identified ID
    // under the project's "Transfer to new App User ID" policy.
    await withTimeout(Purchases.syncPurchases(), STORE_TIMEOUT_MS, 'Timed out syncing your purchases');
    const { customerInfo: migrated } = await withTimeout(
      Purchases.getCustomerInfo(), STORE_TIMEOUT_MS, 'Timed out reading your purchases');
    return ownsPro(migrated);
  }

  async disconnect(): Promise<boolean> {
    const Purchases = await this.sdk();
    const { customerInfo } = await withTimeout(
      Purchases.logOut(), STORE_TIMEOUT_MS, 'Timed out signing out of the store');
    return hasProEntitlement(customerInfo);
  }
}

/** Desktop RevenueCat Web Billing provider. It uses the same stable
 * `google:<subject>` customer ID as Android and the sync Worker, so a single
 * entitlement follows the signed-in customer across platforms. */
class WebRevenueCatProvider implements ProProvider {
  private purchases: import('@revenuecat/purchases-js').Purchases | null = null;
  private appUserID: string | null = null;
  private email: string | null = null;

  private async sdk(appUserID = this.appUserID) {
    if (!isWebBillingConfigured()) {
      throw new Error('Desktop billing is not configured yet.');
    }
    if (!appUserID) {
      throw new Error('Sign in with Google before buying Pro.');
    }
    if (!this.purchases) {
      const { Purchases } = await import('@revenuecat/purchases-js');
      this.purchases = Purchases.configure({
        apiKey: REVENUECAT_WEB_KEY,
        appUserId: appUserID,
      });
    } else if (this.purchases.getAppUserId() !== appUserID) {
      await this.purchases.changeUser(appUserID);
    }
    return this.purchases;
  }

  async init(): Promise<void> {}

  async isEntitled(): Promise<boolean> {
    if (!this.appUserID || !isWebBillingConfigured()) return false;
    const customerInfo = await (await this.sdk()).getCustomerInfo();
    return hasProEntitlement(customerInfo);
  }

  async getPrice(): Promise<string | null> {
    if (!this.appUserID || !isWebBillingConfigured()) return null;
    const offerings = await (await this.sdk()).getOfferings();
    const plans = webPlansFromOfferings(offerings);
    return plans.find((plan) => plan.id === 'lifetime')?.priceLabel ?? plans[0]?.priceLabel ?? null;
  }

  async getPlans(): Promise<ProPlan[]> {
    if (!this.appUserID || !isWebBillingConfigured()) return [];
    const offerings = await (await this.sdk()).getOfferings();
    return webPlansFromOfferings(offerings);
  }

  async purchase(planID?: ProPlanID): Promise<boolean> {
    // Keep older/unconfigured deployments useful until the Web Billing
    // provider and public key are enabled in RevenueCat.
    if (!isWebBillingConfigured()) {
      window.open(PLAY_STORE_URL, '_blank', 'noopener');
      return false;
    }
    const purchases = await this.sdk();
    const offerings = await withTimeout(
      purchases.getOfferings(),
      10000,
      'Timed out loading the Pro offer. Check your connection and try again.',
    );
    const pkg = planID
      ? webPackageForPlan(offerings, planID)
      : webPackageForPlan(offerings, 'lifetime') ?? firstAvailablePackage(offerings);
    if (!pkg) throw new Error('Pro upgrade is not available right now. Please try again later.');
    const result = await purchases.purchase({
      rcPackage: pkg,
      customerEmail: this.email ?? undefined,
      selectedLocale: document.documentElement.lang || undefined,
      defaultLocale: 'en',
    });
    return hasProEntitlement(result.customerInfo);
  }

  async restore(): Promise<boolean> {
    if (await this.isEntitled()) return true;
    return getCloudProEntitlement();
  }

  async identify(appUserID: string, email: string | null, displayName: string | null): Promise<boolean> {
    this.appUserID = appUserID;
    this.email = email;
    if (!isWebBillingConfigured()) return getCloudProEntitlement();

    const purchases = await this.sdk(appUserID);
    const attributes: Record<string, string> = {};
    if (email) attributes.$email = email;
    if (displayName) attributes.$displayName = displayName;
    if (Object.keys(attributes).length) await purchases.setAttributes(attributes);
    const customerInfo = await purchases.getCustomerInfo();
    return hasProEntitlement(customerInfo);
  }

  async disconnect(): Promise<boolean> {
    // A Google-linked entitlement belongs to the account being disconnected.
    this.appUserID = null;
    this.email = null;
    // Retain the SDK instance so a later account can switch with changeUser(),
    // but signed-out code can no longer query or buy as the previous customer.
    return false;
  }
}

let provider: ProProvider | null = null;

export function getProProvider(): ProProvider {
  if (!provider) {
    provider = Capacitor.isNativePlatform() ? new RevenueCatProvider() : new WebRevenueCatProvider();
  }
  return provider;
}

/** Test seam: inject a fake provider (Playwright/unit tests). */
export function setProProvider(p: ProProvider): void {
  provider = p;
}

/**
 * One-line feature gate. Returns true when the user may proceed; otherwise
 * opens the upsell for `feature` and returns false. Reads the store
 * synchronously so call sites need no async plumbing.
 */
export function requirePro(feature: ProFeature): boolean {
  const st = useProStore.getState();
  if (st.isPro) return true;
  st.openUpsell(feature);
  return false;
}
