import { Home, Sofa, Ruler, PenTool } from 'lucide-react';
import { useDesign } from '../store/designStore';

const WELCOMED_KEY = 'homedesigner.welcomed';

export function shouldWelcome(): boolean {
  const s = useDesign.getState();
  const empty = s.walls.length === 0 && s.rooms.length === 0 && s.furniture.length === 0;
  let seen = false;
  try {
    seen = localStorage.getItem(WELCOMED_KEY) === '1';
  } catch {
    /* ignore */
  }
  return empty && !seen;
}

export default function WelcomeModal({
  onImport,
  onClose,
}: {
  onImport: () => void;
  onClose: () => void;
}) {
  const s = useDesign();
  const dismiss = () => {
    try {
      localStorage.setItem(WELCOMED_KEY, '1');
    } catch {
      /* ignore */
    }
    onClose();
  };

  return (
    <div className="modal-backdrop" onMouseDown={dismiss}>
      <div className="welcome" onMouseDown={(e) => e.stopPropagation()}>
        <div className="welcome-hero">
          <div className="welcome-logo">
            <Home className="icon" />
          </div>
          <h1>
            HomeDesigner <span className="free">FREE</span>
          </h1>
          <p>Design your home in 2D, walk through it in 3D, and render it beautifully.</p>
        </div>
        <div className="welcome-cards">
          <button
            className="welcome-card primary"
            onClick={() => {
              s.loadSample();
              dismiss();
            }}
          >
            <span className="wc-ico"><Sofa className="icon" /></span>
            <span className="wc-title">Open the sample home</span>
            <span className="wc-sub">A furnished 2-bed apartment to explore</span>
          </button>
          <button
            className="welcome-card"
            onClick={() => {
              dismiss();
              onImport();
            }}
          >
            <span className="wc-ico"><Ruler className="icon" /></span>
            <span className="wc-title">Import a 2D plan</span>
            <span className="wc-sub">PDF / image / DXF — walls traced automatically</span>
          </button>
          <button
            className="welcome-card"
            onClick={() => {
              s.newProject();
              dismiss();
            }}
          >
            <span className="wc-ico"><PenTool className="icon" /></span>
            <span className="wc-title">Start from scratch</span>
            <span className="wc-sub">Draw walls and rooms yourself</span>
          </button>
        </div>
      </div>
    </div>
  );
}
