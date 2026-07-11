import { Sparkles } from 'lucide-react';
import { APP_NAME } from '../lib/appInfo';
import { useI18n } from '../lib/i18n';

/**
 * First-run opt-in prompt: offers the guided tour instead of forcing it.
 * "Start tour" launches the CoachMarks; "Maybe later" dismisses (the tour
 * stays available from Settings → Replay the intro tour).
 */
export default function WelcomeTour({
  onStart,
  onSkip,
}: {
  onStart: () => void;
  onSkip: () => void;
}) {
  const t = useI18n();
  return (
    <div className="welcome-tour-backdrop" onClick={onSkip}>
      <div className="welcome-tour" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t('Welcome')}>
        <span className="wt-icon">
          <Sparkles className="icon" />
        </span>
        <h2>{t('Welcome')}</h2>
        <p>
          {APP_NAME} · {t('Take a quick tour to learn the basics.')}
        </p>
        <div className="wt-actions">
          <button className="btn" onClick={onSkip}>
            {t('Maybe later')}
          </button>
          <button className="btn primary" onClick={onStart}>
            {t('Start tour')}
          </button>
        </div>
      </div>
    </div>
  );
}
