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
  actions,
  danger = 'delete',
}: {
  /** Anchor within `bounds` — the selected object's centre, in the same space
   *  the canvas overlay uses (not the viewport). */
  x: number;
  y: number;
  /** Size of the canvas overlay the ring is positioned inside. */
  bounds: { w: number; h: number };
  actions: SelectionAction[];
  danger?: SelectionAction['id'];
}) {
  const t = useI18n();
  if (!actions.length) return null;

  const label: Record<SelectionAction['id'], string> = {
    rotate: t('Rotate 90°'),
    duplicate: t('Duplicate'),
    delete: t('Delete'),
    edit: t('Edit'),
  };
  const Icon = { rotate: RotateCw, duplicate: Copy, delete: Trash2, edit: SlidersHorizontal };

  // Fan upward by default; flip below when the object sits near the top. The
  // bottom reserve keeps it off the tab bar rather than merely on screen.
  const roomAbove = y - RADIUS - BUTTON > EDGE;
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
  const shiftX = Math.max(0, EDGE + half - (x + minX)) - Math.max(0, (x + maxX) + half - (bounds.w - EDGE));
  const shiftY = Math.max(0, EDGE + half - (y + minY))
    - Math.max(0, (y + maxY) + half - (bounds.h - BOTTOM_RESERVE));

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
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
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
