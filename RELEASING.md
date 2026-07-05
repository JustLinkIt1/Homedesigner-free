# Releasing HomeDesigner to Google Play

Everything in this guide runs on **your machine** (it needs Android Studio /
the Android SDK, your signing keystore, and your Play & RevenueCat accounts).
The repo itself never contains keys or secrets.

The app id is `com.nathanjoppich.homedesigner`. The one-time Pro unlock is a
non-consumable in-app product with id **`pro_unlock`** ($6.99), delivered
through RevenueCat as the entitlement **`pro`**.

---

## 0. One-time machine setup

- Node 22+, JDK 17+, Android Studio (or the command-line SDK) with an
  Android 34+ platform installed.
- Clone the repo and `npm ci`.

## 1. One-time: signing keystore

Generate an **upload keystore** (Play App Signing keeps the real app key):

```bash
keytool -genkeypair -v \
  -keystore ~/keystores/homedesigner-upload.jks \
  -alias upload -keyalg RSA -keysize 2048 -validity 10000
```

Then create `android/keystore.properties` (already gitignored, as is `*.jks`):

```properties
storeFile=/home/you/keystores/homedesigner-upload.jks
storePassword=...
keyAlias=upload
keyPassword=...
```

Back the keystore + passwords up somewhere safe (password manager). If the
upload key is ever lost, Play App Signing lets you register a new one — but
only if App Signing was enabled from the first upload (it is by default).

## 2. One-time: Play Console app + first AAB

1. Play Console → **Create app** → name "HomeDesigner", app, free.
2. Build the first bundle (see §5) and upload it to **Internal testing**.
   ⚠️ **Do this before creating the in-app product** — Play won't let you add
   IAPs until an APK/AAB with the BILLING permission has been uploaded, and
   the RevenueCat billing SDK adds that permission automatically.
3. Complete the release questionnaires:
   - **Data safety**: one row — *Purchase history*, collected, shared with a
     service provider (RevenueCat), **not** linked to identity, **not** used
     for ads, encrypted in transit, no deletion mechanism needed (anonymous
     ID). Everything else (designs, settings) stays on-device — declare "no
     other data collected".
   - **Privacy policy URL**: `https://justlinkit1.github.io/Homedesigner-free/privacy.html`
   - Content rating: everyone; no ads.
4. Play Console → **Monetize → Products → In-app products** → Create:
   - Product ID `pro_unlock`, one-time (managed) product, price **$6.99**,
     title "HomeDesigner Pro", description "Unlimited floors & projects, full
     catalog, watermark-free renders, PDF export." → **Activate** it.
5. **License testing** (Play Console → Settings → License testing): add your
   own Google account so purchases in internal testing are free sandbox
   purchases that can be repeated.

## 3. One-time: RevenueCat

1. Create a project at app.revenuecat.com → add an **Android (Play Store)**
   app with package `com.nathanjoppich.homedesigner`.
2. Connect Play: create a Google Cloud **service account** with the Play
   Android Publisher role, grant it access in Play Console → Users &
   permissions, and upload its JSON credentials to RevenueCat (their in-app
   wizard walks through this; propagation can take ~24 h the first time).
3. **Products**: import `pro_unlock` from Play.
4. **Entitlements**: create `pro` (must match `ENTITLEMENT_ID` in
   `src/lib/pro.ts`) and attach `pro_unlock` to it.
5. **Offerings**: the `default` offering with one **lifetime** package
   containing `pro_unlock`. The app buys the first available package of the
   current offering.
6. Copy the app's **public Google API key** (starts with `goog_`) — it's
   used at build time in §5. It is a *publishable* key, safe to embed in the
   binary, but we keep it out of the repo anyway.

## 4. Every release: bump the version

```bash
# edit "version" in package.json (plain x.y.z), then:
npm run sync-version     # writes versionName/versionCode into android/app/build.gradle
```

`versionCode = major*10000 + minor*100 + patch`, so 1.0.0 → 10000 and every
semver bump sorts upward. `npm run sync-version -- --check` verifies without
writing (useful in CI).

## 5. Every release: build the bundle

```bash
npm ci
VITE_REVENUECAT_ANDROID_KEY=goog_xxxxxxxx npm run build
npx cap sync android
cd android && ./gradlew bundleRelease
```

The signed bundle lands at
`android/app/build/outputs/bundle/release/app-release.aab`.
Upload it in Play Console (Internal testing first; promote to Production
after the checklist below passes).

Notes:
- The web deploy (GitHub Pages) intentionally builds **without** the
  RevenueCat key — on web the Buy button links to the Play listing. Set
  `PLAY_STORE_URL` in `src/lib/appInfo.ts` to the real listing URL once the
  app page exists.
- `minifyEnabled` is deliberately `false` for 1.0 (no R8 surprises at
  launch). Revisit post-launch with proguard rules if APK size matters.

## 6. On-device checklist (internal testing, license-tester account)

Purchase flow
- [ ] Fresh install → app opens to the projects home; sample project works.
- [ ] Tap **+ Floor** → upsell shows the live Play price → **buy** with the
      license tester → floors unlock immediately, no restart.
- [ ] After purchase: renders/photos save without watermark; PDF export
      works; locked catalog items are unlocked; extra projects can be
      created.
- [ ] Kill the app, turn on airplane mode, relaunch → still Pro (cached
      entitlement).
- [ ] Settings → Apps → HomeDesigner → **Clear data**, relaunch online →
      **Restore purchase** in the upsell brings Pro back.
- [ ] Start a purchase and back out of the Play sheet → app stays free,
      no crash, upsell can be reopened.

App behaviour
- [ ] Android back: editor → projects home → (from home) exits; drawers and
      dialogs close before navigation.
- [ ] Render image + Photo mode on a mid-range phone: no thermal shutdown;
      files land in Downloads/share sheet works.
- [ ] Rotate + resize: 2D editor and 3D view stay usable.
- [ ] A design saved before this release (single-slot save) appears as a
      project card and opens with all floors intact.

## 7. Store listing assets

`store/` contains generated assets (`npm run screenshots` regenerates them
from the live app — run `npm run build` first):

- `icon-512.png` — Play Store icon (512×512)
- `feature-1024x500.png` — feature graphic
- `phone-*.png` (1080×2340), `tablet7-*.png` (1200×1920),
  `tablet10-*.png` (1600×2560) — screenshots for each device class

Suggested listing copy:

> **Short description** (80 chars max):
> Draw floor plans in 2D, furnish every room, and walk through your home in 3D.
>
> **Full description**: open with the 2D→3D loop, then bullets: PDF/DXF/image
> import with automatic wall tracing · CAD-style snapping & exact dimensions ·
> furniture catalog with real 3D models · photorealistic photo mode ·
> multi-floor homes, PDF export and the full catalog with the one-time Pro
> unlock (no subscription).

## 8. After launch

- Watch RevenueCat's overview for purchase/restore errors.
- Crash triage: consider adding Sentry in a 1.1 release (it adds a data-safety
  row, so it was deliberately left out of 1.0).
- When changing gated features, keep the golden rule from the code:
  **gates apply to creating/exporting only — never to loading, rendering,
  undo or persistence.** A pre-Pro multi-floor save must stay fully usable.
