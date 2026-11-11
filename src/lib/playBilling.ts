import { registerPlugin } from '@capacitor/core';

export const PLAY_PRO_PRODUCT_ID = 'pro_lifetime';
export const PLAY_PRO_PRODUCT_IDS = ['pro_lifetime', 'pro_yearly', 'pro_monthly'] as const;

/** Play keeps one-time products and subscriptions in separate namespaces: a
 * product only resolves when it is queried with the type it was created as. */
export type PlayProductType = 'inapp' | 'subs';

/** The Pro ladder as it exists in Play Console, cheapest commitment first. */
export const PLAY_PRO_PLANS = [
  { id: 'monthly', productId: 'pro_monthly', productType: 'subs' },
  { id: 'yearly', productId: 'pro_yearly', productType: 'subs' },
  { id: 'lifetime', productId: PLAY_PRO_PRODUCT_ID, productType: 'inapp' },
] as const satisfies ReadonlyArray<{ id: 'monthly' | 'yearly' | 'lifetime'; productId: string; productType: PlayProductType }>;

export interface PlayProduct {
  identifier: string;
  title: string;
  description: string;
  priceString?: string;
  priceAmountMicros?: number;
  currencyCode?: string;
  offerToken?: string;
  /** Subscriptions only: the base plan the price belongs to, and its ISO 8601
   * billing period (`P1M`, `P1Y`). */
  basePlanId?: string;
  billingPeriod?: string;
}

export interface PlayPurchase {
  products: string[];
  purchaseToken: string;
  /** BillingClient Purchase.PurchaseState: 1 purchased, 2 pending. */
  purchaseState: number;
  acknowledged: boolean;
  purchaseTime: number;
  orderId?: string;
}

interface PlayBillingPlugin {
  connect(): Promise<{ ready: boolean }>;
  /** `productType` defaults to a one-time product. */
  getProduct(options: { productId: string; productType?: PlayProductType }): Promise<{ product: PlayProduct | null }>;
  purchase(options: { productId: string; productType?: PlayProductType; obfuscatedAccountId?: string }): Promise<{ purchase: PlayPurchase | null }>;
  getPurchases(): Promise<{ purchases: PlayPurchase[] }>;
  resetPurchaseFlow(): Promise<void>;
}

export const PlayBilling = registerPlugin<PlayBillingPlugin>('PlayBilling');

export function isCompletedProPurchase(purchase: PlayPurchase | null | undefined): purchase is PlayPurchase {
  return purchase?.purchaseState === 1
    && purchase.products.some((product) => (PLAY_PRO_PRODUCT_IDS as readonly string[]).includes(product))
    && typeof purchase.purchaseToken === 'string' && purchase.purchaseToken.length > 0;
}

export async function ownedProPurchases(): Promise<PlayPurchase[]> {
  const { purchases } = await PlayBilling.getPurchases();
  return purchases.filter(isCompletedProPurchase);
}
