# Changelog

All notable HomeDesigner Free release changes are recorded here, newest first.
Versions map to `package.json` `version` and the Android `versionCode`
(`1.0.NN` → `100NN`). Agents working in this repo: read this file before making
changes and add an entry when you ship one.

## Unreleased

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
