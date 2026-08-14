# WIP — current handoff

## Session handoff 2026-08-14 (Claude) — PURCHASES: this supersedes the 08-12 entry

Version **1.22.18**, branch `claude/home-design-app-2d-plans-12y5u5`, fix commit
`33b47d8`.

> **Full write-up: [`docs/REVENUECAT_PLAYSTORE_GUIDE.md`](../docs/REVENUECAT_PLAYSTORE_GUIDE.md)**
> — evidence chain, the plugin source that proves it, adb capture procedure, and
> the ruled-out list. Read that before touching billing.
>
> **Vendor reference supplied by the owner, to be used instead of memory:**
> <https://sdk.revenuecat.com/android/10.16.2/index.html>

### The 08-12 root cause is RETRACTED. So is R8. The catalog is fine.

The entry below says the failure is a Play Console setting — `pro_lifetime` not
marked backwards compatible. **It is marked backwards compatible** (Play Console,
`prolifetime`: Active, Backwards compatible, 173 countries), and the diagnosis is
wrong regardless, because it predicts the wrong symptom:

* A dropped/priceless product throws **instantly** at `pro.ts:505` with "Pro
  upgrade is not available right now."
* The measured symptom is the buy button spinning the **full 180s** and ending
  in "The Play Store didn't answer" — only reachable **after** `playPackage()`
  returns a package. So `getOfferings()` succeeded **with a price**.

R8 goes with it: a dead `Dispatchers.Main` would break `getOfferings()`'s
callback too, giving the 12s read timeout. It doesn't. Keep the `-keep` rules as
hardening; they are not a purchase fix.

Every server-side layer was verified in the dashboards and is correct — Play
Console, RevenueCat product/offering/package, and entitlement `Pro` (3 products,
matching `ENTITLEMENT_ID`). **Do not re-check these.**

### The actual fault, and the fix in `33b47d8`

`purchasePackage` requires `presentedOfferingContext` and makes the native side
re-find the package **by identifier inside the offering that context names**;
when that resolution fails Play is never asked to open a sheet and the promise
never settles. `purchaseStoreProduct` resolves **by product id**, context
optional, no offering lookup. Proven from `PurchasesPlugin.kt` 245-295 of
purchases-capacitor 13.4.0 — see the guide for the quoted source.

Android now buys through `purchaseStoreProduct`, falling back to
`purchasePackage` only when `productCategory` is null (the plugin reads it with
`getStringOrReject` and would reject the call).

### Status: UNVERIFIED ON DEVICE — this is the next step

Typecheck, lint and all 13 billing checks pass, and the unbounded-native-call
guard in `tests/billing.mjs` now covers `purchaseStoreProduct` (fault-injected:
unwrapping the call makes it name both purchase methods). **No device has run
it.** The owner is testing with adb logcat — §2 of the guide has the commands.

The single decisive observation: **does a `BillingClient: Launching in-app
billing flow` line follow the `[pro] purchaseStoreProduct` breadcrumb?** Absent
before the fix, present after. If it is present and no sheet appears, the fault
is below RevenueCat. If `productCategory` logs as null, the fallback took the
old path and that is the next thing to fix.

A build is needed to test: the container has no keystore, and Play needs a higher
versionCode, so this wants a version cut before it can be installed.


## Session handoff 2026-08-12 (Claude) — SUPERSEDED by the entry above

Version **1.22.18**, branch `claude/home-designer-release-verify-npwmwu`.

### The purchase failure is a Play Console setting, not app code

Twelve releases of app-side fixes did not move it because the cause is upstream
of the app. The chain, each link verified rather than reasoned about:

1. **RevenueCat's backend serves the product with no purchase-option suffix.**
   Queried the live offerings endpoint with the app's own Android key:
   `default → $rc_lifetime → platform_product_identifier: "pro_lifetime"`.
2. **RevenueCat 10.16.0 reads a one-time product's price only through the
   legacy singular accessor.** Decompiled
   `com/revenuecat/purchases/google/StoreProductConversionsKt` out of
   `purchases-10.16.0.aar`: exactly one call to
   `ProductDetails.getOneTimePurchaseOfferDetails()`, and **zero** calls to
   `getOneTimePurchaseOfferDetailsList()`.
3. **Null from that accessor drops the product entirely.** Same bytecode:
   `getOneTimePurchaseOfferDetails() → ifnull → aconst_null; areturn`. The
   package does not arrive priceless — it does not arrive.
4. **Google only fills that accessor for the `legacyCompatible` purchase
   option.** With none eligible, `queryProductDetailsAsync` reports
   `NO_ELIGIBLE_OFFER` and returns no product.
5. **There is no SDK upgrade out of this.** `@revenuecat/purchases-capacitor`
   13.4.0 is the newest published version and we are already on it.

**The fix to try first:** Play Console → Monetize → Products → One-time
products → `pro_lifetime` → the `prolifetime` purchase option → confirm it is
marked **backwards compatible / legacy compatible**, and that the tester's
country is in its region list.

**RevenueCat says the same thing independently.** Their own "why are offerings
empty" checklist ends with: "Finally, double check your products are marked as
**Backwards Compatible** in the Google Play Console." That is this diagnosis,
from the vendor, arrived at from the opposite direction.

**The measurement that settles it:** install from internal testing, open
Settings, long-press the version line ~1.2s. A dialog shows the store report.
`offering default: (empty)` = product dropped (this diagnosis).
`…/pro_lifetime@NO PRICE/INAPP` = returned priceless (pricing not propagated).
`…/pro_lifetime@$X.XX/INAPP` = catalog is fine, look at the purchase call.

### Already checked against this tree — do not re-check

From RevenueCat's official empty-offerings checklist, the items that are
verifiable from the repo, all confirmed good:

* **API key is the Android one** — `goog_…`, not an iOS key and not a `test_`
  Test Store key (a Test Store key on a real device opens no sheet by design).
* **`com.android.vending.BILLING` permission** is present in the shipped
  manifest (merged from the billing library; not declared in source, which is
  correct).
* **No Proxy objects cross the bridge.** RevenueCat documents that Vue
  `reactive`/`readonly` proxies passed to plugin methods make the promise never
  resolve — the exact "no sheet, no error, no callback" signature
  (purchases-capacitor#279, #243, #420). We use plain Zustand with no immer,
  no valtio and no `new Proxy`, and `pkg` goes straight from `getOfferings()`
  back into `purchasePackage` without touching a store. Not our bug.
* **The `allowSharingPlayStoreAccount` deadlock** (purchases-capacitor#546) is
  fixed in purchases-android 9.8.1; we resolve 10.16.0. Not our bug.
* **Package name** `com.homedesigner.app` matches Play Console, lowercase.

Items only the owner can check, in the order worth checking them:

1. `prolifetime` marked **backwards compatible**, and the tester's country in
   its region list.
2. The tester account is a **license tester** (Play Console → Settings →
   License testing) *and* enrolled on the track, and has **opened the opt-in
   URL** — RevenueCat: "If you don't complete this step, products will not
   load."
3. Only **one** Google account signed in on the test device. RevenueCat warns
   multiple accounts break purchases, and Play bills "the account that
   downloaded the app".
4. If the product was created or changed recently, allow **up to 24 hours**;
   clearing the Play Store app's cache speeds it up.

### Retracted — do not re-derive these

* **R8 / kotlinx.coroutines (1.22.15, 1.22.18) is NOT the cause.** R8 rewrites a
  service file's contents when it renames the implementation, so a renamed
  `AndroidDispatcherFactory` still resolves. The real 1.22.14 breakage was the
  filename, and 1.22.15's `-keepnames` already fixed it — purchases still
  failed afterwards. The keep rules stay as hardening; they are labelled as
  such in `android/app/proguard-rules.pro`. They fix no known purchase.
* **Sideloading is NOT the cause.** The owner installs every test build from the
  Play internal-testing track.

### Still unverified

* Nobody has yet run the on-device diagnostic. Every release so far shipped
  without that measurement, which is why the loop lasted this long.
* Whether `prolifetime` actually lacks the `legacyCompatible` flag is visible
  only in Play Console (or via the Play Developer API
  `monetization.onetimeproducts` service). If the flag turns out to be set, the
  same `NO_ELIGIBLE_OFFER` can come from regional ineligibility instead.
* If the diagnostic returns `(empty)`, the app should show "The store returned
  no products for this account or country" (`describeMissingProduct`,
  `src/lib/pro.ts:198`) rather than a spinner. If a spinner appears instead,
  `getOfferings()` is hanging rather than returning empty — a separate bug.

## Session handoff 2026-08-09 #2 (Claude) — SUPERSEDED, kept for the forum-bug record

Supersedes the entry below it. Version **1.22.6**, commit `a72767b`, branch
`claude/home-design-app-2d-plans-12y5u5`.

### The three forum-access bugs are CLOSED. Do not re-fix them.

The previous handoff listed three open bugs. Codex fixed all three in
`a72767b`, and each was verified against the tree rather than taken on trust:

1. The forum link is now in `SettingsDialog.tsx`, not only About.
2. `src/lib/communityAccess.ts` opens the forum with `Browser.open()` on native,
   falling back to `window.location.assign` on web and on older native shells.
   The `<a href>` is kept and only intercepted via `onClick` when native — so
   the web keeps middle-click, open-in-new-tab and a real href for crawlers.
   This is better than the plan it replaced, which would have swapped the anchor
   for a button and lost all three.
3. The `autoVerify` intent-filter is **gone entirely** — the manifest no longer
   references `homedesignerapp.com` at all, so Android App Links cannot capture
   the Google OAuth redirect to `/community`.

Trade-off recorded for (3): the app now claims **nothing** on the domain, so no
URL on homedesignerapp.com can deep-link into the installed app. That is fine
today (the site's "Open the app" points at `/app/`, a web page, and users launch
from the launcher). If deep links are ever wanted back, the filter returns with
an explicit `pathPrefix` for `/app` and deliberately not `/community`.

### What is NOT yet confirmed

* **This tree has not been seen to typecheck cleanly.** The last container was
  missing `@capacitor/browser` and `@capawesome/capacitor-app-review` from
  `node_modules` — a stale install, not a code fault, but it means
  `npm run typecheck` was never green on `a72767b`. Run
  `npm install && npm run typecheck && npm run lint` first.
* **No AAB has been verified at 1.22.6 by this project's checker.** Bug (3) is a
  native manifest change, so a web deploy does NOT ship it — it needs a new AAB
  and a Play release before browser sign-in works on a phone.

### Suggested next steps

1. `npm install && npm run typecheck && npm run lint`
2. `npm test` (or `npm run test:ci` for the fast suite without the 3D smoke)
3. `npm run android:aab`, confirm it prints `web bundle was built at 1.22.6`
4. Verify the signer, hand the AAB to the owner, and note it needs a Play
   release for the App Links fix to take effect.

Beyond that there is no assigned work. Open threads the owner has parked, in
their own words, so they are not re-raised as if new:

* **Free-tier rebalance** — free is currently 1 project, 1 floor, ~40% of the
  catalog. The owner was told this is likely why nobody converts, asked to shelve
  it ("let's wait on this"), and it stays shelved until they raise it.
* **3-day trial → $4/mo subscription** — scoped and deferred "until the app is
  better". The one prerequisite already identified: `purchase()` in
  `src/lib/pro.ts` selects `firstAvailablePackage()` and ignores the plan id, so
  it MUST be fixed before a second product exists in the RevenueCat offering or
  people will be charged for the wrong thing.
* **AI features on a budget** — recommendation on record: auto-furnish a room by
  style, using Workers AI (already bound) for a small structured-output call,
  validated locally by the geometry rules in `tests/samples.mjs` and rejected on
  failure. Gate it behind Pro so cost scales with revenue, not installs. Avoid
  image generation.
* **Test Report No. 17's other half** — 2D pans less smoothly than 3D. Never
  profiled. Dimension pills can also still overlap a room label.
* **The one-roof limitation** — `normalizeRoofs` keeps a single roof on the top
  storey, so any single-storey wing (garage, extension, porch) renders open to
  the sky. It forced a design compromise in the "Suburban classic" template and
  it will hit any user who draws an L-shaped house.

Everything else in the superseded entry below — AAB signing, the container
rewind hazard, git recovery, and the fault-injection convention — still applies
verbatim.


## Session handoff 2026-08-09 (Claude) — SUPERSEDED, kept for context

### Where things are

Branch `claude/home-design-app-2d-plans-12y5u5`, version **1.22.5**. The
community forum is built and Codex has deployed it. Recent history worth
knowing: PR #14 merged as 1.22.5 and its `src/lib/pro.ts` conflict was resolved
CORRECTLY — the tree has both Claude's purchase hardening
(`PURCHASE_TIMEOUT_MS`, `sync()`, bounded native calls, `settleStranded`) and
Codex's `priceMicros`/`currency`. `node tests/billing.mjs` fences that; if it
goes red, someone has dropped one half.

### Three forum-access bugs — resolved in 1.22.6

These were all in the "open the forum from the app / sign in from a browser"
path. The 1.22.6 handoff immediately below records their completed fixes.

1. **The forum link is in the About dialog, not Settings.** `SettingsDialog.tsx`
   has no mention of it. Users look in Settings. Add it there (About can keep
   its copy).

2. **`AboutDialog.tsx:30` uses a bare `<a href target="_blank">`, which does
   nothing in an Android WebView.** The correct pattern already exists in this
   repo — `src/lib/modelStudioAccess.ts:19` uses `Browser.open({ url })` from
   `@capacitor/browser` (a dependency since 1.22.5). Use it.

3. **The app claims the WHOLE domain, so Google sign-in on the website bounces
   into the app.** `android/app/src/main/AndroidManifest.xml` has an
   `autoVerify="true"` intent-filter for `android:host="homedesignerapp.com"`
   with **no `pathPrefix`**, so Android App Links captures every path —
   including the OAuth redirect through `/app/`. Because the app has no native
   URL handler and `/app/` is the required web callback, 1.22.6 removes this
   unused whole-domain intent-filter rather than narrowing it to another web
   route that Android should not capture.

   Note (1) and (2) are web-bundle fixes, but (3) changes the native manifest:
   **it needs a new AAB and a Play release before browser sign-in works.**
   Codex's `9d97e0e` and `861d78b` are web-side attempts at the same symptom;
   1.22.6 resolves the manifest root cause as well.

### How to build and sign an AAB

    npm run android:aab

That is the whole thing: it runs `sync-version` (writes versionName/versionCode
into build.gradle from package.json), `build`, `npx cap sync android`,
`gradlew bundleRelease`, then `scripts/verify-aab.mjs`. Output lands at
`android/app/build/outputs/bundle/release/app-release.aab`.

Signing is automatic and needs no arguments. `android/app/build.gradle` reads
`android/keystore.properties`, which points at
`android/keystore/homedesigner-upload.jks`. **Both files are gitignored and must
stay that way** — `android/.gitignore` covers `*.jks` and `keystore.properties`,
and neither has ever been committed. Do not paste their contents into the repo,
a commit message, a PR, or a doc. If they are missing from a fresh container the
owner has to restore them; they cannot be regenerated, and losing the upload key
means a Play support request.

Verify the signer before shipping:

    keytool -printcert -jarfile android/app/build/outputs/bundle/release/app-release.aab

Expected upload certificate — `CN=Nathan Joppich`, SHA-256:

    EE:D4:E3:A9:11:BC:92:9A:D3:CD:33:36:FF:BF:32:C0:22:4A:1F:C5:21:BE:B1:13:02:F5:A0:7E:5F:00:6A:00

`97027CB7182958BBDEF3EDCFF598591C31EEED0A2075D170704B7CEC09521E93` is the **Play
App Signing** key, not the upload key. Seeing that one instead is not an error.

`scripts/verify-aab.mjs` checks BOTH halves of the bundle, and the second half
matters: it was written after several releases shipped a **stale `dist/`**.
`npx cap sync` only COPIES `dist/`, it never rebuilds, and `APP_VERSION` is baked
in by Vite at build time — so testers were running old code under a new version
number for weeks. Never hand over an AAB whose `verify-aab` did not print
`web bundle was built at <version>`.

### Hazards this session hit repeatedly

* **The container rewinds itself to an old commit without warning** — roughly a
  dozen times in one session, usually to 1.10.0. It ate an unpushed commit
  outright. **Push early; do not sit on work.** After any surprising file
  content, check `node -p "require('./package.json').version"` before trusting
  anything you read, and restore with
  `git fetch origin <branch> && git merge --ff-only origin/<branch>`.
* Files copied aside "for safety" during a rewind can be from the OLD tree.
  Re-applying them silently reverted ~1,100 lines once. Always read `git diff`
  before committing recovered work.
* `git reset --hard` and `git checkout -- <path>` are blocked by the permission
  classifier. `git stash` then `git merge --ff-only` works.

### Conventions worth keeping

* **Fault-inject every new assertion.** Break the thing, watch the test fail,
  restore. Three checks in `tests/billing.mjs` and seven in `tests/smoke.mjs`
  were verified this way, and one injection that *passed* revealed a second
  guard making the first test vacuous.
* Measure before claiming. The 2D label and draw-pill fixes were both diagnosed
  by reading real geometry out of the running app, not by reasoning about CSS.
* The owner does not want a release per fix — batch work, and only cut a version
  when asked.

> **Android support/Model Studio routing repaired for 1.22.6 on 2026-08-09:**
> Settings now links directly to the hosted community through Capacitor Browser
> on Android and exposes Model Studio only when the signed-in email matches the
> configured owner. The existing Worker admin check is unchanged. Hosted
> `/community` and `/app/model-studio` sign-ins now use a full-page Google flow;
> the exact relative page/query is carried in OAuth state and accepted only
> after issuer, audience, nonce and expiry validation. This fixes mobile forum
> login landing in `/app/` and avoids the disappearing popup that prevented the
> Android Model Studio browser tab from authenticating.
> A final native fix removes the manifest's unused whole-domain App Link
> intent-filter. It had no matching in-app URL handler and intercepted the
> fixed `/app/` Google callback before the browser could process it. The About
> link now also uses Capacitor Browser rather than a bare WebView `_blank`
> anchor. This manifest change is why the replacement AAB is required.
> Cloudflare Pages production deployment `a544415c` is live on the custom
> domain and both routes serve asset namespace `20260809162848082`. The signed
> AAB is `android/app/build/outputs/bundle/release/app-release.aab`, 28,175,889
> bytes, SHA-256
> `570BEAD59CD9B452267C630E5B4212566423550D543446E4EF17AEF7EAA4BE18`;
> the repository archive verifier and `jarsigner` both pass.
> A stable copy is at `outputs/HomeDesigner-1.22.6-12206.aab`.
> The identical 28,175,889-byte artifact is uploaded to Drive under
> `HomeDesigner/Releases/HomeDesigner-1.22.6-12206.aab` (file id
> `1inSoKnOqJrrvRIn-zK2vWWssW2EbQ4pE`).

> **Release 1.22.6 purchase repair prepared 2026-08-09:** a production user
> reported that **Unlock Pro** kept spinning and eventually showed “Still
> waiting for the Play Store.” Read-only dashboard checks found no broken
> commercial configuration: production is currently 1.22.4/12204; Google Play
> shows `pro_unlock` published with its backwards-compatible purchase option
> Active in 173 regions; RevenueCat shows the same product Published,
> Non-consumable, attached to `Pro`, and present in the Android lifetime
> package. The reporter was not discoverable as an identified RevenueCat
> customer, consistent with the app previously allowing anonymous checkout.
> The concrete client defect was `MainActivity` using `singleTask`, which
> RevenueCat's Capacitor instructions exclude because Play or a banking app can
> background the host during payment. Version 1.22.6/12206 switches to
> `singleTop`, upgrades `@revenuecat/purchases-capacitor` 13.2.1 → 13.4.0, and
> makes Google sign-in a separate first step before Android purchase/restore so
> new Pro ownership is attached to the same stable account used on desktop and
> other devices. Billing regression checks cover the identity gate and launch
> mode. A real Play-installed purchase remains the final end-to-end check; do
> not use a sideloaded APK for it.

> **Community media/profile upgrade prepared 2026-08-09:** migration
> `0002_community_media.sql` adds first-party avatar/post-image metadata and
> contribution counts. Profile photos are opt-in uploads only; the API no
> longer accepts Google or arbitrary remote avatar URLs. PNG/JPEG/WebP content
> is checked by magic bytes, size limited, stored under the signed-in user's
> private `USER_DATA` R2 prefix and served through opaque immutable image URLs.
> Only moderators can attach up to four screenshots to posts for now. The UI
> adds upload/remove controls, roles, ranks, post counts, branded header and
> mobile-friendly account buttons. Root typecheck/lint/build and Worker check
> pass; the deterministic CI suite reached the pre-existing Windows
> `node_modules/.bin/esbuild` launcher issue after geometry/i18n/theme passed.
> Google Play promotion `HomeDesigner Community Launch 2026` is live for 497
> lifetime `prounlock` codes from 9 August 2026 to 8 August 2027. Do not tie a
> code to a Play rating/review: Google prohibits incentivized reviews. The
> compliant criterion is an original HomeDesigner screenshot plus useful forum
> feedback; reviews are optional and unrewarded.

> **Community media deployed 2026-08-09:** D1 migration
> `0002_community_media.sql` is applied and Worker version
> `4651b419-f85f-49a4-8a04-944a50100afe` is live. Cloudflare Pages deployment
> production Pages deployment `https://9e359747.homedesignerapp.pages.dev`
> serves the profile/media/rank UI and classic thread layout on the custom
> domain. A follow-up makes the lazy `/community/` route run the
> same cached-session validation as the editor before offering posting tools;
> this prevents an expired web token from appearing signed in while all forum
> writes fail.

> **Mobile community OAuth return repaired 2026-08-09:** the fixed Google
> redirect URI remains `/app/`, but the requested forum return path now travels
> inside the existing nonce-bound local OAuth transaction as well as the
> original tab's session storage. This covers mobile providers that complete in
> a separate tab/context. The callback accepts only a single-slash relative
> path, still validates issuer/audience/nonce/expiry, and removes credentials
> from browser history before returning to `/community/`.

> **Classic forum presentation prepared 2026-08-09:** `/community/` now owns
> an explicit vertical scroll container instead of inheriting the editor's
> fixed `overflow: hidden` shell. Thread replies are bordered two-column cards
> with the poster avatar/name/role/rank/count on the left and content on the
> right, collapsing to a compact stacked author strip on phones. The broken
> root logo URL was replaced with the verified landing asset at
> `/assets/brand-icon.png`.

> **Community launch content published 2026-08-09:** the owner account
> `@homedev` has published the FAQ, the illustrated 2D/3D quick-start tutorial
> (`?thread=526d4286-91c0-475f-b12d-670b8c65eb53`) and the compliant 497-code
> launch terms (`?thread=73bad328-3754-4644-99b0-053a61828d8a`). Four current
> app screenshots are attached to the tutorial and two to the campaign through
> the first-party media API. The one permitted monthly r/HowToMen promotion is
> live at `https://www.reddit.com/r/HowToMen/comments/1vjs9s1/` with four
> screenshots, direct Play/site/community links and the Brand Affiliate tag.
> It explicitly says Play reviews are optional, unchecked and unrewarded.

> **Community forum deployed 2026-08-09:** `/community/` is live with public reading, Google-authenticated posting, profiles, reporting and a usable owner moderation queue. D1 `homedesigner-community` is in WEUR (`02230a9a-6b37-4d17-b46e-60f2fef95c47`), migration `0001_community.sql` is applied, and Worker version `687c8e8f-b438-4d12-8ece-11fa2e603f18` is live. Pages deployment `9fe3918f-34d2-46da-a75d-2a5b10d44d74` fixed the route's `/app/` asset base. Chrome verified the live custom domain, empty report queue, privacy-safe random handle and owner `admin` access through the visible **Moderate** action. The community now uses a same-tab Google OAuth redirect because embedded browsers immediately closed its popup; the callback validates issuer, audience, nonce and expiry, removes credentials from history, then returns to `/community/`. The editor's web popup and Android native sign-in are unchanged. Default handles never derive from email prefixes and anonymous reads share one per-IP forum limit.

> **Final CI repair 2026-08-08:** the release smoke test now selects one
> visible copy of a catalogue item because Recent/Favourites can legitimately
> duplicate the normal category card. The Model Studio source assertion no
> longer mistakes explanatory comment text for an actual `window.open` call.
> Both corrected checks pass locally and the full direct smoke run progressed
> beyond the original GitHub failure point. The required PR workflow now runs
> deterministic unit/integration suites; the browser-based trace, complete browser and
> software-rendered 3D coverage runs nightly and on demand so GPU timing
> variance does not block releases.

> **Release 1.22.5 prepared 2026-08-08:** versionCode **12205** contains the
> rebased mobile editing/catalogue/Pro improvements, one-shot placement
> feedback, the touch-wall correction and restored owner-only mobile Model
> Studio entry. GitHub CI's only failure was six Pro checkout translations
> packed onto shared dictionary lines that its static scanner could not see.
> Each key is now a separate entry in all 12 locales and the i18n suite is
> green. Signed artifact:
> `android/app/build/outputs/bundle/release/app-release.aab`, 28,001,769 bytes,
> SHA-256 `E4FF7DCB3C724AE3D75C2EC45A5C77EC25AB02E7C4091D3ECE784FFEED1833C5`.
> `jarsigner` verifies it, and an independent archive check confirms native
> 1.22.5/12205, web bundle 1.22.5 with no stray app version, 42 JavaScript files
> and 63 bundled GLBs. The repository verifier itself requires Unix `unzip`, so
> the equivalent checks were run through .NET's ZIP reader on Windows.

> **Mobile Model Studio entry repaired 2026-08-08:** the owner-only tool is now
> available directly in the editor's More menu as well as the Account menu.
> Android opens `https://homedesignerapp.com/app/model-studio/` through the
> supported Capacitor Browser Custom Tab rather than the unreliable WebView
> `window.open()` path; `@capacitor/browser` is installed and synchronized into
> the native Gradle project. A 390×780 touch-browser check confirms the owner
> entry is visible and on-screen. Email comparison remains normalized and the
> sync Worker remains the final authorization boundary.

> **Rebase validation completed 2026-08-08:** `agent/cloudflare-private` is
> resolved against current `claude/home-design-app-2d-plans-12y5u5` (1.22.4).
> Typecheck, lint and the full geometry suite are green. The full browser suite
> passed every existing check and exposed one touch-wall regression: starting a
> drag at the previous corner was misread as a double-tap and cleared the first
> point. That handler now finishes only a stationary second tap. A focused real
> touch-browser rerun retains both points and commits the wall at release. The
> production web build and Android Java 21 debug compilation also pass with the
> new Capacitor Browser registration.

> **One-shot placement feedback completed 2026-08-08:** successful placements
> in 2D and 3D now confirm the translated item name and expose both Undo and
> Place another. Furniture, doors/windows, wall-mounted models and décor placed
> on another object all use the same helper. Placement still disarms after one
> item, the new item stays selected, and only Place another explicitly re-arms
> it. The existing placement pill still supplies Cancel before placement.
> Validation is green after the rebase. Next report item: P2 catalogue preview
> metadata.

> **UI plan rebased onto 1.22.4 on 2026-08-08:** the first three priorities in
> `docs/UI_IMPROVEMENT_REPORT_2026-08-08.md` are implemented against Claude's
> current interaction model. The existing object-anchored selection ring is
> preserved; a separate contextual dock appears only for stairs, openings and
> structural selections that need special actions. Catalogue aliases, validated
> cloud search terms, result counts and empty-state recovery preserve the newer
> Free-only filter. The Pro sheet separates plan selection from checkout and
> uses exact RevenueCat prices without replacing the newer 1.22.x Play recovery
> flow. Validation is green after the rebase.

> **Play/RevenueCat purchase configuration repaired 2026-08-08:** the JSON
> uploaded in RevenueCat belongs to
> `revenuecat-service-account@shining-smoke-391115.iam.gserviceaccount.com`,
> but that account was missing from Play Console; only the retired
> `revenuecatbilling@...` account had access. The current account is now Active
> with RevenueCat's three documented least-privilege Account permissions: view
> app information/bulk reports, view financial data/orders/cancellation
> responses, and manage orders/subscriptions. RevenueCat now reports **Valid
> credentials** for Play receipt validation and both catalog checks. Android's
> one-time `pro_unlock` product remains Active in 173 countries. No duplicate
> checkout code was merged: releases 1.22.1 and 1.22.2 already contain the
> longer purchase watchdog, store reconciliation, and resume-time stranded-flow
> recovery that supersede the older local 1.12.2 patch. Build the next AAB from
> this 1.22.3+ branch. The server-side credential repair is already live; a
> license-tester purchase is still the final end-to-end check. Google developer
> notifications remain unconnected and are a recommended follow-up, not a
> blocker for the lifetime checkout.

> **Emergency furniture-scale regression corrected live 2026-07-29:** restored
> footprint-based proportional fitting for catalogue replacements, fixing the
> tiny beds and baths, and restored the established dining-chair, wooden-chair,
> TV and barbecue catalogue slots. Exact short-lived oversized defaults are
> reverse-migrated on load while user-resized objects are preserved. Model
> Studio now forces existing-item overrides to proportional `contain`; only the
> four standalone generated models keep their audited exact dimensions/yaw.
> Pages deployment `https://35f8c6ac.homedesignerapp.pages.dev`; asset namespace
> `20260729211531965`. The corrected R2 manifest is live. Typecheck, lint,
> production build and all sample-home layout checks pass.

> **Published Studio model proportion audit live 2026-07-29:** all seven unique
> generated GLBs were measured from their optimized world-space AABBs. Four
> standalone entries and four overrides now use dimensions/yaw matching the
> real assets; exact legacy defaults migrate while user-customized dimensions
> remain untouched. Model Studio's optimizer now measures each future GLB and
> derives depth, height and any required quarter-turn from the intended width,
> preventing guessed metadata from stretching models in-app. Pages deployment
> `https://19a97ba4.homedesignerapp.pages.dev`; asset namespace
> `20260729210522397`. Root typecheck/lint/build, Worker check and sample-home
> collision validation are green.

> **Placement, scaling and desktop account fixes live 2026-07-29:** generated
> Fal models now obey exact width/depth/height in the app, with yaw-aware axis
> mapping; the first wall-TV save format auto-migrates its swapped footprint.
> Model Studio defaults to exact sizing and publishes floor/surface/wall
> placement metadata. Wall objects snap to walls, small décor snaps onto other
> furniture, placement disarms after one item, and mobile selection has a
> floating delete action. The account/avatar menu is restored in the desktop
> editor toolbar. The live wall TV is corrected to 200×10×100 cm with 90° yaw.
> Worker version `b18278b5-c0df-4b99-8154-b29e2a797c3f`; Pages deployment
> `https://d6280e3e.homedesignerapp.pages.dev`; asset namespace
> `20260729202820875`.

> **Release 1.12.1 built 2026-07-29:** Android versionCode **11201** includes
> the owner-only Account-menu entry for Model Studio. Signed delivery artifact:
> `outputs/HomeDesigner-1.12.1-11201.aab`, 29,638,941 bytes, SHA-256
> `949C5FC331436C3A94DAC31EDA68C9736165A98FE318A16E8B822EBB56758264`.
> `jarsigner` verifies it and the certificate owner is Nathan Joppich. Model
> Studio history has no R2 TTL; the UI lists the newest 40 jobs while older
> records remain stored.

> **Catalogue safety + free TV media unit live 2026-07-29:** Model Studio now
> derives category and object-type dropdowns from the shipped catalogue, and
> existing-model replacement uses a canonical bundled-item selector. The remote
> catalogue reader and Worker both reject unknown room categories. Worker
> version `43dd5a75-5040-4094-b031-618bb3405d6b`; Pages deployment
> `https://0aa0528a.homedesignerapp.pages.dev` uses asset namespace
> `20260729174223912`. The supplied Hunyuan Pro TV/media cabinet is published as
> free `tv_media_unit` under Living/Storage with validated immutable mobile
> (886,564 bytes, SHA-256 `d5eaf65a8cf6d8183c3222ce703af1cd8dadf52d97fa07327170561225dbffde`)
> and render (2,277,128 bytes, SHA-256
> `22d0082f9ab4e1bfe28623c84bdd9716af0b58b78002b67ebdd2bf8ac65f63f8`)
> Cloudflare tiers. It is cloud-delivered and does not increase the Android AAB.

> **Catalogue previews, filters and samples refreshed 2026-07-29:** generated
> TV/media-unit and dining-chair catalogue tiles now use immutable 512px renders
> of their actual optimized GLBs. The manifest schema and client accept only
> same-origin PNG/JPEG/WebP thumbnails; missing thumbnails fall back to current
> symbols rather than stale bundled sprites. Future Fal thumbnails are copied
> to R2 automatically by Worker version
> `6207dc27-c0ee-4703-8f5f-0d857b059e06`. Model Studio's existing-item dropdown
> is category-scoped, and selected catalogue chips use brand styling in dark
> mode. The sample homes retain stable built-in types but now receive cloud
> overrides for TV, dining chairs, sofa, armchair, bed, plants, bathtub,
> dresser and nightstands, preserving offline fallbacks. Pages deployment
> `https://810ba9a4.homedesignerapp.pages.dev` uses asset namespace
> `20260729182459292`.

> **Web cache failure permanently hardened 2026-07-29:** Vite now emits every
> generated asset under a unique per-deployment namespace, including otherwise
> unchanged vendor chunks. A top-level `404.html` disables Cloudflare Pages'
> HTML fallback for missing modules, and `build:web` fails if either invariant
> is lost. Deployment `https://e3230a98.homedesignerapp.pages.dev` uses asset
> namespace `20260729171558068`. Live apex verification returned the entry
> module as `application/javascript`, a random missing module as HTTP 404 with
> `Cache-Control: no-store`, and the Chrome profile previously affected by the
> year-long poisoned cache mounted the app without manual cache clearing.

> **Private Model Studio live 2026-07-29:**
> `https://homedesignerapp.com/app/model-studio/` is a dedicated, owner-only
> entry page using the existing Google OAuth client. The Cloudflare sync Worker
> version is `fd35b592-1c39-4405-b383-2dfef4be60cf`; `FAL_KEY` and
> `MODEL_ADMIN_EMAIL` are Worker secrets and are not shipped to the browser or
> repository. The studio offers only textured text-to-3D generators: Hunyuan
> 3D Pro (detail-first, `$0.525`/`$0.675` with PBR) and Hunyuan 3D Rapid
> (fast drafts, `$0.225`/`$0.375` with PBR). Untextured Pro `Geometry` and
> Rapid `enable_geometry` modes are blocked in the Worker and arbitrary client
> endpoints are rejected. It previews local
> GLBs, creates mobile and HD render tiers, stages both to R2 and publishes the
> manifest only after rights confirmation. Normal editing uses the mobile tier;
> Photo Mode alone requests `renderUrl`. Live owner sign-in and normal `/app/`
> account restoration were verified. App HTML is now `no-store` to prevent a
> cached shell from referencing retired immutable chunks; asset files remain
> immutable for one year.
> The normal Account menu now exposes **Model Studio** only when the signed-in
> email is `nathanjoppich@gmail.com`; the Worker remains the authority and
> rejects every non-owner token regardless of UI visibility.
> Production custom-domain verification returned the new hashed Model Studio
> JavaScript with `application/javascript` and confirmed both model choices are
> present; this check caught and replaced one stale HTML fallback cached under
> an earlier asset path.

> **Fal TRELLIS tooling added 2026-07-29:** `npm run models:trellis` now
> generates review-only TRELLIS 2 GLBs from local or hosted images with safe
> mobile defaults, automatic glTF optimization, inspection, hashing and a
> reproducibility/approval record. The local command reads `FAL_KEY` only from
> the ignored environment file and never logs it.
> The tool deliberately cannot upload to R2 or edit the live catalogue because
> the current runtime accepts only CC0 provenance. See
> `docs/FAL_TRELLIS_PIPELINE.md`. TRELLIS remains review-only; Hunyuan Pro is
> the preferred production generator after the texture-quality comparison.

> **Tester onboarding updated 2026-07-29:** the landing page no longer embeds
> the unreliable Google Form. Its **Request access** buttons scroll to three
> direct instructions: join `groups.google.com/g/homedesignertest`, opt in at
> the Google Play testing URL, and install from the public Play listing. All
> three steps tell testers to use the same Google account.

> **Infrastructure migration completed 2026-07-29:** Cloudflare is authoritative
> through `amit.ns.cloudflare.com` and `laila.ns.cloudflare.com`. The Git-backed
> Pages project `homedesignerapp` builds the merged default branch with
> `npm run build:web`; both `homedesignerapp.com` and
> `www.homedesignerapp.com` are Active with SSL on that project. The Cloudflare
> GitHub app is limited to this repository. The source repository was verified
> private with successful Cloudflare auto-deploys, but is temporarily public
> again until the former GoDaddy delegation has expired from carrier caches.
> `homedesignerapp-preview` remains available only as a direct-upload fallback
> and has no production custom domains.

> **DNS propagation note:** GoDaddy shows the correct Cloudflare nameservers,
> and major public resolvers return the Cloudflare edge. At least one mobile
> carrier still caches the former GoDaddy delegation and therefore reached the
> old GitHub Pages IPs. GitHub Pages has been explicitly recreated and deployed
> with the custom domain, so both the stale GitHub route and the new Cloudflare
> route now return 200. Keep the repository public through at least 2026-07-31;
> then verify propagation before making it private again.

> **Security sweep:** production web no longer accepts the `?pro=1` test seam
> or browser localStorage as entitlement authority. The Worker version
> `7a48fba0-5e89-44bd-a340-a789d89f74e4` enforces exact `Pro` entitlements and
> per-subject read/write rate limits. Pages security headers and Android backup,
> cleartext and FileProvider restrictions are in source. Local non-3D tests,
> the full GitHub CI suite, and an Android debug build are green with Android
> Studio JDK 21. Production and Worker npm audits are clean; the remaining 9
> high and 1 moderate root audit entries are development/build tooling
> major-upgrade work.

> **Outstanding credential operation:** rotate the Google service-account key
> that was pasted into the prior support chat, update the matching RevenueCat
> integration, verify Play purchase validation, and then revoke the old key.
> No private key or server secret was found in the current repository or its
> reachable Git history.

> **Current as of 2026-07-28:** release source is **1.12.0** (versionCode
> **11200**) on `agent/half-walls-1.12.0`. The active architectural and
> release handoff is `docs/WIP_HANDOFF.md`; the older authentication notes below
> are preserved as historical operational context.

## Latest release — 1.12.0

- Half/pony walls are first-class structural walls through
  `Wall.halfWall?: boolean`; existing projects remain full-height by default.
- A dedicated tool draws them in both 2D and 3D, while Properties converts a
  selected wall. Both paths reuse normal snapping, dimensions, editing and undo.
- They default to 105cm, keep room/roof/walk collision semantics, show a dashed
  2D centre mark and stay visible during dollhouse fading.
- Doors/windows are blocked on half walls instead of producing invalid floating
  opening geometry. Full wall, half wall and fence states are mutually exclusive.
- All new copy is translated across the 12 non-English locale dictionaries.
- Final validation is green: typecheck, lint, production build, geometry,
  samples, all 47 trace checks and all 111 browser checks, including 3D and the
  catalogue. The signed 1.12.0 AAB is 29,535,577 bytes with SHA-256
  `71C23EFC33EB0B21DE4A8A884C6EDEA814808DAA4C5D1CAEB20AB552FFAFFB40` and
  the expected Nathan Joppich upload certificate. The local delivery copy is
  `outputs/HomeDesigner-1.12.0-11200.aab` (gitignored).

_Historical authentication handoff last updated: 2026-07-23. Working branch at
that time: `agent/stripe-web-checkout`._

## Current state

- **Current release source: 1.0.91 (versionCode 10091).**
- 1.0.91 is a rebuild of the unchanged 1.0.90 authentication release because
  the previous Play Console AAB upload failed.
- Desktop Google OAuth is configured for `https://homedesignerapp.com/app/`,
  browser session restore is fixed, and Google-linked RevenueCat Pro lookup is
  deployed in the Cloudflare sync Worker.
- **Released in 1.0.89:** desktop Stripe checkout and the live
  RevenueCat/Stripe dashboard configuration are deployed on GitHub Pages.
- **Released in 1.0.90/1.0.91:** live desktop testing exposed an OAuth callback edge
  case when a browser turns Google's popup into an opener-less tab. The local
  fix validates and forwards that successful callback to the waiting app.
- **Live hotfix:** Worker `4afa87b9-0fa3-4596-845d-62b1ff43f367` now uses a
  private RevenueCat v2 secret for desktop entitlement reads. The owner's
  linked Google customer has an unlimited Homedesigner Pro grant.
- Begin any continuation by reading this file and `CHANGELOG.md`. Preserve the
  untracked local `outputs/` directory and all signing files.

## Stripe desktop checkout WIP

- Added `@revenuecat/purchases-js` and a lazy-loaded desktop provider in
  `src/lib/pro.ts`.
- Configured web builds require Google sign-in, reuse the existing stable
  `google:<subject>` RevenueCat customer ID, load every real localized offering
  price, and purchase the exact package selected through RevenueCat Web
  Billing/Stripe.
- `ProUpsellModal` now shows **Sign in with Google** before checkout, then a
  three-choice pricing grid once the customer is linked. Builds without
  `VITE_REVENUECAT_WEB_KEY` retain the Play Store fallback.
- Browser smoke coverage runs with a public-format fake `rcb_` key and verifies
  the signed-out desktop flow without contacting RevenueCat.
- Validation: `npm run typecheck`, `npm run lint`, `npm run build`, and
  `SMOKE_SKIP_3D=1 npm test` pass.

### Dashboard state / exact next steps

1. The live Stripe account `HomeDesignerApp` is connected to RevenueCat Billing
   and the web configuration uses EUR with the HomeDesigner support/Play Store
   details.
2. Live products are configured at **€4.99 monthly**, **€39.99 yearly**, and
   **€79.99 lifetime**. Each grants `Homedesigner Pro (Pro)` and is assigned to
   the matching package in the default offering.
3. `homedesignerapp.com` is enabled in Stripe Payment Method Domains, allowing
   supported Apple Pay/Google Pay wallets in the RevenueCat Web SDK checkout.
   Stripe Tax remains disabled.
4. `.env.production` contains the public `rcb_` application key. This is an
   embeddable SDK identifier; the private RevenueCat v2 key remains only in the
   Worker secret.
5. No real live charge was made. After deployment, perform one owner purchase
   and confirm RevenueCat grants the same Google-linked `Pro` entitlement on
   desktop and Android.
6. The 1.0.89 Stripe release is merged and deployed. Next: validate, commit,
   merge, and deploy the 1.0.90 OAuth callback fix, then run the owner purchase
   check above.

## Google account reliability in 1.0.90

- Opener-less desktop OAuth callback tabs now verify the Google issuer,
  audience, nonce, and token expiry before forwarding the successful response
  through the provider's nonce-scoped BroadcastChannel. The callback removes
  credentials from browser history immediately and closes itself when allowed.
- Final validation is green: typecheck, lint, production build, all non-3D
  browser smoke checks, Android Capacitor sync, signed release bundle build,
  and AAB signature verification.
- Desktop restore now rejects an expired persisted Google ID token instead of
  showing a signed-in account that cannot sync.
- Google plugin initialization can be retried after a temporary failure, and a
  stale provider session is cleared before a new desktop/Android login.
- Sign-out is local-first: project syncing stops and the cached account,
  account-linked Pro state, prices, and in-memory token are cleared immediately.
  Google and RevenueCat cleanup runs best-effort, so being offline no longer
  leaves the UI stuck signed in.
- When restore finds no usable Google session, it also stops project syncing
  and disconnects account-linked RevenueCat state.

## Retroactive account migration WIP

- `RevenueCatProvider.identify()` now calls `syncPurchases()` when the newly
  linked Google customer has no entitlement/product. This is the migration path
  for eligible Play purchases made before Google account linking existed.
- `projects.ts` repairs orphaned `homedesigner.project.<id>` records and the
  legacy single-slot save before producing the cloud snapshot. Old projects
  should not be deleted.
- The signed-in account menu and Settings now include **Sync now**, which
  retries both purchase linking and project merge.
- RevenueCat evidence on 2026-07-23: customer
  `google:115399174729229571139` existed but showed USD 0, no aliases, no
  purchases, and no current entitlements. It was granted the existing
  `Homedesigner Pro (Pro)` entitlement for unlimited duration.
- The live Worker previously used the public `goog_` SDK key against a private
  v1 subscriber endpoint. It now calls RevenueCat v2
  `/active_entitlements` using secret binding `REVENUECAT_SECRET_KEY`; the key
  itself is never in the repository or handoff.
- Validation: root typecheck/lint pass, Worker `npm run check` passes, and all
  35 non-3D smoke checks pass with zero page errors.

## What 1.0.88 changes

- Fixes the production Google `redirect_uri_mismatch` by registering and
  pinning the exact `/app/` redirect on the HomeDesigner OAuth web client.
- Fixes web reloads by reading the social-login plugin's persisted ID token
  before native-only refresh; this restores initial cross-device plan merge on
  desktop.
- Adds Worker `GET /v1/entitlement`, authenticated with the same Google JWT and
  mapped to RevenueCat user `google:<subject>`. Desktop now inherits Pro bought
  on Android while signed into that Google account.
- Worker deployment: `a5dbc7f0-dd23-42f9-a73f-5913dcea1e50`.

## What 1.0.85 changed

- On touch devices, enabling **Lock objects** now lets a one-finger pan begin
  anywhere in the 2D plan: room floors, walls, and furniture are all valid pan
  surfaces. Previously the gesture only worked in the empty margin outside the
  house or over an imported background plan.
- Tap selection is unchanged. Panning starts only after the existing 7 px touch
  slop, so a tap can still select a locked object or surface without moving it.
- `tests/smoke.mjs` now dispatches a real one-finger touch drag from inside a
  sample room with object lock enabled and asserts the viewport delta.

## Recent technical context

- **1.0.87:** added the Google account shortcut to the projects/home header.
- **1.0.86:** restored desktop Settings access beside Language.
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

- v1.0.88: app and Worker TypeScript clean, Worker deployed, and all 39 browser
  checks pass with zero page errors. Production browser sign-in still needs a
  final check after GitHub Pages deploy and Google's OAuth propagation.
- Versions are synchronized in `package.json`, `package-lock.json`, and
  `android/app/build.gradle` (`1.0.NN` maps to versionCode `100NN`).
- Release signing configuration and keystore are local/gitignored. Never stage,
  commit, paste, or log their contents.
- For the next release: bump the three version locations, update
  `CHANGELOG.md`, run `npm run build`, `npx cap sync android`, build
  `android/app/build/outputs/bundle/release/app-release.aab`, and verify the AAB
  signer before delivery.

## Remaining owner/device checks

- On desktop, sign into `homedesignerapp.com/app/` with the same Google account
  used on Android and confirm its R2-backed plans appear.
- Confirm a Play-installed Android device signed into that Google account sees
  Pro, then confirm desktop shows Pro after sign-in. RevenueCat `logIn()` and
  the Worker entitlement lookup now share the same stable customer ID.
- Keep `CHANGELOG.md` and this WIP file current whenever work is handed between
  Claude and Codex.

## Repository guardrails

- Preserve unrelated local files, especially `outputs/` and all signing files.
- Never put model identifiers in commits, PRs, source, or handoff documents.
- Use commercially safe assets only; IKEA model permission is still pending.
