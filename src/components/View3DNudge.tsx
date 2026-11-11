import { useEffect, useLayoutEffect, useState } from 'react';
import { Box, X } from 'lucide-react';
import { useI18n } from '../lib/i18n';

const KEY = 'homedesigner.seen3d.v1';

export function hasSeen3D(): boolean {
  try {
    return localStorage.getItem(KEY) !== null;
  } catch {
    return true; // storage unavailable: never nag
  }
}

export function markSeen3D(): void {
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    /* best-effort */
  }
}

/**
 * One-time pointer at the 3D switch on phones. A template opens as a flat plan,
 * and the switch that turns it into a house is an unlabelled cube icon in the
 * corner: someone who never taps it never sees what the app is for. No scrim,
 * nothing blocked. It goes away on its own, on dismissal, or for good the
 * first time 3D is opened.
 */
export default function View3DNudge({ onOpen, onDismiss }: { onOpen: () => void; onDismiss: () => void }) {
  const t = useI18n();
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  useLayoutEffect(() => {
    const place = () => {
      const target = document.querySelector('.view-toggle button:nth-child(2)');
      if (!target) return setPos(null);
      const r = target.getBoundingClientRect();
      setPos({ top: r.bottom + 12, right: Math.max(8, window.innerWidth - r.right - 4) });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, []);

  // Ring the real button while the bubble points at it.
  useEffect(() => {
    const target = document.querySelector('.view-toggle button:nth-child(2)');
    target?.classList.add('nudge-ring');
    return () => target?.classList.remove('nudge-ring');
  }, []);

  useEffect(() => {
    const id = window.setTimeout(onDismiss, 12000);
    return () => window.clearTimeout(id);
  }, [onDismiss]);

  if (!pos) return null;
  return (
    <div className="view3d-nudge" style={{ top: pos.top, right: pos.right }} role="status">
      <button className="view3d-nudge-go" onClick={onOpen}>
        <Box className="icon" />
        <span>{t('See it in 3D')}</span>
      </button>
      <button className="view3d-nudge-x" onClick={onDismiss} aria-label={t('Close')}>
        <X className="icon" />
      </button>
    </div>
  );
}
