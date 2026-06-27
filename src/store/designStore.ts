import { create } from 'zustand';
import type {
  BackgroundPlan,
  FurnitureItem,
  Opening,
  Point,
  Room,
  Selection,
  ToolMode,
  ViewMode,
  Wall,
} from '../types';
import { uid } from '../lib/geometry';
import { CATALOG_BY_TYPE } from '../data/furnitureCatalog';
import { detectRooms, roomMatches } from '../lib/roomDetection';

/** The serializable part of the design (what we save / load / undo). */
export interface DesignSnapshot {
  walls: Wall[];
  rooms: Room[];
  furniture: FurnitureItem[];
  openings: Opening[];
  background: BackgroundPlan | null;
}

interface DesignState extends DesignSnapshot {
  // View / interaction state (not part of undo history).
  tool: ToolMode;
  view: ViewMode;
  selection: Selection;
  zoom: number; // px per cm
  pan: Point; // px offset
  showGrid: boolean;
  gridSize: number; // cm
  dollhouse: boolean; // 3D: fade walls between camera and interior
  defaultWallHeight: number;
  defaultWallThickness: number;
  pendingFurnitureType: string | null;

  // history
  _past: DesignSnapshot[];
  _future: DesignSnapshot[];

  // actions
  setTool: (t: ToolMode) => void;
  setView: (v: ViewMode) => void;
  setZoom: (z: number) => void;
  setPan: (p: Point) => void;
  setShowGrid: (b: boolean) => void;
  setDollhouse: (b: boolean) => void;
  select: (sel: Selection) => void;
  clearSelection: () => void;
  setPendingFurniture: (type: string | null) => void;

  addWall: (start: Point, end: Point) => string;
  updateWall: (id: string, patch: Partial<Wall>) => void;
  addRoom: (points: Point[]) => string;
  updateRoom: (id: string, patch: Partial<Room>) => void;
  addFurniture: (type: string, position: Point) => string;
  updateFurniture: (id: string, patch: Partial<FurnitureItem>) => void;
  addOpening: (wallId: string, offset: number, type: 'door' | 'window') => string;
  updateOpening: (id: string, patch: Partial<Opening>) => void;
  deleteSelected: () => void;
  deleteById: (kind: Selection['kind'], id: string | null) => void;

  importWalls: (walls: Wall[], replace?: boolean) => void;
  detectRoomsFromWalls: () => number;
  setBackground: (bg: BackgroundPlan | null) => void;
  updateBackground: (patch: Partial<BackgroundPlan>) => void;

  newProject: () => void;
  loadSnapshot: (s: DesignSnapshot) => void;

  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

const STORAGE_KEY = 'homedesigner.project.v1';

const emptySnapshot = (): DesignSnapshot => ({
  walls: [],
  rooms: [],
  furniture: [],
  openings: [],
  background: null,
});

const snapshotOf = (s: DesignState): DesignSnapshot => ({
  walls: s.walls,
  rooms: s.rooms,
  furniture: s.furniture,
  openings: s.openings,
  background: s.background,
});

const loadInitial = (): DesignSnapshot => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...emptySnapshot(), ...JSON.parse(raw) };
  } catch {
    /* ignore corrupt storage */
  }
  return emptySnapshot();
};

const persist = (snap: DesignSnapshot) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
  } catch {
    /* storage may be full / unavailable */
  }
};

export const useDesign = create<DesignState>((set, get) => {
  /** Wrap a mutation so it pushes onto the undo stack and persists. */
  const commit = (mutate: (draft: DesignSnapshot) => void) => {
    const prev = snapshotOf(get());
    const next: DesignSnapshot = {
      walls: [...prev.walls],
      rooms: [...prev.rooms],
      furniture: [...prev.furniture],
      openings: [...prev.openings],
      background: prev.background,
    };
    mutate(next);
    persist(next);
    set((s) => ({
      ...next,
      _past: [...s._past, prev].slice(-100),
      _future: [],
    }));
  };

  return {
    ...loadInitial(),
    tool: 'select',
    view: '2d',
    selection: { kind: null, id: null },
    zoom: 0.35,
    pan: { x: 400, y: 300 },
    showGrid: true,
    gridSize: 25,
    dollhouse: true,
    defaultWallHeight: 270,
    defaultWallThickness: 12,
    pendingFurnitureType: null,
    _past: [],
    _future: [],

    setTool: (t) =>
      set({ tool: t, pendingFurnitureType: t === 'furniture' ? get().pendingFurnitureType : null }),
    setView: (v) => set({ view: v }),
    setZoom: (z) => set({ zoom: Math.max(0.05, Math.min(4, z)) }),
    setPan: (p) => set({ pan: p }),
    setShowGrid: (b) => set({ showGrid: b }),
    setDollhouse: (b) => set({ dollhouse: b }),
    select: (sel) => set({ selection: sel }),
    clearSelection: () => set({ selection: { kind: null, id: null } }),
    setPendingFurniture: (type) =>
      set({ pendingFurnitureType: type, tool: type ? 'furniture' : get().tool }),

    addWall: (start, end) => {
      const id = uid();
      const { defaultWallHeight, defaultWallThickness } = get();
      commit((d) => {
        d.walls.push({
          id,
          start,
          end,
          thickness: defaultWallThickness,
          height: defaultWallHeight,
          color: '#d7dade',
        });
      });
      return id;
    },

    updateWall: (id, patch) =>
      commit((d) => {
        const i = d.walls.findIndex((w) => w.id === id);
        if (i >= 0) d.walls[i] = { ...d.walls[i], ...patch };
      }),

    addRoom: (points) => {
      const id = uid();
      const count = get().rooms.length + 1;
      commit((d) => {
        d.rooms.push({
          id,
          name: `Room ${count}`,
          points,
          floorMaterial: 'oak',
          color: '#f3ede2',
        });
      });
      return id;
    },

    updateRoom: (id, patch) =>
      commit((d) => {
        const i = d.rooms.findIndex((r) => r.id === id);
        if (i >= 0) d.rooms[i] = { ...d.rooms[i], ...patch };
      }),

    addFurniture: (type, position) => {
      const id = uid();
      const entry = CATALOG_BY_TYPE[type];
      if (!entry) return id;
      commit((d) => {
        d.furniture.push({
          id,
          type,
          name: entry.name,
          position,
          rotation: 0,
          width: entry.width,
          depth: entry.depth,
          height: entry.height,
          color: entry.color,
        });
      });
      return id;
    },

    updateFurniture: (id, patch) =>
      commit((d) => {
        const i = d.furniture.findIndex((f) => f.id === id);
        if (i >= 0) d.furniture[i] = { ...d.furniture[i], ...patch };
      }),

    addOpening: (wallId, offset, type) => {
      const id = uid();
      const entry = CATALOG_BY_TYPE[type];
      commit((d) => {
        d.openings.push({
          id,
          wallId,
          type,
          offset,
          width: entry?.width ?? (type === 'door' ? 90 : 120),
          height: entry?.height ?? (type === 'door' ? 205 : 120),
          sill: type === 'door' ? 0 : 90,
        });
      });
      return id;
    },

    updateOpening: (id, patch) =>
      commit((d) => {
        const i = d.openings.findIndex((o) => o.id === id);
        if (i >= 0) d.openings[i] = { ...d.openings[i], ...patch };
      }),

    deleteById: (kind, id) => {
      if (!kind || !id) return;
      commit((d) => {
        if (kind === 'wall') {
          d.walls = d.walls.filter((w) => w.id !== id);
          d.openings = d.openings.filter((o) => o.wallId !== id); // openings can't outlive their wall
        }
        if (kind === 'room') d.rooms = d.rooms.filter((r) => r.id !== id);
        if (kind === 'furniture') d.furniture = d.furniture.filter((f) => f.id !== id);
        if (kind === 'opening') d.openings = d.openings.filter((o) => o.id !== id);
      });
      const sel = get().selection;
      if (sel.id === id) set({ selection: { kind: null, id: null } });
    },

    deleteSelected: () => {
      const { selection, deleteById } = get();
      deleteById(selection.kind, selection.id);
    },

    importWalls: (walls, replace = false) =>
      commit((d) => {
        if (replace) {
          d.walls = [];
          d.openings = [];
        }
        d.walls.push(...walls);
      }),

    detectRoomsFromWalls: () => {
      const polys = detectRooms(get().walls);
      let added = 0;
      commit((d) => {
        // Drop previously auto-generated rooms, keep manually drawn ones.
        d.rooms = d.rooms.filter((r) => !r.auto);
        const palette = ['oak', 'carpet_grey', 'tile_white', 'walnut', 'tile_grey', 'concrete'];
        for (const poly of polys) {
          // Skip if a manual room already covers this area.
          if (d.rooms.some((r) => roomMatches(poly, r.points))) continue;
          added++;
          d.rooms.push({
            id: uid(),
            name: `Room ${d.rooms.length + 1}`,
            points: poly,
            floorMaterial: palette[(added - 1) % palette.length],
            color: '#f3ede2',
            auto: true,
          });
        }
      });
      return added;
    },

    setBackground: (bg) =>
      commit((d) => {
        d.background = bg;
      }),

    updateBackground: (patch) =>
      commit((d) => {
        if (d.background) d.background = { ...d.background, ...patch };
      }),

    newProject: () => {
      const empty = emptySnapshot();
      persist(empty);
      set({
        ...empty,
        selection: { kind: null, id: null },
        _past: [],
        _future: [],
      });
    },

    loadSnapshot: (snap) => {
      persist(snap);
      set({ ...snap, selection: { kind: null, id: null }, _past: [], _future: [] });
    },

    undo: () => {
      const { _past } = get();
      if (_past.length === 0) return;
      const prev = _past[_past.length - 1];
      const current = snapshotOf(get());
      persist(prev);
      set((s) => ({
        ...prev,
        _past: s._past.slice(0, -1),
        _future: [current, ...s._future].slice(0, 100),
        selection: { kind: null, id: null },
      }));
    },

    redo: () => {
      const { _future } = get();
      if (_future.length === 0) return;
      const next = _future[0];
      const current = snapshotOf(get());
      persist(next);
      set((s) => ({
        ...next,
        _past: [...s._past, current].slice(-100),
        _future: s._future.slice(1),
        selection: { kind: null, id: null },
      }));
    },

    canUndo: () => get()._past.length > 0,
    canRedo: () => get()._future.length > 0,
  };
});
