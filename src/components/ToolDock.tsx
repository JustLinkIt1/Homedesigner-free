import { MousePointer2, PenTool, Square, DoorOpen, Eraser, Hand, Ruler } from 'lucide-react';
import { useDesign } from '../store/designStore';
import type { ToolMode } from '../types';

const TOOLS: { id: ToolMode; icon: typeof MousePointer2; label: string }[] = [
  { id: 'select', icon: MousePointer2, label: 'Select & move' },
  { id: 'wall', icon: PenTool, label: 'Draw walls' },
  { id: 'room', icon: Square, label: 'Draw room' },
  { id: 'measure', icon: Ruler, label: 'Measure distance' },
  { id: 'erase', icon: Eraser, label: 'Erase' },
  { id: 'pan', icon: Hand, label: 'Pan' },
];

export default function ToolDock() {
  const { tool, setTool, setPendingFurniture, pendingFurnitureType } = useDesign();

  return (
    <div className="tool-dock">
      {TOOLS.map((t, i) => {
        const Icon = t.icon;
        return (
          <div key={t.id} style={{ display: 'contents' }}>
            <button
              className={`dock-btn ${tool === t.id ? 'active' : ''}`}
              data-tip={t.label}
              aria-label={t.label}
              aria-pressed={tool === t.id}
              onClick={() => setTool(t.id)}
            >
              <Icon className="icon" />
            </button>
            {i === 2 && <div className="dock-sep" />}
          </div>
        );
      })}
      <div className="dock-sep" />
      <button
        className={`dock-btn ${pendingFurnitureType === 'door' ? 'active' : ''}`}
        data-tip="Add door"
        aria-label="Add door"
        aria-pressed={pendingFurnitureType === 'door'}
        onClick={() => setPendingFurniture(pendingFurnitureType === 'door' ? null : 'door')}
      >
        <DoorOpen className="icon" />
      </button>
    </div>
  );
}
