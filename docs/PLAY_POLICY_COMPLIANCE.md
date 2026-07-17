# Google Play policy compliance audit

Audited 2026-07-17 at v1.0.50 (versionCode 10050), following the three domains
of Google's `play-policy-insights` skill (permissions/API hygiene, user
accounts & identity, data safety & privacy). Re-audit when adding any SDK,
permission, login system, analytics, or ads.

## Verdict: compliant in code. Two action items live in the Play Console, not the repo (see bottom).

## 1) Permissions & API hygiene — PASS

Merged release manifest contains only normal-level permissions:

| Permission | Source | Risk |
| --- | --- | --- |
| `INTERNET` | app | normal |
| `ACCESS_NETWORK_STATE` | Capacitor | normal |
| `VIBRATE` | @capacitor/haptics | normal |
| `com.android.vending.BILLING` | RevenueCat/Play Billing | normal |
| `…DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` | AndroidX auto | internal |

- **Zero restricted/runtime permissions**: no location, camera, microphone,
  contacts, SMS, call logs, storage, `QUERY_ALL_PACKAGES`, no foreground
  services. Nothing to declare in the Console permissions declarations.
- **No `AD_ID` permission** in the merged manifest (no ads/analytics SDKs).
- **targetSdk 36 / minSdk 24** — ahead of Play's target-API requirement.
- **Scoped storage**: exports go through `FileProvider` + share intents /
  Capacitor Filesystem app-scoped dirs; no external-storage permissions.

## 2) User accounts & identity — PASS (N/A)

- The app has **no login and no account creation**. RevenueCat operates on
  anonymous app-user IDs generated on device.
- Play's account-deletion requirement applies only to apps that support account
  creation → **not applicable**.

## 3) Data safety & privacy — PASS, with Console form requirements

Everything that leaves the device:

1. **RevenueCat / Google Play Billing** (purchase + restore): purchase history,
   anonymous app-user ID and SDK device metadata; plus a `referral_code`
   customer attribute (an opaque code, not personal data). Service-provider
   relationship, HTTPS.
2. **Cloud model catalog** (Cloudflare R2): plain GET downloads of CC0 models;
   no user data sent.
3. **Crash/feedback**: `mailto:` links the user actively sends from their own
   email app (device/app info is visible in the draft and user-controlled).
   Not automatic collection under Play's definitions.

- **No analytics, no ads, no trackers** (verified: no Firebase, Crashlytics,
  Sentry, Mixpanel, Amplitude, AdMob, Meta SDKs).
- Projects/designs persist in on-device `localStorage` only.
- **Privacy policy** is live at
  `https://justlinkit1.github.io/Homedesigner-free/privacy.html` (HTTP 200) and
  mentions RevenueCat, purchases, and Google Play.

## Action items (Play Console — cannot be fixed from the repo)

1. **Data safety form** must declare:
   - *Financial info → Purchase history*: collected, shared with service
     provider (RevenueCat), purpose “App functionality”, encrypted in transit,
     not user-deletable in-app (no account; deletion on request via support
     email).
   - *Device or other IDs*: collected (RevenueCat anonymous app-user ID),
     same handling.
   - Everything else: **not collected**. Advertising ID: **No**.
2. **Privacy policy URL** in the Console must be set to the live GitHub Pages
   URL above (and that page must stay up).

If the answers above are already what the Console form says, nothing to do.
