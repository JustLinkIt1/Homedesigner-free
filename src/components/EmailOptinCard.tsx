import { useEffect, useState } from 'react';
import { Mail, X } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { OPTIN_TEXT, WORDING_VERSION } from '../lib/emailConsent';
import { useEmailConsentStore } from '../store/emailConsentStore';

/**
 * The once-per-account product-email question, raised after Google sign-in.
 *
 * Consent rules this layout serves (spec hd-email-optin, section 5, and the
 * accepted wording hd-email-optin-text-2026-11-28):
 * - There is NO "Yes" button. The only way to say yes is to switch the switch
 *   on, and it always starts off. Do not add a highlighted or pre-selected yes:
 *   that is the nudge pattern the brief forbids.
 * - One neutral button ("Done") submits whatever the switch says: on = opt in,
 *   off = the recorded "no". It is a plain .btn, never the primary colour.
 * - Closing with the X is always "no", whatever the switch shows.
 * - It is not a dialog: no scrim, no focus trap, nothing behind it is blocked.
 *   It sits in a corner (bottom edge on phones) and the app works around it.
 * - It stands alone: no terms, no purchase and no feature depends on it.
 * - The switch label (L1) and the line under it (L2) are the consent wording,
 *   the same two strings as in Settings.
 */
function OptinCard() {
  const setOptIn = useEmailConsentStore((s) => s.setOptIn);
  const dismissPrompt = useEmailConsentStore((s) => s.dismissPrompt);
  const markShown = useEmailConsentStore((s) => s.markShown);
  const t = useI18n();
  // Mounted fresh each time the card is raised, so this always starts off.
  const [ticked, setTicked] = useState(false);
  const wording = OPTIN_TEXT[WORDING_VERSION];

  // One "shown" event each time the card comes up (the store raises it once per account).
  useEffect(() => {
    markShown('signin');
  }, [markShown]);

  return (
    <aside className="email-optin-card" role="region" aria-labelledby="email-optin-title">
      <div className="email-optin-head">
        <Mail className="icon" aria-hidden="true" />
        <strong id="email-optin-title">{t('Product updates by email')}</strong>
        <button className="email-optin-x" onClick={() => void dismissPrompt()} aria-label={t('Close')}>
          <X className="icon" />
        </button>
      </div>
      <label className="settings-row email-optin-setting">
        <span className="email-optin-label">{t(wording.label)}</span>
        <input type="checkbox" checked={ticked} onChange={(e) => setTicked(e.target.checked)} />
        <span className="email-optin-detail">{t(wording.detail)}</span>
      </label>
      <div className="email-optin-actions">
        <button className="btn" onClick={() => void (ticked ? setOptIn(true, 'signin') : dismissPrompt())}>
          {t('Done')}
        </button>
      </div>
    </aside>
  );
}

export default function EmailOptinCard() {
  const show = useEmailConsentStore((s) => s.emailOptinPrompt);
  return show ? <OptinCard /> : null;
}
