# HomeDesigner AI engineering handoff

> Intended for Codex, Claude Code, and other coding agents working on this
> repository. This file is tracked by Git and is **not access-controlled**;
> never place credentials, passwords, private keys, or signing material here.

Last updated: 2026-07-14

## Current release state

- Branch: `claude/home-design-app-2d-plans-12y5u5`
- Current release: `1.0.43`
- Android version code: `10043`
- Release commit: `f0a17bb37a5f9602d705495e74f604238e953803`
- Previous baseline: `b302ec79920c3a4f4cbcff8c54476c2377c43a42`
  (`1.0.42`, Claude's Android autosave and lightweight 3D performance work)
- The release commit is present on GitHub and the local tree matches its remote
  tree exactly.

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

## Primary files changed

- `src/App.tsx`
- `src/components/BuildSheet.tsx`
- `src/components/CatalogSidebar.tsx`
- `src/components/Editor2D/Canvas2D.tsx`
- `src/components/FloorSwitcher.tsx`
- `src/components/PropertiesPanel.tsx`
- `src/components/ToolDock.tsx`
- `src/components/Toolbar.tsx`
- `src/index.css`
- `src/store/designStore.ts`
- `tests/smoke.mjs`
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
  3D rotation, with no browser errors
- A signed `1.0.43` AAB was built and its JAR signature was verified.

## Android release notes for future agents

- `android/keystore.properties` and `android/keystore/*.jks` are intentionally
  ignored and local-only. Never stage, log, or commit them.
- The verified signing-certificate SHA-256 fingerprint for the local upload key
  is:
  `EE:D4:E3:A9:11:BC:92:9A:D3:CD:33:36:FF:BF:32:C0:22:4A:1F:C5:21:BE:B1:13:02:F5:A0:7E:5F:00:6A:00`
- Confirm that fingerprint against Google Play Console's upload certificate
  under App integrity if Play rejects a future upload.
- Production web builds require `VITE_REVENUECAT_ANDROID_KEY`. It is a public
  SDK key but should still be supplied through the environment rather than
  committed. The 1.0.43 Android build used the value retained in the previous
  compiled app.
- Release sequence:
  1. bump `package.json`;
  2. run `npm run sync-version`;
  3. run the production web build with the RevenueCat Android key;
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
