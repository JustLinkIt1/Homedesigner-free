import { create } from 'zustand';
import type {
  BackgroundPlan,
  CustomTexture,
  FloorGeom,
  FloorInfo,
  FurnitureItem,
  Opening,
  Point,
  Roof,
  Room,
  Selection,
  ToolMode,
  ViewMode,
  Wall,
  WallFaceRange,
} from '../types';
import { uid, dist } from '../lib/geometry';
import { exteriorFaces } from '../lib/exteriorFaces';
import { withFaceFinish } from '../lib/wallFaces';
import { CATALOG_BY_TYPE, DEFAULT_WALL_THICKNESS } from '../data/furnitureCatalog';
import { kitchenRunUnits, kitchenUpperUnits } from '../lib/kitchenRun';
import { splitPolygonBySegment } from '../lib/roomSplit';
import { ROOM_STYLE_BY_ID } from '../data/roomStyles';
import { detectRooms, roomMatches } from '../lib/roomDetection';
import { DEFAULT_ROOF, normalizeRoofs, roofFloorId, roofOf } from '../lib/roof';
import { SAMPLE_BY_ID, SAMPLES } from '../data/samples';
import { toast } from '../lib/ui';
import { t } from '../lib/i18n';
import * as haptics from '../lib/haptics';
import { recordRecent } from '../lib/recent';
import { useProStore } from './proStore';
import * as projects from '../lib/projects';
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
  /** Lock objects: selection still works but nothing can be dragged/moved, so
   *  the view can be navigated without accidentally shifting furniture. */
  moveLock: boolean;
  sunTime: number; // 3D: time of day 0..24 driving sun angle/colour (renders)
  lightsOn: boolean; // 3D: artificial (lamp/LED) fixtures emit light
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
  setViewport: (p: Point, z: number) => void;
  setShowGrid: (b: boolean) => void;
  setShowDimensions: (b: boolean) => void;
  setUnits: (u: Units) => void;
  setDollhouse: (b: boolean) => void;
  setWalkMode: (b: boolean) => void;
  setMoveLock: (b: boolean) => void;
  setSunTime: (t: number) => void;
  setLightsOn: (b: boolean) => void;
  requestFit: () => void;
  select: (sel: Selection) => void;
  clearSelection: () => void;
  setPendingFurniture: (type: string | null) => void;

  addWall: (start: Point, end: Point) => string;
  updateWall: (id: string, patch: Partial<Wall>) => void;
  addRoom: (points: Point[]) => string;
  updateRoom: (id: string, patch: Partial<Room>) => void;
  addFurniture: (type: string, position: Point) => string;
  /** Whether the kitchen-run tool also tiles wall cabinets above the base run. */
  kitchenUppers: boolean;
  setKitchenUppers: (v: boolean) => void;
  /** Tile a run of base cabinets from a→b (the kitchen-run tool). One undo step.
   *  Adds wall cabinets above when `kitchenUppers` is on. */
  addKitchenRun: (a: Point, b: Point) => void;
  /** Change a placed item's type in place (kitchen slot swaps: cabinet↔appliance),
   *  keeping its slot footprint, position and facing so the run stays aligned. */
  swapFurnitureType: (id: string, newType: string) => void;
  updateFurniture: (id: string, patch: Partial<FurnitureItem>) => void;
  /** `type` is a catalog key (door, double_door, sliding_door, window, french_window…). */
  addOpening: (wallId: string, offset: number, type: string) => string;
  updateOpening: (id: string, patch: Partial<Opening>) => void;
  deleteSelected: () => void;
  deleteById: (kind: Selection['kind'], id: string | null) => void;

  // multi-select + clipboard + arrange
  setSelectedIds: (ids: string[]) => void;
  toggleSelected: (id: string) => void;
  moveFurnitureGroup: (ids: string[], dx: number, dy: number) => void;
  alignSelected: (edge: 'left' | 'hcenter' | 'right' | 'top' | 'vmiddle' | 'bottom') => void;
  distributeSelected: (axis: 'h' | 'v') => void;
  /** Apply a coordinated style (wall paint + flooring) to one room or 'all'. */
  applyRoomStyle: (roomId: string | 'all', styleId: string) => void;
  /** Finish every outward-facing wall face at once (exterior cladding). */
  applyExteriorFinish: (color: string, texture?: CustomTexture) => number;
  duplicateSelection: () => void;
  copySelection: () => void;
  paste: (at?: Point) => void;
  bringToFront: (id: string) => void;
  sendToBack: (id: string) => void;
  setProjectName: (name: string) => void;

  /** Uniformly scale the whole drawing's plan geometry (for calibration). */
  scaleDesign: (factor: number) => void;
  /** Move every wall endpoint at `from` to `to` (a shared corner moves together). */
  moveCorner: (from: Point, to: Point, tol?: number) => void;

  // multi-floor (storeys)
  setActiveFloor: (id: string) => void;
  addFloor: () => void;
  cloneFloor: (direction: 'above' | 'below') => void;
  removeFloor: (id: string) => void;
  renameFloor: (id: string, name: string) => void;
  /** Add/adjust the roof (patch merges onto the current or default roof), or
   *  pass null to remove it. Always applies to the top storey. */
  setRoof: (patch: Partial<Roof> | null) => void;

  importWalls: (walls: Wall[], replace?: boolean) => void;
  detectRoomsFromWalls: () => number;
  setBackground: (bg: BackgroundPlan | null) => void;
  updateBackground: (patch: Partial<BackgroundPlan>) => void;

  newProject: () => void;
  loadSample: (sampleId?: string) => void;
  loadSnapshot: (s: MaybeFloored) => void;

  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

const SETTINGS_KEY = 'homedesigner.settings.v1';

/** Load persisted display settings (units, lighting) from their own key — kept
 *  out of the undo snapshot so changing them never pollutes history. */
const loadSettings = (): { units: Units; sunTime: number; lightsOn: boolean } => {
  const def = { units: 'metric' as Units, sunTime: 13, lightsOn: true };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      return {
        units: s.units === 'imperial' ? 'imperial' : 'metric',
        sunTime: typeof s.sunTime === 'number' ? Math.min(24, Math.max(0, s.sunTime)) : def.sunTime,
        lightsOn: typeof s.lightsOn === 'boolean' ? s.lightsOn : def.lightsOn,
      };
    }
  } catch {
    /* ignore corrupt storage */
  }
  return def;
};

/** Merge-write a settings patch so each setter keeps the others' values. */
const persistSettings = (patch: Partial<{ units: Units; sunTime: number; lightsOn: boolean }>) => {
  try {
    const cur = loadSettings();
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...cur, ...patch }));
  } catch {
    /* storage may be full / unavailable */
  }
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

/** Migrate legacy openings whose offset was an absolute cm value (> 1) to the
 *  new 0..1 fraction along their wall. New saves are already fractions. */
const fixOpenings = (g: FloorGeom): FloorGeom => {
  if (!g.openings.some((o) => o.offset > 1)) return g;
  return {
    ...g,
    openings: g.openings.map((o) => {
      if (o.offset <= 1) return o;
      const w = g.walls.find((x) => x.id === o.wallId);
      const len = w ? Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y) : 0;
      return len > 0 ? { ...o, offset: Math.max(0, Math.min(1, o.offset / len)) } : o;
    }),
  };
};

/** Fill in multi-floor fields for saves that predate storeys + fix openings. */
const withFloors = (snap: MaybeFloored): DesignSnapshot => {
  let result: DesignSnapshot;
  if (snap.floors && snap.floors.length && snap.activeFloorId && snap.floorGeom?.[snap.activeFloorId]) {
    const active = snap.floorGeom[snap.activeFloorId];
    // Trust the stored floors; make the top-level mirror the active storey.
    result = {
      ...snap,
      ...active,
      projectName: snap.projectName,
      floors: snap.floors,
      floorGeom: snap.floorGeom,
      activeFloorId: snap.activeFloorId,
    };
  } else {
    const id = uid();
    result = {
      ...snap,
      floors: [{ id, name: 'Ground floor', elevation: 0 }],
      floorGeom: { [id]: { walls: snap.walls, rooms: snap.rooms, furniture: snap.furniture, openings: snap.openings, background: snap.background } },
      activeFloorId: id,
    };
  }
  const floorGeom: Record<string, FloorGeom> = {};
  for (const fid in result.floorGeom) floorGeom[fid] = fixOpenings(result.floorGeom[fid]);
  const active = floorGeom[result.activeFloorId];
  return {
    ...result,
    floors: normalizeRoofs(result.floors),
    floorGeom,
    openings: active ? active.openings : result.openings,
  };
};

const loadInitial = (): DesignSnapshot => {
  try {
    const raw = projects.loadActive();
    if (raw) return withFloors({ ...emptySnapshot(), ...(raw as Partial<DesignSnapshot>) });
  } catch {
    /* ignore corrupt storage */
  }
  return emptySnapshot();
};

// Autosave failures used to be swallowed silently — a full/blocked storage
// meant quietly losing work. Warn the user (throttled: persist runs on every
// edit, one toast per minute is plenty).
let lastPersistWarning = 0;
const writeSnap = (snap: DesignSnapshot, id?: string) => {
  const ok = projects.saveActive(snap, id);
  if (!ok) {
    const now = Date.now();
    if (now - lastPersistWarning > 60_000) {
      lastPersistWarning = now;
      toast.error("Couldn't autosave — device storage is full. Export your project to keep a copy.");
    }
  }
};

// Coalesce autosaves. Writing the whole project JSON to localStorage
// synchronously on every edit commit stalled the Android WebView main thread
// during furniture drags / rapid edits. Debounce to the trailing edge, bind each
// queued write to the project it was captured for, and flush on background/close
// so nothing is ever lost.
let pendingPersist: { snap: DesignSnapshot; id: string } | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
const flushPersist = () => {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  if (!pendingPersist) return;
  const { snap, id } = pendingPersist;
  pendingPersist = null;
  writeSnap(snap, id);
};
const persist = (snap: DesignSnapshot) => {
  const id = projects.getActiveId();
  if (!id) {
    // First save ever mints the project — do it now so it exists immediately.
    writeSnap(snap);
    return;
  }
  // Queuing a different project than the one already pending? Write that one out
  // first so its edits can't be lost or land under the new id.
  if (pendingPersist && pendingPersist.id !== id) flushPersist();
  pendingPersist = { snap, id };
  if (!persistTimer) persistTimer = setTimeout(flushPersist, 600);
};
if (typeof window !== 'undefined') {
  const flush = () => flushPersist();
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
}

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
    // The roof belongs to the building, so it re-homes itself onto whatever
    // storey is now the top one (adding/removing floors must not bury it).
    next.floors = normalizeRoofs(next.floors);
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
    moveLock: false,
    defaultWallHeight: 270,
    defaultWallThickness: DEFAULT_WALL_THICKNESS,
    pendingFurnitureType: null,
    fitRequest: 0,
    selectedIds: [],
    savedTick: 0,
    units: loadSettings().units,
    sunTime: loadSettings().sunTime,
    lightsOn: loadSettings().lightsOn,
    _past: [],
    _future: [],

    setTool: (t) =>
      set({ tool: t, pendingFurnitureType: t === 'furniture' ? get().pendingFurnitureType : null }),
    setView: (v) => set({ view: v }),
    setZoom: (z) => set({ zoom: Math.max(0.05, Math.min(4, z)) }),
    setPan: (p) => set({ pan: p }),
    setViewport: (p, z) => set({ pan: p, zoom: Math.max(0.05, Math.min(4, z)) }),
    setShowGrid: (b) => set({ showGrid: b }),
    setShowDimensions: (b) => set({ showDimensions: b }),
    setUnits: (u) => {
      persistSettings({ units: u });
      set({ units: u });
    },
    setDollhouse: (b) => set({ dollhouse: b }),
    setWalkMode: (b) => set({ walkMode: b }),
    setMoveLock: (b) => set({ moveLock: b }),
    setSunTime: (t) => {
      const v = Math.min(24, Math.max(0, t));
      persistSettings({ sunTime: v });
      set({ sunTime: v });
    },
    setLightsOn: (b) => {
      persistSettings({ lightsOn: b });
      set({ lightsOn: b });
    },
    requestFit: () => set((st) => ({ fitRequest: st.fitRequest + 1 })),
    select: (sel) =>
      set({ selection: sel, selectedIds: sel.kind === 'furniture' && sel.id ? [sel.id] : [] }),
    clearSelection: () => set({ selection: { kind: null, id: null }, selectedIds: [] }),
    setPendingFurniture: (type) => {
      // Feed the catalog's "Recent" row — furniture only, never openings
      // (doors/windows arm from the dock flyout and would pollute the row).
      if (type && CATALOG_BY_TYPE[type] && !CATALOG_BY_TYPE[type].opening) recordRecent(type);
      set({ pendingFurnitureType: type, tool: type ? 'furniture' : get().tool });
    },

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
        // A wall drawn across a room subdivides it: split the polygon so the
        // flooring stays bounded by the walls the user sees (each half keeps
        // the original finish; the smaller half becomes its own room).
        for (const room of [...d.rooms]) {
          const halves = splitPolygonBySegment(room.points, start, end);
          if (!halves) continue;
          const i = d.rooms.findIndex((r) => r.id === room.id);
          if (i < 0) continue;
          d.rooms[i] = { ...room, points: halves[0] };
          d.rooms.push({ ...room, id: uid(), name: 'Room', points: halves[1] });
        }
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
      haptics.tapLight();
      return id;
    },

    kitchenUppers: true,
    setKitchenUppers: (v) => set({ kitchenUppers: v }),

    addKitchenRun: (a, b) => {
      // Uppers are a Pro catalog item (wall_cabinet) — free runs place bases only.
      const withUppers = get().kitchenUppers && useProStore.getState().isPro;
      commit((d) => {
        const push = (type: string, u: { position: Point; rotation: number }) => {
          const entry = CATALOG_BY_TYPE[type];
          if (!entry) return;
          d.furniture.push({
            id: uid(),
            type,
            name: entry.name,
            position: u.position,
            rotation: u.rotation,
            width: entry.width,
            depth: entry.depth,
            height: entry.height,
            color: entry.color,
          });
        };
        for (const u of kitchenRunUnits(a, b, d.rooms, d.walls)) push('kitchen_base_cabinet', u);
        if (withUppers) for (const u of kitchenUpperUnits(a, b, d.rooms, d.walls)) push('wall_cabinet', u);
      });
    },

    swapFurnitureType: (id, newType) =>
      commit((d) => {
        const i = d.furniture.findIndex((f) => f.id === id);
        if (i < 0) return;
        const entry = CATALOG_BY_TYPE[newType];
        if (!entry) return;
        // Keep the slot footprint (width/depth), position, rotation so a run
        // stays aligned; take name/height/colour from the new type.
        d.furniture[i] = {
          ...d.furniture[i],
          type: newType,
          name: entry.name,
          height: entry.height,
          color: entry.color,
        };
      }),

    updateFurniture: (id, patch) =>
      commit((d) => {
        const i = d.furniture.findIndex((f) => f.id === id);
        if (i >= 0) d.furniture[i] = { ...d.furniture[i], ...patch };
      }),

    addOpening: (wallId, offset, type) => {
      const id = uid();
      const entry = CATALOG_BY_TYPE[type];
      // `type` is a catalog key (door, double_door, french_window, …) whose
      // `opening` block gives the stored kind/style/sill.
      const def = entry?.opening ?? { kind: type as 'door' | 'window', style: undefined, sill: type === 'door' ? 0 : 90 };
      const w = get().walls.find((x) => x.id === wallId);
      const wallLen = w ? Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y) : Infinity;
      const defW = entry?.width ?? (def.kind === 'door' ? 90 : 120);
      const width = Math.min(defW, Math.max(20, wallLen * 0.9)); // never wider than the wall
      // `offset` is a 0..1 fraction of the wall length; clamp so the opening fits.
      const halfFrac = wallLen > 0 && isFinite(wallLen) ? width / 2 / wallLen : 0.1;
      const off = Math.max(halfFrac, Math.min(1 - halfFrac, offset));
      commit((d) => {
        d.openings.push({
          id,
          wallId,
          type: def.kind,
          style: def.style,
          offset: off,
          width,
          height: entry?.height ?? (def.kind === 'door' ? 205 : 120),
          sill: def.sill,
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
      // Offer a one-tap Undo on every delete — the commit-based history means
      // undo() reverts exactly this deletion.
      const undoable = (label: string) => {
        haptics.notify('warning');
        toast.action(label, { label: t('Undo'), onClick: () => get().undo() });
      };
      if (selectedIds.length > 1) {
        const ids = new Set(selectedIds);
        const count = ids.size;
        commit((d) => {
          d.furniture = d.furniture.filter((f) => !ids.has(f.id));
        });
        set({ selection: { kind: null, id: null }, selectedIds: [] });
        undoable(`${t('Deleted')} ${count}`);
        return;
      }
      if (!selection.kind || !selection.id) return;
      deleteById(selection.kind, selection.id);
      undoable(t('Deleted'));
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

    // Align the selected furniture to a shared edge/centre of their combined
    // bounding box. Positions are centres; width/depth are footprints.
    alignSelected: (edge) => {
      const { selectedIds, furniture } = get();
      const sel = furniture.filter((f) => selectedIds.includes(f.id));
      if (sel.length < 2) return;
      const left = Math.min(...sel.map((f) => f.position.x - f.width / 2));
      const right = Math.max(...sel.map((f) => f.position.x + f.width / 2));
      const top = Math.min(...sel.map((f) => f.position.y - f.depth / 2));
      const bottom = Math.max(...sel.map((f) => f.position.y + f.depth / 2));
      const cx = (left + right) / 2;
      const cy = (top + bottom) / 2;
      const nx = (f: FurnitureItem): number => {
        if (edge === 'left') return left + f.width / 2;
        if (edge === 'right') return right - f.width / 2;
        if (edge === 'hcenter') return cx;
        return f.position.x;
      };
      const ny = (f: FurnitureItem): number => {
        if (edge === 'top') return top + f.depth / 2;
        if (edge === 'bottom') return bottom - f.depth / 2;
        if (edge === 'vmiddle') return cy;
        return f.position.y;
      };
      const ids = new Set(selectedIds);
      commit((d) => {
        d.furniture = d.furniture.map((f) =>
          ids.has(f.id) ? { ...f, position: { x: nx(f), y: ny(f) } } : f,
        );
      });
    },

    // Even out spacing between the selected items along one axis, keeping the
    // two extreme items fixed and distributing centres evenly between them.
    distributeSelected: (axis) => {
      const { selectedIds, furniture } = get();
      const sel = furniture.filter((f) => selectedIds.includes(f.id));
      if (sel.length < 3) return;
      const key = axis === 'h' ? 'x' : 'y';
      const sorted = [...sel].sort((a, b) => a.position[key] - b.position[key]);
      const first = sorted[0].position[key];
      const last = sorted[sorted.length - 1].position[key];
      const step = (last - first) / (sorted.length - 1);
      const target = new Map<string, number>();
      sorted.forEach((f, i) => target.set(f.id, first + step * i));
      commit((d) => {
        d.furniture = d.furniture.map((f) => {
          if (!target.has(f.id)) return f;
          const v = target.get(f.id)!;
          return { ...f, position: axis === 'h' ? { ...f.position, x: v } : { ...f.position, y: v } };
        });
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
          commit((d) => d.openings.push({ ...o, id: nid, offset: Math.min(0.95, o.offset + 0.12) }));
          set({ selection: { kind: 'opening', id: nid }, selectedIds: [] });
        }
      }
    },

    copySelection: () => {
      const { selection, selectedIds, furniture } = get();
      const ids = selectedIds.length ? selectedIds : selection.kind === 'furniture' && selection.id ? [selection.id] : [];
      clipboard = furniture.filter((f) => ids.includes(f.id)).map((f) => ({ ...f }));
    },

    paste: (at) => {
      if (clipboard.length === 0) return;
      // Paste at the cursor when a target is given (group centre lands there,
      // preserving relative layout); otherwise nudge by the classic +40 offset.
      const cx = clipboard.reduce((a, f) => a + f.position.x, 0) / clipboard.length;
      const cy = clipboard.reduce((a, f) => a + f.position.y, 0) / clipboard.length;
      const dx = at ? at.x - cx : 40;
      const dy = at ? at.y - cy : 40;
      const newIds: string[] = [];
      commit((d) => {
        for (const f of clipboard) {
          const nid = uid();
          newIds.push(nid);
          d.furniture.push({ ...f, id: nid, position: { x: f.position.x + dx, y: f.position.y + dy } });
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
        // offset is a 0..1 fraction (scale-invariant); only the width scales.
        openings: g.openings.map((o) => ({ ...o, width: o.width * f })),
        background: g.background
          ? { ...g.background, x: g.background.x * f, y: g.background.y * f, scale: g.background.scale * f }
          : null,
      });
      commit((d) => {
        const next: Record<string, FloorGeom> = {};
        for (const id in d.floorGeom) next[id] = scaleGeom(d.floorGeom[id]);
        d.floorGeom = next;
        // Overhang is a plan-space distance like wall thickness; the deck
        // thickness is a real-world vertical size and stays put.
        d.floors = d.floors.map((fl) =>
          fl.roof ? { ...fl, roof: { ...fl.roof, overhang: fl.roof.overhang * f } } : fl,
        );
        const a = next[d.activeFloorId];
        d.walls = a.walls;
        d.rooms = a.rooms;
        d.furniture = a.furniture;
        d.openings = a.openings;
        d.background = a.background;
      });
      set((s) => ({ selection: { kind: null, id: null }, selectedIds: [], fitRequest: s.fitRequest + 1 }));
    },

    moveCorner: (from, to, tol = 4) =>
      commit((d) => {
        d.walls = d.walls.map((w) => {
          const ns = dist(w.start, from) <= tol ? { x: to.x, y: to.y } : w.start;
          const ne = dist(w.end, from) <= tol ? { x: to.x, y: to.y } : w.end;
          return ns === w.start && ne === w.end ? w : { ...w, start: ns, end: ne };
        });
      }),

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

    applyRoomStyle: (roomId, styleId) => {
      const style = ROOM_STYLE_BY_ID[styleId];
      if (!style) return;
      const { rooms, walls } = get();
      // A wall borders a room when a meaningful stretch of it runs along the
      // room polygon's boundary. Endpoint tests fail for shared perimeter
      // walls that extend past the room, so measure the colinear OVERLAP
      // between the wall and each polygon edge instead.
      const boundaryOverlap = (w: Wall, pts: Point[], tol: number): number => {
        let total = 0;
        for (let i = 0; i < pts.length; i++) {
          const a = pts[i];
          const b = pts[(i + 1) % pts.length];
          const ex = b.x - a.x;
          const ey = b.y - a.y;
          const len = Math.hypot(ex, ey);
          if (len < 1e-6) continue;
          // Perpendicular distance of both wall endpoints from the edge LINE.
          const dLine = (p: Point) => Math.abs(ex * (p.y - a.y) - ey * (p.x - a.x)) / len;
          if (dLine(w.start) > tol || dLine(w.end) > tol) continue;
          // Colinear: measure 1D overlap of the wall span with the edge span.
          const t = (p: Point) => (ex * (p.x - a.x) + ey * (p.y - a.y)) / len;
          const lo = Math.min(t(w.start), t(w.end));
          const hi = Math.max(t(w.start), t(w.end));
          total += Math.max(0, Math.min(hi, len) - Math.max(lo, 0));
        }
        return total;
      };
      const targets = roomId === 'all' ? rooms : rooms.filter((r) => r.id === roomId);
      if (targets.length === 0) return;
      const wallIds = new Set<string>();
      if (roomId === 'all') {
        for (const w of walls) wallIds.add(w.id);
      } else {
        for (const r of targets) {
          for (const w of walls) {
            const tol = w.thickness / 2 + 8;
            if (boundaryOverlap(w, r.points, tol) >= 40) wallIds.add(w.id);
          }
        }
      }
      const roomIds = new Set(targets.map((r) => r.id));
      commit((d) => {
        d.rooms = d.rooms.map((r) =>
          roomIds.has(r.id)
            ? { ...r, floorMaterial: style.floorMaterial, color: style.roomFill, texture: undefined }
            : r,
        );
        d.walls = d.walls.map((w) =>
          wallIds.has(w.id)
            ? { ...w, color: style.wallColor, texture: undefined, faceFinishes: undefined }
            : w,
        );
      });
      haptics.tapLight();
    },

    applyExteriorFinish: (color, texture) => {
      const { walls, rooms } = get();
      const faces = exteriorFaces(walls, rooms);
      if (!faces.length) return 0;
      // Group by wall so a wall exterior on both sides is finished in one pass
      // (withFaceFinish returns a new list each call, so it must be chained).
      const byWall = new Map<string, WallFaceRange[]>();
      for (const f of faces) {
        const arr = byWall.get(f.wallId) ?? [];
        arr.push(f.face);
        byWall.set(f.wallId, arr);
      }
      commit((d) => {
        d.walls = d.walls.map((w) => {
          const ranges = byWall.get(w.id);
          if (!ranges) return w;
          let next = w;
          for (const face of ranges) {
            next = { ...next, faceFinishes: withFaceFinish(next, face, { color, texture }) };
          }
          return next;
        });
      });
      haptics.tapLight();
      return faces.length;
    },

    // Copy the active storey's shell (walls, their openings and rooms) onto a
    // new storey stacked directly above or below, so levels line up into a real
    // multi-storey house. Furniture is left off — the copy is a blank canvas to
    // furnish. Every id is regenerated and opening.wallId is remapped so the
    // clone is fully independent of the source floor.
    cloneFloor: (direction) => {
      const st = get();
      const src = st.floorGeom[st.activeFloorId] ?? geomOf(st);
      const wallIdMap = new Map<string, string>();
      const walls = src.walls.map((w) => {
        const nid = uid();
        wallIdMap.set(w.id, nid);
        return { ...w, id: nid };
      });
      const openings = src.openings.map((o) => ({
        ...o,
        id: uid(),
        wallId: wallIdMap.get(o.wallId) ?? o.wallId,
      }));
      const rooms = src.rooms.map((r) => ({
        ...r,
        id: uid(),
        points: r.points.map((p) => ({ ...p })),
      }));
      const clone: FloorGeom = { walls, rooms, furniture: [], openings, background: null };

      const id = uid();
      const elevations = st.floors.map((f) => f.elevation);
      const elevation =
        direction === 'above'
          ? Math.max(...elevations, 0) + STOREY_HEIGHT
          : Math.min(...elevations, 0) - STOREY_HEIGHT;
      const srcName = st.floors.find((f) => f.id === st.activeFloorId)?.name ?? 'Floor';
      const name = `${srcName} copy`;

      commit((d) => {
        d.floors = [...d.floors, { id, name, elevation }];
        d.floorGeom = { ...d.floorGeom, [id]: clone };
        d.activeFloorId = id;
        d.walls = clone.walls;
        d.rooms = clone.rooms;
        d.furniture = clone.furniture;
        d.openings = clone.openings;
        d.background = clone.background;
      });
      set((s) => ({ selection: { kind: null, id: null }, selectedIds: [], fitRequest: s.fitRequest + 1 }));
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

    setRoof: (patch) =>
      commit((d) => {
        const topId = roofFloorId(d.floors);
        if (!topId) return;
        const next = patch === null ? undefined : { ...DEFAULT_ROOF, ...roofOf(d.floors), ...patch };
        d.floors = d.floors.map((f) => {
          if (f.id !== topId) return f;
          if (!next) {
            const { roof: _drop, ...rest } = f;
            return rest;
          }
          return { ...f, roof: next };
        });
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

    loadSample: (sampleId) => {
      const def = (sampleId && SAMPLE_BY_ID[sampleId]) || SAMPLES[0];
      const snap = withFloors(def.build());
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
