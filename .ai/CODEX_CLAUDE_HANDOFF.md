# HomeDesigner AI engineering handoff

> Intended for Codex, Claude Code, and other coding agents working on this
> repository. This file is tracked by Git and is **not access-controlled**;
> never place credentials, passwords, private keys, or signing material here.

Last updated: 2026-07-15

## Current release state

- Branch: `agent/release-1-0-47-model-catalog`
- Current release: `1.0.47`
- Android version code: `10047`
- Release commit: pending Git commit and push; all validation and bundle
  verification are complete.
- Previous release code: `86ac0f8308bfe4155a0d72a2c7ed629f3bbfc801`
  (`1.0.44`, Claude's 3D fog/zoom fixes layered on top of the 1.0.43 work)
- Previous release handoff: `453fb85` (documentation-only follow-up for 1.0.44)
- Earlier release: `f0a17bb37a5f9602d705495e74f604238e953803`
  (`1.0.43`, Codex's 2D gesture-performance + mobile-UX pass — fully preserved)
- Baseline before that: `b302ec79920c3a4f4cbcff8c54476c2377c43a42`
  (`1.0.42`, Claude's Android autosave and lightweight 3D performance work)
- The combined 1.0.45-1.0.47 source and browser behavior are validated; final
  Android release validation is recorded below.
- Upload only the version-code `10047` AAB for this release; it supersedes the
  local 1.0.46 and 1.0.45 bundles, 1.0.44, and all 10043 builds.

## Work completed in 1.0.43

### 2D interaction performance

- Reworked touch pan and pinch zoom in
  `src/components/Editor2D/Canvas2D.tsx` so high-frequency pointer movement is
  handled imperatively through refs instead of committing every intermediate
  frame to the global Zustand store.
- A gesture now commits one final viewport update through `setViewport` when it
  ends. This reduces React renders, store notifications, and persistence work
  during continuous mobile gestures.
- Added focused Zustand selectors with `useShallow` where components previously
  subscribed to broad state objects, reducing unrelated editor rerenders.

### Mobile editor UX

- Refined the bottom tool/navigation layout to make the editor easier to use on
  phone-sized screens and closer to the direct workflow of Planner 5D.
- Improved tool-dock, toolbar, build-sheet, properties-panel, and floor-switcher
  responsive behavior.
- Made the floor switcher more compact on mobile while preserving multi-floor
  controls.
- The furniture catalog is unmounted while closed instead of remaining as a
  hidden active subtree.
- Selecting an object from the catalog closes the catalog on mobile, returning
  focus and screen space to the plan immediately.
- Updated responsive styling in `src/index.css` for clearer hierarchy, spacing,
  hit targets, and bottom-safe-area behavior.

### Store and test support

- Added the store-level `setViewport` action used to commit a completed gesture.
- Updated `tests/smoke.mjs` so the Vite launcher works reliably on Windows by
  invoking the Node entry point directly.

## Work completed in 1.0.44

3D-view fixes for a Pixel 8 report, layered on top of 1.0.43 (the 1.0.43 pass
did not touch the 3D view). No 1.0.43 work was reverted.

- **Fog whiteout on zoom-out** (`src/components/Viewer3D/Scene3D.tsx`): distance
  fog ran `radius*5 .. radius*14`, inside the max orbit distance (`radius*8+20`),
  so zooming out faded the whole model to the fog colour. Moved fog past the
  orbit range (`radius*8+15 .. radius*18+80`) so it only softens the far
  ground/grid horizon, never the building. Verified headless at max zoom-out.
- **Fade-to-black on zoom-in**: raised `OrbitControls` `minDistance` 2 → 3 so a
  full dolly-in can no longer end up inside the geometry.
- **Top-left overlap** (`src/App.tsx`): the floor switcher is hidden while a draw
  gesture is active (`!drawing`), so its top-left controls no longer collide
  with the centred "Tap points / Finish" pill on phones.
- The reported 3D shadow trail while dragging furniture was already resolved by
  1.0.42's low-power tier (touch devices render no shadows).

## Work completed in 1.0.45

### 2D build-mode clarity

- The phone Build tab now remains highlighted after the sheet closes and shows
  the armed action (for example, `Draw walls`) instead of falling back to the
  generic `Build` label.
- Furniture and opening placement now show a persistent, cancellable instruction
  pill above the canvas (`Tap the plan`, `Tap a wall`, or `Tap a floor`). This
  keeps the current action obvious after the mobile catalog/sheet is dismissed.

### Direct 3D furnishing

- Added an `Objects` entry point to the desktop 3D action strip and a dedicated
  `Objects` tab beside `Edit` on phones.
- The existing searchable catalog can now be used without leaving 3D.
- Selecting an object and tapping a room floor places it at the tapped plan
  position, selects it for immediate editing/rotation, and records the normal
  undoable design commit.
- Placement mode owns floor taps, so the material palette cannot accidentally
  open while the user is adding an object.
- Repositioned the phone 3D HUD, menus, rotation pill, and render strip to clear
  the two-tab bottom navigation and safe area.

### Regression coverage

- Extended `tests/smoke.mjs` to verify the 3D Objects entry point, docked catalog,
  and placement guidance in addition to the existing 3D mount/rotation checks.

## Work completed in 1.0.46

### Room-bounded wall painting

- A wall tap in 3D now resolves the exact side and room-boundary interval under
  the pointer instead of repainting the entire structural wall.
- Added backward-compatible `faceFinishes` data to walls. One long wall can now
  carry different colors or textures for adjacent rooms and for its opposite
  side without being physically split.
- Finish layers intersect the existing solid wall spans, so doors and windows
  remain cut out and are never covered by the paint overlay.
- Both the quick 3D palette and the Properties panel show `Wall section` context
  and edit only the tapped section. Explicit `Apply to all walls` still resets
  section overrides and applies a whole-home finish.
- Room-style application also clears stale per-face overrides on its target
  walls, keeping the one-tap style result deterministic.

### Regression coverage

- Added a focused two-room/one-long-wall smoke case verifying that taps resolve
  to separate 4 m and 6 m faces and that both finishes remain independent.

## Work completed in 1.0.47

### Furniture discovery and preview

- Catalog item taps now open a real interactive 3D preview before placement.
  The preview uses the same optimized GLB where one exists and the same
  procedural mesh fallback used by the design scene, so it accurately reflects
  what will be placed. Users can orbit/zoom it and see its dimensions.
- Placement is an explicit second action from the preview. Pro objects remain
  previewable by everyone; their placement button opens the existing unlock
  flow.
- Added Room/Type catalog browsing. Type navigation groups the growing catalog
  into seating, tables, storage, beds, kitchen, bathroom fixtures, workspace,
  lighting, decor, outdoor, and other, while preserving search and recents.
- Added `docs/MODEL_LIBRARY_STRATEGY.md` with vetted CC0 starting sources and a
  CDN/on-demand-cache plan for scaling beyond a bundle-sized model library.
- Release version has not yet been bumped for this in-progress batch.

### Galaxy S25 / high-refresh Android performance follow-up

- Reduced the live 2D Konva backing-buffer ratio from 2x to 1.5x on coarse
  pointers. On high-DPI phones this removes 44% of the canvas pixels redrawn
  during pan, pinch, and object movement; desktop and explicit exports retain
  their previous resolution.
- The main 3D orbit view now uses demand rendering and sleeps when the scene is
  unchanged instead of continuously drawing at the S25 display refresh rate.
  Walk mode deliberately keeps its continuous loop.
- Added adaptive DPR regression while orbiting, lowered the mobile ceiling to
  1.25x, and reduced the one-time mobile environment-map bake to 128px.
- Furniture previews also use demand rendering and a 1.25x DPR ceiling, which
  prevents an open catalog preview from running a second continuous WebGL loop
  alongside the design scene.
- Dollhouse wall fades explicitly request frames only until their opacity has
  settled, preserving the animation under the demand-rendering model.
- Fixed imperative 3D furniture dragging for demand rendering: every live
  transform now explicitly invalidates one frame, so dragged objects remain
  attached to the pointer instead of appearing sticky or updating late.
- Furniture interaction now raycasts one invisible bounding cuboid per object
  instead of recursively testing every decorative mesh in complex procedural
  furniture and GLBs on each pointer event. Non-interactive storeys and photo
  renders do not register furniture hit targets.
- Pointer cancellation now releases the drag and re-enables orbit controls,
  preventing an interrupted Android gesture from leaving the camera stuck.
- Removed fixed eager preloading of sofa, armchair, dining table, and dining
  chair GLBs. Entering 3D or opening the first preview now loads only models the
  current design/preview actually needs; repeated URLs still share useGLTF's
  cache.
- These changes are statically and browser validated, but still require a
  physical S25 trace to quantify GPU/frame-time improvement.

### Cloudflare R2 model storage

- Created the `homedesigner-models` R2 bucket in Western Europe (`WEUR`).
- Enabled its public development endpoint:
  `https://pub-6583adc5c7ee4926ae2b8037175a5dfc.r2.dev`.
- Added a public, read-only CORS policy for `GET` and `HEAD`, including `ETag`.
  Write methods are deliberately not exposed to app clients.
- Added `docs/CLOUDFLARE_R2.md` with endpoints, proposed object layout,
  credential rules, and cost-safety notes.
- The `r2.dev` endpoint is rate-limited and is for pipeline/app integration
  testing only. Connect a custom domain before production catalog delivery.
- The R2 plan has an included free allowance but no hard zero-cost cap. A `$1`
  monthly early-warning alert (`R2 $1 early warning`) was created for
  `nathanjoppich@gmail.com`. It is not an automatic spending cutoff. Keep upload
  credentials in local or CI secrets only.

### Remote catalog and first cloud-model batch

- Added a versioned runtime catalog loader in `src/lib/remoteCatalog.ts`. It
  fetches `catalog/v1/catalog.json`, validates and caches the manifest, blocks
  cloud entries from replacing bundled types/openings, requires same-origin
  HTTPS GLBs and CC0 provenance, and retains the bundled/cached catalog when
  the network is unavailable.
- The catalog displays cloud state/count and supports retry. New remote entries
  join the existing room/type navigation without requiring an app release.
- Remote GLBs load lazily in both the live 3D preview and the design scene. A
  missing or corrupt cloud model is contained by an error boundary and falls
  back to the procedural object rather than crashing the scene.
- Added a reproducible Blender-to-GLB import pipeline and a reviewed 32-object
  Quaternius Ultimate Home Interior batch. The optimized models are only
  207,368 bytes in total and all 32 pass `gltf-transform inspect`. The batch
  manifest records exact byte counts, SHA-256 hashes, and CC0 source metadata.
- Six representative cloud objects are free-tier; the remainder use the
  existing Pro placement gate. Already placed objects are never hidden.
- Reworked all sample homes to prefer the more realistic bundled Poly Haven
  types for sofas, chairs, tables, storage, desks, plants, and decor. This is
  independent of cloud availability, so samples stay complete offline. The
  samples now use real GLBs for 87 of 149 placements (58%), across 28 distinct
  modeled catalog types.
- Added deterministic smoke coverage for manifest ingestion. The test intercepts
  the R2 URL locally and proves a validated cloud object joins the live catalog
  without downloading its test GLB.
- Documentation: `docs/CLOUD_MODEL_CATALOG.md`,
  `scripts/model-catalog/export_blend_batch.py`,
  `scripts/model-catalog/build_manifest.mjs`, and
  `scripts/model-catalog/quaternius-ultimate-home-batch.json`.
- Publication status: **live on the R2 development endpoint as of 2026-07-15**.
  All 32 GLBs were uploaded below
  `models/quaternius/ultimate-home-interior/`, then the manifest was published
  last at `catalog/v1/catalog.json`. Every public GLB returned HTTP 200 with the
  exact manifest byte count. The public manifest also returned HTTP 200 as
  `application/json`, contained 32 entries, and matched the local 23,066-byte
  release file exactly (SHA-256
  `b2ececac9c647486dd4341837f290a6270f4b4d870a1c6c27300179dd9f987ba`).

## RevenueCat note (correction to the 1.0.43 note below)

The Android RevenueCat key is a hardcoded constant in `src/lib/pro.ts`
(`REVENUECAT_ANDROID_KEY`), not read from `import.meta.env`. So a production web
build does **not** require `VITE_REVENUECAT_ANDROID_KEY` to ship working
billing; the key is compiled into the bundle from source. (Migrating it to an
env var is reasonable future work, but is not currently wired up.)

## Primary files changed

- `src/App.tsx`
- `src/components/BuildSheet.tsx`
- `src/components/CatalogSidebar.tsx`
- `src/components/Editor2D/Canvas2D.tsx`
- `src/components/FloorSwitcher.tsx`
- `src/components/PropertiesPanel.tsx`
- `src/components/ToolDock.tsx`
- `src/components/Toolbar.tsx`
- `src/components/Viewer3D/DesignScene.tsx`
- `src/components/Viewer3D/Furniture3D.tsx`
- `src/components/Viewer3D/GltfFurniture.tsx`
- `src/components/Viewer3D/Scene3D.tsx`
- `src/components/CatalogPreview.tsx`
- `src/data/furnitureCatalog.ts`
- `src/data/samples.ts`
- `src/index.css`
- `src/lib/remoteCatalog.ts`
- `src/lib/wallFaces.ts`
- `src/store/designStore.ts`
- `src/types/index.ts`
- `tests/smoke.mjs`
- `docs/CLOUD_MODEL_CATALOG.md`
- `docs/CLOUDFLARE_R2.md`
- `scripts/model-catalog/*`
- `package.json`, `package-lock.json`, and `android/app/build.gradle` for the
  version bump

## Validation completed

- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `node scripts/sync-version.mjs --check`
- Capacitor Android sync
- Android `bundleRelease`
- Browser smoke coverage for projects, editor load, 2D canvas, catalog object
  placement, nudge, delete/undo, shopping list, theme switching, 3D mount, and
  3D catalog/placement guidance and rotation, with no app page errors. The
  post-1.0.46 test also verifies a validated remote manifest entry appears.
- All 32 first-batch optimized GLBs pass `gltf-transform inspect`; the complete
  batch is only 207,368 bytes before HTTP transfer compression.
- Wall-face regression coverage verifies two adjacent rooms retain independent
  paint intervals on one long structural wall.
- Manual desktop and phone-size browser checks confirmed direct floor placement
  in 3D, room-section painting, and the persistent active build-tool label in 2D.
- A signed `1.0.47` / version-code `10047` AAB was built after the production
  web build and Capacitor Android sync. Its JAR signature is valid and its
  signer SHA-256 fingerprint matches the verified upload certificate below.
- The final AAB is 18,441,015 bytes and has SHA-256
  `cb4306c570a34609bb2b587c62397c8199c13c581e24ce305efe2c7c44fdfcc9`.
- The complete 1.0.47 release passes typecheck, lint, production web build,
  version consistency, diff check, and the full browser smoke suite.

## Android release notes for future agents

- `android/keystore.properties` and `android/keystore/*.jks` are intentionally
  ignored and local-only. Never stage, log, or commit them.
- The verified signing-certificate SHA-256 fingerprint for the local upload key
  is:
  `EE:D4:E3:A9:11:BC:92:9A:D3:CD:33:36:FF:BF:32:C0:22:4A:1F:C5:21:BE:B1:13:02:F5:A0:7E:5F:00:6A:00`
- Confirm that fingerprint against Google Play Console's upload certificate
  under App integrity if Play rejects a future upload.
- RevenueCat currently uses the hardcoded public Android SDK key in
  `src/lib/pro.ts`; `VITE_REVENUECAT_ANDROID_KEY` is not read by the app. Keep
  private RevenueCat and Google service-account credentials out of the repo.
- Release sequence:
  1. bump `package.json`;
  2. run `npm run sync-version`;
  3. run the production web build;
  4. run `npx cap sync android` (or the Capacitor CLI entry point directly);
  5. run `android/gradlew bundleRelease`.

## Known non-blocking build warnings

- The Three.js vendor chunk is large; additional lazy loading/code splitting is
  still worthwhile.
- Capacitor filesystem and RevenueCat load the Kotlin Gradle plugin in multiple
  subprojects.
- Android's generated Gradle files use `flatDir` repositories.
- Some deprecated Gradle behavior will need cleanup before Gradle 9.

## Recommended next work

1. Profile 2D gestures and large projects on a mid-range physical Android phone.
2. Measure component commits with React Profiler before broad store refactors.
3. Continue splitting heavyweight 3D/import code from the initial editor path.
4. Preserve the gesture rule: update visual state locally per frame and commit
   durable global state only at interaction boundaries.
5. Keep release credentials outside the repository and rotate any credential
   that is ever pasted into chat, logs, source, or issue trackers.
