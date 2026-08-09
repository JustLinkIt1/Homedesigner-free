import { Info, ExternalLink, Mail } from 'lucide-react';
import Modal from './Modal';
import { APP_NAME, APP_TAGLINE, APP_VERSION, PRIVACY_URL, COMMUNITY_URL, SUPPORT_EMAIL, CREDITS } from '../lib/appInfo';

const supportHref = () =>
  `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`${APP_NAME} ${APP_VERSION} feedback`)}&body=${encodeURIComponent(
    `\n\n—\nApp ${APP_VERSION} · ${navigator.userAgent}`,
  )}`;

/** App info, privacy link and third-party attributions (required for CC-BY assets). */
export default function AboutDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} className="about" labelledBy="about-title">
      <>
        <div className="modal-head" id="about-title">
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
          <p className="muted">
            Questions, ideas or something broken? Ask in the{' '}
            <a href={COMMUNITY_URL} target="_blank" rel="noopener noreferrer">
              community forum <ExternalLink className="icon" style={{ width: 12, height: 12 }} />
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
          <a className="btn" href={supportHref()}>
            <Mail className="icon" /> Contact support
          </a>
          <button className="btn primary" onClick={onClose}>
            Close
          </button>
        </div>
      </>
    </Modal>
  );
}
