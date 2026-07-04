# 🏠 HomeDesigner Free

A free, browser-based home design app in the spirit of [Planner5D](https://planner5d.com).
Import a 2D plan from a **PDF, image, or DXF (CAD)** file, **auto-trace the walls**,
then design your home in **2D** and walk through it in **3D** — adding rooms, floor
materials, and furniture.

Everything runs locally in your browser. Your project auto-saves to local storage.

## ✨ Features

- **Import & auto-trace** – Drop in a PDF / image floor plan and the app detects the
  walls automatically (run-based detection tuned for architectural plans), or import a
  DXF and get real, editable wall geometry with auto unit-scale detection.
- **2D floor-plan editor** – Draw walls (with angle/length readouts, grid snapping, and
  joint snapping), outline rooms, place furniture, and edit everything live.
- **3D view** – Instantly switch to a shaded, shadowed 3D walkthrough of your design.
- **Interior design** – 25+ furniture/object types across Living, Bedroom, Dining,
  Kitchen, Bathroom & Office, plus 8 floor materials. Resize, recolor, and rotate.
- **High-quality renders** – two levels:
  - **Render image**: a supersampled (3×) PNG of the 3D view with ambient occlusion
    (N8AO), soft shadows, bloom, ACES tone mapping, and offline image-based lighting —
    renders in ~1 second.
  - **Photo mode**: progressive **GPU path tracing** (global illumination, accurate soft
    shadows, glossy reflections) that refines into a near-photorealistic image you can
    save. Lazy-loaded so it never weighs down the editor.
- **Runs on Android** – packaged with **Capacitor** into a native app for the Google Play
  Store, from the same codebase. Renders save to the device and open the share sheet.
- **Undo/redo, autosave, pan/zoom**, and a clean dark UI.

## 🚀 Getting started

```bash
npm install
npm run dev      # http://localhost:5173
```

Build for production:

```bash
npm run build
npm run preview
```

## 🧭 How to use

1. **Import a plan** (toolbar → *Import plan*):
   - **PDF / image**: set the plan's real-world width so dimensions are correct, tune
     detection sensitivity, then **Auto-trace walls** — or keep it as a tracing
     background and draw over it.
   - **DXF**: walls are parsed straight into editable geometry.
2. **Draw / edit** with the Wall, Room, and Erase tools. Use **Select** to move and
   tweak anything. Properties appear on the right.
3. **Furnish** from the left catalog — click an item, then click in the plan to place it.
4. **Switch to 3D** (top-right) to view and walk through your design.

## 🖼 Rendering

- **Render image** button (3D view): supersamples the scene and saves a PNG. Uses
  `@react-three/postprocessing` (N8AO ambient occlusion, bloom, ACES tone mapping) over
  an offline `Environment` + `Lightformer` setup (no CDN HDR fetch).
- **Photo mode**: `@react-three/gpu-pathtracer` (three-gpu-pathtracer) progressively path-
  traces the same design with global illumination, lit by an offline gradient environment.
  Shows a live sample counter and caps at 400 samples; save the result as a PNG.

## 📱 Android (Capacitor) build

The same web app ships as a native Android app.

```bash
# one-time, after a code change:
npm run build && npx cap sync
npx cap open android        # opens Android Studio to run on a device/emulator
```

Release (signed AAB for the Play Store):

```bash
# 1. Create an upload keystore (keep it safe, never commit it)
keytool -genkey -v -keystore homedesigner-upload.jks \
  -keyalg RSA -keysize 2048 -validity 10000 -alias homedesigner

# 2. Copy android/keystore.properties.example -> android/keystore.properties
#    and fill in the paths/passwords (gitignored).

# 3. Build the bundle
cd android && ./gradlew bundleRelease
#    -> android/app/build/outputs/bundle/release/app-release.aab
```

Then in the Play Console: create the app, enrol in Play App Signing, upload the AAB to
the Internal testing track, and promote to Production. Bump `versionCode` in
`android/app/build.gradle` for each release.

Requirements: Node 22+, JDK 21, Android Studio (Otter/2025.2.1+). Targets compileSdk/
targetSdk 36, minSdk 24 — compliant with the Play Store's API-35+ requirement.

## 🛠 Tech stack

- **React + TypeScript + Vite**
- **react-konva / Konva** – the interactive 2D editor
- **react-three-fiber + three + drei** – the 3D viewport
- **@react-three/postprocessing** – render-quality effects (AO, bloom, tone mapping)
- **@react-three/gpu-pathtracer / three-gpu-pathtracer** – photorealistic Photo mode
- **Capacitor** – native Android packaging
- **pdfjs-dist** – PDF rendering
- **dxf-parser** – CAD/DXF parsing
- **zustand** – state management with undo/redo + autosave

## 📂 Project structure

```
src/
  components/
    Editor2D/Canvas2D.tsx     2D floor-plan editor (Konva)
    Viewer3D/DesignScene.tsx  shared geometry (walls/floors/furniture) + bounds
    Viewer3D/Scene3D.tsx      live 3D editor view + postprocessing + render export
    Viewer3D/PhotoMode.tsx    lazy path-traced photorealistic overlay
    Viewer3D/Furniture3D.tsx  per-type 3D furniture models
    Toolbar / CatalogSidebar / PropertiesPanel / ImportDialog
  lib/
    autoTrace.ts              automatic wall detection from raster plans
    dxfImport.ts              DXF → walls
    pdfImport.ts              PDF/image → canvas
    wallBuilder.ts            detected segments → merged walls
    geometry.ts               vector / polygon helpers
    renderBridge.ts           connects toolbar buttons to in-Canvas capture fns
    native.ts                 Capacitor save/share + back-button (web fallbacks)
  store/designStore.ts        app state (zustand)
  data/furnitureCatalog.ts    furniture & material catalog
  types/                      domain types
android/                      native Android project (Capacitor)
capacitor.config.ts           Capacitor configuration
```

## 🗺 Roadmap ideas

- Native DWG import (via a server-side LibreDWG/ODA converter)
- Doors & windows cut into walls as real openings
- Drag-resize furniture & wall handles directly on the 2D canvas
- First-person 3D walk mode
- Cloud save / project sharing
- iOS build (Capacitor also supports iOS from the same codebase)

---

HomeDesigner is a proprietary app with a free tier; see LICENSE for terms.
