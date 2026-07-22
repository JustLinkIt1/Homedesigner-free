# WIP — current handoff

_Last updated: 2026-07-22. Release branch: `agent/locked-2d-pan-1.0.85`._

## Current state

- **Latest release: 1.0.85 (versionCode 10085).** The signed Android App Bundle
  is built from this branch and delivered to the owner's Google Drive.
- There is no partially implemented code task. The owner is handing active work
  back to Claude; begin by reading this file and `CHANGELOG.md`.
- Release source is based directly on the repository default branch after PR #3
  merged v1.0.84. No Claude changes were overwritten.

## What 1.0.85 changes

- On touch devices, enabling **Lock objects** now lets a one-finger pan begin
  anywhere in the 2D plan: room floors, walls, and furniture are all valid pan
  surfaces. Previously the gesture only worked in the empty margin outside the
  house or over an imported background plan.
- Tap selection is unchanged. Panning starts only after the existing 7 px touch
  slop, so a tap can still select a locked object or surface without moving it.
- `tests/smoke.mjs` now dispatches a real one-finger touch drag from inside a
  sample room with object lock enabled and asserts the viewport delta.

## Recent technical context

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

- v1.0.85: TypeScript clean, ESLint clean, and all 37 browser smoke checks pass,
  including the locked-interior one-finger pan regression.
- Versions are synchronized in `package.json`, `package-lock.json`, and
  `android/app/build.gradle` (`1.0.NN` maps to versionCode `100NN`).
- Release signing configuration and keystore are local/gitignored. Never stage,
  commit, paste, or log their contents.
- For the next release: bump the three version locations, update
  `CHANGELOG.md`, run `npm run build`, `npx cap sync android`, build
  `android/app/build/outputs/bundle/release/app-release.aab`, and verify the AAB
  signer before delivery.

## Remaining owner/device checks

- Install v1.0.85 on a physical phone and confirm one-finger panning feels
  natural when starting over rooms, walls, and furniture with Lock enabled.
- Google Sign-In, cross-device plan restore, and RevenueCat Pro restore still
  need final end-to-end confirmation on two Play-installed Android devices.
- Keep `CHANGELOG.md` and this WIP file current whenever work is handed between
  Claude and Codex.

## Repository guardrails

- Preserve unrelated local files, especially `outputs/` and all signing files.
- Never put model identifiers in commits, PRs, source, or handoff documents.
- Use commercially safe assets only; IKEA model permission is still pending.
