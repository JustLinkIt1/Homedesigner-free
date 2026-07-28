# WIP handoff — HomeDesigner exteriors

Written at **1.11.0 (versionCode 11100)**, branch
`agent/catalog-performance-1.11.0`. Everything described as shipped is
committed and pushed. Read this before touching exteriors.

---

## 0. Read this first: the container rewinds

This environment reverted the working tree to an **old 1.4.0 snapshot three
separate times** during the last session, twice mid-edit. Symptoms: `git log`
shows `c4741d5 Release 1.4.0`, `src/lib/fence.ts` is missing, `package.json`
says 1.4.0, and files you just wrote are gone.

Nothing was ever lost, because every release was pushed. Recovery:

```bash
git fetch origin claude/home-design-app-2d-plans-12y5u5
git stash push -u -m "stale draft"          # NOT reset --hard
git merge --ff-only origin/claude/home-design-app-2d-plans-12y5u5
```

Two traps found the hard way:

- `git stash push -u` **also stashes untracked files**, which includes
  `public/models/*.glb` you just fetched. Recover them with
  `git checkout 'stash@{0}^3' -- public/models/`.
- The keystore survives rewinds (it is untracked and outside `src/`), but
  **verify it before every release build** — see §5.

**Commit and push early and often.** A checkpoint commit that typechecks is
worth more than an hour of unpushed work.

---

## 1. What is shipped

| Version | Content |
|---|---|
| 1.7.0 | Outdoor surfaces: `Room.outdoor` flag + paving/decking/gravel/asphalt/lawn |
| 1.8.0 | Fences: `Wall.kind` discriminator, 4 styles, merged geometry |
| 1.9.0 | The garden set: Outdoor 5 → 19 entries, procedural foliage |
| 1.10.0 | Gardens in all four samples; `tests/samples.mjs` clash suite; Patio Slider |
| 1.10.1 | Sliding doors rebuilt (they rendered as an opaque grey slab) |
| 1.11.0 | Lazy photoreal catalogue cards, favourites, and on-demand 3D previews |

### Catalogue state at 1.11.0

- Cards use lazy-decoded top-down WebP renders when the sprite pipeline has an
  asset, and fall back to the existing lightweight SVG plan symbol.
- Selecting a card does **not** import Three.js or create a preview WebGL
  context. The one rotatable canvas mounts only after **View in 3D** is pressed.
  Keep this boundary: the catalogue is usable beside the live 3D scene, where a
  second eager context was a measurable software-rendering and phone-GPU cost.
- `src/lib/favorites.ts` stores a device-local ordered set under
  `homedesigner.favorites.v1`. It is deliberately not project or undo state.
- The browser suite asserts the zero-canvas selection path, sprite card,
  favourites row and opt-in 3D path. The pure suites use the esbuild JS API so
  they run cross-platform.

### Phase C status

- **C1 + C2 (ground / hardscape)** — done, 1.7.0.
- **C3 (boundary)** — done, 1.8.0.
- **C4 (new shapes)** — done for the garden, 1.9.0.
- **Phase D (exterior render mode)** — **not started.** Path tracer honouring
  `sunTime`, camera presets, PhotoMode rig reconciliation.

---

## 2. Architecture decisions worth not re-litigating

**Outdoor areas are Rooms with a flag, not a new type.** `Room.outdoor?: boolean`
(`src/types/index.ts`). Drawing, reshaping, area readout and snapshots all work
for free. The flag changes three things in `DesignScene.tsx`: the area draws on
the ground with a hardscape surface, gets **no floor slab**, and gets **no
ceiling**. Without both exclusions a patio renders as a windowless box.

**Fences are Walls with a flag, not a new type.** `Wall.kind?: 'wall' | 'fence'`
plus `Wall.fenceStyle`. Same reasoning. The critical part is that a fence leaves
the *building*: filter with `structuralWalls()` from `src/lib/fence.ts` before
room detection, roof outlines and exterior cladding. Call sites already fixed:

- `designStore.ts` — `detectRoomsFromWalls`, `applyExteriorFinish`
- `DesignScene.tsx` — `roofOutlines`, `exteriorFaces`
- `PropertiesPanel.tsx` — `roofFootprint`
- `samples.ts` — `exteriorFaces`

**If you add another consumer of `walls`, decide which side it is on.** Barriers
(walk collision, snapping, the 2D plan) keep fences; building logic filters them.

**Fence geometry is merged.** A 10m picket fence is ~90 boxes; as individual
meshes that is 90 draw calls for one garden edge. `FenceMesh` merges frame and
infill separately so they can be shaded apart without a second material on one
buffer. `fenceRunBoxes()` in `src/lib/fence.ts` is pure and unit-tested.

---

## 3. The models decision — do not redo this research

**Poly Haven trees cannot ship.** Measured, not assumed:

| Asset | Raw | After the standard quantize+webp pass |
|---|---|---|
| `island_tree_01` | 63 MB | **36.7 MB** at 256px textures — 28x over budget |
| `jacaranda_tree` | 205 MB | not attempted |
| `fir_tree_01` | 465 MB | not attempted |

The cost is leaf **geometry**; texture settings do not touch it. Poly Haven's
`shrub_*` assets are wild-nature scatter (sparse dry twigs ~40cm), not garden
shrubs. Kenney's Nature Kit trees are 5–17 KB and fit trivially but are
flat-shaded low-poly and clash badly with the photoreal furniture — verified by
rendering them side by side.

**Therefore foliage is procedural**, like the ground/roofs/fences:
`getFoliageTexture` / `getBarkTexture` in `src/lib/textures.ts`, consumed by the
`tree` / `hedge` shapes in `Furniture3D.tsx`. Canopies are three offset lobes —
one sphere reads as a lollipop from every angle.

**Still not found anywhere CC0:** nothing. BBQ, parasol and sun lounger were
also absent from Poly Haven and Kenney, so they are procedural too (`bbq`,
`parasol`, `lounger` shapes) and they render correctly.

### Adding a model

1. Add a row to `LIST` in `scripts/fetch-models.mjs`
   (`[type, polyhavenId, name, category, w, d, h, shape, color]`).
2. `node scripts/fetch-models.mjs` — skips existing files, drops anything over
   1.3 MB, prints paste-ready snippets.
3. Add the catalog entry in `src/data/furnitureCatalog.ts` and the
   `MODEL_FILE` mapping in `src/data/furnitureModels.ts`.
4. Regenerate 2D sprites (below).

### Adding a procedural shape

`Shape3D` member in `furnitureCatalog.ts` → `case` in `ShapeMesh`
(`Furniture3D.tsx`) → **`SYMBOLS` entry in `src/lib/symbols.ts`** → catalog
entry → locale key. Skip the symbol and the 2D plan silently falls back to a
generic box, which is half the app looking wrong.

**Cloud catalog constraint:** `remoteCatalog.ts:42` restricts remote entries to
shapes already bundled in the app, so a genuinely new shape must ship in a
release — it cannot be pushed remotely afterwards.

### Regenerating sprites

```bash
node node_modules/vite/bin/vite.js --port 5209 --strictPort &
CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
  node scripts/render-sprites.mjs
```

`render-sprites.mjs` now honours `CHROMIUM_PATH` (it previously hard-failed
looking for a headless-shell build that is not installed here). It rewrites
`src/data/furnitureSprites.ts` wholesale.

---

## 4. Testing

```bash
npm run typecheck && npm run lint          # eslint --max-warnings 0
node tests/geometry.mjs                    # pure Node, fast
CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node tests/smoke.mjs
```

Current: **98 browser checks + geometry green.**

Hard-won testing notes:

- **Run the smoke suite alone.** Running `npm run build` or another suite
  concurrently starved it into false failures twice.
- **Delete `tmp-*.mjs` probes before linting** — they trip `no-undef` on
  `process`/`fetch`/`window` and fail the whole lint gate.
- The **long-press block runs in its own page** deliberately. It was flaky in
  both directions when it shared the main page, because ~50 prior interactions
  left stage state that intermittently swallowed the synthetic touch entirely.
  In a clean page the same gesture is deterministic 8/8. Do not "simplify" it
  back onto the shared page.
- Assertions that poll (`did the menu appear at any point`) beat single-instant
  reads for anything on a timer.

---

## 5. Releasing (Play)

Full runbook in `RELEASING.md`. Short version:

```bash
npm run build && npx cap sync android
cd android && ANDROID_HOME=/home/user/android-sdk ./gradlew bundleRelease --no-daemon
```

Output: `android/app/build/outputs/bundle/release/app-release.aab`.

**Always verify the signer before delivering:**

```bash
keytool -printcert -jarfile android/app/build/outputs/bundle/release/app-release.aab
```

Must be `EE:D4:E3:A9:11:BC:92:9A:D3:CD:33:36:FF:BF:32:C0:22:4A:1F:C5:21:BE:B1:13:02:F5:A0:7E:5F:00:6A:00`
(`CN=Nathan Joppich`). That is the **upload** key. The other fingerprint in Play
Console (`97027CB7…`) is Google's app-signing key — not this one.

Also worth confirming the bundle really contains the new code, not a stale
build: unzip it and grep `base/assets/public/assets/*.js` for a string only the
new version has.

`android/keystore/homedesigner-upload.jks` and `android/keystore.properties`
**must stay gitignored**. `mcp__github__actions_run_trigger` returns 403 here,
so AABs are built locally, not by the workflow.

AABs delivered so far: 1.8.0 (10800), 1.9.0 (10900), 1.10.1 (11001),
**1.11.0 (11100)**. The 1.11.0 bundle is 29,512,085 bytes, SHA-256
`D539D0561140CFE4F8CED78689500531846A9E9ADC9E5DA9453B64B059480E6D`, and
was verified against the expected Nathan Joppich upload certificate.

---

## 6. Next up (owner's queue)

Three features, in the order the owner asked for them.

### 6.1 Half walls / pony walls

A wall that stops below ceiling height: room dividers, kitchen islands, stair
balustrades, bath surrounds.

Do it the way `Room.outdoor` and `Wall.kind` were done — **a flag on Wall, not a
new type**. `Wall.height` already exists and is per-wall, so a half wall is
largely "a wall with a lower height plus a capped top". What actually needs
work:

- **A visible cap.** `WallMesh` already draws a planner-style top cap; check it
  reads correctly at 90–110cm rather than only at 275cm.
- **Openings.** `wallSpans` extends the outermost spans by half a thickness for
  corner solidity; at low heights that overhang is proportionally larger. Verify
  a half wall meeting a full wall does not produce a visible nib.
- **Roofs and rooms.** A half wall still encloses a room (unlike a fence), so it
  must stay in `structuralWalls()`. But confirm `detectBuildingOutline` does not
  let an internal half wall distort the eave outline.
- **Dollhouse fade.** Half walls should probably never fade — they are already
  below sightline. `WallMesh` registers every wall with the fade loop; add an
  opt-out.
- **Walk collision** must still block at half height (`buildWalkWallSegments`).

Suggested shape: `Wall.half?: boolean` (or reuse `kind: 'half'`) plus a default
height around 105cm, with the same "adopt a sensible height on conversion, but
keep a height the user set themselves" rule `FenceCard` already implements.

### 6.2 Niches / recesses

An inset box in a wall — shower niche, display recess, alcove.

Two plausible models, and the choice matters:

1. **As an opening variant** (`OpeningStyle: 'niche'`) — reuses `wallSpans`,
   which already cuts the wall correctly, and gets 2D symbol + Properties for
   free. The niche then needs a **back panel** so you do not see straight
   through the wall: that is the whole implementation.
2. As furniture — simpler, but it will not cut the wall, so it can only ever be
   a box stuck on the surface. Not recommended.

Go with (1). `wallSpans` already produces sill and lintel pieces for windows, so
a niche is a window whose opening is capped at the back and has no glazing.
Watch the `sill`/`height` semantics — a niche is defined by sill, height and
**depth**, and depth has no field yet on `Opening`.

### 6.3 LED strip lighting

**Partly shipped already.** `led_strip` and `cove_light` exist as catalog
entries and shapes (`Furniture3D.tsx`, `case 'led_strip'`), each an emissive bar
plus a `LampLight`. Both are Pro. What is missing is that they are **single
120cm objects**, so lighting a run means placing eight of them by hand.

The real feature is a **run**, like `addKitchenRun` already does for cabinets:
drag along a wall or a cabinet line and get a continuous strip. Look at
`kitchenRunUnits` in `src/lib/kitchenRun.ts` for the established pattern — it
tiles units along an a→b segment in one undo step.

Also worth checking before building: `LampLight` per strip segment means N real
lights in the scene. A long run must **not** add N point lights — tile the
emissive geometry but cap the actual light count (one every ~2m, or one per
run), or the 3D view will crawl on a phone. Measure it.

## 7. Known cosmetic debt

- Twelve wall-texture declared colours drift from their images (`marble_01`
  declares `#ece9e4`, measures `#b09c79`). Cosmetic, never chased.
- The `.sidebar:not(.right)` docking margin is **deliberately not transitioned**
  (see the comment in `index.css`). A wedged CSSTransition pinned the computed
  margin at `-281px` and left the docked catalog permanently off-screen. If the
  animation is ever wanted back, animate a compositor property on an inner
  wrapper — never the margin that owns the layout.
