import { create } from 'zustand';
import type {
  BackgroundPlan,
  FloorGeom,
  FloorInfo,
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
import { sampleProject } from '../data/sampleProject';
import type { Units } from '../lib/units';

/**
 * The serializable part of the design (what we save / load / undo).
 *
 * Multi-floor model: the top-level walls/rooms/furniture/openings/background
 * always mirror the ACTIVE floor, so every component can keep reading them
 * directly. `floorGeom` holds the geometry for every storey (including the
 * active one, kept in sync by `commit`); `floors` is the ordered storey list.
 */
/** The geometry of a single storey plus the project name (no floor metadata). */
export interface GeomSnapshot {
  walls: Wall[];
  rooms: Room[];
  furniture: FurnitureItem[];
  openings: Opening[];
  background: BackgroundPlan | null;
  projectName: string;
}

export interface DesignSnapshot extends GeomSnapshot {
  floors: FloorInfo[];
  floorGeom: Record<string, FloorGeom>;
  activeFloorId: string;
}

/** A snapshot that may or may not yet carry multi-floor metadata. */
export type MaybeFloored = GeomSnapshot & Partial<Pick<DesignSnapshot, 'floors' | 'floorGeom' | 'activeFloorId'>>;

const STOREY_HEIGHT = 282; // default storey-to-storey rise in cm (wall + slab)

const emptyGeom = (): FloorGeom => ({
  walls: [],
  rooms: [],
  furniture: [],
  openings: [],
  background: null,
});

const geomOf = (s: DesignSnapshot): FloorGeom => ({
  walls: s.walls,
  rooms: s.rooms,
  furniture: s.furniture,
  openings: s.openings,
  background: s.background,
});

// Module-level furniture clipboard (copy/paste across the app).
let clipboard: FurnitureItem[] = [];

interface DesignState extends DesignSnapshot {
  // View / interaction state (not part of undo history).
  tool: ToolMode;
  view: ViewMode;
  selection: Selection;
  zoom: number; // px per cm
  pan: Point; // px offset
  showGrid: boolean;
  gridSize: number; // cm
  showDimensions: boolean; // 2D: architectural dimension annotations
  dollhouse: boolean; // 3D: fade walls between camera and interior
  walkMode: boolean; // 3D: first-person walk-through mode
  defaultWallHeight: number;
  defaultWallThickness: number;
  pendingFurnitureType: string | null;
  fitRequest: number; // bump to ask the 2D canvas to frame the design
  selectedIds: string[]; // multi-selected furniture ids
  savedTick: number; // bumped after each autosave (for the "Saved" cue)
  units: Units; // display units (metric/imperial); not part of undo history

  // history
  _past: DesignSnapshot[];
  _future: DesignSnapshot[];

  // actions
  setTool: (t: ToolMode) => void;
  setView: (v: ViewMode) => void;
  setZoom: (z: number) => void;
  setPan: (p: Point) => void;
  setShowGrid: (b: boolean) => void;
  setShowDimensions: (b: boolean) => void;
  setUnits: (u: Units) => void;
  setDollhouse: (b: boolean) => void;
  setWalkMode: (b: boolean) => void;
  requestFit: () => void;
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

  // multi-select + clipboard + arrange
  setSelectedIds: (ids: string[]) => void;
  toggleSelected: (id: string) => void;
  moveFurnitureGroup: (ids: string[], dx: number, dy: number) => void;
  duplicateSelection: () => void;
  copySelection: () => void;
  paste: () => void;
  bringToFront: (id: string) => void;
  sendToBack: (id: string) => void;
  setProjectName: (name: string) => void;

  /** Uniformly scale the whole drawing's plan geometry (for calibration). */
  scaleDesign: (factor: number) => void;

  // multi-floor (storeys)
  setActiveFloor: (id: string) => void;
  addFloor: () => void;
  removeFloor: (id: string) => void;
  renameFloor: (id: string, name: string) => void;

  importWalls: (walls: Wall[], replace?: boolean) => void;
  detectRoomsFromWalls: () => number;
  setBackground: (bg: BackgroundPlan | null) => void;
  updateBackground: (patch: Partial<BackgroundPlan>) => void;

  newProject: () => void;
  loadSample: () => void;
  loadSnapshot: (s: MaybeFloored) => void;

  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

const STORAGE_KEY = 'homedesigner.project.v1';
const SETTINGS_KEY = 'homedesigner.settings.v1';

/** Load persisted display settings (units) from their own key — kept out of
 *  the undo snapshot so changing units never pollutes history. */
const loadSettings = (): { units: Units } => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s.units === 'metric' || s.units === 'imperial') return { units: s.units };
    }
  } catch {
    /* ignore corrupt storage */
  }
  return { units: 'metric' };
};

const emptySnapshot = (): DesignSnapshot => {
  const id = uid();
  return {
    walls: [],
    rooms: [],
    furniture: [],
    openings: [],
    background: null,
    projectName: 'Untitled home',
    floors: [{ id, name: 'Ground floor', elevation: 0 }],
    floorGeom: { [id]: emptyGeom() },
    activeFloorId: id,
  };
};

const snapshotOf = (s: DesignState): DesignSnapshot => ({
  walls: s.walls,
  rooms: s.rooms,
  furniture: s.furniture,
  openings: s.openings,
  background: s.background,
  projectName: s.projectName,
  floors: s.floors,
  floorGeom: s.floorGeom,
  activeFloorId: s.activeFloorId,
});

/** Fill in multi-floor fields for saves that predate storeys. */
const withFloors = (snap: MaybeFloored): DesignSnapshot => {
  if (snap.floors && snap.floors.length && snap.activeFloorId && snap.floorGeom?.[snap.activeFloorId]) {
    const active = snap.floorGeom[snap.activeFloorId];
    // Trust the stored floors; make the top-level mirror the active storey.
    return {
      ...snap,
      ...active,
      projectName: snap.projectName,
      floors: snap.floors,
      floorGeom: snap.floorGeom,
      activeFloorId: snap.activeFloorId,
    };
  }
  const id = uid();
  return {
    ...snap,
    floors: [{ id, name: 'Ground floor', elevation: 0 }],
    floorGeom: { [id]: { walls: snap.walls, rooms: snap.rooms, furniture: snap.furniture, openings: snap.openings, background: snap.background } },
    activeFloorId: id,
  };
};

const loadInitial = (): DesignSnapshot => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return withFloors({ ...emptySnapshot(), ...JSON.parse(raw) });
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
      projectName: prev.projectName,
      floors: prev.floors,
      floorGeom: prev.floorGeom,
      activeFloorId: prev.activeFloorId,
    };
    mutate(next);
    // Keep the active floor's stored geometry in sync with the top-level mirror
    // so every storey stays current for saving, undo and 3D stacking.
    next.floorGeom = { ...next.floorGeom, [next.activeFloorId]: geomOf(next) };
    persist(next);
    set((s) => ({
      ...next,
      _past: [...s._past, prev].slice(-100),
      _future: [],
      savedTick: s.savedTick + 1,
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
    showDimensions: true,
    dollhouse: true,
    walkMode: false,
    defaultWallHeight: 270,
    defaultWallThickness: 12,
    pendingFurnitureType: null,
    fitRequest: 0,
    selectedIds: [],
    savedTick: 0,
    units: loadSettings().units,
    _past: [],
    _future: [],

    setTool: (t) =>
      set({ tool: t, pendingFurnitureType: t === 'furniture' ? get().pendingFurnitureType : null }),
    setView: (v) => set({ view: v }),
    setZoom: (z) => set({ zoom: Math.max(0.05, Math.min(4, z)) }),
    setPan: (p) => set({ pan: p }),
    setShowGrid: (b) => set({ showGrid: b }),
    setShowDimensions: (b) => set({ showDimensions: b }),
    setUnits: (u) => {
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ units: u }));
      } catch {
        /* storage may be full / unavailable */
      }
      set({ units: u });
    },
    setDollhouse: (b) => set({ dollhouse: b }),
    setWalkMode: (b) => set({ walkMode: b }),
    requestFit: () => set((st) => ({ fitRequest: st.fitRequest + 1 })),
    select: (sel) =>
      set({ selection: sel, selectedIds: sel.kind === 'furniture' && sel.id ? [sel.id] : [] }),
    clearSelection: () => set({ selection: { kind: null, id: null }, selectedIds: [] }),
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
          color: '#ece6db',
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
      const w = get().walls.find((x) => x.id === wallId);
      const wallLen = w ? Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y) : Infinity;
      const defW = entry?.width ?? (type === 'door' ? 90 : 120);
      const width = Math.min(defW, Math.max(20, wallLen * 0.9)); // never wider than the wall
      commit((d) => {
        d.openings.push({
          id,
          wallId,
          type,
          offset,
          width,
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
      const { selection, selectedIds, deleteById } = get();
      if (selectedIds.length > 1) {
        const ids = new Set(selectedIds);
        commit((d) => {
          d.furniture = d.furniture.filter((f) => !ids.has(f.id));
        });
        set({ selection: { kind: null, id: null }, selectedIds: [] });
        return;
      }
      deleteById(selection.kind, selection.id);
    },

    setSelectedIds: (ids) =>
      set({
        selectedIds: ids,
        selection: ids.length ? { kind: 'furniture', id: ids[ids.length - 1] } : { kind: null, id: null },
      }),

    toggleSelected: (id) => {
      const cur = get().selectedIds;
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      set({
        selectedIds: next,
        selection: next.length ? { kind: 'furniture', id: next[next.length - 1] } : { kind: null, id: null },
      });
    },

    moveFurnitureGroup: (ids, dx, dy) => {
      const set2 = new Set(ids);
      commit((d) => {
        d.furniture = d.furniture.map((f) =>
          set2.has(f.id) ? { ...f, position: { x: f.position.x + dx, y: f.position.y + dy } } : f,
        );
      });
    },

    duplicateSelection: () => {
      const { selection, selectedIds, furniture, walls, openings } = get();
      const ids = selectedIds.length ? selectedIds : selection.kind === 'furniture' && selection.id ? [selection.id] : [];
      if (ids.length) {
        const newIds: string[] = [];
        commit((d) => {
          for (const id of ids) {
            const f = furniture.find((x) => x.id === id);
            if (!f) continue;
            const nid = uid();
            newIds.push(nid);
            d.furniture.push({ ...f, id: nid, position: { x: f.position.x + 30, y: f.position.y + 30 } });
          }
        });
        if (newIds.length) set({ selectedIds: newIds, selection: { kind: 'furniture', id: newIds[newIds.length - 1] } });
        return;
      }
      if (selection.kind === 'wall' && selection.id) {
        const w = walls.find((x) => x.id === selection.id);
        if (w) {
          const nid = uid();
          commit((d) => d.walls.push({ ...w, id: nid, start: { x: w.start.x + 30, y: w.start.y + 30 }, end: { x: w.end.x + 30, y: w.end.y + 30 } }));
          set({ selection: { kind: 'wall', id: nid }, selectedIds: [] });
        }
      } else if (selection.kind === 'opening' && selection.id) {
        const o = openings.find((x) => x.id === selection.id);
        if (o) {
          const nid = uid();
          commit((d) => d.openings.push({ ...o, id: nid, offset: o.offset + o.width }));
          set({ selection: { kind: 'opening', id: nid }, selectedIds: [] });
        }
      }
    },

    copySelection: () => {
      const { selection, selectedIds, furniture } = get();
      const ids = selectedIds.length ? selectedIds : selection.kind === 'furniture' && selection.id ? [selection.id] : [];
      clipboard = furniture.filter((f) => ids.includes(f.id)).map((f) => ({ ...f }));
    },

    paste: () => {
      if (clipboard.length === 0) return;
      const newIds: string[] = [];
      commit((d) => {
        for (const f of clipboard) {
          const nid = uid();
          newIds.push(nid);
          d.furniture.push({ ...f, id: nid, position: { x: f.position.x + 40, y: f.position.y + 40 } });
        }
      });
      set({ selectedIds: newIds, selection: { kind: 'furniture', id: newIds[newIds.length - 1] } });
    },

    bringToFront: (id) =>
      commit((d) => {
        const i = d.furniture.findIndex((f) => f.id === id);
        if (i >= 0) d.furniture.push(d.furniture.splice(i, 1)[0]);
      }),

    sendToBack: (id) =>
      commit((d) => {
        const i = d.furniture.findIndex((f) => f.id === id);
        if (i >= 0) d.furniture.unshift(d.furniture.splice(i, 1)[0]);
      }),

    setProjectName: (name) => {
      const s = get();
      const snap = { ...snapshotOf(s), projectName: name || 'Untitled home' };
      persist(snap);
      set({ projectName: snap.projectName, savedTick: s.savedTick + 1 });
    },

    scaleDesign: (factor) => {
      if (!(factor > 0) || Math.abs(factor - 1) < 1e-6) return;
      const f = factor;
      const sp = (p: Point): Point => ({ x: p.x * f, y: p.y * f });
      const scaleGeom = (g: FloorGeom): FloorGeom => ({
        // Horizontal plan scales; vertical sizes (wall height, opening height,
        // sill, furniture dimensions) are real-world values and stay put.
        walls: g.walls.map((w) => ({ ...w, start: sp(w.start), end: sp(w.end), thickness: w.thickness * f })),
        rooms: g.rooms.map((r) => ({ ...r, points: r.points.map(sp) })),
        furniture: g.furniture.map((fi) => ({ ...fi, position: sp(fi.position) })),
        openings: g.openings.map((o) => ({ ...o, offset: o.offset * f, width: o.width * f })),
        background: g.background
          ? { ...g.background, x: g.background.x * f, y: g.background.y * f, scale: g.background.scale * f }
          : null,
      });
      commit((d) => {
        const next: Record<string, FloorGeom> = {};
        for (const id in d.floorGeom) next[id] = scaleGeom(d.floorGeom[id]);
        d.floorGeom = next;
        const a = next[d.activeFloorId];
        d.walls = a.walls;
        d.rooms = a.rooms;
        d.furniture = a.furniture;
        d.openings = a.openings;
        d.background = a.background;
      });
      set((s) => ({ selection: { kind: null, id: null }, selectedIds: [], fitRequest: s.fitRequest + 1 }));
    },

    // ---- storeys (multi-floor) ----
    setActiveFloor: (id) => {
      const st = get();
      if (id === st.activeFloorId || !st.floorGeom[id]) return;
      // The active floor's geometry is always synced into floorGeom by commit,
      // so we can just load the target floor into the top-level mirror.
      const g = st.floorGeom[id];
      const next: DesignSnapshot = { ...snapshotOf(st), ...g, activeFloorId: id };
      persist(next);
      set((s) => ({
        ...next,
        selection: { kind: null, id: null },
        selectedIds: [],
        fitRequest: s.fitRequest + 1,
      }));
    },

    addFloor: () => {
      const id = uid();
      const top = Math.max(...get().floors.map((f) => f.elevation), 0);
      const name = `Floor ${get().floors.length}`;
      // Adding a floor also switches to it (empty top-level mirror).
      commit((d) => {
        d.floors = [...d.floors, { id, name, elevation: top + STOREY_HEIGHT }];
        d.floorGeom = { ...d.floorGeom, [id]: emptyGeom() };
        d.activeFloorId = id;
        d.walls = [];
        d.rooms = [];
        d.furniture = [];
        d.openings = [];
        d.background = null;
      });
      set({ selection: { kind: null, id: null }, selectedIds: [] });
    },

    removeFloor: (id) => {
      const st = get();
      if (st.floors.length <= 1) return; // always keep at least one storey
      const remaining = st.floors.filter((f) => f.id !== id);
      const fallback = remaining[0].id;
      const becomesActive = st.activeFloorId === id ? fallback : st.activeFloorId;
      commit((d) => {
        d.floors = remaining;
        const geom = { ...d.floorGeom };
        delete geom[id];
        d.floorGeom = geom;
        d.activeFloorId = becomesActive;
        const g = geom[becomesActive];
        d.walls = g.walls;
        d.rooms = g.rooms;
        d.furniture = g.furniture;
        d.openings = g.openings;
        d.background = g.background;
      });
      set({ selection: { kind: null, id: null }, selectedIds: [], fitRequest: get().fitRequest + 1 });
    },

    renameFloor: (id, name) =>
      commit((d) => {
        d.floors = d.floors.map((f) => (f.id === id ? { ...f, name: name || f.name } : f));
      }),

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
        if (!d.background) return;
        const clean = { ...patch };
        if (clean.scale !== undefined && !(clean.scale > 0 && clean.scale < 1000)) delete clean.scale;
        if (clean.opacity !== undefined) clean.opacity = Math.max(0.05, Math.min(1, clean.opacity));
        d.background = { ...d.background, ...clean };
      }),

    newProject: () => {
      const empty = emptySnapshot();
      persist(empty);
      set({
        ...empty,
        selection: { kind: null, id: null },
        selectedIds: [],
        _past: [],
        _future: [],
      });
    },

    loadSample: () => {
      const snap = withFloors(sampleProject());
      persist(snap);
      set((st) => ({
        ...snap,
        selection: { kind: null, id: null },
        selectedIds: [],
        _past: [],
        _future: [],
        view: '2d',
        fitRequest: st.fitRequest + 1,
      }));
    },

    loadSnapshot: (snap) => {
      // Tolerate older saves that predate some fields, and lift to multi-floor.
      const full = withFloors({
        walls: snap.walls ?? [],
        rooms: snap.rooms ?? [],
        furniture: snap.furniture ?? [],
        openings: snap.openings ?? [],
        background: snap.background ?? null,
        projectName: snap.projectName ?? 'Imported home',
        floors: snap.floors,
        floorGeom: snap.floorGeom,
        activeFloorId: snap.activeFloorId,
      });
      persist(full);
      set((st) => ({
        ...full,
        selection: { kind: null, id: null },
        selectedIds: [],
        _past: [],
        _future: [],
        fitRequest: st.fitRequest + 1,
      }));
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
