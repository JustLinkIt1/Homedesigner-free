import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy, Palette, Sparkles, Tags, WandSparkles } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import Modal from './Modal';
import AiPointPacks from './AiPointPacks';
import { useAuthStore } from '../store/authStore';
import { useDesign } from '../store/designStore';
import { aiJson, restorePlayPoints, type PointsState } from '../lib/aiRender';
import {
  aiDesignContext, summarizeRooms,
  type ColourSchemeSuggestion,
  type ListingDescription,
  type RoomNameSuggestion,
} from '../lib/aiDesign';
import { isNative } from '../lib/native';
import { useI18n, useLang } from '../lib/i18n';
import { toast } from '../lib/ui';
import { ROOM_STYLE_BY_ID } from '../data/roomStyles';
import { getActiveId } from '../lib/projects';
import { withPointBalanceRefresh } from '../lib/pointPurchases';

interface MeteredResult { charged: number; balance: number }
interface BoundSuggestion<T> { context: string; value: T }
const readContext = () => aiDesignContext(getActiveId(), useDesign.getState());

export default function AiDesignDialog({ onClose }: { onClose: () => void }) {
  const account = useAuthStore(state => state.account);
  const floor = useDesign(state => state.activeFloorId);
  // Also subscribe to room replacement: importing another project can retain
  // the same floor id while changing its persistent project identity.
  useDesign(state => state.rooms);
  return <AiDesignSession key={`${account?.subject ?? 'signed-out'}:${getActiveId()}:${floor}`} onClose={onClose} />;
}

function AiDesignSession({ onClose }: { onClose: () => void }) {
  const t = useI18n();
  const account = useAuthStore(state => state.account);
  const signIn = useAuthStore(state => state.signIn);
  const design = useDesign(useShallow(state => ({
    rooms: state.rooms,
    furniture: state.furniture,
    walls: state.walls,
    openings: state.openings,
    activeFloorId: state.activeFloorId,
    projectName: state.projectName,
    renameRooms: state.renameRooms,
    applyRoomStyle: state.applyRoomStyle,
  })));
  const [points, setPoints] = useState<PointsState | null>(null);
  const [nameResult, setNames] = useState<BoundSuggestion<RoomNameSuggestion[]> | null>(null);
  const [selectedNames, setSelectedNames] = useState<string[]>([]);
  const [schemeResult, setScheme] = useState<BoundSuggestion<ColourSchemeSuggestion> | null>(null);
  const [copyResult, setCopy] = useState<BoundSuggestion<ListingDescription> | null>(null);
  const [preference, setPreference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const alive = useRef(true);
  const restored = useRef(false);
  const summaries = summarizeRooms(design.rooms, design.furniture);
  const context = aiDesignContext(getActiveId(), design);
  const names = nameResult?.context === context ? nameResult.value : [];
  const scheme = schemeResult?.context === context ? schemeResult.value : null;
  const copy = copyResult?.context === context ? copyResult.value : null;
  const stale = [nameResult, schemeResult, copyResult].some(result => result && result.context !== context);

  const reload = useCallback(async () => {
    const next = await aiJson<PointsState>('/v1/points');
    if (alive.current) setPoints(next);
  }, []);
  useEffect(() => {
    alive.current = true;
    if (account) void reload().catch(e => { if (alive.current) setError(e instanceof Error ? e.message : String(e)); });
    return () => { alive.current = false; };
  }, [account, reload]);
  useEffect(() => {
    if (!account || !isNative() || restored.current) return;
    restored.current = true;
    void withPointBalanceRefresh(restorePlayPoints, reload).catch(() => undefined);
  }, [account, reload]);

  const run = (action: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    void action().catch(e => {
      if (alive.current) setError(e instanceof Error ? e.message : String(e));
      if (account && alive.current) void reload().catch(() => undefined);
    }).finally(() => {
      inFlight.current = false;
      if (alive.current) setBusy(false);
    });
  };
  const ensureRooms = () => {
    if (design.rooms.length > 20) {
      setError(t('AI tools support up to 20 rooms per level.'));
      return false;
    }
    if (summaries.length) return true;
    setError(t('Add at least one room first.'));
    return false;
  };
  const updateBalance = (balance: number) => setPoints(current => current ? { ...current, balance } : current);
  const cost = (feature: string) => points?.features[feature]?.points;
  const accept = (requestContext: string, balance: number) => {
    if (!alive.current) return false;
    updateBalance(balance);
    if (requestContext === readContext()) return true;
    setError(t('The plan changed. Generate a new suggestion before applying it.'));
    return false;
  };

  const suggestNames = () => run(async () => {
    if (!ensureRooms()) return;
    const requestContext = readContext();
    const result = await aiJson<MeteredResult & { suggestions: RoomNameSuggestion[] }>('/v1/ai/room-names', {
      rooms: summaries,
      idempotencyKey: crypto.randomUUID(),
    });
    if (accept(requestContext, result.balance)) {
      setNames({ context: requestContext, value: result.suggestions });
      setSelectedNames(result.suggestions.filter(item => item.confidence === 'high').map(item => item.id));
    }
  });
  const suggestScheme = () => run(async () => {
    if (!ensureRooms()) return;
    if (!summaries.some(room => !room.outdoor)) { setError(t('Add an indoor room first.')); return; }
    const requestContext = readContext();
    const result = await aiJson<MeteredResult & { suggestion: ColourSchemeSuggestion }>('/v1/ai/colour-scheme', {
      rooms: summaries.filter(room => !room.outdoor),
      preference,
      language: useLang.getState().lang,
      idempotencyKey: crypto.randomUUID(),
    });
    if (accept(requestContext, result.balance)) setScheme({ context: requestContext, value: result.suggestion });
  });
  const writeDescription = () => run(async () => {
    if (!ensureRooms()) return;
    const requestContext = readContext();
    const result = await aiJson<MeteredResult & { copy: ListingDescription }>('/v1/ai/listing-description', {
      rooms: summaries,
      projectName: design.projectName,
      language: useLang.getState().lang,
      idempotencyKey: crypto.randomUUID(),
    });
    if (accept(requestContext, result.balance)) setCopy({ context: requestContext, value: result.copy });
  });

  const enough = (feature: string) => cost(feature) !== undefined && (points?.balance ?? 0) >= (cost(feature) ?? Infinity);
  return <Modal open onClose={onClose} className="ai-design-dialog" labelledBy="ai-design-title">
    <div className="modal-head" id="ai-design-title"><WandSparkles className="icon" /> {t('AI design assistant')}</div>
    <div className="modal-body ai-design-body">
      <p>{t('Use AI points for quick tools that improve your editable plan.')}</p>
      {!account ? <button className="btn primary" disabled={busy} onClick={() => run(signIn)}>{t('Sign in with Google')}</button> : <>
        {points && <p className="ai-balance"><Sparkles className="icon" /> {t('AI points')}: <strong>{points.balance.toLocaleString()}</strong></p>}
        {stale && <p role="status">{t('The plan changed. Generate a new suggestion before applying it.')}</p>}

        <section className="ai-tool-card">
          <div className="ai-tool-title"><Tags className="icon" /><div><h3>{t('Smart room names')}</h3><p>{t('Choose clear room names from layout and furniture.')}</p></div></div>
          {names.length > 0 && <div className="ai-name-list">{names.map(item => {
            const room = design.rooms.find(candidate => candidate.id === item.id);
            return <label key={item.id}><input type="checkbox" checked={selectedNames.includes(item.id)} disabled={busy}
              onChange={event => setSelectedNames(current => event.target.checked ? [...current, item.id] : current.filter(id => id !== item.id))} />
              <span>{room?.name ?? t('Room')} → <strong>{t(item.name)}</strong>
                {item.confidence === 'low' && <small> · {t('Uncertain')}</small>}</span></label>;
          })}</div>}
          {names.length > 0 && <p>{t('Review every room name. Only checked names will be applied.')}</p>}
          <div className="ai-tool-actions">
            <button className="btn" disabled={busy || !enough('room_naming')} onClick={suggestNames}>{t('Suggest names')} · {cost('room_naming') ?? '—'} {t('points')}</button>
            {names.length > 0 && <button className="btn primary" disabled={busy || selectedNames.length === 0} onClick={() => { if (context !== readContext()) return; design.renameRooms(names.filter(item => selectedNames.includes(item.id)).map(item => ({ ...item, name: t(item.name) }))); setNames(null); toast.success(t('Room names applied')); }}>{t('Apply names')}</button>}
          </div>
        </section>

        <section className="ai-tool-card">
          <div className="ai-tool-title"><Palette className="icon" /><div><h3>{t('Coordinated style')}</h3><p>{t('Get a coordinated wall and floor look for the current level.')}</p></div></div>
          <input className="ai-preference" value={preference} maxLength={120} onChange={event => setPreference(event.target.value)} placeholder={t('Optional mood, for example warm and minimal')} />
          {scheme && <div className="ai-suggestion"><strong>{scheme.title}</strong><p>{scheme.rationale}</p><span>{t('Style')}: {t(ROOM_STYLE_BY_ID[scheme.style]?.name ?? scheme.style)}</span></div>}
          <div className="ai-tool-actions">
            <button className="btn" disabled={busy || !enough('colour_scheme')} onClick={suggestScheme}>{t('Suggest style')} · {cost('colour_scheme') ?? '—'} {t('points')}</button>
            {scheme && <button className="btn primary" disabled={busy} onClick={() => { if (context !== readContext()) return; design.applyRoomStyle('all', scheme.style, false); setScheme(null); toast.success(t('Style applied')); }}><Check className="icon" /> {t('Apply style')}</button>}
          </div>
        </section>

        <section className="ai-tool-card">
          <div className="ai-tool-title"><Sparkles className="icon" /><div><h3>{t('Project description')}</h3><p>{t('Write a factual summary ready to share or use in a listing.')}</p></div></div>
          {copy && <div className="ai-suggestion"><strong>{copy.headline}</strong><p>{copy.description}</p></div>}
          {copy && <p>{t('Review AI-written details before sharing.')}</p>}
          <div className="ai-tool-actions">
            <button className="btn" disabled={busy || !enough('listing_description')} onClick={writeDescription}>{t('Write description')} · {cost('listing_description') ?? '—'} {t('points')}</button>
            {copy && <button className="btn primary" disabled={busy} onClick={() => run(async () => {
              if (context !== readContext()) return;
              await navigator.clipboard.writeText(`${copy.headline}\n\n${copy.description}`);
              toast.success(t('Description copied'));
            })}><Copy className="icon" /> {t('Copy description')}</button>}
          </div>
        </section>

        <AiPointPacks points={points} busy={busy} run={run} onRefresh={reload} />
      </>}
      {error && <p className="ai-render-error" role="alert">{error}</p>}
    </div>
    <div className="modal-foot"><button className="btn" onClick={onClose}>{t('Close')}</button></div>
  </Modal>;
}
