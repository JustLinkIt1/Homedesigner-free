# Mobile capture, AI render styles and point purchases — 2026-09-24

## Status

Implemented on the production source line and assigned app version 1.22.28 /
versionCode 12228. A signed, verified AAB is available at
`outputs/HomeDesigner-1.22.28-12228.aab`; it has not been uploaded to Play.
Production D1 was backed up and migrations 0005–0006 are applied. Worker version
`25357def-4259-4f82-91b8-28fcdc4b296d` is deployed with
`AI_RENDER_ENABLED` absent, so generation remains disabled. No licensed
purchase or paid fal request has been made yet. Previously built 1.22.27 AABs
do **not** contain these changes. All six Play point products are active in 173
countries/regions at the approved USD base prices; Play localizes and charms
the final regional prices.

## Product behavior

- 3D → Render image → AI render · Pro.
- Requires sign-in, verified email and server-confirmed Pro. A client-side Pro
  cache is not enough to authorize generation.
- One successful free AI render per account, then 200 AI points per render.
  This uses the existing AI feature-plan price, not an invented store price.
- The existing 400-point verified-account grant remains separate: if unspent,
  it can pay for two additional renders. No automatic card charge or top-up.
- Six fixed treatments use the same price: Photorealistic, Modern,
  Scandinavian, Industrial, Coastal and Luxury. Prompts are expanded on the
  server; clients cannot supply arbitrary prompts or provider options.
- Explicit consent sends only the current JPEG preview and a server-controlled
  layout-preserving prompt to fal.ai. No plan JSON or account identity is sent.
- Endpoint: fal-ai/flux-pro/kontext; guidance 3.5, one JPEG, safety tolerance 2,
  prompt enhancement disabled. Reference provider cost is $0.04 per image;
  recheck pricing before enabling.
- AI may change architectural details; output is a visualization, not a
  construction drawing. The editable plan is unchanged.
- Closing/reopening resumes the latest job. Save completed images promptly:
  provider image links and Android cache files are not permanent storage.

## Mobile repair

Captures now obey GPU limits, cap touch-device exports to 2 MP / 2048 px per
side, and avoid multiplying export scale by screen DPR. Renderer dimensions,
render target and post-processing dimensions are restored in finally, followed
by a live-view redraw. The postprocessing composer takes CSS dimensions and
derives physical buffers itself; passing physical dimensions doubled the DPR.

Photo mode uses a demand-rendered DPR-1 raster path on touch devices, without
the path tracer, extra render-model set, shadows, contact shadows or
post-processing chain. Native Android Auto quality also uses DPR 1, disables
MSAA and real-time shadow effects, and requests a low-power context after Play
vitals identified GPU-wait ANRs. Manual Medium/High remains available.
Android images are staged in
the share provider's supported Cache directory rather than Documents. Genuine
share errors reach the UI; dismissing the share sheet is harmless.

## Backend and accounting

Migration 0005 adds private render jobs and hashed one-time allowance markers;
migration 0006 adds the validated style ID to each job.
SQL triggers reserve/debit and refund atomically. Duplicate request IDs cannot
dispatch twice, insufficient balances cannot go negative, and a changed price
requires fresh confirmation. Failed free jobs return the allowance; failed paid
jobs refund once. Only the owning account can poll or download an image.

One active job per account; 20 attempts per account per rolling day; 5,000 free
attempts globally per rolling 30 days. Failed attempts still count toward abuse
limits. Submission has a 20-second network deadline and does not automatically
resubmit through the SDK. A lost submission acknowledgement can leave a
provider-side job with no retrievable ID: the user is refunded, never charged
again automatically. Reserved jobs recover after 2 minutes; queued jobs after
30 minutes. Polling drives recovery; there is no background sweeper yet.

Account erasure removes direct identity and image/request links from jobs,
retaining hashed usage/allowance markers to prevent free-allowance resets.
Input images are not stored in D1. The fal key stays in Worker secrets.

## Release order / prerequisites

1. Completed 2026-09-25: backed up D1, confirmed the
   `homedesigner-community` target and applied migrations 0005 and 0006. Use
   Wrangler 4.140 or newer: 4.115's splitter produced incomplete
   `CREATE TRIGGER` statements. Account deletion also uses the new tables.
2. Completed 2026-09-25: confirmed the FAL key name without printing the
   secret and deployed the Worker with `AI_RENDER_ENABLED` absent. Only the
   exact value `true` enables generation. Existing completed results remain
   downloadable while disabled.
3. Play consumable products points_2000, points_6000, points_15000 and their
   _pro variants are active in 173 countries/regions. Base prices are USD 1.99,
   5.99 and 14.99; Pro base prices are USD 1.40, 4.20 and 10.50. Confirm the
   localized/charmed prices and complete license testing. The purchase is
   launched with an account-bound opaque identifier. The Worker verifies the
   receipt and binding, credits the ledger idempotently, confirms settlement,
   then consumes it through the Play Developer API to allow repurchase. The
   native client never consumes a point token. Unavailable products have
   disabled purchase buttons; opening the dialog reconciles interrupted claims.
   Cross-account or unsettled ledger receipts are never consumed. The existing
   point-purchase ledger has a detectable interrupted-credit window: monitor
   readUnsettledPurchases and reconcile through support before launch.
4. Web point checkout requires STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET and the
   existing signed-webhook credit flow. Do not enable a checkout with no working
   webhook. No payment configuration was changed in this implementation.
5. Publish the updated privacy page and review Play Data safety / AI-generated
   content obligations before launch, including any required reporting route.
6. Test on a physical affected Android phone: all three export qualities,
   Photo mode, cancel/share/save, return to live 3D, portrait/landscape and a
   complex plan. Test a licensed Pro account's free → 200 points → insufficient
   balance flow, purchase/restore/rebuy, app closure and failed generation.
7. Enable the Worker flag for the final paid-provider check. Build a new,
   correctly versioned AAB and web release only after confirming current Play
   versionCode; do not overwrite the earlier artifact under the same filename.

Emergency stop: set AI_RENDER_ENABLED false; never remove accounting tables or
reset balances to disable generation. This implementation does not configure a
global paid-provider budget; retain fal-side spending limits/alerts.

## Verification

- Full npm run test:ci passed, including geometry, 12-locale coverage, billing,
  entitlements, points and community tests.
- 68 render checks cover capture caps/recovery, composer resize behavior,
  idempotency, account isolation, allowance/debit/refund, request validation,
  server-owned style prompts, actual fal SDK with stubbed HTTP, no automatic
  billable retry and stale jobs. Performance-tier checks fence Android Auto at
  the low GPU tier.
- Root and Worker TypeScript checks, ESLint, production build and the signed
  Android release bundle passed. The AAB verifier confirmed versionName 1.22.28,
  versionCode 12228, the embedded 1.22.28 web bundle and bundled models.
- Browser confirmed the AI menu and free-user Pro gate. Standard desktop export
  exercised locally; before/after screenshots confirm unchanged live framing.
  Real Android sharing, signed-in AI dialog end-to-end,
  live receipt purchases and a paid fal request remain release checks.
