# Getting Google Play checkout working — RevenueCat guide

> Working reference: **RevenueCat Android SDK 10.16.2**
> (`https://sdk.revenuecat.com/android/10.16.2/index.html`). This is the native
> layer; HomeDesigner does not call it directly. Our stack is:
>
> ```
> src/lib/pro.ts  →  @revenuecat/purchases-capacitor 13.4.0 (JS Purchases API)
>                 →  purchases-android 10.16.x (the SDK the reference documents)
>                 →  Google Play Billing Library
> ```
>
> 10.16.2 is a patch on the same 10.16.x line the failure was diagnosed against.
> Its **public API is unchanged** from 10.16.0 for the one-time-product path, so
> bumping to it is safe hardening but is **not** a fix for the current symptom.
> The fix is a Play Console setting — see "Root cause" below.

## TL;DR — status 2026-08-14

> **The backwards-compatible fix below is ALREADY APPLIED.** Play Console shows
> `pro_lifetime` → purchase option `prolifetime`: **Active**, tagged
> **Backwards compatible**, **173 countries/regions**, last updated
> **12 Aug 2026**. So the WIP's headline action item is closed, and the
> mechanism in §2 cannot still be failing for the reason it gave.
>
> That leaves two live possibilities, and **nothing on record distinguishes
> them** because no device test is known to have run after 12 Aug:
>
> 1. **It is already fixed and untested.** The flag was set the same day the
>    diagnosis was written. If the last failing test predates it, there may be
>    nothing left to fix.
> 2. **The diagnosis was wrong and the cause is still open** — including R8,
>    which was retracted on weaker evidence than it looks (see §2a).
>
> **Do this first, before any further theorising:** ship 1.22.18 to internal
> testing, install from Play, long-press the version line in **Settings** ~1.2s,
> and read the report (§4). It settles which case we are in, in one measurement.

---

## 1. The Play Store flow, and where each piece lives

The three JS calls in `src/lib/pro.ts` map onto the native 10.16.x SDK like this:

| `pro.ts` (Capacitor JS)            | Native purchases-android 10.16.2                     | Reference |
|------------------------------------|------------------------------------------------------|-----------|
| `Purchases.configure({ apiKey })`  | `Purchases.configure(PurchasesConfiguration)`        | `com.revenuecat.purchases.Purchases`, `PurchasesConfiguration` |
| `Purchases.getOfferings()`         | `awaitOfferings()` / `getOfferingsWith()`            | `Offerings`, `Offering`, `Package` |
| `Purchases.purchasePackage({...})` | `awaitPurchase(PurchaseParams(activity, package))`   | `PurchaseParams.Builder`, `PurchaseResult` |

### Configuration (native `PurchasesConfiguration.Builder`)

The reference documents the builder we configure through the plugin:

- `context` — Android `Context` (required; the plugin supplies it)
- `apiKey` — **the Google Play Android key** (`goog_…`). Required.
- `appUserID` — optional stable id; we set it to the Google subject so Play and
  desktop share one customer.
- `store` — `Store` enum. Defaults to **Google Play**. Only pass `Store.AMAZON`
  for an Amazon build; a Test Store key on a real device opens no sheet by design.
- `purchasesAreCompletedBy` — leave as RevenueCat (the SDK finishes the purchase).
- `diagnosticsEnabled` — optional diagnostic collection.

There is no Play-specific flag to "turn on" one-time products here. If the
catalog is configured correctly in Play Console and the key is the Play key,
offerings populate.

### Products & offerings

- `Offerings` holds every offering; `Offering` holds `Package`s; each `Package`
  wraps a `StoreProduct`.
- `awaitGetProducts(productIds, type)` / `getProductsWith()` fetch `StoreProduct`s
  directly by id and `ProductType` — useful for a diagnostic that asks "does Play
  return this product at all?" independent of offering configuration.

### Purchasing

- `PurchaseParams.Builder(activity, <Package | StoreProduct | SubscriptionOption>)`
  builds the request; `.build()` produces `PurchaseParams`.
- Options: `isPersonalizedPrice`, `oldProductId`, `replacementMode` — all for
  subscriptions/upgrades, none needed for a one-time unlock.
- `awaitPurchase()` returns a `PurchaseResult`; the callback form is
  `purchaseWith()`. A resolved result means **Play charged the user** — treat it
  as a commit, never as best-effort.

---

## 2. Root cause of the current failure (one-time / INAPP products)

`StoreProduct` (reference: `com.revenuecat.purchases.models.StoreProduct`) is
implemented by `GoogleStoreProduct`, `AmazonStoreProduct`, `TestStoreProduct`.
For a one-time (INAPP) product:

- `price` carries the base price; `period` is null; `pricePerMonth()` /
  `pricePerYear()` return null (they are for subscriptions).
- The Google implementation builds that `price` from Play's `ProductDetails`.

The breakage, verified against `purchases-10.16.0.aar` bytecode and Google's docs
(unchanged in 10.16.2's public surface):

1. RevenueCat 10.16.x reads a one-time product's price **only** through the
   legacy singular `ProductDetails.getOneTimePurchaseOfferDetails()` — one call,
   and **zero** calls to the newer `…getOneTimePurchaseOfferDetailsList()`.
2. If that accessor returns null, the SDK returns null for the whole
   `StoreProduct` — the package does not arrive priceless, it **does not arrive**.
3. Google only fills that legacy accessor for the purchase option flagged
   **`legacyCompatible`** (shown as *Backwards compatible* in Play Console).
4. With no eligible legacy-compatible option, `queryProductDetailsAsync` reports
   `NO_ELIGIBLE_OFFER` and returns no product → the offering is empty.

There is **no SDK upgrade out of this**: `@revenuecat/purchases-capacitor`
13.4.0 is the newest published plugin, and 10.16.2 does not add a list-accessor
read path to the public flow. The lever is the Play Console product setting.

---

## 2a. Why R8 is NOT conclusively excluded

The retraction in 1.22.18 argued: "1.22.15's `-keepnames` already fixed the
filename, and purchases still failed after it shipped." That is true but does not
cover the current build:

* **1.22.15** kept only the *names of the two interfaces*
  (`MainDispatcherFactory`, `CoroutineExceptionHandler`).
* **1.22.18** additionally keeps the **implementation classes**
  (`AndroidDispatcherFactory`, `AndroidExceptionPreHandler`) and volatile fields
  in `kotlinx.coroutines.**`.

Those are materially different builds. The evidence retiring the R8 theory comes
from a build that lacked the implementation keeps, so **1.22.18 has never been
field-tested against a real purchase.** Treat R8 as *unproven*, not *excluded*,
until the §4 report comes back from a 1.22.18 install.

## 3. Play Console configuration — verified 2026-08-14

| Item | State | Source |
|------|-------|--------|
| Product `pro_lifetime` | exists, `HomeDesigner Pro Lifetime` | Play Console |
| Purchase option `prolifetime` | **Active** | Play Console |
| Backwards compatible | ✅ **tagged** | Play Console |
| Countries/regions | **173** | Play Console |
| Last updated | **12 Aug 2026** | Play Console |

Items still only the owner can confirm:

1. The **tester's country is one of the 173** on that option.
2. The tester account is a **license tester**
   (Play Console → Settings → License testing) **and** opted into the track.
3. The installed build came from **internal testing**, not a sideload — a
   sideloaded APK resolves no products regardless of catalog state.
4. The installed **versionCode is actually published** on a track.

> Note the coincidence worth resolving first: the option's *last updated* date
> (12 Aug 2026) is the same day the failing diagnosis was written. Establish
> whether any device test has run **since** that change before concluding
> anything is still broken.

---

## 4. Verify — the in-app store diagnostic

Install from internal testing, open **Settings**, long-press the **version line**
~1.2s. A dialog shows the store report. It is built in `src/lib/pro.ts`
(`plans` line, then `current offering:`, then one `offering <name>:` line per
offering, each package rendered as
`packageId/productId@priceString/productType`).

Read it as:

| Report shows | Meaning | Next step |
|--------------|---------|-----------|
| `offering default: (empty)` | Product dropped by the SDK — the §2 mechanism. | Catalog/eligibility: §3 items 1–4. |
| `…/pro_lifetime@NO PRICE/INAPP` | Product returned **priceless** — `playPackageForProduct` skips it by design (`pro.ts:177`), so checkout declines. | Pricing not propagated to the tester's region. |
| `…/pro_lifetime@$4.99/INAPP` | **Catalog is healthy.** | Fault is in the purchase call / R8 (§2a), not the catalog. |
| `plans FAILED: …` / `offerings FAILED: …` | The SDK call itself threw or timed out. | Read the message — this is the R8 / dispatcher signature. |

The `plans` line is the fastest read: `plans lifetime=$4.99` means the whole
chain works; `plans (none)` means nothing sellable reached the UI.

---

## 5. Already ruled out — do not re-check

From RevenueCat's own "empty offerings" checklist, verified against this tree:

- **API key is the Play key** (`goog_…`), not an iOS or `test_` Test Store key.
- **`com.android.vending.BILLING`** permission is present (merged from the
  billing library into the shipped manifest; correctly not declared in source).
- **No Proxy objects cross the Capacitor bridge.** RevenueCat documents that a
  reactive/`readonly` proxy handed to a plugin method makes the promise never
  resolve (purchases-capacitor #279/#243/#420). We use plain Zustand and pass the
  package straight from `getOfferings()` into `purchasePackage`. Not our bug.
- **`allowSharingPlayStoreAccount` deadlock** (#546) is fixed well below 10.16.x.
- **Package name** `com.homedesigner.app` matches Play Console, lowercase.
- **R8/coroutines ServiceLoader** rules are kept as hardening
  (`android/app/proguard-rules.pro`), but were **not** the cause — R8 rewrites a
  ServiceLoader file's contents when it renames the implementation, so the
  dispatcher still resolves; purchases still failed after 1.22.15 shipped that.

---

## 6. If you do bump the native SDK later

- The plugin, not the app, pins purchases-android. Upgrading means bumping
  `@revenuecat/purchases-capacitor` (already at the newest, 13.4.0) — you cannot
  independently force 10.16.2 under a plugin that pins a different patch.
- Keep the R8 `-keep` rules for `kotlinx.coroutines` `MainDispatcherFactory` /
  `AndroidDispatcherFactory` when R8 is enabled — they are cheap insurance
  against the ServiceLoader-inlining failure seen in 1.22.14.
- Re-run the in-app store diagnostic after any SDK bump; the report line above is
  the fastest signal that the catalog path still works.

---

### Source pages consulted (10.16.2 reference)

- `…/purchases/com.revenuecat.purchases/index.html` — `Purchases`,
  `PurchasesConfiguration`, `Offerings`/`Offering`/`Package`, `Store`,
  `awaitOfferings`, `awaitGetProducts`, `awaitPurchase`.
- `…/com.revenuecat.purchases.models/-store-product/index.html` — `StoreProduct`,
  one-time pricing model.
- `…/com.revenuecat.purchases/-purchases-configuration/index.html` — builder params.
- `…/com.revenuecat.purchases/-purchase-params/index.html` — purchase builder.
