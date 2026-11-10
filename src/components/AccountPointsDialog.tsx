import { useCallback, useEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import Modal from './Modal';
import AiPointPacks from './AiPointPacks';
import { aiJson, restorePlayPoints } from '../lib/aiRender';
import type { PointsState } from '../lib/aiRender';
import { usePointsStore } from '../store/pointsStore';
import { useAuthStore } from '../store/authStore';
import { withPointBalanceRefresh } from '../lib/pointPurchases';
import { isNative } from '../lib/native';
import { useI18n } from '../lib/i18n';

export default function AccountPointsDialog({ onClose }: { onClose: () => void }) {
  const t = useI18n();
  const subject = useAuthStore(s => s.account?.subject);
  const points = usePointsStore(s => s.subject === subject ? s.state : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const alive = useRef(true);
  const running = useRef(false);
  const refresh = useCallback(async () => { await aiJson<PointsState>('/v1/points'); }, []);
  useEffect(() => {
    alive.current = true;
    running.current = true; setBusy(true);
    if (subject) void (isNative() ? withPointBalanceRefresh(restorePlayPoints, refresh) : refresh())
      .catch(e => { if (alive.current) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { running.current = false; if (alive.current) setBusy(false); });
    return () => { alive.current = false; };
  }, [subject, refresh]);
  const run = (action: () => Promise<void>) => {
    if (running.current) return;
    running.current = true; setBusy(true); setError('');
    void action().catch(e => { if (alive.current) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { running.current = false; if (alive.current) setBusy(false); });
  };
  return <Modal open onClose={onClose} className="account-points-dialog" labelledBy="account-points-title">
    <div className="modal-head" id="account-points-title"><Sparkles className="icon" /> {t('AI points')}</div>
    <div className="modal-body">
      <div className="account-points-card"><span>{t('Your creative balance')}</span>
        <strong>{points ? points.balance.toLocaleString() : '—'}</strong><span>{t('AI points')}</span></div>
      <p>{t('Use AI points for quick tools that improve your editable plan.')}</p>
      <div className="account-ai-features">{[
        [t('Smart room names'), points?.features.room_naming?.points],
        [t('Coordinated style'), points?.features.colour_scheme?.points],
        [t('Project description'), points?.features.listing_description?.points],
      ].map(([name, cost]) => <div key={name}><span>{name}</span><strong>{cost ?? '—'} {t('points')}</strong></div>)}</div>
      <p className="muted">{t('Open a project to use AI tools.')}</p>
      <AiPointPacks points={points} busy={busy || !points} run={run} onRefresh={refresh} expanded />
      {error && <p role="alert" className="ai-render-error">{error}</p>}
    </div>
    <div className="modal-foot"><button className="btn" disabled={busy} onClick={() => run(refresh)}>{t('Refresh')}</button><button className="btn" onClick={onClose}>{t('Close')}</button></div>
  </Modal>;
}
