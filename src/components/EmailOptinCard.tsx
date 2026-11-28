import { useEffect } from 'react';
import { Mail, X } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { OPTIN_TEXT, WORDING_VERSION } from '../lib/emailConsent';
import { useEmailConsentStore } from '../store/emailConsentStore';

/**
 * The once-per-account product-email question, raised after Google sign-in.
 *
 * Consent rules this layout serves (spec hd-email-optin, section 5):
 * - No default answer: there is no checkbox and nothing is pre-selected.
 * - "Not now" and "Yes, email me" are the same button, the same size, side by
 *   side. Neither is the primary colour, neither is a small grey link.
 * - It is not a dialog: no scrim, no focus trap, nothing behind it is blocked.
 *   It sits in a corner (bottom edge on phones) and the app works around it.
 * - Closing it is the same answer as "Not now".
 * - It stands alone: no terms, no purchase and no feature depends on it.
 */
export default function EmailOptinCard() {
  const show = useEmailConsentStore((s) => s.emailOptinPrompt);
  const setOptIn = useEmailConsentStore((s) => s.setOptIn);
  const dismissPrompt = useEmailConsentStore((s) => s.dismissPrompt);
  const markShown = useEmailConsentStore((s) => s.markShown);
  const t = useI18n();

  // One "shown" event each time the card comes up (the store raises it once per account).
  useEffect(() => {
    if (show) markShown('signin');
  }, [show, markShown]);

  if (!show) return null;
  return (
    <aside className="email-optin-card" role="region" aria-labelledby="email-optin-title">
      <div className="email-optin-head">
        <Mail className="icon" aria-hidden="true" />
        <strong id="email-optin-title">{t('Email updates')}</strong>
        <button className="email-optin-x" onClick={() => void dismissPrompt()} aria-label={t('Close')}>
          <X className="icon" />
        </button>
      </div>
      <p id="email-optin-text">{t(OPTIN_TEXT[WORDING_VERSION])}</p>
      <div className="email-optin-actions">
        <button className="btn" aria-describedby="email-optin-text" onClick={() => void setOptIn(true, 'signin')}>
          {t('Yes, email me')}
        </button>
        <button className="btn" onClick={() => void dismissPrompt()}>
          {t('Not now')}
        </button>
      </div>
    </aside>
  );
}
