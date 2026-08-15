# AI points: pricing, balancing, and where the profit comes from

Draft **2026-08-15**. fal.ai 3D prices and Pro pricing are read from this repo
(`src/model-studio/modelStudioApi.ts`, `src/lib/pro.ts`). Image-generation and
Workers AI figures are **estimates and marked as such** — they are the one input
here not yet grounded in a configured value.

**Model:** one points currency across every AI feature. Everyone gets a free
grant on sign-in. Anyone can buy points; **Pro buyers pay 30% less**. Point costs
per feature and the price per point are balanced so every feature profits.

---

## 1. The point scale, and the one rule that keeps it honest

Set the internal cost basis at **$0.000375 of real spend per point**. That number
is not arbitrary — it falls out of the two fal 3D prices already configured, and
it makes them consistent with each other:

| Generator | fal cost | Points | Cost per point |
|---|---|---|---|
| Hunyuan 3D **Rapid** | $0.225 | **600** | $0.000375 |
| Hunyuan 3D **Pro** | $0.525 | **1,400** | $0.000375 |
| Hunyuan 3D Pro + PBR | $0.675 | **1,800** | $0.000375 |

**List price: $1.00 = 1,000 points.** So a point sells for $0.001 and costs at
most $0.000375 to honour.

> **The rule: price the points against the *worst-case* feature.**
> A user may spend every point they own on the single most expensive thing we
> offer. If the scale is profitable at $0.000375/point, it is profitable no
> matter what they choose. Every cheaper feature is upside.

Margin check at list, through Play (15%):

| | Per 1,000 points |
|---|---|
| Gross | $1.00 |
| Play cut −15% | $0.85 net |
| Worst-case fal cost | $0.375 |
| **Gross margin** | **$0.475 · 56%** |

---

## 2. The 30% Pro discount — and the floor it must not cross

| Buyer | Pays per 1,000 | Play net | Worst-case cost | Margin |
|---|---|---|---|---|
| Free user (list) | $1.00 | $0.85 | $0.375 | **56%** |
| **Pro (−30%)** | **$0.70** | $0.595 | $0.375 | **37%** |
| Pro, via Stripe on web | $0.70 | $0.65 | $0.375 | **42%** |

37% at the worst case, on the worst channel. Comfortable.

**Break-even discount is 56% off list.** At that point Play's cut plus fal's bill
consume the entire sale. So:

> **Total discount must never exceed ~50%.** 30% Pro is safe. Stacking a volume
> discount *on top* of it is not — a 30% Pro price on a pack already discounted
> 25% for volume lands at ~48% and leaves single-digit margin, before any
> refund, retry or failed generation.

**Therefore: no volume discounts on point packs.** Larger packs cost
proportionally the same. **The volume discount *is* Pro** — which is precisely
the "I want paying users" lever, because buying Pro becomes the only way to make
points cheaper.

| Pack | Points | List | Pro (−30%) |
|---|---|---|---|
| Starter | 2,000 | $1.99 | $1.39 |
| Popular | 6,000 | $5.99 | $4.19 |
| Studio | 15,000 | $14.99 | $10.49 |

Every row holds 56% margin at list and 37% for Pro.

### Honest note on how hard the discount pulls

A 30% saving is $0.30 per 1,000 points. If Pro sells for ~$5.99, a buyer only
recovers the Pro price in discount after **~20,000 points ≈ 33 Rapid
generations**. For most users the discount alone will not sell Pro — it works as
a *reinforcement* of the existing Pro features (multi-floor, PDF export, full
catalogue), not as the headline. If a stronger pull is wanted later, the lever
with real force is restricting **pack sizes** to Pro (free users limited to the
Starter pack), not deepening the discount, which the floor above forbids anyway.

---

## 3. The free grant: 1,000 points

Exactly the pattern you described — a large, friendly-sounding number that
buys **one** real generation:

| What they spend it on | Points | Uses from the free 1,000 |
|---|---|---|
| One Rapid 3D model | 600 | **1**, with 400 stranded |
| AI renders | 200 | 5 |
| Auto-furnish a room | 50 | 20 |

The 400-point remainder is the deliberate tease: visible, not enough, and the
next model needs a top-up.

**The part that needs a decision, because it is real money.** The free grant is
not free to us. If a user spends it on a Rapid generation it costs **$0.225 of
actual fal spend against zero revenue**. Ten thousand claimed grants is **~$2,250**.
That is a customer-acquisition cost, and it should be run like one:

* **One grant per verified Google account subject**, never per install or
  device — the D1 `account_subject` link already exists, and points are the
  first thing in this app worth farming.
* **Require sign-in to claim.** Anonymous grants cannot be rate-limited
  meaningfully.
* **Set a monthly ceiling on total grants** in the Worker, with the grant
  degrading to "come back next month" rather than failing open.
* Track redemption cost as a marketing line, not as COGS.

Most free users will drift to the cheap features (20 auto-furnishes costs us
about two cents), so realistic average cost per grant lands well under the
$0.225 worst case. Budget for the worst case anyway.

---

## 4. Feature balancing

| Feature | Runs on | Real cost | **Points** | Margin at list |
|---|---|---|---|---|
| Wall detection on import | client-side CV | $0 | **free, unmetered** | — |
| Auto-furnish a room by style | Workers AI *(est. ~$0.001)* | ~$0.001 | **50** | ~98% |
| **AI render from a plan/3D view** | fal image model *(est. ~$0.035)* | ~$0.035 | **200** | ~79% |
| 3D model — Rapid | fal Hunyuan Rapid | $0.225 | **600** | 56% |
| 3D model — Pro | fal Hunyuan Pro | $0.525 | **1,400** | 56% |
| 3D model — Pro + PBR | fal Hunyuan Pro PBR | $0.675 | **1,800** | 56% |

Two deliberate choices:

* **Wall detection stays free and unmetered.** It runs client-side at zero
  marginal cost, and it is the feature with a complaint already on record.
  Metering something that costs nothing buys resentment and no revenue.
* **Cheap features carry fatter margins on purpose.** Auto-furnish at 50 points
  sells $0.05 of points for $0.001 of compute. That is normal for small-model
  features, and it is what subsidises the 3D generations — so steering people
  toward the cheap features is good business, not a leak.

**AI renders supersede the old "avoid image generation" position.** That call was
made when generation would have been bundled into a flat unlock, where cost
scaled with usage and revenue did not. Metered at 200 points it carries ~79%
margin. The estimate needs confirming against fal's actual image pricing before
launch — **it is the only number here not taken from the repo.**

---

## 5. Stripe or Play — not a free choice

* **Android in-app point purchases must use Google Play Billing.** Points are
  digital content consumed in the app; routing that through Stripe from inside
  the Android app puts the listing at risk. This is a condition of staying in
  the store, not a margin decision.
* **Web should use Stripe** — no 15% cut, so ~42% margin for Pro buyers against
  37% on Play. The rails are already live via RevenueCat Web Billing.
* Google's rules on external payment links have been shifting under recent
  litigation. **Verify current policy before relying on a link-out.**

**Both paths, one server-side balance.** Buy on either, spend on either.

Unifying the Play and web *Pro* price (which you are having Codex do) matters
here beyond fairness: the 30% discount is defined against a list price, and
today a $59.99 web list beside a £5.99 Play price makes "30% off" mean two
different things depending on where someone stands.

---

## 6. Implementation

**D1** — beside the existing `play_purchases`:

```sql
CREATE TABLE point_balances (
  account_subject TEXT PRIMARY KEY,
  balance         INTEGER NOT NULL DEFAULT 0,
  free_granted_at INTEGER,                 -- one free grant per account, ever
  updated_at      INTEGER NOT NULL
);

CREATE TABLE point_ledger (
  id              TEXT PRIMARY KEY,
  account_subject TEXT NOT NULL,
  delta           INTEGER NOT NULL,        -- +bought/granted, -spent, +refunded
  reason          TEXT NOT NULL,           -- purchase | free_grant | spend | refund | promo
  feature         TEXT,                    -- render | model_rapid | model_pro | furnish
  source          TEXT,                    -- play | stripe | system
  ref             TEXT UNIQUE,             -- receipt token / job id: idempotency key
  created_at      INTEGER NOT NULL
);
```

`ref UNIQUE` makes a replayed receipt or retried job impossible to double-count.
`free_granted_at` enforces one grant per account.

**Worker routes:** `GET /v1/points`, `POST /v1/points/grant` (free, once),
`POST /v1/points/purchase` (after a **verified** receipt),
`POST /v1/points/spend`.

> **Spend server-side before dispatching to fal, and refund on failure.** The
> client must never be the authority on the balance — it is the component an
> attacker controls, and every point is real money at fal. The chokepoint
> already exists: fal calls go through the Worker behind `FAL_KEY`.

**Native:** the app currently sells a **single non-consumable**. Point packs are
**consumables**, needing `consumeAsync` in `PlayBillingPlugin` — a product that
is never consumed cannot be bought a second time. This is real work, not config.

**Pricing the discount:** hold the 30% server-side, not in the client. Two Play
products per pack (list and Pro) is the policy-clean way to do a discount on
Android, and the Worker must verify Pro entitlement before honouring the Pro SKU.

---

## 7. Sequencing

1. **Wall detection.** Free, unmetered, no billing work, addresses the live
   complaint. Ship value before building a currency.
2. **The points ledger + Play consumables**, with auto-furnish as the first
   cheap feature to prove spend/refund end to end at ~$0.001 a call.
3. **AI renders**, once image pricing is confirmed.
4. **3D generation last** — the most expensive to serve and the most exposed if
   the ledger has a hole.

---

## 8. Open questions

1. **Confirm fal's image-generation price.** The 200-point render rests on a
   ~$0.035 estimate; everything else here comes from configured values.
2. **Workers AI cost per auto-furnish call** — assumed ~$0.001.
3. **Do points expire?** No expiry is friendliest and simplest; expiry improves
   economics and adds support load. Recommend **no expiry at launch**.
4. **Refunds after points are spent** — points bought, spent, then the purchase
   refunded. Recommend allowing the balance to go negative and blocking further
   spend until cleared.
5. **Free-grant ceiling** — what monthly acquisition spend is acceptable.
