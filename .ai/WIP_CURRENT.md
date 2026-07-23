# WIP — current handoff

_Last updated: 2026-07-23. Release branch: `agent/desktop-auth-sync`._

## Current state

- **Current release source: 1.0.88 (versionCode 10088).**
- Desktop Google OAuth is configured for `https://homedesignerapp.com/app/`,
  browser session restore is fixed, and Google-linked RevenueCat Pro lookup is
  deployed in the Cloudflare sync Worker.
- Begin any continuation by reading this file and `CHANGELOG.md`. Preserve the
  untracked local `outputs/` directory and all signing files.

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
