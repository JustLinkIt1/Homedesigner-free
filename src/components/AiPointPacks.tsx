import { useEffect, useState } from 'react';
import { isNative } from '../lib/native';
import { PlayBilling } from '../lib/playBilling';
import { STORE_TIMEOUT_MS, withTimeout } from '../lib/pro';
import {
  aiJson, buyPlayPoints, restorePlayPoints,
  type PointPack, type PointsState,
} from '../lib/aiRender';
import { useI18n } from '../lib/i18n';
import { withPointBalanceRefresh } from '../lib/pointPurchases';

export default function AiPointPacks({
  points,
  busy,
  run,
  onRefresh,
  expanded = false,
}: {
  points: PointsState | null;
  busy: boolean;
  run: (action: () => Promise<void>) => void;
  onRefresh: () => Promise<void>;
  expanded?: boolean;
}) {
  const t = useI18n();
  const native = isNative();
  const [prices, setPrices] = useState<Record<string, string>>({});
  const packs = points?.packs;
  useEffect(() => {
    if (!native || !packs) return;
    let cancelled = false;
    void Promise.all(packs.map(async pack => {
      try {
        const { product } = await withTimeout(
          PlayBilling.getProduct({ productId: pack.playProductId }),
          STORE_TIMEOUT_MS,
          'Store unavailable',
        );
        return [pack.playProductId, product?.priceString ?? ''] as const;
      } catch {
        return [pack.playProductId, ''] as const;
      }
    })).then(entries => { if (!cancelled) setPrices(Object.fromEntries(entries)); });
    return () => { cancelled = true; };
  }, [native, packs]);

  const buy = async (pack: PointPack) => {
    if (native) {
      await withPointBalanceRefresh(() => buyPlayPoints(pack), onRefresh);
      return;
    }
    const checkout = await aiJson<{ url: string }>('/v1/points/checkout', { packId: pack.id });
    const url = new URL(checkout.url);
    if (url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com') {
      throw new Error('Unexpected checkout address.');
    }
    window.location.assign(url.href);
  };

  return <details open={expanded || undefined}>
    <summary>{t('Get AI points')}</summary>
    <p>{t('Point packs are separate from Pro. Prices below include your account discount when available.')}</p>
    <div className="ai-point-packs">{points?.packs.map(pack => <button
      className="btn"
      key={pack.id}
      disabled={busy || (native ? !prices[pack.playProductId] : !points.cardCheckout)}
      onClick={() => run(() => buy(pack))}
    >{pack.points.toLocaleString()} {t('points')} · {native
        ? prices[pack.playProductId] || t('Unavailable')
        : points.cardCheckout ? `$${(pack.priceCents / 100).toFixed(2)} USD` : t('Unavailable')}</button>)}</div>
    {native && <button className="btn" disabled={busy} onClick={() => run(async () => {
      await withPointBalanceRefresh(restorePlayPoints, onRefresh);
    })}>{t('Restore point purchases')}</button>}
  </details>;
}
