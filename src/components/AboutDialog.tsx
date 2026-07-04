import { Info, ExternalLink } from 'lucide-react';
import { APP_NAME, APP_TAGLINE, APP_VERSION, PRIVACY_URL, CREDITS } from '../lib/appInfo';

/** App info, privacy link and third-party attributions (required for CC-BY assets). */
export default function AboutDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal about" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <Info className="icon" /> About {APP_NAME}
        </div>
        <div className="modal-body">
          <p className="about-title">
            <strong>{APP_NAME}</strong> <span className="muted">v{APP_VERSION}</span>
          </p>
          <p className="muted">{APP_TAGLINE}. Your designs are stored on your device — see the{' '}
            <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer">
              privacy policy <ExternalLink className="icon" style={{ width: 12, height: 12 }} />
            </a>
            .
          </p>
          <p className="about-credits-head">Third-party content</p>
          <ul className="about-credits">
            {CREDITS.map((c) => (
              <li key={c.url}>
                <a href={c.url} target="_blank" rel="noopener noreferrer">{c.name}</a>{' '}
                <span className="muted">({c.license})</span>
              </li>
            ))}
            <li>
              Built with open-source libraries including React, three.js and Konva — each under
              its own license.
            </li>
          </ul>
        </div>
        <div className="modal-foot">
          <button className="btn primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
