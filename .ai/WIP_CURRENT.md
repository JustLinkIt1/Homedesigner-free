# WIP — current handoff

_Last updated: 2026-07-23. Working branch: `agent/stripe-web-checkout`._

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
