# AI points: verified costs, loss-proofing, and keeping the fal balance funded

Draft **2026-08-15**. fal prices below were read from fal.ai's model pages on
that date, **not estimated**. Pro pricing is from `src/lib/pro.ts`; what we
actually send to fal is from `workers/design-sync/src/index.ts`.

**Model:** one points currency across every AI feature. Free grant on sign-in.
Anyone can buy points at list; **Pro buyers pay 30% less**. Point costs and point
price are balanced so that no spending pattern loses money.

---

## 1. Verified fal costs

| Model | Base | Add-ons |
|---|---|---|
| Hunyuan 3D **Rapid** | **$0.225** | PBR +$0.15 |
| Hunyuan 3D **Pro** | **$0.375** | PBR +$0.15 · multi-view +$0.15 · **custom face count +$0.15** |
| Image — Seedream V4 | **$0.03** / image | — |
| Image — Flux Kontext Pro | **$0.04** / image | — |
| Image — Qwen | **$0.02** / megapixel | — |

### We are paying an avoidable $0.15 on every Pro generation

`workers/design-sync/src/index.ts:557` always sends an explicit face count:

```ts
face_count: Number(input.face_count ?? 40_000),
```

fal charges **+$0.15 for a custom face count**. That is why the repo records
Pro's `basePrice` as **0.525** — it is fal's $0.375 base plus the surcharge we
always trigger. Rapid sends no face count and correctly costs $0.225.

**Dropping the explicit `face_count` would cut Pro from $0.525 → $0.375 — a 29%
cost reduction on the single most expensive thing we serve**, if the default mesh
density is acceptable. This is the cheapest available win in the whole plan and
should be tested before any of the billing work.

Worst case today is **$0.675** (Pro + PBR + face count). Worst case *available*
is **$0.825** if multi-view is ever enabled — it is not currently, and §4 G4
exists to make sure enabling it can never quietly go unpriced.

---

## 2. The point scale

Internal cost basis: **$0.000375 of real spend per point**. **List: $1.00 =
1,000 points.**

| Feature | Real cost | **Points** | Notes |
|---|---|---|---|
| Wall detection on import | $0 | **free** | client-side CV, never metered |
| Room auto-naming | ~$0.0002 | **10** | Workers AI |
| Colour / material scheme | ~$0.0005 | **25** | Workers AI |
| Listing or share description | ~$0.0005 | **25** | Workers AI |
| Auto-furnish a room by style | ~$0.001 | **50** | Workers AI, geometry-validated |
| Text → layout ("describe your room") | ~$0.002 | **100** | Workers AI, geometry-validated |
| **AI render from a view** | $0.03–0.04 | **200** | fal image |
| 3D model — Rapid | $0.225 | **600** | **Pro only** — see §3a |
| 3D model — Rapid + PBR | $0.375 | **1,000** | **Pro only** |
| 3D model — Pro | $0.525 *(→ $0.375 if face count dropped)* | **1,400** | **Pro only** |
| 3D model — Pro + PBR | $0.675 | **1,800** | **Pro only** |
| *(reserved)* Pro + PBR + multi-view | $0.825 | **2,200** | not currently offered |

Workers AI figures remain estimates — they are the only ones here not verified.
They are also the least dangerous, being ~1/500th of a 3D generation.

---

## 3. Margins, at both Play tiers

Google's 15% rate applies to the first $1M/year. **Both tiers are modelled,
because the 30% case is the one that quietly breaks a plan built on 15%.**

| | 15% tier | 30% tier |
|---|---|---|
| Free user, list $1.00 | net $0.85 → **56%** | net $0.70 → **46%** |
| Pro, −30% ($0.70) | net $0.595 → **37%** | net $0.49 → **23%** |
| Pro via Stripe (web) | net $0.65 → **42%** | *(unchanged — no Play cut)* |
| **Break-even discount** | **56% off list** | **46% off list** |

30% Pro remains profitable on every row. But note the floor moves: on the 30%
tier the maximum safe total discount is **46%**, not 56%.

**No volume discounts on packs.** Larger packs cost proportionally the same.
Pro *is* the volume discount. Stacking both crosses the floor.

| Pack | Points | List | Pro (−30%) |
|---|---|---|---|
| Starter | 2,000 | $1.99 | $1.39 |
| Popular | 6,000 | $5.99 | $4.19 |
| Studio | 15,000 | $14.99 | $10.49 |

**Every user can buy any pack.** A free user paying list is the highest-margin
transaction in the business (56% vs Pro's 37%) — point sales to non-Pro users
are the better sale, not a consolation prize.

---

## 3a. Gating 3D generation behind Pro — recommended, with one blocker

**Proposal:** 3D generation is Pro-only. Pro includes one free generation, then
points. Free users keep points for everything else.

### Why this is the single biggest derisking in the plan

It removes the largest uncontrolled cost: a free user burning fal money.

| Free grant (1,000 pts) worst case | 3D available to free users | **3D Pro-only** |
|---|---|---|
| Most expensive thing it can buy | one Rapid model — **$0.225** | text→layout — **~$0.002** |
| 10,000 grants | **~$2,250** | **~$20** |

**Roughly a 100× reduction in free-tier exposure.** We only ever pay the $0.225
for someone who has already paid $6.40. The free grant stops being acquisition
spend worth budgeting and becomes a rounding error — and §5's monthly ceiling
becomes a formality rather than a control.

It also sharpens the three-part model:

* **Pro** decides *which features* you can use (multi-floor, PDF export, full
  catalogue, **3D generation**).
* **Points** meter *how much* you use the metered ones.
* **Pro's 30%** discounts the points.

That is fully compatible with free users buying points at list: they buy and
spend on everything except 3D. And it steers them onto the **88–98% margin**
features while Pro users take the 56%/37% ones — the mix improves.

Cost of the free Pro generation: **make it Rapid ($0.225)**, not Pro-quality.
That is 3.5% of a £5.99 Play unlock, caps exposure at the cheapest generator, and
leaves Pro-quality as the natural first thing to spend points on. Enforce it as a
`free_generation_used` flag per **account subject** — not a points grant, so it
cannot be split, hoarded or spent on anything else.

### The blocker: Model Studio also publishes to the global catalogue

`requireModelAdmin` (`workers/design-sync/src/index.ts:100`) gates the **entire**
`/v1/admin/models` surface on one owner-email check — `source`, `generate`,
`optimized`, `metadata` **and `publish`**. Model Studio is not a "make me a
model" tool; it is a curation tool whose last step writes into
`catalog/v1/catalog.json`, **the manifest every user of the app reads**.

Opening it to Pro users as it stands would let any Pro buyer publish into the
shared catalogue. That means unmoderated content for all users, CC0/rights
confirmation performed by people with no reason to care, and catalogue pollution
that is public the moment it is written.

**So this needs a split before it can ship:**

| Action | Who | Where the asset lands |
|---|---|---|
| Generate, preview, place in **my own design** | **Pro + points** | private R2 prefix, that user's designs only |
| Optimize / metadata / **publish to the catalogue** | **owner only** (unchanged) | `catalog/v1/catalog.json`, global |

The Worker already has the right shape for this — user data has a private
`USER_DATA` R2 prefix (used by community avatars), and `readModelJob` already
scopes jobs by `identity.subject`. The work is a second, non-admin route group
(`/v1/models/...`) that reuses the fal dispatch but ends at "usable in your
design" instead of "published for everyone", leaving `requireModelAdmin` exactly
as it is on the publish path.

### R2 retention — a second unbounded cost

Model Studio history has **no R2 TTL**: the UI lists the newest 40 jobs while
older objects remain stored forever. That is fine for one owner. Multiplied by
every Pro user generating models, storage grows without limit and never falls.

**Add a TTL to user-generated models** (source, raw and optimized tiers) — the
published catalogue assets are the only ones that need to be permanent. Without
it, §5's float maths covers fal but not the storage bill quietly compounding
behind it.

---

## 3b. Bringing Model Studio into the app, public-facing

Today Model Studio is **not in the app at all**. It is a separate page assembled
to `/app/model-studio/` (`scripts/assemble-web.mjs:13`), reached by
`openModelStudio()` handing the URL to a Capacitor **Custom Tab** — i.e. Android
users leave the editor and land in a browser. It is a 728-line admin console
whose flow is *prompt → generate → optimize → upload two tiers → metadata →
publish*, showing costs in dollars (`Estimated total: $0.525 · textured`).

That is a fine tool for one owner and the wrong thing to show a customer.

### Two surfaces, matching the two route groups in §3a

Do **not** convert the existing page. Keep it, and build a second, smaller one.

| | Owner tool *(unchanged)* | **In-app creator** *(new)* |
|---|---|---|
| Lives at | `/app/model-studio/` page | lazy dialog inside the editor |
| Flow | generate → optimize → upload → metadata → **publish** | **prompt → generate → preview → place** |
| Talks to | `/v1/admin/models/*` | `/v1/models/*` (§3a) |
| Cost shown as | dollars | **points** |
| Asset ends up | global `catalog/v1/catalog.json` | that user's private R2 prefix |
| Gate | `requireModelAdmin` | Pro + points |

The publish pipeline, the rights confirmation and the dollar figures never appear
in the customer-facing surface — which also means `requireModelAdmin` keeps
guarding exactly what it guards now.

### What the in-app version has to do differently

* **Optimization becomes invisible.** A raw Hunyuan GLB is far too heavy to drop
  into a phone scene; the optimized tier is what makes it usable. So the manual
  optimize/upload steps collapse into one automatic stage between "generated" and
  "ready to place".
* **Lazy-load it.** `optimizeGlb.ts` pulls `@gltf-transform/core`,
  `/extensions`, `/functions` and `meshoptimizer` (WASM). That must not land in
  the initial editor bundle. The pattern already exists in `src/App.tsx` —
  `ImportDialog` and `PhotoMode` are both `lazy(() => import(...))` behind
  `Suspense`. Follow it exactly.
* **Decide where optimization runs — by measuring, not guessing.** It is
  client-side today, which is free and already works, but gltf-transform plus
  meshopt on a mid-range Android phone is the kind of thing that OOMs. Ship the
  lazy client-side path first, test on a real low-end device, and only move it to
  the Worker if it actually fails. Do not build server-side mesh processing
  speculatively — Workers have CPU limits that this could well exceed, and that
  is a queue/container project, not an afternoon.
* **Mobile layout from the start.** The current UI is a desktop console. The
  in-app one should follow the catalogue sheet and `ImportDialog` conventions
  that are already touch-tuned, including the safe-area handling fixed in 1.22.13.
* **Entry point flips from owner-only to Pro-gated.** Today the Account and More
  menus test `isModelStudioOwner(email)`. The new entry is visible to everyone
  and calls the existing `requirePro()` path, so a free user gets the normal
  upsell instead of an invisible feature.

### Content safety — a genuine pre-release gate

Text-to-3D from an arbitrary user prompt is **user-generated content**, and Play
holds UGC apps to moderation and reporting obligations. Private-by-default helps
enormously — nothing another user can see is nothing to moderate — but:

* **Screen prompts before dispatch.** A cheap Workers AI classifier in front of
  the fal call is worth it on its own terms: a rejected prompt costs ~$0.0002
  instead of $0.225, so moderation partly pays for itself.
* **The moment a generated model can appear in a shared design or a forum post,
  full UGC obligations apply.** The community report queue is the precedent to
  extend, not a second system to invent.
* Keep a per-account generation log — already implied by the points ledger's
  `feature` column — so a report can be traced to a prompt.

### Naming

"Model Studio" reads premium and is worth keeping publicly. In code, keep
`ModelStudio` for the owner console and give the in-app one its own name so the
two are never confused at a glance.

---

## 4. Loss-proofing: ten server-side guards

Margin on a spreadsheet is not protection. These are the invariants that make
losing money require a deliberate override.

* **G1 — Price against the worst case, never the typical.** Points per feature =
  `ceil(max_possible_cost / 0.000375)`, where max includes *every* add-on the
  endpoint can charge for.
* **G2 — Hard floor guard.** Refuse to sell when
  `net_per_point < cost_per_point`. Encode as a unit test over the real pack
  table *and* a runtime assert, so a promo can never be configured below the
  floor. Not selling beats selling at a loss.
* **G3 — Spend server-side, before dispatch.** The client is never the authority
  on the balance; it is the component an attacker controls.
* **G4 — Pre-flight cost check.** Compute the job's max cost from *its actual
  options* and refuse if the points collected do not cover it. This is what stops
  a future flag (multi-view, higher face count) from silently going unpriced.
* **G5 — Refund on failure.** Points return to the user. We may still owe fal;
  that is the failure budget, and it is why margin is not 95%.
* **G6 — Per-account rate limits.** Caps the blast radius of a compromised
  account or a runaway client loop.
* **G7 — Cost table server-side and versioned.** A fal price change is a Worker
  config change, never an app release. The client must never compute price — an
  old install would keep charging last year's rate forever.
* **G8 — Circuit breaker.** If the fal float drops below the projected spend
  window, disable *generative* features with an honest message and keep the
  free/cheap ones running. A degraded app beats failed paid jobs.
* **G9 — Negative balances allowed.** On a refund or chargeback after points are
  spent, let the balance go negative and block further spend until cleared.
  Never silently absorb it.
* **G10 — One free grant per verified account subject, plus a monthly ceiling.**
  Never per install or device. Points are the first thing in this app worth
  farming.

---

## 5. Keeping the fal balance funded

This is the "app doesn't break" question, and it is a **cash-flow** problem more
than a margin one.

> **Confirm first:** fal's billing docs did not load (HTTP 429). Whether fal is a
> prepaid balance that can hit zero, and whether auto-recharge exists, must be
> confirmed before relying on the design below. The repo's own
> `docs/FAL_TRELLIS_PIPELINE.md` refers to "spending credits", which suggests a
> prepaid balance.

### The liability

Points sold but not yet spent are a **debt payable in fal compute**:

```
outstanding_points = points_sold + points_granted − points_spent
liability          = outstanding_points × $0.000375
```

Track it in D1. It is the single number that says whether the app can honour
what it has already been paid for.

**Rule: keep `fal_balance ≥ liability × 1.2`, with a hard floor** (say $50).
The 1.2 covers price drift and failed jobs. Breakage — points never spent — makes
this conservative, which is the correct direction to be wrong in.

### The reserve ratio (the feedback loop)

Worst-case fal cost is **44% of net revenue** on the 15% tier
(`$0.375 / $0.85`), and **54%** on the 30% tier.

> **Bank 45% of net point revenue (55% on the 30% tier) as fal float. Treat only
> the remainder as profit.**

That is the mechanism the question asks for: every point sale mechanically funds
the compute it may later consume, so growth in usage cannot outrun the balance.
Withdrawing the reserve is the only way to break it, which makes it a policy
decision rather than an accident.

### The timing gap — the real "app breaks" risk

**Google pays out monthly in arrears. fal is prepaid. Users can spend points the
hour they buy them.** So we owe fal *now* and get paid *later*.

Worked example — $1,000 of points sold in a month, all spent immediately:

| | |
|---|---|
| Owed to fal, now | ~$440 |
| Received from Google | ~$850, up to ~45 days later |
| **Working capital needed to bridge** | **~$440** |

The business is profitable throughout and can still fail here purely on timing.
So: hold a float sized to **one payout cycle of peak fal spend**, not to the
average. G8's circuit breaker is the backstop when that estimate is wrong.

### Operational

* Worker endpoint reporting `fal_balance`, `liability`, and `days_of_cover`.
* Alert well before the breaker trips — the existing `$1` R2 early-warning alert
  is the precedent.
* Enable fal auto-recharge if it exists; otherwise a monthly manual top-up sized
  from `liability × 1.2`.

---

## 6. Easy AI features — and why they are the real protection

The cheap features are not filler. **They are what makes losing money hard.**

If most points are spent on Workers AI text features costing ~$0.0005 but priced
at 25–100 points, the *blended* cost per point collapses far below the
$0.000375 worst case. A plausible mix of 80% cheap features / 20% 3D lands
blended cost near **$0.0001/point — around 88% margin**, while the worst-case
guarantee still holds for the user who only ever generates 3D models.

Ranked by ease of build against this codebase:

1. **Room auto-naming** (10 pts) — one small prompt over existing room geometry.
   Nearly trivial.
2. **Colour / material scheme** (25 pts) — text in, palette out; applies through
   the existing room-style path that already resets per-face overrides.
3. **Auto-furnish a room by style** (50 pts) — structured JSON of catalogue ids +
   positions, **validated by the geometry rules in `tests/samples.mjs` and
   rejected on failure**. This validation pattern is already on record and is
   what makes a hallucinated layout safe.
4. **Listing / share description** (25 pts) — pure text over the design summary.
5. **AI render from a view** (200 pts) — img2img over a Photo Mode frame.
   **Photo Mode already exists and already requests the high-res `renderUrl`
   tier**, so the capture half is built.
6. **Text → layout** (100 pts) — the same validated-structured-output pattern as
   auto-furnish, one step more ambitious.

All of 1–4 and 6 run on Workers AI, which is already bound. None needs fal, so
none of them is exposed to the balance problem in §5 at all.

---

## 7. Sequencing

1. **Drop the `face_count` surcharge test.** One line, potentially −29% on Pro
   generation cost. Do this before pricing anything.
2. **Wall detection.** Free, unmetered, no billing work, answers a live complaint.
3. **Points ledger + Play consumables + guards G1–G10**, with room auto-naming
   as the first metered feature — it proves spend/refund end-to-end at
   ~$0.0002 a call, where a bug is almost free.
4. **Auto-furnish, colour schemes, descriptions.** Margin engine.
5. **AI renders**, once image model choice is fixed.
6. **Split generate from publish (§3a), add a user-model R2 TTL, build the in-app
   creator (§3b), then open 3D generation to Pro.** Last, because it is the most
   expensive to serve, the most exposed if the ledger has a hole, and the only
   one that cannot ship without first making sure a Pro user cannot write to the
   global catalogue. Prompt moderation ships **with** it, not after.

---

## 8. Open questions

1. **Is fal prepaid, and does it auto-recharge?** Docs returned 429; §5 depends
   on the answer.
2. **Does dropping `face_count` change output quality?** Worth one A/B before
   taking the 29% saving.
3. **Which Play tier are we on — 15% or 30%?** It moves the discount floor from
   56% to 46%.
4. **Do points expire?** Recommend no expiry at launch; note it permanently
   inflates the §5 liability, which the reserve ratio already covers.
5. **Workers AI cost per call** — assumed ~$0.0002–$0.002.
6. **What TTL for user-generated models?** 30 days after last use in a design
   would bound storage without surprising anyone mid-project.
7. **Does a Pro user's generated model stay usable after its R2 object expires?**
   Either re-generate on demand (costs again) or keep the optimized tier only.
