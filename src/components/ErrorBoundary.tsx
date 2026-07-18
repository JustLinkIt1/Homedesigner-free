import { Component, type ReactNode } from 'react';
import { APP_NAME, APP_VERSION, SUPPORT_EMAIL } from '../lib/appInfo';

interface State {
  error: Error | null;
}

const CRASH_KEY = 'homedesigner.crashlog.v1';

/** Ring buffer of the last few crashes — local only, never sent anywhere. */
function recordCrash(error: Error): void {
  try {
    const log = JSON.parse(localStorage.getItem(CRASH_KEY) ?? '[]');
    log.unshift({
      message: String(error.message).slice(0, 500),
      stack: String(error.stack ?? '').slice(0, 2000),
      version: APP_VERSION,
      ts: new Date().toISOString(),
    });
    localStorage.setItem(CRASH_KEY, JSON.stringify(log.slice(0, 5)));
  } catch {
    /* best-effort */
  }
}

function crashMailHref(error: Error): string {
  const body = [
    'What were you doing when it crashed?',
    '',
    '—',
    `App ${APP_VERSION} · ${navigator.userAgent}`,
    '',
    error.message,
    (error.stack ?? '').slice(0, 1200),
  ].join('\n');
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`${APP_NAME} crash report`)}&body=${encodeURIComponent(body)}`;
}

/**
 * Last-resort crash screen. The user's design autosaves locally on every
 * change, so the primary promise here is "your work is safe" — plus a backup
 * download that reads the saved project straight from storage (not from React
 * state, which may be what just crashed).
 */
export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    recordCrash(error);
    return { error };
  }

  private downloadBackup = () => {
    try {
      // Prefer the active project's slot; fall back to the legacy single-slot
      // key from pre-multi-project releases. Keys are read directly rather
      // than through lib/projects so a crash there can't break the rescue.
      const activeId = localStorage.getItem('homedesigner.activeProject.v1');
      const raw =
        (activeId && localStorage.getItem(`homedesigner.project.${activeId}`)) ||
        localStorage.getItem('homedesigner.project.v1');
      if (!raw) return;
      const a = document.createElement('a');
      a.href = `data:application/json;charset=utf-8,${encodeURIComponent(raw)}`;
      a.download = 'homedesigner-backup.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      /* storage unavailable — nothing to back up */
    }
  };

  render() {
    if (!this.state.error) return this.props.children;
    // Deliberately NOT internationalized: the i18n module (or a locale file)
    // may itself be what crashed, and this screen must always render.
    return (
      <div className="crash-screen" role="alert">
        <div className="crash-card">
          <h1>Something went wrong</h1>
          <p>
            {APP_NAME} hit an unexpected error. Your design is autosaved on this device — reload
            to pick up where you left off.
          </p>
          <pre className="crash-detail">{this.state.error.message}</pre>
          <div className="crash-actions">
            <button className="btn primary" onClick={() => window.location.reload()}>
              Reload app
            </button>
            <button className="btn" onClick={this.downloadBackup}>
              Download project backup
            </button>
            <a className="btn" href={crashMailHref(this.state.error)}>
              Email crash details
            </a>
          </div>
        </div>
      </div>
    );
  }
}
