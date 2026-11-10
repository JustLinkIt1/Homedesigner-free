# AI design assistant — 1.22.29

## Product surface

The editor's More menu opens one mobile-safe assistant with three inexpensive
Workers AI tools:

| Tool | Cost | Result |
|---|---:|---|
| Smart room names | 10 points | Closed-set names matched to room geometry and furniture |
| Coordinated style | 25 points | One of the eight existing wall/floor room presets |
| Project description | 25 points | A bounded headline and factual 2–4 sentence summary |

These tools are not Pro-gated. A verified signed-in account receives the
existing 400-point one-time grant, and both free and Pro accounts may buy the
existing point packs. Pro continues to receive its point-pack discount. The
shared purchase component exposes localized Play prices, restore/reconciliation
and web checkout availability from either AI dialog.

## Data and safety boundaries

The client derives a maximum of 20 room summaries on device. Each contains an
opaque room ID, rounded area and bounding dimensions, up to 40 furniture type
slugs, and whether the polygon is outdoors. Coordinates and the complete design
file are never sent. The style tool may additionally send an optional mood of
at most 120 characters; the description tool sends the project name, capped at
100 characters.

The Worker owns prompts, prices and allowed outputs. Room naming uses the
existing canonical room-name set. Style suggestions can only return one of
`scandi`, `loft`, `classic`, `coastal`, `cozy`, `spa`, `blush` or `noir`.
Unknown IDs, invented styles, unreadable JSON and overlong text fail the job and
trigger a point refund. The description prompt explicitly forbids invented
location, price, property condition, views and amenities.

All three endpoints use `runMetered`: debit atomically before dispatch, identify
the spend with an account-scoped client retry token, and refund once on failure.
No new database migration or fal.ai request is required.

Spend and refund each use a transactional D1 batch, not separate balance and
ledger writes. Duplicate text-AI keys return 409 without redispatch; text output
is not cached. New generation attempts must use a new key and incur the normal
cost. Dimensions/counts are finite and bounded, room IDs are unique and furniture
slugs are length-limited. Invalid requests fail before a debit.

## Application behavior

Room names are applied as one store commit, so Undo restores the whole naming
pass. A style is only previewed until the user taps Apply; applying the preset
uses the existing room-style action on indoor rooms only and remains one undo
step. Patio/garden surfaces are not restyled. Suggestions are bound to project,
floor and relevant plan facts; changed plans require a fresh suggestion. Applied
room labels use the current UI language, and low-confidence labels are flagged.
Generated descriptions never modify the design and are copied only on an
explicit tap.
Copy remains a draft requiring review; the prompt cannot guarantee factuality.

See `AI_QUALITY_CHECKLIST.md` and `node scripts/check-ai.mjs` for repeated QA.

## Release checklist

1. Run full CI, lint and the production build in the normal release environment.
2. Deploy the Worker before shipping the 1.22.29 client so both new endpoints exist.
3. Test success, insufficient balance, duplicate retry and provider/validation
   failure refunds with a licensed account.
4. Apply and undo both a multi-room rename and a style recommendation.
5. Verify localized Play prices, purchase, interrupted-purchase restore and
   repurchase from the new assistant on a physical Android device.
6. Keep the fal image-render flag disabled until its separate paid-provider
   and licensed-purchase gates are complete; the Workers AI assistant does not
   depend on that flag.
