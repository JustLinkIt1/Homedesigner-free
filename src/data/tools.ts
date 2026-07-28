// Shared drawing-tool definitions, used by both the desktop floating tool dock
// (ToolDock) and the phone "Build" sheet (BuildSheet) so there is a single
// source of truth for the build-mode tools and their icons/labels.
import { MousePointer2, PenTool, Square, DoorOpen, Eraser, Hand, Ruler, CookingPot, Fence } from 'lucide-react';
import { FURNITURE_CATALOG } from './furnitureCatalog';
import type { ToolMode } from '../types';

export const TOOLS: { id: ToolMode; icon: typeof MousePointer2; label: string }[] = [
  { id: 'select', icon: MousePointer2, label: 'Select & move' },
  { id: 'wall', icon: PenTool, label: 'Draw walls' },
  { id: 'fence', icon: Fence, label: 'Draw fence' },
  { id: 'room', icon: Square, label: 'Draw room' },
  { id: 'kitchen', icon: CookingPot, label: 'Kitchen run' },
  { id: 'measure', icon: Ruler, label: 'Measure distance' },
  { id: 'erase', icon: Eraser, label: 'Erase' },
  { id: 'pan', icon: Hand, label: 'Pan' },
];

export { DoorOpen };

// Doors, windows and openings are placed like furniture but belong to the build
// flow — so they live in a dedicated build control, not the catalog panel.
export const OPENINGS = FURNITURE_CATALOG.filter((e) => e.category === 'Openings');
