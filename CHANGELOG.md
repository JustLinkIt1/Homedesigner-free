# Changelog

All notable HomeDesigner Free release changes are recorded here, newest first.
Versions map to `package.json` `version` and the Android `versionCode`
(`1.0.NN` → `100NN`). Agents working in this repo: read this file before making
changes and add an entry when you ship one.

## 1.0.64 - 2026-07-20 (versionCode 10064)

Owner (with a 2D-editor mockup): "improve the graphics of 2D mode to be more
like the screenshot" (photoreal wood floors, defined walls) + "check UI for
mobile." The 30 photoreal textures already shipped for 3D are now used in the
2D plan too.

### Changed — 2D floors are photoreal
- Room floors in the 2D editor now render the material's actual texture image
  (Konva `fillPatternImage`) instead of a flat colour. Each `FloorMaterial`
  gained a `texture` id mapping to `public/textures/*.webp`:
  oak→`wood_floor`, walnut→`dark_wooden_planks`, tile_white→`floor_tiles_06`,
  tile_grey→`interior_tiles`, concrete→`concrete_floor_worn_02`,
  marble→`marble_01`. Carpets stay a flat colour (fibre photos read worse
  than a clean tone top-down). A custom uploaded floor image still wins.
- Texture tiles at real-world scale: one tile spans the material's `scaleCm`
  (from `materials.ts`), so planks/tiles look believable at any zoom. Laid
  floors render near-opaque (grid no longer bleeds through the floor); flat
  carpet tones lifted slightly (0.55→0.68) so they read warmer.
- New `RoomFloorFill` component (one per room) keeps `useHtmlImage`'s hook
  order stable and falls back to the flat colour until the image loads.
- Added `MATERIAL_BY_ID` lookup to `data/materials.ts`.

### Changed — walls read as defined, beveled edges
- Wall bodies now carry a thin crisp outline (`wallEdge` colour added to the
  Konva palette in `theme.ts`; `#1d232d` light / `#5b6474` dark) with a rounded
  line-join, so each wall reads as a solid beveled block against the new
  photoreal floors instead of a flat slab.

Verified headless at 390×844 (phone): sample home shows oak wood grain in the
Great Room, marble in the Bathroom, warm neutral carpet in the Master Bedroom;
walls have defined edges; toolbars/nav fit with no overlap. tsc + lint + build
clean; signed AAB (SHA256 verified, versionCode 10064).

Next (Phase 2, backlog for Codex): photoreal top-down furniture sprites need an
offline render pipeline (render each catalog model from directly above → webp)
— the current 2D furniture stays vector symbols until then.

## 1.0.63 - 2026-07-19 (versionCode 10063)

Owner: "the buttons on the menu don't work properly" (phone screenshot of the
1.0.62 home bottom nav overlapping the inspiration banner). Three fixes in
`ProjectsScreen.tsx` + `index.css`:

- **Home nav button now works** — it had no `onClick` (dead button). It now
  scrolls the projects `<main>` to the top (`mainRef.scrollTo`). Templates
  (scroll to template row) and Settings (open dialog) were already wired.
- **Inspiration banner has a phone layout** — `.ps-inspire` was a flex row
  with no `@media (max-width:720px)` rule, so the middle text column was
  squeezed into ~8 cramped lines and the banner ran tall. On phones it now
  stacks (icon+title, sub-line, full-width "Explore ideas" button) — compact.
- **Banner no longer collides with the fixed bottom nav** — the compact banner
  plus a larger `.ps-main` phone `padding-bottom` (84 → 104px) keeps it clear
  of the nav in every list state. Verified headless (390×844): banner/nav
  bounding boxes don't intersect on the empty home; Home button returns
  scrollTop to 0.

## 1.0.62 - 2026-07-19 (versionCode 10062)

Premium dark UI redesign toward two owner-supplied mockups (dark-first home
screen + dark 2D editor). Owner decisions: **dark by default** (light/System
still selectable), **home + editor chrome together**, **adapt aspirational
bits to real data** (no fake completion %; bottom nav → real destinations;
"Explore ideas" → the built-in Tips).

### Changed — theme
- Deepened `:root[data-theme='dark']` to a premium near-black navy
  (`--bg #0a0d14`, card `--surface #141924`, brand `#4c6ef5`), added
  `--grad-brand` / `--grad-hero` gradient tokens. Token NAMES unchanged so
  every component inherited the new look. Android status-bar chrome updated.
- `theme.ts` `readPref()` defaults unset installs to **dark** (was system).
  Settings still exposes System / Light / Dark.

### Changed — home screen (`ProjectsScreen.tsx`)
- Rebuilt to the mockup with REAL data: "Welcome back 👋" hero + primary
  **New project** button; a horizontally-scrollable **Start a project**
  template row (samples + Import + Blank, first accent-bordered); restyled
  **Your projects** cards with an Edit / Duplicate / Delete label row (no
  progress bars — completion isn't tracked); a **Need inspiration?** gradient
  banner whose "Explore ideas" opens Tips; a phone **bottom nav**
  (Home / Templates / Settings) where every tab is a real destination
  (new `onHelp` / `onSettings` props from `App`).

### Changed — editor chrome
- Active **Build / Objects / Edit** tab is a solid blue gradient pill.
- Added a **Measure** shortcut to the 2D bottom control bar (arms the measure
  tool, highlights when active via `.pill .toggle.on`). Segmented 2D/3D
  toggle, Ground-floor pill, dimensions inherit the premium palette.

### i18n
- 11 new home/editor strings × 12 locales (`scripts/add-translations7.py`).

### Folded in (previously unshipped 1.0.61 polish)
- Room labels use the **visual centre** (pole of inaccessibility,
  `geometry.polygonVisualCenter`) so concave/L-shaped rooms label in open
  floor. Measure calibration card no longer overlaps its tip
  (`useDraw.calibrating`) and is fully translated (`add-translations6.py`).
  Remote-catalog fetch has a 6 s AbortController timeout → "Offline catalog"
  instead of an eternal spinner.

### For Codex / next session
- Mockup elements deliberately NOT built (no real data yet): user
  accounts/avatars, marketing photos for templates, a content/inspiration
  feed, completion tracking. Revisit once accounts land (Google sign-in).
- Verified headless: dark default; Settings-from-nav; Measure arms tool;
  2D/3D toggle; FR home translates via the language picker. Vite gotcha —
  driving i18n by dynamic-importing the store from page context can bind a
  second module instance; switch language via the real `.lang-btn` UI in
  probes.

## 1.0.60 - 2026-07-19 (versionCode 10060)

Owner: "more quality improvement for 2D." A hands-on 2D audit (14 headless
screenshots, desktop + phone) found the labels were the glaring gap.

### Fixed

- **Room names no longer shatter into fragments.** The Konva room-name
  `<Text>` used a fixed `width={100}` (100 **cm**, world units) with
  `fontSize={14/zoom}`, so zoomed out the font grew while the box didn't —
  "Great Room" wrapped to "Gre / at / Roo / m", "Bedroom" → "Bed / roo / m".
  The name is now a **screen-space** label (`fontSize`, box width, gaps all
  scale by `1/zoom`) with `wrap="none"` + `ellipsis`, so names always render
  on one line and truncate cleanly if genuinely too long. Verified headless:
  every sample room name renders on exactly 1 line, phone + desktop.
- **Name + area are one unified block** on a soft rounded plate (same idea as
  the wall-dimension pills) so they lift off any floor fill / furniture at the
  room centroid and never drift apart. Deletes the old dual-file split
  (name in `Canvas2D`, area in `DimensionsLayer.RoomDimension`) and its
  fragile glyph-count `nameLines` collision heuristic. Small rooms hide the
  label rather than overflow it.
- **Interior wall dimensions sit inline on the wall** instead of being offset
  `px(18)` into the neighbouring room (where "3.50 m" / "12.25 m" landed on
  top of that room's name and fixtures). Each interior wall length is now a
  small rounded pill centred on the wall centreline, rotated upright, over a
  legible plate; click-to-edit preserved. Perimeter lengths still read from
  the overall building dimensions. (`DimensionsLayer.tsx` — WallDimension
  rewritten; new `dimensionPlate` / `dimensionPlateStroke` theme colours.)
- **Room selection is now obvious**: selected room outline thickened
  (3→5 /zoom), full-contrast selection stroke, stronger shadow, and the
  selected room draws LAST so its outline sits above neighbours.

### Changed

- **2D wall drawing squares up like 3D** (owner: square-to-grid everywhere).
  Extracted the 1.0.59 angle lock into a shared `lockToAngle(prev, p, grid)`
  in `lib/snapping.ts`, now used by BOTH 2D `applySnaps` and 3D
  `snapDraftPoint`/`snapCornerPoint` so they can't drift. A near-axis 2D wall
  snaps exactly to 0/45/90°; the existing free-angle exemption while tracing
  over an imported background is kept. Verified: near-horizontal draw commits
  at mod-45 ≈ 0.00; with a background set the same draw keeps its free angle.
- Tool-dock buttons get a native `title` (they already had aria-label +
  data-tip).

### For Codex / next session

- Konva label probing: `window.Konva.stages[0].find('Text')`, check
  `textArr.length` for wrap lines; duplicate-length walls make text-matching
  ambiguous (match on the unique length or the parent Group position).
- Room label still sits at the polygon centroid — a future nicety is to place
  it at the pole-of-inaccessibility (largest inscribed circle) so L-shaped
  rooms label in the open area, not on a wall.

## 1.0.59 - 2026-07-19 (versionCode 10059)

The "actual app quality" release. Owner (with IKEA planner screenshots):
"Drawing walls in 3D is clunky and nearly unusable — it needs to snap to
existing walls and stay square to the grid; after, you should be able to
drag the points to change the wall. Exact dimensions need to be an option
too. From beginner to architect." Plus a full UX audit of 18 headless
screenshots that found 3D (not 2D) is the quality gap vs Planner 5D.

### Added — IKEA-grade wall drawing in 3D (`Scene3D.tsx`)

- **Snapping**: every 3D draft point runs through the SAME prioritized snap
  engine as 2D (`snapping.ts` buildSnapElements/nearestSnap: wall endpoints >
  midpoints > guides > edges) via new `snapDraftPoint()`; taps within 12° of
  a 45° multiple from the previous point lock to that angle, and cardinal
  segments keep the shared coordinate exactly (truly square walls).
- **IKEA-style guides + live dimensions**: while drafting, yellow guide
  strips show the axis cross through the latest point + the extension of the
  segment just drawn; every ghost segment carries a floating dimension pill
  (drei `Html`, `.ghost-dim`).
- **Exact dimensions**: the draw affordance gains a length input in 3D
  (type 3.5 + Enter → the just-drawn segment becomes exactly 3.50 m along
  its snapped direction) via new `drawBridge.setLength`.
- **Drag points after drawing**: selecting a wall in 3D shows yellow ring
  gizmos at both endpoints (`WallEndpointHandles`; same raycast-distance-0 /
  frozen-camera / controls-pause tricks as the anchor puck). Dragging
  previews with a guide + live length and commits through the corner-aware
  `moveCorner`, snapped to other walls' endpoints (`snapCornerPoint`).
- **Furniture yields while drawing**: `Furniture3D` ignores taps when a
  build tool is armed so they fall through to the floor (a tap on the dining
  table used to hijack the draft — the actual "clunky" bug). Wall taps also
  draft now (their plan position is used), so kitchen runs can be tapped out
  along a wall.

### Changed — storey visibility + camera + walk (the audit fixes)

- **Storeys above the active floor hide in 3D** (`DesignScene.tsx`): zooming
  into a ground-floor room is no longer blocked by the upper storey's slab —
  the blank-white-screen zoom (tester report, reproduced in renders) is
  gone. FloorSwitcher reveals upper storeys by switching. Dollhouse fade now
  applies only to the ACTIVE storey (context floors stay solid); faded
  opacity 0.1 → 0.18.
- **Camera target clamps**: anchor-puck drags and `orbitFocus` clamp to the
  design bounds + 2 m, so the camera can never be parked in the void.
- **Walk mode spawns in the largest room** at eye height facing its
  furniture (was: building centroid, often nose-first into a wall).
- Fixed a crash-frame during walk-mode transitions (PointerLockControls
  have no `.target`; FocusAnchor/orbitZoom/orbitFocus now guard).

### For Codex / next session

- Verified headless: snap math (endpoint join / square / corner-join all
  exact), real 3D taps → +1 wall snapped to 45° and typed 350 cm length,
  kitchen run along a wall (+3 cabinets), closeup + max-zoom screenshots
  show interiors (not blank slabs), focus-clamp, paint popover + undo/redo
  regressions green, no page errors.
- Screen-fraction click probes are camera-dependent — drive the camera to a
  known state (orbitFocus + orbitZoom) before click-based steps.
- 3D build follow-ups still open: openings from 3D wall taps, desktop-3D
  entry point, hover ghost-to-cursor on desktop.

## 1.0.58 - 2026-07-18 (versionCode 10058)

Full quality-control audit (owner: "quality control audit let's go"). A
read-only sweep produced 21 findings; everything actionable ships here.

### Fixed — Pro paywall bypasses (owner chose: gate with upsell)

- **Kitchen-run uppers**: `addKitchenRun` only places `wall_cabinet` (Pro)
  uppers for Pro users; the "Wall cabinets" toggle in the draw affordance
  shows a crown and routes through `requirePro('catalog')` for free users.
  Base-cabinet runs stay free.
- **Appliance-slot swaps**: Pro slot chips (Drawers, Dishwasher) show a crown
  and open the upsell for free users; free slots (Cabinet/Stove/Sink) still
  swap instantly.
- **Opening styles**: Pro door/window styles in the Style dropdowns (double,
  sliding, pocket, bi-fold, arch, french, casement) show 👑 and gate through
  `requirePro('catalog')`. The Pro set is DERIVED from the catalog's `pro`
  flags (`PRO_OPENING_STYLES` in PropertiesPanel) so it can't drift.

### Fixed — i18n batch (~68 new keys × 12 locales, `scripts/add-translations5.py`)

- **ImportDialog fully translated** (was 100% English): title, dropzone,
  status, trace options, DXF summary, buttons, error strings.
- **Toolbar**: all toasts + every title/aria-label.
- **ProjectsScreen**: `timeAgo`, the destructive delete confirm, toasts,
  per-card aria-labels. **ShoppingList**: copy/save toasts.
- Hardcoded aria-labels/titles across App (zoom/units/tips), ToolDock,
  FloorSwitcher, RotateControls, Scene3D popover close, texture preview.
- `ErrorBoundary` deliberately stays English (i18n may be the crashing
  module) — now documented in a comment.

### Fixed — robustness & types

- `Toolbar.saveToFile`/`openFromFile` and `App.handleRender` no longer leak
  unhandled promise rejections — try/catch with translated error toasts.
- `native.ts` uses the real `Encoding.UTF8` enum (was `'utf8' as any`).
- Project import validates `floorGeom[*].openings` per storey (orphan
  openings whose wall is gone are dropped on EVERY floor, not just the
  active one). `version: 1` fallback strategy documented in `projectIO.ts`.
- Removed `as never` casts: opening Style selects are typed `OpeningStyle`,
  `pickAt` in Canvas2D returns `Selection['kind']`, ProjectsScreen loads
  snapshots as `MaybeFloored`, stage comparison cast dropped.

### Fixed — perf & consistency

- `ImportDialog` + `ProjectsScreen` now use narrow store selectors (they
  subscribed to the whole design store and re-rendered on every edit).
- Wall-thickness default (12 cm) unified: `DEFAULT_WALL_THICKNESS` in
  `furnitureCatalog.ts` feeds both the store default and the samples.

### Known warts (documented, not fixed — for Codex)

- `setActiveFloor` isn't undoable: undo after switching floors restores the
  edit-time active floor. Mild UX wart.
- PDF export switches active floors during capture (restored in `finally`)
  — a "read-only" export churns autosave state.
- Refactor candidates: Canvas2D.tsx (~2100 lines), DesignScene.tsx (~840),
  Scene3D.tsx (~750).

### Verified headless

Free user: kitchen run adds 6 bases + 0 uppers; Drawers chip → upsell, type
unchanged; Stove chip works; style→double → upsell, style unchanged. Pro:
uppers place (+4), style change works. Undo/redo around kitchen runs intact.
Orphan-opening project file: orphans dropped on both storeys, valid opening
kept. French: ImportDialog + delete confirm fully translated (screenshots).

## 1.0.57 - 2026-07-18 (versionCode 10057)

Owner: "keep up the quality improvements." 2D kitchen drawing quality + two
plan-pack completions.

### Added

- **Real 2D symbols for kitchen casework** (`lib/symbols.ts`): shape
  `'counter'` (counters, islands, base/drawer/corner cabinets) now draws as a
  proper plan symbol — outline, worktop front-edge line, centred pull —
  instead of the unstyled fallback rectangle; shape `'box'` gets light
  crossed diagonals so generic volumes stop looking like placeholders.
- **Wall-mounted items draw dashed in 2D** (plan convention): `FurnitureSymbol`
  takes `dashed`, and `Canvas2D` sets it for any catalog entry with
  `mountY > 0` (wall cabinets). Kitchen runs with uppers now read like a real
  kitchen drawing — dashed uppers over solid base cabinets — instead of two
  overlapping solid rectangles.
- **Plan-pack summary additions** (`lib/planExport.ts` / `planSchedule.ts`):
  each storey section gains a **Wall length** row (total linear wall run —
  paint/skirting estimates), and the pack ends with the **Shopping list**
  (same `lib/bom.ts` aggregation as the in-app panel: item, footprint,
  quantity). One new key ('Wall length') added to all 12 locales.

### For Codex / next session

- Verified headless: kitchen run placed via `addKitchenRun`, zoomed 2D
  screenshot shows solid base + dashed uppers + stove burners/sink bowl; PDF
  re-exported and text-grepped for "Wall length" / "Shopping list".
- 2D symbol registry now covers every `Shape3D` (the `comm -23` diff of
  catalog shapes vs symbols is empty).

## 1.0.56 - 2026-07-18 (versionCode 10056)

Owner: "keep working on making something people will actually pay for." PDF
export is already a Pro gate, so this release turns it from a screenshot-on-A4
into a professional **plan pack** — output you can hand to a builder,
landlord or kitchen fitter.

### Added

- **PDF plan pack** (`lib/planExport.ts` rewrite + new `lib/planSchedule.ts`):
  - Every floor page now carries a **true paper scale bar** (round length,
    e.g. 3.00 m, plus an approximate ratio like "~ 1:65") and the storey's
    **floor area** bottom-right. The capture bridge (`renderBridge.planCapture`)
    now returns `{ url, pxPerCm }` so the PDF knows the raster's real scale —
    `Canvas2D` computes it as `zoom × pixelRatio`.
  - A final **Summary page**: per-storey room schedule (name, bounding size,
    area — largest room first), floor totals, **Total living area**, and a
    **Doors & windows schedule** grouped by kind + size (uses the shared
    `openingLabel()` naming: Single/Double/Sliding/Pocket/Bi-fold door,
    Passage, Arch, Window/French/Casement/Sliding window).
  - PDF text translates via `t()` for cp1252-safe locales (en fr es de it pt
    nl); others keep English labels because jsPDF's built-in Helvetica can't
    encode them (mojibake would be worse). ~14 new keys added to all 12
    locales (`scripts/add-translations4.py`).

### Fixed

- **Plan capture no longer clips the overall dimensions.** The framed PNG/PDF
  capture pad grew 70 → 120 cm, so the building's outer "10.00 m"-style
  dimension lines and text render fully instead of being cut mid-glyph.
- **Room area labels no longer collide with wrapped names.**
  `DimensionsLayer.RoomDimension` estimates how many lines the room name
  wraps to (translated name, ~7.7 px/glyph in the 100 cm label box) and sits
  the area below — "Kitchen & Dining" no longer overprints "20.00 m²".

### For Codex / next session

- Verified headless by driving the real export in the dev server
  (`import('/src/lib/planExport.ts')` in page context + Playwright download
  capture, then text-grepping the PDF and re-rendering pages via pdfjs):
  3 pages for the two-storey sample, all schedule strings present, French
  labels translate, scale bar "3.00 m" at ~1:60–65, no label collisions.
- Possible follow-ups: imperial-first summary formatting for US users is
  already handled by `formatArea/formatLength(units)`; a wall-length (linear
  metre) row per floor would help paint/skirting estimates; the Summary page
  could also embed the shopping list (`lib/bom.ts`) as a page 4.

## 1.0.55 - 2026-07-18 (versionCode 10055)

Owner report on 1.0.54: "There's no lock button on 3d now."

### Fixed

- **Lock is directly visible in phone 3D again.** The Lock toggle was never
  removed — since 1.0.51 the phone 3D HUD folds Dollhouse/Walk/Lighting/Lock
  into the "View ▾" popover, so on a phone there was no *visible* lock button
  (2D shows one in the HUD row, 3D didn't — hence the report). A dedicated
  `Lock` pill now sits beside the View pill on phones (`.lock-pill-3d`,
  hidden ≥881px where the inline pill already shows it); the copy inside the
  View popover stays, and both bind the same `moveLock` store flag so they
  can't drift. Verified headless (390×844 touch): pill visible, toggle flips
  `moveLock`, popover checkbox mirrors it; desktop unchanged.
  (`App.tsx` hud-3d; `index.css` `.lock-pill-3d` show/hide.)

## 1.0.54 - 2026-07-18 (versionCode 10054)

Owner asks: build inside 3D, and one render button instead of two.

### Added

- **Build in 3D** (phones): the Build tab + sheet now also appear in 3D with
  the floor-drawing tools — Select, Draw walls, Draw room, Kitchen run. Arm a
  tool and tap the 3D floor/ground: taps place draft points (grid-snapped),
  a translucent blue ghost previews the wall chain (posts + slabs), and the
  same Finish/Cancel pill as 2D commits — walls chain via `addWall` (including
  the 1.0.53 room-splitting), rooms via `addRoom`, kitchen runs tile on the
  second tap. The camera anchor puck hides while a tool is armed so it can't
  steal floor taps. Openings (doors/windows) and measure/erase stay 2D-only;
  desktop 3D keeps the 2D dock workflow (sheet is phone-styled).
  (`Scene3D.tsx` — draft/ghost + tap routing; `BuildSheet` `limited` prop;
  `App.tsx` tab/sheet/affordance gates.)
- **Photo mode folded into Render image** (owner: "so we don't have two
  buttons"): the standalone Photo button is gone; the Render menu now offers
  Photo mode (path-traced, top tier) above Standard/High/Ultra.

### Fixed

- **Kitchen runs are hard-capped at 60 units.** A mis-tap near the 3D horizon
  could intersect the ground plane hundreds of metres out and explode a run
  into thousands of cabinets (hit in headless testing: 11k items).
  (`lib/kitchenRun.ts` tile().)

### For Codex / next session

- R3F gotchas learned here (they cost hours — don't rediscover them):
  in-canvas pointer handlers can hold **stale closures** (read the zustand
  store via `getState()` at event time, never trust captured props), and
  **store commits must never run inside a setState updater** (React dev
  double-invokes updaters → double walls).
- 3D build possible follow-ups: openings placement from 3D wall taps (needs a
  position-along-wall on `SurfaceTap`), a desktop-3D entry point for the build
  tools, and hover ghost-to-cursor on desktop.

## 1.0.53 - 2026-07-18 (versionCode 10053)

The owner's two asks (full translations, DWG import) + two tester bug fixes.

### Added

- **Complete translations** (tester: "some parts not fully translated"). ~160
  new keys across all 12 locales in three batches (`scripts/add-translations*.py`,
  kept for reference): the whole Properties panel (labels, options, toasts,
  alignment tooltips, texture cards, background props), all furniture catalog
  names, material names + family groups, floor materials, room styles, catalog
  categories/groups, kitchen-unit chips, lock/kitchen-run strings, sample room
  names, and the empty-state copy. PropertiesPanel + the 3D paint palette now
  render through t(); stored room/item names display-translate via t() so
  catalog-derived names localize while user-renamed ones pass through.
  Verified visually in French and Japanese.
- **DWG import** (tester ask: "import the output from complex software").
  Import plan now accepts `.dwg` directly: the file converts to DXF **in the
  browser** via LibreDWG compiled to WASM (`@mlightcad/libredwg-web`,
  `dwg_write_dxf`) and feeds the existing DXF pipeline unchanged (unit
  detection, wall extraction, editable geometry). The ~10 MB WASM lives in a
  lazy chunk fetched only when a .dwg is picked. Verified headless with a real
  AutoCAD 2000 file → "found 66 wall segments". Note: the dep must stay in
  `optimizeDeps.exclude` (vite pre-bundling separates the emscripten glue from
  its wasm → magic-word crash).

### Fixed

- **Flooring now stays inside walls** (owner report: "when I draw a new wall
  the flooring doesn't stay in the boundary of the room"). Drawing a wall
  across a room splits the room polygon along the wall (`src/lib/roomSplit.ts`
  + `addWall`): the larger half keeps the room's identity/finish, the smaller
  half becomes a new "Room" with the same finish. One undo step reverts wall +
  split. Same family as 1.0.47's room-bounded wall paint, now for floors.
- **Floor pills / tip bubble overlap** (owner screenshot): the floor switcher
  also hides while a draw tool is armed in 2D (the armed-tool tip renders
  top-centre and collided with the top-left pills on phones).

## 1.0.52 - 2026-07-17 (versionCode 10052)

Owner + tester follow-ups on 1.0.51.

### Changed

- **Camera anchor is now a visible, movable puck** (owner: "instead of double
  tap do an icon that can be moved like in IKEA kitchen builder"). An
  IKEA-style widget (white directional arrows + blue move-cross) lies on the
  floor at the orbit target; dragging it pans camera + target together, so
  orbit/pinch-zoom revolve around wherever it's parked. Drawn as a gizmo
  (depth-test off, late render order) so it's visible over furniture, with
  raycast distance forced to 0 so it wins the grab even when objects are
  physically closer. 1.0.51's double-tap + deferred palette are removed — the
  flooring palette opens instantly again. (`FocusAnchor` + `makeAnchorTexture`
  in `Scene3D.tsx`; `orbitFocus` bridge kept for programmatic focus, e.g. a
  future photo-mode anchor.)
- **One-gesture furniture drag on touch** (tester chat: "when I'm moving
  furniture around it's taking some time to actually move" — the "fluidity"
  report from 4/13 clarified). The old rule made the first touch-drag only
  select; now dragging moves immediately on all pointer types. The 8px
  drag-slop still separates taps from drags, and the 1.0.51 **Lock** toggle is
  the explicit accidental-move protection (undo also covers mistakes).
  (`Canvas2D.tsx` furniture `draggable`.)

### Tester-report coverage map (Phase 2, for Codex)

- 2/13 "import output from complex software": PDF/DXF/image import already
  exists (Import plan); **DWG import** stays on the roadmap. Reply to the
  tester pointing at Import plan.
- 4/13 "fluidity" + chat: addressed by 1.0.50 (orbit frames) + the one-gesture
  drag above. Follow up with the tester on-device.
- 5/13: 2D pan lag (largely fixed 1.0.43/1.0.50 — owner reports improvement);
  "bottom navigation bar sometimes covers buttons" — could not reproduce from
  the report alone, likely device nav-bar/safe-area overlap on specific
  phones: ask for a screenshot + device model; **"some parts not fully
  translated" is REAL** — known gap: Properties panel labels, material and
  furniture names are English-only across all 12 locales. That's the next
  meaty i18n task (wrap PropertiesPanel strings in t(), add name keys for
  catalog entries + materials to every locale).
- 10/13 rotation input + lock: shipped in 1.0.51.

## 1.0.51 - 2026-07-17 (versionCode 10051)

Tester-feedback batch (Phase-2 reports) + billing hardening.

### Added

- **Lock objects** (tester ask: "a lock button… fixes the objects and allows you
  to freely navigate"). New `moveLock` toggle — 2D HUD pill ("Lock"), the 3D
  desktop pill and the phone View popover ("Lock objects"). When on, furniture
  can't be dragged in 2D or 3D (selection still works); in 3D, drags fall
  through to the camera, so touch navigation can't shift objects.
  (`designStore.moveLock`, gates in `Canvas2D` `draggable` + `Furniture3D.beginDrag`.)
- **Exact rotation entry** (tester ask: slider too coarse on small phones) — a
  Blender-style "Angle (°)" numeric input under the rotation slider in the
  Properties panel.
- **Camera focus anchor, IKEA-style** (owner ask): **double-tap a floor in 3D**
  to move the orbit target there and dolly part-way in — pinch/wheel then zooms
  into that exact area. The floor paint palette now opens after a ~300 ms
  single-tap delay so the double-tap can win (the palette used to swallow the
  second tap). Focus aims at 0.6 m height so the view doesn't tilt into the
  boards. (`renderBridge.orbitFocus` registered by `ZoomBridge`; double-tap
  detection in `Scene3D.handleSurfaceTap`.)

### Changed

- **Referral program retired** (enough test users): no codes are redeemable —
  `HOMEDESIGN50` removed from `lib/referral.ts` and the "Have a referral code?"
  entry UI removed from the upsell modal. Devices that already redeemed KEEP
  Pro (redemption is honored locally; nothing is revoked). Orphaned locale
  strings left in place for a future campaign.

### Fixed

- **Purchase flow hardening** (owner report: "not sure the purchase flow
  works"): if Play completed the transaction but the RevenueCat dashboard
  doesn't map the product to an entitlement, the app used to swallow the paid
  purchase silently (no unlock, no message). Now any owned product after a
  successful `purchasePackage` counts as Pro, and a false result without an
  error shows "Purchase didn't complete… use Restore purchase" instead of
  nothing. (`pro.ts` purchase(), `proStore.purchase`.)

### Handoff — billing verification + Google Sign-In plan (for Codex / next session)

**Verifying the purchase flow end-to-end** (can't be done from a sandbox; needs
the owner + a device): add your Google account as a **License tester** in Play
Console → Settings → License testing; install from the **internal testing**
track (not a sideloaded AAB); trigger any Pro gate → buy (license testers see
"Test card, always approves"); then in RevenueCat dashboard confirm the
customer shows the `pro_unlock` purchase AND the `Pro` entitlement turns
active. If the purchase appears WITHOUT the entitlement, the product isn't
attached to the entitlement in RevenueCat → attach it (the 1.0.51 client
hardening keeps users unlocked either way). Also test "Restore purchase" after
clearing app data.

**Google Sign-In / Pro on other devices & web** (owner ask: "how can someone
access their premium account on the website"): today Pro is device+Play-account
bound (RevenueCat anonymous IDs; the web build is a free demo with no billing).
Recommended architecture, no custom backend needed:
1. Add Google Sign-In via a Capacitor plugin (e.g. `@capgo/capacitor-social-login`)
   + Google Identity Services on web.
2. On sign-in call `Purchases.logIn(googleUserId)` so the RevenueCat customer —
   and the Pro entitlement — follows the account across installs/devices.
3. Web Pro then works either by (a) RevenueCat Web Billing (Stripe) to sell on
   web too, or (b) read-only entitlement check on web via logIn + getCustomerInfo.
4. OWNER PREREQS (only the owner can do these): create OAuth clients in Google
   Cloud Console — a Web client ID + an Android client ID bound to package
   `com.homedesigner.app` and the upload key SHA-1
   (`keytool -list -keystore homedesigner-upload.jks` → SHA-1); if using
   RevenueCat Web Billing, connect Stripe in the RevenueCat dashboard.
Scope estimate: 1–2 sessions once the OAuth client IDs exist.

## 1.0.50 - 2026-07-17 (versionCode 10050)

### Fixed

- **3D orbit fluidity** (tester report: "struggling with the fluidity of the
  movements"). 1.0.47's demand-rendering (`frameloop='demand'`) saves battery on
  an idle scene, but OrbitControls **damping** depends on an
  invalidate-per-frame chain — on a loaded phone any dropped link kills the
  inertia, so orbiting feels sticky/stuttery. The canvas now switches to
  continuous rendering **while a pointer is down / wheel is active** and falls
  back to demand ~1.2 s after the gesture ends (long enough for the damping tail
  to ease out). Idle battery behaviour is unchanged.
  (`src/components/Viewer3D/Scene3D.tsx` — `interacting` state wrapping the
  Canvas; `frameloop={walkMode || interacting ? 'always' : 'demand'}`.)
- For Codex: if testers still report stutter after this, the next suspects are
  (a) `AdaptiveDpr` interacting with demand mode, (b) first-interaction jank
  from GLB decode on the main thread, (c) the composer cost on non-lowPower
  devices. Ask testers for device + 2D/3D specifics.

## 1.0.49 - 2026-07-16 (versionCode 10049)

Phase 2b — the modular kitchen designer's auto-run tool. Feature-complete for
base + upper cabinet runs with appliance slots.

### Added

- **Kitchen-run tool** — a new build tool (`CookingPot` icon, `tool: 'kitchen'`).
  Tap along a wall, tap again, and it auto-tiles Base Cabinets end-to-end across
  the span in one undo step, each unit rotated so its back is to the wall and its
  front faces the room (orients toward the nearest room's centre, so it's correct
  on any wall). Snaps to walls/grid like the wall tool.
  - **Live ghost preview**: while dragging, translucent cabinet footprints tile
    from the start tap to the cursor, each with a front-edge tick, so you see the
    row and its facing before committing (matches the furniture placement ghost).
  - **Upper cabinets in the same gesture**: a "Wall cabinets" toggle in the draw
    bar (default on, persisted) also tiles Wall Cabinets above the base run — set
    back so their backs align with the deeper base units, mounted at `mountY` 120.
  - Tiling + facing math is shared by the ghost and the commit
    (`src/lib/kitchenRun.ts` → `kitchenRunUnits` / `kitchenUpperUnits`) so they
    can't drift.
  - Store: `addKitchenRun(a, b)`, `kitchenUppers` flag + `setKitchenUppers`.
  - Wiring: `src/data/tools.ts`, `src/components/Editor2D/Canvas2D.tsx`,
    `src/types/index.ts` (`ToolMode` += `'kitchen'`), tool hint + toggle in
    `src/App.tsx`.
- **Appliance slots** — select any unit in a run and swap it in place between
  Cabinet / Drawers / Stove / Sink / Dishwasher via chips in the Properties panel
  ("Kitchen unit" section). The swap keeps the unit's slot footprint, position and
  facing, so the run stays aligned. Store: `swapFurnitureType(id, newType)`.

### Handoff — where this is and what's next (for Codex / next session)

The kitchen designer core loop is done: draw a run → ghost preview → auto-tiles
base + wall cabinets facing the room → swap any slot to an appliance. Built on
1.0.48's real Kenney CC0 kitchen models + modular units + `mountY` support.

Remaining polish (low priority, none blocking):
1. **2D symbol** — a proper cabinet symbol for `shape: 'counter'` (falls back to a
   plain box outline in the 2D plan now).
2. **Run grouping** — a `groupId` on run items so a whole run can be
   moved/deleted/duplicated as one (today each unit is independent).
3. Optional: snap a run's ends to adjacent walls/corners for a perfect fit.

Deferred with reason: a **3D placement ghost** — 3D placement is tap-to-place and
touch has no hover, so a follow-cursor ghost only helps desktop-web; the live 3D
drag already previews after placement. Low ROI for a mobile-first app.

Bigger roadmap bets still open: **Fit & Flow Coach** (spatial "does it work"
scoring — the strongest differentiator), **DWG import**, and moving the model
long-tail to Codex's Quaternius→Blender→R2 cloud pipeline for more realism.

## 1.0.48 - 2026-07-16 (versionCode 10048)

### Added

- Real 3D models for the **fridge**, **kitchen sink**, and **stove** from the
  Kenney CC0 Furniture Kit (`scripts/fetch-kenney.mjs`, bundled in
  `public/models/`) — Poly Haven has no modern kitchen appliances, and Kenney
  ships ready-made glTF so no Blender/cloud step is needed. The fridge/sink
  replace procedural boxes; the stove replaces the Poly Haven model so the whole
  kitchen zone is stylistically cohesive. Upgraded procedural meshes stay as the
  offline/load fallback.
- Modular kitchen units — **Base Cabinet**, **Drawer Unit**, **Corner Cabinet**,
  and **Wall Cabinet** (Kenney CC0) — place a row of them to build a custom
  kitchen run. These are the building blocks for the upcoming auto-run kitchen
  designer.
- **Wall-mount support** for furniture (`mountY` on catalog entries): items rest
  their base a set height above the floor instead of on it, so upper cabinets
  hang at counter-clearance height. (`src/components/Viewer3D/Furniture3D.tsx`)

### Improved

- Better procedural kitchen + TV meshes (fallbacks behind the real models where
  available). (`src/components/Viewer3D/Furniture3D.tsx`)
  - New `counter` shape for `counter` and `island`: recessed toe-kick, cabinet
    body, overhanging countertop, and footprint-derived door fronts with bar
    handles (was a featureless box).
  - `fridge`: modern two-door stainless body with a seam and vertical bar
    handles (was a plain box + stub handle).
  - `tv`: flat panel on a slim central stand with a thin bezel and emissive
    screen (was a floating slab).

## 1.0.47 - 2026-07-15

### Added

- Interactive 3D furniture previews with orbit, zoom, dimensions, and explicit
  placement.
- Room and object-type catalog navigation alongside search and recent items.
- A versioned Cloudflare R2 catalog that loads additional CC0 models on demand,
  caches validated manifests, and falls back safely when offline.
- The first cloud catalog batch: 32 optimized Quaternius CC0 furniture and
  interior models.
- More realistic sample homes using bundled GLBs for 87 of 149 placements.
- Direct furniture placement from 3D build mode.
- Room-bounded wall painting, including independent finishes for adjacent rooms
  that share one long structural wall.

### Improved

- Reduced 2D canvas pixel cost on high-density phones.
- Changed the main 3D orbit view and furniture previews to render on demand.
- Reduced mobile 3D resolution and environment-map cost under load.
- Reduced furniture drag raycasting to one interaction proxy per object.
- Improved build-mode guidance, catalog grouping, mobile controls, and safe-area
  spacing.

### Fixed

- Wall paint no longer crosses room boundaries simply because rooms share a
  continuous wall.
- Furniture dragging explicitly requests frames in demand-rendering mode.
- Interrupted Android gestures no longer leave orbit controls stuck.
- Missing or corrupt cloud models fall back to procedural furniture instead of
  breaking the scene.

### Delivery

- Android version code: `10047`.
- Cloud models are hosted outside the AAB and download only when required.
- The R2 development catalog was verified with 32 public model downloads and a
  byte-identical 32-entry manifest.

## 1.0.44 - 2026-07-14 (versionCode 10044)

3D-view fixes layered on top of 1.0.43 (which did not touch the 3D view).

### Fixed

- 3D "fades to white" on zoom-out: distance fog ran inside the max orbit
  distance and washed the whole model to the fog colour. Fog now sits past the
  orbit range and only softens the far ground/grid horizon.
  (`src/components/Viewer3D/Scene3D.tsx`)
- 3D "fades to black" on zoom-in: raised `OrbitControls` `minDistance` 2→3 so a
  full dolly-in can't end up inside the geometry.
- Top-left UI overlap: the floor switcher is hidden while a draw gesture is
  active, so it no longer collides with the centred "Tap points / Finish" pill
  on phones. (`src/App.tsx`)

## 1.0.43 - 2026-07-14 (versionCode 10043)

Mobile editor fluidity pass.

### Changed

- 2D touch pan + pinch-zoom handled imperatively through refs, committing one
  final viewport update (`setViewport`) at the end of a gesture instead of every
  intermediate frame — far fewer React renders during continuous mobile
  gestures. (`src/components/Editor2D/Canvas2D.tsx`)
- Added focused `useShallow` selectors to cut unrelated re-renders.
- Refined bottom tool/nav layout, tool dock, toolbar, build sheet, properties
  panel, and floor switcher for phones; floor switcher more compact on mobile.
- Furniture catalog unmounted while closed; picking an object closes it on mobile.

### Added

- Store-level `setViewport` action; `.ai/CODEX_CLAUDE_HANDOFF.md` handoff doc.

## 1.0.42 - 2026-07-13 (versionCode 10042)

Android mobile-performance pass.

### Changed

- Autosave coalescing: project writes to `localStorage` debounced (600ms),
  bound to the captured project, flushed on background/close — removes the
  synchronous per-edit write that stalled the WebView main thread during drags.
  (`src/store/designStore.ts`, `src/lib/projects.ts`)
- Lightweight 3D tier on touch devices: skip post-processing, soft/contact
  shadows and MSAA, cap DPR at 1.5, request the high-performance GPU.
  (`src/components/Viewer3D/Scene3D.tsx`)

## 1.0.41 - 2026-07 (versionCode 10041)

- Objects catalog opens as a half-height bottom sheet on mobile (plan stays
  visible/tappable behind it).

## 1.0.40 - 2026-07 (versionCode 10040)

- 2D pan made imperative (Konva layer moved directly, no per-move React
  re-render); fixes pan frame-rate on high-refresh phones.

## 1.0.39 - 2026-07 (versionCode 10039)

- Fixed 3D "View" button text clipping; moved 2D zoom controls to the right edge.

## 1.0.38 - 2026-07 (versionCode 10038)

- 3D post-processing failures degrade to the plain scene via an error boundary
  instead of crashing the view (seen on some GPUs, e.g. Pixel 10 Pro).

## 1.0.37 - 2026-07 (versionCode 10037)

- Fixed extreme 2D lag on ultra-high-DPI phones by capping `Konva.pixelRatio`.

## 1.0.36 - 2026-07 (versionCode 10036)

- Added 20 more realistic CC0 (Poly Haven) furniture models.

## 1.0.35 - 2026-07 (versionCode 10035)

- Added 9 realistic CC0 furniture models + 2 new catalog items.

## 1.0.34 - 2026-07 (versionCode 10034)

- Grouped photoreal CC0 texture library for walls & floors (Planner-5D-style
  grouped material pickers).

## 1.0.33 - 2026-07 (versionCode 10033)

- Fixed the status bar overlapping app content on Android.

## 1.0.32 - 2026-07 (versionCode 10032)

- Planner-5D-style mobile UI grouping; touch fixes to prevent accidental
  furniture moves; easier wall drawing.

## 1.0.31 - 2026-07 (versionCode 10031)

- Wall editing in 3D; warmer dollhouse aesthetic.

## Earlier (1.0.0 – 1.0.19)

Condensed from git history; see `git log` for full detail.

- 1.0.19 — dark mode, Settings, branded adaptive icon, support & crash channels.
- 1.0.18 — multi-floor PDF export, Pixel WebGL-detection fix, photo-mode dollhouse.
- 1.0.17 — promo-grade dollhouse look (wall caps, airier interiors).
- 1.0.16 — one-tap room style presets.
- 1.0.15 — 16 new CC0 (Poly Haven) 3D furniture models.
- 1.0.14 — report referral redemptions to RevenueCat; fix referral Pro loss.
- 1.0.13 — shopping list (aggregated furniture BOM with copy/CSV export).
- 1.0.12 — guided/effortless UX batch; ghost-tap fix.
- 1.0.11 — walk-through and photo mode on mobile.
- 1.0.10 — furnishing power tools (align/distribute) + full opening styles.
- 1.0.9 — Mobile Feel Pack (haptics, undo toasts, 3D empty state, back-button fix).
- 1.0.5 – 1.0.8 — purchase-flow resilience (RevenueCat timeouts, real error
  messages, closed-testing version bumps).
- 1.0.3 – 1.0.4 — referral code system for early testers.
- 1.0.1 – 1.0.2 — launch-crash fix for keyless native builds; store assets.
- 1.0.0 — initial release train (version sync, store assets, RELEASING.md).
