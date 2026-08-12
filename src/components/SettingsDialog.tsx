import { useState } from 'react';
import { Settings, Monitor, Sun, Moon, ExternalLink, LogOut, Trash2, RefreshCw, MessageCircle, WandSparkles } from 'lucide-react';
import { useDesign } from '../store/designStore';
import { useTheme, type ThemePref } from '../lib/theme';
import { hapticsEnabled, setHapticsEnabled, tapLight } from '../lib/haptics';
import { introEnabled, setIntroEnabled } from '../lib/introPref';
import { qualityPref, setQualityPref, detectTier, type QualityPref, type PerfTier } from '../lib/perfTier';
import { useI18n } from '../lib/i18n';
import LanguagePicker from './LanguagePicker';
import { APP_NAME, APP_VERSION, PRIVACY_URL } from '../lib/appInfo';
import { useStoreDiagnosticHold } from './useStoreDiagnosticHold';
import { useAuthStore } from '../store/authStore';
import { isModelStudioOwner, openModelStudio } from '../lib/modelStudioAccess';
import { openCommunityForum } from '../lib/communityAccess';
import { deleteCloudProjects } from '../lib/cloudSync';
import { toast } from '../lib/ui';
import Modal from './Modal';

const THEME_OPTIONS: { id: ThemePref; label: string; icon: typeof Sun }[] = [
  { id: 'system', label: 'System', icon: Monitor },
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'dark', label: 'Dark', icon: Moon },
];

function GoogleMark() {
  return (
    <svg className="google-mark" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285f4" d="M21.8 12.2c0-.7-.1-1.4-.2-2.1H12v4h5.5a4.7 4.7 0 0 1-2 3.1v2.6h3.3c1.9-1.8 3-4.4 3-7.6Z" />
      <path fill="#34a853" d="M12 22c2.7 0 5-.9 6.7-2.3l-3.3-2.6c-.9.6-2.1 1-3.4 1-2.6 0-4.8-1.8-5.6-4.2H3v2.7A10 10 0 0 0 12 22Z" />
      <path fill="#fbbc05" d="M6.4 14a6 6 0 0 1 0-3.9V7.4H3a10 10 0 0 0 0 9.1L6.4 14Z" />
      <path fill="#ea4335" d="M12 5.9c1.5 0 2.8.5 3.9 1.5l2.9-2.8A9.7 9.7 0 0 0 12 2a10 10 0 0 0-9 5.5l3.4 2.7C7.2 7.7 9.4 5.9 12 5.9Z" />
    </svg>
  );
}

const QUALITY_OPTIONS: { id: QualityPref; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'low', label: 'Battery saver' },
  { id: 'mid', label: 'Balanced' },
  { id: 'high', label: 'Best looking' },
];

const TIER_LABEL: Record<PerfTier, string> = {
  low: 'Battery saver',
  mid: 'Balanced',
  high: 'Best looking',
};

/** Central app preferences (theme, units, haptics, editor defaults, tour). */
export default function SettingsDialog({
  open,
  onClose,
  onReplayTour,
}: {
  open: boolean;
  onClose: () => void;
  onReplayTour: () => void;
}) {
  const pref = useTheme((s) => s.pref);
  const setPref = useTheme((s) => s.setPref);
  const units = useDesign((s) => s.units);
  const setUnits = useDesign((s) => s.setUnits);
  const showGrid = useDesign((s) => s.showGrid);
  const setShowGrid = useDesign((s) => s.setShowGrid);
  const showDimensions = useDesign((s) => s.showDimensions);
  const setShowDimensions = useDesign((s) => s.setShowDimensions);
  const [haptics, setHaptics] = useState(hapticsEnabled);
  const [intro, setIntro] = useState(introEnabled);
  const [quality, setQuality] = useState<QualityPref>(qualityPref);
  const account = useAuthStore((s) => s.account);
  const authConfigured = useAuthStore((s) => s.configured);
  const authBusy = useAuthStore((s) => s.busy);
  const signIn = useAuthStore((s) => s.signIn);
  const signOut = useAuthStore((s) => s.signOut);
  const syncNow = useAuthStore((s) => s.syncNow);
  const t = useI18n();
  const canOpenModelStudio = isModelStudioOwner(account?.email);
  const { busy: diagBusy, holdProps } = useStoreDiagnosticHold();

  return (
    <Modal open={open} onClose={onClose} className="settings" labelledBy="settings-title">
      <>
        <div className="modal-head" id="settings-title">
          <Settings className="icon" /> {t('Settings')}
        </div>
        <div className="modal-body settings-body">
          <section>
            <h3>{t('Account')}</h3>
            {account ? (
              <div className="account-card">
                {account.imageUrl ? <img src={account.imageUrl} alt="" referrerPolicy="no-referrer" /> : null}
                <div className="account-copy">
                  <strong>{account.name || t('Google account')}</strong>
                  {account.email ? <span>{account.email}</span> : null}
                  <small>{t('Plans and Pro access sync across your signed-in devices.')}</small>
                </div>
                <div className="account-actions">
                  <button
                    className="btn icon-btn"
                    onClick={() => void syncNow()}
                    disabled={authBusy}
                    aria-label={t('Sync now')}
                    data-tip={t('Sync now')}
                  >
                    <RefreshCw className={`icon ${authBusy ? 'spin' : ''}`} />
                  </button>
                  <button className="btn icon-btn" onClick={() => void signOut()} disabled={authBusy} aria-label={t('Sign out')}>
                    <LogOut className="icon" />
                  </button>
                  <button
                    className="btn icon-btn"
                    onClick={() => {
                      if (!window.confirm(t('Delete every cloud backup for this account? Plans on this device will remain.'))) return;
                      void deleteCloudProjects()
                        .then(() => toast.success(t('Cloud backups deleted. Future changes will continue syncing.')))
                        .catch(() => toast.error(t("Couldn't delete cloud backups — try again when you're online.")));
                    }}
                    disabled={authBusy}
                    aria-label={t('Delete cloud backups')}
                    data-tip={t('Delete cloud backups')}
                  >
                    <Trash2 className="icon" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="account-signin">
                <button className="btn google-signin" onClick={() => void signIn()} disabled={authBusy || !authConfigured}>
                  <GoogleMark />
                  {authBusy ? t('Signing in…') : t('Sign in with Google')}
                </button>
                <small>
                  {authConfigured
                    ? t('Sync plans and Pro access across your devices.')
                    : t('Google Sign-In needs an OAuth client ID in this build.')}
                </small>
              </div>
            )}
          </section>

          <section>
            <h3>{t('Appearance')}</h3>
            <div className="seg" role="radiogroup" aria-label={t('Appearance')}>
              {THEME_OPTIONS.map((o) => {
                const Icon = o.icon;
                return (
                  <button
                    key={o.id}
                    className={pref === o.id ? 'active' : ''}
                    role="radio"
                    aria-checked={pref === o.id}
                    onClick={() => setPref(o.id)}
                  >
                    <Icon className="icon" /> {t(o.label)}
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <h3>{t('Units')}</h3>
            <div className="seg" role="radiogroup" aria-label={t('Units')}>
              <button
                className={units === 'metric' ? 'active' : ''}
                role="radio"
                aria-checked={units === 'metric'}
                onClick={() => setUnits('metric')}
              >
                {t('Metric (m)')}
              </button>
              <button
                className={units === 'imperial' ? 'active' : ''}
                role="radio"
                aria-checked={units === 'imperial'}
                onClick={() => setUnits('imperial')}
              >
                {t('Imperial (ft)')}
              </button>
            </div>
          </section>

          <section>
            <h3>{t('Language')}</h3>
            <div className="settings-row">
              <span>{t('Language')}</span>
              <LanguagePicker align="right" />
            </div>
          </section>

          <section>
            <h3>{t('Editor')}</h3>
            <label className="settings-row">
              <span>{t('Show grid')}</span>
              <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} />
            </label>
            <label className="settings-row">
              <span>{t('Show dimensions')}</span>
              <input
                type="checkbox"
                checked={showDimensions}
                onChange={(e) => setShowDimensions(e.target.checked)}
              />
            </label>
            <label className="settings-row">
              <span>{t('Vibration feedback')}</span>
              <input
                type="checkbox"
                checked={haptics}
                onChange={(e) => {
                  setHapticsEnabled(e.target.checked);
                  setHaptics(e.target.checked);
                  if (e.target.checked) tapLight();
                }}
              />
            </label>
          </section>

          <section>
            <h3>{t('3D graphics')}</h3>
            <div className="seg" role="radiogroup" aria-label={t('3D graphics')}>
              {QUALITY_OPTIONS.map((o) => (
                <button
                  key={o.id}
                  className={quality === o.id ? 'active' : ''}
                  role="radio"
                  aria-checked={quality === o.id}
                  onClick={() => {
                    setQualityPref(o.id);
                    setQuality(o.id);
                  }}
                >
                  {t(o.label)}
                </button>
              ))}
            </div>
            <p className="settings-hint">
              {quality === 'auto'
                ? `${t('Matched to your device')} — ${t(TIER_LABEL[detectTier()])}. `
                : `${t('Higher settings add shadows and detail but use more battery.')} `}
              {t('Takes effect next time you open 3D.')}
            </p>
          </section>

          <section>
            <h3>{t('Startup')}</h3>
            <label className="settings-row">
              <span>{t('Play intro animation')}</span>
              <input
                type="checkbox"
                checked={intro}
                onChange={(e) => {
                  setIntroEnabled(e.target.checked);
                  setIntro(e.target.checked);
                }}
              />
            </label>
          </section>

          <section>
            <h3>{t('Help')}</h3>
            <div className="settings-actions">
              <button className="btn block" onClick={onReplayTour}>
                {t('Replay the intro tour')}
              </button>
              <button className="btn block" onClick={() => void openCommunityForum()}>
                <MessageCircle className="icon" /> {t('Community & support')}
                <ExternalLink className="icon" style={{ marginLeft: 'auto' }} />
              </button>
              {canOpenModelStudio ? (
                <button className="btn block" onClick={() => void openModelStudio()}>
                  <WandSparkles className="icon" /> Model Studio
                  <ExternalLink className="icon" style={{ marginLeft: 'auto' }} />
                </button>
              ) : null}
            </div>
          </section>

          <p className="settings-meta">
            {/* Long-press the version for a store diagnostic — the same
                affordance as About. It has to be here too: About opens only
                from the editor's More menu, while this is the version line
                people actually find. */}
            {APP_NAME}{' '}
            <span {...holdProps}>
              v{APP_VERSION}
              {diagBusy ? '…' : ''}
            </span>{' '}
            ·{' '}
            <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer">
              {t('Privacy policy')} <ExternalLink className="icon" style={{ width: 11, height: 11 }} />
            </a>
          </p>
        </div>
        <div className="modal-foot">
          <button className="btn primary" onClick={onClose}>
            {t('Done')}
          </button>
        </div>
      </>
    </Modal>
  );
}
