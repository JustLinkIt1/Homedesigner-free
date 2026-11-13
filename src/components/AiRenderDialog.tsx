import { useCallback, useEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import Modal from './Modal';
import AiPointPacks from './AiPointPacks';
import { useAuthStore } from '../store/authStore';
import { aiJson, imageDataUrl, restorePlayPoints, type AiJob, type AiState, type PointsState } from '../lib/aiRender';
import { sceneSnapshot, sceneView } from '../lib/renderBridge';
import { isNative, saveImage } from '../lib/native';
import { notePositiveMoment } from '../lib/appReview';
import { useI18n } from '../lib/i18n';
import { withPointBalanceRefresh } from '../lib/pointPurchases';
import { applyWatermark } from '../lib/watermark';
import { useProStore } from '../store/proStore';

export default function AiRenderDialog({ onClose }: { onClose: () => void }) {
  const account = useAuthStore(s => s.account);
  return <AiRenderSession key={account?.subject ?? 'signed-out'} onClose={onClose} />;
}
function AiRenderSession({ onClose }: { onClose: () => void }) {
  const t = useI18n();
  const account = useAuthStore(s => s.account);
  const signIn = useAuthStore(s => s.signIn);
  const [state, setState] = useState<AiState | null>(null);
  const [points, setPoints] = useState<PointsState | null>(null);
  const [job, setJob] = useState<AiJob | null>(null);
  const [source, setSource] = useState('');
  // What the preview shows, taken with it: the server words the render to match.
  const view = useRef<'interior' | 'exterior'>('interior');
  const [showSource, setShowSource] = useState(false);
  const [result, setResult] = useState('');
  const [imageRetry, setImageRetry] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  const [style, setStyle] = useState('photorealistic');
  // Free accounts choose: cheaper with the site watermark, or a small premium without.
  const [marked, setMarked] = useState(true);
  const inFlight = useRef(false);
  const alive = useRef(true);
  const restoredPurchases = useRef(false);
  // The job seen generating while this dialog was open. Its picture arriving is
  // a fresh result; reopening the dialog on last week's render is not.
  const generating = useRef('');
  const native = isNative();
  const captureSource = useCallback(() => {
    const preview = sceneSnapshot.current?.();
    if (!preview) throw new Error(t('The 3D view is not ready. Try again in a moment.'));
    view.current = sceneView.current?.() ?? 'interior';
    setSource(preview);
    setConsent(false);
    setShowSource(true);
    // The callback is invoked at user/mount boundaries, not on locale renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const reload = useCallback(async () => {
    const [next, balance] = await Promise.all([aiJson<AiState>('/v1/ai/renders'), aiJson<PointsState>('/v1/points')]);
    if (!alive.current) return;
    setState(next); setPoints(balance); setJob(next.latest);
  }, []);
  useEffect(() => {
    alive.current = true;
    try { captureSource(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    if (account) void reload().catch(e => { if (alive.current) setError(e instanceof Error ? e.message : String(e)); });
    return () => { alive.current = false; };
  }, [account, reload, captureSource]);
  useEffect(() => {
    if (!native || !account || restoredPurchases.current) return;
    restoredPurchases.current = true;
    // Reconcile completed/pending point purchases automatically. This covers a
    // successful Play payment followed by a network loss or app restart.
    void withPointBalanceRefresh(restorePlayPoints, reload).catch(() => undefined);
  }, [account, native, reload]);
  useEffect(() => {
    if (!job || !['reserved', 'queued'].includes(job.status)) return;
    generating.current = job.id;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await aiJson<AiJob>(`/v1/ai/renders/${job.id}`);
        if (stopped) return;
        setJob(next);
        if (next.status === 'failed') { setError(next.error ?? t('Generation failed.')); await reload(); return; }
        if (next.status === 'complete') { await reload(); return; }
      } catch (e) { if (!stopped) setError(e instanceof Error ? e.message : String(e)); }
      if (!stopped) timer = setTimeout(() => void poll(), 4000);
    };
    timer = setTimeout(() => void poll(), 2500);
    return () => { stopped = true; clearTimeout(timer); };
    // Only the job identity/status drives polling, not translation-function identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id, job?.status, reload]);
  useEffect(() => {
    setResult('');
    if (job?.status !== 'complete') return;
    let stopped = false;
    const stamp = job.watermark === true;
    const fresh = generating.current === job.id;
    void imageDataUrl(job.id).then(url => stamp ? applyWatermark(url) : url)
      .then(url => {
        if (stopped) return;
        setResult(url); setShowSource(false);
        if (fresh) { generating.current = ''; notePositiveMoment(); }
      })
      .catch(e => { if (!stopped) setError(e instanceof Error ? e.message : String(e)); });
    return () => { stopped = true; };
  }, [job?.id, job?.status, job?.watermark, imageRetry]);
  const run = async (action: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    try { await action(); }
    catch (e) { if (alive.current) setError(e instanceof Error ? e.message : String(e)); }
    finally { inFlight.current = false; if (alive.current) setBusy(false); }
  };
  const pending = !!job && ['reserved', 'queued'].includes(job.status);
  const isPro = !!state?.isPro;
  // An older server has no clean-render price: there, AI render is still Pro only.
  const openToAll = !!points?.features.ai_render_clean;
  const allowed = isPro || openToAll;
  const wantsMark = !isPro && marked;
  const cost = isPro ? (state?.freeAvailable ? 0 : points?.features.ai_render?.points)
    : wantsMark ? points?.features.ai_render?.points : points?.features.ai_render_clean?.points;
  const generate = () => run(async () => {
    if (!source || !consent || cost === undefined) return;
    // Track this request while the server persists it; reload resumes the latest job after a timeout.
    const id = crypto.randomUUID();
    setJob({ id, status: 'reserved', style, charged: cost, error: null, watermark: wantsMark }); setResult('');
    try {
      const next = await aiJson<AiJob>('/v1/ai/renders', { id, image: source, style, expectedCharge: cost, view: view.current,
        ...(openToAll ? { watermark: wantsMark } : {}) });
      if (alive.current) setJob(next);
      await reload();
    } catch (e) { await reload(); throw e; }
  });
  return <Modal open onClose={onClose} className="ai-render-dialog" labelledBy="ai-render-title">
    <div className="modal-head" id="ai-render-title"><Sparkles className="icon" /> {t('AI render')}</div>
    <div className="modal-body ai-render-body">
      <p>{t('Make a photorealistic image from your current 3D view. Your editable plan stays unchanged.')}</p>
      {result && source && <div className="ai-tool-actions">
        <button className="btn" aria-pressed={showSource} onClick={() => setShowSource(true)}>{t('Current 3D view')}</button>
        <button className="btn" aria-pressed={!showSource} onClick={() => setShowSource(false)}>{t('AI-generated render')}</button>
      </div>}
      {(result || source) && <img className="ai-render-preview" src={showSource && source ? source : result || source}
        alt={showSource || !result ? t('Current 3D view') : t('AI-generated render')} />}
      <button className="btn" disabled={busy || pending} onClick={() => void run(async () => captureSource())}>{t('Refresh preview')}</button>
      <p className="muted">{t('AI can change details. This is a visualisation, not an exact construction drawing.')}</p>
      {!account ? <button className="btn primary" disabled={busy} onClick={() => void run(signIn)}>{t('Sign in with Google')}</button> : <>
        {points && <p>{t('AI points')}: {points.balance.toLocaleString()} · {isPro && state?.freeAvailable ? t('Your first AI render is free') : `${cost ?? '—'} ${t('points per render')}`}</p>}
        {state && points && !allowed && <p>{t('AI rendering requires Pro linked to this account. Restore your purchase and try again.')}</p>}
        {state && !isPro && openToAll && <>
          <div className="seg ai-render-mark" role="group">
            <button type="button" className={marked ? 'active' : ''} aria-pressed={marked} disabled={busy || pending}
              onClick={() => setMarked(true)}>{t('With watermark')} · {points?.features.ai_render?.points ?? '—'}</button>
            <button type="button" className={marked ? '' : 'active'} aria-pressed={!marked} disabled={busy || pending}
              onClick={() => setMarked(false)}>{t('No watermark')} · {points?.features.ai_render_clean?.points ?? '—'}</button>
          </div>
          <p className="muted ai-render-pro-note">{t('With Pro, AI renders have no watermark at the lower price.')}{' '}
            <button type="button" className="link-btn" onClick={() => useProStore.getState().openUpsell('cleanExport')}>{t('See Pro')}</button></p>
        </>}
        {state && !state.enabled && <p>{t('AI rendering is temporarily unavailable.')}</p>}
        {!!state?.styles.length && <label className="ai-render-style">{t('Style')}
          <select value={style} disabled={busy || pending} onChange={event => setStyle(event.target.value)}>
            {state.styles.map(item => <option value={item.id} key={item.id}>{item.label}</option>)}
          </select>
        </label>}
        <label className="ai-render-consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />
          {t('Send this preview to ElevenLabs or fal.ai to generate an image. No plan file or account details are sent.')}</label>
        {pending && <p role="status">{t('Generating your image… You can close this window and reopen AI render to resume.')}</p>}
        <button className="btn primary" disabled={busy || pending || !consent || !source || !allowed || !state?.enabled || cost === undefined || (points?.balance ?? 0) < cost}
          onClick={() => void generate()}>{cost === 0 ? t('Generate my free render') : `${t('Generate')} · ${cost ?? '—'} ${t('AI points')}`}</button>
        {result && <button className="btn" disabled={busy} onClick={() => void run(async () => { await saveImage(result, `homedesigner-ai-${job?.id}.${result.startsWith('data:image/png') ? 'png' : 'jpg'}`); })}>{t('Save AI image')}</button>}
        <AiPointPacks points={points} busy={busy} run={action => void run(action)} onRefresh={reload} />
        <button className="btn" disabled={busy} onClick={() => void run(async () => { await reload(); setImageRetry(n => n + 1); })}>{t('Refresh')}</button>
      </>}
      {error && <p className="ai-render-error" role="alert">{error}</p>}
    </div>
    <div className="modal-foot"><button className="btn" onClick={onClose}>{t('Close')}</button></div>
  </Modal>;
}
