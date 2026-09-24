import { registerPlugin } from '@capacitor/core';

export const PLAY_PRO_PRODUCT_ID = 'pro_lifetime';
export const PLAY_PRO_PRODUCT_IDS = ['pro_lifetime', 'pro_yearly', 'pro_monthly'] as const;

export interface PlayProduct {
  identifier: string;
  title: string;
  description: string;
  priceString?: string;
  priceAmountMicros?: number;
  currencyCode?: string;
  offerToken?: string;
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
  getProduct(options: { productId: string }): Promise<{ product: PlayProduct | null }>;
  purchase(options: { productId: string; obfuscatedAccountId?: string }): Promise<{ purchase: PlayPurchase | null }>;
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
