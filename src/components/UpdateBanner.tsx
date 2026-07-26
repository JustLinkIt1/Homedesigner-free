import { Download, X } from 'lucide-react';
import { useEffect } from 'react';
import { useI18n } from '../lib/i18n';
import { isNative } from '../lib/native';
import { applyUpdate, checkForUpdate, useAppUpdate } from '../lib/appUpdate';

/**
 * "A new version is available" — shown once per release, never blocking.
 *
 * A banner rather than a toast: toasts time out, and someone who opens the app
 * to finish a drawing should be able to leave the offer sitting there and act
 * on it when they are ready. Dismissing remembers the version, so it asks again
 * for the NEXT release rather than going quiet forever.
 */
export default function UpdateBanner() {
  const t = useI18n();
  const available = useAppUpdate((s) => s.available);
  const version = useAppUpdate((s) => s.version);
  const busy = useAppUpdate((s) => s.busy);
  const dismiss = useAppUpdate((s) => s.dismiss);

  useEffect(() => {
    // On startup, and again whenever the app is brought back to the front —
    // that second one is what catches long-lived tabs and backgrounded phones.
    void checkForUpdate();
    const onShow = () => {
      if (document.visibilityState === 'visible') void checkForUpdate();
    };
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, []);

  if (!available) return null;
  return (
    <div className="update-banner" role="status">
      <Download className="icon" />
      <span className="ub-text">
        {version
          ? `${t('Version')} ${version} ${t('is available.')}`
          : t('A new version is available.')}
      </span>
      <button className="ub-go" onClick={() => void applyUpdate()} disabled={busy}>
        {busy ? t('Updating…') : isNative() ? t('Update') : t('Reload')}
      </button>
      <button className="ub-close" aria-label={t('Dismiss')} onClick={dismiss}>
        <X className="icon" />
      </button>
    </div>
  );
}
