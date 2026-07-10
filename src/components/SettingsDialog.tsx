import { useState } from 'react';
import { Settings, Monitor, Sun, Moon, ExternalLink } from 'lucide-react';
import { useDesign } from '../store/designStore';
import { useTheme, type ThemePref } from '../lib/theme';
import { hapticsEnabled, setHapticsEnabled, tapLight } from '../lib/haptics';
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

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal settings" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <Settings className="icon" /> Settings
        </div>
        <div className="modal-body settings-body">
          <section>
            <h3>Appearance</h3>
            <div className="seg" role="radiogroup" aria-label="Theme">
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
                    <Icon className="icon" /> {o.label}
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <h3>Units</h3>
            <div className="seg" role="radiogroup" aria-label="Measurement units">
              <button
                className={units === 'metric' ? 'active' : ''}
                role="radio"
                aria-checked={units === 'metric'}
                onClick={() => setUnits('metric')}
              >
                Metric (m)
              </button>
              <button
                className={units === 'imperial' ? 'active' : ''}
                role="radio"
                aria-checked={units === 'imperial'}
                onClick={() => setUnits('imperial')}
              >
                Imperial (ft)
              </button>
            </div>
          </section>

          <section>
            <h3>Editor</h3>
            <label className="settings-row">
              <span>Show grid</span>
              <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} />
            </label>
            <label className="settings-row">
              <span>Show dimensions</span>
              <input
                type="checkbox"
                checked={showDimensions}
                onChange={(e) => setShowDimensions(e.target.checked)}
              />
            </label>
            <label className="settings-row">
              <span>Vibration feedback</span>
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
            <h3>Help</h3>
            <button className="btn block" onClick={onReplayTour}>
              Replay the intro tour
            </button>
          </section>

          <p className="settings-meta">
            {APP_NAME} v{APP_VERSION} ·{' '}
            <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer">
              Privacy policy <ExternalLink className="icon" style={{ width: 11, height: 11 }} />
            </a>
          </p>
        </div>
        <div className="modal-foot">
          <button className="btn primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
