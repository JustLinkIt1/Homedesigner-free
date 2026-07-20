// Pro entitlement plumbing. This is the ONLY file that knows how purchases
// happen; everything else consumes useProStore / requirePro(). On Android the
// provider is RevenueCat (Google Play Billing, one non-consumable
// `pro_unlock`); on the web — which ships as a free demo — the provider is a
// mock whose "buy" action links to the Play listing, and which Playwright
// flips via ?pro=1 to exercise both sides of every gate.
import { Capacitor } from '@capacitor/core';
import { useProStore } from '../store/proStore';
import { PLAY_STORE_URL } from './appInfo';

export type ProFeature = 'multiFloor' | 'pdfExport' | 'catalog' | 'projects';

function withTimeout<T>(promise: Promise<T>, ms: number, msg: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(msg)), ms)),
  ]);
}

export interface ProProvider {
  init(): Promise<void>;
  /** Resolve the CURRENT entitlement. Reject (throw) on transport errors —
   *  never resolve false just because the network is down. */
  isEntitled(): Promise<boolean>;
  getPrice(): Promise<string | null>;
  /** Returns true if the user completed the purchase. */
  purchase(): Promise<boolean>;
  /** Returns true if a previous purchase was restored. */
  restore(): Promise<boolean>;
  /** Switch RevenueCat from an anonymous customer to a stable account. */
  identify(appUserID: string, email: string | null, displayName: string | null): Promise<boolean>;
  /** Return to a fresh anonymous RevenueCat customer on account sign-out. */
  disconnect(): Promise<boolean>;
}

/** RevenueCat public SDK key (Android). Safe to embed — this is the client-
 *  facing key, not the secret API key. */
const REVENUECAT_ANDROID_KEY = 'goog_JtJREnLfSrMrpUMYtcLYwfNmnPC';
/** Preferred entitlement identifier. Kept resilient below: any active
 *  entitlement counts as Pro, so a dashboard rename can't lock buyers out. */
const ENTITLEMENT_ID = 'Pro';

/** True if the customer holds Pro. Checks the named entitlement first, then
 *  falls back to "any active entitlement" — this app only sells one thing, so
 *  a case/name mismatch in the RevenueCat dashboard must never deny access. */
function hasProEntitlement(customerInfo: any): boolean {
  const active = customerInfo?.entitlements?.active ?? {};
  return active[ENTITLEMENT_ID] !== undefined || Object.keys(active).length > 0;
}

/** First purchasable package across ALL offerings, preferring the current one.
 *  Guards against the wrong offering being marked "current" in the dashboard:
 *  if current has no store-valid packages, we scan the rest. */
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
    const { Purchases } = await import('@revenuecat/purchases-capacitor');
    if (!this.configured) {
      this.configuring ??= withTimeout(
        Purchases.configure({ apiKey: REVENUECAT_ANDROID_KEY }),
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
    const { customerInfo } = await Purchases.getCustomerInfo();
    return hasProEntitlement(customerInfo);
  }

  async getPrice(): Promise<string | null> {
    const Purchases = await this.sdk();
    const offerings = await Purchases.getOfferings();
    const pkg = firstAvailablePackage(offerings);
    return pkg?.product.priceString ?? null;
  }

  async purchase(): Promise<boolean> {
    const Purchases = await this.sdk();
    const offerings = await withTimeout(Purchases.getOfferings(), 10000, 'Timed out loading store products');
    const pkg = firstAvailablePackage(offerings);
    if (!pkg) throw new Error('Pro upgrade is not available right now. Please try again later.');
    const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg });
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
    const { customerInfo } = await Purchases.restorePurchases();
    return hasProEntitlement(customerInfo);
  }

  async identify(appUserID: string, email: string | null, displayName: string | null): Promise<boolean> {
    const Purchases = await this.sdk();
    const { customerInfo } = await Purchases.logIn({ appUserID });
    await Promise.all([
      Purchases.setEmail({ email }),
      Purchases.setDisplayName({ displayName }),
    ]);
    return hasProEntitlement(customerInfo) || (customerInfo.allPurchasedProductIdentifiers?.length ?? 0) > 0;
  }

  async disconnect(): Promise<boolean> {
    const Purchases = await this.sdk();
    const { customerInfo } = await Purchases.logOut();
    return hasProEntitlement(customerInfo);
  }
}

/** Web/demo + test provider. Entitlement via ?pro=1 or a localStorage flag. */
class MockProvider implements ProProvider {
  async init(): Promise<void> {
    try {
      if (new URLSearchParams(window.location.search).get('pro') === '1') {
        localStorage.setItem('homedesigner.pro.mock', '1');
      }
    } catch {
      /* no URL access (tests) */
    }
  }

  async isEntitled(): Promise<boolean> {
    try {
      return localStorage.getItem('homedesigner.pro.mock') === '1';
    } catch {
      return false;
    }
  }

  async getPrice(): Promise<string | null> {
    return '$6.99';
  }

  async purchase(): Promise<boolean> {
    // The web demo can't sell — send the visitor to the Android listing.
    window.open(PLAY_STORE_URL, '_blank', 'noopener');
    return false;
  }

  async restore(): Promise<boolean> {
    return this.isEntitled();
  }

  async identify(): Promise<boolean> {
    return this.isEntitled();
  }

  async disconnect(): Promise<boolean> {
    return this.isEntitled();
  }
}

let provider: ProProvider | null = null;

export function getProProvider(): ProProvider {
  if (!provider) {
    provider = Capacitor.isNativePlatform() ? new RevenueCatProvider() : new MockProvider();
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
