import type { PlayPurchase } from './playBilling';

/** One pending/foreign receipt must not prevent other valid packs restoring. */
export async function restorePointPurchases(
  purchases: PlayPurchase[],
  claim: (purchase: PlayPurchase) => Promise<unknown>,
  accountUnchanged: () => boolean,
): Promise<void> {
  let failures = 0;
  let firstError = '';
  for (const purchase of purchases) {
    if (!accountUnchanged()) throw new Error('Account changed. Sign back in and restore point purchases.');
    if (!purchase.products.some(id => /^points_(2000|6000|15000)(_pro)?$/.test(id))) continue;
    try { await claim(purchase); }
    catch (error) {
      failures++;
      if (!firstError) firstError = error instanceof Error ? error.message : 'Restore failed.';
    }
  }
  if (!accountUnchanged()) throw new Error('Account changed. Sign back in and restore point purchases.');
  if (failures) throw new Error(`${failures} point purchase(s) could not be restored. Other valid purchases were processed. ${firstError}`);
}

/** A server credit can succeed even if consuming the receipt then times out. */
export async function withPointBalanceRefresh(action: () => Promise<void>, refresh: () => Promise<void>): Promise<void> {
  try { await action(); }
  catch (error) {
    await refresh().catch(() => undefined);
    throw error;
  }
  await refresh();
}
