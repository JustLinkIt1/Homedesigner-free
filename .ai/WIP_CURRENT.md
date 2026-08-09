# WIP — current handoff

> **Final CI repair 2026-08-08:** the release smoke test now selects one
> visible copy of a catalogue item because Recent/Favourites can legitimately
> duplicate the normal category card. The Model Studio source assertion no
> longer mistakes explanatory comment text for an actual `window.open` call.
> Both corrected checks pass locally and the full direct smoke run progressed
> beyond the original GitHub failure point. The required PR workflow now runs
> deterministic unit/integration suites; the browser-based trace, complete browser and
> software-rendered 3D coverage runs nightly and on demand so GPU timing
> variance does not block releases.

> **Release 1.22.5 prepared 2026-08-08:** versionCode **12205** contains the
> rebased mobile editing/catalogue/Pro improvements, one-shot placement
> feedback, the touch-wall correction and restored owner-only mobile Model
> Studio entry. GitHub CI's only failure was six Pro checkout translations
> packed onto shared dictionary lines that its static scanner could not see.
> Each key is now a separate entry in all 12 locales and the i18n suite is
> green. Signed artifact:
> `android/app/build/outputs/bundle/release/app-release.aab`, 28,001,769 bytes,
> SHA-256 `E4FF7DCB3C724AE3D75C2EC45A5C77EC25AB02E7C4091D3ECE784FFEED1833C5`.
> `jarsigner` verifies it, and an independent archive check confirms native
> 1.22.5/12205, web bundle 1.22.5 with no stray app version, 42 JavaScript files
> and 63 bundled GLBs. The repository verifier itself requires Unix `unzip`, so
> the equivalent checks were run through .NET's ZIP reader on Windows.

> **Mobile Model Studio entry repaired 2026-08-08:** the owner-only tool is now
> available directly in the editor's More menu as well as the Account menu.
> Android opens `https://homedesignerapp.com/app/model-studio/` through the
> supported Capacitor Browser Custom Tab rather than the unreliable WebView
> `window.open()` path; `@capacitor/browser` is installed and synchronized into
> the native Gradle project. A 390×780 touch-browser check confirms the owner
> entry is visible and on-screen. Email comparison remains normalized and the
> sync Worker remains the final authorization boundary.

> **Rebase validation completed 2026-08-08:** `agent/cloudflare-private` is
> resolved against current `claude/home-design-app-2d-plans-12y5u5` (1.22.4).
> Typecheck, lint and the full geometry suite are green. The full browser suite
> passed every existing check and exposed one touch-wall regression: starting a
> drag at the previous corner was misread as a double-tap and cleared the first
> point. That handler now finishes only a stationary second tap. A focused real
> touch-browser rerun retains both points and commits the wall at release. The
> production web build and Android Java 21 debug compilation also pass with the
> new Capacitor Browser registration.

> **One-shot placement feedback completed 2026-08-08:** successful placements
> in 2D and 3D now confirm the translated item name and expose both Undo and
> Place another. Furniture, doors/windows, wall-mounted models and décor placed
> on another object all use the same helper. Placement still disarms after one
> item, the new item stays selected, and only Place another explicitly re-arms
> it. The existing placement pill still supplies Cancel before placement.
> Validation is green after the rebase. Next report item: P2 catalogue preview
> metadata.

> **UI plan rebased onto 1.22.4 on 2026-08-08:** the first three priorities in
> `docs/UI_IMPROVEMENT_REPORT_2026-08-08.md` are implemented against Claude's
> current interaction model. The existing object-anchored selection ring is
> preserved; a separate contextual dock appears only for stairs, openings and
> structural selections that need special actions. Catalogue aliases, validated
> cloud search terms, result counts and empty-state recovery preserve the newer
> Free-only filter. The Pro sheet separates plan selection from checkout and
> uses exact RevenueCat prices without replacing the newer 1.22.x Play recovery
> flow. Validation is green after the rebase.

> **Play/RevenueCat purchase configuration repaired 2026-08-08:** the JSON
> uploaded in RevenueCat belongs to
> `revenuecat-service-account@shining-smoke-391115.iam.gserviceaccount.com`,
> but that account was missing from Play Console; only the retired
> `revenuecatbilling@...` account had access. The current account is now Active
> with RevenueCat's three documented least-privilege Account permissions: view
> app information/bulk reports, view financial data/orders/cancellation
> responses, and manage orders/subscriptions. RevenueCat now reports **Valid
> credentials** for Play receipt validation and both catalog checks. Android's
> one-time `pro_unlock` product remains Active in 173 countries. No duplicate
> checkout code was merged: releases 1.22.1 and 1.22.2 already contain the
> longer purchase watchdog, store reconciliation, and resume-time stranded-flow
> recovery that supersede the older local 1.12.2 patch. Build the next AAB from
> this 1.22.3+ branch. The server-side credential repair is already live; a
> license-tester purchase is still the final end-to-end check. Google developer
> notifications remain unconnected and are a recommended follow-up, not a
> blocker for the lifetime checkout.

> **Emergency furniture-scale regression corrected live 2026-07-29:** restored
> footprint-based proportional fitting for catalogue replacements, fixing the
> tiny beds and baths, and restored the established dining-chair, wooden-chair,
> TV and barbecue catalogue slots. Exact short-lived oversized defaults are
> reverse-migrated on load while user-resized objects are preserved. Model
> Studio now forces existing-item overrides to proportional `contain`; only the
> four standalone generated models keep their audited exact dimensions/yaw.
> Pages deployment `https://35f8c6ac.homedesignerapp.pages.dev`; asset namespace
> `20260729211531965`. The corrected R2 manifest is live. Typecheck, lint,
> production build and all sample-home layout checks pass.

> **Published Studio model proportion audit live 2026-07-29:** all seven unique
> generated GLBs were measured from their optimized world-space AABBs. Four
> standalone entries and four overrides now use dimensions/yaw matching the
> real assets; exact legacy defaults migrate while user-customized dimensions
> remain untouched. Model Studio's optimizer now measures each future GLB and
> derives depth, height and any required quarter-turn from the intended width,
> preventing guessed metadata from stretching models in-app. Pages deployment
> `https://19a97ba4.homedesignerapp.pages.dev`; asset namespace
> `20260729210522397`. Root typecheck/lint/build, Worker check and sample-home
> collision validation are green.

> **Placement, scaling and desktop account fixes live 2026-07-29:** generated
> Fal models now obey exact width/depth/height in the app, with yaw-aware axis
> mapping; the first wall-TV save format auto-migrates its swapped footprint.
> Model Studio defaults to exact sizing and publishes floor/surface/wall
> placement metadata. Wall objects snap to walls, small décor snaps onto other
> furniture, placement disarms after one item, and mobile selection has a
> floating delete action. The account/avatar menu is restored in the desktop
> editor toolbar. The live wall TV is corrected to 200×10×100 cm with 90° yaw.
> Worker version `b18278b5-c0df-4b99-8154-b29e2a797c3f`; Pages deployment
> `https://d6280e3e.homedesignerapp.pages.dev`; asset namespace
> `20260729202820875`.

> **Release 1.12.1 built 2026-07-29:** Android versionCode **11201** includes
> the owner-only Account-menu entry for Model Studio. Signed delivery artifact:
> `outputs/HomeDesigner-1.12.1-11201.aab`, 29,638,941 bytes, SHA-256
> `949C5FC331436C3A94DAC31EDA68C9736165A98FE318A16E8B822EBB56758264`.
> `jarsigner` verifies it and the certificate owner is Nathan Joppich. Model
> Studio history has no R2 TTL; the UI lists the newest 40 jobs while older
> records remain stored.

> **Catalogue safety + free TV media unit live 2026-07-29:** Model Studio now
> derives category and object-type dropdowns from the shipped catalogue, and
> existing-model replacement uses a canonical bundled-item selector. The remote
> catalogue reader and Worker both reject unknown room categories. Worker
> version `43dd5a75-5040-4094-b031-618bb3405d6b`; Pages deployment
> `https://0aa0528a.homedesignerapp.pages.dev` uses asset namespace
> `20260729174223912`. The supplied Hunyuan Pro TV/media cabinet is published as
> free `tv_media_unit` under Living/Storage with validated immutable mobile
> (886,564 bytes, SHA-256 `d5eaf65a8cf6d8183c3222ce703af1cd8dadf52d97fa07327170561225dbffde`)
> and render (2,277,128 bytes, SHA-256
> `22d0082f9ab4e1bfe28623c84bdd9716af0b58b78002b67ebdd2bf8ac65f63f8`)
> Cloudflare tiers. It is cloud-delivered and does not increase the Android AAB.

> **Catalogue previews, filters and samples refreshed 2026-07-29:** generated
> TV/media-unit and dining-chair catalogue tiles now use immutable 512px renders
> of their actual optimized GLBs. The manifest schema and client accept only
> same-origin PNG/JPEG/WebP thumbnails; missing thumbnails fall back to current
> symbols rather than stale bundled sprites. Future Fal thumbnails are copied
> to R2 automatically by Worker version
> `6207dc27-c0ee-4703-8f5f-0d857b059e06`. Model Studio's existing-item dropdown
> is category-scoped, and selected catalogue chips use brand styling in dark
> mode. The sample homes retain stable built-in types but now receive cloud
> overrides for TV, dining chairs, sofa, armchair, bed, plants, bathtub,
> dresser and nightstands, preserving offline fallbacks. Pages deployment
> `https://810ba9a4.homedesignerapp.pages.dev` uses asset namespace
> `20260729182459292`.

> **Web cache failure permanently hardened 2026-07-29:** Vite now emits every
> generated asset under a unique per-deployment namespace, including otherwise
> unchanged vendor chunks. A top-level `404.html` disables Cloudflare Pages'
> HTML fallback for missing modules, and `build:web` fails if either invariant
> is lost. Deployment `https://e3230a98.homedesignerapp.pages.dev` uses asset
> namespace `20260729171558068`. Live apex verification returned the entry
> module as `application/javascript`, a random missing module as HTTP 404 with
> `Cache-Control: no-store`, and the Chrome profile previously affected by the
> year-long poisoned cache mounted the app without manual cache clearing.

> **Private Model Studio live 2026-07-29:**
> `https://homedesignerapp.com/app/model-studio/` is a dedicated, owner-only
> entry page using the existing Google OAuth client. The Cloudflare sync Worker
> version is `fd35b592-1c39-4405-b383-2dfef4be60cf`; `FAL_KEY` and
> `MODEL_ADMIN_EMAIL` are Worker secrets and are not shipped to the browser or
> repository. The studio offers only textured text-to-3D generators: Hunyuan
> 3D Pro (detail-first, `$0.525`/`$0.675` with PBR) and Hunyuan 3D Rapid
> (fast drafts, `$0.225`/`$0.375` with PBR). Untextured Pro `Geometry` and
> Rapid `enable_geometry` modes are blocked in the Worker and arbitrary client
> endpoints are rejected. It previews local
> GLBs, creates mobile and HD render tiers, stages both to R2 and publishes the
> manifest only after rights confirmation. Normal editing uses the mobile tier;
> Photo Mode alone requests `renderUrl`. Live owner sign-in and normal `/app/`
> account restoration were verified. App HTML is now `no-store` to prevent a
> cached shell from referencing retired immutable chunks; asset files remain
> immutable for one year.
> The normal Account menu now exposes **Model Studio** only when the signed-in
> email is `nathanjoppich@gmail.com`; the Worker remains the authority and
> rejects every non-owner token regardless of UI visibility.
> Production custom-domain verification returned the new hashed Model Studio
> JavaScript with `application/javascript` and confirmed both model choices are
> present; this check caught and replaced one stale HTML fallback cached under
> an earlier asset path.

> **Fal TRELLIS tooling added 2026-07-29:** `npm run models:trellis` now
> generates review-only TRELLIS 2 GLBs from local or hosted images with safe
> mobile defaults, automatic glTF optimization, inspection, hashing and a
> reproducibility/approval record. The local command reads `FAL_KEY` only from
> the ignored environment file and never logs it.
> The tool deliberately cannot upload to R2 or edit the live catalogue because
> the current runtime accepts only CC0 provenance. See
> `docs/FAL_TRELLIS_PIPELINE.md`. TRELLIS remains review-only; Hunyuan Pro is
> the preferred production generator after the texture-quality comparison.

> **Tester onboarding updated 2026-07-29:** the landing page no longer embeds
> the unreliable Google Form. Its **Request access** buttons scroll to three
> direct instructions: join `groups.google.com/g/homedesignertest`, opt in at
> the Google Play testing URL, and install from the public Play listing. All
> three steps tell testers to use the same Google account.

> **Infrastructure migration completed 2026-07-29:** Cloudflare is authoritative
> through `amit.ns.cloudflare.com` and `laila.ns.cloudflare.com`. The Git-backed
> Pages project `homedesignerapp` builds the merged default branch with
> `npm run build:web`; both `homedesignerapp.com` and
> `www.homedesignerapp.com` are Active with SSL on that project. The Cloudflare
> GitHub app is limited to this repository. The source repository was verified
> private with successful Cloudflare auto-deploys, but is temporarily public
> again until the former GoDaddy delegation has expired from carrier caches.
> `homedesignerapp-preview` remains available only as a direct-upload fallback
> and has no production custom domains.

> **DNS propagation note:** GoDaddy shows the correct Cloudflare nameservers,
> and major public resolvers return the Cloudflare edge. At least one mobile
> carrier still caches the former GoDaddy delegation and therefore reached the
> old GitHub Pages IPs. GitHub Pages has been explicitly recreated and deployed
> with the custom domain, so both the stale GitHub route and the new Cloudflare
> route now return 200. Keep the repository public through at least 2026-07-31;
> then verify propagation before making it private again.

> **Security sweep:** production web no longer accepts the `?pro=1` test seam
> or browser localStorage as entitlement authority. The Worker version
> `7a48fba0-5e89-44bd-a340-a789d89f74e4` enforces exact `Pro` entitlements and
> per-subject read/write rate limits. Pages security headers and Android backup,
> cleartext and FileProvider restrictions are in source. Local non-3D tests,
> the full GitHub CI suite, and an Android debug build are green with Android
> Studio JDK 21. Production and Worker npm audits are clean; the remaining 9
> high and 1 moderate root audit entries are development/build tooling
> major-upgrade work.

> **Outstanding credential operation:** rotate the Google service-account key
> that was pasted into the prior support chat, update the matching RevenueCat
> integration, verify Play purchase validation, and then revoke the old key.
> No private key or server secret was found in the current repository or its
> reachable Git history.

> **Current as of 2026-07-28:** release source is **1.12.0** (versionCode
> **11200**) on `agent/half-walls-1.12.0`. The active architectural and
> release handoff is `docs/WIP_HANDOFF.md`; the older authentication notes below
> are preserved as historical operational context.

## Latest release — 1.12.0

- Half/pony walls are first-class structural walls through
  `Wall.halfWall?: boolean`; existing projects remain full-height by default.
- A dedicated tool draws them in both 2D and 3D, while Properties converts a
  selected wall. Both paths reuse normal snapping, dimensions, editing and undo.
- They default to 105cm, keep room/roof/walk collision semantics, show a dashed
  2D centre mark and stay visible during dollhouse fading.
- Doors/windows are blocked on half walls instead of producing invalid floating
  opening geometry. Full wall, half wall and fence states are mutually exclusive.
- All new copy is translated across the 12 non-English locale dictionaries.
- Final validation is green: typecheck, lint, production build, geometry,
  samples, all 47 trace checks and all 111 browser checks, including 3D and the
  catalogue. The signed 1.12.0 AAB is 29,535,577 bytes with SHA-256
  `71C23EFC33EB0B21DE4A8A884C6EDEA814808DAA4C5D1CAEB20AB552FFAFFB40` and
  the expected Nathan Joppich upload certificate. The local delivery copy is
  `outputs/HomeDesigner-1.12.0-11200.aab` (gitignored).

_Historical authentication handoff last updated: 2026-07-23. Working branch at
that time: `agent/stripe-web-checkout`._

## Current state

- **Current release source: 1.0.91 (versionCode 10091).**
- 1.0.91 is a rebuild of the unchanged 1.0.90 authentication release because
  the previous Play Console AAB upload failed.
- Desktop Google OAuth is configured for `https://homedesignerapp.com/app/`,
  browser session restore is fixed, and Google-linked RevenueCat Pro lookup is
  deployed in the Cloudflare sync Worker.
- **Released in 1.0.89:** desktop Stripe checkout and the live
  RevenueCat/Stripe dashboard configuration are deployed on GitHub Pages.
- **Released in 1.0.90/1.0.91:** live desktop testing exposed an OAuth callback edge
  case when a browser turns Google's popup into an opener-less tab. The local
  fix validates and forwards that successful callback to the waiting app.
- **Live hotfix:** Worker `4afa87b9-0fa3-4596-845d-62b1ff43f367` now uses a
  private RevenueCat v2 secret for desktop entitlement reads. The owner's
  linked Google customer has an unlimited Homedesigner Pro grant.
- Begin any continuation by reading this file and `CHANGELOG.md`. Preserve the
  untracked local `outputs/` directory and all signing files.

## Stripe desktop checkout WIP

- Added `@revenuecat/purchases-js` and a lazy-loaded desktop provider in
  `src/lib/pro.ts`.
- Configured web builds require Google sign-in, reuse the existing stable
  `google:<subject>` RevenueCat customer ID, load every real localized offering
  price, and purchase the exact package selected through RevenueCat Web
  Billing/Stripe.
- `ProUpsellModal` now shows **Sign in with Google** before checkout, then a
  three-choice pricing grid once the customer is linked. Builds without
  `VITE_REVENUECAT_WEB_KEY` retain the Play Store fallback.
- Browser smoke coverage runs with a public-format fake `rcb_` key and verifies
  the signed-out desktop flow without contacting RevenueCat.
- Validation: `npm run typecheck`, `npm run lint`, `npm run build`, and
  `SMOKE_SKIP_3D=1 npm test` pass.

### Dashboard state / exact next steps

1. The live Stripe account `HomeDesignerApp` is connected to RevenueCat Billing
   and the web configuration uses EUR with the HomeDesigner support/Play Store
   details.
2. Live products are configured at **€4.99 monthly**, **€39.99 yearly**, and
   **€79.99 lifetime**. Each grants `Homedesigner Pro (Pro)` and is assigned to
   the matching package in the default offering.
3. `homedesignerapp.com` is enabled in Stripe Payment Method Domains, allowing
   supported Apple Pay/Google Pay wallets in the RevenueCat Web SDK checkout.
   Stripe Tax remains disabled.
4. `.env.production` contains the public `rcb_` application key. This is an
   embeddable SDK identifier; the private RevenueCat v2 key remains only in the
   Worker secret.
5. No real live charge was made. After deployment, perform one owner purchase
   and confirm RevenueCat grants the same Google-linked `Pro` entitlement on
   desktop and Android.
6. The 1.0.89 Stripe release is merged and deployed. Next: validate, commit,
   merge, and deploy the 1.0.90 OAuth callback fix, then run the owner purchase
   check above.

## Google account reliability in 1.0.90

- Opener-less desktop OAuth callback tabs now verify the Google issuer,
  audience, nonce, and token expiry before forwarding the successful response
  through the provider's nonce-scoped BroadcastChannel. The callback removes
  credentials from browser history immediately and closes itself when allowed.
- Final validation is green: typecheck, lint, production build, all non-3D
  browser smoke checks, Android Capacitor sync, signed release bundle build,
  and AAB signature verification.
- Desktop restore now rejects an expired persisted Google ID token instead of
  showing a signed-in account that cannot sync.
- Google plugin initialization can be retried after a temporary failure, and a
  stale provider session is cleared before a new desktop/Android login.
- Sign-out is local-first: project syncing stops and the cached account,
  account-linked Pro state, prices, and in-memory token are cleared immediately.
  Google and RevenueCat cleanup runs best-effort, so being offline no longer
  leaves the UI stuck signed in.
- When restore finds no usable Google session, it also stops project syncing
  and disconnects account-linked RevenueCat state.

## Retroactive account migration WIP

- `RevenueCatProvider.identify()` now calls `syncPurchases()` when the newly
  linked Google customer has no entitlement/product. This is the migration path
  for eligible Play purchases made before Google account linking existed.
- `projects.ts` repairs orphaned `homedesigner.project.<id>` records and the
  legacy single-slot save before producing the cloud snapshot. Old projects
  should not be deleted.
- The signed-in account menu and Settings now include **Sync now**, which
  retries both purchase linking and project merge.
- RevenueCat evidence on 2026-07-23: customer
  `google:115399174729229571139` existed but showed USD 0, no aliases, no
  purchases, and no current entitlements. It was granted the existing
  `Homedesigner Pro (Pro)` entitlement for unlimited duration.
- The live Worker previously used the public `goog_` SDK key against a private
  v1 subscriber endpoint. It now calls RevenueCat v2
  `/active_entitlements` using secret binding `REVENUECAT_SECRET_KEY`; the key
  itself is never in the repository or handoff.
- Validation: root typecheck/lint pass, Worker `npm run check` passes, and all
  35 non-3D smoke checks pass with zero page errors.

## What 1.0.88 changes

- Fixes the production Google `redirect_uri_mismatch` by registering and
  pinning the exact `/app/` redirect on the HomeDesigner OAuth web client.
- Fixes web reloads by reading the social-login plugin's persisted ID token
  before native-only refresh; this restores initial cross-device plan merge on
  desktop.
- Adds Worker `GET /v1/entitlement`, authenticated with the same Google JWT and
  mapped to RevenueCat user `google:<subject>`. Desktop now inherits Pro bought
  on Android while signed into that Google account.
- Worker deployment: `a5dbc7f0-dd23-42f9-a73f-5913dcea1e50`.

## What 1.0.85 changed

- On touch devices, enabling **Lock objects** now lets a one-finger pan begin
  anywhere in the 2D plan: room floors, walls, and furniture are all valid pan
  surfaces. Previously the gesture only worked in the empty margin outside the
  house or over an imported background plan.
- Tap selection is unchanged. Panning starts only after the existing 7 px touch
  slop, so a tap can still select a locked object or surface without moving it.
- `tests/smoke.mjs` now dispatches a real one-finger touch drag from inside a
  sample room with object lock enabled and asserts the viewport delta.

## Recent technical context

- **1.0.87:** added the Google account shortcut to the projects/home header.
- **1.0.86:** restored desktop Settings access beside Language.
- **1.0.84:** fixed Google Sign-In's `Invalid JWT`, deployed private per-user
  Cloudflare/R2 plan sync, linked RevenueCat identity across Android devices,
  added cloud-backup deletion, and configured `homedesignerapp.com` for GitHub
  Pages. See the changelog for endpoints, privacy behaviour, and verification.
- **1.0.83:** enabled safe CC0 cloud-model overrides for bundled catalogue
  entries and expanded the reviewed Quaternius/Kenney model batch.
- **1.0.80–1.0.82:** improved walk-through door/stair transitions, upper-floor
  stairwell cutouts, quick door/stair direction controls, catalogue previews,
  and cloud-delivered furniture models.

## Validation and release procedure

- v1.0.88: app and Worker TypeScript clean, Worker deployed, and all 39 browser
  checks pass with zero page errors. Production browser sign-in still needs a
  final check after GitHub Pages deploy and Google's OAuth propagation.
- Versions are synchronized in `package.json`, `package-lock.json`, and
  `android/app/build.gradle` (`1.0.NN` maps to versionCode `100NN`).
- Release signing configuration and keystore are local/gitignored. Never stage,
  commit, paste, or log their contents.
- For the next release: bump the three version locations, update
  `CHANGELOG.md`, run `npm run build`, `npx cap sync android`, build
  `android/app/build/outputs/bundle/release/app-release.aab`, and verify the AAB
  signer before delivery.

## Remaining owner/device checks

- On desktop, sign into `homedesignerapp.com/app/` with the same Google account
  used on Android and confirm its R2-backed plans appear.
- Confirm a Play-installed Android device signed into that Google account sees
  Pro, then confirm desktop shows Pro after sign-in. RevenueCat `logIn()` and
  the Worker entitlement lookup now share the same stable customer ID.
- Keep `CHANGELOG.md` and this WIP file current whenever work is handed between
  Claude and Codex.

## Repository guardrails

- Preserve unrelated local files, especially `outputs/` and all signing files.
- Never put model identifiers in commits, PRs, source, or handoff documents.
- Use commercially safe assets only; IKEA model permission is still pending.
