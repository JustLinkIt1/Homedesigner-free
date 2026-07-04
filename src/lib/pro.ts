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
}

/** RevenueCat public SDK key (Android). Set before shipping — see RELEASING.md. */
const REVENUECAT_ANDROID_KEY = import.meta.env.VITE_REVENUECAT_ANDROID_KEY ?? '';
const ENTITLEMENT_ID = 'pro';

class RevenueCatProvider implements ProProvider {
  private configured = false;

  private async sdk() {
    const { Purchases } = await import('@revenuecat/purchases-capacitor');
    if (!this.configured) {
      await Purchases.configure({ apiKey: REVENUECAT_ANDROID_KEY });
      this.configured = true;
    }
    return Purchases;
  }

  async init(): Promise<void> {
    await this.sdk();
  }

  async isEntitled(): Promise<boolean> {
    const Purchases = await this.sdk();
    const { customerInfo } = await Purchases.getCustomerInfo();
    return customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
  }

  async getPrice(): Promise<string | null> {
    const Purchases = await this.sdk();
    const offerings = await Purchases.getOfferings();
    const pkg = offerings.current?.availablePackages[0];
    return pkg?.product.priceString ?? null;
  }

  async purchase(): Promise<boolean> {
    const Purchases = await this.sdk();
    const offerings = await Purchases.getOfferings();
    const pkg = offerings.current?.availablePackages[0];
    if (!pkg) throw new Error('Pro upgrade is not available right now.');
    const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg });
    return customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
  }

  async restore(): Promise<boolean> {
    const Purchases = await this.sdk();
    const { customerInfo } = await Purchases.restorePurchases();
    return customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
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
