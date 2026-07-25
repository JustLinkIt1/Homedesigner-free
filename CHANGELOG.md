# Changelog

All notable HomeDesigner Free release changes are recorded here, newest first.
Versions map to `package.json` `version` and the Android `versionCode`
(`1.0.NN` → `100NN`). Agents working in this repo: read this file before making
changes and add an entry when you ship one.

## 1.0.96 - 2026-07-25 (versionCode 10096)

Phase B: roofs. HomeDesigner could not draw one at all, so with dollhouse off the
exterior was an open-topped box. Now the building generates its own roof from the
walls you already drew — gable, hip, shed or flat — which is the last thing that
was stopping 3D from producing a usable external view.

### Added — generated roofs
Roofs are derived, not drawn. `detectBuildingOutline` (src/lib/roomDetection.ts)
recovers the building perimeter that the room walk was already computing and then
throwing away, and `offsetPolygon` (src/lib/polygonOffset.ts) pushes it out to the
outer wall face and again to the eave line. No offset/union library was added —
clipper or polygon-clipping would have cost 40-90 KB gzipped in the APK for this
one feature — so the offset is purpose-built, miter-limited, and validated: any
degenerate result falls back to the un-offset outline, because a roof flush with
the walls looks far better than a roof with a spike through it.

Four shapes (src/lib/roofGeometry.ts):
- **flat** extrudes the footprint and is exact for any polygon, concave included.
- **shed** tilts the real outline, so it is also exact for any polygon.
- **gable / hip** are built over the footprint's oriented bounding box. A true
  hip over an arbitrary concave plan needs a straight skeleton — 800+ lines,
  fragile at degenerate events, and prone to emitting broken meshes on user-drawn
  geometry. An OBB roof is correct for the rectangular-ish footprints that cover
  most houses, and anything markedly non-rectangular falls back to flat with the
  Roof card saying so rather than silently disagreeing with the picker.

Gable ends and the strip under the eaves are filled on the **wall** outline, not
the eave outline, and rendered in the wall colour rather than roofing — without
that you look straight in under the raised end of a shed roof and through the
open triangle of a gable. The fill follows the roof's underside exactly: creases
(the ridge, and a hip's end slopes) are solved analytically and inserted as extra
split points, so the gable triangle peaks at the ridge instead of being capped flat.

Six coverings — clay tile, grey tile, slate, shingle, cedar shake, standing-seam
metal — are procedural (`getRoofTexture`, src/lib/textures.ts). Nothing bundled
reads as roofing (a floor tile stretched over a slope looks wrong at roof scale)
and photographic roof sets would add real APK weight, so this follows the same
zero-bytes route the lawn already took. Roof UVs are projected per face onto each
triangle's own plane, so tiles aren't foreshortened by 1/cos(pitch) on the slopes.

### Changed
- `useDesignBounds` now accounts for the roof's rise and overhang. It feeds the
  camera, the fog range **and** the sun's shadow frustum, so a roof that didn't
  update it would have been silently clipped.
- The roof lives on the top storey, and `normalizeRoofs` re-homes it whenever the
  storey stack changes — add a floor above a roofed house and the roof moves up
  with it instead of being buried inside the new storey. Existing saves have no
  roof and are returned untouched.
- `scaleDesign` scales the eave overhang (a plan-space distance, like wall
  thickness) and leaves the deck thickness alone (a real-world vertical size).

### Tests
`tests/geometry.mjs` grows to 45 pure-Node assertions covering the offset, the
oriented box, outline recovery, all four roof shapes, the end infill and the
cross-storey re-homing. This is geometry that decides real building shapes; it is
exactly the kind of thing that must not be validated by eyeball.

## 1.0.95 - 2026-07-25 (versionCode 10095)

Completes the 3D visual pass (Phase A). Roof next.

### Added — surface relief without shipping a single extra byte
Our material library is albedo-only. Bundling Poly Haven's real normal/roughness
maps for all 30 materials would roughly triple texture weight in the APK, which is
not a good trade for a phone app. Instead `derivedNormalTexture` (src/lib/textures.ts)
treats luminance as a height field and Sobel-filters it into a tangent-space normal
map at load time, cached and wrapped so tiling still lines up. Not physically exact —
luminance only correlates with height — but on brick, plaster, stone, gravel and
timber it reads convincingly. Wired into wall materials and floors (both the built-in
photoreal textures and user uploads), and skipped on the low tier where the pass
isn't worth the CPU.

### Added — one-tap exterior cladding
Painting an outside wall face already worked, but was effectively unreachable:
dollhouse mode is on by default and faded walls ignore taps, so from outside the
building the faces you can actually see are exactly the ones that won't respond.
New **Exterior** card in Properties (no-selection state) finishes every outward-facing
wall face in a single undoable commit. `src/lib/exteriorFaces.ts` decides which sides
face open air by probing just past each face and testing it against every room;
`applyExteriorFinish` in the store applies them, chaining `withFaceFinish` per wall so
a wall exterior on both sides is handled correctly. Uses already-bundled
brick/plaster/concrete/timber textures — zero new bytes. Translated in 12 locales.

Verified headless: the Exterior card applies to all 4 perimeter faces of the sample
home with the interior left untouched. tsc + lint + build clean; 37 smoke checks green.

## 1.0.94 - 2026-07-24 (versionCode 10094)

Second stage of the 3D work. 1.0.93 improved the sun, shadows, floors and ground —
but **none of it reached phones**, because the viewer disabled every effect on any
touch device. This release fixes that, which is the point of it.

### Fixed — phones got no shadows at all, regardless of hardware
The renderer branched on a single `matchMedia('(pointer: coarse)')` check, so a
current flagship phone was treated exactly like a 2016 tablet: no sun shadows, no
contact shadows, no soft shadows, no post-processing. Since HomeDesigner ships on
Android, that meant essentially every real user saw none of the lighting work.
New `src/lib/perfTier.ts` grades the device (`low`/`mid`/`high`) from pointer type,
core count and memory, and each effect is switched from its own capability flag
instead of one blunt boolean. Mid-range and better phones now get real sun shadows
(1024 map) and contact shadows. Post-processing and PCSS soft shadows stay off on
touch by design — those are the expensive parts, and the ones that have actually
crashed drivers in the field.

### Added — Settings → 3D graphics
**Auto / Battery saver / Balanced / Best looking**, so the automatic guess can stay
conservative without trapping anyone on the wrong setting. Auto shows which tier it
picked. Translated in all 12 locales.

### Fixed — the CAD grid was drawn across the lawn
The infinite reference grid rendered unconditionally in 3D, so every exterior view
(and every render) had survey lines over the ground. It now appears only while a
build tool is armed, which is the only time it's actually useful.

### Note on the device probe
The first cut of the tier detection read `WEBGL_debug_renderer_info` to identify the
GPU by name. That required creating a throwaway WebGL context during render, and
this app already runs several live canvases at once (the scene plus a preview canvas
per catalog item). The extra context churn destabilised the catalog list and the
smoke suite caught it. Dropped the GPU sniff — core count, memory and pointer type
are coarser but cost nothing and cannot perturb the renderer.

Verified: tsc + lint + build clean; 37 smoke checks green; headless mobile emulation
(390×844, touch) confirms shadows present at Balanced/Best looking and absent at
Battery saver.

Still to come in this phase: derived normal maps for surface relief, and one-tap
exterior wall finishes. Then the roof.

## 1.0.93 - 2026-07-24 (versionCode 10093)

Owner: "check over the 3D mode and make a plan to make it look better — I want
outdoor elements and a roof so we can do external renders too." This is the first
stage of that work: the visual-quality pass. Roof, outdoor hardscape/boundary and
the exterior render mode follow.

### Fixed — built-in floor materials were photoreal in 2D but procedural in 3D
`FloorMesh` looked up the chosen `FloorMaterial` but read only `.kind`/`.color` and
then built a low-res procedural canvas texture — it never read `.texture`, the
photoreal Poly Haven image the 2D plan already renders (and which that field's own
doc comment says should drive "both the 3D surface and the 2D plan fill"). Now
resolved through `materialUrl()` with the material's real `scaleCm`/`roughness`/
`metalness`, reusing the existing custom-texture path. Every saved design gains real
wood/tile/stone in 3D with no data change and no migration. Carpets keep the
procedural weave (they intentionally ship without an image).

### Fixed — the sun never sat low, so cast shadows were invisible
`sunModel` clamped the sun high all day (`dir.y = 0.15 + day*1.2`) and always placed
it on `+z`, the same side as the default camera — so shadows were short and fell
behind the building, out of view. This was the main reason exteriors read as flat and
unlit. The sun now follows a real altitude (`asin(day)`, floored at ~6° so shadows
can't stretch to infinity) on an east → south → west sweep, giving long raking
morning/evening shadows that fall where you can see them. The key light is also
positioned along `sun.dir` with a uniform scale, so the shadow direction matches the
sky's sun instead of drifting from it.

### Changed — real shadow resolution
Sun shadow map 1024 → 2048 over a frustum tightened from ±radius*2 to ±radius*1.25
(~4× more texels per metre), widening automatically as the sun drops so long shadows
aren't clipped. Added `shadow-normalBias`, which let the depth bias drop 4× (fixes
acne without detaching contact shadows), and replaced the fixed
`shadow-camera-far={80}` — which already silently clipped shadows on larger plans —
with one that scales with the scene.

### Added — textured site ground
The 400 m ground plane was flat untextured `#eceae4`, so from outside the building
floated with nothing to catch its shadow. It now renders a procedural mown lawn
(`getGroundTexture` in `src/lib/textures.ts`, following the existing floor-texture
generator pattern) with gravel/paving/plain also available. Procedural on purpose:
**zero added APK bytes**. Mow stripes are kept deliberately wide — narrow bands alias
into coarse moiré across the lawn at grazing angles.

Still to come in this phase: device tiering + a user Quality setting, derived normal
maps for surface relief, and one-tap exterior wall finishes.

Verified headless at 1440×900: exterior now shows a lit façade with a clearly visible
cast shadow on the lawn, and the dollhouse interior is unchanged apart from the
photoreal floor. tsc + lint + build clean.

## 1.0.92 - 2026-07-23 (versionCode 10092)

Owner (3D screenshot): kitchen cabinets look too small.

### Fixed — kitchen cabinets/stove/sink now fill to real counter height
- The bundled Kenney kitchen models are authored as ~45 cm cubes, so the
  uniform-fit path left base cabinets ~58 cm tall (half a real counter) and the
  stove/sink shorter still — the "too small" look.
- Added a `'stretch'` fit mode to `GltfFurniture`: for boxy cabinetry it scales
  width/depth/height independently to the item's footprint and height (the
  low-poly art holds up fine). Tagged the cabinet run, base/drawer/corner/wall
  cabinets, stove and sink with it (`MODEL_FIT` in `furnitureModels.ts`), and
  raised base/drawer/corner cabinet catalog height 62 → 90 cm.
- Result (headless, deterministic): base cabinet 55×58×58 → **55×60×90 cm**; the
  stove and sink line up on the same 90 cm counter instead of sitting
  half-height. 2D top-down sprites are unchanged (height isn't shown there).

> Note on sourcing "better" models: the cgtrader links are a paid marketplace —
> those models aren't CC0 and can't be bundled in the app without a purchased
> redistribution licence (the catalogue is deliberately CC0 for commercial
> safety). This change fixes the scale of the current models; for photoreal
> cabinets, buy a licence-clear .glb and I'll wire it in.

## 1.0.91 - 2026-07-23 (versionCode 10091)

- Rebuilt the unchanged 1.0.90 Google authentication release with a new Play
  Console versionCode because the previous AAB delivery/upload failed.
- Re-ran production build, Android sync, signed bundle build, and signature
  verification before uploading the replacement AAB.

## 1.0.90 - 2026-07-23 (versionCode 10090)

Owner report: the desktop Pro sheet could only redirect customers to the
Android app. Desktop customers need to buy the same permanent Pro entitlement
and keep it when moving between desktop and Android.

### In progress — RevenueCat Web Billing with Stripe

- Added the lazy-loaded RevenueCat Web SDK and a desktop purchase provider.
  Configured builds load the real web offering and localized price, open
  Stripe-backed checkout, and immediately unlock the returned Pro entitlement.
- Web checkout is attached to the same stable `google:<subject>` customer ID
  already used by Android and the sync Worker. Signed-out customers are asked
  to sign in before checkout so purchases cannot become stranded on an
  anonymous browser ID.
- Existing production behavior remains safe until setup is complete: without a
  public Web Billing key, desktop keeps linking to the Play Store. The
  `?pro=1` browser-test seam remains available.
- Added browser coverage proving a configured desktop build shows **Sign in
  with Google** instead of **Get the Android app** before purchase.
- Connected the live **HomeDesignerApp** Stripe account to a RevenueCat Billing
  configuration using EUR, then added three customer choices: **€4.99/month**,
  **€39.99/year**, and **€79.99 lifetime**. All three products grant the same
  canonical `Pro` entitlement and are attached to the default offering.
- Added the public RevenueCat Billing key to the production web build and
  registered `homedesignerapp.com` as an enabled Stripe payment-method domain
  for supported card wallets. Stripe Tax remains off pending a separate tax
  configuration decision.
- Desktop now loads every configured Pro package and displays a compact pricing
  selector with yearly highlighted as best value. Checkout purchases the exact
  package selected by the customer rather than whichever package happens to be
  first in the offering.

No real live charge was made during setup. Complete one low-value owner purchase
after deployment, then verify the resulting RevenueCat entitlement appears on
both desktop and Android before opening checkout to testers.

Validation so far: TypeScript clean, lint clean, production build succeeds, and
all non-3D browser smoke checks pass with zero page errors.

The signed Android 1.0.90 AAB was built successfully and its JAR signature was
verified before delivery.

### Fixed — reliable Google sign-in and sign-out

- Fixed a production-only desktop OAuth edge case found during live testing.
  When a browser turned Google's popup into an opener-less tab, the successful
  callback was previously stranded and the original app stayed signed out.
  The app now validates the callback issuer, audience, nonce, and expiry, then
  forwards it through the provider's nonce-scoped channel and immediately
  removes bearer credentials from browser history.
- Desktop session restore now requires a still-fresh persisted Google ID token.
  The UI no longer appears signed in after the web token has expired even though
  every plan-sync request would fail.
- A temporary Google plugin initialization error no longer permanently breaks
  all later attempts. Signed-out users also clear any stale provider session
  before starting a new login, preventing “already signed in” failures and
  accidental reuse of the previous Google account on desktop or Android.
- Sign-out now immediately stops cloud writes and clears the visible account,
  account-linked Pro state, prices, and cached credential before attempting
  network cleanup. RevenueCat or Google being offline can no longer trap a user
  in the signed-in UI; the in-memory Google token is cleared in every outcome.
- Session restore cleans up RevenueCat and project-sync state when Google no
  longer has a usable session.

### Fixed — retroactive Pro and legacy project migration

- Corrected the deployed sync Worker entitlement lookup. It had been calling a
  private RevenueCat customer endpoint with the public Android SDK key; it now
  uses the existing private v2 key from a Cloudflare secret and RevenueCat's
  `active_entitlements` API. No secret is stored in source or Git.
- Linked the owner's existing Google customer to **Homedesigner Pro** with an
  unlimited-duration grant after confirming that RevenueCat showed no purchase
  or entitlement history for the new Google ID. Desktop can now resolve Pro
  immediately through the corrected Worker.
- Android now runs RevenueCat `syncPurchases()` when a newly linked Google ID
  has no entitlement. This retroactively attaches eligible purchases made
  under the older anonymous RevenueCat ID to `google:<subject>` using the
  project's **Transfer to new App User ID** behavior.
- Added project-index repair before cloud upload. Valid project JSON left by an
  older/intermediate build is re-indexed and included in the first sync rather
  than remaining invisible. The legacy single-slot save is also recovered when
  needed; users must not delete old projects.
- Added **Sync now** beside the signed-in account on home and in Settings. It
  retries both project merge and Pro linking, with clear success/failure
  feedback. Account copy now correctly says sync works across signed-in
  devices, not Android devices only.
- Deployed sync Worker version `4afa87b9-0fa3-4596-845d-62b1ff43f367`.

Validation: root TypeScript and lint clean; Worker TypeScript clean; 35 browser
checks pass (3D intentionally skipped), including retroactive purchase wiring,
private v2 API configuration, orphaned-plan recovery, and zero page errors.

## 1.0.88 - 2026-07-23 (versionCode 10088)

Owner report: Google Sign-In worked on Android but desktop returned Google
`Error 400: redirect_uri_mismatch`; mobile plans and a mobile Pro purchase also
needed to follow the same Google account onto desktop.

### Fixed — desktop Google login and cross-device account state
- Registered the production web origin `https://homedesignerapp.com` and exact
  redirect URI `https://homedesignerapp.com/app/` on the HomeDesigner Google
  OAuth client. This matches the app's new post-landing-page location and fixes
  the reported redirect mismatch.
- Pinned the production web provider to that canonical redirect URI so loading
  an alternate app pathname cannot silently change the OAuth request.
- Fixed desktop session restore: the web plugin's persisted, still-valid ID
  token is now read before attempting refresh. The plugin does not implement
  Google refresh on web, which previously prevented cloud plan sync after a
  desktop reload even when the account still appeared signed in.
- Existing private R2 plan sync remains keyed by Google's immutable account
  subject. Signing into the same Google account on desktop now performs the
  initial merge and loads plans uploaded from Android.

### Added — Google-linked Pro on desktop
- Added authenticated `GET /v1/entitlement` to the Cloudflare sync Worker. It
  verifies the Google ID token, derives the RevenueCat customer ID
  (`google:<subject>`) server-side, and returns only whether the Pro entitlement
  is active.
- The desktop provider now checks that endpoint when the Google account is
  linked, so a Google Play Pro purchase made while signed in on Android unlocks
  Pro on desktop and other signed-in devices. Signing out removes that
  account-linked desktop entitlement.
- Android purchasing remains RevenueCat over Google Play Billing using the
  non-consumable `pro_unlock`; Play presents the payment methods available on
  the buyer's Google account and country.
- Deployed Worker version `a5dbc7f0-dd23-42f9-a73f-5913dcea1e50`.

Validation: root TypeScript clean; Worker TypeScript clean and deployed; all 39
browser smoke checks pass with zero page errors.

## 1.0.87 - 2026-07-22 (versionCode 10087)

Owner: "Google Sign-In works on mobile, but it's buried in Settings — let people
sign in by clicking a user icon on the main app page."

### Added — account button on the home screen
- New `AccountButton` in the projects/home header: a round **user-icon**
  (brand-outlined) that opens a small popover. Signed out it shows the branded
  **Sign in with Google** button; signed in it shows the avatar/initial, name +
  email, a "synced across devices" note, and **Sign out**. Reuses the existing
  `useAuthStore` (`signIn`/`signOut`) — identical behaviour to the Settings
  account section, just one tap from the launch screen. Renders nothing when
  Google Sign-In isn't configured in the build. Settings keeps its full account
  section (incl. Delete cloud backups); this is a shortcut, not a replacement.
- On phones the header Settings button already lives in the bottom nav, so the
  header shows logo + account + language; on desktop it sits beside Settings.
- New strings translated in all 12 locales (`scripts/add-translations9.py`):
  "Sign in" and the signed-in sync note.

Verified headless (prod build, desktop 1200px + phone 390px): the account icon
renders, the popover opens with the Google button, the mobile header stays
uncrowded. tsc + lint + build clean; signed AAB (SHA256 verified, versionCode
10087). (Built on top of the landing-page branch tip — no Codex work rolled back.)

## Landing page - 2026-07-22 (web only, no app version bump)

Owner: "build a professional landing page for homedesignerapp.com — this video
plays as you scroll down and read the page; make sure everything is readable;
link to the desktop app and the Play Store."

### Added — marketing landing page at homedesignerapp.com
- New static `site/` (single self-contained `index.html` + `site/assets/`):
  dark brand design (royal blue #0d63f8, Plus Jakarta Sans, app tokens), hero
  with dual CTAs, a **scroll-driven film section** (owner's 8s promo render at
  `site/assets/promo.mp4`; scroll progress scrubs `video.currentTime`, three
  step captions on blurred dark cards + progress bar — text always sits on a
  scrim, never raw video), feature grid from the real `store/` phone
  screenshots, checklist band, "Get the app" section, footer with privacy.
  CTAs: **Google Play** (`play.google.com/.../com.homedesigner.app`) and
  **"Use the desktop app"** → `/app/`.
- Robustness: `prefers-reduced-motion` (and any browser whose video seeks
  silently no-op) falls back to a plain looping player with the step cards in
  normal flow; captions/progress are scroll-driven so they work regardless.
- **Deploy layout changed** (`deploy-pages.yml`): the published Pages site is
  now assembled as landing at `/`, the full app under **`/app/`** (its
  `base: './'` build is path-agnostic), with `privacy.html` + `CNAME` kept at
  the root so the Play-listing privacy URL and custom domain keep working.
  The Android build is untouched — Capacitor still bundles `dist/` directly.
  Local `site-dist/` assembly is gitignored (CI builds it fresh).
- Verified headless (desktop 1440px + phone 390px): captions/progress track
  scroll, both CTAs correct, `/app/` serves the working designer, mobile
  header/cards readable. (Headless Chromium can't seek H.264 so the scrub
  itself was verified by mechanism + fallback; real browsers seek normally.)

> **NOTE for the Google Sign-In fix (Codex, tomorrow):** the web app now lives
> at `https://homedesignerapp.com/app/` — register redirect URI
> `https://homedesignerapp.com/app/` (origin `https://homedesignerapp.com`)
> on the Web OAuth client, not the bare domain root.

## 1.0.86 - 2026-07-22 (versionCode 10086)

Owner report: the v1.0.85 Play upload failed, and the phone-only bottom
navigation left desktop users without a visible Settings destination on Home.

### Added — desktop Home settings access
- Added a dedicated **Settings** button beside the Language selector in the
  desktop projects header. It opens the existing Settings dialog directly.
- Kept the control hidden at the phone breakpoint because mobile already has a
  permanent Settings destination in the Home/Templates/Settings bottom bar.
- Added browser coverage that verifies the desktop header button is visible and
  opens Settings before entering a sample project.

### Release — replacement Play bundle
- Advanced the app to `1.0.86` / versionCode `10086`, giving Google Play a new
  bundle identity after the failed v1.0.85 upload attempt.

Verified: TypeScript and ESLint clean; production web build and Android sync
clean; all 39 browser smoke checks green. Signed AAB verified (25,622,587
bytes; SHA-256
`6AD3A05EBD572669A8ED76710F3E3094B4D2B75CCDC1E40A79E6DC37CC767D7B`;
signer SHA-256
`EE:D4:E3:A9:11:BC:92:9A:D3:CD:33:36:FF:BF:32:C0:22:4A:1F:C5:21:BE:B1:13:02:F5:A0:7E:5F:00:6A:00`).

## 1.0.85 - 2026-07-22 (versionCode 10085)

### Fixed — one-finger 2D navigation while objects are locked
- Lock mode now turns the entire 2D plan into a one-finger pan surface on
  touch devices. A drag may begin over a room, wall, or furniture item instead
  of requiring the empty margin outside the house.
- The existing movement threshold still distinguishes a tap from a drag, so
  locked objects and surfaces remain selectable without moving them.
- Added an end-to-end touch regression that begins inside a room and verifies
  the viewport moves while object locking is enabled.

Verified: TypeScript and ESLint clean; production web build and Android sync
clean; all 37 browser smoke checks green. Signed AAB verified (25,622,517
bytes; SHA-256
`CD9BE7F9FE941D25D9C145B0A926E0281E938189E2242815A5987521693B02D1`;
signer SHA-256
`EE:D4:E3:A9:11:BC:92:9A:D3:CD:33:36:FF:BF:32:C0:22:4A:1F:C5:21:BE:B1:13:02:F5:A0:7E:5F:00:6A:00`).

## 1.0.84 - 2026-07-22 (versionCode 10084)

Owner reports: Google Sign-In ended with “Invalid JWT”; signed-in users need
their plans and Pro purchase on a newly installed Android device; the new
`homedesignerapp.com` domain needs to serve the GitHub Pages site.

### Fixed — Google Sign-In JWT failure
- Removed the `@capgo/capacitor-social-login` 8.3.38 generic JWT-decoder call.
  That implementation splits the token incorrectly and rejects a valid Google
  credential. Android's native Google provider already exposes the signed
  credential's immutable `sub` as `profile.id`, which is now used directly.
- Short-lived Google ID tokens remain memory-only and are refreshed before
  cloud requests. The cloud service independently verifies their Google
  signature, issuer, expiry and exact HomeDesigner OAuth audience.

### Added — private cross-device plans and Pro access
- Added a deployed Cloudflare Worker at
  `homedesigner-sync.nathanjoppich.workers.dev` backed by the new, private
  `homedesigner-user-data` R2 bucket. It is separate from the public furniture
  bucket and namespaces every object by the verified Google subject.
- Signed-in project snapshots, names and thumbnails now merge across Android
  devices with last-write-wins timestamps. Deletion tombstones prevent a plan
  deleted on one device reappearing from an older offline device.
- Autosave remains local and fast. Cloud writes are coalesced after five idle
  seconds, and offline/network failures leave local projects untouched for a
  later retry.
- Added **Delete cloud backups** in Settings plus a matching authenticated
  deletion endpoint. Updated the privacy policy for Google account data,
  Cloudflare storage and RevenueCat identity linking.
- RevenueCat continues to use `google:<immutable-sub>` as its App User ID.
  Signing into the same Google account on another Android device therefore
  restores the same Pro entitlement without using the mutable email address.

### Added — custom web domain
- Added the GitHub Pages `CNAME` for `homedesignerapp.com` and changed the
  in-app privacy URL to `https://homedesignerapp.com/privacy.html`.

Verified: TypeScript and ESLint clean; production web build and Android sync
clean; all 36 browser smoke checks green; Worker TypeScript clean; deployed
Worker rejects unsigned sync/deletion requests with HTTP 401 and accepts the
Android WebView CORS origin. Signed AAB verified (25,622,592 bytes; SHA-256
`78ECC2F689438265F529809AEEC725C69DAB0D9F8F3F406A8882538DAC817275`).

## 1.0.83 - 2026-07-21 (versionCode 10083)

Owner direction: grow the furniture library through commercially safe CC0
sources while IKEA licensing permission is pending.

### Added — real cloud models for existing catalogue objects
- The remote catalogue can now apply tightly scoped **model-only upgrades** to
  furniture already bundled with the app. Remote data may supply a GLB and its
  verified provenance, but cannot alter the item's dimensions, category, Pro
  status, placement behaviour, or any other catalogue metadata.
- The live R2 manifest's nine reviewed CC0 upgrades now work in the app: TV,
  floor lamp, pendant light, table lamp, rectangular/round rugs, toilet, sink,
  and shower. The prepared Kenney and Quaternius files were confirmed live with
  their declared byte counts; the 32 existing cloud-only objects remain intact.
- Published a second visually reviewed Quaternius batch with 11 lightweight
  CC0 objects: four seating variants, two storage/media units, four plants, and
  a kitchen drawer base. The live cloud catalogue now contains 43 objects while
  keeping all nine bundled-furniture model upgrades.
- Added width/depth fitting and a bounded vertical offset for unusually thin or
  hanging GLBs. The TV keeps its correct proportions instead of being distorted
  to fill its shallow placement footprint.

### Hardened — catalogue refresh and licensing boundaries
- Cloud model overrides remain same-origin HTTPS, GLB-only, CC0-only, and require
  a valid source URL. Structural doors/windows can never be overridden remotely.
- Fixed forced catalogue refreshes rejecting the previously loaded 32 cloud
  object types merely because they were still present in the runtime lookup.
- Added deterministic browser coverage for a cloud model upgrade and documented
  the manifest schema for future CC0 batches.
- Added reusable Blender preview rendering and safe manifest-merging tools for
  incremental catalogue releases. Blender batch export now correctly accepts
  arguments after its standard `--` separator. An empty source object
  (`Drawer_4`) was rejected rather than publishing a broken catalogue item.

Verified: TypeScript, ESLint, production build, Android sync, and all 35 browser
checks clean. The public R2 manifest is byte-identical to the reviewed local
manifest (43 new objects, 9 model upgrades). All 11 second-batch GLBs were
fetched from the public endpoint and matched the reviewed local files by
SHA-256. Signed AAB verified
(25,620,999 bytes; SHA-256
`36D0C31F7FA537DB613EFB990ABA85E03BD9A5AFAB8A1860ABFCC4CC2B188BE8`).

## 1.0.82 - 2026-07-21 (versionCode 10082)

Owner report: walking up the Maple family house stairs changed to the upper
floor but placed the camera outside, and the upper floor had no stairwell cut.

### Fixed — safe, connected stair navigation
- Corrected the Maple stair direction so its low end starts in the ground-floor
  hall and its high end arrives on the indoor upper landing.
- Walk-through stair transitions now validate their destination against the
  target floor's rooms. A badly placed or outward-facing stair falls back to
  the nearest safe room interior instead of putting the camera outside.
- Destination fallback uses a room's interior visual centre, which remains safe
  for concave rooms where a simple polygon centroid may lie outside.

### Added — real upper-floor stairwells
- Upper-storey floor finishes and structural slabs now cut an opening from the
  rotated footprint of each stair on the storey below.
- The same rotation transform drives the visible stair, landing detection, and
  slab opening, preventing the geometry and navigation from drifting apart.
- Openings are only cut when the full stair footprint belongs to a destination
  room; boundary-crossing stairs keep a solid floor rather than generating a
  broken mesh.

Verified: TypeScript + ESLint clean; production build and Android sync clean;
all 34 browser checks green, including safe fallback, rotated stairwell
geometry, Maple's indoor upper landing, and a valid Maple slab opening. Signed
AAB verified (25,620,390 bytes; SHA-256
`8314911A3DC46384BD19E80FF1D27920101E19871A300721068979B4B053A752`).

## 1.0.81 - 2026-07-21 (versionCode 10081)

Tester feedback: flipping doors and stairs was unclear on mobile, and finishing
a room needed a more obvious action.

### Added — quick direction controls
- Selected objects now have large 44px one-tap rotate-left/right buttons in
  Edit, avoiding the precision slider for common 90-degree turns.
- Selected stairs add a central **Reverse** arrow that changes their rise
  direction by exactly 180 degrees in both 2D and 3D.
- Selected doors add **Hinge** (left/right) and **In / out** swing arrows.
  These flags persist with the opening and update both the plan symbol and 3D
  door leaf. Pocket-door side and double-door swing direction are also honoured.

### Changed — clearer room completion
- After the third room corner, the first point becomes a large blue target with
  a check mark, making “tap the first point to close” discoverable on phones.
- The drawing action now says **Finish room** instead of the generic “Finish”.
  Users can either tap that button or tap the checked first point.

Verified: TypeScript + ESLint clean; 30-check browser smoke suite all green,
including real Edit-panel clicks for stair reversal and door hinge flipping.

## 1.0.80 - 2026-07-21 (versionCode 10080)

Owner screenshot: Google Sign-In rejected immediately with “You CANNOT use
scopes without modifying the main activity.”

### Fixed — native Google Sign-In startup
- Removed the redundant `options.scopes` array from the Google login request.
  The installed Android Credential Manager provider already requests `openid`,
  `email`, and `profile` by default; explicitly passing the same values makes
  the plugin treat them as custom scopes and require a modified MainActivity.
- The OAuth project, web client ID, Android signing clients, immutable Google
  `sub` identity, and RevenueCat linking behaviour are unchanged.
- Added a regression check that fails if the login request starts passing a
  scopes array again without the required native integration.

Verified against the installed `@capgo/capacitor-social-login` Android source,
which adds the three identity scopes automatically before applying its custom-
scope MainActivity guard. TypeScript + ESLint + production build clean; Android
sync clean; 26-check browser smoke suite all green. Signed AAB verified
(`versionCode 10080`, SHA-256
`B0D56CF695AAE0DA68A59F3D69D940011ABD05197D95BD45E4C5363E5D2B4645`).

## 1.0.79 - 2026-07-20 (versionCode 10079)

Owner report: walk-through mode could not pass through a door or continue up
stairs to another floor.

### Fixed — walk-through doors and storey navigation
- Walk collision is now generated from solid wall spans around door, passage,
  archway, sliding, pocket, bifold, and double-door openings. Previously the
  rendered wall had the correct hole but its invisible collision segment still
  ran uninterrupted from one endpoint to the other.
- Overlapping doorway ranges are merged and given a small jamb tolerance, so
  wide/double openings do not retain invisible collision slivers.
- Stairs now connect adjacent storeys in walk-through mode. Approaching the low
  landing transitions smoothly to the floor above; approaching that stair's
  upper landing transitions back down. The active floor and collision geometry
  switch automatically, with a landing offset/cooldown preventing bounce-back.
- Stair landing detection works in the furniture's rotated local coordinates,
  so stairs placed at any plan angle navigate to the correct end.
- Walk-through renders the complete stack of storeys while moving between
  floors; the normal 3D editor keeps its active-floor cutaway behaviour.

### Regression coverage
- Added browser checks proving that wall collision is split around a door and
  that a 90-degree rotated stair resolves its upper landing correctly.

Verified: TypeScript + ESLint clean; production build clean; 25-check browser
smoke suite all green, including 3D WebGL/catalog coverage and zero page errors.

## 1.0.78 - 2026-07-20 (versionCode 10078)

Owner: enable Google Sign-In before OAuth production verification so Pro access
can follow the same person across Android devices.

### Added — Google account sign-in and Pro sync
- Added native Google Sign-In with `@capgo/capacitor-social-login`, using the
  modern Android Credential Manager flow. Settings now has a branded Google
  sign-in button, signed-in profile card, and safe sign-out action.
- Google identity uses the immutable OpenID `sub` namespaced as
  `google:<subject>` for RevenueCat. Tokens are never persisted; only the
  display profile and stable subject are cached locally.
- RevenueCat now switches from its anonymous customer to the Google identity
  with `Purchases.logIn`, so an existing Pro entitlement can follow the user
  across Android installs. Sign-out calls `Purchases.logOut` before ending the
  Google session so a shared device is never left attached to the named
  customer. Local designs remain device-only and the UI says so explicitly.
- Startup restores an existing Google session after the initial entitlement
  refresh. Offline startup keeps the cached account and entitlement instead of
  destructively signing the user out.
- Account controls, explanatory copy, and auth-result messages are translated
  in all 12 non-English locales.
- Settings now uses a scrollable body with a fixed, reachable footer; the new
  account section cannot push the Done button below a phone viewport.

### OAuth configuration
- Uses the separate Google Cloud project `homedesigner-502819` (the existing
  Ascribe project was not changed). Branding is `HomeDesigner`, audience is
  External / Testing, and `nathanjoppich@gmail.com` is the first test user.
- Created one Web OAuth client (its public ID is embedded through
  `.env.production`) plus Android clients for package `com.homedesigner.app`
  bound to both the Play App Signing SHA-1 and upload-key SHA-1.
- OAuth requests only `openid`, `email`, and `profile`; no sensitive scopes or
  client secrets are present in the app or repository.

Verified: tsc + lint + production build clean; Capacitor sync includes the
Google-only SocialLogin native dependency; the 23-check mobile smoke suite is
all green. Signed AAB verified (`versionCode 10078`, SHA-256
`652E852953D5C69B3C05880B036FEF640D013B49532D66A0F7820E049FB1D2C4`).

## 1.0.77 - 2026-07-20 (versionCode 10077)

Owner reports: 2D always opens over-zoomed; new custom lock icon.

### Fixed — 2D opens framed to the whole floor plan
- Entering 2D was over-zoomed because the "frame the design" effect ran against
  the stage's *guessed* initial size (800×600) and never re-ran once the
  ResizeObserver reported the real (often much narrower phone) size — the
  `fitRequest === lastFit` guard blocked it. The fit is now keyed on **both the
  request and the measured size**, so it re-frames for the real stage size. On
  entry (and after 3D→2D, which remounts the canvas) the whole plan is shown,
  then you zoom in. Verified headless (390×844): all four plan corners land
  inside the viewport.

### Changed — custom "Lock objects" icon
- The lock toggle now uses the owner's armchair-with-padlock glyph
  (`public/icons/furniture-lock.png`) via a new `FurnitureLockIcon` component.
  Rendered as a CSS mask filled with `currentColor` (the source had no alpha —
  a luminance threshold derives the mask), so it tints with the theme and the
  brand active state like the lucide icons. Replaces the bare `Lock` in all four
  lock toggles (2D HUD + 3D pills).

### Chore — Play Store assets refreshed
- Regenerated `store/` (home gallery / 2D / 3D / catalog across phone + 7"/10"
  tablet) from the current UI, plus the icon + feature graphic from the real
  logo on the royal-blue brand. `tools/screenshots.mjs` modernized + hardened.

Verified headless; tsc + lint + build clean; signed AAB (SHA256 verified,
versionCode 10077).

## 1.0.76 - 2026-07-20 (versionCode 10076)

Owner supplied photoreal preview renders for every "Start a project" card.

### Added — template preview renders
- Each template card now shows a photoreal dollhouse/blueprint render as a
  full-bleed banner (title + blurb padded below, icon kept as fallback):
  - Samples: Sunlit open-plan home, Maple family house, City studio, Terraced
    townhouse (isometric 3D dollhouses).
  - Actions: Import a 2D plan and Start from scratch (dark blueprint renders that
    match the app's dark UI).
- Six owner renders live in `public/previews/*.webp` (~190 KB total; originals
  kept in `brand/previews/`). `samples.ts` gained a `hasPreview` flag +
  `samplePreviewUrl()`; the two action cards point at their own preview URLs.
  New `.tpl-card.has-preview` styling (image cover-fit banner, flex-stretch so
  the row stays even height).

Verified headless: all six template cards load their preview image. tsc + lint +
build clean; signed AAB (SHA256 verified, versionCode 10076).

## 1.0.75 - 2026-07-20 (versionCode 10075)

Owner (phone screenshot): saved projects showing blank previews.

### Fixed — project thumbnails go blank after viewing in 3D
- Thumbnails are captured from the 2D Konva stage (`planCapture`), but Canvas2D
  only mounts in 2D — so a design the user drew and then **viewed in 3D before
  leaving** captured nothing (the bridge was null on exit) and fell back to the
  house placeholder.
- New shared `capturePlanThumbnail()` (`src/lib/thumb.ts`) is now called:
  - in `goHome()` (as before, refactored out of App), and
  - **when switching 2D → 3D**, while the 2D canvas is still mounted — so a
    fresh preview is stashed even for projects only ever viewed in 3D.
- Genuinely empty projects (no walls/rooms/furniture) still show the placeholder
  by design — there's nothing to preview until you draw something.

Verified headless: open a sample → switch to 3D → go home; the project card now
shows a real plan thumbnail (was the blank placeholder). tsc + lint + build
clean; signed AAB (SHA256 verified, versionCode 10075).

## 1.0.74 - 2026-07-20 (versionCode 10074)

Owner (phone screenshot): tapping "Explore ideas" opened the Tips panel as a
wall of **keyboard shortcuts** (Ctrl+Z, Ctrl+C, arrow-key nudge, right-click) —
useless on a touch phone.

### Fixed — Tips panel is touch-aware
- `HelpPanel` now detects a coarse pointer and, on touch:
  - Titles itself **"Tips & gestures"** (was "Tips & shortcuts").
  - Drops the keyboard chips and the keyboard-only rows (copy/paste hotkeys,
    Select-all, arrow-key nudge).
  - Rephrases every row as the gesture: *tap* to chain points, *tap Finish*,
    *long-press* for the copy/duplicate menu, *undo/redo arrows in the top bar*,
    *pinch to zoom / two-finger drag to pan*, etc.
- Desktop still shows the full keyboard reference unchanged.

Verified headless (touch context): the panel renders with zero `<kbd>` chips and
gesture phrasing. tsc + lint + build clean; signed AAB (SHA256 verified,
versionCode 10074).

## 1.0.73 - 2026-07-20 (versionCode 10073)

Owner: add micro-animations "only the ones that make sense on mobile" (the
hover-only ideas from the reference — hover effects, name tags, delayed
tooltips, text pop-out, search expansion, upgrade-on-hover — are skipped since
touch has no hover).

### Added — micro-interactions (all reduced-motion aware)
- **Tap/press feedback** — the touch equivalent of a hover state: buttons,
  cards, thumbnails, segmented toggles and the inspiration banner scale down
  slightly (0.96) on press for a tactile response.
- **Toast notifications** now spring up (slide + subtle scale, overshoot ease).
  Also fixed a readability bug: toasts used `background: var(--text)`, which is
  near-white in dark mode (white chip); they're now a fixed near-black chip
  legible in both themes.
- **Card entrance** — the home template + project cards fade-up in a gentle
  stagger on load.
- **Shimmer stroke** — a slow sheen sweeps the Pro badge + the upgrade CTA to
  draw the eye to the paid path (purposeful, not decorative everywhere).

CSS-only, gated behind `prefers-reduced-motion: no-preference` where it isn't
pure interaction feedback. Verified headless: toast is a readable dark chip, the
Pro badge shimmer runs, cards render after their entrance. lint + build clean;
signed AAB (SHA256 verified, versionCode 10073).

## 1.0.72 - 2026-07-20 (versionCode 10072)

Owner: "improve 3D-mode jaggies and graphics" (phone screenshot with heavily
aliased wall/furniture edges).

### Changed — smoother 3D on mobile
- The light render tier (all touch devices) shipped with **MSAA off** and the
  device pixel ratio capped at **1.25**, so every edge stair-stepped. Now:
  - `antialias: true` on the WebGL context unconditionally — MSAA is cheap on
    modern mobile GPUs and is the real fix for the jaggies. (On mobile,
    post-processing is off, so the default framebuffer's MSAA actually applies.)
  - Mobile DPR ceiling raised **1.25 → 2** (`dpr={[1, 2]}`) for crisp edges and
    textures.
  - `AdaptiveDpr` now downscales **smoothly** (`pixelated={false}`, was
    `pixelated` on mobile), so if a frame budget slips the image softens instead
    of turning blocky.
- The heavy costs (post-processing, real-time + contact shadows) stay gated to
  desktop, and `AdaptiveDpr` + the frame-budget floor keep navigation smooth, so
  this sharpens the picture without a perf cliff.

Verified headless: the 3D scene renders with no errors after the change. tsc +
lint + build clean; signed AAB (SHA256 verified, versionCode 10072).

## 1.0.71 - 2026-07-20 (versionCode 10071)

Owner-reported bugs (phone screenshots).

### Fixed — home bottom-nav highlight
- Tapping **Templates** scrolled to the row but never turned blue — the nav
  hard-coded `active` on Home. Now the tapped tab highlights (explicit
  selection; the home content barely overflows, so a scroll-position heuristic
  can't reliably distinguish Home from Templates). Settings opens a modal and
  leaves the selection unchanged.

### Fixed — 2D editor hint tip unreadable + overlapping
- The floating hint ("Pick a tool on the left…") used `background: var(--text)`,
  which is dark in light mode but **near-white in dark mode** — a white pill
  with white text. It now uses theme-aware `--surface-2` / `--text` / `--border`
  so it's legible in both themes.
- On phones the centred tip collided with the top-left **Ground floor**
  switcher; it now drops below that row (`top: 64px`) and can use the full
  width. Rounded-rect corners (14px) read cleaner when the hint wraps to two
  lines.

(The home-screen Settings button was already fixed in 1.0.70.) Verified headless
(390×844): Templates/Home toggle their blue state; the editor hint is a dark,
readable pill below the floor switcher with no overlap. tsc + lint + build
clean; signed AAB (SHA256 verified, versionCode 10071).

## 1.0.70 - 2026-07-20 (versionCode 10070)

Owner: "put an option in the menu that users can disable the intro video — it
might not be for everyone."

### Added — Settings toggle for the launch intro
- New **Settings → Startup → "Play intro animation"** toggle
  (`src/lib/introPref.ts`, localStorage `hd-intro-enabled`, default on).
  `IntroVideo` now checks it and never shows when off. Translated in all 12
  locales (`scripts/add-translations8.py`).

### Fixed — Settings/Help/About were unreachable from the home screen
- The home bottom-nav **Settings** button (and the inspiration banner's Help
  action) set state but the dialogs were only rendered in the editor branch of
  `App.tsx`, so nothing opened on the home screen. Now `SettingsDialog`,
  `HelpPanel`, and `AboutDialog` render in the projects branch too — so the new
  intro toggle (and all settings) are reachable straight from the launch screen.

Verified headless: Settings opens from home and shows the Startup toggle; with
the pref off the intro is suppressed on launch. tsc + lint + build clean; signed
AAB (SHA256 verified, versionCode 10070).

## 1.0.69 - 2026-07-20 (versionCode 10069)

Owner supplied an animated-logo clip to use as a launch intro.

### Added — animated-logo launch intro
- `public/intro.mp4` (owner's 768×768, ~5s H.264 clip) plays full-screen when
  the app cold-launches, then fades into the home screen. New `IntroVideo`
  component:
  - **Once per session** — a module flag + `sessionStorage` guard, so it plays
    on a real cold launch (Android clears sessionStorage when the process dies)
    but not on warm resumes or in-app navigation.
  - **Skippable** — tap anywhere or the Skip button; auto-dismisses on the
    clip's `ended`, and a 7s safety timer guarantees it never traps the user.
  - **Reduced-motion aware** — skipped entirely when the OS prefers reduced
    motion.
  - **Seamless backdrop** — samples the video's own corner pixel and paints the
    letterbox with it (resolved to the brand blue here), so a square clip on a
    tall screen has no jarring bars.
  - StrictMode-safe: the `useState` initializer is pure (the earlier draft wrote
    to sessionStorage inside it, which React's dev double-invoke self-suppressed).

Assumptions used (easy to change): app-open placement, once per session,
skippable. Verified headless (390×844): intro plays and advances, Skip reveals
the home screen, and it does not replay on reload within a session. tsc + lint +
build clean; signed AAB (SHA256 verified, versionCode 10069).

## 1.0.68 - 2026-07-20 (versionCode 10068)

Owner supplied the official logo. Wired the real HomeDesigner mark (white
house + blueprint scroll + F on royal blue) into every icon slot.

### Added — real app icon everywhere
- `brand/homedesigner-icon-src.png` is the committed brand source. New
  `scripts/gen-icons.mjs` (sharp) derives every asset from it:
  - Tight-crops the blue rounded square out of the source's white margin.
  - Extracts the white glyph with clean transparency by **flood-filling the
    exterior margin inward** (white glyph and white margin are the same colour,
    so a colour threshold alone can't separate them) and using
    `alpha = min(R,G,B)` for smooth edges.
  - Emits Android legacy `ic_launcher`/`ic_launcher_round` (48→192dp) and the
    adaptive `ic_launcher_foreground` glyph (108dp, in the safe zone) over the
    existing `@color/ic_launcher_background` (#0D63F8), plus web
    `favicon.png` / `apple-touch-icon.png` / `icon-192` / `icon-512` /
    `brand-icon.png`.
- `index.html` favicon/apple-touch now point at the PNGs (was a generic house
  SVG). The in-app brand chip (home header + editor toolbar) shows the real
  icon image instead of a lucide house.
- Regenerate anytime with `node scripts/gen-icons.mjs`.

Verified headless: the home-header chip renders the logo crisply; the adaptive
launcher composites the glyph correctly on royal blue. tsc + lint + build clean;
signed AAB (SHA256 verified, versionCode 10068).

## 1.0.67 - 2026-07-20 (versionCode 10067)

Owner shared the official HomeDesigner app icon (royal-blue house-with-blueprint
mark) and asked to align the app's branding + keep improving the menus.

### Changed — brand colour aligned to the app icon
- Retuned the brand token to the icon's true royal blue **#0d63f8** (was a
  slightly purple indigo #3b63f6/#4c6ef5). Updated light + dark `--brand`,
  `--brand-600`, `--brand-soft(-2)`, `--grad-brand`, `--grad-hero`, the leftover
  hard-coded gradient hexes, and the Konva canvas selection/handle colours in
  `theme.ts`. Because everything reads from the tokens, the whole app — home
  hero, New-project button, template accents, bottom nav, 2D selection, pills —
  now matches the icon in one pass.

### Changed — menu polish
- Dropdown menus (Export / More): brand-tinted hover (item + icon go royal
  blue), rounder corners, deeper shadow, and a small pop-in animation.
- 2D/3D view switch: the active segment now carries a brand-tint ring and a
  brand-coloured icon so the current view is unmistakable.

tsc + lint + build clean; signed AAB (SHA256 verified, versionCode 10067).

NB: the brand chip + favicon + Android launcher icon still use a generic house
glyph — waiting on the owner to supply the logo as a transparent SVG/PNG so it
can be wired in precisely (backlog for Codex/next build).

## 1.0.66 - 2026-07-20 (versionCode 10066)

Owner: "I don't like the model for [the dining table] or the dining chairs, can
we find better ones." Swapped both to nicer models — in 2D and 3D at once.

### Changed — better dining models
- New shared source of truth `src/data/furnitureModels.ts` (`MODEL_FILE`:
  type → glb basename) consumed by BOTH the 3D viewer (`GltfFurniture` builds
  `FURNITURE_MODELS` from it) and the 2D sprite renderer, so the two views can
  never drift. `GltfFurniture`'s old hand-maintained model list is gone.
- **Dining table** → now uses the clean framed-wood `tea_table` model instead
  of the one with a picnic tablecloth baked on. **Dining chair** → the
  `wooden_dining_chair` (an actual upholstered dining chair) instead of the
  oversized brown-leather lounge chair. Both changes show in 2D and 3D.
- Added `SPRITE_FILL` (dining_table, desk, metal_desk): flat rectangular tops
  stretch their sprite to fill the footprint, so a squarish table model still
  reads as a full rectangular dining table rather than a small centred square.
- Re-rendered all 53 sprites from the updated map (`node scripts/render-sprites.mjs`).

Verified headless: the great room's dining set is now a rectangular wood table
ringed by six white upholstered chairs. tsc + lint + build clean; signed AAB
(SHA256 verified, versionCode 10066).

## 1.0.65 - 2026-07-20 (versionCode 10065)

Owner (2D mockup): "in the sample the furniture looks more realistic too."
2D furniture is now photoreal top-down art instead of line symbols — the
biggest visual jump toward the mockup.

### Added — top-down furniture sprites
- New offline pipeline renders every furniture GLB straight down into a
  transparent webp sprite (`scripts/render-sprites.mjs` + `sprite-render.html`,
  driven headlessly through the dev server with three.js: orthographic top-down
  camera, soft key/fill lighting, a gentle contact shadow, footprint-tight
  frame). Produced **53 sprites** in `public/sprites/` (~1.1 MB total) plus a
  generated `src/data/furnitureSprites.ts` manifest. Reuses the exact models
  shown in 3D, so 2D and 3D agree.
- The 2D editor now draws the sprite for any type that has one (sofa, bed,
  armchair, dining set, dresser, wardrobe, plants, fridge, stove, sink,
  cabinets, desks, stools…) via a new `FurnitureItemGraphic` component (Konva
  `Image`, contain-fit to the item footprint, still fully tappable because
  Konva images hit-test on their bounding box). Fixtures without a model
  (toilet, bathtub, shower, counter/island, TV, lights, rugs) and any
  still-loading sprite keep the clean line symbol — no regressions, no flashes.
- Regenerate anytime with `node scripts/render-sprites.mjs` (dev server on
  :5209). Adding a model to `public/models` + a catalog entry auto-includes it.

Verified headless at 390×844: the sample home shows a photoreal bed with
pillows + nightstands + wardrobe in the bedroom, and a leather sofa with throw
pillows, teal accent chair, round coffee table, dining set and potted plants in
the great room — over the 1.0.64 wood floors. tsc + lint + build clean; signed
AAB (SHA256 verified, versionCode 10065).

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
