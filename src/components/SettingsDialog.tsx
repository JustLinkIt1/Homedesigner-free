import { useState } from 'react';
import { Settings, Monitor, Sun, Moon, ExternalLink } from 'lucide-react';
import { useDesign } from '../store/designStore';
import { useTheme, type ThemePref } from '../lib/theme';
import { hapticsEnabled, setHapticsEnabled, tapLight } from '../lib/haptics';
import { useI18n } from '../lib/i18n';
import LanguagePicker from './LanguagePicker';
import { APP_NAME, APP_VERSION, PRIVACY_URL } from '../lib/appInfo';

const THEME_OPTIONS: { id: ThemePref; label: string; icon: typeof Sun }[] = [
  { id: 'system', label: 'System', icon: Monitor },
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'dark', label: 'Dark', icon: Moon },
];

/** Central app preferences (theme, units, haptics, editor defaults, tour). */
export default function SettingsDialog({
  onClose,
  onReplayTour,
}: {
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
  const t = useI18n();

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal settings" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <Settings className="icon" /> {t('Settings')}
        </div>
        <div className="modal-body settings-body">
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
            <h3>{t('Help')}</h3>
            <button className="btn block" onClick={onReplayTour}>
              {t('Replay the intro tour')}
            </button>
          </section>

          <p className="settings-meta">
            {APP_NAME} v{APP_VERSION} ·{' '}
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
      </div>
    </div>
  );
}
