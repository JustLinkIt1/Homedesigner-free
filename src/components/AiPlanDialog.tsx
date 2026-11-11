import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Crown, Minus, Plus, RotateCcw, Sparkles, WandSparkles } from 'lucide-react';
import Modal from './Modal';
import AiPointPacks from './AiPointPacks';
import { aiJson, restorePlayPoints, type PointsState } from '../lib/aiRender';
import {
  DEFAULT_BRIEF, ROOM_FILL, blueprintToSnapshot, isBlueprint, minimumArea,
  type Blueprint, type BlueprintFloor, type PlanBrief,
} from '../lib/aiPlan';
import { isNative } from '../lib/native';
import { useI18n, useLang } from '../lib/i18n';
import { requirePro } from '../lib/pro';
import * as projects from '../lib/projects';
import { withPointBalanceRefresh } from '../lib/pointPurchases';
import { confirmDialog, toast } from '../lib/ui';
import { useAuthStore } from '../store/authStore';
import { useDesign } from '../store/designStore';
import { useProStore } from '../store/proStore';

/** Planning a home is the slowest call the app makes. */
const PLAN_TIMEOUT_MS = 120_000;
const SAVED_KEY = 'homedesigner.aiPlan.v1';

interface Saved { subject: string; brief: PlanBrief; plan: Blueprint | null }
interface MeteredResult { charged: number; balance: number }

/** The brief and the last plan are kept on the device: the plan was paid for,
 *  and closing the dialog (to sign in, to upgrade, by accident) must not lose
 *  either. */
function readSaved(subject: string): Saved | null {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVED_KEY) ?? 'null') as Partial<Saved> | null;
    if (!saved || saved.subject !== subject || !saved.brief || typeof saved.brief !== 'object') return null;
    const brief = { ...DEFAULT_BRIEF, ...saved.brief };
    const numbers = [brief.storeys, brief.bedrooms, brief.bathrooms, brief.areaSqm];
    if (!numbers.every((n) => Number.isInteger(n)) || typeof brief.wishes !== 'string') return null;
    return { subject, brief, plan: isBlueprint(saved.plan) ? saved.plan : null };
  } catch {
    return null;
  }
}

function writeSaved(saved: Saved): void {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(saved));
  } catch {
    /* storage unavailable: the plan still shows until the dialog closes */
  }
}

function Stepper({ label, value, min, max, step = 1, unit, disabled, onChange }: {
  label: string; value: number; min: number; max: number; step?: number; unit?: string; disabled: boolean;
  onChange: (value: number) => void;
}) {
  const t = useI18n();
  return (
    <div className="ai-plan-row">
      <span>{label}</span>
      <div className="ai-stepper">
        <button type="button" className="btn" disabled={disabled || value <= min} aria-label={`${label}: ${t('less')}`} onClick={() => onChange(Math.max(min, value - step))}><Minus className="icon" /></button>
        <output aria-live="polite">{value}{unit ? ` ${unit}` : ''}</output>
        <button type="button" className="btn" disabled={disabled || value >= max} aria-label={`${label}: ${t('more')}`} onClick={() => onChange(Math.min(max, value + step))}><Plus className="icon" /></button>
      </div>
    </div>
  );
}

/** A small drawing of one storey: rooms, walls, door gaps and windows. Drawn
 *  on "paper" in both themes, like the plan thumbnails. */
function PlanPreview({ plan, floor, imperial }: { plan: Blueprint; floor: BlueprintFloor; imperial: boolean }) {
  const pad = 30;
  const area = (cm2: number) => (imperial ? `${Math.round((cm2 / 10_000) * 10.7639)} ft²` : `${Math.round(cm2 / 10_000)} m²`);
  return (
    <svg className="ai-plan-preview" viewBox={`${-pad} ${-pad} ${plan.widthCm + pad * 2} ${plan.depthCm + pad * 2}`} role="img" aria-label={plan.title}>
      {floor.rooms.map((room) => (
        <rect key={room.id} x={room.x} y={room.y} width={room.w} height={room.h} fill={ROOM_FILL[room.type] ?? '#f6f1e5'} stroke="#3b4252" strokeWidth={10} />
      ))}
      {floor.openings.map((o, index) => {
        const half = o.width / 2;
        const window = o.kind === 'window' || o.kind === 'small_window';
        return (
          <line
            key={index}
            x1={o.vertical ? o.x : o.x - half} y1={o.vertical ? o.y - half : o.y}
            x2={o.vertical ? o.x : o.x + half} y2={o.vertical ? o.y + half : o.y}
            stroke={window ? '#4c8dff' : '#fbfaf7'} strokeWidth={window ? 8 : 14}
          />
        );
      })}
      {floor.rooms.map((room) => {
        const size = Math.min(38, (room.w / Math.max(5, room.name.length)) * 1.75, room.h / 2.6);
        if (size < 15) return null;
        const cx = room.x + room.w / 2;
        const cy = room.y + room.h / 2;
        return (
          <text key={room.id} x={cx} y={cy} fontSize={size} textAnchor="middle" fill="#262b36">
            <tspan x={cx} dy={-size * 0.1} fontWeight={600}>{room.name}</tspan>
            <tspan x={cx} dy={size * 1.15} fontSize={size * 0.8} fill="#5b6373">{area(room.w * room.h)}</tspan>
          </text>
        );
      })}
    </svg>
  );
}

export default function AiPlanDialog({ onClose, onApplied }: { onClose: () => void; onApplied: () => void }) {
  const account = useAuthStore((state) => state.account);
  return <AiPlanSession key={account?.subject ?? 'signed-out'} onClose={onClose} onApplied={onApplied} />;
}

function AiPlanSession({ onClose, onApplied }: { onClose: () => void; onApplied: () => void }) {
  const t = useI18n();
  const account = useAuthStore((state) => state.account);
  const signIn = useAuthStore((state) => state.signIn);
  const isPro = useProStore((state) => state.isPro);
  const imperial = useDesign((state) => state.units === 'imperial');
  const subject = account?.subject ?? '';
  const saved = useMemo(() => (subject ? readSaved(subject) : null), [subject]);
  const [brief, setBrief] = useState<PlanBrief>(() => saved?.brief ?? DEFAULT_BRIEF);
  const [plan, setPlan] = useState<Blueprint | null>(() => saved?.plan ?? null);
  const [level, setLevel] = useState(0);
  const [change, setChange] = useState('');
  const [points, setPoints] = useState<PointsState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const alive = useRef(true);
  const restored = useRef(false);

  const reload = useCallback(async () => {
    const next = await aiJson<PointsState>('/v1/points');
    if (alive.current) setPoints(next);
  }, []);
  useEffect(() => {
    alive.current = true;
    if (account) void reload().catch((e) => { if (alive.current) setError(e instanceof Error ? e.message : String(e)); });
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
    void action().catch((e) => {
      if (alive.current) setError(e instanceof Error ? e.message : String(e));
      if (account && alive.current) void reload().catch(() => undefined);
    }).finally(() => {
      inFlight.current = false;
      if (alive.current) setBusy(false);
    });
  };

  const update = (patch: Partial<PlanBrief>) => {
    const next = { ...brief, ...patch };
    setBrief(next);
    if (subject) writeSaved({ subject, brief: next, plan });
  };
  const keep = (nextPlan: Blueprint | null, nextBrief = brief) => {
    setPlan(nextPlan);
    setLevel(0);
    if (subject) writeSaved({ subject, brief: nextBrief, plan: nextPlan });
  };

  const cost = points?.features.plan_design?.points;
  const enough = cost !== undefined && (points?.balance ?? 0) >= cost;
  const available = points?.available?.plan_design === true;
  const needed = minimumArea(brief);
  const tooSmall = brief.areaSqm < needed;

  const request = (extra: Record<string, unknown>) => run(async () => {
    const result = await aiJson<MeteredResult & { plan: unknown }>('/v1/ai/plan', {
      brief: { ...brief, wishes: brief.wishes.trim() },
      language: useLang.getState().lang,
      idempotencyKey: crypto.randomUUID(),
      ...extra,
    }, PLAN_TIMEOUT_MS);
    if (!alive.current) return;
    setPoints((current) => (current ? { ...current, balance: result.balance } : current));
    if (!isBlueprint(result.plan)) throw new Error(t('The plan could not be read. Please try again.'));
    keep(result.plan);
    setChange('');
  });

  const pickStoreys = (storeys: number) => {
    if (storeys > 1 && !isPro) {
      // The same gate as adding a storey in the editor. The answers so far are
      // saved, so the dialog reopens where it was.
      onClose();
      requirePro('multiFloor');
      return;
    }
    update({ storeys });
  };

  const apply = () => run(async () => {
    if (!plan) return;
    const design = useDesign.getState();
    const hasWork = Object.values(design.floorGeom).some((geom) => geom.walls.length || geom.rooms.length || geom.furniture.length);
    const list = projects.listProjects();
    const snapshot = blueprintToSnapshot(plan, {
      allowPro: isPro,
      floorName: (name) => (name === 'Upper floor 2' ? `${t('Upper floor')} 2` : t(name)),
    });
    if (list.length === 0 || !projects.getActiveId()) {
      projects.createProject(plan.title);
    } else if (hasWork) {
      if (isPro) {
        // Pro keeps every project: the plan opens as a new one.
        projects.createProject(plan.title);
      } else {
        // A free account has one project. Never overwrite it without asking.
        onClose();
        const ok = await confirmDialog(
          t('Replace the current design?'),
          t('The AI plan will replace the plan you have now. With Pro it opens as a new project and you keep both.'),
          { confirmLabel: t('Replace'), danger: true },
        );
        if (!ok) return;
      }
    }
    useDesign.getState().loadSnapshot(snapshot);
    useDesign.getState().setView('2d');
    toast.success(t('Your plan is ready to edit'));
    onApplied();
    onClose();
  });

  const floor = plan ? plan.floors[Math.min(level, plan.floors.length - 1)] : null;
  const floorLabel = (index: number) => (index === 0 ? t('Ground floor') : index === 1 ? t('Upper floor') : `${t('Upper floor')} ${index}`);
  const priced = (label: string) => `${label} · ${cost ?? '—'} ${t('points')}`;

  return (
    <Modal open onClose={onClose} className="ai-design-dialog ai-plan-dialog" labelledBy="ai-plan-title">
      <div className="modal-head" id="ai-plan-title" tabIndex={-1} data-autofocus><WandSparkles className="icon" /> {t('AI plan')}</div>
      <div className="modal-body ai-design-body">
        {!account ? (
          <>
            <p>{t('Describe the home you want and get a floor plan you can edit. Sign in to start; new accounts get free AI points to try it.')}</p>
            <button className="btn primary" disabled={busy} onClick={() => run(signIn)}>{t('Sign in with Google')}</button>
          </>
        ) : (
          <>
            {points && <p className="ai-balance"><Sparkles className="icon" /> {t('AI points')}: <strong>{points.balance.toLocaleString()}</strong></p>}
            {points && !available && <p role="status">{t('The AI planner is not available yet. Please check back soon.')}</p>}

            {plan && floor ? (
              <section className="ai-tool-card ai-premium-card">
                <div className="ai-plan-title">
                  <h3>{plan.title}</h3>
                  {plan.notes && <p>{plan.notes}</p>}
                </div>
                {plan.floors.length > 1 && (
                  <div className="seg ai-plan-floors" role="tablist">
                    {plan.floors.map((_, index) => (
                      <button key={index} role="tab" aria-selected={index === level} className={index === level ? 'active' : ''} onClick={() => setLevel(index)}>{floorLabel(index)}</button>
                    ))}
                  </div>
                )}
                <PlanPreview plan={plan} floor={floor} imperial={imperial} />
                <div className="ai-tool-actions">
                  <button className="btn primary" disabled={busy} onClick={apply}><Check className="icon" /> {t('Use this plan')}</button>
                </div>
                <label className="ai-plan-field">
                  <span>{t('Want something different? Say what to change.')}</span>
                  <textarea
                    className="ai-preference" rows={2} maxLength={300} value={change} disabled={busy}
                    onChange={(event) => setChange(event.target.value)}
                    placeholder={t('For example: make the kitchen bigger and add a home office')}
                  />
                </label>
                <div className="ai-tool-actions">
                  <button className="btn" disabled={busy || !available || !enough || change.trim().length < 3} onClick={() => request({ previous: plan.source, change: change.trim() })}>
                    {priced(t('Update plan'))}
                  </button>
                  <button className="btn" disabled={busy} onClick={() => keep(null)}><RotateCcw className="icon" /> {t('Start over')}</button>
                </div>
              </section>
            ) : (
              <section className="ai-tool-card ai-premium-card">
                <label className="ai-plan-field">
                  <span>{t('Describe the home you want')}</span>
                  <textarea
                    className="ai-preference" rows={3} maxLength={400} value={brief.wishes} disabled={busy}
                    onChange={(event) => update({ wishes: event.target.value })}
                    placeholder={t('For example: a bright family home with an open kitchen and a quiet office')}
                  />
                </label>
                <div className="ai-plan-row">
                  <span>{t('Storeys')}</span>
                  <div className="seg">
                    {[1, 2, 3].map((storeys) => (
                      <button key={storeys} type="button" disabled={busy} className={brief.storeys === storeys ? 'active' : ''} onClick={() => pickStoreys(storeys)}>
                        {storeys}{storeys > 1 && !isPro && <Crown className="icon pro-pill" style={{ width: 12, height: 12 }} />}
                      </button>
                    ))}
                  </div>
                </div>
                <Stepper label={t('Bedrooms')} value={brief.bedrooms} min={0} max={6} disabled={busy} onChange={(bedrooms) => update({ bedrooms })} />
                <Stepper label={t('Bathrooms')} value={brief.bathrooms} min={1} max={4} disabled={busy} onChange={(bathrooms) => update({ bathrooms })} />
                <Stepper label={t('Total size')} value={brief.areaSqm} min={30} max={400} step={10} unit="m²" disabled={busy} onChange={(areaSqm) => update({ areaSqm })} />
                {imperial && <p className="ai-fineprint">≈ {Math.round(brief.areaSqm * 10.7639).toLocaleString()} ft²</p>}
                <label className="ai-check">
                  <input type="checkbox" checked={brief.furnished} disabled={busy} onChange={(event) => update({ furnished: event.target.checked })} />
                  <span>{t('Furnished')}</span>
                </label>
                <label className="ai-check">
                  <input type="checkbox" checked={brief.garage} disabled={busy} onChange={(event) => update({ garage: event.target.checked })} />
                  <span>{t('Garage')}</span>
                </label>
                {tooSmall && <p className="ai-fineprint" role="status">{t('These rooms need more space. Choose at least:')} {needed} m²</p>}
                <div className="ai-tool-actions">
                  <button className="btn primary" disabled={busy || !available || !enough || tooSmall} onClick={() => request({})}>
                    {busy ? t('Drawing your plan…') : priced(t('Create plan'))}
                  </button>
                </div>
                <p className="ai-fineprint">{t('Your answers and description are sent to our AI provider to draw the plan. It can take up to a minute.')}</p>
              </section>
            )}
            {busy && plan && <p role="status">{t('Drawing your plan…')}</p>}
            <AiPointPacks points={points} busy={busy} run={run} onRefresh={reload} />
          </>
        )}
        {error && <p className="ai-render-error" role="alert">{error}</p>}
      </div>
      <div className="modal-foot"><button className="btn" onClick={onClose}>{t('Close')}</button></div>
    </Modal>
  );
}
