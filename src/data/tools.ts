// Shared drawing-tool definitions, used by both the desktop floating tool dock
// (ToolDock) and the phone "Build" sheet (BuildSheet) so there is a single
// source of truth for the build-mode tools and their icons/labels.
import { MousePointer2, PenTool, PanelTop, Square, DoorOpen, Eraser, Hand, Ruler, CookingPot, Fence, Move } from 'lucide-react';
import { FURNITURE_CATALOG } from './furnitureCatalog';
import type { ToolMode } from '../types';

export const TOOLS: { id: ToolMode; icon: typeof MousePointer2; label: string; needsBackground?: boolean }[] = [
  { id: 'select', icon: MousePointer2, label: 'Select & move' },
  { id: 'wall', icon: PenTool, label: 'Draw walls' },
  { id: 'halfWall', icon: PanelTop, label: 'Draw half wall' },
  { id: 'fence', icon: Fence, label: 'Draw fence' },
  { id: 'room', icon: Square, label: 'Draw room' },
  { id: 'kitchen', icon: CookingPot, label: 'Kitchen run' },
  { id: 'measure', icon: Ruler, label: 'Measure distance' },
  { id: 'erase', icon: Eraser, label: 'Erase' },
  { id: 'pan', icon: Hand, label: 'Pan' },
  // Only meaningful with an imported plan on the canvas, so it stays hidden
  // until there is one — see `visibleTools`.
  { id: 'trace', icon: Move, label: 'Position plan', needsBackground: true },
];

/** The tools to offer right now. `trace` is the only conditional one. */
export function visibleTools(hasBackground: boolean) {
  return TOOLS.filter((t) => !t.needsBackground || hasBackground);
}

export { DoorOpen };

// Doors, windows and openings are placed like furniture but belong to the build
// flow — so they live in a dedicated build control, not the catalog panel.
export const OPENINGS = FURNITURE_CATALOG.filter((e) => e.category === 'Openings');
