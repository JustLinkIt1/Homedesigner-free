# AI features: what they cost, what we give away, and how we profit

Draft **2026-08-15**. Numbers are from this repo, not estimates from memory:
fal.ai prices are `basePrice` in `src/model-studio/modelStudioApi.ts`; Pro pricing
is Play `pro_lifetime` and web `pro_lifetime_web_v2` + `WEB_DISCOUNT` in
`src/lib/pro.ts`.

---

## 1. The finding that decides the whole design

**Unlimited AI generation cannot be bundled into a lifetime unlock. Not at any
usage level worth having.**

Costs per fal.ai call:

| Generator | Base | With PBR textures |
|---|---|---|
| Hunyuan 3D **Rapid** | **$0.225** | $0.375 |
| Hunyuan 3D **Pro** | **$0.525** | $0.675 |

Net revenue per Pro unlock — **one time, forever**:

| Channel | Gross | Cut | Net |
|---|---|---|---|
| Play `pro_lifetime` | £5.99 | Google 15% | ≈ **$6.40** |
| Web `pro_lifetime_web_v2` | $59.99 list − 50% `launch-offer-50` = $29.99 | Stripe ≈2.9% + $0.30, plus RC Web Billing | ≈ **$28** |

So the break-even point, after which a Pro user is **permanently** unprofitable:

| User | Rapid gens | Pro-quality gens |
|---|---|---|
| **Play buyer** ($6.40) | 28 | **12** |
| Web buyer ($28) | 124 | 53 |

A Play customer who generates **13 models** has cost more than they will ever
pay, and "lifetime" means there is no second payment to recover it. One
enthusiastic user can erase the margin of several others.

The free tier is worse, because there is no revenue at all: 1,000 free users
given a single Rapid generation each is **$225 of pure cost**.

**Therefore: fal.ai generation must be metered. Credits are not a nice-to-have,
they are the only structure that works.** The instinct to use points is correct.

---

## 2. The line: what is free, what is Pro, what costs credits

The useful distinction is **not** "AI vs not AI". It is **per-call marginal
cost**. Two very different things are being called AI here:

| Class | Runs on | Marginal cost | Verdict |
|---|---|---|---|
| Wall detection from an imported plan | Client-side CV, or a segmentation model on Workers AI / ONNX | ~$0 | **Include it.** Never meter it. |
| Auto-furnish a room by style | One small structured Workers AI call | fractions of a cent | **Include it** (Pro). |
| **3D asset generation (Hunyuan)** | **fal.ai** | **$0.225–$0.675 per asset** | **Credits. Always.** |

That gives a line that is honest and easy to explain:

> **Credits are for generating new 3D models. Everything else is included.**

Recommended tiering:

| | Free | Pro (lifetime) |
|---|---|---|
| Improved wall detection on import | ✅ | ✅ |
| Auto-furnish by style | — | ✅ |
| Generate 3D models | — | ✅ *(credits required)* |
| Starter credits | 0 | **5** |

Why 5 starter credits and not more: 5 Rapid generations cost $1.13, which is
**18% of a Play unlock's entire net revenue**. Ten would be 35%. The web buyer
could absorb far more, but the allowance has to be sized for the *cheapest*
channel or Play buyers become a loss-leader for a feature they were sold.

Free tier gets **zero** generative credits. Giving away even one costs real
money against zero revenue — that is a marketing spend, and should be decided as
one (a promo code, a campaign), not baked into the product.

---

## 3. Can we profit from fal.ai generations?

**Yes — around 45–58% gross margin, but only as consumable credits.**

Define **1 credit = 1 Rapid generation** ($0.225 cost). A Pro-quality generation
costs **3 credits** (true ratio is 2.33; rounding up funds the margin and the
PBR variants).

Pack pricing, with the arithmetic shown:

| Pack | Price | Net after cut | Max fal cost (all spent) | Gross margin |
|---|---|---|---|---|
| 10 credits (Play) | $5.99 | $5.09 | $2.25 | **$2.84 · 56%** |
| 25 credits (Play) | $12.99 | $11.04 | $5.63 | **$5.42 · 49%** |
| 60 credits (Play) | $27.99 | $23.79 | $13.50 | **$10.29 · 43%** |
| 10 credits (**Stripe/web**) | $5.99 | $5.52 | $2.25 | **$3.27 · 58%** |

Two things make the real margin better than the table: **breakage** (a
meaningful share of credits are never spent) and the fact that the "max cost"
column assumes every credit goes to a generation that actually succeeds.

**The trap to avoid:** pricing packs at a markup that looks generous
per-credit but dies after the store cut. At $4.99 for 20 credits, Play nets
$4.24 while 20 Rapid generations cost $4.50 — **a loss on every pack sold.**
Any pack must clear `cost ÷ 0.85` before it clears margin.

---

## 4. Stripe or Play for the credits? — both, and it is not a free choice

This is the part where the answer is constrained by policy rather than economics.

* **Android in-app purchases of credits must use Google Play Billing.** Credits
  are digital content consumed inside the app; routing that through Stripe from
  within the Android app puts the listing at risk. This is not a margin
  decision — it is a condition of staying in the store.
* **Web can and should use Stripe.** No 15% cut, better margin (58% vs 56% on
  the small pack), and the rails are already live via RevenueCat Web Billing.
* Google's rules on *external payment links* have been shifting under recent
  litigation. **Verify current policy before relying on any link-out**; do not
  design around the assumption that it is permitted.

**So: not "Stripe instead of Play" — Stripe *as well as* Play, over one shared
balance.** The credit balance lives on the server, and either purchase path
tops up the same ledger. A user buys credits on the web at better margin, or
in-app on Android at policy-compliant margin, and spends them on either device.

This also happens to be the cheapest thing to build, because the server side
already exists:

* the Worker already verifies and acknowledges Play receipts
  (`/v1/play/verify`, `/v1/play/link`) with a real Google service-account
  credential;
* D1 already holds `play_purchases` with an `account_subject` link;
* fal.ai calls **already** go through the Worker behind `FAL_KEY`, never the
  client — so there is already a chokepoint where a spend can be enforced.

---

## 5. Implementation sketch

**D1** — two tables beside `play_purchases`:

```sql
CREATE TABLE credit_balances (
  account_subject TEXT PRIMARY KEY,
  balance         INTEGER NOT NULL DEFAULT 0,
  updated_at      INTEGER NOT NULL
);

CREATE TABLE credit_ledger (
  id              TEXT PRIMARY KEY,
  account_subject TEXT NOT NULL,
  delta           INTEGER NOT NULL,       -- +granted / -spent
  reason          TEXT NOT NULL,          -- purchase | starter | refund | spend | promo
  source          TEXT,                   -- play | stripe | system
  ref             TEXT UNIQUE,            -- purchase token / job id: the idempotency key
  created_at      INTEGER NOT NULL
);
```

`ref UNIQUE` is what makes a replayed Play receipt or a retried job impossible
to double-count.

**Worker** — three routes, and one rule that matters more than the rest:

* `GET  /v1/credits` — balance + recent ledger
* `POST /v1/credits/grant` — after a **verified** purchase, keyed by `ref`
* `POST /v1/credits/spend` — atomic decrement, **before** dispatching to fal

> **Spend server-side before the fal call, and refund on failure.** The client
> must never be the authority on the balance — it is the one component an
> attacker controls, and every credit is real money at fal.

**Client/native** — the one genuinely new piece of work: the app currently sells
a **single non-consumable**. Credit packs are **consumables**, which need
`consumeAsync` handling in `PlayBillingPlugin` (a non-consumed product cannot be
bought twice). Budget for that; it is not a config change.

---

## 6. Sequencing

1. **Wall detection first, no credits, no fal.** It is the complaint on record
   ("I don't find our current system works very well"), it costs ~nothing per
   call, and it needs no billing work at all. Ship value before building a
   currency.
2. **Auto-furnish (Pro, Workers AI).** Still no per-call metering.
3. **Credits + generation last.** Only build the ledger, the consumables and the
   packs once there is evidence people want generated assets enough to buy them.

Building the currency first is the expensive order: it is the most billing work,
the most policy exposure, and the least certain demand.

---

## 7. Open questions for the owner

1. **The £5.99 / $59.99 gap.** Play sells the lifetime unlock at £5.99 while the
   web list price is $59.99 (charged $29.99 under `launch-offer-50`) — roughly
   **5× different for the same entitlement**, and the Worker grants Pro from
   either. Someone will notice. Is the Play price deliberate, or left over from
   the `pro_unlock` era?
2. Does Pro stay lifetime? Metered AI is a recurring cost; a lifetime unlock has
   no recurring revenue. Credits are the workaround, but a subscription is the
   structural fix — and there is already a deferred "3-day trial → $4/mo" thread.
3. Credit expiry: none is friendliest and simplest; expiry improves economics and
   adds support load. Recommend **no expiry** at launch.
4. Refund policy once credits are spent.

---

## 8. What is NOT recommended

* **Image generation.** Already on record as avoided; the cost profile is worse
  than 3D and the value to a floor-plan app is thinner.
* **A vision LLM for wall geometry.** LLMs are unreliable at precise pixel
  coordinates — you get plausible hallucinated geometry, per-call cost and
  latency, for a job classical CV already does better. See
  `docs/` tracer notes; the live pipeline in `src/lib/wallTrace.ts` is already a
  Hough-based adaptive tracer, not the naive band scanner it is often mistaken
  for.
* **Free-tier generative credits by default.** Pure cost against zero revenue.
  If they are wanted, fund them as a campaign with a fixed ceiling.
