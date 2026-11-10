# AI quality and release review

Updated 2026-10-06. **1.22.29 / 12229**: web/backend live, Android upload pending.

Production is confirmed live on 1.22.27. All six point SKUs have an active Play
purchase option. The focused gate passes 253 behavioral checks, both typechecks,
translations and lint. Full CI, production web build and signed Android build
passed after full access was granted and the SDK path was configured. Migration
0007 and the updated Worker are deployed. Web sign-in and all three assistant
requests passed live with the expected 10/25/25 debits. Real room naming got 34/42
accepted and five wrong: review all suggestions, regardless of confidence.
Play upload is blocked by denied browser file-upload permission. No physical
license purchase or real fal generation has passed yet. See WIP for exact status.

For the normal local release environment, run `node scripts/prepare-ai-release.mjs`.
It stops on any failed check, freshly builds/syncs the app, verifies the AAB and
copies it to a versioned file without overwriting an earlier artifact. `--plan`
prints its steps without building. It does not deploy or publish, and a successful
build does not replace the live billing/provider and Play policy gates below.

## Repeatable local checks

Run from the correct worktree:

```powershell
node scripts/check-ai.mjs
node scripts/check-ai.mjs --release
```

The first command checks assistant inputs/outputs, real SQLite accounting,
stubbed render/capture flows, translations, both typechecks and repository lint.
The second also runs the complete CI list, production build and web assembly.
Neither command purchases points, generates paid media, deploys or rolls out.
Failures are release blockers; a sandbox/build-process failure is not a pass.

## Behavioral gates before shipping

- Sign in, switch accounts, sign out, and reopen both AI dialogs. Never show or
  apply another account's response. Restore purchases only for the bound account.
- Generate names/style/copy, change rooms, furniture, doors, floors or projects,
  then verify the old suggestion cannot apply. Pending replies must not revive
  old suggestions. Apply names/styles once and undo once to restore the plan.
- Test empty plans, invalid polygons, over-20-room levels and outdoor-only plans.
  Styling indoor rooms must leave garden/patio surfaces intact.
- Test sufficient/insufficient balances, duplicate concurrent request keys,
  provider failure, output validation failure, refund retry and negative balances.
  A replay must neither debit twice nor run the provider for free. Duplicate text
  keys return 409; text results are not cached for retrieval after a lost reply.
- Review descriptions manually: schema/prompt restrictions are not a proof that
  generated text is factual. Review low-confidence room labels before applying.
- Verify prices, a licensed Play purchase, interrupted receipt reconciliation,
  restore and repurchase on a physical Android device. Check server settlement
  before consumption. Review the legacy unsettled-purchase reconciliation list.
- Verify one successful paid fal request and failure handling before enabling
  `AI_RENDER_ENABLED`. It remains disabled in the recorded production state.
- Inspect mobile capture restoration, real low-end-device memory/GPU behavior,
  and post-release ANRs. Headless capture tests do not replace device checks.

## Next feature

Auto-furnish remains the next useful metered capability (50 points), but it is
**not implemented in this batch**. Require catalog-only items, proper free/Pro
gates, candidate geometry validated before a charge, room containment, furniture
collisions and doorway clearance, preview before Apply, one undo step, and stale
project protection. Do not accept arbitrary model-generated coordinates.

## Follow-up state

A daily in-chat quality/development follow-up was requested on 2026-10-02. The
automation tool refused creation because tool approval is unavailable in this
session. **No recurring check is active.** Do not imply unattended monitoring.
