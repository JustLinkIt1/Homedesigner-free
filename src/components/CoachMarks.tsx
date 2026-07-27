import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { tapLight } from '../lib/haptics';
import { useI18n } from '../lib/i18n';

/**
 * Self-contained first-run tour: fixed-position bubbles anchored to live DOM
 * targets via querySelector + getBoundingClientRect. No cutouts, no libraries —
 * a scrim blocks interaction and the bubble sits beside its target.
 *
 * Selectors are load-bearing: a missing target simply skips that step, which is
 * how one step list serves both phone and desktop. Anchors that exist only for
 * this tour (`.import-btn`, `.export-btn-wrap`) are named in Toolbar.tsx —
 * don't rename them without updating the step below.
 */
interface Step {
  sel: string;
  /** Fallback selector if `sel` isn't in the DOM (e.g. phone vs desktop). */
  alt?: string;
  title: string;
  text: string;
}

const COARSE =
  typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

const STEPS: Step[] = [
  {
    sel: '.tool-dock',
    title: 'Build tools',
    text: 'Draw walls and rooms, add doors & windows, or measure — everything starts here.',
  },
  {
    sel: '.view-toggle',
    title: 'See it in 3D',
    text: 'Switch between the 2D plan and a full 3D walkthrough any time — nothing is lost.',
  },
  {
    sel: COARSE ? '.mobile-tabs button' : '.dock-btn.furniture-toggle',
    alt: '.mobile-tabs',
    title: 'Furnish it',
    text: 'Open the catalog and tap an object, then tap the plan to place it.',
  },
  // Testers asked for a more thorough tour: the three steps above stopped at
  // "you can draw and look at it", which left the features people actually
  // struggle to find — importing a real plan, turning walls into rooms,
  // editing a selection, and stacking storeys — entirely undiscovered.
  {
    sel: '.import-btn',
    alt: '.toolbar',
    title: 'Start from a real plan',
    text: 'Import a PDF, image, DXF or DWG and HomeDesigner traces the walls for you — then set the scale from one known length.',
  },
  {
    sel: '.props .btn.primary.block',
    alt: COARSE ? '.mobile-tabs button:last-child' : '.sidebar.right',
    title: 'Turn walls into rooms',
    text: 'Once your walls form closed loops, Auto-detect rooms fills them in so you can floor, paint and furnish each one.',
  },
  {
    sel: COARSE ? '.mobile-tabs button:last-child' : '.sidebar.right',
    alt: '.mobile-tabs',
    title: 'Edit anything you select',
    text: 'Select a wall, room or object to change its size, height, colour and material. With nothing selected you get whole-home controls: exterior cladding, the roof, and rotating the plan.',
  },
  {
    sel: '.floor-switcher',
    alt: '.floor-add',
    title: 'Add more storeys',
    text: 'Build upstairs and down, copy a floor to reuse its layout, and see the whole house stacked in 3D.',
  },
  {
    sel: '.export-btn-wrap',
    alt: '.toolbar',
    title: 'Share the finished home',
    text: 'Export a print-ready PDF or a layered DXF for CAD, render a photo of any view, or send a shopping list of everything you placed.',
  },
];

interface Pos {
  left: number;
  top: number;
  arrow: 'up' | 'down' | 'left' | 'right';
  arrowLeft: number;
  arrowTop: number;
}

const BUBBLE_W = 264;
const BUBBLE_H = 132; // generous estimate for placement math
const GAP = 14;
const MARGIN = 12;

function placeNear(r: DOMRect): Pos {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cx = r.left + r.width / 2;
  // Prefer right of target, then left, then below, then above.
  if (r.right + GAP + BUBBLE_W < vw) {
    const top = Math.min(Math.max(r.top + r.height / 2 - BUBBLE_H / 2, MARGIN), vh - BUBBLE_H - MARGIN);
    return { left: r.right + GAP, top, arrow: 'left', arrowLeft: -5, arrowTop: r.top + r.height / 2 - top - 5 };
  }
  if (r.left - GAP - BUBBLE_W > 0) {
    const top = Math.min(Math.max(r.top + r.height / 2 - BUBBLE_H / 2, MARGIN), vh - BUBBLE_H - MARGIN);
    return { left: r.left - GAP - BUBBLE_W, top, arrow: 'right', arrowLeft: BUBBLE_W - 5, arrowTop: r.top + r.height / 2 - top - 5 };
  }
  if (r.bottom + GAP + BUBBLE_H < vh) {
    const left = Math.min(Math.max(cx - BUBBLE_W / 2, MARGIN), vw - BUBBLE_W - MARGIN);
    return { left, top: r.bottom + GAP, arrow: 'up', arrowLeft: cx - left - 5, arrowTop: -5 };
  }
  const left = Math.min(Math.max(cx - BUBBLE_W / 2, MARGIN), vw - BUBBLE_W - MARGIN);
  const top = Math.max(r.top - GAP - BUBBLE_H, MARGIN);
  return { left, top, arrow: 'down', arrowLeft: cx - left - 5, arrowTop: BUBBLE_H - 5 };
}

export default function CoachMarks({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [pos, setPos] = useState<Pos | null>(null);
  const doneRef = useRef(false);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const t = useI18n();

  // BUBBLE_H is only an estimate, and the richer step copy added later made
  // several bubbles taller than it — so the estimate-based clamp let them run
  // off the bottom of a phone screen and the Next button became unclickable.
  // Re-clamp against the measured height once the bubble has actually rendered.
  useLayoutEffect(() => {
    const el = bubbleRef.current;
    if (!el || !pos) return;
    const h = el.offsetHeight;
    const maxTop = window.innerHeight - h - MARGIN;
    const clamped = Math.max(MARGIN, Math.min(pos.top, maxTop));
    if (Math.abs(clamped - pos.top) > 0.5) {
      // Keep the arrow pointing at the target as the bubble slides.
      setPos({ ...pos, top: clamped, arrowTop: pos.arrowTop + (pos.top - clamped) });
    }
  }, [pos]);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  };

  // Resolve the current step's target; skip forward past missing anchors.
  useLayoutEffect(() => {
    let idx = step;
    let el: Element | null = null;
    while (idx < STEPS.length) {
      el = document.querySelector(STEPS[idx].sel) ?? (STEPS[idx].alt ? document.querySelector(STEPS[idx].alt!) : null);
      if (el) break;
      idx++;
    }
    if (!el || idx >= STEPS.length) {
      finish();
      return;
    }
    if (idx !== step) {
      setStep(idx);
      return;
    }
    const measure = () => {
      const r = (el as Element).getBoundingClientRect();
      setPos(placeNear(r));
    };
    const raf = requestAnimationFrame(measure);
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', measure);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Escape skips the tour.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!pos) return <div className="coach-scrim" />;

  const s = STEPS[step];
  const last = step === STEPS.length - 1;

  return (
    <>
      <div className="coach-scrim" onClick={finish} />
      <div ref={bubbleRef} className="coach-bubble" style={{ left: pos.left, top: pos.top, width: BUBBLE_W }} role="dialog" aria-label={t(s.title)}>
        <div className={`coach-arrow ${pos.arrow}`} style={{ left: pos.arrowLeft, top: pos.arrowTop }} />
        <div className="coach-step">{step + 1} / {STEPS.length}</div>
        <h4>{t(s.title)}</h4>
        <p>{t(s.text)}</p>
        <div className="coach-actions">
          <button className="coach-skip" onClick={finish}>
            {t('Skip')}
          </button>
          <button
            className="btn primary coach-next"
            onClick={() => {
              tapLight();
              if (last) finish();
              else setStep(step + 1);
            }}
          >
            {last ? t('Done') : t('Next')}
          </button>
        </div>
      </div>
    </>
  );
}
