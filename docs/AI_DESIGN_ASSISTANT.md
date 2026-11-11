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

---

# Designer review and voice tour (1.22.31, not deployed)

Two tools backed by paid providers. Both appear at the top of the assistant,
and only when `/v1/points` reports them under `available`, which is true only
when the Worker has the keys. An older Worker, or one without keys, shows
neither.

| Tool | Cost | Who | Providers | Result |
|---|---:|---|---|---|
| Designer review | 200 points | any signed-in account | Claude | Score out of 10, a short summary, four or five concrete changes |
| Voice tour | 250 points | Pro only | Claude, then ElevenLabs | A narration of about fifty seconds as MP3, plus its text |

## Switching them on

Set the keys as encrypted Worker secrets, then deploy:

```bash
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put ELEVENLABS_API_KEY
npx wrangler deploy
```

`ELEVENLABS_VOICE_ID` (a plain variable) picks a voice from the account's
library; unset, the tour uses the stock voice from ElevenLabs' API examples.
With only the Claude key set the review works and the voice tour stays hidden.

## What leaves the device

More than the Workers AI tools send, which is why both say so in the dialog:

- Both: up to 20 room summaries (as before) and the **room names the user
  typed** (40 characters each at most).
- Designer review: an optional request of up to 200 characters, and, unless
  the user unticks it, **a JPEG of the plan** (the framed 2D plan in plan
  view, the current 3D view otherwise) no larger than 1024 px.
- Voice tour: the project name. The narration text Claude writes is what goes
  to ElevenLabs; no plan data does.

Nothing is stored by the Worker: no prompt, picture, review, script or audio.
The privacy policy (`public/privacy.html`) names fal.ai as an AI processor
today. It and the Play Data safety form need Anthropic and ElevenLabs added
before release.

## Pricing (G1)

Both prices are worst cases at list rates, derived from caps the Worker
enforces before spending points:

| | Cap | Rate | Worst case |
|---|---|---|---:|
| Review input | ~4,800 tokens: prompt, 5,000 characters of plan text, one picture of at most 1100 px a side | $4 / M | $0.019 |
| Review output | 2,400 tokens, thinking included | $20 / M | $0.048 |
| **Designer review** | | | **$0.068 -> 200 points** |
| Tour script | ~2,600 tokens in, 1,500 out | $4 / $20 per M | $0.041 |
| Tour narration | 900 characters, Flash v2.5 | $0.04 / 1,000 | $0.036 |
| **Voice tour** | | | **$0.078 -> 250 points** |

`tests/ai-features.mjs` recomputes both from the constants in `ai-advisor.ts`
and fails if a cap is raised without the price following. The model is one
constant, `CLAUDE_MODEL`. Sonnet 5.5 costs half as much and Haiku 5.5 about a
fortieth; switching means recomputing `maxCostUsd` and re-reading real answers
for quality, not just editing the string.

Free-grant exposure: the 400-point grant buys two reviews, at most $0.14 of
Claude per new account. Voice tours are Pro only, so the grant cannot reach
ElevenLabs at all.

## Failure handling

Everything runs inside `runMetered`. A provider error, a rate limit, a
declined request (`stop_reason: "refusal"`), an answer cut off at the token
ceiling, a review with fewer than two usable suggestions, or a script shorter
than 120 characters all refund the points. No refusal fallback model is
configured: a fallback bills at another model's rates, and the price is
computed from one. An over-long script is cut at the last sentence inside the
character budget instead of being refunded, since the Claude call is already
paid for. The script is validated before ElevenLabs is called, so a bad script
never buys narration.

The app waits 90 seconds on these two routes (30 elsewhere). The Worker allows
Claude 50 seconds and ElevenLabs 30, with no automatic retries, so a failure
reaches the refund before the app gives up.

## Not verified

No live call has been made to either provider from this code. The request
shapes are tested against stubbed HTTP (`tests/point-routes.mjs`); the quality
of real reviews and narration, real latency, and audio playback and saving on
an Android device are all untested until the keys are set on a test deployment.

---

# AI plan (1.22.31, not deployed)

A floor plan from a short questionnaire plus a description in the person's own
words, revised in plain words afterwards. 300 points per generation, whether
it is a new plan or a change to the last one: it is the same call either way.
Uses the same `ANTHROPIC_API_KEY` secret as the designer review.

## Flow

1. **Questions.** Storeys (1 to 3), bedrooms (0 to 6), bathrooms (1 to 4),
   total size (30 to 400 m2), furnished, garage, and a free-text description of
   up to 400 characters. This is a form, not a chat: asking the same questions
   through the model would cost a call per answer and read worse on a phone.
   A brief whose rooms cannot fit its area is refused before any charge.
2. **Plan.** A drawing of each storey with room names and sizes, a title and
   a sentence or two from the model on why it is arranged that way.
3. **Change.** "Say what to change" (up to 300 characters) sends the current
   plan back with the request and returns a complete updated plan.
4. **Use this plan.** Loads it as a project: walls, doors, windows, rooms with
   floor finishes, storeys, a roof, exterior cladding, and furniture if asked.

The brief and the last plan are kept on the device per account, so closing the
dialog (to sign in, to upgrade, by accident) loses nothing that was paid for.

## Who can do what

- Any signed-in account can generate single-storey plans. The 400-point free
  grant covers one.
- More than one storey requires Pro, checked on the server before points are
  spent, the same gate as adding a storey in the editor.
- Free accounts have one project. Using a plan when that project already has
  content asks first, then replaces it. Pro opens the plan as a new project.
- The furnisher uses only free catalogue pieces for a free account.

## Why the model never writes coordinates

A language model asked for wall coordinates produces overlapping rooms, gaps
and walls that miss each other by a few centimetres. So it is not asked. It
describes each storey as a small tree: a `row` lays parts side by side, a
`column` stacks them from the back of the house to the front, and a part is
either a room or another row or column (three levels). `ai-plan.ts` turns that
into rectangles. A plan written this way cannot overlap, leave a hole or spill
outside the footprint, whatever numbers the model picks.

Everything else is derived by code rather than generated:

- **Sizes.** Shares are rescaled to fill the footprint exactly; every room is
  held to a minimum side for its type (a hallway 0.9 m, a bedroom 2.4 m).
- **Area.** The model's proportions, the brief's area: the footprint is
  scaled to within 15% of what was asked (wider limits on a revision, since
  "make it bigger" is a fair request).
- **Doors.** Placed on the wall two rooms actually share, if it is long
  enough. A door the model listed between rooms that do not touch is dropped.
- **Reachability.** Any room still sealed off is connected through its most
  public neighbour (hallway before living room before bedroom, never through
  a bathroom if there is another way). A plan that still cannot be walked
  fails and is refunded.
- **Front door, garage door, windows.** Added on outside walls, kept clear of
  each other and of the corners.
- **Furniture** (app side, `src/lib/aiPlan.ts`): rule-based per room type,
  placed against walls, kept out of the floor a door needs and off other
  furniture. It is a starter set, not a design; revisions change the plan,
  and furniture is edited by hand afterwards.

Structured outputs cannot express a recursive schema, so `PLAN_SCHEMA` writes
the three levels of nesting out. The prompt includes one complete example
plan, and `tests/ai-plan.mjs` compiles that example, so the format the model
is shown is one the compiler is known to accept.

## Pricing (G1)

| | Cap | Rate | Worst case |
|---|---|---|---:|
| Input | ~5,000 tokens: instructions with example, brief, and up to 7,000 characters of current plan on a revision | $4 / M | $0.020 |
| Output | 4,000 tokens at medium effort, thinking included | $20 / M | $0.080 |
| **AI plan** | | | **$0.10 -> 300 points** |

A failed plan is refunded to the customer and still costs its tokens. How
often that happens with real answers is the number that decides whether 300
points is right, and it is not known yet: see below.

## Not verified

No live call has been made. The compiler, the converter, the furnisher and the
route are tested with hand-written plans and stubbed HTTP. What is unknown:

- how often Claude's real answers compile (the failure rate we pay for);
- whether real plans are good homes, not merely valid ones;
- real latency. The Worker allows 85 seconds and the app waits 120.

`ANTHROPIC_API_KEY=... node scripts/try-ai-plan.mjs` runs five real briefs
(about $0.30), including a revision and a German brief, and prints pass or
fail, seconds and cost for each. Run it before switching the feature on.

Known limits: rooms are rectangles; stairwells are asked to line up between
storeys but this is not enforced; the garage door is a plain opening (a pair
of doors for Pro) because the catalogue has no garage door; a revision
regenerates the whole plan, so untouched rooms can shift.
