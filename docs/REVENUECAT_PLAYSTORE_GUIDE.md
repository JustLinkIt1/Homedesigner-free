# Google Play checkout — findings, fix, and how to confirm it on device

Last updated **2026-08-14**. Fix commit `33b47d8` on
`claude/home-design-app-2d-plans-12y5u5`.

**Vendor reference for this work (supplied by the owner — use this, not memory):**
<https://sdk.revenuecat.com/android/10.16.2/index.html>

That is the native `purchases-android` API reference. We do not call it directly.
The stack is:

```
src/lib/pro.ts  →  @revenuecat/purchases-capacitor 13.4.0   (JS Purchases API)
                →  purchases-android 10.16.x                (the SDK that reference documents)
                →  Google Play Billing Library
```

10.16.2 is a patch on the same 10.16.x line every earlier diagnosis was made
against. Its public one-time-product surface is unchanged, so **bumping to it is
not a fix** — and the plugin, not the app, pins the native version.

---

## 1. The finding

**The catalog is healthy. The hang is the client-side package lookup.**

The app now buys through `purchaseStoreProduct` (resolves by **product id**)
instead of `purchasePackage` (resolves by **package id inside an offering**).

### The evidence chain, each link measured rather than argued

1. **The symptom rules out an empty/priceless offering.** The owner reports the
   buy button spins the **full ~3 minutes** (`PURCHASE_TIMEOUT_MS = 180_000`)
   and ends in *"The Play Store didn't answer."* That line is only reachable
   **after** `playPackage()` returns a package — `pro.ts:505` throws
   **instantly** with *"Pro upgrade is not available right now"* when the
   product is absent or priceless. So `getOfferings()` succeeded and returned
   `pro_lifetime` **with a price**.

2. **Every server-side link is correct** (verified in the dashboards, 2026-08-14):

   | Layer | State |
   |---|---|
   | Play Console `pro_lifetime` → `prolifetime` | **Active**, **Backwards compatible**, **173 countries** |
   | RevenueCat Play app product `pro_lifetime` | **Published**, 1 entitlement |
   | Offering package `$rc_lifetime` | Play `pro_lifetime` + web `pro_lifetime_web_v2` |
   | Entitlement `Pro` | Active, 3 products — matches `ENTITLEMENT_ID` in `pro.ts:83` |
   | API key | `goog_…` (Play key, not iOS, not `test_`) |

3. **The two purchase calls are not equivalent.** From `PurchasesPlugin.kt`
   245-295 of `@revenuecat/purchases-capacitor` 13.4.0:

   ```kotlin
   fun purchasePackage(call: PluginCall) {
       val packageIdentifier         = packageToPurchase.getStringOrReject(call, "identifier") ?: return
       val presentedOfferingContext  = packageToPurchase.getObjectOrReject(call, "presentedOfferingContext") ?: return
       purchasePackageCommon(activity, packageIdentifier, presentedOfferingContext.convertToAnyMap(), …)
   }

   fun purchaseStoreProduct(call: PluginCall) {
       val productIdentifier        = storeProduct.getStringOrReject(call, "identifier") ?: return
       val type                     = storeProduct.getStringOrReject(call, "productCategory") ?: return
       val presentedOfferingContext = storeProduct.optJSONObject("presentedOfferingContext")   // OPTIONAL
       purchaseProduct(activity, productIdentifier, type, googleBasePlanId = null, …)
   }
   ```

   * `purchasePackage` **requires** the offering context, then
     `purchasePackageCommon` must re-find the package **by identifier inside the
     offering that context names**. If that resolution fails, Play is never
     asked to open a sheet and the promise never settles.
   * `purchaseStoreProduct` treats the context as **optional** and resolves **by
     product id**, with no offering lookup in the path.

   Neither transmits the product object — both re-resolve natively. So the only
   thing that differs is *which lookup must succeed*, and the product-id one is
   already proven to work on the failing device: it is how the priced product
   reached the checkout code in the first place.

4. **R8/coroutines is retired too**, on better evidence than either earlier
   argument for or against it: a dead `Dispatchers.Main` would break
   `getOfferings()`'s callback as well, producing the **12s** "Timed out loading
   store products". It doesn't. The `-keep` rules stay as hardening.

### The fallback, and why it exists

`productCategory` is typed `PRODUCT_CATEGORY | null`, and the plugin reads it
with `getStringOrReject` — a null one **rejects** the call. That is a fast named
error rather than 180s of silence, but it is still no purchase, so the code falls
back to `purchasePackage` when the field is missing rather than trading one dead
end for another.

---

## 2. Confirming it on device with adb

The app sets RevenueCat to `LOG_LEVEL.VERBOSE` **before** `configure()`
(`pro.ts:434`), and Capacitor mirrors `console.warn` into logcat, so the app's
own breadcrumbs land beside the SDK's lines. Package id is
**`com.homedesigner.app`**.

```bash
# 1. Confirm the build came FROM PLAY. Products do not resolve for a sideload,
#    and that alone would explain everything downstream.
adb shell dumpsys package com.homedesigner.app | grep -i installerPackageName
#    expect: installerPackageName=com.android.vending

# 2. Confirm which build is actually installed.
adb shell dumpsys package com.homedesigner.app | grep -E "versionName|versionCode"

# 3. Clear, then capture while you tap Unlock Pro.
adb logcat -c
adb logcat -v time | grep -iE "\[pro\]|RevenueCat|Purchases|BillingClient|MissingMainCoroutine"
```

### Reading the capture

| What you see | Means |
|---|---|
| `[pro] offerings {…}` | What Play returned for **this device, country, account**. The ground truth no dashboard can give. |
| `[pro] purchaseStoreProduct {…}` | What we handed over. Check `productCategory` is non-null and `price` is set. |
| `BillingClient: Launching in-app billing flow` **after** that breadcrumb | The SDK **did** reach Play. If the sheet still never appears, the fault is below RevenueCat. |
| **No** BillingClient launch line after the breadcrumb | The SDK never reached Play — the lookup died inside hybrid-common. **This is the bug this fix targets.** |
| `MissingMainCoroutineDispatcher` anywhere | R8 is back in play after all; re-open §1.4. |
| `[pro] purchaseStoreProduct` shows `productCategory: null` | The fallback took the old path — expect the old hang, and that is the thing to fix next. |

The decisive comparison is simply **whether a BillingClient launch line follows
our breadcrumb.** Before the fix it should be absent; after it, present.

---

## 3. Ruled out — do not re-check

* **Product dropped via the legacy price accessor** (the 1.22.18 root cause).
  Retracted: it predicts an *instant* "not available right now", not a 180s spin.
* **`prolifetime` not backwards compatible.** It is — confirmed in Play Console.
* **R8 / coroutines ServiceLoader.** See §1.4. Rules kept as hardening.
* **API key wrong kind** — `goog_…`, not iOS, not a `test_` Test Store key.
* **`com.android.vending.BILLING` permission** — present via the billing
  library's merged manifest (correctly not declared in source).
* **Proxy objects across the Capacitor bridge** — the documented
  never-resolving-promise trap (purchases-capacitor #279/#243/#420). We use
  plain Zustand, no immer/valtio/`new Proxy`, and the package goes straight from
  `getOfferings()` into the purchase call.
* **`allowSharingPlayStoreAccount` deadlock** (#546) — fixed well below 10.16.x.
* **Package name** — `com.homedesigner.app`, matches Play Console, lowercase.
* **SDK upgrade** — `@revenuecat/purchases-capacitor` 13.4.0 is the newest
  published version and we are on it.

---

## 4. Loose end worth a look while you are in the dashboard

RevenueCat's **Test Store** app still carries four leftover products from
2026-07-08 — `pro_unlock`, `lifetime`, `yearly`, `monthly` — none with an
entitlement attached. They are not referenced by the live offering and match no
id in `PLAY_PLAN_PRODUCTS`, so they are inert today. They are still a landmine if
a future offering or a `test_` key ever picks them up.

---

## 5. Reference

* RevenueCat Android SDK 10.16.2 — <https://sdk.revenuecat.com/android/10.16.2/index.html>
  * `com.revenuecat.purchases` — `Purchases`, `PurchasesConfiguration`,
    `Offerings`/`Offering`/`Package`, `Store`, `awaitOfferings`,
    `awaitGetProducts`, `awaitPurchase`
  * `com.revenuecat.purchases.models.StoreProduct` — one-time (INAPP) pricing
* Plugin source read for §1.3 —
  `https://unpkg.com/@revenuecat/purchases-capacitor@13.4.0/android/src/main/java/com/revenuecat/purchases/capacitor/PurchasesPlugin.kt`
* Plugin TypeScript surface —
  `node_modules/@revenuecat/purchases-typescript-internal-esm/dist/offerings.d.ts`
  (`productCategory` is declared `PRODUCT_CATEGORY | null` at line 153)
* In-app store diagnostic — long-press the version line in **Settings** ~1.2s
  (built in `pro.ts`; also in About)
