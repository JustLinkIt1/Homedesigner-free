import { useState } from 'react';
import { ClipboardCheck, Copy, Crown, Download, Mic } from 'lucide-react';
import { aiJson, type PointsState } from '../lib/aiRender';
import {
  aiDesignContext, contextStamp, readSavedReview, roomNameMap, saveReview, summarizeRooms,
  type DesignReview, type VoiceTour,
} from '../lib/aiDesign';
import { planPicture } from '../lib/aiPicture';
import { saveAudio } from '../lib/native';
import { requirePro } from '../lib/pro';
import { getActiveId } from '../lib/projects';
import { useI18n, useLang } from '../lib/i18n';
import { toast } from '../lib/ui';
import { useAuthStore } from '../store/authStore';
import { useDesign } from '../store/designStore';
import { useProStore } from '../store/proStore';

/** These routes wait on Claude (and, for a tour, a voice recording). */
const SLOW_TIMEOUT_MS = 90_000;

interface MeteredResult { charged: number; balance: number }

interface Shared {
  points: PointsState | null;
  busy: boolean;
  run: (action: () => Promise<void>) => void;
  ensureRooms: () => boolean;
  updateBalance: (balance: number) => void;
}

const readDesign = () => useDesign.getState();
const slotKey = () => `${getActiveId() ?? 'unsaved'}:${readDesign().activeFloorId}`;
const stampNow = () => contextStamp(aiDesignContext(getActiveId(), readDesign()));
const fileSlug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'home';

const IMPACT_LABEL = { high: 'High impact', medium: 'Medium impact', low: 'Low impact' } as const;

/**
 * Designer review: the tool AI points are bought for. Claude reads the room
 * list and a picture of the plan and answers with a score and a short list of
 * changes. Nothing is applied to the design, so the result is kept (per
 * project and level, on this device) rather than discarded when the dialog
 * closes: it was paid for.
 */
export function AiReviewCard({ points, busy, run, ensureRooms, updateBalance }: Shared) {
  const t = useI18n();
  const rooms = useDesign((state) => state.rooms);
  const [saved, setSaved] = useState(() => readSavedReview(slotKey()));
  const [focus, setFocus] = useState('');
  const [withPicture, setWithPicture] = useState(true);
  const cost = points?.features.design_review?.points;
  const enough = cost !== undefined && (points?.balance ?? 0) >= cost;
  const review = saved?.review ?? null;
  const outdated = !!saved && saved.stamp !== stampNow();

  const start = () => run(async () => {
    if (!ensureRooms()) return;
    const design = readDesign();
    const slot = slotKey();
    const stamp = stampNow();
    const image = withPicture ? await planPicture() : undefined;
    const result = await aiJson<MeteredResult & { review: DesignReview }>('/v1/ai/design-review', {
      rooms: summarizeRooms(design.rooms, design.furniture),
      roomNames: roomNameMap(design.rooms),
      focus: focus.trim(),
      language: useLang.getState().lang,
      ...(image ? { image } : {}),
      idempotencyKey: crypto.randomUUID(),
    }, SLOW_TIMEOUT_MS);
    updateBalance(result.balance);
    // Advice is still worth reading if the plan moved on while it was being
    // written, so it is kept either way and flagged as outdated instead.
    saveReview(slot, { stamp, review: result.review });
    setSaved({ stamp, review: result.review });
  });

  const roomName = (id: string | null) => (id && rooms.find((room) => room.id === id)?.name) || t('Whole home');
  const asText = (value: DesignReview) => [
    `${t('Score')}: ${value.score}/10`,
    value.summary,
    '',
    ...value.suggestions.map((item, index) => `${index + 1}. ${item.title} (${roomName(item.roomId)})\n${item.detail}`),
  ].join('\n');

  return (
    <section className="ai-tool-card ai-premium-card">
      <div className="ai-tool-title"><ClipboardCheck className="icon" /><div>
        <h3>{t('Designer review')}</h3>
        <p>{t('An AI interior designer scores your plan and lists the changes that would help most.')}</p>
      </div></div>
      <input
        className="ai-preference" value={focus} maxLength={200} disabled={busy}
        onChange={(event) => setFocus(event.target.value)}
        placeholder={t('Optional: what matters most to you?')}
      />
      <label className="ai-check">
        <input type="checkbox" checked={withPicture} disabled={busy} onChange={(event) => setWithPicture(event.target.checked)} />
        <span>{t('Include a picture of the plan for better advice')}</span>
      </label>
      <p className="ai-fineprint">{t('Your room list and the picture are sent to our AI provider to write the review.')}</p>
      {review && (
        <div className="ai-review">
          {outdated && <p className="ai-fineprint" role="status">{t('This review was written for an earlier version of the plan.')}</p>}
          <div className="ai-review-head">
            <span className="ai-score" aria-label={`${t('Score')}: ${review.score}/10`}><strong>{review.score}</strong>/10</span>
            <p>{review.summary}</p>
          </div>
          <ol className="ai-review-list">
            {review.suggestions.map((item, index) => (
              <li key={index}>
                <strong>{item.title}</strong>
                <span className="ai-review-meta">
                  <em className={`ai-impact ${item.impact}`}>{t(IMPACT_LABEL[item.impact])}</em>
                  {roomName(item.roomId)}
                </span>
                <p>{item.detail}</p>
              </li>
            ))}
          </ol>
        </div>
      )}
      <div className="ai-tool-actions">
        <button className="btn primary" disabled={busy || !enough} onClick={start}>
          {t('Review my plan')} · {cost ?? '—'} {t('points')}
        </button>
        {review && (
          <button className="btn" disabled={busy} onClick={() => run(async () => {
            await navigator.clipboard.writeText(asText(review));
            toast.success(t('Review copied'));
          })}><Copy className="icon" /> {t('Copy review')}</button>
        )}
      </div>
    </section>
  );
}

/** Kept for the life of the page so an accidental close does not throw away a
 *  recording that was paid for. Not persisted: it is a few hundred kilobytes. */
let keptTour: { slot: string; subject: string; tour: VoiceTour } | null = null;

/**
 * Voice tour: Claude writes a short narration from the plan and a
 * text-to-speech voice records it. Pro only, like AI render.
 */
export function AiTourCard({ points, busy, run, ensureRooms, updateBalance, onUpgrade }: Shared & { onUpgrade: () => void }) {
  const t = useI18n();
  const isPro = useProStore((state) => state.isPro);
  const subject = useAuthStore((state) => state.account?.subject ?? '');
  const [tour, setTour] = useState<VoiceTour | null>(() =>
    keptTour && keptTour.slot === slotKey() && keptTour.subject === subject ? keptTour.tour : null);
  const cost = points?.features.voice_tour?.points;
  const enough = cost !== undefined && (points?.balance ?? 0) >= cost;
  const audioUrl = tour ? `data:audio/mpeg;base64,${tour.audio}` : '';

  const start = () => run(async () => {
    if (!ensureRooms()) return;
    const design = readDesign();
    const slot = slotKey();
    const result = await aiJson<MeteredResult & { tour: VoiceTour }>('/v1/ai/voice-tour', {
      rooms: summarizeRooms(design.rooms, design.furniture),
      roomNames: roomNameMap(design.rooms),
      projectName: design.projectName,
      language: useLang.getState().lang,
      idempotencyKey: crypto.randomUUID(),
    }, SLOW_TIMEOUT_MS);
    updateBalance(result.balance);
    if (result.tour.mime !== 'audio/mpeg' || !/^[A-Za-z0-9+/]+={0,2}$/.test(result.tour.audio)) {
      throw new Error(t('The recording could not be played. Please try again.'));
    }
    keptTour = { slot, subject, tour: result.tour };
    setTour(result.tour);
    toast.success(t('Voice tour ready'));
  });

  return (
    <section className="ai-tool-card ai-premium-card">
      <div className="ai-tool-title"><Mic className="icon" /><div>
        <h3>{t('Voice tour')} {!isPro && <span className="pro-tag">PRO</span>}</h3>
        <p>{t('A narrated audio walk-through of your home, ready to play or share.')}</p>
      </div></div>
      {tour && (
        <div className="ai-suggestion ai-tour">
          <audio controls preload="metadata" src={audioUrl} />
          <p>{tour.script}</p>
          <span>{t('Save the recording to keep it. It is not stored after you close the app.')}</span>
        </div>
      )}
      <div className="ai-tool-actions">
        {isPro ? (
          <button className="btn primary" disabled={busy || !enough} onClick={start}>
            {t('Create voice tour')} · {cost ?? '—'} {t('points')}
          </button>
        ) : (
          <button className="btn primary" disabled={busy} onClick={() => { onUpgrade(); requirePro('voiceTour'); }}>
            <Crown className="icon" /> {t('Unlock with Pro')}
          </button>
        )}
        {tour && (
          <button className="btn" disabled={busy} onClick={() => run(async () => {
            await saveAudio(audioUrl, `${fileSlug(readDesign().projectName)}-tour.mp3`);
          })}><Download className="icon" /> {t('Save audio')}</button>
        )}
      </div>
    </section>
  );
}
