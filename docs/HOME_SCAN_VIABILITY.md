# Home scans via 3D Gaussian Splatting — viability

Draft **2026-08-26**. Assesses adding "scan your actual home" to HomeDesigner
using the method at
[`graphdeco-inria/gaussian-splatting`](https://github.com/graphdeco-inria/gaussian-splatting).

---

## Verdict

**The technique is viable. That specific repository is not, and a splat on its
own does not give this app what it needs.**

Three findings, in the order they kill or reshape the idea:

1. **The linked repo is licensed non-commercial.** It cannot ship in a paid app.
   This is not a technicality that can be worked around by self-hosting.
2. **A splat is captured *appearance*, not *geometry*.** HomeDesigner's whole
   value is editable walls, rooms and furniture. A splat has no walls, no
   collision, no shadows, and cannot enter Photo Mode. It renders beautifully
   and edits not at all.
3. **Training cannot run in the browser, on Capacitor, or on a Cloudflare
   Worker.** It needs a GPU container for minutes per scan — a class of
   infrastructure this project has deliberately never taken on.

What is worth building is the **thing the scan is for**: turning a phone walk
through a room into *measured walls* the 2D editor can already use. Splatting
is one possible means to that end, and not the cheapest one.

---

## 1. The licence blocker

The repository's `LICENSE.md` is the Inria/MPII "Gaussian-Splatting License",
not an open-source licence:

> "THE USER CANNOT USE, EXPLOIT OR DISTRIBUTE THE *SOFTWARE* FOR COMMERCIAL
> PURPOSES WITHOUT PRIOR AND EXPLICIT CONSENT OF LICENSORS."

Permitted use is research and evaluation only. Commercial licensing goes
through `stip-sophia.transfert@inria.fr`.

HomeDesigner is `"license": "UNLICENSED"`, proprietary, sells Pro on Play and
Stripe, and sells points. Any use of that code in the product — including
server-side, where nothing is distributed to users — is commercial exploitation
under this licence. `docs/MODEL_LIBRARY_STRATEGY.md` already holds the correct
line on this for assets ("only ingest assets whose license permits commercial
use"); the same standard applies to the reconstruction code.

**This does not block the technique**, only that implementation. 3DGS is a
published method, and there are permissively licensed re-implementations:

| Implementation | Licence | Note |
| --- | --- | --- |
| [`nerfstudio-project/gsplat`](https://github.com/nerfstudio-project/gsplat) | Apache-2.0 | Clean re-implemented CUDA rasterizer; faster and lower-memory than the original. The realistic training backend. |
| [`ds-splat`](https://pypi.org/project/ds-splat/) | Apache-2.0 | Second permissive rasterizer implementation. |
| [Spark](https://github.com/sparkjsdev/spark) | MIT | THREE.js *renderer*, targets 98%+ WebGL2 devices. |
| [GaussianSplats3D](https://github.com/mkkellogg/GaussianSplats3D) | MIT | THREE.js renderer; no longer actively developed. |

So: **if we ever do this, we build on `gsplat`, not on the linked repo.** Worth
noting for the record even if we go a different route, because the two are easy
to conflate and the licence difference is the whole ballgame.

COLMAP (the structure-from-motion step that produces camera poses) is BSD and
fine commercially.

---

## 2. The geometry gap — the finding that actually matters

Even with a licence-clean pipeline, ask what the user gets. A splat is a few
million anisotropic blobs with position, scale, rotation, opacity and view-
dependent colour. It is superb at *looking* like the room. It contains no
notion of a wall, a floor plane, a doorway or an object.

Against this codebase specifically:

| App capability | Works on a splat? | Why |
| --- | --- | --- |
| Draw / edit walls (`src/types/index.ts` `Wall`) | **No** | Nothing to edit. Splats aren't segments with thickness and height. |
| Room detection, area, BOM (`src/lib/roomDetection.ts`, `bom.ts`) | **No** | Needs closed polygons in cm. |
| Walkthrough collision (`src/components/Viewer3D/WalkControls.tsx:184`) | **No** | Collision is built from wall segments; a splat gives none. |
| Real-time shadows / sun (`src/lib/sun.ts`) | **No** | Splats neither cast nor receive scene shadows. Lighting is baked into the capture. |
| **Photo Mode** (`src/components/Viewer3D/PhotoMode.tsx:8`) | **No** | `three-gpu-pathtracer` traces a triangle BVH. Splats are not triangles. A scan would be invisible in the app's flagship render. |
| DXF / PDF plan export (`src/lib/dxfExport.ts`, `planExport.ts`) | **No** | Vector export needs vector input. |
| Look at your real room in 3D | **Yes** | This is the one thing it does well. |

Which means a splat import lands as a **decorative backdrop the rest of the app
cannot see** — placed furniture would float through it unshadowed, Photo Mode
would render an empty scene, and the shopping list would stay empty. That is a
demo, not a feature, and it would be judged against everything else in the app
that *is* joined up.

To close the gap you need mesh or plane extraction on top (SuGaR, 2DGS, or
plane-fitting the splat cloud) — which is a second research-grade stage with its
own quality risk, and whose *output* is the thing we actually wanted. That is
worth noticing: **if the deliverable is walls, splatting is an expensive detour
to get them.**

---

## 3. Where the compute would have to live

Training a room-scale scene is minutes of dedicated GPU, preceded by COLMAP
pose estimation which is often the slower and more fragile half.

| Candidate host | Verdict |
| --- | --- |
| Browser / Capacitor WebView | No. No CUDA, no memory headroom; minSdk is 24 (`android/variables.gradle:2`). |
| Cloudflare Worker | No. CPU-time limited, no GPU. `docs/AI_FEATURES_PLAN.md` already rules out even *mesh optimization* server-side as "a queue/container project, not an afternoon" — this is an order of magnitude beyond that. |
| GPU container (Replicate / Modal / RunPod / fal) | Feasible, and the only realistic option. |

This is the second structural cost: the project's entire backend is one Worker
plus R2 plus D1. Self-hosting 3DGS training means adding a job queue, GPU
autoscaling, per-job timeouts, retry/refund semantics and a failure budget for
captures that simply don't converge — and scans *do* fail, on blank walls,
glass, mirrors and low light, all of which are abundant indoors.

A hosted API avoids that. Note that **fal — already integrated, already funded,
already priced into the points ledger — does not appear to expose a
video→3DGS endpoint**; its 3D surface is single-image mesh generation
(Hunyuan3D, TRELLIS). So this would be a *new* vendor relationship, not an
extension of the existing one. That matters: §5 of the AI features plan is built
around keeping a float topped up at *one* provider.

---

## 4. Delivery and rendering on the client

Assume a finished splat. Shipping it to a phone is tractable but not free.

- **Size.** Raw PLY for a 4M-gaussian scene is ~1 GB. PlayCanvas's
  [SOG](https://blog.playcanvas.com/playcanvas-open-sources-sog-format-for-gaussian-splatting/)
  format gets the same scene to ~42 MB (15–20× vs PLY), and is stored GPU-ready
  in Morton order so it needs no processing on load. SPZ and KSPLAT are similar
  in spirit. **A per-room scan at web-sane quality is a tens-of-MB asset** —
  compare the current catalogue's 1–3 MB per furniture GLB target.
- **Storage.** R2 already exists, but `docs/AI_FEATURES_PLAN.md §3a` flags that
  user-generated models have **no TTL today** and that storage "grows without
  limit and never falls". A 40 MB scan per user per room makes that latent
  problem acute. A scan feature must ship with retention from day one.
- **Renderer.** MIT options exist (Spark, GaussianSplats3D), and three.js has
  native splat support landing upstream. But the app is pinned to
  **three 0.169** with `@react-three/fiber` 8 and a matched
  `@react-three/postprocessing` 2.19.1 / `postprocessing` 6.37.8 pair — a
  deliberately conservative, working stack. Splat renderers move fast and expect
  recent three. This is a real upgrade-pressure cost, not a drop-in.
- **Performance.** Sorting millions of gaussians per frame on a mid-range
  Android device, in a WebView, *alongside* the existing scene, is the
  open question. `src/lib/perfTier.ts` exists precisely because this audience is
  mostly phones, and its 'low' tier already turns off post-processing. A splat
  layer would need its own tier gate and would plausibly be 'high'-only —
  i.e. unavailable to much of the user base.

---

## 5. What it would cost, under the existing points model

`docs/AI_FEATURES_PLAN.md` prices at **$0.000375 of real spend per point**, and
G1 says price against the worst case. A hosted room scan is realistically
$0.50–$2.00 of GPU per attempt depending on vendor and quality, plus storage.

At that basis a single scan is **1,300–5,300 points** — the most expensive
thing in the app by a wide margin, against 1,800 for the current top-end
Pro + PBR 3D model. And §5's timing gap gets worse, not better: prepaid GPU
spend now, Google payout in 45 days.

It also lands squarely on the plan's §3a logic: 3D generation is being gated to
Pro *specifically* to cap free-tier exposure to fal. A scan feature is that same
exposure, several times larger. It would have to be Pro-only, points-metered,
rate-limited (G6), refunded on failure (G5) — and scan failure rates are much
higher than image→mesh failure rates, so G5's failure budget is materially
bigger.

**Content safety:** a photo scan of a real home is a step beyond text→3D in
`§3b`. It captures people, documents, the inside of someone's house. Private-by-
default is mandatory, retention must be short and stated, and it must never
become shareable to the community forum without a deliberate moderation design.
Play's UGC obligations and data-safety disclosures both bite here.

---

## 6. Options, ranked

### Option A — Scan → measured floor plan *(recommended direction)*

Capture a walk of the room; return **wall segments in cm** into the existing
editor. Everything downstream already works: rooms, furniture, walkthrough,
Photo Mode, BOM, DXF export.

This is what users actually want when they say "scan my home", and it is the
only option that compounds with what the app already does. Note the app already
owns the *hard-to-fake* half of this — `src/lib/autoTrace.ts` plus
`src/lib/wallBuilder.ts` turn detected segments into merged, editable walls, and
`src/lib/dxfImport.ts` proves the "external source → real geometry" path end to
end. A scan is a **new front-end onto a pipeline that already exists.**

Reality check on the capture side: **Apple's RoomPlan does exactly this,
on-device, in 60–90 seconds — and is iOS + LiDAR only.** HomeDesigner is Android
(Capacitor, minSdk 24) with no iOS build. ARCore has
[no equivalent room-scanning API](https://github.com/google-ar/arcore-android-sdk/issues/1772),
so on Android this is a server-side video→layout problem, either via a vendor or
built. That is the honest cost of Option A, and it is still smaller than
splatting *plus* mesh extraction.

### Option B — Splat as a viewing-only "memory" of the room

Ship the splat purely as a backdrop, clearly labelled as not editable. Cheapest
to build if a vendor API is used, and genuinely impressive on a good capture.
But it sits outside every system in §2, so it dead-ends — and it invites the
review "why can't I edit my scan".

### Option C — Self-hosted 3DGS on `gsplat`

Maximum control, no per-scan vendor fee, licence-clean. Also a GPU-infra
project, an ML-ops project, and a support burden, for a solo-maintained app
whose entire backend is one Worker. **Not now, and not for a first version.**

### Option D — Do nothing here; spend the effort on §7 of the AI plan

The sequencing in `docs/AI_FEATURES_PLAN.md` has cheap, high-margin,
Workers-AI-only features (room naming, colour schemes, auto-furnish, text→
layout) that are un-built and carry ~88–98% margin with no float exposure.
Scanning is the opposite of every one of those properties. **On sequencing
alone, scanning should come after all of them.**

---

## 7. Recommendation

**Don't build on the linked repository — it is licence-blocked for this product.
Don't self-host 3DGS. Do treat "scan my home" as a floor-plan capture problem,
and validate it with a vendor before writing any pipeline.**

Smallest experiment that produces a real answer, in order:

1. **Take a phone video of a real room and run it through two or three hosted
   scan services** (Polycam, KIRI Engine, and a video→3DGS vendor). Judge one
   thing only: *can wall positions and lengths be recovered to a few centimetres
   from the output?* If no, Option A is dead in its current form and the answer
   is Option D.
2. **Check their commercial API terms and per-scan price** before any code.
   Record provenance the same way `docs/MODEL_LIBRARY_STRATEGY.md` requires for
   assets.
3. **Only then** prototype an importer, targeting `wallBuilder.ts`'s existing
   segment→wall input so the whole editor comes along for free.
4. If a splat backdrop is wanted alongside the walls, add it as a **separate,
   'high'-tier-only, Pro-gated layer** with an explicit R2 TTL — and accept up
   front that it will not appear in Photo Mode.

Ship it Pro-only, points-metered, private-by-default, with retention stated
before the first scan is taken.

---

## 8. Open questions

1. Can any current hosted service return centimetre-accurate wall geometry from
   an Android phone video, without LiDAR? Everything above turns on this.
2. What does a scan actually cost per attempt at each vendor, and what is the
   failure rate on ordinary interiors (glass, mirrors, dim rooms, blank walls)?
3. Does any vendor's terms permit commercial use of the output inside a paid
   app, and does the user retain rights to their own scan?
4. What retention do we commit to for scan imagery, and what does that mean for
   the Play data-safety declaration?
5. Would a splat layer survive on a 'mid'-tier device, or is it 'high'-only in
   practice? Measure before designing UI around it.
6. Does adding a splat renderer force the three.js / R3F upgrade, and what does
   that do to `@react-three/postprocessing` and `@react-three/gpu-pathtracer`?
