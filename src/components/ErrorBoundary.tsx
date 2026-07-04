import { Component, type ReactNode } from 'react';
import { APP_NAME } from '../lib/appInfo';

interface State {
  error: Error | null;
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
          </div>
        </div>
      </div>
    );
  }
}
