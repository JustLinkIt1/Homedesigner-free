# Changelog

All notable HomeDesigner Free release changes are recorded here, newest first.
Versions map to `package.json` `version` and the Android `versionCode`
(`1.0.NN` → `100NN`). Agents working in this repo: read this file before making
changes and add an entry when you ship one.

## Unreleased

### Community support forum

- Added opt-in profile-picture uploads backed by the existing private Cloudflare R2 bucket. Google profile photos are never imported automatically; members keep an initial avatar unless they deliberately upload a PNG, JPEG or WebP and can remove it at any time.
- Added moderator-only screenshot attachments for discussions and replies, with byte limits, file-signature validation, immutable first-party serving and no arbitrary image URLs or SVG/HTML uploads.
- Added public contribution counts, member ranks and visible Member/Moderator/Admin roles across profiles and discussions, plus a branded logo header and touch-friendly account/moderation buttons.
- Made the standalone community route restore and validate the cached Google session before showing posting controls, so an expired desktop token returns to a real sign-in prompt instead of leaving an account that cannot post.
- Preserved the forum return path inside the nonce-bound OAuth transaction so mobile Google sign-in reliably returns to `/community/` even when the provider completes in a separate browser tab; the callback still rejects external and protocol-relative redirect targets.
- Made forum threads independently scroll inside the fixed app shell and restyled each reply as a classic bordered forum card with poster identity, role, rank and contribution count in a left column; phones use a compact stacked author strip. The header now uses the verified `/assets/brand-icon.png` path.
- Created a live Google Play one-time-product promotion for 497 lifetime `prounlock` codes through 8 August 2027. The campaign rewards an original HomeDesigner creation and useful forum feedback; Play ratings and reviews are explicitly not required or rewarded.
- Published an owner-authored FAQ, an illustrated seven-step 2D/3D quick-start tutorial, the full promotion terms and one rule-compliant r/HowToMen launch post with four current screenshots and direct Play/site/community links.
- Added the public `/community/` support forum to the assembled Cloudflare Pages output, with discussion categories, Google-authenticated posting, profiles and report submission.
- Replaced the community's popup-only Google sign-in with a same-tab OAuth redirect that returns to the forum. This avoids disappearing blank popups in embedded and mobile browsers while preserving the existing desktop-editor popup and Android native flow.
- Added an owner-only moderator queue for reviewing reports, hiding posts, locking threads, temporary bans and dismissing reports. Moderator authority is enforced by the Worker using the configured verified Google email.
- Prevented generated public handles from revealing Gmail address prefixes, applied one shared anonymous-read rate limit across forum routes, and added explicit report resolution.
- Deployed the forum schema to Cloudflare D1 and the authenticated API to the existing sync Worker; verified the production custom-domain route and owner moderation access in Chrome.

## 1.22.16 - 2026-08-12 (versionCode 12216)

### Store diagnostics

- Delivered the store diagnostic through the native share sheet on Android
  instead of the clipboard. `navigator.clipboard.writeText` needs transient user
  activation, and the copy runs from a 1.2s long-press timer with an awaited
  store round trip after it — the activation is long gone, so the write rejects
  and the clipboard keeps whatever it held before. The owner hit exactly that:
  pasting produced the previous clipboard contents instead of the report.
- The share sheet has no activation requirement and suits the job better, since
  the report has to reach someone else. The clipboard remains the web path and
  the fallback if the sheet is dismissed or unavailable.

## 1.22.15 - 2026-08-12 (versionCode 12215)

### Google Play checkout

- Kept the `kotlinx.coroutines` ServiceLoader names through R8. This is the
  reason no Play sheet ever opened on a release build while every server-side
  check was correct: RevenueCat's SDK is Kotlin and delivers its callbacks
  through `Dispatchers.Main`, which coroutines resolves by reading the resource
  `META-INF/services/kotlinx.coroutines.internal.MainDispatcherFactory` as a
  **literal** string. R8 had renamed that file to `META-INF/services/q4.h0`, so
  the lookup missed and `MissingMainCoroutineDispatcher` stayed in place — every
  main-thread dispatch then throws, and each SDK callback dies where nothing
  reports it. No sheet, no products, no error, no timeout.
- Found by diffing against RevenueCat's own Android sample app, which ships
  exactly these two rules. Their SDK's consumer rules *are* applied here
  (`-keep class com.revenuecat.**` appears in R8's merged configuration), but
  the coroutines ones are not — grepping that configuration for
  `MainDispatcherFactory` returned nothing, so no rule was keeping the names.
- R8 was enabled in 1.21.0 (`8d2fda7`) and no purchase has completed since —
  $0 across 369 customers.
- Verified by comparison of the built bundles rather than by inference: 1.22.14
  contains `META-INF/services/q4.h0`, 1.22.15 contains
  `META-INF/services/kotlinx.coroutines.internal.MainDispatcherFactory`.
- Ruled out along the way, each by measurement rather than argument: product
  identifiers and API key (queried RevenueCat's API with the app's own key —
  `default → pro_lifetime` is served correctly), package name, Amazon store
  selection (`store = if (useAmazon == true) … else Store.PLAY_STORE`, and it is
  never passed), and R8 removing RevenueCat or Play Billing classes.

## 1.22.14 - 2026-08-12 (versionCode 12214)

### Store diagnostics

- Put the long-press store diagnostic on the version line in **Settings**, not
  just About. About opens from exactly one place — the editor's More menu — so
  the one tool built for diagnosing a checkout failure in the field could not be
  found by the person who needed it: "In about? There's settings but I don't see
  about." Settings is the version line people actually find.
- Extracted the hold into `useStoreDiagnosticHold` so both dialogs share one
  implementation rather than copying the timer logic.
- Added regression coverage that holds the version for 1.5s and asserts a report
  reaches the clipboard, with `writeText` stubbed so it needs no clipboard
  permission. It scrolls the version into view first: the version sits at the
  bottom of the dialog's scrolling body, and without that the pointer lands on
  whatever occupies those coordinates — measured as zero pointer events reaching
  the element, which is how this test first failed against working code.

## 1.22.13 - 2026-08-12 (versionCode 12213)

### Dialogs under the navigation bar

- Fixed every dialog being partly hidden behind the Android navigation bar.
  Two Phase 1 testers reported it independently — "the settings page is covered
  by andriod tab" with a screenshot, and "some issues with the settings view and
  scrollbars" — and Settings shows it worst because it is the tallest dialog, so
  its **Done** button was the part covered.
- `targetSdk` 36 means Android 15+ forces edge-to-edge with no native opt-out,
  and `.modal-backdrop` is `inset: 0`, so its 20px padding measured to the
  physical screen edge rather than to anything visible or touchable. A ~48px
  navigation bar ate that gap and 28px of the dialog — measured, not estimated.
  The backdrop now pads by the safe-area insets and `.modal`'s height cap
  subtracts them, so a dialog is centred and capped within the visible area.
- Fixed on the modal shell rather than in Settings, so every current and future
  dialog inherits it — the same reasoning that put the height cap there.
- The insets are read through `--safe-top`/`--safe-bottom` rather than `env()`
  directly. Behaviour is identical, but `env()` cannot be simulated in a
  browser, which is why this class of bug had never been covered by a test.
  Regression coverage now simulates a 48px navigation bar and asserts the
  footer clears it, with a companion assertion that the dialog is pinned to its
  height cap — without which the check passes against the unfixed CSS, because
  a dialog short enough to be centred clears the bar unaided.

## 1.22.12 - 2026-08-11 (versionCode 12212)

### Store diagnostics

- Added a pasteable store diagnostic behind a ~1.5s long-press on the version in
  About. Most people hitting a checkout problem are on a phone nobody will ever
  attach a cable to, and Capacitor does not forward `console.*` to logcat in a
  release build, so this is the only report they can produce. It carries
  offering, package and product identifiers, price strings, currency, product
  type, app version and platform — all already public in the Play listing or
  already rendered on the paywall. It deliberately excludes every auth token,
  the account email, the Google subject and the RevenueCat app user ID, because
  people paste diagnostics into public forums.
- Added env-gated diagnostic build switches, off unless `HD_DEBUG_BUILD=1` is
  set at `cap sync` time. `loggingBehavior: 'production'` is the one that
  matters: Capacitor defaults to `'debug'`, which forwards `console.*` to logcat
  only in debug builds — exactly why the `[pro]` breadcrumbs added in 1.22.10
  produced zero Capacitor/Console lines across two full logcat captures.
  `webContentsDebuggingEnabled` lets `chrome://inspect` attach to the release
  WebView. A plain `npm run android:aab` leaves both off, since shipping them
  would make every user's WebView inspectable by anything with adb access.

### Web checkout

- Showed the launch discount as a struck-through list price. RevenueCat applies
  the 50% offer at checkout, but the web SDK never exposes it — every `discount`
  field in `purchases-js` is excluded from the release type — so the app
  advertised 59.99 and charged 30.00, and the customer only discovered the offer
  on the payment sheet, the one place it cannot persuade anyone to start. A plan
  carries `originalPriceLabel` only when a discount genuinely applies, so the
  strike-through disappears on its own when the offer ends.

### Release identification

- Realigned `package-lock.json`, which "Cut 1.22.11" left at 1.22.10.
- Cut this version so the diagnostic build is identifiable. The three commits
  above landed *after* 1.22.11 was cut without a further bump, so "1.22.11"
  described two different builds — one with the long-press diagnostic and one
  without — and About could not distinguish them. Same ambiguity 1.22.8 was cut
  to remove.

## 1.22.11 - 2026-08-11 (versionCode 12211)

### Account handshake

- Bounded the three native calls in `getGoogleIdToken` at 12s each. A native
  call that never calls back is a promise that never settles rather than an
  error anyone can catch — the same defect class as the unbounded cloud-sync
  fetches fixed in 1.22.10, reached by the same callers behind the same `busy`
  flag. Bounded at the boundary that knows they are native calls, rather than
  relying on every caller to remember.
- Made each half of the account handshake name itself. "Signed in, but cloud
  sync couldn't finish" covered both `linkPurchases` (RevenueCat identify) and
  project sync, which have very different consequences: a failed project sync is
  cosmetic and retries itself, while failed purchase linking means RevenueCat
  never learned who the customer is, affecting the plan list and checkout.
  Reporting them identically sent debugging at the wrong subsystem. `syncNow`
  shared the blind spot and gets the same treatment.

### Checkout errors

- Made the checkout failure name its own cause. "Pro upgrade is not available
  right now" was identical whether the store returned nothing, returned only
  products this app does not sell, or returned the right product with no price.
  Those have completely different fixes, and with device logs unusable in the
  field — Capacitor does not forward `console.*` to logcat in release builds and
  the release WebView is not inspectable — the error message is the only
  diagnostic channel that reaches anyone. Each case now says which it was, in a
  sentence a user can repeat.
- Stopped the slow-purchase toast racing the store lookup. It fired at 12s and
  `STORE_TIMEOUT_MS` is 12s, so a `getOfferings()` call that simply timed out
  announced itself as "Still waiting for the Play Store" — reporting that Play
  was holding a sheet open when Play had never been asked for one.

## 1.22.10 - 2026-08-11 (versionCode 12210)

### Google Play checkout

- Fixed **Unlock Pro** rendering a spinner and ignoring taps, with no Play sheet
  and no timeout. This was never a billing bug. The button was already spinning
  when the sheet opened, before anything had been clicked — which is also why
  nothing ever timed out and why no purchase ever reached RevenueCat.
- `ProUpsellModal` computed `actionBusy = busy || authBusy`, and `authBusy`
  covers **background account sync**, not just sign-in. The button is `disabled`
  while `actionBusy`, so once `authBusy` stuck true the button was inert: no
  purchase was ever started, so Play was never asked to open anything. Sign-in
  now waits on auth; buying and restoring wait on the Pro store.
- `authBusy` stuck because nothing bounded the wait. `signIn`/`syncNow` await
  `Promise.allSettled([...])`, which never settles while any member is pending,
  over cloud-sync `fetch` calls that had no timeout at all. A phone's connection
  does not fail cleanly — a dead cell handoff or a captive portal leaves `fetch`
  pending rather than rejecting — so one stalled request left `busy` true
  forever. Every busy flag already cleared in a `finally`, which is worthless
  against a promise that never settles.
- Bounded all three cloud-sync requests at 15s, aborting the socket rather than
  leaking it, and backstopped the auth store: 20s for background sync, 180s for
  interactive sign-in, because cutting a real Google account picker short is its
  own bug. A timeout resolves null and never rejects, so it can never discard a
  valid account or entitlement.
- Added RevenueCat verbose logging and two purchase breadcrumbs. Play package
  selection is unchanged in behaviour — it was not at fault — but this bug
  survived three sessions of debugging the wrong subsystem while the app emitted
  no diagnostics at all.
- Fixed the Windows release build: `run-gradle` now passes an absolute `gradlew`
  path, since `cmd.exe` does not search the working directory when
  `NoDefaultCurrentDirectoryInExePath` is set.

*(1.22.9 was an internal-testing build only and was never committed; its
`priceString` guard on Play package selection is included here.)*

## 1.22.8 - 2026-08-11 (versionCode 12208)

### Release identification

- Bumped the version so an installed build can be identified with certainty.
  1.22.7 carried the Play checkout fix and its version bump in the same commit,
  which left no way to distinguish a build containing that fix from an earlier
  artefact reporting the same version string. A device showing **1.22.8** in
  About is necessarily built from this tree.
- Restored `package-lock.json` to the release version. It was left at 1.22.6 by
  the previous two bumps, so the three version locations the release procedure
  requires to agree had silently drifted apart.
- No application code changes. Play checkout behaves exactly as in 1.22.7.

## 1.22.7 - 2026-08-10 (versionCode 12207)

### Google Play checkout

- Fixed **Unlock Pro** spinning forever with no purchase ever completing. The
  current RevenueCat offering held only Test Store and Web Billing products, so
  Android was handed a package Play has never heard of: Play opens no sheet and
  never calls back, which is indistinguishable from a hang.
  `firstAvailablePackage` skipped only EMPTY offerings, so a current offering
  full of unsellable products walked straight past it.
- Selected the Play package by product id rather than by position.
  `playPackage()` resolves each plan to its own Play product across all
  offerings and tolerates Play's `id:base-plan` suffix. An absent product now
  reports "not available right now" instead of an unbounded spinner, and it can
  never charge for the wrong tier.
- Kept `pro_unlock` deliberately unsellable. It still grants Pro through the
  entitlement, so earlier buyers and the 497 community codes continue to work,
  but Google will not reprice a product carrying a live promotion; `pro_lifetime`
  is the sellable one-time product.
- Showed the monthly/yearly/lifetime plan grid on Android too, falling back to
  the single button when a store offers only one plan.

### Web sign-in

- Cleared the provider's Google credential on sign-out. `handleGoogleRedirect-
  Callback` wrote that key but nothing removed it, so the site showed "Sign in
  with Google" while localStorage still held an unexpired access and ID token
  for the previous account; `isLoggedIn()` then claimed a session and signing in
  as a different account reused or threw on the stale one.
- Sent `prompt=select_account` so the redirect flow stops silently re-picking
  the already signed-in account, and recovered a tab stranded by a deployment
  instead of dead-ending it.

## 1.22.6 - 2026-08-09 (versionCode 12206)

### Google Play checkout reliability

- Changed the Android activity launch mode from `singleTask` to RevenueCat's
  supported `singleTop` mode. This preserves HomeDesigner while Google Play or
  a banking app temporarily takes over and lets the purchase result return to
  the RevenueCat SDK instead of leaving **Unlock Pro** waiting indefinitely.
- Made Google sign-in a deliberate first step before native checkout. Signed-out
  users now sign in, see the priced **Unlock Pro** action, and explicitly confirm
  the purchase; new entitlements are therefore attached to a stable account for
  cross-device Android and desktop access instead of an anonymous install.
- Upgraded `@revenuecat/purchases-capacitor` from 13.2.1 to 13.4.0, including
  the current RevenueCat Android SDK dependency line.
- Added billing regression checks for the native account gate, account-bound
  restore path and RevenueCat-compatible Android activity mode.
- Made the model and billing test bundles invoke esbuild through Node's
  cross-platform entry point, so the deterministic release suite also runs on
  Windows instead of failing on the Unix-only `.bin/esbuild` launcher.
- Made `npm run android:aab` cross-platform: it now selects the correct Gradle
  wrapper and verifies the bundle ZIP in-process instead of requiring the Unix
  `unzip` command.
- Re-verified the live stores without changing commercial settings: Play lists
  `pro_unlock` as a published one-time product with its backwards-compatible
  purchase option active in 173 regions, and RevenueCat lists the same product
  as a published non-consumable attached to the `Pro` entitlement and Android
  lifetime package.

### Mobile account and support routes

- Added a direct **Community & support** action to Settings. Android opens the
  hosted forum in a supported Custom Tab, while web builds navigate to the
  first-party community page.
- Routed the About-dialog forum link through the same native Custom Tab path
  instead of relying on an Android WebView `target="_blank"` navigation.
- Added an owner-only **Model Studio** action to Settings in addition to the
  existing account and More-menu entries. The client only shows it to the
  configured admin email and the Worker remains the authoritative access check.
- Replaced popup login on the hosted Model Studio with the same mobile-safe,
  full-page Google flow used by the forum. OAuth state now carries a
  nonce-bound, same-origin return path, so mobile login returns to the exact
  forum thread or Model Studio page even when browser storage is not shared
  across the Google hand-off.
- Deployed the updated web shell to Cloudflare Pages production and verified
  both `/community/` and `/app/model-studio/` on the custom domain serve the
  new immutable asset namespace.
- Removed the unused whole-domain Android App Link claim. HomeDesigner had no
  native URL handler, but the claim intercepted Google's `/app/` web callback
  and reopened the Android editor; forum and Model Studio authentication now
  remain in the browser that initiated them.

## 1.22.5 - 2026-08-08 (versionCode 12205)

### Release verification

- Hardened the browser smoke suite for catalogue entries that legitimately
  appear in both Recent/Favourites and their normal category. Native Model
  Studio verification also now checks the implementation without matching
  explanatory comment text.
- Kept the pull-request gate fast and deterministic with typecheck, lint,
  production build, geometry, localization, theme, model, sample and billing
  suites. The browser-based trace and complete 3D suite now run nightly and on demand,
  so software-rendering timing variance cannot hold up releases.

### Pro checkout localization

- Put the six existing plan-selector and purchase-state translations on their
  own dictionary lines in all 12 locales. This makes monthly/yearly units,
  savings, processing and the lifetime-payment explanation visible to the
  static coverage checker; the complete translation check is green again.

### Mobile Model Studio access

- Restored a dependable owner-only route to Model Studio from the mobile
  editor. The signed-in owner now sees **Model Studio** directly in the More
  menu as well as in the account menu, so the horizontally scrolling toolbar
  cannot hide the only entry point.
- Replaced Android WebView `window.open()` with Capacitor Browser and registered
  the native plugin. The hosted HTTPS studio now opens in an Android Custom Tab;
  an older native shell falls back to direct navigation instead of doing
  nothing. The Worker still performs the authoritative owner-token check.

### Touch wall drawing

- Fixed tap-then-drag wall drawing being mistaken for a double-tap when the
  dragged segment began on the previous corner. A moved second gesture no
  longer clears the draft, and Android touch release commits the last visible
  point even when the WebView has already cleared its pointer coordinates.
- Added a development-only draft inspection seam and browser coverage for the
  retained first corner, final release position and completed wall.

### Internal UI research

- Added a UI improvement report based on the current source, tester feedback
  and a read-only Lazyweb reference trial. It prioritises contextual mobile
  selection controls, scalable catalogue search/navigation and deliberate Pro
  plan selection while documenting the already-shipped flows that must not be
  rebuilt.

### Mobile editing controls

- Added context-specific quick actions for selections not covered by the new
  object-anchored selection ring. Stairs can be reversed and doors have direct
  hinge and swing controls; structural selections retain reachable Delete and
  More actions without automatically covering the plan with Properties.
- Quick deletion uses the undo-capable deletion path, and the special dock is
  suppressed whenever the Properties sheet is open.

### Catalogue discovery

- Added controlled catalogue aliases and normalized matching for names,
  categories, object types, placement and approved cloud search terms while
  preserving the newer Free-only filter. Common searches such as television,
  media unit, wall-mounted TV, bedside tables and refrigerator now resolve the
  intended existing objects without creating new categories.
- Added a live result count and useful empty-state actions to clear filters or
  switch between Room and Type browsing. Remote search terms are length- and
  character-validated before entering the catalogue.

### Pro plan selection

- Changed the Pro sheet to separate plan selection from purchase. Users now
  select monthly, yearly or lifetime first and confirm through one CTA that
  names the chosen plan, reducing accidental checkout starts.
- Added exact-price yearly comparisons when RevenueCat supplies compatible
  currency and micro-price data. Misleading savings are omitted when the data
  is incomplete, and lifetime is explicitly described as a one-time payment.
- Preserved independent Restore purchase access and the newer Play timeout,
  reconciliation and resume-recovery implementation from the current branch.

### Placement feedback

- Added a translated confirmation after successful furniture, opening, wall
  and surface placement. The new item remains selected and placement stays
  one-shot, while the confirmation offers both Undo and an explicit Place
  another action.
- Reused the existing history and pending-furniture state, including the
  already-visible placement Cancel control. No second placement state machine
  or automatic repeat mode was introduced.
- Added browser coverage for all five interactive placement paths, explicit
  repeat, exact undo recovery and cleared stale selections.

## 1.22.4 - 2026-08-08 (versionCode 12204)

### Google Play purchase configuration

- Repaired RevenueCat's live Google Play access. Its current service account is
  now Active in Play Console with only the documented account-reading,
  financial-data and order/subscription permissions. RevenueCat reports
  **Valid credentials** for receipt validation and both catalog checks.
- Confirmed Android still sells the Active one-time `pro_unlock` product in 173
  countries. No redundant spinner patch was added here: 1.22.1 and 1.22.2
  already contain the bounded purchase, reconciliation and resume recovery that
  supersede the older local implementation.
- The credential repair is live without an app update. A Play license-tester
  purchase remains the final end-to-end confirmation; real-time developer
  notifications are still a recommended follow-up.

### Text that overflowed its own box (Test Report No. 17)

> *"Easy to understand and clean but I noticed the performance to be smoother in
> 3D than in top-view 2D and sometimes text overflows as in the attached
> screenshot."*

Two separate causes behind the overflow, both measured rather than guessed.

**The draw pill was only ever allowed half the screen.** Eleven overlays centre
themselves with `left: 50%` + `translateX(-50%)`. For an absolutely positioned
box, `left: 50%` makes shrink-to-fit resolve against the space from the 50% mark
to the *right edge* — half the container — and the transform then slides it back
over the other half. It looks centred, but it was never allowed to be more than
half as wide. Harmless while the content is `nowrap`; the moment phones switch
it to `normal`, the hint wraps inside that phantom half-width. Measured on a
412px viewport: the pill capped at 245px and squeezed the hint to **38px across
ten lines** while Finish/Cancel (deliberately `flex: none`) kept full size.
Anchoring both edges and letting auto margins centre it: pill 388px, hint 180px,
**two lines**. Applied to `.draw-affordance` and `.placement-affordance`.

**Room labels rendered underneath the furniture.** The dimension pills were
moved above the furniture layer long ago "so labels stay visible"; the room
name/area labels were left behind in the rooms group. So the plate that exists
precisely to lift a name off whatever is beneath it was itself painted over by
every bed and rug. Labels now render in their own pass after furniture.

While there, the label box had no relationship to the room holding it: a fixed
168px-wide text box, and a plate sized from a `length * fontSize * 0.56`
character-count guess. Measured on the suburban template, **8 of 13 plates hung
over a neighbouring room** — which is the tester's screenshot, "Living R"
printed across "Kitchen & Dining". Now the *plate* is clamped to the room
(padding is added before the clamp, not after), widths come from real
`measureText` via the new `src/lib/textMeasure.ts`, and plate and text derive
from one number so truncation lands exactly at the plate edge.

Fitting long names took three attempts, recorded because two of them were worse:
clamping alone gave "Living Roo"; shrinking the font unconditionally gave
"Sitting ..." at 73% — truncated *and* small, worse than truncated at full size.
What works is wrapping to two lines with a modest shrink. And when even the
longest single word will not fit — a 2.4m hallway at fit-the-plan zoom is 34
screen px — Konva breaks mid-word into "Hal / lwa / y", so the label is dropped
instead. No honest label exists at that zoom; the user can zoom in. Same rule
for the area line, which was rendering "1…".

Not addressed: the 2D-vs-3D performance half of the same report, and dimension
pills can still overlap a room label.

## 1.22.3 - 2026-08-07 (versionCode 12203)

### Size boxes you can actually retype

From MyToDoo's test report, and it is exactly right:

> *"There is a problem with the manual resizing text box. Since there is a
> minimum of 10 and maximum of 500, how do I change 250 to 160? Erasing 250 sets
> the field to 10. I cannot backspace and type 160. Only way is to carefully
> insert the 6 between the 1 and the 0. It should be easier — let the user put
> any number in the field, then add constraints upon validation of the text
> field rather than during the typing."*

Every number box in the properties panel clamped on each keystroke, straight
into the store. Clearing "250" left an empty string, which parses as 0, clamps
to the minimum and rewrites the box to "10" with the caret after the "1" — so
the next keystroke produced "101", not "1". The field was overwriting the user
faster than they could type. Ten fields were affected: wall thickness and
height, furniture width/depth/height/angle, opening width/height/sill, plus the
texture tile size and the background plan scale.

Fixed the way the report asks. While a box has focus it holds exactly what was
typed, unclamped, including empty and half-finished states. Blur or Enter
clamps and commits; Escape abandons the edit. Validation moved, it did not go
away — committing "4" into a 10-500 field still gives 10.

One deliberate exception to "never commit while typing": a value that is
*already* legal commits immediately, so the plan still resizes live as you
type, which is most of the point of the panel. Only out-of-range and mid-typing
states are held back. And an emptied box reverts to the current value on commit
rather than snapping to the minimum — clearing a field and looking away should
not silently resize anything.

The 2D and 3D length editors were already correct (they hold a string and
commit on Enter); this brings the properties panel in line with them.

Seven checks added to `tests/smoke.mjs`, driving the real keyboard against the
real field. Verified by restoring the old clamp-per-keystroke handler, which
fails five of them and reproduces the report exactly: the box shows "10" after
clearing and "101" after typing a single "1".

## 1.22.2 - 2026-08-06 (versionCode 12202)

### Coming back to the app now un-sticks the buy button

Follow-up to 1.22.1. The tester's build was **not** sideloaded, which rules
out the easy explanation and points somewhere more interesting.

Work backwards through the pre-1.22.1 purchase path and only one call could
hang: `configure()` was bounded at 8s and `getOfferings()` at 10s, so the stall
had to be in `purchasePackage()`. That means offerings resolved with a real
package — the product is configured and reachable — Play was asked to open the
billing flow, and no result ever came back.

On a Play-installed build that has two well-known causes, and they share a
shape. The billing sheet takes over the screen, so the app is backgrounded for
it; Android may then destroy the host Activity behind the sheet and the result
callback dies with it (testers very often have "Don't keep activities" on, and
low-memory devices do it unprompted). A PENDING purchase — one whose payment
needs a further step — never calls back at all either. In both cases the
promise the button is waiting on will never settle, and the outcome can only be
learned by asking the store after the user comes back.

The app already re-checked entitlement on resume, for Play promo codes. But
`recheck()` returns early when already Pro, is rate limited to once a minute,
and — the part that mattered — never touched `busy`. So the entitlement could
be found while the button carried on spinning.

`settleStranded()` now runs first on every resume. It no-ops unless a flow is
actually in flight, waits 2.5s in case the real call is about to land (coming
back to the foreground is also what a *successful* purchase looks like a moment
before it resolves), then asks the store directly and frees the button either
way — including when the store is unreachable, because a spinner the user
cannot dismiss is worse than one they can retry. A purchase found this way is
announced once, not twice.

Practical effect: 1.22.1 turned an unbounded hang into a 180-second one. This
turns it into about three seconds, and recovers the purchase if the money moved.

Four fences in `tests/billing.mjs`, each fault-injected: a stranded purchase
stays busy until resume; resume frees it; resume claims a purchase Play never
reported; and resume is a no-op when nothing is in flight. (The first injection
attempt at that last one passed a *second* guard and proved nothing — both
guards had to be removed before the test failed.)

## 1.22.1 - 2026-08-06 (versionCode 12201)

### The Pro buy button could spin forever

Test Report No. 10: *"opening new project, hit the buy subscription button and
it hangs."*

It really did hang — there was no timeout on it, and no way out. Google Play
Billing can leave a promise **pending forever** when its service connection
cannot be established: a sideloaded build, wedged Play Services, no Play
account on the device. The plugin reports that as silence rather than as an
error. `purchasePackage()` was awaited unguarded, so the promise never settled,
`busy` never cleared, and the buy button sat spinning with Restore disabled
beside it. Only "Maybe later" still worked.

It was not just that one call. Of the ten native store calls in `lib/pro.ts`,
only two were bounded — `configure()` and one of the two `getOfferings()`. The
rest could all hang: `getCustomerInfo`, `restorePurchases`, `syncPurchases`,
`logIn`, `logOut`. A hang in `sync()` was quieter but worse in its own way,
because `refresh()` chains `restoreSession()` off its `finally` — so a wedged
billing service also meant Google sign-in silently never restored.

All ten are now bounded. Reads get 12s; anything that opens the Play sheet gets
180s, because a human is typing a password into it and cutting a real purchase
short is the worse failure.

**A timeout is not a failure.** `Promise.race` stops us waiting; it cannot
cancel a transaction Play has already taken. So a purchase that runs out of
time now calls `syncPurchases()` and re-reads ownership before saying anything,
and reports success if the money actually moved. Only if the store still shows
nothing does it surface an error — and that error names Restore.

Three new fences in `tests/billing.mjs`, all verified by fault injection: every
native store call is `withTimeout`-wrapped (checked by walking the real source
and climbing enclosing parens, so it cannot be satisfied by a comment); the
purchase bound is far longer than the read bound; and a timed-out purchase
re-checks entitlement before reporting failure.

### The wait is no longer silent

A 180s bound still means up to three minutes of blank spinner, which would feel
exactly as broken as before. If the sheet has not resolved after 12 seconds the
app now says it is still waiting for the Play Store, so the wait reads as a slow
store rather than a dead app. Translated into all 12 locales.

## 1.22.0 - 2026-08-06 (versionCode 12200)

### A fifth template: "Suburban classic"

The four bundled templates were all compact and European — an open plan, a
modest family house, a studio and a narrow terrace. Not one had a garage, a
utility wing, a formal dining room or a den, so anyone drawing a US/AU/NZ
suburban home started from nothing. This is that shape: 15.6 x 11.5 m, two
storeys, a double garage, and the front-to-back hall with the stairs in it.

Ground floor is a sitting room and living room on the left, the kitchen with a
round table across the back, a hall with the stairs, a formal dining room, a
laundry-to-den utility wing, and the garage filling the right third. Upstairs
carries a master, a kids' room, a second bedroom, a family bathroom, a home
office and a bonus room, off an L-shaped landing.

Two decisions worth recording:

**The upper storey covers the whole footprint, garage included.** A stepped
profile — bedrooms over the main block, single-storey garage beside it — is the
truer shape, but the app carries exactly one roof and `normalizeRoofs` keeps it
on the top storey. Anything below the top storey is therefore left open to the
sky, and a wing with no roof reads as a bug rather than as a design. The garage
gets a bonus room over it instead, and the house gets a roof that closes. (The
underlying limitation is still worth fixing — it applies to any single-storey
wing a user draws, not just this template.)

**The landing is L-shaped**, a stair hall plus a corridor running east. With a
rectangular landing the garage wing met it at a single point and the whole east
side of the upper floor was unreachable — the kind of defect a plan looks fine
with until you try to walk it.

Also: the kitchen floor takes the checkerboard from the material library via a
room texture override, since the checker ships there and not in the (much
shorter) floor list.

### Seating that faces what it is pulled up to

Every chair in the new template was placed backwards on the first pass, and the
sample suite could not see it: chairs are exempt from the overlap check (they
are meant to tuck under tables) and are not in the back-to-wall set. Caught by
rendering the plan and looking at it. Twenty-three rotations corrected across
dining chairs, desk chairs, lounge seating and patio chairs.

## 1.21.2 - 2026-08-05 (versionCode 12102)

Two reports from Ron on 1.21.0.

### A Play promo code redeemed while the app was closed is now recognised

*"The pro code is marked OK in the Play Store but the app does not seem to
recognize it."*

1.18.0 added a `syncPurchases()` re-check so a code redeemed in the Play Store
would be picked up — but wired it **only to resume** (`recheck`). A promo is
usually redeemed with the app closed, and the next thing that happens is a
**cold launch**, where `refresh()` is the only entitlement path. That called
`getCustomerInfo()` alone, which cannot see a purchase Play was never asked
about. So the exact flow the feature was built for was the one it missed.

`refresh()` now syncs too, on native, when not already entitled. The result is
OR'd into the existing check rather than short-circuiting, so the price and plan
lookups still run for the upsell.

**Workaround on any earlier build:** Settings → Restore purchase. That has always
called `restorePurchases()`, which does sync with Play.

### The "3D unavailable" screen is no longer a dead end

*"3D view isn't available on this device — it needs WebGL…"*

The probe is honest: after a GPU process dies, the WebView really cannot hand out
a context. `isWebGLAvailable()` caches only success and retries on every call, so
it self-heals — but nothing re-rendered that branch, leaving a permanent dead end
until the app was restarted.

There is now a **Try again** button, and the copy no longer claims the device is
incapable ("isn't available right now… this is often temporary") since on a Pixel
10 Pro that is plainly untrue.

This does not fix the underlying GPU failure, which is still undiagnosed.

### The i18n scanner was missing every string with an apostrophe

Adding these strings surfaced a hole in `tests/i18n.mjs`: it matched only
**single-quoted** `t('…')` calls. Any string containing an apostrophe has to be
written in double quotes, so all of them were silently exempt from the
12-language coverage check.

Six were hiding — all user-facing error copy, four of them already shipping in
English to every non-English user:

- "Couldn't delete cloud backups — try again when you're online."
- "Signed in, but cloud sync couldn't finish. We'll retry when you're online."
- "Sync couldn't finish. Check your connection and try again."
- "Couldn't load that image."
- "Copy this floor's walls onto a new storey"

The scanner now reads both quote styles, and all six are translated.

## 1.21.1 - 2026-08-04 (versionCode 12101)

### Revert edge-to-edge — the status bar overlapped the toolbar

1.21.0 removed `setOverlaysWebView({ overlay: false })` and
`setBackgroundColor()` on Play's advice that they are deprecated under Android
15. On a real device in portrait the toolbar then drew **underneath** the clock,
signal and battery icons.

The cause is exactly what the original code comment warned about and I dismissed
as obsolete: that device does not populate `env(safe-area-inset-top)`. With the
bar no longer reserved, `padding-top: env(safe-area-inset-top)` resolves to `0`,
so the top row sits at y=0 with the status bar painted over it. The comment
named the failure and the reasoning still held — `viewport-fit=cover` and the
`.app` padding do not help when the inset itself never arrives.

Reverted: the status bar is reserved and coloured again, and `.app` owns the top
inset rather than `.toolbar` / `.ps-head` stretching behind the bar.

This reinstates the Play Console advisory about `Window.setStatusBarColor`. That
is the deliberate trade — an advisory is not a policy violation, and a broken
portrait layout for real users is worse. `tests/theme.mjs` now asserts the
*opposite* of what Play asks for, with the reason recorded, so the warning
cannot be "fixed" again without a device proving the inset actually arrives.

**R8 is kept.** Only the edge-to-edge half was reverted; minification was fine.

## 1.21.0 - 2026-08-04 (versionCode 12100)

Play Console advisories against 11800. None were blocking — recommendations, not
policy violations — but two were worth acting on. **This ships alone**, with no
feature work stacked on top, because neither change can be verified without real
hardware.

### Edge-to-edge, and the deprecated status-bar calls

`targetSdkVersion` is already **36**, so edge-to-edge was never optional — it has
been forced since that bump. The web layer was largely ready: `viewport-fit=cover`
in `index.html`, 36 `env(safe-area-inset-*)` uses, and `.app` padding all four
insets with a comment already naming Android 15.

What contradicted it was `src/lib/theme.ts`:

- `setOverlaysWebView({ overlay: false })` asked the framework to **reserve** the
  status bar — precisely the behaviour Android 15 removed. Ignored on SDK 35+.
- `setBackgroundColor()` calls `Window.setStatusBarColor`, one of the deprecated
  APIs Play named. A no-op on Android 15+.

Both are gone. **`setStyle` stays** — it is not deprecated, it maps to
`WindowInsetsControllerCompat.setAppearanceLight*Bars`, and it is what keeps the
clock and battery legible against our chrome.

Those two calls existed for a Samsung Android 9 device that drew edge-to-edge
without populating `env(safe-area-inset-top)`. That predates both
`viewport-fit=cover` and the safe-area padding, so the reasoning no longer holds.

**The status bar is now painted by the app's own chrome.** Without that it would
have regressed in one theme only: `.app` carries `var(--bg)`, so behind the
status bar the light theme would show `#eef0ee` above a white `#ffffff` toolbar —
a visible grey band. Dark mode would have looked untouched, because `--bg` there
is `#0a0d14`, byte-identical to the colour previously pushed natively. The top
inset therefore moved off `.app` and onto `.toolbar` and `.ps-head`, which extend
their own surface upward — what a native app does.

### R8 is on

`minifyEnabled true`, with keep rules where R8 cannot see the reference:
Capacitor resolves plugin classes **by name** from `capacitor.plugins.json`, so
nothing in the compiled code points at them and they would be stripped.

`shrinkResources` is deliberately **left off**. It is a separate lever with its
own failure mode, and stacking two build-level changes into a release that cannot
be verified here would make any crash report impossible to attribute.

No keeps were added for RevenueCat, social-login or app-update. Those ship
consumer rules that R8 applies automatically; pre-emptive keeps would mask a real
gap and partly defeat the optimisation.

### Not addressed

The `androidbrowserhelper` deprecation warnings come from a third-party plugin.
The app calls none of those APIs, so there is nothing to fix on our side short of
a plugin bump with its own regression risk.

### Testing, and its limits

**The automated suite cannot prove either change.** Playwright has no status bar,
and R8 failures are runtime-only in a release build. What it does pin is the
contract, in `tests/theme.mjs`: `theme.ts` must not reference the two deprecated
calls and must keep `setStyle`; `.app` must not carry the top inset while
`.toolbar` and `.ps-head` must; and the R8 keep rules must be present.

All ten were fault-injected — restoring `setBackgroundColor`, letting the inset
drift back onto `.app`, and deleting the Capacitor keep rule each fail the right
assertion.

One of those checks initially failed against correct code: `theme.ts` names both
deprecated calls in the comment explaining why they were removed, and the regex
read the mention as a call. It now strips comments first, the same way the i18n
scanner does for the same reason.

Device verification is the tester's job this release: launch, place furniture,
**the purchase and restore flow** (RevenueCat is the most reflection-heavy
dependency and the likeliest R8 casualty), Google sign-in, an update check, and
the status bar in both themes with gesture and 3-button navigation.

## 1.20.0 - 2026-08-04 (versionCode 12000)

Test Report No. 6, three asks: *"they need to be scaled proportionally from all
sides, the rotate no only in cross way, make it so i can rotate how i want.
Lastly the Undo button when you delete something is ontop of the menu, so i cant
select my objects again until i close it."*

### Resizing keeps an object's shape

Dragging a corner used to derive width and depth **independently** — there was
no ratio term anywhere in `resizeBox` — so a sofa dragged sideways came out flat.
It also pinned the diagonally-opposite corner, so the piece slid across the plan
while you resized it.

Corners now scale uniformly about the object's **centre**, so the shape is
preserved and it stays where it is. Height scales with the footprint: without
that, a "bigger" sofa was wider but the same height and read wrong the moment you
switched to 3D.

The scale factor is the pointer's projection onto the original half-diagonal
rather than the larger of the two axis ratios — projection keeps the corner
tracking your finger, where an axis-max makes the box jump whenever the dominant
axis changes mid-drag.

**Free stretching is still there**, on Shift. That is a change of default: a rug
or a counter run now needs Shift on desktop, or the width/depth inputs in the
properties panel on touch, where there is no modifier key.

### Rotation, on the control you can actually see

Free rotation already existed — the 2D stalk handle has always allowed any angle
with a 15° magnet. But the selection ring's Rotate button was a hard
`+90°`, and on a phone that ring is the loud thing that appears when you tap an
object, while the stalk is a small circle 28 cm above it. So the affordance
people found stepped in quarter turns — literally "cross way".

Rotate is now both: **tap** still steps 90° (the common case, squaring furniture
to a wall), **press and drag** follows your finger to any angle. It reuses the
stalk's `snapAngleTo(deg, 15, 5)`, so the two affordances cannot disagree about
where an angle settles.

Because the ring is shared with 3D, **3D gets free rotation for the first time** —
it previously had no rotation affordance on the object at all.

### The Undo toast no longer sits on the catalog

Measured: the toaster is `z-index: 200` pinned 132 px from the bottom; the
Objects sheet is `z-index: 75` and `58vh` tall. So the toast landed *inside* the
sheet and painted over the grid. `.toast` sets `pointer-events: auto`, so the
chip swallowed taps — and its `onTouchStart` pauses the auto-dismiss, so a
mis-hit both lost the tap and kept the toast up. On a 6-second toast, raised on
every delete.

The toast now rides above an open sheet, so Undo stays reachable and the grid
stays tappable.

### Testing

`editHandles.ts` had **no test coverage at all**. It has 16 assertions now,
covering all four corners, a 37°-rotated box, the minimum-size floor binding on
the *smaller* axis, and dragging back through the centre — plus a fence proving
`resizeBox` still moves the centre, pinning the Shift path as unchanged.

The toast overlap check took three attempts, and fault injection is the only
reason that is known. Sampling one tile missed it (that tile sits at the top of
the sheet). Sampling every visible tile's centre also missed it: the toast is
`width: max-content`, so a short message lands in the gutter *between* the two
grid columns, covering tiles either side while missing both midpoints. Only
rectangle intersection detects it — `visible: 6, covered: 2` with the fix
reverted. The first two versions would have shipped looking like coverage.

## 1.19.0 - 2026-08-03 (versionCode 11900)

Three pieces of beta feedback, each of which turned out to be a bigger hole than
the report suggested.

### Drawing walls on a phone shows you what you are doing

Reported as walls being hard to draw on a phone; the owner asked for
press-drag-release with the endpoint clicking into place near a snap target.

The snapping was never the problem — 2D and 3D already call the *same* engine
(`src/lib/snapping.ts`). The problem was that **`setCursor` was called in exactly
one place, `onMouseMove`**, and Konva routes `touchmove` to a separate event map,
so a finger never reached it. `cursor` stayed `null` forever on touch, and every
piece of live feedback is gated on it. None of this rendered on a phone, though
all of it worked on desktop:

- the rubber band and the live `3.50 m · 90°` readout
- the snap markers (magenta endpoint, green midpoint, blue wall body)
- the dashed inference guide
- the snap haptic

Tap → dot, tap → line, nothing in between. Worse, dragging with a wall tool
*panned the viewport* rather than drawing.

Now: press shows the preview immediately, drag updates it (rAF-coalesced),
release drops the corner and the chain continues. A quick tap still places a
point exactly as before. One finger draws, two fingers pan and zoom. Double-tap
finishes a chain, matching desktop's double-click. The length readout is offset
clear of the fingertip, flipping below it near the top bar.

The gesture decisions live in `src/lib/drawGesture.ts` as pure functions so the
truth tables — which tools claim one finger, when panning survives — are tested
in plain Node rather than being unreachable inside a 2,500-line component.

### An imported plan can finally be moved

One finger cannot both draw and pan over a traced plan, so positioning became its
own mode — and that exposed a hole: `BackgroundPlan` has `x`/`y`, but **nothing
has ever been able to set them**. They were written once at import as `{0, 0}`;
the only controls were an opacity slider, a numeric cm/px field and a rotation
slider. (Relatedly, the plan image is `listening={false}`, so the "drag on the
plan pans" branch of the touch rule was unreachable dead code.)

The **Position plan** tool appears once a plan is loaded. One finger drags it,
two fingers scale and rotate it, and a lock freezes it so a stray tap cannot undo
a careful alignment. Desktop gets drag-to-position too.

The pinch transform is a pure function tested against an independent
reimplementation of how the renderer places an image pixel — asserting the point
under the fingers stays under them through scale, through rotation, through both,
and from an already-rotated plan. The renderer rotates about the image's
top-left, so the origin has to travel around the pinch centre too; omitting that
is the classic way to get this wrong, and the rotation cases catch it.

### Pro items say so before you tap them

Reported: *"the user has no idea it is a paid feature, only after clicking on it.
User has to manually click through every single furniture to check if it's a free
or paid one."*

The catalog did have a marker — a 10px padlock — but a padlock **also** means
"locked in place" on placed furniture, so one glyph carried two meanings and read
as neither. Locked tiles now say **PRO**, reusing the corner tag the openings
flyout already used rather than adding a sixth Pro style.

57 of the 96 bundled objects are Pro, so a **Free** chip now filters the grid to
what can actually be placed. It retires on purchase, and buying while standing on
it falls back to All rather than stranding you on a filter that no longer exists.

The templates half of the report was exactly right: the projects screen had no
Pro marker anywhere. Its gate is **count-based** — the first project is free
whichever template you pick — so the badge is derived from the same expression as
the gate. A static badge would tell a new user their free first project costs
money, which is worse than the silence it replaced.

Cloud objects default to Pro unless a manifest opts out, so the sidebar now says
so instead of advertising a count of objects that cannot be placed.

### Testing

Drawing had **no gesture-level coverage at all** — the existing "a fence run can
be drawn" called `addWall` on the store directly. This release adds the first,
driving real touch sequences.

`tests/i18n.mjs` gained a fix for a genuine blind spot: the category chips render
`t(value)` over a runtime list, so the scanner could not see those keys. The new
Free chip would have shipped as English in all 12 languages with the suite fully
green. Category names are now resolved from the catalog data and required
explicitly.

## 1.18.1 - 2026-08-02 (versionCode 11801)

From beta test report 5/15 (LiberTag, French locale). Two reported problems and
one reported "missing feature" that turned out to be the same bug as the second.

### Dialogs no longer get clipped off the screen with no way to scroll

*"The page for idea is static, no scroll."*

Measured on a 390×844 phone: the tips panel rendered **923px tall in an 844px
viewport**, with `max-height: none` and a `.modal-body` of `overflow-y: visible`.
The backdrop is `position: fixed` and centres its child, so **40px was cut off
the top and 40px off the bottom, and neither was reachable** — no scrolling, no
dragging, nothing.

Only `.settings` and `.shopping-list` had ever set a height cap, each with its
own copy of the rule. That cap now lives on the `.modal` shell itself, so About,
Tips, Import, the Pro sheet and the confirm dialog are all fixed at once and no
future dialog can be added without it. The two per-variant copies are gone.

### …which is also why pinch-to-zoom was reported missing

*"Zoom by pinching like pictures."*

Pinch-to-zoom already works — `Canvas2D` has handled two-finger pinch zoom and
pan since long before this report. The reason the tester didn't know is that the
row documenting it, *"Pinch to zoom; drag two fingers to pan the plan"*, is the
**last row of the Editing section** — precisely the content that fell off the
bottom of the unscrollable panel. Their screenshot is clipped mid-sentence on
the first row of that very section. One bug, two symptoms.

No code change was needed for the gesture itself.

### Photo mode no longer runs two 3D renderers at once

*"The app was blocked when I tried photo mode."*

Photo mode covers the whole screen with its **own** WebGL canvas, but the live
3D scene stayed mounted underneath it. Measured: opening photo mode took the
page from **1 canvas / 3 WebGL contexts to 2 canvases / 6**. Two full renderers
— each with its own shadow maps and post-processing chain, one of them a path
tracer — on a phone GPU.

The 3D scene is now released while photo mode is open, so only one heavy
renderer is ever live; it remounts from cache when photo mode closes. Verified
end to end: 1 canvas before, 1 during, 1 after, with the scene back.

This is very likely the same resource exhaustion behind the "renders briefly,
then goes blank" report fixed defensively in 1.18.0 — that release recovered
from a dropped context, this one removes a large cause of the drop.

### Testing

`tests/smoke.mjs` now walks every dialog reachable from the phone overflow menu
at 390×740 — deliberately shorter than a real phone, so a dialog that only just
fits today is still caught when a string grows — and asserts each one is fully
on screen and scrolls if its content overflows. Verified by reverting the fix:
the suite fails, and not only on the new checks — an existing check breaks too,
with Playwright reporting the dialog's button as *"outside of the viewport"*.

### Known, not fixed here

Photo mode's own UI is still hard-coded English (`Photo mode`, `Dollhouse`,
`Close`, `Save photo`, and both hint lines) while the rest of the app is
translated into 12 languages. The reporter is a French user, so they met an
otherwise-localised app that switches to English on this screen.

## 1.18.0 - 2026-08-02 (versionCode 11800)

### The 3D view no longer dies permanently

Reported from the field (Pixel 10 Pro): *"It briefly shows the 3D rendering and
then the screen gets blank."*

**Root cause: there was no `webglcontextlost` handler anywhere in `src/`.** The
browser fires that event when the OS reclaims the GPU context — thermal
pressure, a background app, the compositor dropping a surface. The event's
default action is to make the loss **permanent**: unless a listener calls
`event.preventDefault()`, the browser never fires `webglcontextrestored` and the
canvas stays a blank rectangle for the rest of the process. Reloading the page
was the only way out, and nothing in the app told the user that.

`ContextLossGuard` in `src/components/Viewer3D/Scene3D.tsx` now:

- calls `preventDefault()` on `webglcontextlost`, which is the single line that
  turns an unrecoverable blank screen into a recoverable one;
- unmounts the `<Canvas>` while the context is gone, so three.js is not left
  issuing draw calls against a dead context;
- shows a `.gl-lost` panel explaining what happened, with a **Reload 3D** button
  that remounts the canvas on a fresh key — no app restart;
- invalidates on `webglcontextrestored` so the demand-render loop draws again
  when the browser hands the context back on its own.

`tests/smoke.mjs` drives this for real via the `WEBGL_lose_context` extension:
it kills the context, asserts the user is told rather than shown a black
rectangle, clicks Reload, and asserts the scene comes back.

### Play promo codes are picked up without restarting the app

Google grants a promo-code redemption to the **Play account**, not to the app:
the user leaves, redeems in the Play Store, and comes back. Nothing pushes that
to us, and the entitlement was only ever resolved at startup — so a redeemed
code did nothing until the app was force-quit and relaunched.

- `initNative` now reports returns to the foreground (`appStateChange`).
- `useProStore.recheck()` runs on resume: it calls RevenueCat `syncPurchases()`
  (a plain `getCustomerInfo()` cannot see a purchase Play was never asked
  about), then confirms Pro and toasts.
- It **never downgrades**. A flaky read on resume revoking a paid unlock would
  be far worse than a promo code taking one more resume to appear, so `recheck`
  returns early for anyone already Pro and only ever flips the flag upward.
- Rate limited to one check a minute, because resume fires on every screen
  unlock. A failed check (offline) does not burn the limiter.

New `tests/billing.mjs` covers all four rules against an injected provider.
Verified by fault injection: removing the never-downgrade guard, the throttle,
or the `syncPurchases()` call each makes it fail.

### Smaller

- The first-run tip said "Pick a tool **on the left**". The tool dock is hidden
  on phones and moves to the bottom in portrait, so the direction was wrong for
  most of the people reading it. It now just says "Pick a tool to start".
- The purchase-success toast was a raw English string; it is translated now.

## 1.17.2 - 2026-08-01 (versionCode 11702)

### Sample home orientation

Three pieces in the shipped samples had their back to an adjacent wall — a
wardrobe's doors against the wall cannot be opened, and the samples are the
first thing a new user sees.

- `family-house`: the kitchen sink was turned along the north wall instead of
  backing onto it; the chest of drawers upstairs faced its drawers at the wall.
- `city-studio`: a nightstand's back faced away from the west wall its bed is
  against.

`tests/samples.mjs` now checks orientation. "Back" is local -Z in 3D (the bed's
headboard sits at `dz = -d * 0.46`), which is local -Y in plan; `Furniture3D`
rotates by `-rot` about Y, so it lands at `(sin rot, -cos rot)` in world
coordinates. **Only a back pointing away from an adjacent wall fails.** A piece
with its SIDE to the nearest wall is normal — a bed in a corner has a side wall
closer than the wall its headboard is against — so judging by nearest wall alone
would have flagged correct furniture. Verified by reverting a fix and confirming
the check fails.

### What the audit did NOT find

Measured across all four samples, so it is worth recording:

- **Nothing is resized.** No sample overrides a catalogue width or depth, so the
  scaling problems visible in the samples come from the model-fit backlog (the
  16 entries in `KNOWN_UNDERSIZED`, `tests/models.mjs`), not from the sample
  data. Fixing them means curating those models.
- **Density is fine.** No room is over 55% covered; the fullest is a 51% master
  bedroom. Rooms flagged small (a 3.9 m² WC, a 4.4 m² bathroom) are realistic.
- **Tight gaps are mostly intentional.** Of 43 sub-60cm gaps in `open-plan`,
  the tightest are bar stools tucked under an island and a nightstand beside a
  bed. A useful circulation check needs real pathfinding from the entrance,
  not pairwise gaps — not attempted here rather than shipped as noise.

## 1.17.1 - 2026-08-01 (versionCode 11701)

### Tester report No. 3

- **A resized object now scales in the plan, not just in 3D.** Reported on a
  kitchen sink: *"the object seems to correctly scale in 3D view but in 2D view
  it maintains its proportions."* Sprites were contain-fitted to the rendered
  image's aspect, so the drawn size was keyed to the picture rather than the
  footprint — stretching depth alone redrew nothing. Once an object has been
  deliberately reshaped, its footprint is now the truth and the sprite follows
  it. A proportional resize (both sides equally) still contain-fits, because
  the render's aspect is still correct there.
- **Tracing an imported plan now gets drawing assistance.** The tester asked
  for snap-to-grid: *"otherwise it's difficult to tap precisely exactly each
  corner."* Grid snapping is deliberately off under a background — its origin
  and scale have nothing to do with the traced image — but that left a trace
  with no help at all. Near-axis segments are now straightened without
  quantising position, at a **6°** tolerance rather than the 12° used for free
  drawing, so a wall the user clearly meant to be square gets squared while a
  deliberately angled one is left alone.

### Not fixed: wall detection on filled-black plans

The same report shows import detecting **57 walls** from an apartment plan whose
thick walls are solid black, producing unusable output. This is real, but it is
a threshold/vectorisation problem that cannot be tuned responsibly without the
actual image — any change would be guesswork against a plan I cannot see. The
tester's workaround (use it as a plain background and trace over it) is the
right one for now, and the tracing fix above makes that path better.

### Testing

- Eight assertions pin the sprite fit, including that a *proportional* resize is
  not mistaken for a reshape, and that a type with no catalogue entry still
  contain-fits rather than crashing. The maths moved to `src/lib/spriteFit.ts`
  so it is testable without a browser — a first attempt to assert this through
  Konva's node tree needed engine internals and a stale store read, and proved
  nothing.
- Five assertions pin the tracing angle lock, including that 10° is straightened
  when drawing freely but left alone while tracing — that difference is the
  entire point of the separate tolerance.
- Raised one more catalog click to 45s; it sits right after the docked 3D
  catalog mounts a WebGL surface, the same software-GL stall as its neighbours.

## 1.17.0 - 2026-08-01 (versionCode 11700)

### The selection ring now works in 3D too

- Selecting furniture in the 3D view fans the same four actions over the object
  — rotate 90°, duplicate, edit, delete — instead of sliding the full-height
  properties panel across the scene. Both views now behave identically.
- Anchored with drei's `Html` at the object's world position, so it tracks the
  camera as you orbit. `Html` updates its transform imperatively, which is why
  this costs no React render per frame and does not fight the scene's
  demand-render loop. The trade: `Html` cannot clamp to the viewport, so an
  object right at the edge of the view can have part of its fan clipped.
- **The ±45° rotate pill is gone**, replaced by the ring. It was not
  touch-gated, so the ring is not either — gating it would have removed rotate
  from 3D on desktop entirely. Fine rotation and the numeric angle are still in
  the properties panel.
- The 3D auto-open effect is removed. It was the same full-screen panel the
  ring exists to avoid.

### The bottom nav no longer looks like it hides something

A tester: *"position of the bottom navigation is too high… it makes me wonder
if there's anything hidden behind it."* They were reading it correctly. The nav
was a floating pill inset 12px with a 10px gap beneath, so the project list
scrolled visibly through that gap. Nothing was ever unreachable — `.ps-main`
already reserved room — but the gap advertised content passing underneath. It
now spans the full width and sits on the bottom edge, with the safe-area inset
moved into its padding so its own background fills the gesture area.

The editor's Build/Objects/Edit bar is deliberately unchanged: it floats over a
canvas rather than a scrolling list, so nothing passes through its gap.

### Testing

- The 3D ring assertions replace the old rotate-pill ones rather than dropping
  that coverage, and include the same no-overlap check — the geometry is shared,
  and overlapping buttons are invisible in a screenshot in either view.
- A phone-viewport assertion pins the nav to the bottom edge.

## 1.16.0 - 2026-08-01 (versionCode 11600)

### A selection ring instead of a full-screen panel on phones

Selecting an object on a phone slid the properties panel in from the right at
full height — covering the very object you had just selected, so you could not
see the edit you were making. Reported directly by the owner.

- Tapping an object in the 2D plan now fans four round buttons beside it:
  **rotate 90°, duplicate, edit, delete**. The full properties panel opens only
  when Edit is pressed. Desktop is untouched — the sidebar is always visible
  there, so nothing was covering anything.
- The fan flips above or below the object depending on where the room is, and
  the whole cluster shifts on screen as a unit near an edge. Shifting each
  button independently (the first attempt) collapsed the spacing in a corner
  and stacked them on top of each other.
- `RADIUS` and `SPREAD` are load-bearing together: adjacent buttons sit a chord
  of `2·R·sin(step/2)` apart and that has to clear the 44px button. The first
  values gave ~40px against 44px buttons, so Delete sat over Rotate and ate its
  taps. A smoke assertion now fails if any two buttons overlap, because nothing
  about that is visible in a screenshot.
- 3D keeps its existing behaviour: walls and floors open the in-place paint
  popover, and furniture still opens the panel, since there is no
  canvas-anchored ring there yet.

## 1.15.0 - 2026-08-01 (versionCode 11500)

### Tester report: "I often feel like I am fighting with the UI"

- **The wall-length editor could not be dismissed by tapping away.** Its input
  relied on `onBlur`, which never fires on touch: the Konva stage is a
  `<canvas>`, which is not focusable, so tapping it does not move focus. On a
  phone the only way out was the keyboard's Enter — a dead end for anyone who
  opened it by accident. A document-level `pointerdown` now closes it.
- **Taps meant for a door hit the wall instead.** Two causes. The dimension
  label carried 20px of hit slop in every direction, making it a ~40px-wider
  target than it looks — and it sits at the wall midpoint, exactly where a
  centred door is. And the opening hit test was a *circle* of radius
  `width / 2`, while a door is drawn as a rectangle: a circle's edge curves
  away from the rectangle's corners, so taps near the ends of a wide door fell
  through to the wall, while taps well off a narrow one were wrongly claimed.
  The hit area is now the rectangle that is actually drawn, and the label's
  slop is down to 6px. `pickAt` and `hitTest` had the same test written out
  twice and now share `hitsOpening`, so this cannot half-regress.
- **The 3D paint palette stayed open over an unrelated selection.** Tapping
  furniture does not go through `handleSurfaceTap`, so a floor's palette kept
  floating after a chair was selected. It is now anchored to the selection.

### Shared renders lead somewhere

- The free-tier watermark carries `homedesignerapp.com`, and the share sheet
  sends the app name, its tagline and the Play link alongside the image. A
  shared render previously travelled with no name and no link — the cheapest
  organic channel the app has, wasted. Deliberately three lines rather than a
  sentence: the brand has to lead so it is not embedded in a translation key,
  and "made with X" word order is not the same in Japanese or Korean.
- The watermark shrinks to fit rather than clipping now that it is longer.

### Testing

- Six assertions in `tests/geometry.mjs` pin the opening hit area, including
  two that assert the *old* radial test failed the same taps — so the fix
  cannot be quietly reverted.
- `tests/i18n.mjs` now strips comments before scanning. A doc comment
  explaining why `t(...)` composition would be wrong was being read as a real
  call and failed the build for a string no user ever sees.

## 1.14.2 - 2026-08-01 (versionCode 11402)

### Light-mode sweep

Following the tooltip fix in 1.14.1, the rest of the app's native tooltips are
gone too — 68 `title` attributes across 10 components.

- **Tooltips are now a portaled element** (`src/components/TooltipHost.tsx`)
  rather than a CSS `::after`. A pseudo-element cannot escape a scrolling
  ancestor, and both the properties panel and the catalog sidebar scroll — a
  `::after` tooltip inside them would simply never have been seen. One
  delegated listener drives a single fixed-position node, so converting the
  remaining `title` attributes became a safe rename.
- **45 of those elements would have lost their accessible name.** Icon-only
  buttons were relying on `title` for it. Every converted element now carries an
  `aria-label` alongside its `data-tip`; the tooltip host itself is
  `role="presentation"` and is never read out.
- Tooltips are suppressed on touch, where there is no hover to hang them from,
  and dismissed on scroll so one can't float over an element that has moved.

**The rest of the sweep found nothing.** An audit of every literal background in
`index.css` turned up exactly two light values, both on the Google Sign-In
button, which Google's branding requires to stay white. Scrollbars, form
controls and native chrome are already driven by `color-scheme: dark` and the
token set. The tooltip really was the whole of it.

### Testing

- New `tests/theme.mjs` in `npm test` pins the fix: no element may carry both
  `data-tip` and `title`, every `data-tip` must keep an accessible name, no rule
  may paint a light background the dark theme cannot override, and the tooltip
  tokens must exist in both themes. Verified by injecting each fault class and
  confirming the suite fails.
- Smoke coverage hovers a real tool and measures the tooltip's actual contrast
  against its own background, asserting WCAG AA. The previous chip scored about
  1.0:1 — white on near-white.

## 1.14.1 - 2026-08-01 (versionCode 11401)

### Beta tester reports

- **43 UI strings were never translated.** A French tester saw "Tap a wall to
  place Passage ouvert" — an English sentence wrapped around a translated item
  name. `t()` falls back to English silently by design, so strings added to a
  component after the last translation pass stayed English forever and nothing
  complained. All 43 are now translated in all 12 locales, and `tests/i18n.mjs`
  joins `npm test`: it walks every `t('…')` literal in the sources and fails if
  any locale is missing one, so this cannot accumulate again.
- **"Show intro again" did nothing.** `CoachMarks` renders only in the editor's
  2D view, and every step it anchors to exists nowhere else — but the button is
  reachable from the projects screen, where the early `return` at `App.tsx:396`
  means nothing renders it. It now switches to the editor and to 2D first.
- **Tooltips looked light on a dark app.** The dock buttons carried BOTH a
  `data-tip` and a native `title`, so Chrome drew its own tooltip — which
  follows the browser's theme, not the page's, and `color-scheme: dark` cannot
  reach it — on top of the styled one. Worse, the styled tooltip used
  `background: var(--text)` with `color: #fff`, which in the dark theme is
  white on near-white. Tooltips now use dedicated `--tip-*` tokens that are
  legible in both themes, the duplicate `title` attributes are gone, and the
  toolbar's native tooltips were converted too (keeping `aria-label` for the
  accessible name). Tooltips are suppressed on touch, where they have no hover
  to hang from.
- **Localised labels overflowed their buttons.** "Terminer" spilled outside the
  Finish pill and "Dessiner des murs" outside its bottom tab. The finish/cancel
  buttons never shrink now, and the tab labels truncate instead of overflowing.
- **The measure tool gave no feedback on the first tap.** Its rubber band needs
  a hover cursor to draw, and touch has none — so on a phone the first point
  produced nothing at all. A marker now holds that point until the second tap.
- **The 3D pan anchor could get lost.** The anchor's drag handler clamps it to
  the design, but OrbitControls' own pan bypassed that clamp, so it could end
  up far off screen with no way back. The clamp now applies continuously, and
  moves the camera by the same delta so the view stops at the boundary rather
  than jumping.

## 1.14.0 - 2026-08-01 (versionCode 11400)

### Planner 5D parity pass

Driven by a competitive session report. Two of the four items it flagged turned
out to be already shipped — live room areas (`Canvas2D`) and the per-tool
instruction bar (`App.tsx`) — so this covers the genuine gaps.

- **Distances from the selected item to the walls it faces.** Selecting a piece
  of furniture now draws a dashed leader and a measurement from each of its four
  sides to the nearest wall. Distances are to the wall FACE, not its centreline,
  because that is what a tape measure reads in the room. Every wall counts,
  including fences and half walls: a ray that ignored a fence would pass through
  a barrier the user can see and report the distance to whatever is behind it.
  Guides appear on selection and not during a drag — furniture dragging runs no
  React state updates on purpose, which is what keeps it smooth on slower
  phones. Follows the existing "show dimensions" toggle.
- **Rotate 90° in the long-press / right-click menu.** The rotate handle needs a
  precise drag, which is awkward with a fingertip; a right-angle step is the
  rotation people actually want when squaring furniture to a wall.
- **"Start with a room" template.** Drops in a 5 × 5 m room, walls and floor
  detected, ready to furnish. "Start from scratch" is untouched for anyone who
  wants an empty page. The whole room is a single undo step rather than five.
- **The save cue is visible on phones again.** It lived inside `.project`, which
  is `display: none` under the phone breakpoint, so the platform that most needs
  the reassurance never saw it. It now sits outside that wrapper and collapses
  to icon-only, keeping its text as an accessible name.

### Testing

- Ten new assertions in `tests/geometry.mjs` cover the distance maths: face
  offsets, the rotation convention, off-centre items, flush-to-wall items, and
  a fence correctly blocking a ray. The measurement logic lives in
  `src/lib/distanceGuides.ts` so it is testable without a browser — a sign error
  in the ray/segment solve silently rejects every real hit, and a wrong rotation
  convention aims the rays at the wrong walls, neither of which surfaces as an
  error.
- Smoke coverage for the starter room (four walls, one room, single undo), the
  new menu item, and the phone-viewport save cue.
- Raised one catalog click timeout from 30s to 45s to match its neighbours. It
  lands right after the WebGL preview opens, and that compile stall timed the
  click out in 3 of 4 runs on a loaded machine.

## 1.13.0 - 2026-07-31 (versionCode 11300)

### Model Studio fills its own catalogue card

- The publish card is written by an assistant on the sync Worker instead of a
  client-side keyword guess. The old `suggestedMetadata` only recognised sofas,
  chairs and TVs, so everything else fell through to `Living / box /
  100x60x90` — a generated shower cubicle landed as a Living-room box at 100
  wide and 90 tall. The new `POST /v1/admin/models/jobs/:id/metadata` endpoint
  runs Workers AI (same Cloudflare account as R2 — no extra key) and returns a
  name, slug, category, renderer shape, real-world size, colour, icon and
  placement, all re-validated against the same allow-lists `publishModel`
  enforces so a hallucinated category or a 90-metre wardrobe can never reach
  the manifest. It runs automatically the moment the mesh is measured.
- The Catalogue-details step is now the two decisions that are actually the
  owner's: **New item** or **Replace an existing item**, and when replacing,
  which item. Everything else shows as a one-line summary with every field
  still editable under an Advanced disclosure. Replacing an item locks the
  fields the manifest does not carry, so it is clear that an override inherits
  the established item's name and box.

### `height` model fit, and a client-side correction layer

- New `'height'` fit scales a model by `height / size.y` instead of its
  footprint. This is the fix for models whose bounding box is inflated by
  geometry with no real footprint: the floor lamp measures 0.75 x 0.94 x 0.19
  because a power cable lies across the floor, so `contain` drew a 160cm lamp
  at **44cm**. Accepted by the renderer, the remote-catalogue validator, the
  Worker and the Studio's Fit selector.
- Added `MODEL_CORRECTIONS`, which wins over a cloud catalogue definition. A
  published model with wrong yaw or fit previously needed a manifest republish;
  it can now be fixed by an app release. `MODEL_YAW`/`MODEL_FIT` could not do
  this — they are only consulted for types that have a bundled GLB, which is
  why the 1.12.2 bathtub yaw entry never took effect. Corrects `floor_lamp`
  (height fit) and `bathtub` (quarter turn, 24cm → 55cm).
- Bundled `plant`, `large_plant`, `clay_planter`, `tree_stump` and `desk_lamp`
  switched to height fit: their catalogue box is the pot or the base while the
  mesh spans the whole leaf spread or lamp arm, so the footprint fit shrank
  each object to fit its own overhang — the plant drew 36cm against 120cm.
- Model Studio now predicts the height the renderer will draw and warns before
  publishing, either that the footprint fit is crushing the model or that a
  height fit spreads it past its footprint.

### Testing

- `tests/models.mjs` joined `npm test`. It measures every bundled GLB's
  world-space bounding box straight from the glTF JSON chunk and reproduces the
  renderer's fit arithmetic. Sixteen models still draw short and are recorded
  in `KNOWN_UNDERSIZED` with the reason; the suite fails on any *new* one, and
  also fails if a listed model starts drawing correctly, so the backlog cannot
  rot in either direction.

## 1.12.1 - 2026-07-29 (versionCode 11201)

### Private Model Studio and render-quality models

- Corrected the proportion-audit regression that made chairs oversized and
  beds/baths undersized. Proportional `contain` fitting again uses the plan
  footprint rather than catalogue height, and generated overrides retain the
  established catalogue dimensions instead of stretching to replacement-GLB
  bounds. Saves that briefly received the bad chair/TV/barbecue defaults are
  repaired on load without touching manually resized furniture.
- Existing-item publishing in Model Studio now always uses proportional
  `contain` fitting. The four standalone generated models retain their audited
  axis, yaw and exact-dimension corrections. Deployed Pages
  `https://35f8c6ac.homedesignerapp.pages.dev` with asset namespace
  `20260729211531965` and republished the corrected no-cache R2 manifest.

- Audited all seven unique published Model Studio GLBs against their actual
  world-space bounding boxes. Corrected the TV/media unit (`210×58×148`), wall
  TV (`200×17×97`), six-seat dining set (`185×140×84`) and Japandi table
  (`185×152×69`, 90° yaw), plus the dining-chair, TV and barbecue overrides.
  Exact old defaults migrate to the corrected sizes without changing objects a
  user has already resized manually.
- Model Studio optimization now measures the source GLB, detects when its long
  side is authored on Z, and automatically matches depth, height and yaw to the
  model's real proportions while keeping the intended catalogue width. Future
  publishes therefore arrive in-app at the reviewed shape instead of being
  stretched from guessed metadata.
- Deployed Pages `https://19a97ba4.homedesignerapp.pages.dev` with asset
  namespace `20260729210522397`; the live manifest reports four generated
  entries and four generated overrides using proportion-matched exact fitting.

- Fixed generated-model sizing so AI GLBs honor the catalogue width, depth and
  height exactly, including quarter-turn yaw axis mapping. Existing wall-TV
  saves with the original swapped footprint migrate automatically.
- Model Studio now defaults generated models to exact-dimension fitting,
  recognizes wall-mounted TV prompts, and publishes explicit floor, surface or
  wall placement metadata plus wall mounting height.
- Wall-mounted objects now snap to the tapped wall and its direction in 2D and
  3D. Small décor, cushions, lamps and monitors snap onto the highest furniture
  surface beneath the placement point.
- Furniture/opening placement is one-shot: after a successful placement the
  object is selected and the editor returns to Select, preventing accidental
  duplicate items. Mobile selection now has a prominent floating delete button.
- Restored the Google account/avatar menu in the desktop editor toolbar.
- Corrected the live wall-mounted TV catalogue entry to `200 × 10 × 100 cm`,
  exact fit and a 90° model-axis correction. Deployed Cloudflare Worker version
  `b18278b5-c0df-4b99-8154-b29e2a797c3f` and Pages deployment
  `https://d6280e3e.homedesignerapp.pages.dev` (asset namespace
  `20260729202820875`).

- Added the owner-only Model Studio at `/app/model-studio/`, authenticated with
  the existing Google account and backed by private Cloudflare Worker routes.
  It supports text-first Hunyuan Pro generation, local GLB inspection, dual
  mobile/render optimization, catalogue metadata and approval-gated publishing.
- Added separate interactive and render model URLs. Normal 3D editing keeps the
  lightweight mobile asset while Photo Mode explicitly requests the HD render
  asset from Cloudflare R2.
- Deployed Worker version `9ab52457-f2c0-474c-88ee-e587184d6ef9` with private
  Fal/admin secrets and verified unauthenticated model administration returns
  `401 Unauthorized`.
- Added a dedicated static Model Studio entry page and changed `/app/` HTML to
  `Cache-Control: no-store`, while retaining one-year immutable caching only
  for fingerprinted assets. This fixes the white screen and Google callback
  failure caused by a cached HTML shell referencing retired JavaScript chunks.
- Completed live owner Google sign-in in Model Studio and confirmed the normal
  web app shows the linked owner account, Sync now and Sign out controls.
- Added an owner-only **Model Studio** item to the signed-in Account menu. It is
  visible only for `nathanjoppich@gmail.com`; Android opens the secure hosted
  studio externally while desktop routes directly to its dedicated page.
- Model Studio job records, reference images and copied generated GLBs have no
  automatic expiry in R2. The current Recent drafts panel lists the newest 40;
  older records remain stored until an explicit future cleanup policy.
- Fixed Model Studio being clipped by the app shell's global `overflow: hidden`:
  it now owns a full-height momentum-scrolling viewport, exposing optimization
  and publishing controls below large 3D previews on desktop and mobile.
- Replaced the ambiguous generation estimate with the actual expected totals:
  `$0.525` for Hunyuan Pro plus the custom 40k mesh, or `$0.675` with PBR.
- Added a curated textured-model selector with **Hunyuan 3D Pro** and
  **Hunyuan 3D Rapid**. Rapid is labelled as the faster/lower-cost choice at
  `$0.225`, or `$0.375` with PBR; Pro remains the detail-first choice. Both
  routes hard-disable their untextured geometry modes in the Worker, validate
  model IDs against a server allowlist and retain exact Fal provenance when a
  reviewed model is published.
- Deployed Worker version `fd35b592-1c39-4405-b383-2dfef4be60cf` and a fresh
  Cloudflare Pages asset set. Verified the production custom domain serves the
  new selector JavaScript as `application/javascript`, avoiding a stale Pages
  fallback response that could otherwise cause another blank Studio screen.
- Built and verified signed Android App Bundle
  `HomeDesigner-1.12.1-11201.aab` (29,638,941 bytes), SHA-256
  `949C5FC331436C3A94DAC31EDA68C9736165A98FE318A16E8B822EBB56758264`,
  signed by the expected Nathan Joppich upload certificate.
- Permanently hardened web deployments against the white-screen cache failure.
  Every build now puts all JavaScript, CSS, WebAssembly and worker assets in a
  unique deployment namespace, including unchanged vendor chunks, so a browser
  with an older poisoned immutable response always receives new URLs.
- Added a real top-level `404.html` to disable Cloudflare Pages' implicit SPA
  fallback for missing assets, plus a build-time assertion that prevents either
  protection from being removed accidentally. Production verification confirmed
  a missing JavaScript URL returns an uncached HTTP 404 instead of landing-page
  HTML, and an already affected Chrome profile loaded the apex app successfully
  without clearing its cache.
- Replaced Model Studio's free-text category and renderer-shape fields with
  dropdowns derived from the categories and shapes already shipped by the app.
  Existing-model replacement also uses a bundled-item dropdown and copies its
  canonical metadata, reducing the chance of publishing an unusable override.
- Enforced the same room-category allowlist in the Cloudflare Worker and remote
  catalogue reader so an outdated or malformed client cannot introduce a new
  top-level catalogue category. Deployed Worker version
  `43dd5a75-5040-4094-b031-618bb3405d6b`.
- Published the supplied generated **Modern TV & Media Unit** as a free Living
  item. Its validated Cloudflare delivery tiers are 886,564 bytes for normal
  editing and 2,277,128 bytes for HD renders; the item also appears in the
  existing Storage type grouping without adding a new UI category.
- Added real model-rendered catalogue thumbnails for the generated TV/media
  unit and dining chair, replacing the stale legacy sprite and generic line
  preview. Cloud entries without an approved thumbnail now use their current
  shape symbol instead of showing a potentially unrelated bundled sprite.
- Extended Model Studio publishing so Fal's generated thumbnail is copied into
  immutable Cloudflare storage and written to future catalogue entries and
  overrides. Deployed Worker version
  `6207dc27-c0ee-4703-8f5f-0d857b059e06`.
- Fixed selected catalogue category chips using a light foreground in dark mode;
  active Room/Type filters now consistently use the app's brand colour.
- Scoped Model Studio's **Existing item** selector to the chosen room category.
  Changing category while replacing a model selects the first valid item in
  that category, preventing mismatched category/item metadata.
- Upgraded all four sample homes through stable cloud overrides for the TV,
  dining chairs, sofa, armchair, double bed, plants, bathtub, dresser and
  nightstands. Stable built-in item IDs remain in the templates, preserving
  offline procedural fallbacks while the online homes use the newer models.

### Internal model production

- Added a secure Fal TRELLIS 2 generation command for review-only furniture
  assets. It accepts a local or hosted reference image, keeps `FAL_KEY` outside
  Git, defaults to 30,000 vertices and a 1024px texture for mobile, and records
  the Fal request ID and reproducibility settings.
- Generated GLBs are automatically optimized with Meshopt and WebP, inspected,
  hashed and placed in an untracked review package. The tool cannot publish to
  R2 or modify the live catalogue, which continues to require reviewed CC0
  provenance until a truthful generated-asset schema is released.
- Added operator documentation for secure key entry, dry runs, paid generation,
  approval checks and cleanup.

### Tester onboarding

- Replaced the embedded Google access-request form with a direct three-step
  Android beta path: join the tester Google Group, opt in on Google Play, then
  install the app from its Play Store listing.
- Kept the landing-page **Request access** buttons as smooth-scroll links to
  those instructions and made it clear that the same Google account must be
  used for all three steps.

### Infrastructure - Cloudflare Pages migration

- Added `npm run build:web` and `scripts/assemble-web.mjs` to produce one
  `site-dist/` artifact containing the public landing page, the production app
  under `/app/`, the privacy page and domain metadata.
- Verified the Cloudflare Pages preview serves the landing page, app bundle,
  version metadata and WebAssembly asset correctly before changing production
  DNS.
- Moved authoritative DNS from GoDaddy to Cloudflare while preserving the
  existing site and DMARC records. The Git-backed `homedesignerapp` Pages
  project now builds the merged default branch automatically, and both the apex
  and `www` production hostnames are Active with SSL.
- Limited the Cloudflare GitHub app to this repository, verified it can build
  the production artifact, and then changed the GitHub repository to private.
  The direct-upload preview remains only as a no-domain recovery path.
- Temporarily returned the repository to public and recreated the GitHub Pages
  custom-domain deployment after a mobile carrier retained the former GoDaddy
  delegation. This preserved a working 200 response on both the stale GitHub
  route and the authoritative Cloudflare route during DNS propagation.
- **The repository is private again.** The former
  `justlinkit1.github.io/Homedesigner-free/privacy.html` address now only
  **301s** to `https://homedesignerapp.com/privacy`, which is itself the
  canonical 200 (`/privacy.html` 308s to it). Verified live.
- Corrected `RELEASING.md` and `docs/PLAY_POLICY_COMPLIANCE.md`, which still
  told you to give the Play Console the `github.io` privacy URL. That URL now
  survives only as a redirect and disappears with the GitHub Pages fallback, so
  a listing carrying it would eventually point Play at nothing. `appInfo.ts`
  already used the canonical address; only the runbooks were stale.
- Documented the hosting move in `docs/WIP_HANDOFF.md` (new section 5b),
  including that the web artifact must be built with `npm run build:web` rather
  than `npm run build`, and flagging that the authenticated sync Worker still
  lists `https://justlinkit1.github.io` in `allowedOrigins` — dead weight once
  the fallback is retired, and left in place deliberately until then.

### Security hardening

- Removed the production web `?pro=1`/localStorage test entitlement and stopped
  trusting browser storage as a source of Pro access. Retired referral grants
  are now Android-only and limited to the known grandfathered campaign code.
- Tightened RevenueCat checks to the exact `Pro` entitlement. The authenticated
  sync Worker now rate-limits reads and writes per verified Google subject,
  omits CORS permission for unknown origins, disables response caching and adds
  `nosniff` protection.
- Added Cloudflare Pages transport, clickjacking, MIME-sniffing, referrer and
  browser-permission headers, immutable caching for fingerprinted app assets,
  and `noindex` on Pages preview hostnames.
- Disabled Android cleartext traffic and automatic app-data backup, explicitly
  excluded local plans/tokens/preferences from cloud and device-transfer backup,
  and limited the app FileProvider to exported Documents and its cache instead
  of all shared external storage.
- Safe patch updates for DOMPurify, PostCSS, tar, Wrangler and Cloudflare types
  leave both production dependencies and the Worker audit clean. The remaining
  root audit findings (9 high, 1 moderate) are confined to build/development
  tooling and require separate major-version upgrades rather than unsafe
  automated downgrades.

Validation is green for TypeScript, lint, the Cloudflare artifact build, Worker
typechecking, all geometry/sample/tracing/browser tests (3D intentionally
skipped in the security run), Capacitor sync and an Android debug build.

## 1.12.0 - 2026-07-28 (versionCode 11200)

### Added — half walls / pony walls

Half walls are now a first-class structural wall rather than a hidden use of
the height field. A dedicated **Draw half wall** tool works in both 2D and 3D,
and any selected solid wall can be converted from Properties. New runs adopt a
105cm worktop/guard height, remain freely height-adjustable, and save in normal
project snapshots without changing existing projects.

They deliberately reuse the real wall pipeline: snapping, exact lengths,
corner editing, room splitting, paint and textures, undo/redo, roof reasoning
and walkthrough collision all continue to work. A dashed centre line identifies
a half wall in the 2D plan, while the existing dark top cap makes its cut top
read correctly in 3D.

Half walls stay visible in dollhouse mode because they are already below the
sight line; fading them removed the very divider the user was trying to inspect.
Doors and windows are rejected on half walls instead of creating floating leaf,
glass or lintel geometry. Switching between full wall, half wall and fence is
mutually exclusive and preserves the existing fence/building rules.

### Fixed — thumbnail export can no longer block 3D navigation

The project-thumbnail capture performed just before switching from 2D to 3D
could throw synchronously when the browser considered any decoded plan image
cross-origin. Because thumbnail generation is only a preview, that exception
must never stop the requested navigation. Capture now fails safely, so entering
3D or returning to the projects screen always continues even if a thumbnail
cannot be generated.

### Localisation and testing

The complete drawing, conversion and validation copy is translated in all 12
non-English locales. Geometry coverage proves half walls remain structural and
do not distort the roof footprint; browser coverage verifies direct creation,
the 105cm default, walkthrough collision, conversion back to a full wall,
snapshot persistence and tool discoverability.

Final release validation is green: TypeScript, lint, production build,
geometry, sample-home, all 47 tracing checks and all 111 browser checks passed.
The signed Android App Bundle is 29,535,577 bytes with SHA-256
`71C23EFC33EB0B21DE4A8A884C6EDEA814808DAA4C5D1CAEB20AB552FFAFFB40` and
was verified against the expected Nathan Joppich upload certificate.

## 1.11.0 - 2026-07-28 (versionCode 11100)

### Added — a faster, more useful furniture catalogue

Catalogue cards now use the app's existing top-down WebP furniture renders
where available, with the lightweight plan symbol retained as a fallback for
procedural and cloud-only objects. Images use native lazy loading and async
decoding, while off-screen catalogue groups keep their existing
`content-visibility` containment. The result is a more recognisable catalogue
without putting a WebGL canvas in every card.

Users can star objects into a persistent **Favourites** row. Favourites stay on
the device, do not enter project JSON or undo history, and work with bundled and
cloud-delivered entries. The new controls and labels are translated in all 12
non-English locales.

### Performance — 3D preview is now genuinely on demand

Selecting an object first opens an instant sprite/symbol preview with its real
dimensions and placement action. Three.js and the interactive preview canvas
are loaded only after **View in 3D** is pressed. This matters most while the main
3D scene is already open: ordinary catalogue browsing no longer creates a
second WebGL context beside the house, avoiding shader/model work and GPU-memory
contention on phones while preserving the rotatable preview when it is wanted.

### Testing

- Browser coverage proves selection creates no catalogue canvas, photoreal
  sprites render, favourites persist and appear as a shortcut row, and the
  interactive preview still opens on request. **102 browser checks** pass with
  zero page errors.
- Geometry, sample-home and 47 plan-tracing checks remain green.
- The three esbuild-backed geometry/trace harnesses now use esbuild's JavaScript
  API and valid file URLs, so the full suite runs on Windows as well as Linux.

## 1.10.1 - 2026-07-28 (versionCode 11001)

### Fixed — sliding doors rendered as a grey slab
Every sliding door and patio slider drew a **solid opaque panel** with the glass
pane nested *inside* it, so the panel hid the glazing completely and the door
read as a flat grey board across the opening.

Rebuilt as an actual slider: a slim metal frame (two stiles, two rails) around
real transmissive glass, two leaves offset in a head-and-sill track, and a pull
handle on each leading stile. You can now see through it to the garden, which is
the entire point of a patio door.

## 1.10.0 - 2026-07-28 (versionCode 11000)

### Added — every sample home now has a garden
All four templates gained real outdoor space, so the 1.7.0-1.9.0 work is visible
the moment someone opens a sample instead of being buried in the catalog.

- **Sunlit open-plan** — rear deck with a bistro set, parasol, barbecue, tree,
  hedging and a picket boundary.
- **Maple family house** — paved terrace plus a lawn: fire pit, sun lounger,
  barbecue, two trees.
- **City studio** — the terrace this plan always needed: a compact deck with
  railings, bistro set, planter and a small tree.
- **Terraced townhouse** — its rear "terrace" was an indoor room all along, with
  a floor slab and a ceiling over it. It is now a real outdoor surface.

### Added — Patio Slider
A 300cm glazed sliding door, and it is **free**. The outdoor areas and most of
the garden set are free, so the way out to them must not be paywalled. Three
samples now open onto their garden through one.

### Fixed — the sample homes had real plan defects
A new pure-geometry suite (`tests/samples.mjs`, wired into `npm test`) checks
every template for things a designer would flag. It found and we fixed:

- **eight blocked doorways** — a sofa across the open-plan threshold, a chest of
  drawers and a vanity clipping bedroom and bathroom doors, a plant in the studio
  entry, a bed and table across the terrace house's rear opening, a wardrobe in
  the dining door, a sideboard in the hall door
- **a WC pan directly behind its own door**
- **a staircase 5cm off a wall** in the family house — you stepped off the bottom
  tread straight into brickwork

### Stair landings
Stairs now must have **1.5m clear at both ends**, asserted for every sample. The
terraced townhouse cannot satisfy this anywhere — its deepest bay is 4.4m and a
2.5m run needs 5.5m to land clear at both ends — so its decorative staircase
(the sample is single-storey; it led nowhere) has been removed rather than
shipped as an unusable stair.

The suite also asserts nothing is buried in a wall, no two solid pieces
interpenetrate, every piece resolves to a catalog entry, and every sample has
both an outdoor area and garden furniture. Legitimate overlaps — chairs tucked
under tables, a lamp on a desk, pillows on a sofa, a stair meeting the door it
serves — are exempt by rule rather than by tolerance fudging.

## 1.9.0 - 2026-07-28 (versionCode 10900)

### Added — the garden set
The Outdoor category goes from **5 entries to 19**. 1.7.0 let you lay a patio and
1.8.0 let you fence it, but there was nothing to put on it — a deck you cannot
furnish is a dead end.

New: **Tree, Small Tree, Hedge, Parasol, Sun Lounger, Barbecue, Fire Pit,
Planter Box, Long Planter, Bistro Set, Garden Chair, Tree Stump Seat, Garden
Lamp, Outdoor Bin, Watering Can, Garden Gnome.**

**Patio Table and Patio Chair were quietly broken and are now fixed.** Neither
had a 3D model at all — they rendered as the generic *indoor* table and chair
primitives, tinted grey-green. They now point at a real bistro set and a real
garden chair.

### Free vs Pro, rebalanced
The free tier now includes **tree, small tree, hedge, planter box, garden chair,
bench and stairs** — enough to plant and furnish a recognisable garden without
paying. Previously Outdoor held five items of which three were locked, so a free
user who laid a deck could place a bench and a staircase. An almost-empty
category that is mostly locked reads as bait, not as an upsell; you only want
the paid set when you can see what you are missing.

### Why the foliage is generated rather than modelled
Photoreal scanned trees cannot ship. The smallest tree on Poly Haven is a 63MB
download that **still weighs 36MB** after the identical quantize + webp pass
every other model goes through — 28x over the per-model budget — because the
cost is leaf *geometry* and no texture setting touches it. Low-poly game trees
fit trivially but render as flat-shaded cartoons beside photoreal furniture.

So trees, hedges, parasols, loungers and barbecues are built in code, with a
procedural leaf and bark texture, at **zero APK cost** — the same approach the
ground surfaces, roofs and fences already use. Canopies are three offset lobes
rather than one sphere, because a single ball reads as a lollipop from every
angle.

The ten remaining pieces are CC0 Poly Haven models fetched by the existing
`fetch-models.mjs` pipeline (~3.8MB total, every one inside the 1.3MB per-model
budget).

### Also
- Both views are covered: 2D gets plan symbols for the five procedural shapes
  and rendered top-down sprites for the ten new models, so nothing falls back to
  a generic box.
- Marking an area outdoor no longer leaves it labelled **"Room 4"** on the plan —
  it becomes "Terrace", unless you have given it a name of your own.
- The garden lamp is built at garden scale (190cm) rather than street scale.
- 17 new strings across all 12 locales.

### Testing
**98 browser checks** (up from 92) and the geometry suite green. The new checks
assert every garden piece places with real dimensions (a type missing from the
catalog silently degrades to a 1x1 box), that a tree is tree-sized, that the
outdoor category is no longer a stub, that a free user can plant and furnish a
garden, and that an outdoor area is never left named "Room N".

## 1.8.0 - 2026-07-28 (versionCode 10800)

### Added — fences, boundaries and deck railings
A new **Fence** tool draws boundary runs, and any existing wall can be turned
into one from Properties. Four styles ship: **Picket**, **Privacy**,
**Post and rail** and **Railing**.

A fence is a flag on a wall rather than a new object type. That is the whole
design: drawing, snapping, dragging corners, exact lengths and gates-as-openings
all work on a fence immediately, because they already worked on walls. What the
flag changes is that a fence leaves the *building*:

- a closed loop of fence **does not become a room** — a fenced garden is not a
  room, and before this it would have been detected as one
- a fence **carries no roof**, and no longer drags the eave outline out over the
  garden with it
- a fence is **never clad** as an exterior face

Each style is built to its own real profile — post spacing, rail heights, slat
width and gap — and adopts a sensible height when you convert a wall, because a
270cm picket fence is absurd. Set your own height and the style stops overriding
it. In the 2D plan a fence draws as a dashed line rather than a solid mitered
body, which is how plans distinguish a boundary from a wall.

Gates come for free: an opening in a fence is simply a gap, and because every
run posts both of its ends, a gate always gets a post on each side instead of a
slat floating in mid-air.

Nine new strings, translated into all 12 locales.

### Performance
Every post, rail and slat of one fence is merged into a single geometry. A 10m
picket fence is ~90 boxes; left as individual meshes that would be 90 draw calls
for one garden edge, which a phone GPU feels immediately. Merged, it is one —
two, counting the infill, which is kept separate so it can be shaded apart from
the frame without a second material on the same buffer.

### Testing
**92 browser checks and 13 new geometry checks.** Fence geometry is generated
rather than drawn, so it is asserted numerically rather than by eyeball: posts
land at both ends of every run, no bay exceeds its profile spacing, the infill
is centred (an off-centre fence reads as a bug even when it is "correct"),
nothing pokes below ground or above the fence height, degenerate runs build
nothing instead of NaN boxes, and post-and-rail has no infill at all. The
browser checks cover the part that matters most: a closed fence loop adds zero
rooms, and the roof outline ignores fences entirely.

## 1.7.0 - 2026-07-27 (versionCode 10700)

### Added — patios, decks, driveways and paths
A room can now be marked as an **outdoor area** (Properties → Outdoor surface).
Outdoor areas reuse the room primitive rather than introducing a new object
type, which means every tool that already works on rooms — drawing, reshaping,
area readout, snapshots — works on a terrace for free.

What the flag changes in 3D: the area is drawn **on the ground** with a
hardscape surface, and it gets **no floor slab beneath and no ceiling above**.
Without those two exclusions a patio rendered as a windowless box.

Five surfaces ship: **Paving, Decking, Gravel, Asphalt and Lawn**. All are
generated procedurally at runtime, so they add **zero bytes** to the APK — the
same approach the ground plane and roofs already use. Indoor flooring, wall
style and texture controls are hidden for outdoor areas, where they mean
nothing.

Decking needed a deliberate departure from physical accuracy. A real 5mm board
gap is sub-pixel at plausible texture resolutions and mipmapping averaged it
into a flat tan smear — the boards were invisible. The gap is drawn wider and
darker, with more tone variation between boards, so the decking reads as
decking at the distance you actually view it from.

All eight new strings are translated into all 12 locales.

### Fixed — a long-press no longer drags the thing you are pressing
Holding an item to open its context menu could also **slide the item ~9cm** out
from under the menu. Konva's `dragDistance` was 8px while our tap slop is 12px,
leaving a 4px band where the two disagreed: the gesture counted as a hold (so
the menu opened) *and* as a drag (so the item moved). The drag threshold is now
tied to the tap slop, so inside the slop nothing moves. Caught by measuring the
item's position across repeated gestures, not by inspection.

### Testing
The browser suite is at **83 checks**, green on three consecutive runs.

The long-press checks were genuinely flaky — failing roughly half the time in
both directions. The cause was test-side, not product-side: the block ran on a
page carrying ~50 prior interactions (drags, a delete/undo, a 3D round-trip,
four 90° plan rotations), and that accumulated stage state intermittently
swallowed the synthetic touch entirely. In a clean page the identical gesture is
deterministic 8/8. The block now runs in its own page, and no longer sits inside
the 3D section, so it also runs with `SMOKE_SKIP_3D=1`. It asserts the menu
appeared at *any* point during the hold rather than at one instant, which also
makes the negative case (a real 40px drag must never open it) stricter.

## 1.6.1 - 2026-07-27 (versionCode 10601)

### Fixed — the Objects catalog could be invisible in desktop 3D
Opening **Objects** in 3D on a desktop-width window could leave the whole
catalog panel rendering off the left edge of the screen — present in the DOM,
completely invisible, no way to pick furniture.

The panel docks by animating `margin-left` from `-281px` to `0`. That
transition could **wedge**: the `CSSTransition` stayed `running` indefinitely,
so the computed margin never left `-281px` and nothing could override it — an
inline `margin-left: 0` was ignored while the stuck transition was in flight.
Verified in a production build: forcing `transition: none` on the same element
resolved it to `0px` and snapped the panel into view immediately.

It was animating a layout-owning property while the WebGL scene drives the main
thread, which is the likely trigger. The transition is gone — the panel docks
instantly. A panel that sometimes never appears is far worse than one that does
not slide. If the animation is ever wanted back it must move to a compositor
property on an inner wrapper, never the margin that owns the layout.

This is also the honest explanation for the long-standing "Side Table" flake in
the browser suite: the test was not badly written, the panel genuinely never
arrived. That check now asserts the panel is actually on screen.

Two knock-on test fixes, both consequences of the panel now working:
- The catalog preview spins up a **second** WebGL context beside the live 3D
  scene and only really renders now that the panel is visible. That is slow
  under software rendering, so its budget went 15s → 30s.
- The 3D section leaves the catalog docked, and with the slide removed the 2D
  canvas resizes instantly — narrow enough that the long-press block's target
  could fall outside the stage. It now leaves furniture mode and re-fits first.

### Groundwork — Phase C (outdoor surfaces)
Inert scaffolding only, nothing user-visible yet: two new procedural outdoor
surfaces (decking, asphalt) alongside the existing grass/gravel/paving — zero
APK bytes, same approach as the Phase A lawn — plus an optional `outdoor` flag
on `Room` and an `OUTDOOR_MATERIALS` set wired into the existing floor-material
lookup so the 2D fill and swatch grid need no special cases. The 3D rendering
rules and the UI to draw patios/decks/driveways come next.

## 1.6.0 - 2026-07-27 (versionCode 10600)

Three things reported after 1.5.0: rotation couldn't be found in 3D, the tour
was too thin, and "Need inspiration?" led somewhere untranslated.

### Fixed — rotate the plan is now reachable in 3D
1.5.0 put whole-plan rotation in Properties. On a phone in 3D that panel sits
behind the **Edit** tab *and* only shows its whole-home controls when nothing is
selected — and tapping anything in 3D selects it. So in practice rotation was
unreachable exactly where people looked for it. It now also sits in the **View**
popover in 3D, beside Dollhouse and Walk through, labelled "Rotate plan".

### Fixed — the Tips panel was English in all 12 languages
The home screen's "Need inspiration? → Explore ideas" button opens the Tips &
shortcuts panel. The banner itself was translated; **the entire panel behind it
was not** — it had no i18n wiring at all, so every non-English user landed on a
wall of English. All of it is now translated: the four section headings and
every tip, in both its pointer and touch wording.

### Improved — a much more thorough first-run tour
The tour was three steps (build tools, 3D, furnish) and stopped at "you can draw
and look at it". It's now **eight**, adding the things people actually struggle
to find: importing a real PDF/DXF/DWG plan and setting its scale, turning walls
into rooms with auto-detect, what selecting something gets you (and what the
no-selection panel offers — cladding, roof, rotate), stacking storeys, and
exporting/rendering/shopping-list. The step text is translated too.

Two bugs surfaced while building it. The tour anchors to live DOM nodes by
selector, and the Import and Export buttons had no stable class — they now do
(`.import-btn`, `.export-btn-wrap`), so those steps can't silently skip. And the
bubble was positioned against a hardcoded 132px height estimate; the richer copy
made several bubbles taller than that, so on a phone they ran off the bottom of
the screen and the Next button became unclickable. Placement now re-clamps
against the bubble's measured height.

The browser suite walks the whole tour end to end in French, which is what
catches both of those — a skipped step or a stranded button fails the run.

## 1.5.0 - 2026-07-27 (versionCode 10500)

Menu and dialog polish — *"in professionally developed apps the UI of the menus
just looks more slick and animated"*.

### Added — dialogs now open and close like dialogs
All seven dialogs (Settings, About, Help, Shopping list, Import, Pro, and the
confirm prompt) hand-rolled the same backdrop/panel markup, and **none of them
animated at all** — they hard-cut in over a blurred scrim and vanished in a
single frame. They now share one `Modal` component that fades the scrim and
lifts the panel in, and reverses it on close.

It also fixes things that had nothing to do with animation and were simply
missing: **Escape now closes a dialog** (not one of them responded to it
before), Tab is trapped inside the panel instead of walking the editor behind
it, focus moves into the dialog on open and returns to whatever opened it on
close, the page behind can no longer scroll under it, and each dialog carries
`role="dialog"`, `aria-modal` and a proper label for screen readers.

### Added — toasts leave, and the stack settles
Dismissing a toast spliced it out of the list, so it disappeared instantly and
every toast above it jumped down by its own height plus the gap. Toasts now
animate out and the survivors glide into their new positions.

### Fixed — popovers jumped instead of growing
The 3D decorate popover and the openings flyout both carry their own transform
to position themselves (`translate(-50%,-100%)` and `translateY(-50%)`). They
shared a keyframe whose first frame replaced `transform` outright, so each one
started life un-positioned and snapped into place. Each now has a keyframe that
scales while keeping its offset.

### Improved — menus
Context menus grow out of the point you actually tapped rather than their own
centre, and flip back over it near a screen edge instead of rendering partly
off-screen (easy to hit on a phone, where you long-press wherever you like).
Menu items fade in a beat behind the panel. Elevation is now a layered
contact + ambient shadow pair rather than one wide blur, which is most of what
makes a menu read as expensive. The mobile drawer scrim fades in step with the
sheet it dims instead of hard-cutting, and the tour bubble glides between steps
rather than teleporting.

Everything honours `prefers-reduced-motion`, and the browser suite runs in that
mode — with separate checks that deliberately leave motion on, so a green suite
cannot be achieved by shipping no animation at all.

### Notes
Motion uses Framer Motion, pinned into its own `motion-vendor` chunk and loaded
through `LazyMotion` so it stays out of the editor's first paint. Measured:
**45.3 kB gzipped in that chunk; the main bundle is unchanged at ~185 kB.**

A planned blanket retiming of all 34 CSS transitions was **dropped**. It broke
the browser suite (the docked 3D catalog click failed three runs in a row where
clean 1.4.0 passed 61/61, and reverting only `index.css` turned it green again),
and it was the lowest-value part of the change — dozens of rules unrelated to
menus. The targeted work above lands instead, at 97 added CSS lines rather than
a whole-file rewrite.

## 1.4.0 - 2026-07-27 (versionCode 10400)

Acting on the Play Console tester reports. Seven testers, no crashes; two of
them named something concrete and both are fixed here.

### Added — rotate the whole floor plan
> *"Is there a way to rotate the full floor plan? Maybe I'm blind? lol"* — Word Guess

Not blind: there was no such feature. Properties → **Plan** (with nothing
selected, beside "Auto-detect rooms" and "Exterior") now has rotate 90° left
and right. It turns walls, rooms, furniture and the traced background plan
about a single pivot taken across **every** storey, so a stack of floors stays
aligned instead of each one spinning about its own centre. Furniture turns with
the building, so a sofa keeps facing the wall it was against. Openings ride
their wall untouched — their position is a fraction along it, not a coordinate.
Right angles are snapped to exact 0/±1 in the rotation, so a 90° turn lands on
whole centimetres; without that, axis-aligned walls come back a hair off-axis
and quietly stop snapping to each other. One undo reverses a whole rotation.

### Fixed — the long-press menu was unreachable on a real phone
> *"I had a hard time deleting an object. On mobile, the most intuitive way for
> me is to tap and hold the object and wait for a pop-up with different options,
> but apparently, it doesn't work that way."* — Mercury

It was supposed to work exactly that way. The gesture was wired up, but the tap
slop was 7px: any finger that wandered further than that during the hold turned
into a pan and cancelled the pending menu. A fingertip *settles* as it flattens
against the glass — it rolls several pixels in the first ~150ms, long before the
500ms long-press timer fires — so on a real phone the hold usually became a pan
and no menu ever appeared. Touch slop is now 12px, which is still comfortably
below a deliberate drag (a 40px drag still pans, asserted in the suite).

This was reproduced before it was fixed: with the old 7px value the smoke check
fails, with 12px it passes.

Also fixed alongside it: `touchcancel` was not handled at all. When Android took
the gesture away mid-hold (system back-swipe, notification shade), the
"long-press already fired" flag stayed set because `touchend` never ran, and the
**next** tap anywhere was silently swallowed. Konva folds DOM `touchcancel` into
its internal pointercancel and never emits a `touchcancel` event of its own, so
this had to be a plain DOM listener.

### Fixed — the context menu was English in all 12 languages
Every label in the 2D right-click / long-press menu (Copy, Paste, Select all,
Bring to front, Send to back, Delete …) was a hardcoded English string. Now
translated, along with the new Plan card — 14 keys × 12 locales.

### Notes on the other reports
Guiterra ("maybe more features before paying mandatory") is about where the
paywall sits, not a defect — a product decision, left alone. Porch Ledger
("polish the UI slightly") gave nothing specific to act on; the menu
localisation above is the one concrete polish item that fell out of it.

## 1.3.1 - 2026-07-26 (versionCode 10301)

The sample homes finally use the features built for them.

### Fixed — every sample was a white box from outside
The samples were authored before roofs and exterior cladding existed, so
switching a template to 3D showed an untextured white box with a flat white
ceiling for a lid — which is the *first thing* a new user sees. Everything
needed to fix that shipped in 1.0.93–1.0.96 and none of it was being used.

Each sample now gets a roof and an exterior suited to what it is: clay-tiled
gable over beige render for the open-plan home, slate gable over red brick for
the family house, a flat roof and grey render for the city studio, grey-tiled
hip over warm brick for the terrace. Cladding is applied only to wall faces
that no room sits against, so interiors stay painted.

### Fixed — a two-storey house rendered as a bungalow
Storeys above the active floor were hidden in *all* orbit views. That cutaway
exists so the slab above doesn't block the floor you're editing — which only
matters when looking INTO the building. With dollhouse off you are looking at
the outside, and hiding the upper storeys put the roof on the ground floor and
dropped the first floor entirely. The cutaway is now dollhouse-only; walk mode
already worked this way for the same reason.

### Fixed — gable ends ignored the cladding
The roof's masonry infill took the plain wall colour, so a brick house had a
beige triangle over its front door. It now uses the finish actually applied to
the exterior faces, texture included.

### Fixed — "Painted Brick" is blue
Measured the average colour of every wall texture against what the catalog
declares. All are darker than declared, but `painted_brick` is a different
*hue*: declared `#d8d2c8` (warm off-white), actually `#779ea9` (teal). The
swatch shows the photo so users always saw blue, but the untextured fallback
colour was wrong. Corrected.

Worth noting the rest drift too — `marble_01` declares `#ece9e4` and measures
`#b09c79`. Those only affect swatch tints and untextured fallbacks, so they are
left alone rather than changed under a "sample quality" release.

## 1.3.0 - 2026-07-26 (versionCode 10300)

The app now tells you when there's a new version.

### Added — update offer on startup
One banner, two mechanisms behind it, because the two builds genuinely update
differently:

- **Android** asks Google Play through the Play In-App Updates API
  (`@capawesome/capacitor-app-update`). Play knows what is published and can
  download the new build in the background while the app stays usable, then swap
  it in — nothing else can offer that, so the native path uses it rather than
  bouncing people to a store listing.
- **Web / desktop** compares the version compiled into the running bundle
  against a new `version.json` emitted beside it at build time. A tab left open
  for a week keeps running whatever bundle it loaded; this is how it finds out.
  Updating is a reload.

Deliberately **not** a service worker. That would add an install/activate
lifecycle and a whole class of stale-cache bugs to an app that currently has
none, to solve a problem a 60-byte JSON file solves.

It checks on startup and again whenever the app comes back to the foreground —
that second one is what catches long-lived tabs and backgrounded phones.
Dismissing remembers **which version** was waved away, so the next release still
asks rather than the prompt going quiet forever.

Every failure path is silent: no network, an offline device, a build sideloaded
rather than installed from Play — all normal, all just mean no prompt.

### Verified
Five assertions in the smoke suite drive the real app against a manifest
claiming a newer release: the banner appears and names the version, dismissing
stops it asking, a *newer* release asks again, and the running version never
prompts. Ten more cover the version comparison itself — including that `1.10.0`
beats `1.9.0` (string comparison says otherwise) and that a malformed manifest
can never nag anyone into a pointless reload.

### Note on the Android path
The Play flow cannot be exercised here — in-app updates only work for a build
installed from the Play Store, against a higher version already published. The
code is written defensively and the signed release builds with the plugin in
place, but the first real test is a Play track with 1.3.0 published above an
installed 1.2.0.

## 1.2.0 - 2026-07-26 (versionCode 10200)

CAD export — the import work pointed the other way.

### Added — Export → DXF for CAD
A layered drawing structured the way an architect's file is structured, since
that is precisely what the last several releases have been learning to read.

**Layers** follow the AIA convention and are prefixed per storey, so a
three-storey house opens with its levels separable:
`L00-A-WALL`, `L00-A-DOOR`, `L00-A-GLAZ`, `L00-A-FURN`, `L00-A-AREA`,
`L00-A-AREA-IDEN`, `L00-A-ANNO-DIMS`, then `L01-…` and so on. Every layer is
declared in the LAYER table with a drafting colour, not just referenced.

**Walls** are drawn as their two FACES with the openings cut out — how CAD
actually represents a wall, rather than as centrelines. The faces run between
the mitred corners so the end caps close on them exactly; drawing them on the
wall axis instead left the caps protruding half a thickness and the plan
measured 10 cm over on a round trip.

**Doors** get a leaf, jambs and a real 90° `ARC` swing. **Windows** get glazing
lines and reveals. **Rooms** get a boundary plus name and area as TEXT.
**Furniture** exports as wireframe plan symbols on `A-FURN` — the same SVG
symbols the 2D canvas already draws, flattened to line work by a new pure
`flattenPath` (M L H V C S Q T A Z, absolute and relative). Doing that without
the DOM keeps the export testable in plain Node and stops a library module
depending on a browser. Overall dimensions go on the annotation layer.

Output is ASCII DXF R12 — the most widely readable interchange format there is,
and every entity is a LINE, ARC or TEXT so nothing can misread it. DWG proper is
a closed binary format with no practical browser-side writer; every CAD
application opens DXF.

### The test that matters
Export, then read it back with our own importer. On the sample home:
**6 walls → 6, 3 rooms → 3, 13 openings → 12**, plan 11.0 × 8.5 m → 11.1 × 8.6 m.
The importer classifies every layer correctly, so the 2,927 furniture segments
and the dimension lines stay out of the walls. Multi-storey round-trips too —
the `L00-`/`L01-` prefixes come back as separate floors.

Size is preserved to within half a wall thickness by design: the importer runs
centrelines out to the outer face at corners so the loops close for room
detection, which measures the outer ring fractionally large.

### Changed — the classifier learned the AIA names
`A-GLAZ` (glazing), `A-FLOR-STRS` (stairs), `A-AREA` and `A-FURN` are now
recognised on import. That was needed to read our own exports back, and it
improves imports from any UK/US practice using the standard.

## 1.1.1 - 2026-07-26 (versionCode 10101)

**Corrects 1.1.0.** That entry justified an indirect approach to openings with a
claim that turns out to be false, and the simple approach — just use the door and
window layers — was the right one all along.

### The claim that was wrong
1.1.0 said a door symbol's raw extent is "roughly twice the real opening"
because of its swing arc. Measured: for a door hinged at x with width w, the
symbol spans exactly x to x+w **along the wall**. The arc's bulge is entirely
PERPENDICULAR to the wall (it reaches 100 cm across for a 90 cm door), and
openings are measured along the wall, so it never inflated anything. There was
never a reason to avoid reading the opening layers directly.

### What was actually broken: two entity types were being ignored
`extractSegments` only handled LINE and (LW)POLYLINE.

- **INSERT** — a reference to a reusable block — was dropped entirely. In one
  measured file *every* door and window is an INSERT on layers named `Doors` and
  `Windows`, so the importer was blind to all of them. Blocks are now expanded in
  place, transformed by the insert's position, rotation and scale, and nested
  blocks are followed. Entities inside a block that sit on layer `0` inherit the
  layer the block was inserted on, which is what makes them classify correctly.
  That file went from **0 openings to 4**, all correctly placed.
- **ARC** was dropped, which is how door swings are drawn. Without it a door
  arrived as two isolated jamb strokes 90 cm apart with nothing between —
  indistinguishable from two separate openings. That, not the swing geometry, is
  what made the symbols hard to group. Arcs and circles are now tessellated.

Both were plain gaps in the DXF reader, and fixing them also feeds walls: a file
that puts its walls in blocks now imports them too.

### Openings now read their layers first
`symbolSpansOnWall` projects each layer's geometry onto the wall it sits in and
takes the extent, which is the opening width. The hole-in-the-wall detector from
1.1.0 is kept, but demoted to a supplement: it adds openings the symbol layers
miss, and carries files that have no opening layers at all, where a gap between
two wall pieces is the only evidence a door exists.

Doors below 60 cm and wall breaks below 55 cm are rejected — measured widths on
the test files were otherwise polluted with 37-51 cm "doors", which are fragments
of symbols too sparse to group. Better to miss one than import a 38 cm doorway.

Measured across the two CAD files: **14 openings**, widths 60-102 cm for doors
and 37-91 cm for windows, each on the right wall.

## 1.1.0 - 2026-07-26 (versionCode 10100)

Doors and windows on CAD import.

### Added — openings come in with the walls
The obvious approach — read the door symbols — was tried and abandoned, and the
reason is worth recording. A door in plan is jambs plus a leaf plus a 90° swing
arc sweeping a door's-width into the room, so its raw extent is roughly twice the
real opening; and its parts only group together reliably when the draughtsman
happened to make them touch. Both problems disappear if you measure the **hole in
the wall** instead, which is data we were already computing and discarding:
`wallCentrelines` bridges breaks in each wall face, and where BOTH faces break at
the same place, that is an opening — located and sized exactly. A break in only
one face is a wall butting in, not a hole, so the two faces' gaps are intersected.

Door widths on the measured file come out at 91, 92, 97 and 101 cm. Holes with no
symbol beside them import as doorless passages rather than being dropped.

Windows needed a second route. Measured on the same file, ArchiCAD cuts the wall
polygon for doors but runs it straight **through** windows, which are drawn as
glazing lines over unbroken wall — so the hole method finds the doors and almost
no windows. A window suits being read from its symbol precisely where a door does
not: its lines run along the opening for its full width, so projecting the parts
that lie inside the wall onto the wall's axis gives a band whose extent is the
opening. `symbolSpansOnWall` does that; doors keep using wall gaps.

Height and sill are not in a 2D plan, so they take sensible defaults (door
205/0 cm, window 120/90 cm) and are editable like any other opening.

### Coverage, honestly
This finds a useful subset, not everything: 9 openings across the three storeys
of the measured file, where the drawing has appreciably more. The ones it finds
are accurate — correct wall, correct position, believable widths — and the rest
can be added by hand. Raising coverage means understanding, per CAD application,
which openings cut the wall and which are drawn over it; the door path is solid,
the window path is a first pass.

### Tests
12 new assertions covering hole discovery (position, width, two holes in one
wall), the guards that keep it honest (a one-sided break is not an opening, an
over-wide gap is the wall ending rather than a hole) and symbol classification
including nearest-symbol-wins.

## 1.0.99 - 2026-07-26 (versionCode 10099)

The centreline fix promised in 1.0.98's "known, not fixed".

### Added — wall centrelines from wall outlines
CAD does not draw a wall as a line down its middle; it draws the wall's two
faces, usually as a closed rectangle per wall. HomeDesigner's model is the
opposite — a wall IS a centreline plus a thickness. Importing faces directly
doubled every wall and left room detection walking the inside of wall rectangles
instead of the rooms, so a 6 × 22 m house reported a 10 m² footprint.

New `src/lib/wallCentrelines.ts` finds pairs of parallel faces that sit a
plausible wall-thickness apart and overlap along their length, and emits the line
between them. Two details matter more than the pairing itself:

- **Corners.** A wall's two faces do not end together: the outer face carries on
  past a junction while the inner one stops at the internal corner. Truncating
  the centreline to their overlap left every corner open by a wall thickness and
  room detection found nothing. Centrelines now run out to the outer face, capped
  at one wall thickness so a long shared face can't drag a wall past its end.
- **Openings.** Faces are broken at every door and window, so runs are merged
  across gaps up to 260 cm before pairing.

Everything happens in a rotated frame per direction cluster, so skewed plans —
which real plots almost always are — work the same as square ones. The
perpendicular distance gives each wall its **real thickness** instead of a flat
default: the measured files now carry walls from 6 cm to 39 cm.

Measured on the architect's three-storey DWG, per floor:

| | walls | rooms | footprint |
|---|---|---|---|
| before | 101 / 121 / 110 | 2 / 1 / 6 | 125 / 87 / 104 m² (shell only) |
| after | 26 / 31 / 11 | 4 / 7 / 5 | 69 / 95 / 100 m² |

### Changed — demolition layers are kept by default
Dropping them punches holes in the shell: those walls are existing fabric that is
physically there. On the measured file the ground floor fell from 4 rooms and a
69 m² footprint to 2 and 49 m². The import dialog now offers a checkbox to leave
them out instead, which gives the proposed rather than the existing state.

### Tests
16 new centreline assertions in `tests/geometry.mjs`: thickness recovery, skewed
walls, a closed wall rectangle collapsing to exactly one wall, a door gap being
bridged, and — the cases that keep this honest — opposite walls of a room NOT
pairing into one fat wall, adjacent walls staying separate, and short strays
being dropped.

### Known
The smoke suite's `Side Table` check is intermittently timing out in this
container (3 failures, 2 clean runs across five attempts, always the same
assertion). It is unrelated to import — the catalog renders a live WebGL preview
per item and Playwright's actionability wait doesn't settle under software
rendering. An attempted fix made it worse and was reverted rather than shipped
unverified.

## 1.0.98 - 2026-07-26 (versionCode 10098)

Plan import, part two — driven by three real plans and three real DWG files
rather than synthetic tests, which is what finally exposed these.

### Fixed — grey-filled walls were being erased
Plenty of architectural software fills walls with mid-GREY rather than black,
which makes the image three-toned: white paper, grey wall fill, black linework.
Otsu's method is a **two**-class algorithm, so it split off the black linework
and handed the grey walls to the background. On a real plan — 12% of pixels grey
wall at luminance 195 — Otsu chose 154 and the walls were simply erased. The
tracer saw only dimension lines and text and returned **zero rooms and no
outline**, which is precisely the reported symptom.

`autoThreshold` now also fits a three-class threshold and cuts above the middle
tone when there is one. That alone is not enough to be safe: grey ROOM fill and
the speckle of a noisy phone photo also look like "a middle tone under a paper
majority", and cutting above those wrecks the trace (caught by the regression
suite, which failed on exactly those two cases). So the middle tone additionally
has to be **shaped** like a wall — a distance transform measures its typical
half-width, and it counts only if that lands between one pixel (speckle) and 5%
of the image's short edge (a filled room). The affected plan goes from 0 rooms /
no outline to 3 rooms / an 82 m² footprint; black-walled plans are untouched.

### Added — CAD imports read the drawing's layers
An architect's DWG is not a picture of a plan, it is a structured drawing where
every entity already says what it is. A real ArchiCAD export measured here:

```
0._ _1_Structure - Murs extérieurs          1._ _2_Structure - Murs extérieurs
0._ _1_2D - Cotations - existant ET nouveau 0._ _1_Intérieur - Escaliers
0._ _1_Portes Archicad                      2._ _3_Toits - Toitures
```

New `src/lib/dxfLayers.ts` classifies layer names (wall / door / window /
dimension / stair / roof / zone / outdoor / annotation, matched in several
languages and tolerant of the mojibake DWG→DXF conversion makes of accents), and
reads the **storey index** out of the layer prefix. The importer now uses only
wall layers, skips demolition layers, and returns one `DxfStorey` per level.
On the measured file: 330 dimension lines, 263 stair lines, 434 window lines and
316 door lines no longer arrive as walls — 715 "walls" became 250 real ones.
Unrecognised layer schemes fall back to the previous behaviour untouched.

### Fixed — CAD imports came in at absurd scale
Model space holds the title block, the elevations and every storey side by side,
so guessing the unit scale from the drawing's extent gave a **206 m wide house**.
The importer now reads `$INSUNITS` from the header — but verifies it, because
headers are routinely wrong: one file here declared centimetres for a drawing
plainly authored in metres, which would have imported an 18 m house as 18 cm and
dropped every wall as sub-minimum-length. The header only wins if it puts the
building at a believable size. Extents are also taken from percentiles now, so a
stray entity 30 km from the origin (seen in a real file) can't drag the scale or
the origin with it. All three test files now import at 6.4–7.0 m × 21.8–23.0 m.

### Added — multi-storey CAD import
Architects lay storeys out side by side; a building stacks them. Each storey is
now brought back to a common origin and imported onto its own floor, and the
import summary says how many were found.

### Tests
`tests/geometry.mjs` gains layer-classification assertions built from the real
layer names, including a guard for a bug found while writing this: `'tur'`
(German *Tür* without its umlaut) is a substring of "s**tur**e", so plain
substring matching classified every `Structure - Murs extérieurs` layer as a
DOOR and discarded every wall in the drawing. Matching is now word-start
anchored.

### Known, not fixed
CAD files draw each wall as a closed **outline** (two parallel faces), so room
detection — which expects centrelines — still finds few or no rooms on DXF
imports even though the walls themselves are now correct. Extracting centrelines
from wall outlines is the next piece of work.

## 1.0.97 - 2026-07-25 (versionCode 10097)

Plan import, from user feedback: "I tried to upload 3 different plans and all of
them failed to create the basic outline."

### Fixed — the downsample was dropping thin lines
`binarize` (src/lib/wallTrace.ts) point-sampled one source pixel per output
pixel. On a 3500px scan that is one sample every 3.5px, so a 2-3px CAD line was
hit on some rows and missed on others: a continuous wall reached the Hough stage
as a dashed line and came back as a dozen short fragments. Measured on the same
drawing, a 6-wall plan produced **6 walls at 2000px and 19 at 3500px**; a skewed
phone photo produced **44**. Fragments don't meet at corners, so room detection
finds no closed loops and there is no outline — exactly the reported symptom.
The downsample now min-pools (darkest source pixel per cell), which is the
standard way to binarize line art: a thin dark stroke can never fall between
samples. Same plan now gives 8-9 walls at any resolution.

### Fixed — the wall-thickness filter was switched off above ~2.5x downscale
The tracer separates walls from text, dimension lines, door arcs and furniture by
stroke thickness, via a distance transform. The floor was computed as
`minHalfThickness / scale`, which on a 3500px scan is 0.7 processed px — but the
distance transform cannot resolve below one pixel, so **every** ink pixel cleared
it. Nothing was filtered, every plan was classified as "solid walls" regardless of
how it was drawn, and all the clutter reached the Hough stage. The floor is now
clamped to 1.2px, the smallest value that still rejects a one-pixel stroke. A
single-stroke scan at 3500px is correctly detected as a line drawing again.

### Fixed — the import preview froze the dialog
A trace is 0.2-1.5s of straight-line main-thread work on a desktop and several
seconds on a phone. The live preview ran it on every change to the threshold,
minimum length **and the plan-width text field** — so once per keystroke. It is
now debounced with a "Reading the plan…" state.

### Tests
New `tests/trace.mjs` (47 assertions), wired into `npm test`. It draws plans in
the styles real files arrive in — filled/poché walls, double-line CAD exports,
single-stroke scans, 45° hatched walls, drawing frames, coloured exports, skewed
noisy phone photos, dense 10-room layouts — at 2000-3500px, runs the real tracer
over them in a browser canvas, and asserts the outline and rooms come back. It
also pins resolution stability, which is the specific property that was broken.
Verified it fails (5 assertions) against the old code.

## 1.0.96 - 2026-07-25 (versionCode 10096)

Phase B: roofs. HomeDesigner could not draw one at all, so with dollhouse off the
exterior was an open-topped box. Now the building generates its own roof from the
walls you already drew — gable, hip, shed or flat — which is the last thing that
was stopping 3D from producing a usable external view.

### Added — generated roofs
Roofs are derived, not drawn. `detectBuildingOutline` (src/lib/roomDetection.ts)
recovers the building perimeter that the room walk was already computing and then
throwing away, and `offsetPolygon` (src/lib/polygonOffset.ts) pushes it out to the
outer wall face and again to the eave line. No offset/union library was added —
clipper or polygon-clipping would have cost 40-90 KB gzipped in the APK for this
one feature — so the offset is purpose-built, miter-limited, and validated: any
degenerate result falls back to the un-offset outline, because a roof flush with
the walls looks far better than a roof with a spike through it.

Four shapes (src/lib/roofGeometry.ts):
- **flat** extrudes the footprint and is exact for any polygon, concave included.
- **shed** tilts the real outline, so it is also exact for any polygon.
- **gable / hip** are built over the footprint's oriented bounding box. A true
  hip over an arbitrary concave plan needs a straight skeleton — 800+ lines,
  fragile at degenerate events, and prone to emitting broken meshes on user-drawn
  geometry. An OBB roof is correct for the rectangular-ish footprints that cover
  most houses, and anything markedly non-rectangular falls back to flat with the
  Roof card saying so rather than silently disagreeing with the picker.

Gable ends and the strip under the eaves are filled on the **wall** outline, not
the eave outline, and rendered in the wall colour rather than roofing — without
that you look straight in under the raised end of a shed roof and through the
open triangle of a gable. The fill follows the roof's underside exactly: creases
(the ridge, and a hip's end slopes) are solved analytically and inserted as extra
split points, so the gable triangle peaks at the ridge instead of being capped flat.

Six coverings — clay tile, grey tile, slate, shingle, cedar shake, standing-seam
metal — are procedural (`getRoofTexture`, src/lib/textures.ts). Nothing bundled
reads as roofing (a floor tile stretched over a slope looks wrong at roof scale)
and photographic roof sets would add real APK weight, so this follows the same
zero-bytes route the lawn already took. Roof UVs are projected per face onto each
triangle's own plane, so tiles aren't foreshortened by 1/cos(pitch) on the slopes.

### Changed
- `useDesignBounds` now accounts for the roof's rise and overhang. It feeds the
  camera, the fog range **and** the sun's shadow frustum, so a roof that didn't
  update it would have been silently clipped.
- The roof lives on the top storey, and `normalizeRoofs` re-homes it whenever the
  storey stack changes — add a floor above a roofed house and the roof moves up
  with it instead of being buried inside the new storey. Existing saves have no
  roof and are returned untouched.
- `scaleDesign` scales the eave overhang (a plan-space distance, like wall
  thickness) and leaves the deck thickness alone (a real-world vertical size).

### Tests
`tests/geometry.mjs` grows to 45 pure-Node assertions covering the offset, the
oriented box, outline recovery, all four roof shapes, the end infill and the
cross-storey re-homing. This is geometry that decides real building shapes; it is
exactly the kind of thing that must not be validated by eyeball.

## 1.0.95 - 2026-07-25 (versionCode 10095)

Completes the 3D visual pass (Phase A). Roof next.

### Added — surface relief without shipping a single extra byte
Our material library is albedo-only. Bundling Poly Haven's real normal/roughness
maps for all 30 materials would roughly triple texture weight in the APK, which is
not a good trade for a phone app. Instead `derivedNormalTexture` (src/lib/textures.ts)
treats luminance as a height field and Sobel-filters it into a tangent-space normal
map at load time, cached and wrapped so tiling still lines up. Not physically exact —
luminance only correlates with height — but on brick, plaster, stone, gravel and
timber it reads convincingly. Wired into wall materials and floors (both the built-in
photoreal textures and user uploads), and skipped on the low tier where the pass
isn't worth the CPU.

### Added — one-tap exterior cladding
Painting an outside wall face already worked, but was effectively unreachable:
dollhouse mode is on by default and faded walls ignore taps, so from outside the
building the faces you can actually see are exactly the ones that won't respond.
New **Exterior** card in Properties (no-selection state) finishes every outward-facing
wall face in a single undoable commit. `src/lib/exteriorFaces.ts` decides which sides
face open air by probing just past each face and testing it against every room;
`applyExteriorFinish` in the store applies them, chaining `withFaceFinish` per wall so
a wall exterior on both sides is handled correctly. Uses already-bundled
brick/plaster/concrete/timber textures — zero new bytes. Translated in 12 locales.

Verified headless: the Exterior card applies to all 4 perimeter faces of the sample
home with the interior left untouched. tsc + lint + build clean; 37 smoke checks green.

## 1.0.94 - 2026-07-24 (versionCode 10094)

Second stage of the 3D work. 1.0.93 improved the sun, shadows, floors and ground —
but **none of it reached phones**, because the viewer disabled every effect on any
touch device. This release fixes that, which is the point of it.

### Fixed — phones got no shadows at all, regardless of hardware
The renderer branched on a single `matchMedia('(pointer: coarse)')` check, so a
current flagship phone was treated exactly like a 2016 tablet: no sun shadows, no
contact shadows, no soft shadows, no post-processing. Since HomeDesigner ships on
Android, that meant essentially every real user saw none of the lighting work.
New `src/lib/perfTier.ts` grades the device (`low`/`mid`/`high`) from pointer type,
core count and memory, and each effect is switched from its own capability flag
instead of one blunt boolean. Mid-range and better phones now get real sun shadows
(1024 map) and contact shadows. Post-processing and PCSS soft shadows stay off on
touch by design — those are the expensive parts, and the ones that have actually
crashed drivers in the field.

### Added — Settings → 3D graphics
**Auto / Battery saver / Balanced / Best looking**, so the automatic guess can stay
conservative without trapping anyone on the wrong setting. Auto shows which tier it
picked. Translated in all 12 locales.

### Fixed — the CAD grid was drawn across the lawn
The infinite reference grid rendered unconditionally in 3D, so every exterior view
(and every render) had survey lines over the ground. It now appears only while a
build tool is armed, which is the only time it's actually useful.

### Note on the device probe
The first cut of the tier detection read `WEBGL_debug_renderer_info` to identify the
GPU by name. That required creating a throwaway WebGL context during render, and
this app already runs several live canvases at once (the scene plus a preview canvas
per catalog item). The extra context churn destabilised the catalog list and the
smoke suite caught it. Dropped the GPU sniff — core count, memory and pointer type
are coarser but cost nothing and cannot perturb the renderer.

Verified: tsc + lint + build clean; 37 smoke checks green; headless mobile emulation
(390×844, touch) confirms shadows present at Balanced/Best looking and absent at
Battery saver.

Still to come in this phase: derived normal maps for surface relief, and one-tap
exterior wall finishes. Then the roof.

## 1.0.93 - 2026-07-24 (versionCode 10093)

Owner: "check over the 3D mode and make a plan to make it look better — I want
outdoor elements and a roof so we can do external renders too." This is the first
stage of that work: the visual-quality pass. Roof, outdoor hardscape/boundary and
the exterior render mode follow.

### Fixed — built-in floor materials were photoreal in 2D but procedural in 3D
`FloorMesh` looked up the chosen `FloorMaterial` but read only `.kind`/`.color` and
then built a low-res procedural canvas texture — it never read `.texture`, the
photoreal Poly Haven image the 2D plan already renders (and which that field's own
doc comment says should drive "both the 3D surface and the 2D plan fill"). Now
resolved through `materialUrl()` with the material's real `scaleCm`/`roughness`/
`metalness`, reusing the existing custom-texture path. Every saved design gains real
wood/tile/stone in 3D with no data change and no migration. Carpets keep the
procedural weave (they intentionally ship without an image).

### Fixed — the sun never sat low, so cast shadows were invisible
`sunModel` clamped the sun high all day (`dir.y = 0.15 + day*1.2`) and always placed
it on `+z`, the same side as the default camera — so shadows were short and fell
behind the building, out of view. This was the main reason exteriors read as flat and
unlit. The sun now follows a real altitude (`asin(day)`, floored at ~6° so shadows
can't stretch to infinity) on an east → south → west sweep, giving long raking
morning/evening shadows that fall where you can see them. The key light is also
positioned along `sun.dir` with a uniform scale, so the shadow direction matches the
sky's sun instead of drifting from it.

### Changed — real shadow resolution
Sun shadow map 1024 → 2048 over a frustum tightened from ±radius*2 to ±radius*1.25
(~4× more texels per metre), widening automatically as the sun drops so long shadows
aren't clipped. Added `shadow-normalBias`, which let the depth bias drop 4× (fixes
acne without detaching contact shadows), and replaced the fixed
`shadow-camera-far={80}` — which already silently clipped shadows on larger plans —
with one that scales with the scene.

### Added — textured site ground
The 400 m ground plane was flat untextured `#eceae4`, so from outside the building
floated with nothing to catch its shadow. It now renders a procedural mown lawn
(`getGroundTexture` in `src/lib/textures.ts`, following the existing floor-texture
generator pattern) with gravel/paving/plain also available. Procedural on purpose:
**zero added APK bytes**. Mow stripes are kept deliberately wide — narrow bands alias
into coarse moiré across the lawn at grazing angles.

Still to come in this phase: device tiering + a user Quality setting, derived normal
maps for surface relief, and one-tap exterior wall finishes.

Verified headless at 1440×900: exterior now shows a lit façade with a clearly visible
cast shadow on the lawn, and the dollhouse interior is unchanged apart from the
photoreal floor. tsc + lint + build clean.

## 1.0.92 - 2026-07-23 (versionCode 10092)

Owner (3D screenshot): kitchen cabinets look too small.

### Fixed — kitchen cabinets/stove/sink now fill to real counter height
- The bundled Kenney kitchen models are authored as ~45 cm cubes, so the
  uniform-fit path left base cabinets ~58 cm tall (half a real counter) and the
  stove/sink shorter still — the "too small" look.
- Added a `'stretch'` fit mode to `GltfFurniture`: for boxy cabinetry it scales
  width/depth/height independently to the item's footprint and height (the
  low-poly art holds up fine). Tagged the cabinet run, base/drawer/corner/wall
  cabinets, stove and sink with it (`MODEL_FIT` in `furnitureModels.ts`), and
  raised base/drawer/corner cabinet catalog height 62 → 90 cm.
- Result (headless, deterministic): base cabinet 55×58×58 → **55×60×90 cm**; the
  stove and sink line up on the same 90 cm counter instead of sitting
  half-height. 2D top-down sprites are unchanged (height isn't shown there).

> Note on sourcing "better" models: the cgtrader links are a paid marketplace —
> those models aren't CC0 and can't be bundled in the app without a purchased
> redistribution licence (the catalogue is deliberately CC0 for commercial
> safety). This change fixes the scale of the current models; for photoreal
> cabinets, buy a licence-clear .glb and I'll wire it in.

## 1.0.91 - 2026-07-23 (versionCode 10091)

- Rebuilt the unchanged 1.0.90 Google authentication release with a new Play
  Console versionCode because the previous AAB delivery/upload failed.
- Re-ran production build, Android sync, signed bundle build, and signature
  verification before uploading the replacement AAB.

## 1.0.90 - 2026-07-23 (versionCode 10090)

Owner report: the desktop Pro sheet could only redirect customers to the
Android app. Desktop customers need to buy the same permanent Pro entitlement
and keep it when moving between desktop and Android.

### In progress — RevenueCat Web Billing with Stripe

- Added the lazy-loaded RevenueCat Web SDK and a desktop purchase provider.
  Configured builds load the real web offering and localized price, open
  Stripe-backed checkout, and immediately unlock the returned Pro entitlement.
- Web checkout is attached to the same stable `google:<subject>` customer ID
  already used by Android and the sync Worker. Signed-out customers are asked
  to sign in before checkout so purchases cannot become stranded on an
  anonymous browser ID.
- Existing production behavior remains safe until setup is complete: without a
  public Web Billing key, desktop keeps linking to the Play Store. The
  `?pro=1` browser-test seam remains available.
- Added browser coverage proving a configured desktop build shows **Sign in
  with Google** instead of **Get the Android app** before purchase.
- Connected the live **HomeDesignerApp** Stripe account to a RevenueCat Billing
  configuration using EUR, then added three customer choices: **€4.99/month**,
  **€39.99/year**, and **€79.99 lifetime**. All three products grant the same
  canonical `Pro` entitlement and are attached to the default offering.
- Added the public RevenueCat Billing key to the production web build and
  registered `homedesignerapp.com` as an enabled Stripe payment-method domain
  for supported card wallets. Stripe Tax remains off pending a separate tax
  configuration decision.
- Desktop now loads every configured Pro package and displays a compact pricing
  selector with yearly highlighted as best value. Checkout purchases the exact
  package selected by the customer rather than whichever package happens to be
  first in the offering.

No real live charge was made during setup. Complete one low-value owner purchase
after deployment, then verify the resulting RevenueCat entitlement appears on
both desktop and Android before opening checkout to testers.

Validation so far: TypeScript clean, lint clean, production build succeeds, and
all non-3D browser smoke checks pass with zero page errors.

The signed Android 1.0.90 AAB was built successfully and its JAR signature was
verified before delivery.

### Fixed — reliable Google sign-in and sign-out

- Fixed a production-only desktop OAuth edge case found during live testing.
  When a browser turned Google's popup into an opener-less tab, the successful
  callback was previously stranded and the original app stayed signed out.
  The app now validates the callback issuer, audience, nonce, and expiry, then
  forwards it through the provider's nonce-scoped channel and immediately
  removes bearer credentials from browser history.
- Desktop session restore now requires a still-fresh persisted Google ID token.
  The UI no longer appears signed in after the web token has expired even though
  every plan-sync request would fail.
- A temporary Google plugin initialization error no longer permanently breaks
  all later attempts. Signed-out users also clear any stale provider session
  before starting a new login, preventing “already signed in” failures and
  accidental reuse of the previous Google account on desktop or Android.
- Sign-out now immediately stops cloud writes and clears the visible account,
  account-linked Pro state, prices, and cached credential before attempting
  network cleanup. RevenueCat or Google being offline can no longer trap a user
  in the signed-in UI; the in-memory Google token is cleared in every outcome.
- Session restore cleans up RevenueCat and project-sync state when Google no
  longer has a usable session.

### Fixed — retroactive Pro and legacy project migration

- Corrected the deployed sync Worker entitlement lookup. It had been calling a
  private RevenueCat customer endpoint with the public Android SDK key; it now
  uses the existing private v2 key from a Cloudflare secret and RevenueCat's
  `active_entitlements` API. No secret is stored in source or Git.
- Linked the owner's existing Google customer to **Homedesigner Pro** with an
  unlimited-duration grant after confirming that RevenueCat showed no purchase
  or entitlement history for the new Google ID. Desktop can now resolve Pro
  immediately through the corrected Worker.
- Android now runs RevenueCat `syncPurchases()` when a newly linked Google ID
  has no entitlement. This retroactively attaches eligible purchases made
  under the older anonymous RevenueCat ID to `google:<subject>` using the
  project's **Transfer to new App User ID** behavior.
- Added project-index repair before cloud upload. Valid project JSON left by an
  older/intermediate build is re-indexed and included in the first sync rather
  than remaining invisible. The legacy single-slot save is also recovered when
  needed; users must not delete old projects.
- Added **Sync now** beside the signed-in account on home and in Settings. It
  retries both project merge and Pro linking, with clear success/failure
  feedback. Account copy now correctly says sync works across signed-in
  devices, not Android devices only.
- Deployed sync Worker version `4afa87b9-0fa3-4596-845d-62b1ff43f367`.

Validation: root TypeScript and lint clean; Worker TypeScript clean; 35 browser
checks pass (3D intentionally skipped), including retroactive purchase wiring,
private v2 API configuration, orphaned-plan recovery, and zero page errors.

## 1.0.88 - 2026-07-23 (versionCode 10088)

Owner report: Google Sign-In worked on Android but desktop returned Google
`Error 400: redirect_uri_mismatch`; mobile plans and a mobile Pro purchase also
needed to follow the same Google account onto desktop.

### Fixed — desktop Google login and cross-device account state
- Registered the production web origin `https://homedesignerapp.com` and exact
  redirect URI `https://homedesignerapp.com/app/` on the HomeDesigner Google
  OAuth client. This matches the app's new post-landing-page location and fixes
  the reported redirect mismatch.
- Pinned the production web provider to that canonical redirect URI so loading
  an alternate app pathname cannot silently change the OAuth request.
- Fixed desktop session restore: the web plugin's persisted, still-valid ID
  token is now read before attempting refresh. The plugin does not implement
  Google refresh on web, which previously prevented cloud plan sync after a
  desktop reload even when the account still appeared signed in.
- Existing private R2 plan sync remains keyed by Google's immutable account
  subject. Signing into the same Google account on desktop now performs the
  initial merge and loads plans uploaded from Android.

### Added — Google-linked Pro on desktop
- Added authenticated `GET /v1/entitlement` to the Cloudflare sync Worker. It
  verifies the Google ID token, derives the RevenueCat customer ID
  (`google:<subject>`) server-side, and returns only whether the Pro entitlement
  is active.
- The desktop provider now checks that endpoint when the Google account is
  linked, so a Google Play Pro purchase made while signed in on Android unlocks
  Pro on desktop and other signed-in devices. Signing out removes that
  account-linked desktop entitlement.
- Android purchasing remains RevenueCat over Google Play Billing using the
  non-consumable `pro_unlock`; Play presents the payment methods available on
  the buyer's Google account and country.
- Deployed Worker version `a5dbc7f0-dd23-42f9-a73f-5913dcea1e50`.

Validation: root TypeScript clean; Worker TypeScript clean and deployed; all 39
browser smoke checks pass with zero page errors.

## 1.0.87 - 2026-07-22 (versionCode 10087)

Owner: "Google Sign-In works on mobile, but it's buried in Settings — let people
sign in by clicking a user icon on the main app page."

### Added — account button on the home screen
- New `AccountButton` in the projects/home header: a round **user-icon**
  (brand-outlined) that opens a small popover. Signed out it shows the branded
  **Sign in with Google** button; signed in it shows the avatar/initial, name +
  email, a "synced across devices" note, and **Sign out**. Reuses the existing
  `useAuthStore` (`signIn`/`signOut`) — identical behaviour to the Settings
  account section, just one tap from the launch screen. Renders nothing when
  Google Sign-In isn't configured in the build. Settings keeps its full account
  section (incl. Delete cloud backups); this is a shortcut, not a replacement.
- On phones the header Settings button already lives in the bottom nav, so the
  header shows logo + account + language; on desktop it sits beside Settings.
- New strings translated in all 12 locales (`scripts/add-translations9.py`):
  "Sign in" and the signed-in sync note.

Verified headless (prod build, desktop 1200px + phone 390px): the account icon
renders, the popover opens with the Google button, the mobile header stays
uncrowded. tsc + lint + build clean; signed AAB (SHA256 verified, versionCode
10087). (Built on top of the landing-page branch tip — no Codex work rolled back.)

## Landing page - 2026-07-22 (web only, no app version bump)

Owner: "build a professional landing page for homedesignerapp.com — this video
plays as you scroll down and read the page; make sure everything is readable;
link to the desktop app and the Play Store."

### Added — marketing landing page at homedesignerapp.com
- New static `site/` (single self-contained `index.html` + `site/assets/`):
  dark brand design (royal blue #0d63f8, Plus Jakarta Sans, app tokens), hero
  with dual CTAs, a **scroll-driven film section** (owner's 8s promo render at
  `site/assets/promo.mp4`; scroll progress scrubs `video.currentTime`, three
  step captions on blurred dark cards + progress bar — text always sits on a
  scrim, never raw video), feature grid from the real `store/` phone
  screenshots, checklist band, "Get the app" section, footer with privacy.
  CTAs: **Google Play** (`play.google.com/.../com.homedesigner.app`) and
  **"Use the desktop app"** → `/app/`.
- Robustness: `prefers-reduced-motion` (and any browser whose video seeks
  silently no-op) falls back to a plain looping player with the step cards in
  normal flow; captions/progress are scroll-driven so they work regardless.
- **Deploy layout changed** (`deploy-pages.yml`): the published Pages site is
  now assembled as landing at `/`, the full app under **`/app/`** (its
  `base: './'` build is path-agnostic), with `privacy.html` + `CNAME` kept at
  the root so the Play-listing privacy URL and custom domain keep working.
  The Android build is untouched — Capacitor still bundles `dist/` directly.
  Local `site-dist/` assembly is gitignored (CI builds it fresh).
- Verified headless (desktop 1440px + phone 390px): captions/progress track
  scroll, both CTAs correct, `/app/` serves the working designer, mobile
  header/cards readable. (Headless Chromium can't seek H.264 so the scrub
  itself was verified by mechanism + fallback; real browsers seek normally.)

> **NOTE for the Google Sign-In fix (Codex, tomorrow):** the web app now lives
> at `https://homedesignerapp.com/app/` — register redirect URI
> `https://homedesignerapp.com/app/` (origin `https://homedesignerapp.com`)
> on the Web OAuth client, not the bare domain root.

## 1.0.86 - 2026-07-22 (versionCode 10086)

Owner report: the v1.0.85 Play upload failed, and the phone-only bottom
navigation left desktop users without a visible Settings destination on Home.

### Added — desktop Home settings access
- Added a dedicated **Settings** button beside the Language selector in the
  desktop projects header. It opens the existing Settings dialog directly.
- Kept the control hidden at the phone breakpoint because mobile already has a
  permanent Settings destination in the Home/Templates/Settings bottom bar.
- Added browser coverage that verifies the desktop header button is visible and
  opens Settings before entering a sample project.

### Release — replacement Play bundle
- Advanced the app to `1.0.86` / versionCode `10086`, giving Google Play a new
  bundle identity after the failed v1.0.85 upload attempt.

Verified: TypeScript and ESLint clean; production web build and Android sync
clean; all 39 browser smoke checks green. Signed AAB verified (25,622,587
bytes; SHA-256
`6AD3A05EBD572669A8ED76710F3E3094B4D2B75CCDC1E40A79E6DC37CC767D7B`;
signer SHA-256
`EE:D4:E3:A9:11:BC:92:9A:D3:CD:33:36:FF:BF:32:C0:22:4A:1F:C5:21:BE:B1:13:02:F5:A0:7E:5F:00:6A:00`).

## 1.0.85 - 2026-07-22 (versionCode 10085)

### Fixed — one-finger 2D navigation while objects are locked
- Lock mode now turns the entire 2D plan into a one-finger pan surface on
  touch devices. A drag may begin over a room, wall, or furniture item instead
  of requiring the empty margin outside the house.
- The existing movement threshold still distinguishes a tap from a drag, so
  locked objects and surfaces remain selectable without moving them.
- Added an end-to-end touch regression that begins inside a room and verifies
  the viewport moves while object locking is enabled.

Verified: TypeScript and ESLint clean; production web build and Android sync
clean; all 37 browser smoke checks green. Signed AAB verified (25,622,517
bytes; SHA-256
`CD9BE7F9FE941D25D9C145B0A926E0281E938189E2242815A5987521693B02D1`;
signer SHA-256
`EE:D4:E3:A9:11:BC:92:9A:D3:CD:33:36:FF:BF:32:C0:22:4A:1F:C5:21:BE:B1:13:02:F5:A0:7E:5F:00:6A:00`).

## 1.0.84 - 2026-07-22 (versionCode 10084)

Owner reports: Google Sign-In ended with “Invalid JWT”; signed-in users need
their plans and Pro purchase on a newly installed Android device; the new
`homedesignerapp.com` domain needs to serve the GitHub Pages site.

### Fixed — Google Sign-In JWT failure
- Removed the `@capgo/capacitor-social-login` 8.3.38 generic JWT-decoder call.
  That implementation splits the token incorrectly and rejects a valid Google
  credential. Android's native Google provider already exposes the signed
  credential's immutable `sub` as `profile.id`, which is now used directly.
- Short-lived Google ID tokens remain memory-only and are refreshed before
  cloud requests. The cloud service independently verifies their Google
  signature, issuer, expiry and exact HomeDesigner OAuth audience.

### Added — private cross-device plans and Pro access
- Added a deployed Cloudflare Worker at
  `homedesigner-sync.nathanjoppich.workers.dev` backed by the new, private
  `homedesigner-user-data` R2 bucket. It is separate from the public furniture
  bucket and namespaces every object by the verified Google subject.
- Signed-in project snapshots, names and thumbnails now merge across Android
  devices with last-write-wins timestamps. Deletion tombstones prevent a plan
  deleted on one device reappearing from an older offline device.
- Autosave remains local and fast. Cloud writes are coalesced after five idle
  seconds, and offline/network failures leave local projects untouched for a
  later retry.
- Added **Delete cloud backups** in Settings plus a matching authenticated
  deletion endpoint. Updated the privacy policy for Google account data,
  Cloudflare storage and RevenueCat identity linking.
- RevenueCat continues to use `google:<immutable-sub>` as its App User ID.
  Signing into the same Google account on another Android device therefore
  restores the same Pro entitlement without using the mutable email address.

### Added — custom web domain
- Added the GitHub Pages `CNAME` for `homedesignerapp.com` and changed the
  in-app privacy URL to `https://homedesignerapp.com/privacy.html`.

Verified: TypeScript and ESLint clean; production web build and Android sync
clean; all 36 browser smoke checks green; Worker TypeScript clean; deployed
Worker rejects unsigned sync/deletion requests with HTTP 401 and accepts the
Android WebView CORS origin. Signed AAB verified (25,622,592 bytes; SHA-256
`78ECC2F689438265F529809AEEC725C69DAB0D9F8F3F406A8882538DAC817275`).

## 1.0.83 - 2026-07-21 (versionCode 10083)

Owner direction: grow the furniture library through commercially safe CC0
sources while IKEA licensing permission is pending.

### Added — real cloud models for existing catalogue objects
- The remote catalogue can now apply tightly scoped **model-only upgrades** to
  furniture already bundled with the app. Remote data may supply a GLB and its
  verified provenance, but cannot alter the item's dimensions, category, Pro
  status, placement behaviour, or any other catalogue metadata.
- The live R2 manifest's nine reviewed CC0 upgrades now work in the app: TV,
  floor lamp, pendant light, table lamp, rectangular/round rugs, toilet, sink,
  and shower. The prepared Kenney and Quaternius files were confirmed live with
  their declared byte counts; the 32 existing cloud-only objects remain intact.
- Published a second visually reviewed Quaternius batch with 11 lightweight
  CC0 objects: four seating variants, two storage/media units, four plants, and
  a kitchen drawer base. The live cloud catalogue now contains 43 objects while
  keeping all nine bundled-furniture model upgrades.
- Added width/depth fitting and a bounded vertical offset for unusually thin or
  hanging GLBs. The TV keeps its correct proportions instead of being distorted
  to fill its shallow placement footprint.

### Hardened — catalogue refresh and licensing boundaries
- Cloud model overrides remain same-origin HTTPS, GLB-only, CC0-only, and require
  a valid source URL. Structural doors/windows can never be overridden remotely.
- Fixed forced catalogue refreshes rejecting the previously loaded 32 cloud
  object types merely because they were still present in the runtime lookup.
- Added deterministic browser coverage for a cloud model upgrade and documented
  the manifest schema for future CC0 batches.
- Added reusable Blender preview rendering and safe manifest-merging tools for
  incremental catalogue releases. Blender batch export now correctly accepts
  arguments after its standard `--` separator. An empty source object
  (`Drawer_4`) was rejected rather than publishing a broken catalogue item.

Verified: TypeScript, ESLint, production build, Android sync, and all 35 browser
checks clean. The public R2 manifest is byte-identical to the reviewed local
manifest (43 new objects, 9 model upgrades). All 11 second-batch GLBs were
fetched from the public endpoint and matched the reviewed local files by
SHA-256. Signed AAB verified
(25,620,999 bytes; SHA-256
`36D0C31F7FA537DB613EFB990ABA85E03BD9A5AFAB8A1860ABFCC4CC2B188BE8`).

## 1.0.82 - 2026-07-21 (versionCode 10082)

Owner report: walking up the Maple family house stairs changed to the upper
floor but placed the camera outside, and the upper floor had no stairwell cut.

### Fixed — safe, connected stair navigation
- Corrected the Maple stair direction so its low end starts in the ground-floor
  hall and its high end arrives on the indoor upper landing.
- Walk-through stair transitions now validate their destination against the
  target floor's rooms. A badly placed or outward-facing stair falls back to
  the nearest safe room interior instead of putting the camera outside.
- Destination fallback uses a room's interior visual centre, which remains safe
  for concave rooms where a simple polygon centroid may lie outside.

### Added — real upper-floor stairwells
- Upper-storey floor finishes and structural slabs now cut an opening from the
  rotated footprint of each stair on the storey below.
- The same rotation transform drives the visible stair, landing detection, and
  slab opening, preventing the geometry and navigation from drifting apart.
- Openings are only cut when the full stair footprint belongs to a destination
  room; boundary-crossing stairs keep a solid floor rather than generating a
  broken mesh.

Verified: TypeScript + ESLint clean; production build and Android sync clean;
all 34 browser checks green, including safe fallback, rotated stairwell
geometry, Maple's indoor upper landing, and a valid Maple slab opening. Signed
AAB verified (25,620,390 bytes; SHA-256
`8314911A3DC46384BD19E80FF1D27920101E19871A300721068979B4B053A752`).

## 1.0.81 - 2026-07-21 (versionCode 10081)

Tester feedback: flipping doors and stairs was unclear on mobile, and finishing
a room needed a more obvious action.

### Added — quick direction controls
- Selected objects now have large 44px one-tap rotate-left/right buttons in
  Edit, avoiding the precision slider for common 90-degree turns.
- Selected stairs add a central **Reverse** arrow that changes their rise
  direction by exactly 180 degrees in both 2D and 3D.
- Selected doors add **Hinge** (left/right) and **In / out** swing arrows.
  These flags persist with the opening and update both the plan symbol and 3D
  door leaf. Pocket-door side and double-door swing direction are also honoured.

### Changed — clearer room completion
- After the third room corner, the first point becomes a large blue target with
  a check mark, making “tap the first point to close” discoverable on phones.
- The drawing action now says **Finish room** instead of the generic “Finish”.
  Users can either tap that button or tap the checked first point.

Verified: TypeScript + ESLint clean; 30-check browser smoke suite all green,
including real Edit-panel clicks for stair reversal and door hinge flipping.

## 1.0.80 - 2026-07-21 (versionCode 10080)

Owner screenshot: Google Sign-In rejected immediately with “You CANNOT use
scopes without modifying the main activity.”

### Fixed — native Google Sign-In startup
- Removed the redundant `options.scopes` array from the Google login request.
  The installed Android Credential Manager provider already requests `openid`,
  `email`, and `profile` by default; explicitly passing the same values makes
  the plugin treat them as custom scopes and require a modified MainActivity.
- The OAuth project, web client ID, Android signing clients, immutable Google
  `sub` identity, and RevenueCat linking behaviour are unchanged.
- Added a regression check that fails if the login request starts passing a
  scopes array again without the required native integration.

Verified against the installed `@capgo/capacitor-social-login` Android source,
which adds the three identity scopes automatically before applying its custom-
scope MainActivity guard. TypeScript + ESLint + production build clean; Android
sync clean; 26-check browser smoke suite all green. Signed AAB verified
(`versionCode 10080`, SHA-256
`B0D56CF695AAE0DA68A59F3D69D940011ABD05197D95BD45E4C5363E5D2B4645`).

## 1.0.79 - 2026-07-20 (versionCode 10079)

Owner report: walk-through mode could not pass through a door or continue up
stairs to another floor.

### Fixed — walk-through doors and storey navigation
- Walk collision is now generated from solid wall spans around door, passage,
  archway, sliding, pocket, bifold, and double-door openings. Previously the
  rendered wall had the correct hole but its invisible collision segment still
  ran uninterrupted from one endpoint to the other.
- Overlapping doorway ranges are merged and given a small jamb tolerance, so
  wide/double openings do not retain invisible collision slivers.
- Stairs now connect adjacent storeys in walk-through mode. Approaching the low
  landing transitions smoothly to the floor above; approaching that stair's
  upper landing transitions back down. The active floor and collision geometry
  switch automatically, with a landing offset/cooldown preventing bounce-back.
- Stair landing detection works in the furniture's rotated local coordinates,
  so stairs placed at any plan angle navigate to the correct end.
- Walk-through renders the complete stack of storeys while moving between
  floors; the normal 3D editor keeps its active-floor cutaway behaviour.

### Regression coverage
- Added browser checks proving that wall collision is split around a door and
  that a 90-degree rotated stair resolves its upper landing correctly.

Verified: TypeScript + ESLint clean; production build clean; 25-check browser
smoke suite all green, including 3D WebGL/catalog coverage and zero page errors.

## 1.0.78 - 2026-07-20 (versionCode 10078)

Owner: enable Google Sign-In before OAuth production verification so Pro access
can follow the same person across Android devices.

### Added — Google account sign-in and Pro sync
- Added native Google Sign-In with `@capgo/capacitor-social-login`, using the
  modern Android Credential Manager flow. Settings now has a branded Google
  sign-in button, signed-in profile card, and safe sign-out action.
- Google identity uses the immutable OpenID `sub` namespaced as
  `google:<subject>` for RevenueCat. Tokens are never persisted; only the
  display profile and stable subject are cached locally.
- RevenueCat now switches from its anonymous customer to the Google identity
  with `Purchases.logIn`, so an existing Pro entitlement can follow the user
  across Android installs. Sign-out calls `Purchases.logOut` before ending the
  Google session so a shared device is never left attached to the named
  customer. Local designs remain device-only and the UI says so explicitly.
- Startup restores an existing Google session after the initial entitlement
  refresh. Offline startup keeps the cached account and entitlement instead of
  destructively signing the user out.
- Account controls, explanatory copy, and auth-result messages are translated
  in all 12 non-English locales.
- Settings now uses a scrollable body with a fixed, reachable footer; the new
  account section cannot push the Done button below a phone viewport.

### OAuth configuration
- Uses the separate Google Cloud project `homedesigner-502819` (the existing
  Ascribe project was not changed). Branding is `HomeDesigner`, audience is
  External / Testing, and `nathanjoppich@gmail.com` is the first test user.
- Created one Web OAuth client (its public ID is embedded through
  `.env.production`) plus Android clients for package `com.homedesigner.app`
  bound to both the Play App Signing SHA-1 and upload-key SHA-1.
- OAuth requests only `openid`, `email`, and `profile`; no sensitive scopes or
  client secrets are present in the app or repository.

Verified: tsc + lint + production build clean; Capacitor sync includes the
Google-only SocialLogin native dependency; the 23-check mobile smoke suite is
all green. Signed AAB verified (`versionCode 10078`, SHA-256
`652E852953D5C69B3C05880B036FEF640D013B49532D66A0F7820E049FB1D2C4`).

## 1.0.77 - 2026-07-20 (versionCode 10077)

Owner reports: 2D always opens over-zoomed; new custom lock icon.

### Fixed — 2D opens framed to the whole floor plan
- Entering 2D was over-zoomed because the "frame the design" effect ran against
  the stage's *guessed* initial size (800×600) and never re-ran once the
  ResizeObserver reported the real (often much narrower phone) size — the
  `fitRequest === lastFit` guard blocked it. The fit is now keyed on **both the
  request and the measured size**, so it re-frames for the real stage size. On
  entry (and after 3D→2D, which remounts the canvas) the whole plan is shown,
  then you zoom in. Verified headless (390×844): all four plan corners land
  inside the viewport.

### Changed — custom "Lock objects" icon
- The lock toggle now uses the owner's armchair-with-padlock glyph
  (`public/icons/furniture-lock.png`) via a new `FurnitureLockIcon` component.
  Rendered as a CSS mask filled with `currentColor` (the source had no alpha —
  a luminance threshold derives the mask), so it tints with the theme and the
  brand active state like the lucide icons. Replaces the bare `Lock` in all four
  lock toggles (2D HUD + 3D pills).

### Chore — Play Store assets refreshed
- Regenerated `store/` (home gallery / 2D / 3D / catalog across phone + 7"/10"
  tablet) from the current UI, plus the icon + feature graphic from the real
  logo on the royal-blue brand. `tools/screenshots.mjs` modernized + hardened.

Verified headless; tsc + lint + build clean; signed AAB (SHA256 verified,
versionCode 10077).

## 1.0.76 - 2026-07-20 (versionCode 10076)

Owner supplied photoreal preview renders for every "Start a project" card.

### Added — template preview renders
- Each template card now shows a photoreal dollhouse/blueprint render as a
  full-bleed banner (title + blurb padded below, icon kept as fallback):
  - Samples: Sunlit open-plan home, Maple family house, City studio, Terraced
    townhouse (isometric 3D dollhouses).
  - Actions: Import a 2D plan and Start from scratch (dark blueprint renders that
    match the app's dark UI).
- Six owner renders live in `public/previews/*.webp` (~190 KB total; originals
  kept in `brand/previews/`). `samples.ts` gained a `hasPreview` flag +
  `samplePreviewUrl()`; the two action cards point at their own preview URLs.
  New `.tpl-card.has-preview` styling (image cover-fit banner, flex-stretch so
  the row stays even height).

Verified headless: all six template cards load their preview image. tsc + lint +
build clean; signed AAB (SHA256 verified, versionCode 10076).

## 1.0.75 - 2026-07-20 (versionCode 10075)

Owner (phone screenshot): saved projects showing blank previews.

### Fixed — project thumbnails go blank after viewing in 3D
- Thumbnails are captured from the 2D Konva stage (`planCapture`), but Canvas2D
  only mounts in 2D — so a design the user drew and then **viewed in 3D before
  leaving** captured nothing (the bridge was null on exit) and fell back to the
  house placeholder.
- New shared `capturePlanThumbnail()` (`src/lib/thumb.ts`) is now called:
  - in `goHome()` (as before, refactored out of App), and
  - **when switching 2D → 3D**, while the 2D canvas is still mounted — so a
    fresh preview is stashed even for projects only ever viewed in 3D.
- Genuinely empty projects (no walls/rooms/furniture) still show the placeholder
  by design — there's nothing to preview until you draw something.

Verified headless: open a sample → switch to 3D → go home; the project card now
shows a real plan thumbnail (was the blank placeholder). tsc + lint + build
clean; signed AAB (SHA256 verified, versionCode 10075).

## 1.0.74 - 2026-07-20 (versionCode 10074)

Owner (phone screenshot): tapping "Explore ideas" opened the Tips panel as a
wall of **keyboard shortcuts** (Ctrl+Z, Ctrl+C, arrow-key nudge, right-click) —
useless on a touch phone.

### Fixed — Tips panel is touch-aware
- `HelpPanel` now detects a coarse pointer and, on touch:
  - Titles itself **"Tips & gestures"** (was "Tips & shortcuts").
  - Drops the keyboard chips and the keyboard-only rows (copy/paste hotkeys,
    Select-all, arrow-key nudge).
  - Rephrases every row as the gesture: *tap* to chain points, *tap Finish*,
    *long-press* for the copy/duplicate menu, *undo/redo arrows in the top bar*,
    *pinch to zoom / two-finger drag to pan*, etc.
- Desktop still shows the full keyboard reference unchanged.

Verified headless (touch context): the panel renders with zero `<kbd>` chips and
gesture phrasing. tsc + lint + build clean; signed AAB (SHA256 verified,
versionCode 10074).

## 1.0.73 - 2026-07-20 (versionCode 10073)

Owner: add micro-animations "only the ones that make sense on mobile" (the
hover-only ideas from the reference — hover effects, name tags, delayed
tooltips, text pop-out, search expansion, upgrade-on-hover — are skipped since
touch has no hover).

### Added — micro-interactions (all reduced-motion aware)
- **Tap/press feedback** — the touch equivalent of a hover state: buttons,
  cards, thumbnails, segmented toggles and the inspiration banner scale down
  slightly (0.96) on press for a tactile response.
- **Toast notifications** now spring up (slide + subtle scale, overshoot ease).
  Also fixed a readability bug: toasts used `background: var(--text)`, which is
  near-white in dark mode (white chip); they're now a fixed near-black chip
  legible in both themes.
- **Card entrance** — the home template + project cards fade-up in a gentle
  stagger on load.
- **Shimmer stroke** — a slow sheen sweeps the Pro badge + the upgrade CTA to
  draw the eye to the paid path (purposeful, not decorative everywhere).

CSS-only, gated behind `prefers-reduced-motion: no-preference` where it isn't
pure interaction feedback. Verified headless: toast is a readable dark chip, the
Pro badge shimmer runs, cards render after their entrance. lint + build clean;
signed AAB (SHA256 verified, versionCode 10073).

## 1.0.72 - 2026-07-20 (versionCode 10072)

Owner: "improve 3D-mode jaggies and graphics" (phone screenshot with heavily
aliased wall/furniture edges).

### Changed — smoother 3D on mobile
- The light render tier (all touch devices) shipped with **MSAA off** and the
  device pixel ratio capped at **1.25**, so every edge stair-stepped. Now:
  - `antialias: true` on the WebGL context unconditionally — MSAA is cheap on
    modern mobile GPUs and is the real fix for the jaggies. (On mobile,
    post-processing is off, so the default framebuffer's MSAA actually applies.)
  - Mobile DPR ceiling raised **1.25 → 2** (`dpr={[1, 2]}`) for crisp edges and
    textures.
  - `AdaptiveDpr` now downscales **smoothly** (`pixelated={false}`, was
    `pixelated` on mobile), so if a frame budget slips the image softens instead
    of turning blocky.
- The heavy costs (post-processing, real-time + contact shadows) stay gated to
  desktop, and `AdaptiveDpr` + the frame-budget floor keep navigation smooth, so
  this sharpens the picture without a perf cliff.

Verified headless: the 3D scene renders with no errors after the change. tsc +
lint + build clean; signed AAB (SHA256 verified, versionCode 10072).

## 1.0.71 - 2026-07-20 (versionCode 10071)

Owner-reported bugs (phone screenshots).

### Fixed — home bottom-nav highlight
- Tapping **Templates** scrolled to the row but never turned blue — the nav
  hard-coded `active` on Home. Now the tapped tab highlights (explicit
  selection; the home content barely overflows, so a scroll-position heuristic
  can't reliably distinguish Home from Templates). Settings opens a modal and
  leaves the selection unchanged.

### Fixed — 2D editor hint tip unreadable + overlapping
- The floating hint ("Pick a tool on the left…") used `background: var(--text)`,
  which is dark in light mode but **near-white in dark mode** — a white pill
  with white text. It now uses theme-aware `--surface-2` / `--text` / `--border`
  so it's legible in both themes.
- On phones the centred tip collided with the top-left **Ground floor**
  switcher; it now drops below that row (`top: 64px`) and can use the full
  width. Rounded-rect corners (14px) read cleaner when the hint wraps to two
  lines.

(The home-screen Settings button was already fixed in 1.0.70.) Verified headless
(390×844): Templates/Home toggle their blue state; the editor hint is a dark,
readable pill below the floor switcher with no overlap. tsc + lint + build
clean; signed AAB (SHA256 verified, versionCode 10071).

## 1.0.70 - 2026-07-20 (versionCode 10070)

Owner: "put an option in the menu that users can disable the intro video — it
might not be for everyone."

### Added — Settings toggle for the launch intro
- New **Settings → Startup → "Play intro animation"** toggle
  (`src/lib/introPref.ts`, localStorage `hd-intro-enabled`, default on).
  `IntroVideo` now checks it and never shows when off. Translated in all 12
  locales (`scripts/add-translations8.py`).

### Fixed — Settings/Help/About were unreachable from the home screen
- The home bottom-nav **Settings** button (and the inspiration banner's Help
  action) set state but the dialogs were only rendered in the editor branch of
  `App.tsx`, so nothing opened on the home screen. Now `SettingsDialog`,
  `HelpPanel`, and `AboutDialog` render in the projects branch too — so the new
  intro toggle (and all settings) are reachable straight from the launch screen.

Verified headless: Settings opens from home and shows the Startup toggle; with
the pref off the intro is suppressed on launch. tsc + lint + build clean; signed
AAB (SHA256 verified, versionCode 10070).

## 1.0.69 - 2026-07-20 (versionCode 10069)

Owner supplied an animated-logo clip to use as a launch intro.

### Added — animated-logo launch intro
- `public/intro.mp4` (owner's 768×768, ~5s H.264 clip) plays full-screen when
  the app cold-launches, then fades into the home screen. New `IntroVideo`
  component:
  - **Once per session** — a module flag + `sessionStorage` guard, so it plays
    on a real cold launch (Android clears sessionStorage when the process dies)
    but not on warm resumes or in-app navigation.
  - **Skippable** — tap anywhere or the Skip button; auto-dismisses on the
    clip's `ended`, and a 7s safety timer guarantees it never traps the user.
  - **Reduced-motion aware** — skipped entirely when the OS prefers reduced
    motion.
  - **Seamless backdrop** — samples the video's own corner pixel and paints the
    letterbox with it (resolved to the brand blue here), so a square clip on a
    tall screen has no jarring bars.
  - StrictMode-safe: the `useState` initializer is pure (the earlier draft wrote
    to sessionStorage inside it, which React's dev double-invoke self-suppressed).

Assumptions used (easy to change): app-open placement, once per session,
skippable. Verified headless (390×844): intro plays and advances, Skip reveals
the home screen, and it does not replay on reload within a session. tsc + lint +
build clean; signed AAB (SHA256 verified, versionCode 10069).

## 1.0.68 - 2026-07-20 (versionCode 10068)

Owner supplied the official logo. Wired the real HomeDesigner mark (white
house + blueprint scroll + F on royal blue) into every icon slot.

### Added — real app icon everywhere
- `brand/homedesigner-icon-src.png` is the committed brand source. New
  `scripts/gen-icons.mjs` (sharp) derives every asset from it:
  - Tight-crops the blue rounded square out of the source's white margin.
  - Extracts the white glyph with clean transparency by **flood-filling the
    exterior margin inward** (white glyph and white margin are the same colour,
    so a colour threshold alone can't separate them) and using
    `alpha = min(R,G,B)` for smooth edges.
  - Emits Android legacy `ic_launcher`/`ic_launcher_round` (48→192dp) and the
    adaptive `ic_launcher_foreground` glyph (108dp, in the safe zone) over the
    existing `@color/ic_launcher_background` (#0D63F8), plus web
    `favicon.png` / `apple-touch-icon.png` / `icon-192` / `icon-512` /
    `brand-icon.png`.
- `index.html` favicon/apple-touch now point at the PNGs (was a generic house
  SVG). The in-app brand chip (home header + editor toolbar) shows the real
  icon image instead of a lucide house.
- Regenerate anytime with `node scripts/gen-icons.mjs`.

Verified headless: the home-header chip renders the logo crisply; the adaptive
launcher composites the glyph correctly on royal blue. tsc + lint + build clean;
signed AAB (SHA256 verified, versionCode 10068).

## 1.0.67 - 2026-07-20 (versionCode 10067)

Owner shared the official HomeDesigner app icon (royal-blue house-with-blueprint
mark) and asked to align the app's branding + keep improving the menus.

### Changed — brand colour aligned to the app icon
- Retuned the brand token to the icon's true royal blue **#0d63f8** (was a
  slightly purple indigo #3b63f6/#4c6ef5). Updated light + dark `--brand`,
  `--brand-600`, `--brand-soft(-2)`, `--grad-brand`, `--grad-hero`, the leftover
  hard-coded gradient hexes, and the Konva canvas selection/handle colours in
  `theme.ts`. Because everything reads from the tokens, the whole app — home
  hero, New-project button, template accents, bottom nav, 2D selection, pills —
  now matches the icon in one pass.

### Changed — menu polish
- Dropdown menus (Export / More): brand-tinted hover (item + icon go royal
  blue), rounder corners, deeper shadow, and a small pop-in animation.
- 2D/3D view switch: the active segment now carries a brand-tint ring and a
  brand-coloured icon so the current view is unmistakable.

tsc + lint + build clean; signed AAB (SHA256 verified, versionCode 10067).

NB: the brand chip + favicon + Android launcher icon still use a generic house
glyph — waiting on the owner to supply the logo as a transparent SVG/PNG so it
can be wired in precisely (backlog for Codex/next build).

## 1.0.66 - 2026-07-20 (versionCode 10066)

Owner: "I don't like the model for [the dining table] or the dining chairs, can
we find better ones." Swapped both to nicer models — in 2D and 3D at once.

### Changed — better dining models
- New shared source of truth `src/data/furnitureModels.ts` (`MODEL_FILE`:
  type → glb basename) consumed by BOTH the 3D viewer (`GltfFurniture` builds
  `FURNITURE_MODELS` from it) and the 2D sprite renderer, so the two views can
  never drift. `GltfFurniture`'s old hand-maintained model list is gone.
- **Dining table** → now uses the clean framed-wood `tea_table` model instead
  of the one with a picnic tablecloth baked on. **Dining chair** → the
  `wooden_dining_chair` (an actual upholstered dining chair) instead of the
  oversized brown-leather lounge chair. Both changes show in 2D and 3D.
- Added `SPRITE_FILL` (dining_table, desk, metal_desk): flat rectangular tops
  stretch their sprite to fill the footprint, so a squarish table model still
  reads as a full rectangular dining table rather than a small centred square.
- Re-rendered all 53 sprites from the updated map (`node scripts/render-sprites.mjs`).

Verified headless: the great room's dining set is now a rectangular wood table
ringed by six white upholstered chairs. tsc + lint + build clean; signed AAB
(SHA256 verified, versionCode 10066).

## 1.0.65 - 2026-07-20 (versionCode 10065)

Owner (2D mockup): "in the sample the furniture looks more realistic too."
2D furniture is now photoreal top-down art instead of line symbols — the
biggest visual jump toward the mockup.

### Added — top-down furniture sprites
- New offline pipeline renders every furniture GLB straight down into a
  transparent webp sprite (`scripts/render-sprites.mjs` + `sprite-render.html`,
  driven headlessly through the dev server with three.js: orthographic top-down
  camera, soft key/fill lighting, a gentle contact shadow, footprint-tight
  frame). Produced **53 sprites** in `public/sprites/` (~1.1 MB total) plus a
  generated `src/data/furnitureSprites.ts` manifest. Reuses the exact models
  shown in 3D, so 2D and 3D agree.
- The 2D editor now draws the sprite for any type that has one (sofa, bed,
  armchair, dining set, dresser, wardrobe, plants, fridge, stove, sink,
  cabinets, desks, stools…) via a new `FurnitureItemGraphic` component (Konva
  `Image`, contain-fit to the item footprint, still fully tappable because
  Konva images hit-test on their bounding box). Fixtures without a model
  (toilet, bathtub, shower, counter/island, TV, lights, rugs) and any
  still-loading sprite keep the clean line symbol — no regressions, no flashes.
- Regenerate anytime with `node scripts/render-sprites.mjs` (dev server on
  :5209). Adding a model to `public/models` + a catalog entry auto-includes it.

Verified headless at 390×844: the sample home shows a photoreal bed with
pillows + nightstands + wardrobe in the bedroom, and a leather sofa with throw
pillows, teal accent chair, round coffee table, dining set and potted plants in
the great room — over the 1.0.64 wood floors. tsc + lint + build clean; signed
AAB (SHA256 verified, versionCode 10065).

## 1.0.64 - 2026-07-20 (versionCode 10064)

Owner (with a 2D-editor mockup): "improve the graphics of 2D mode to be more
like the screenshot" (photoreal wood floors, defined walls) + "check UI for
mobile." The 30 photoreal textures already shipped for 3D are now used in the
2D plan too.

### Changed — 2D floors are photoreal
- Room floors in the 2D editor now render the material's actual texture image
  (Konva `fillPatternImage`) instead of a flat colour. Each `FloorMaterial`
  gained a `texture` id mapping to `public/textures/*.webp`:
  oak→`wood_floor`, walnut→`dark_wooden_planks`, tile_white→`floor_tiles_06`,
  tile_grey→`interior_tiles`, concrete→`concrete_floor_worn_02`,
  marble→`marble_01`. Carpets stay a flat colour (fibre photos read worse
  than a clean tone top-down). A custom uploaded floor image still wins.
- Texture tiles at real-world scale: one tile spans the material's `scaleCm`
  (from `materials.ts`), so planks/tiles look believable at any zoom. Laid
  floors render near-opaque (grid no longer bleeds through the floor); flat
  carpet tones lifted slightly (0.55→0.68) so they read warmer.
- New `RoomFloorFill` component (one per room) keeps `useHtmlImage`'s hook
  order stable and falls back to the flat colour until the image loads.
- Added `MATERIAL_BY_ID` lookup to `data/materials.ts`.

### Changed — walls read as defined, beveled edges
- Wall bodies now carry a thin crisp outline (`wallEdge` colour added to the
  Konva palette in `theme.ts`; `#1d232d` light / `#5b6474` dark) with a rounded
  line-join, so each wall reads as a solid beveled block against the new
  photoreal floors instead of a flat slab.

Verified headless at 390×844 (phone): sample home shows oak wood grain in the
Great Room, marble in the Bathroom, warm neutral carpet in the Master Bedroom;
walls have defined edges; toolbars/nav fit with no overlap. tsc + lint + build
clean; signed AAB (SHA256 verified, versionCode 10064).

Next (Phase 2, backlog for Codex): photoreal top-down furniture sprites need an
offline render pipeline (render each catalog model from directly above → webp)
— the current 2D furniture stays vector symbols until then.

## 1.0.63 - 2026-07-19 (versionCode 10063)

Owner: "the buttons on the menu don't work properly" (phone screenshot of the
1.0.62 home bottom nav overlapping the inspiration banner). Three fixes in
`ProjectsScreen.tsx` + `index.css`:

- **Home nav button now works** — it had no `onClick` (dead button). It now
  scrolls the projects `<main>` to the top (`mainRef.scrollTo`). Templates
  (scroll to template row) and Settings (open dialog) were already wired.
- **Inspiration banner has a phone layout** — `.ps-inspire` was a flex row
  with no `@media (max-width:720px)` rule, so the middle text column was
  squeezed into ~8 cramped lines and the banner ran tall. On phones it now
  stacks (icon+title, sub-line, full-width "Explore ideas" button) — compact.
- **Banner no longer collides with the fixed bottom nav** — the compact banner
  plus a larger `.ps-main` phone `padding-bottom` (84 → 104px) keeps it clear
  of the nav in every list state. Verified headless (390×844): banner/nav
  bounding boxes don't intersect on the empty home; Home button returns
  scrollTop to 0.

## 1.0.62 - 2026-07-19 (versionCode 10062)

Premium dark UI redesign toward two owner-supplied mockups (dark-first home
screen + dark 2D editor). Owner decisions: **dark by default** (light/System
still selectable), **home + editor chrome together**, **adapt aspirational
bits to real data** (no fake completion %; bottom nav → real destinations;
"Explore ideas" → the built-in Tips).

### Changed — theme
- Deepened `:root[data-theme='dark']` to a premium near-black navy
  (`--bg #0a0d14`, card `--surface #141924`, brand `#4c6ef5`), added
  `--grad-brand` / `--grad-hero` gradient tokens. Token NAMES unchanged so
  every component inherited the new look. Android status-bar chrome updated.
- `theme.ts` `readPref()` defaults unset installs to **dark** (was system).
  Settings still exposes System / Light / Dark.

### Changed — home screen (`ProjectsScreen.tsx`)
- Rebuilt to the mockup with REAL data: "Welcome back 👋" hero + primary
  **New project** button; a horizontally-scrollable **Start a project**
  template row (samples + Import + Blank, first accent-bordered); restyled
  **Your projects** cards with an Edit / Duplicate / Delete label row (no
  progress bars — completion isn't tracked); a **Need inspiration?** gradient
  banner whose "Explore ideas" opens Tips; a phone **bottom nav**
  (Home / Templates / Settings) where every tab is a real destination
  (new `onHelp` / `onSettings` props from `App`).

### Changed — editor chrome
- Active **Build / Objects / Edit** tab is a solid blue gradient pill.
- Added a **Measure** shortcut to the 2D bottom control bar (arms the measure
  tool, highlights when active via `.pill .toggle.on`). Segmented 2D/3D
  toggle, Ground-floor pill, dimensions inherit the premium palette.

### i18n
- 11 new home/editor strings × 12 locales (`scripts/add-translations7.py`).

### Folded in (previously unshipped 1.0.61 polish)
- Room labels use the **visual centre** (pole of inaccessibility,
  `geometry.polygonVisualCenter`) so concave/L-shaped rooms label in open
  floor. Measure calibration card no longer overlaps its tip
  (`useDraw.calibrating`) and is fully translated (`add-translations6.py`).
  Remote-catalog fetch has a 6 s AbortController timeout → "Offline catalog"
  instead of an eternal spinner.

### For Codex / next session
- Mockup elements deliberately NOT built (no real data yet): user
  accounts/avatars, marketing photos for templates, a content/inspiration
  feed, completion tracking. Revisit once accounts land (Google sign-in).
- Verified headless: dark default; Settings-from-nav; Measure arms tool;
  2D/3D toggle; FR home translates via the language picker. Vite gotcha —
  driving i18n by dynamic-importing the store from page context can bind a
  second module instance; switch language via the real `.lang-btn` UI in
  probes.

## 1.0.60 - 2026-07-19 (versionCode 10060)

Owner: "more quality improvement for 2D." A hands-on 2D audit (14 headless
screenshots, desktop + phone) found the labels were the glaring gap.

### Fixed

- **Room names no longer shatter into fragments.** The Konva room-name
  `<Text>` used a fixed `width={100}` (100 **cm**, world units) with
  `fontSize={14/zoom}`, so zoomed out the font grew while the box didn't —
  "Great Room" wrapped to "Gre / at / Roo / m", "Bedroom" → "Bed / roo / m".
  The name is now a **screen-space** label (`fontSize`, box width, gaps all
  scale by `1/zoom`) with `wrap="none"` + `ellipsis`, so names always render
  on one line and truncate cleanly if genuinely too long. Verified headless:
  every sample room name renders on exactly 1 line, phone + desktop.
- **Name + area are one unified block** on a soft rounded plate (same idea as
  the wall-dimension pills) so they lift off any floor fill / furniture at the
  room centroid and never drift apart. Deletes the old dual-file split
  (name in `Canvas2D`, area in `DimensionsLayer.RoomDimension`) and its
  fragile glyph-count `nameLines` collision heuristic. Small rooms hide the
  label rather than overflow it.
- **Interior wall dimensions sit inline on the wall** instead of being offset
  `px(18)` into the neighbouring room (where "3.50 m" / "12.25 m" landed on
  top of that room's name and fixtures). Each interior wall length is now a
  small rounded pill centred on the wall centreline, rotated upright, over a
  legible plate; click-to-edit preserved. Perimeter lengths still read from
  the overall building dimensions. (`DimensionsLayer.tsx` — WallDimension
  rewritten; new `dimensionPlate` / `dimensionPlateStroke` theme colours.)
- **Room selection is now obvious**: selected room outline thickened
  (3→5 /zoom), full-contrast selection stroke, stronger shadow, and the
  selected room draws LAST so its outline sits above neighbours.

### Changed

- **2D wall drawing squares up like 3D** (owner: square-to-grid everywhere).
  Extracted the 1.0.59 angle lock into a shared `lockToAngle(prev, p, grid)`
  in `lib/snapping.ts`, now used by BOTH 2D `applySnaps` and 3D
  `snapDraftPoint`/`snapCornerPoint` so they can't drift. A near-axis 2D wall
  snaps exactly to 0/45/90°; the existing free-angle exemption while tracing
  over an imported background is kept. Verified: near-horizontal draw commits
  at mod-45 ≈ 0.00; with a background set the same draw keeps its free angle.
- Tool-dock buttons get a native `title` (they already had aria-label +
  data-tip).

### For Codex / next session

- Konva label probing: `window.Konva.stages[0].find('Text')`, check
  `textArr.length` for wrap lines; duplicate-length walls make text-matching
  ambiguous (match on the unique length or the parent Group position).
- Room label still sits at the polygon centroid — a future nicety is to place
  it at the pole-of-inaccessibility (largest inscribed circle) so L-shaped
  rooms label in the open area, not on a wall.

## 1.0.59 - 2026-07-19 (versionCode 10059)

The "actual app quality" release. Owner (with IKEA planner screenshots):
"Drawing walls in 3D is clunky and nearly unusable — it needs to snap to
existing walls and stay square to the grid; after, you should be able to
drag the points to change the wall. Exact dimensions need to be an option
too. From beginner to architect." Plus a full UX audit of 18 headless
screenshots that found 3D (not 2D) is the quality gap vs Planner 5D.

### Added — IKEA-grade wall drawing in 3D (`Scene3D.tsx`)

- **Snapping**: every 3D draft point runs through the SAME prioritized snap
  engine as 2D (`snapping.ts` buildSnapElements/nearestSnap: wall endpoints >
  midpoints > guides > edges) via new `snapDraftPoint()`; taps within 12° of
  a 45° multiple from the previous point lock to that angle, and cardinal
  segments keep the shared coordinate exactly (truly square walls).
- **IKEA-style guides + live dimensions**: while drafting, yellow guide
  strips show the axis cross through the latest point + the extension of the
  segment just drawn; every ghost segment carries a floating dimension pill
  (drei `Html`, `.ghost-dim`).
- **Exact dimensions**: the draw affordance gains a length input in 3D
  (type 3.5 + Enter → the just-drawn segment becomes exactly 3.50 m along
  its snapped direction) via new `drawBridge.setLength`.
- **Drag points after drawing**: selecting a wall in 3D shows yellow ring
  gizmos at both endpoints (`WallEndpointHandles`; same raycast-distance-0 /
  frozen-camera / controls-pause tricks as the anchor puck). Dragging
  previews with a guide + live length and commits through the corner-aware
  `moveCorner`, snapped to other walls' endpoints (`snapCornerPoint`).
- **Furniture yields while drawing**: `Furniture3D` ignores taps when a
  build tool is armed so they fall through to the floor (a tap on the dining
  table used to hijack the draft — the actual "clunky" bug). Wall taps also
  draft now (their plan position is used), so kitchen runs can be tapped out
  along a wall.

### Changed — storey visibility + camera + walk (the audit fixes)

- **Storeys above the active floor hide in 3D** (`DesignScene.tsx`): zooming
  into a ground-floor room is no longer blocked by the upper storey's slab —
  the blank-white-screen zoom (tester report, reproduced in renders) is
  gone. FloorSwitcher reveals upper storeys by switching. Dollhouse fade now
  applies only to the ACTIVE storey (context floors stay solid); faded
  opacity 0.1 → 0.18.
- **Camera target clamps**: anchor-puck drags and `orbitFocus` clamp to the
  design bounds + 2 m, so the camera can never be parked in the void.
- **Walk mode spawns in the largest room** at eye height facing its
  furniture (was: building centroid, often nose-first into a wall).
- Fixed a crash-frame during walk-mode transitions (PointerLockControls
  have no `.target`; FocusAnchor/orbitZoom/orbitFocus now guard).

### For Codex / next session

- Verified headless: snap math (endpoint join / square / corner-join all
  exact), real 3D taps → +1 wall snapped to 45° and typed 350 cm length,
  kitchen run along a wall (+3 cabinets), closeup + max-zoom screenshots
  show interiors (not blank slabs), focus-clamp, paint popover + undo/redo
  regressions green, no page errors.
- Screen-fraction click probes are camera-dependent — drive the camera to a
  known state (orbitFocus + orbitZoom) before click-based steps.
- 3D build follow-ups still open: openings from 3D wall taps, desktop-3D
  entry point, hover ghost-to-cursor on desktop.

## 1.0.58 - 2026-07-18 (versionCode 10058)

Full quality-control audit (owner: "quality control audit let's go"). A
read-only sweep produced 21 findings; everything actionable ships here.

### Fixed — Pro paywall bypasses (owner chose: gate with upsell)

- **Kitchen-run uppers**: `addKitchenRun` only places `wall_cabinet` (Pro)
  uppers for Pro users; the "Wall cabinets" toggle in the draw affordance
  shows a crown and routes through `requirePro('catalog')` for free users.
  Base-cabinet runs stay free.
- **Appliance-slot swaps**: Pro slot chips (Drawers, Dishwasher) show a crown
  and open the upsell for free users; free slots (Cabinet/Stove/Sink) still
  swap instantly.
- **Opening styles**: Pro door/window styles in the Style dropdowns (double,
  sliding, pocket, bi-fold, arch, french, casement) show 👑 and gate through
  `requirePro('catalog')`. The Pro set is DERIVED from the catalog's `pro`
  flags (`PRO_OPENING_STYLES` in PropertiesPanel) so it can't drift.

### Fixed — i18n batch (~68 new keys × 12 locales, `scripts/add-translations5.py`)

- **ImportDialog fully translated** (was 100% English): title, dropzone,
  status, trace options, DXF summary, buttons, error strings.
- **Toolbar**: all toasts + every title/aria-label.
- **ProjectsScreen**: `timeAgo`, the destructive delete confirm, toasts,
  per-card aria-labels. **ShoppingList**: copy/save toasts.
- Hardcoded aria-labels/titles across App (zoom/units/tips), ToolDock,
  FloorSwitcher, RotateControls, Scene3D popover close, texture preview.
- `ErrorBoundary` deliberately stays English (i18n may be the crashing
  module) — now documented in a comment.

### Fixed — robustness & types

- `Toolbar.saveToFile`/`openFromFile` and `App.handleRender` no longer leak
  unhandled promise rejections — try/catch with translated error toasts.
- `native.ts` uses the real `Encoding.UTF8` enum (was `'utf8' as any`).
- Project import validates `floorGeom[*].openings` per storey (orphan
  openings whose wall is gone are dropped on EVERY floor, not just the
  active one). `version: 1` fallback strategy documented in `projectIO.ts`.
- Removed `as never` casts: opening Style selects are typed `OpeningStyle`,
  `pickAt` in Canvas2D returns `Selection['kind']`, ProjectsScreen loads
  snapshots as `MaybeFloored`, stage comparison cast dropped.

### Fixed — perf & consistency

- `ImportDialog` + `ProjectsScreen` now use narrow store selectors (they
  subscribed to the whole design store and re-rendered on every edit).
- Wall-thickness default (12 cm) unified: `DEFAULT_WALL_THICKNESS` in
  `furnitureCatalog.ts` feeds both the store default and the samples.

### Known warts (documented, not fixed — for Codex)

- `setActiveFloor` isn't undoable: undo after switching floors restores the
  edit-time active floor. Mild UX wart.
- PDF export switches active floors during capture (restored in `finally`)
  — a "read-only" export churns autosave state.
- Refactor candidates: Canvas2D.tsx (~2100 lines), DesignScene.tsx (~840),
  Scene3D.tsx (~750).

### Verified headless

Free user: kitchen run adds 6 bases + 0 uppers; Drawers chip → upsell, type
unchanged; Stove chip works; style→double → upsell, style unchanged. Pro:
uppers place (+4), style change works. Undo/redo around kitchen runs intact.
Orphan-opening project file: orphans dropped on both storeys, valid opening
kept. French: ImportDialog + delete confirm fully translated (screenshots).

## 1.0.57 - 2026-07-18 (versionCode 10057)

Owner: "keep up the quality improvements." 2D kitchen drawing quality + two
plan-pack completions.

### Added

- **Real 2D symbols for kitchen casework** (`lib/symbols.ts`): shape
  `'counter'` (counters, islands, base/drawer/corner cabinets) now draws as a
  proper plan symbol — outline, worktop front-edge line, centred pull —
  instead of the unstyled fallback rectangle; shape `'box'` gets light
  crossed diagonals so generic volumes stop looking like placeholders.
- **Wall-mounted items draw dashed in 2D** (plan convention): `FurnitureSymbol`
  takes `dashed`, and `Canvas2D` sets it for any catalog entry with
  `mountY > 0` (wall cabinets). Kitchen runs with uppers now read like a real
  kitchen drawing — dashed uppers over solid base cabinets — instead of two
  overlapping solid rectangles.
- **Plan-pack summary additions** (`lib/planExport.ts` / `planSchedule.ts`):
  each storey section gains a **Wall length** row (total linear wall run —
  paint/skirting estimates), and the pack ends with the **Shopping list**
  (same `lib/bom.ts` aggregation as the in-app panel: item, footprint,
  quantity). One new key ('Wall length') added to all 12 locales.

### For Codex / next session

- Verified headless: kitchen run placed via `addKitchenRun`, zoomed 2D
  screenshot shows solid base + dashed uppers + stove burners/sink bowl; PDF
  re-exported and text-grepped for "Wall length" / "Shopping list".
- 2D symbol registry now covers every `Shape3D` (the `comm -23` diff of
  catalog shapes vs symbols is empty).

## 1.0.56 - 2026-07-18 (versionCode 10056)

Owner: "keep working on making something people will actually pay for." PDF
export is already a Pro gate, so this release turns it from a screenshot-on-A4
into a professional **plan pack** — output you can hand to a builder,
landlord or kitchen fitter.

### Added

- **PDF plan pack** (`lib/planExport.ts` rewrite + new `lib/planSchedule.ts`):
  - Every floor page now carries a **true paper scale bar** (round length,
    e.g. 3.00 m, plus an approximate ratio like "~ 1:65") and the storey's
    **floor area** bottom-right. The capture bridge (`renderBridge.planCapture`)
    now returns `{ url, pxPerCm }` so the PDF knows the raster's real scale —
    `Canvas2D` computes it as `zoom × pixelRatio`.
  - A final **Summary page**: per-storey room schedule (name, bounding size,
    area — largest room first), floor totals, **Total living area**, and a
    **Doors & windows schedule** grouped by kind + size (uses the shared
    `openingLabel()` naming: Single/Double/Sliding/Pocket/Bi-fold door,
    Passage, Arch, Window/French/Casement/Sliding window).
  - PDF text translates via `t()` for cp1252-safe locales (en fr es de it pt
    nl); others keep English labels because jsPDF's built-in Helvetica can't
    encode them (mojibake would be worse). ~14 new keys added to all 12
    locales (`scripts/add-translations4.py`).

### Fixed

- **Plan capture no longer clips the overall dimensions.** The framed PNG/PDF
  capture pad grew 70 → 120 cm, so the building's outer "10.00 m"-style
  dimension lines and text render fully instead of being cut mid-glyph.
- **Room area labels no longer collide with wrapped names.**
  `DimensionsLayer.RoomDimension` estimates how many lines the room name
  wraps to (translated name, ~7.7 px/glyph in the 100 cm label box) and sits
  the area below — "Kitchen & Dining" no longer overprints "20.00 m²".

### For Codex / next session

- Verified headless by driving the real export in the dev server
  (`import('/src/lib/planExport.ts')` in page context + Playwright download
  capture, then text-grepping the PDF and re-rendering pages via pdfjs):
  3 pages for the two-storey sample, all schedule strings present, French
  labels translate, scale bar "3.00 m" at ~1:60–65, no label collisions.
- Possible follow-ups: imperial-first summary formatting for US users is
  already handled by `formatArea/formatLength(units)`; a wall-length (linear
  metre) row per floor would help paint/skirting estimates; the Summary page
  could also embed the shopping list (`lib/bom.ts`) as a page 4.

## 1.0.55 - 2026-07-18 (versionCode 10055)

Owner report on 1.0.54: "There's no lock button on 3d now."

### Fixed

- **Lock is directly visible in phone 3D again.** The Lock toggle was never
  removed — since 1.0.51 the phone 3D HUD folds Dollhouse/Walk/Lighting/Lock
  into the "View ▾" popover, so on a phone there was no *visible* lock button
  (2D shows one in the HUD row, 3D didn't — hence the report). A dedicated
  `Lock` pill now sits beside the View pill on phones (`.lock-pill-3d`,
  hidden ≥881px where the inline pill already shows it); the copy inside the
  View popover stays, and both bind the same `moveLock` store flag so they
  can't drift. Verified headless (390×844 touch): pill visible, toggle flips
  `moveLock`, popover checkbox mirrors it; desktop unchanged.
  (`App.tsx` hud-3d; `index.css` `.lock-pill-3d` show/hide.)

## 1.0.54 - 2026-07-18 (versionCode 10054)

Owner asks: build inside 3D, and one render button instead of two.

### Added

- **Build in 3D** (phones): the Build tab + sheet now also appear in 3D with
  the floor-drawing tools — Select, Draw walls, Draw room, Kitchen run. Arm a
  tool and tap the 3D floor/ground: taps place draft points (grid-snapped),
  a translucent blue ghost previews the wall chain (posts + slabs), and the
  same Finish/Cancel pill as 2D commits — walls chain via `addWall` (including
  the 1.0.53 room-splitting), rooms via `addRoom`, kitchen runs tile on the
  second tap. The camera anchor puck hides while a tool is armed so it can't
  steal floor taps. Openings (doors/windows) and measure/erase stay 2D-only;
  desktop 3D keeps the 2D dock workflow (sheet is phone-styled).
  (`Scene3D.tsx` — draft/ghost + tap routing; `BuildSheet` `limited` prop;
  `App.tsx` tab/sheet/affordance gates.)
- **Photo mode folded into Render image** (owner: "so we don't have two
  buttons"): the standalone Photo button is gone; the Render menu now offers
  Photo mode (path-traced, top tier) above Standard/High/Ultra.

### Fixed

- **Kitchen runs are hard-capped at 60 units.** A mis-tap near the 3D horizon
  could intersect the ground plane hundreds of metres out and explode a run
  into thousands of cabinets (hit in headless testing: 11k items).
  (`lib/kitchenRun.ts` tile().)

### For Codex / next session

- R3F gotchas learned here (they cost hours — don't rediscover them):
  in-canvas pointer handlers can hold **stale closures** (read the zustand
  store via `getState()` at event time, never trust captured props), and
  **store commits must never run inside a setState updater** (React dev
  double-invokes updaters → double walls).
- 3D build possible follow-ups: openings placement from 3D wall taps (needs a
  position-along-wall on `SurfaceTap`), a desktop-3D entry point for the build
  tools, and hover ghost-to-cursor on desktop.

## 1.0.53 - 2026-07-18 (versionCode 10053)

The owner's two asks (full translations, DWG import) + two tester bug fixes.

### Added

- **Complete translations** (tester: "some parts not fully translated"). ~160
  new keys across all 12 locales in three batches (`scripts/add-translations*.py`,
  kept for reference): the whole Properties panel (labels, options, toasts,
  alignment tooltips, texture cards, background props), all furniture catalog
  names, material names + family groups, floor materials, room styles, catalog
  categories/groups, kitchen-unit chips, lock/kitchen-run strings, sample room
  names, and the empty-state copy. PropertiesPanel + the 3D paint palette now
  render through t(); stored room/item names display-translate via t() so
  catalog-derived names localize while user-renamed ones pass through.
  Verified visually in French and Japanese.
- **DWG import** (tester ask: "import the output from complex software").
  Import plan now accepts `.dwg` directly: the file converts to DXF **in the
  browser** via LibreDWG compiled to WASM (`@mlightcad/libredwg-web`,
  `dwg_write_dxf`) and feeds the existing DXF pipeline unchanged (unit
  detection, wall extraction, editable geometry). The ~10 MB WASM lives in a
  lazy chunk fetched only when a .dwg is picked. Verified headless with a real
  AutoCAD 2000 file → "found 66 wall segments". Note: the dep must stay in
  `optimizeDeps.exclude` (vite pre-bundling separates the emscripten glue from
  its wasm → magic-word crash).

### Fixed

- **Flooring now stays inside walls** (owner report: "when I draw a new wall
  the flooring doesn't stay in the boundary of the room"). Drawing a wall
  across a room splits the room polygon along the wall (`src/lib/roomSplit.ts`
  + `addWall`): the larger half keeps the room's identity/finish, the smaller
  half becomes a new "Room" with the same finish. One undo step reverts wall +
  split. Same family as 1.0.47's room-bounded wall paint, now for floors.
- **Floor pills / tip bubble overlap** (owner screenshot): the floor switcher
  also hides while a draw tool is armed in 2D (the armed-tool tip renders
  top-centre and collided with the top-left pills on phones).

## 1.0.52 - 2026-07-17 (versionCode 10052)

Owner + tester follow-ups on 1.0.51.

### Changed

- **Camera anchor is now a visible, movable puck** (owner: "instead of double
  tap do an icon that can be moved like in IKEA kitchen builder"). An
  IKEA-style widget (white directional arrows + blue move-cross) lies on the
  floor at the orbit target; dragging it pans camera + target together, so
  orbit/pinch-zoom revolve around wherever it's parked. Drawn as a gizmo
  (depth-test off, late render order) so it's visible over furniture, with
  raycast distance forced to 0 so it wins the grab even when objects are
  physically closer. 1.0.51's double-tap + deferred palette are removed — the
  flooring palette opens instantly again. (`FocusAnchor` + `makeAnchorTexture`
  in `Scene3D.tsx`; `orbitFocus` bridge kept for programmatic focus, e.g. a
  future photo-mode anchor.)
- **One-gesture furniture drag on touch** (tester chat: "when I'm moving
  furniture around it's taking some time to actually move" — the "fluidity"
  report from 4/13 clarified). The old rule made the first touch-drag only
  select; now dragging moves immediately on all pointer types. The 8px
  drag-slop still separates taps from drags, and the 1.0.51 **Lock** toggle is
  the explicit accidental-move protection (undo also covers mistakes).
  (`Canvas2D.tsx` furniture `draggable`.)

### Tester-report coverage map (Phase 2, for Codex)

- 2/13 "import output from complex software": PDF/DXF/image import already
  exists (Import plan); **DWG import** stays on the roadmap. Reply to the
  tester pointing at Import plan.
- 4/13 "fluidity" + chat: addressed by 1.0.50 (orbit frames) + the one-gesture
  drag above. Follow up with the tester on-device.
- 5/13: 2D pan lag (largely fixed 1.0.43/1.0.50 — owner reports improvement);
  "bottom navigation bar sometimes covers buttons" — could not reproduce from
  the report alone, likely device nav-bar/safe-area overlap on specific
  phones: ask for a screenshot + device model; **"some parts not fully
  translated" is REAL** — known gap: Properties panel labels, material and
  furniture names are English-only across all 12 locales. That's the next
  meaty i18n task (wrap PropertiesPanel strings in t(), add name keys for
  catalog entries + materials to every locale).
- 10/13 rotation input + lock: shipped in 1.0.51.

## 1.0.51 - 2026-07-17 (versionCode 10051)

Tester-feedback batch (Phase-2 reports) + billing hardening.

### Added

- **Lock objects** (tester ask: "a lock button… fixes the objects and allows you
  to freely navigate"). New `moveLock` toggle — 2D HUD pill ("Lock"), the 3D
  desktop pill and the phone View popover ("Lock objects"). When on, furniture
  can't be dragged in 2D or 3D (selection still works); in 3D, drags fall
  through to the camera, so touch navigation can't shift objects.
  (`designStore.moveLock`, gates in `Canvas2D` `draggable` + `Furniture3D.beginDrag`.)
- **Exact rotation entry** (tester ask: slider too coarse on small phones) — a
  Blender-style "Angle (°)" numeric input under the rotation slider in the
  Properties panel.
- **Camera focus anchor, IKEA-style** (owner ask): **double-tap a floor in 3D**
  to move the orbit target there and dolly part-way in — pinch/wheel then zooms
  into that exact area. The floor paint palette now opens after a ~300 ms
  single-tap delay so the double-tap can win (the palette used to swallow the
  second tap). Focus aims at 0.6 m height so the view doesn't tilt into the
  boards. (`renderBridge.orbitFocus` registered by `ZoomBridge`; double-tap
  detection in `Scene3D.handleSurfaceTap`.)

### Changed

- **Referral program retired** (enough test users): no codes are redeemable —
  `HOMEDESIGN50` removed from `lib/referral.ts` and the "Have a referral code?"
  entry UI removed from the upsell modal. Devices that already redeemed KEEP
  Pro (redemption is honored locally; nothing is revoked). Orphaned locale
  strings left in place for a future campaign.

### Fixed

- **Purchase flow hardening** (owner report: "not sure the purchase flow
  works"): if Play completed the transaction but the RevenueCat dashboard
  doesn't map the product to an entitlement, the app used to swallow the paid
  purchase silently (no unlock, no message). Now any owned product after a
  successful `purchasePackage` counts as Pro, and a false result without an
  error shows "Purchase didn't complete… use Restore purchase" instead of
  nothing. (`pro.ts` purchase(), `proStore.purchase`.)

### Handoff — billing verification + Google Sign-In plan (for Codex / next session)

**Verifying the purchase flow end-to-end** (can't be done from a sandbox; needs
the owner + a device): add your Google account as a **License tester** in Play
Console → Settings → License testing; install from the **internal testing**
track (not a sideloaded AAB); trigger any Pro gate → buy (license testers see
"Test card, always approves"); then in RevenueCat dashboard confirm the
customer shows the `pro_unlock` purchase AND the `Pro` entitlement turns
active. If the purchase appears WITHOUT the entitlement, the product isn't
attached to the entitlement in RevenueCat → attach it (the 1.0.51 client
hardening keeps users unlocked either way). Also test "Restore purchase" after
clearing app data.

**Google Sign-In / Pro on other devices & web** (owner ask: "how can someone
access their premium account on the website"): today Pro is device+Play-account
bound (RevenueCat anonymous IDs; the web build is a free demo with no billing).
Recommended architecture, no custom backend needed:
1. Add Google Sign-In via a Capacitor plugin (e.g. `@capgo/capacitor-social-login`)
   + Google Identity Services on web.
2. On sign-in call `Purchases.logIn(googleUserId)` so the RevenueCat customer —
   and the Pro entitlement — follows the account across installs/devices.
3. Web Pro then works either by (a) RevenueCat Web Billing (Stripe) to sell on
   web too, or (b) read-only entitlement check on web via logIn + getCustomerInfo.
4. OWNER PREREQS (only the owner can do these): create OAuth clients in Google
   Cloud Console — a Web client ID + an Android client ID bound to package
   `com.homedesigner.app` and the upload key SHA-1
   (`keytool -list -keystore homedesigner-upload.jks` → SHA-1); if using
   RevenueCat Web Billing, connect Stripe in the RevenueCat dashboard.
Scope estimate: 1–2 sessions once the OAuth client IDs exist.

## 1.0.50 - 2026-07-17 (versionCode 10050)

### Fixed

- **3D orbit fluidity** (tester report: "struggling with the fluidity of the
  movements"). 1.0.47's demand-rendering (`frameloop='demand'`) saves battery on
  an idle scene, but OrbitControls **damping** depends on an
  invalidate-per-frame chain — on a loaded phone any dropped link kills the
  inertia, so orbiting feels sticky/stuttery. The canvas now switches to
  continuous rendering **while a pointer is down / wheel is active** and falls
  back to demand ~1.2 s after the gesture ends (long enough for the damping tail
  to ease out). Idle battery behaviour is unchanged.
  (`src/components/Viewer3D/Scene3D.tsx` — `interacting` state wrapping the
  Canvas; `frameloop={walkMode || interacting ? 'always' : 'demand'}`.)
- For Codex: if testers still report stutter after this, the next suspects are
  (a) `AdaptiveDpr` interacting with demand mode, (b) first-interaction jank
  from GLB decode on the main thread, (c) the composer cost on non-lowPower
  devices. Ask testers for device + 2D/3D specifics.

## 1.0.49 - 2026-07-16 (versionCode 10049)

Phase 2b — the modular kitchen designer's auto-run tool. Feature-complete for
base + upper cabinet runs with appliance slots.

### Added

- **Kitchen-run tool** — a new build tool (`CookingPot` icon, `tool: 'kitchen'`).
  Tap along a wall, tap again, and it auto-tiles Base Cabinets end-to-end across
  the span in one undo step, each unit rotated so its back is to the wall and its
  front faces the room (orients toward the nearest room's centre, so it's correct
  on any wall). Snaps to walls/grid like the wall tool.
  - **Live ghost preview**: while dragging, translucent cabinet footprints tile
    from the start tap to the cursor, each with a front-edge tick, so you see the
    row and its facing before committing (matches the furniture placement ghost).
  - **Upper cabinets in the same gesture**: a "Wall cabinets" toggle in the draw
    bar (default on, persisted) also tiles Wall Cabinets above the base run — set
    back so their backs align with the deeper base units, mounted at `mountY` 120.
  - Tiling + facing math is shared by the ghost and the commit
    (`src/lib/kitchenRun.ts` → `kitchenRunUnits` / `kitchenUpperUnits`) so they
    can't drift.
  - Store: `addKitchenRun(a, b)`, `kitchenUppers` flag + `setKitchenUppers`.
  - Wiring: `src/data/tools.ts`, `src/components/Editor2D/Canvas2D.tsx`,
    `src/types/index.ts` (`ToolMode` += `'kitchen'`), tool hint + toggle in
    `src/App.tsx`.
- **Appliance slots** — select any unit in a run and swap it in place between
  Cabinet / Drawers / Stove / Sink / Dishwasher via chips in the Properties panel
  ("Kitchen unit" section). The swap keeps the unit's slot footprint, position and
  facing, so the run stays aligned. Store: `swapFurnitureType(id, newType)`.

### Handoff — where this is and what's next (for Codex / next session)

The kitchen designer core loop is done: draw a run → ghost preview → auto-tiles
base + wall cabinets facing the room → swap any slot to an appliance. Built on
1.0.48's real Kenney CC0 kitchen models + modular units + `mountY` support.

Remaining polish (low priority, none blocking):
1. **2D symbol** — a proper cabinet symbol for `shape: 'counter'` (falls back to a
   plain box outline in the 2D plan now).
2. **Run grouping** — a `groupId` on run items so a whole run can be
   moved/deleted/duplicated as one (today each unit is independent).
3. Optional: snap a run's ends to adjacent walls/corners for a perfect fit.

Deferred with reason: a **3D placement ghost** — 3D placement is tap-to-place and
touch has no hover, so a follow-cursor ghost only helps desktop-web; the live 3D
drag already previews after placement. Low ROI for a mobile-first app.

Bigger roadmap bets still open: **Fit & Flow Coach** (spatial "does it work"
scoring — the strongest differentiator), **DWG import**, and moving the model
long-tail to Codex's Quaternius→Blender→R2 cloud pipeline for more realism.

## 1.0.48 - 2026-07-16 (versionCode 10048)

### Added

- Real 3D models for the **fridge**, **kitchen sink**, and **stove** from the
  Kenney CC0 Furniture Kit (`scripts/fetch-kenney.mjs`, bundled in
  `public/models/`) — Poly Haven has no modern kitchen appliances, and Kenney
  ships ready-made glTF so no Blender/cloud step is needed. The fridge/sink
  replace procedural boxes; the stove replaces the Poly Haven model so the whole
  kitchen zone is stylistically cohesive. Upgraded procedural meshes stay as the
  offline/load fallback.
- Modular kitchen units — **Base Cabinet**, **Drawer Unit**, **Corner Cabinet**,
  and **Wall Cabinet** (Kenney CC0) — place a row of them to build a custom
  kitchen run. These are the building blocks for the upcoming auto-run kitchen
  designer.
- **Wall-mount support** for furniture (`mountY` on catalog entries): items rest
  their base a set height above the floor instead of on it, so upper cabinets
  hang at counter-clearance height. (`src/components/Viewer3D/Furniture3D.tsx`)

### Improved

- Better procedural kitchen + TV meshes (fallbacks behind the real models where
  available). (`src/components/Viewer3D/Furniture3D.tsx`)
  - New `counter` shape for `counter` and `island`: recessed toe-kick, cabinet
    body, overhanging countertop, and footprint-derived door fronts with bar
    handles (was a featureless box).
  - `fridge`: modern two-door stainless body with a seam and vertical bar
    handles (was a plain box + stub handle).
  - `tv`: flat panel on a slim central stand with a thin bezel and emissive
    screen (was a floating slab).

## 1.0.47 - 2026-07-15

### Added

- Interactive 3D furniture previews with orbit, zoom, dimensions, and explicit
  placement.
- Room and object-type catalog navigation alongside search and recent items.
- A versioned Cloudflare R2 catalog that loads additional CC0 models on demand,
  caches validated manifests, and falls back safely when offline.
- The first cloud catalog batch: 32 optimized Quaternius CC0 furniture and
  interior models.
- More realistic sample homes using bundled GLBs for 87 of 149 placements.
- Direct furniture placement from 3D build mode.
- Room-bounded wall painting, including independent finishes for adjacent rooms
  that share one long structural wall.

### Improved

- Reduced 2D canvas pixel cost on high-density phones.
- Changed the main 3D orbit view and furniture previews to render on demand.
- Reduced mobile 3D resolution and environment-map cost under load.
- Reduced furniture drag raycasting to one interaction proxy per object.
- Improved build-mode guidance, catalog grouping, mobile controls, and safe-area
  spacing.

### Fixed

- Wall paint no longer crosses room boundaries simply because rooms share a
  continuous wall.
- Furniture dragging explicitly requests frames in demand-rendering mode.
- Interrupted Android gestures no longer leave orbit controls stuck.
- Missing or corrupt cloud models fall back to procedural furniture instead of
  breaking the scene.

### Delivery

- Android version code: `10047`.
- Cloud models are hosted outside the AAB and download only when required.
- The R2 development catalog was verified with 32 public model downloads and a
  byte-identical 32-entry manifest.

## 1.0.44 - 2026-07-14 (versionCode 10044)

3D-view fixes layered on top of 1.0.43 (which did not touch the 3D view).

### Fixed

- 3D "fades to white" on zoom-out: distance fog ran inside the max orbit
  distance and washed the whole model to the fog colour. Fog now sits past the
  orbit range and only softens the far ground/grid horizon.
  (`src/components/Viewer3D/Scene3D.tsx`)
- 3D "fades to black" on zoom-in: raised `OrbitControls` `minDistance` 2→3 so a
  full dolly-in can't end up inside the geometry.
- Top-left UI overlap: the floor switcher is hidden while a draw gesture is
  active, so it no longer collides with the centred "Tap points / Finish" pill
  on phones. (`src/App.tsx`)

## 1.0.43 - 2026-07-14 (versionCode 10043)

Mobile editor fluidity pass.

### Changed

- 2D touch pan + pinch-zoom handled imperatively through refs, committing one
  final viewport update (`setViewport`) at the end of a gesture instead of every
  intermediate frame — far fewer React renders during continuous mobile
  gestures. (`src/components/Editor2D/Canvas2D.tsx`)
- Added focused `useShallow` selectors to cut unrelated re-renders.
- Refined bottom tool/nav layout, tool dock, toolbar, build sheet, properties
  panel, and floor switcher for phones; floor switcher more compact on mobile.
- Furniture catalog unmounted while closed; picking an object closes it on mobile.

### Added

- Store-level `setViewport` action; `.ai/CODEX_CLAUDE_HANDOFF.md` handoff doc.

## 1.0.42 - 2026-07-13 (versionCode 10042)

Android mobile-performance pass.

### Changed

- Autosave coalescing: project writes to `localStorage` debounced (600ms),
  bound to the captured project, flushed on background/close — removes the
  synchronous per-edit write that stalled the WebView main thread during drags.
  (`src/store/designStore.ts`, `src/lib/projects.ts`)
- Lightweight 3D tier on touch devices: skip post-processing, soft/contact
  shadows and MSAA, cap DPR at 1.5, request the high-performance GPU.
  (`src/components/Viewer3D/Scene3D.tsx`)

## 1.0.41 - 2026-07 (versionCode 10041)

- Objects catalog opens as a half-height bottom sheet on mobile (plan stays
  visible/tappable behind it).

## 1.0.40 - 2026-07 (versionCode 10040)

- 2D pan made imperative (Konva layer moved directly, no per-move React
  re-render); fixes pan frame-rate on high-refresh phones.

## 1.0.39 - 2026-07 (versionCode 10039)

- Fixed 3D "View" button text clipping; moved 2D zoom controls to the right edge.

## 1.0.38 - 2026-07 (versionCode 10038)

- 3D post-processing failures degrade to the plain scene via an error boundary
  instead of crashing the view (seen on some GPUs, e.g. Pixel 10 Pro).

## 1.0.37 - 2026-07 (versionCode 10037)

- Fixed extreme 2D lag on ultra-high-DPI phones by capping `Konva.pixelRatio`.

## 1.0.36 - 2026-07 (versionCode 10036)

- Added 20 more realistic CC0 (Poly Haven) furniture models.

## 1.0.35 - 2026-07 (versionCode 10035)

- Added 9 realistic CC0 furniture models + 2 new catalog items.

## 1.0.34 - 2026-07 (versionCode 10034)

- Grouped photoreal CC0 texture library for walls & floors (Planner-5D-style
  grouped material pickers).

## 1.0.33 - 2026-07 (versionCode 10033)

- Fixed the status bar overlapping app content on Android.

## 1.0.32 - 2026-07 (versionCode 10032)

- Planner-5D-style mobile UI grouping; touch fixes to prevent accidental
  furniture moves; easier wall drawing.

## 1.0.31 - 2026-07 (versionCode 10031)

- Wall editing in 3D; warmer dollhouse aesthetic.

## Earlier (1.0.0 – 1.0.19)

Condensed from git history; see `git log` for full detail.

- 1.0.19 — dark mode, Settings, branded adaptive icon, support & crash channels.
- 1.0.18 — multi-floor PDF export, Pixel WebGL-detection fix, photo-mode dollhouse.
- 1.0.17 — promo-grade dollhouse look (wall caps, airier interiors).
- 1.0.16 — one-tap room style presets.
- 1.0.15 — 16 new CC0 (Poly Haven) 3D furniture models.
- 1.0.14 — report referral redemptions to RevenueCat; fix referral Pro loss.
- 1.0.13 — shopping list (aggregated furniture BOM with copy/CSV export).
- 1.0.12 — guided/effortless UX batch; ghost-tap fix.
- 1.0.11 — walk-through and photo mode on mobile.
- 1.0.10 — furnishing power tools (align/distribute) + full opening styles.
- 1.0.9 — Mobile Feel Pack (haptics, undo toasts, 3D empty state, back-button fix).
- 1.0.5 – 1.0.8 — purchase-flow resilience (RevenueCat timeouts, real error
  messages, closed-testing version bumps).
- 1.0.3 – 1.0.4 — referral code system for early testers.
- 1.0.1 – 1.0.2 — launch-crash fix for keyless native builds; store assets.
- 1.0.0 — initial release train (version sync, store assets, RELEASING.md).
