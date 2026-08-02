import { CircleHelp } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import Modal from './Modal';

// Touch devices have no keyboard/right-click, so the shortcut chips are noise
// there. On a coarse pointer we drop the keyboard-only rows and swap in the
// gesture phrasing; on desktop the full keyboard reference shows.
const IS_TOUCH =
  typeof window !== 'undefined' &&
  !!window.matchMedia &&
  window.matchMedia('(pointer: coarse)').matches;

type Row = {
  keys?: string[];
  text: string;
  /** Shown instead of `text` on touch devices. */
  touchText?: string;
  /** Keyboard-only rows that have no touch equivalent — hidden on touch. */
  desktopOnly?: boolean;
};

const SECTIONS: { title: string; rows: Row[] }[] = [
  {
    title: 'Drawing walls & rooms',
    rows: [
      {
        text: 'Click to chain wall points; click a room’s first point to close it',
        touchText: 'Press and drag to draw, releasing to drop each corner — a tap works too',
      },
      { keys: ['Enter'], text: 'Finish the current wall chain / room', touchText: 'Tap Finish to end the current wall chain / room' },
      { keys: ['Esc'], text: 'Cancel drawing (or clear the typed length)', touchText: 'Tap ✕ to cancel drawing' },
      {
        keys: ['4', '.', '5', 'Enter'],
        text: 'Type a number while drawing to place the next point at that exact length (m or ft)',
        touchText: 'While drawing, enter a length to place the next point at that exact distance (m or ft)',
      },
      { text: 'Snapping is automatic: endpoints, midpoints, wall bodies, and alignment guides' },
    ],
  },
  {
    title: 'Editing',
    rows: [
      { text: 'Drag a wall to move it; drag an endpoint to move the whole corner' },
      { keys: ['Del'], text: 'Delete selection', touchText: 'Select an item, then tap Delete in the Edit panel' },
      { keys: ['Ctrl', 'Z'], text: 'Undo (add Shift to redo)', touchText: 'Use the undo / redo arrows in the top bar' },
      { keys: ['Ctrl', 'C'], text: 'Copy furniture (V pastes at the cursor, D duplicates)', desktopOnly: true },
      { keys: ['Ctrl', 'A'], text: 'Select all furniture', desktopOnly: true },
      { keys: ['←', '↑', '↓', '→'], text: 'Nudge selected furniture 1 cm (hold Shift for 10 cm)', desktopOnly: true },
      { text: 'Right-click (or long-press on touch) for copy / duplicate / arrange', touchText: 'Long-press an item for copy / duplicate / arrange' },
      { text: '', touchText: 'One finger draws; pinch or drag two fingers to zoom and pan' },
      { text: '', touchText: 'Imported a plan? Pick Position plan to drag, pinch and turn it' },
    ],
  },
  {
    title: 'Measure & scale',
    rows: [
      { text: 'Measure tool: click two points to read a distance', touchText: 'Measure tool: tap two points to read a distance' },
      { text: 'After measuring a wall, enter its real length to rescale the whole drawing — ideal after importing a plan' },
    ],
  },
  {
    title: 'Floors & 3D',
    rows: [
      { text: '“+ Floor” adds a storey; click a floor name to edit it', touchText: '“+ Floor” adds a storey; tap a floor name to edit it' },
      {
        text: '3D view: Dollhouse fades walls; Walk through explores at eye level (WASD / on-screen stick)',
        touchText: '3D view: Dollhouse fades walls; Walk through explores at eye level with the on-screen stick',
      },
      { text: 'Render image saves a snapshot; Photo mode ray-traces a realistic still' },
    ],
  },
];

/** Feature reference + (on desktop) keyboard shortcuts. Reachable from the "?"
 *  menu item and the home "Explore ideas" tip. */
export default function HelpPanel({
  open,
  onClose,
  onReplayTour,
}: {
  open: boolean;
  onClose: () => void;
  onReplayTour?: () => void;
}) {
  const t = useI18n();
  return (
    <Modal open={open} onClose={onClose} className="help-panel" labelledBy="help-title">
      <>
        <div className="modal-head" id="help-title">
          <CircleHelp className="icon" /> {IS_TOUCH ? t('Tips & gestures') : t('Tips & shortcuts')}
        </div>
        <div className="modal-body help-body">
          {SECTIONS.map((s) => {
            const rows = s.rows
              .filter((r) => !(IS_TOUCH && r.desktopOnly))
              .filter((r) => (IS_TOUCH ? r.touchText ?? r.text : r.text));
            return (
              <section key={s.title}>
                <h3>{t(s.title)}</h3>
                <ul>
                  {rows.map((r, i) => (
                    <li key={i}>
                      {r.keys && !IS_TOUCH && (
                        <span className="keys">
                          {r.keys.map((k, j) => (
                            <kbd key={j}>{k}</kbd>
                          ))}
                        </span>
                      )}
                      <span>{t(IS_TOUCH ? r.touchText ?? r.text : r.text)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
        <div className="modal-foot">
          {onReplayTour && (
            <button className="btn" onClick={onReplayTour}>
              {t('Show intro again')}
            </button>
          )}
          <button className="btn primary" onClick={onClose}>
            {t('Got it')}
          </button>
        </div>
      </>
    </Modal>
  );
}
