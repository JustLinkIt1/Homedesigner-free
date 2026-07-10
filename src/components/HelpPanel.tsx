import { CircleHelp } from 'lucide-react';

const SECTIONS: { title: string; rows: { keys?: string[]; text: string }[] }[] = [
  {
    title: 'Drawing walls & rooms',
    rows: [
      { text: 'Click to chain wall points; click a room’s first point to close it' },
      { keys: ['Enter'], text: 'Finish the current wall chain / room' },
      { keys: ['Esc'], text: 'Cancel drawing (or clear the typed length)' },
      { keys: ['4', '.', '5', 'Enter'], text: 'Type a number while drawing to place the next point at that exact length (m or ft)' },
      { text: 'Snapping is automatic: endpoints, midpoints, wall bodies, and alignment guides' },
    ],
  },
  {
    title: 'Editing',
    rows: [
      { text: 'Drag a wall to move it; drag an endpoint to move the whole corner' },
      { keys: ['Del'], text: 'Delete selection' },
      { keys: ['Ctrl', 'Z'], text: 'Undo (add Shift to redo)' },
      { keys: ['Ctrl', 'C'], text: 'Copy furniture (V pastes at the cursor, D duplicates)' },
      { keys: ['Ctrl', 'A'], text: 'Select all furniture' },
      { keys: ['←', '↑', '↓', '→'], text: 'Nudge selected furniture 1 cm (hold Shift for 10 cm)' },
      { text: 'Right-click (or long-press on touch) for copy / duplicate / arrange' },
    ],
  },
  {
    title: 'Measure & scale',
    rows: [
      { text: 'Measure tool: click two points to read a distance' },
      { text: 'After measuring a wall, enter its real length to rescale the whole drawing — ideal after importing a plan' },
    ],
  },
  {
    title: 'Floors & 3D',
    rows: [
      { text: '“+ Floor” adds a storey; click a floor name to edit it' },
      { text: '3D view: Dollhouse fades walls; Walk through explores at eye level (WASD / on-screen stick)' },
      { text: 'Render image saves a snapshot; Photo mode ray-traces a realistic still' },
    ],
  },
];

/** Keyboard-shortcut & feature reference ("?" in the toolbar). */
export default function HelpPanel({
  onClose,
  onReplayTour,
}: {
  onClose: () => void;
  onReplayTour?: () => void;
}) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal help-panel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <CircleHelp className="icon" /> Tips & shortcuts
        </div>
        <div className="modal-body help-body">
          {SECTIONS.map((s) => (
            <section key={s.title}>
              <h3>{s.title}</h3>
              <ul>
                {s.rows.map((r, i) => (
                  <li key={i}>
                    {r.keys && (
                      <span className="keys">
                        {r.keys.map((k, j) => (
                          <kbd key={j}>{k}</kbd>
                        ))}
                      </span>
                    )}
                    <span>{r.text}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <div className="modal-foot">
          {onReplayTour && (
            <button className="btn" onClick={onReplayTour}>
              Show intro again
            </button>
          )}
          <button className="btn primary" onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
