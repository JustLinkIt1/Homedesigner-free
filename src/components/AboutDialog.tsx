import { useRef, useState } from 'react';
import { Info, ExternalLink, Mail } from 'lucide-react';
import Modal from './Modal';
import { APP_NAME, APP_TAGLINE, APP_VERSION, PRIVACY_URL, COMMUNITY_URL, SUPPORT_EMAIL, CREDITS } from '../lib/appInfo';
import { Capacitor } from '@capacitor/core';
import { openCommunityForum } from '../lib/communityAccess';
import { collectStoreDiagnostics } from '../lib/pro';
import { toast } from '../lib/ui';

const supportHref = () =>
  `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`${APP_NAME} ${APP_VERSION} feedback`)}&body=${encodeURIComponent(
    `\n\n—\nApp ${APP_VERSION} · ${navigator.userAgent}`,
  )}`;

/** App info, privacy link and third-party attributions (required for CC-BY assets). */
export default function AboutDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Long-press the version to copy a store diagnostic. Support-only, so it is
  // not advertised — but it is deliberately SAFE TO FIND: see
  // `collectStoreDiagnostics`, which reports store configuration and no
  // identity, no tokens and no account data. Obscurity is not the protection
  // here; the contents are.
  const [busy, setBusy] = useState(false);
  const held = useRef<number | null>(null);
  const cancelHold = () => {
    if (held.current !== null) window.clearTimeout(held.current);
    held.current = null;
  };
  const startHold = () => {
    cancelHold();
    held.current = window.setTimeout(() => {
      held.current = null;
      if (busy) return;
      setBusy(true);
      void collectStoreDiagnostics()
        .then(async (report) => {
          await navigator.clipboard.writeText(report);
          toast.success('Store diagnostics copied — paste them to support.');
        })
        .catch(() => toast.error("Couldn't copy diagnostics."))
        .finally(() => setBusy(false));
    }, 1200);
  };

  return (
    <Modal open={open} onClose={onClose} className="about" labelledBy="about-title">
      <>
        <div className="modal-head" id="about-title">
          <Info className="icon" /> About {APP_NAME}
        </div>
        <div className="modal-body">
          <p className="about-title">
            <strong>{APP_NAME}</strong>{' '}
            <span
              className="muted"
              onPointerDown={startHold}
              onPointerUp={cancelHold}
              onPointerLeave={cancelHold}
              onPointerCancel={cancelHold}
              // Not a control: no role, no tab stop, nothing for a screen reader
              // to announce. Everything it reveals is diagnostic, and the
              // supported path for users is the support email above.
            >
              v{APP_VERSION}{busy ? '…' : ''}
            </span>
          </p>
          <p className="muted">{APP_TAGLINE}. Your designs are stored on your device — see the{' '}
            <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer">
              privacy policy <ExternalLink className="icon" style={{ width: 12, height: 12 }} />
            </a>
            .
          </p>
          <p className="muted">
            Questions, ideas or something broken? Ask in the{' '}
            <a
              href={COMMUNITY_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(event) => {
                if (!Capacitor.isNativePlatform()) return;
                event.preventDefault();
                void openCommunityForum();
              }}
            >
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
