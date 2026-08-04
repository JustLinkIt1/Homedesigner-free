import { useRef } from 'react';
import { Copy, RotateCw, SlidersHorizontal, Trash2 } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { tapLight } from '../lib/haptics';

/**
 * Touch selection actions, fanned in an arc beside the selected object.
 *
 * Replaces auto-opening the full properties drawer on a phone. That drawer is
 * full height, so selecting something covered the very thing you had just
 * selected — you could not see the change you were making. These four cover
 * what people actually do straight after selecting; everything else is still a
 * tap away behind Edit.
 *
 * The arc flips to whichever side has room, so the cluster never lands
 * off-screen or under the bottom tab bar. A fixed circular wheel centred on the
 * object would clip on a 390px-wide screen as soon as the object sat near an
 * edge, which is most of the time on a phone.
 */
export interface SelectionAction {
  id: 'rotate' | 'duplicate' | 'delete' | 'edit';
  run: () => void;
  /** Optional press-and-drag behaviour, in addition to tapping.
   *
   *  Rotate uses it: a tester asked to "rotate how i want", and free rotation
   *  already existed — on the small stalk handle beside the object, which on a
   *  phone is easy to miss next to this much louder ring. Putting it on the
   *  control people actually see is the fix. `deg` is the angle from the
   *  OBJECT's centre to the finger, already snapped. */
  drag?: (deg: number) => void;
}

/** Radius of the arc, and how far apart the buttons sit along it.
 *  These two are load-bearing together: adjacent buttons sit a chord of
 *  2*RADIUS*sin(step/2) apart, and that must exceed BUTTON or they overlap and
 *  the outer ones swallow taps meant for the inner ones. At 62/112 the chord
 *  was ~40px against 44px buttons, and Delete ate Rotate's taps. 72/150 gives
 *  ~61px. Changing either without checking the chord will reintroduce it —
 *  tests/smoke.mjs asserts the buttons do not overlap. */
const RADIUS = 72;
const SPREAD = 150; // total degrees covered by the fan
const BUTTON = 44; // must match .sel-ring button in index.css
/** Keep the whole fan clear of the screen edges and the bottom tab bar. */
const EDGE = 10;
const BOTTOM_RESERVE = 96;

export default function SelectionRing({
  x,
  y,
  bounds,
  place = 'auto',
  actions,
  danger = 'delete',
}: {
  /** Anchor within `bounds` — the selected object's centre, in the same space
   *  the canvas overlay uses (not the viewport). */
  x: number;
  y: number;
  /** Size of the canvas overlay the ring is positioned inside. Omit when the
   *  wrapper is already anchored to the object (the 3D view puts the ring in a
   *  drei <Html>, which positions it), in which case there is nothing to clamp
   *  against and the fan direction must be given explicitly. */
  bounds?: { w: number; h: number };
  /** 'auto' picks a side from `y` within `bounds`; the 3D ring forces one. */
  place?: 'auto' | 'above' | 'below';
  actions: SelectionAction[];
  danger?: SelectionAction['id'];
}) {
  const t = useI18n();
  const dragRef = useRef<{ id: string; moved: boolean } | null>(null);
  const draggedRef = useRef(false);
  if (!actions.length) return null;

  const label: Record<SelectionAction['id'], string> = {
    rotate: t('Rotate — drag to set any angle'),
    duplicate: t('Duplicate'),
    delete: t('Delete'),
    edit: t('Edit'),
  };
  const Icon = { rotate: RotateCw, duplicate: Copy, delete: Trash2, edit: SlidersHorizontal };

  // Fan upward by default; flip below when the object sits near the top. The
  // bottom reserve keeps it off the tab bar rather than merely on screen.
  const roomAbove = place === 'auto'
    ? !bounds || y - RADIUS - BUTTON > EDGE
    : place === 'above';
  const centreDeg = roomAbove ? -90 : 90;
  const step = actions.length > 1 ? SPREAD / (actions.length - 1) : 0;
  const start = centreDeg - SPREAD / 2;

  // Lay the fan out first, then shift it ON to the screen AS A WHOLE. Clamping
  // each button independently used to collapse the spacing near an edge, which
  // put the buttons on top of each other — the same overlap the radius/spread
  // pairing above exists to avoid.
  const offsets = actions.map((_, i) => {
    const deg = ((start + step * i) * Math.PI) / 180;
    return { dx: Math.cos(deg) * RADIUS, dy: Math.sin(deg) * RADIUS };
  });
  const half = BUTTON / 2;
  const minX = Math.min(...offsets.map((o) => o.dx));
  const maxX = Math.max(...offsets.map((o) => o.dx));
  const minY = Math.min(...offsets.map((o) => o.dy));
  const maxY = Math.max(...offsets.map((o) => o.dy));
  const shiftX = bounds
    ? Math.max(0, EDGE + half - (x + minX)) - Math.max(0, (x + maxX) + half - (bounds.w - EDGE))
    : 0;
  const shiftY = bounds
    ? Math.max(0, EDGE + half - (y + minY))
      - Math.max(0, (y + maxY) + half - (bounds.h - BOTTOM_RESERVE))
    : 0;

  return (
    <div className="sel-ring" style={{ left: x, top: y }} role="toolbar" aria-label={t('Selection actions')}>
      {actions.map((action, i) => {
        const dx = offsets[i].dx + shiftX;
        const dy = offsets[i].dy + shiftY;
        const Glyph = Icon[action.id];
        return (
          <button
            key={action.id}
            className={action.id === danger ? 'danger' : ''}
            style={{ transform: `translate(-50%, -50%) translate(${dx}px, ${dy}px)` }}
            aria-label={label[action.id]}
            data-tip={label[action.id]}
            onPointerDown={(e) => {
              e.stopPropagation();
              if (!action.drag) return;
              // Capture so the gesture survives the finger leaving the 44px
              // button — which it does immediately, since rotating sweeps a
              // long way from where it started.
              e.currentTarget.setPointerCapture(e.pointerId);
              dragRef.current = { id: action.id, moved: false };
            }}
            onPointerMove={(e) => {
              const d = dragRef.current;
              if (!d || d.id !== action.id || !action.drag) return;
              const host = e.currentTarget.parentElement?.getBoundingClientRect();
              if (!host) return;
              // Measure from the OBJECT's centre, not the button: the buttons
              // sit on an arc beside the object, so using the button as the
              // pivot would rotate about the wrong point entirely.
              const deg = (Math.atan2(e.clientY - host.top, e.clientX - host.left) * 180) / Math.PI + 90;
              if (!d.moved) {
                d.moved = true;
                tapLight();
              }
              action.drag(deg);
            }}
            onPointerUp={(e) => {
              const d = dragRef.current;
              dragRef.current = null;
              if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                e.currentTarget.releasePointerCapture(e.pointerId);
              }
              // A drag has already applied its angle continuously; the click
              // that follows must not ALSO fire the 90° step.
              draggedRef.current = !!d?.moved;
            }}
            onPointerCancel={() => {
              // Android takes touches away mid-gesture. Without this the object
              // keeps following a finger that is no longer there.
              dragRef.current = null;
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (draggedRef.current) {
                draggedRef.current = false;
                return;
              }
              tapLight();
              action.run();
            }}
          >
            <Glyph className="icon" />
          </button>
        );
      })}
    </div>
  );
}
