# Google Play policy compliance audit

Audited 2026-07-17 at v1.0.50 (versionCode 10050); sections 2 and 3 and the action items were corrected on 2026-11-22 (v1.22.43) after the Data safety review. Following the three domains
of Google's `play-policy-insights` skill (permissions/API hygiene, user
accounts & identity, data safety & privacy). Re-audit when adding any SDK,
permission, login system, analytics, or ads.

## Verdict: the Data safety form needs the answers in the Data safety notes. The items below are Play Console tasks, not repo tasks.

## 1) Permissions & API hygiene — PASS

Merged release manifest contains only normal-level permissions:

| Permission | Source | Risk |
| --- | --- | --- |
| `INTERNET` | app | normal |
| `ACCESS_NETWORK_STATE` | Capacitor | normal |
| `VIBRATE` | @capacitor/haptics | normal |
| `com.android.vending.BILLING` | Play Billing | normal |
| `USE_CREDENTIALS`, `USE_BIOMETRIC`, `USE_FINGERPRINT` | social-login / androidx (library-added) | normal |
| `BIND_GET_INSTALL_REFERRER_SERVICE` | Play Install Referrer | normal |
| `…DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` | AndroidX auto | internal |

- **Zero restricted/runtime permissions**: no location, camera, microphone,
  contacts, SMS, call logs, storage, `QUERY_ALL_PACKAGES`, no foreground
  services. Nothing to declare in the Console permissions declarations.
- **No `AD_ID` permission** in the merged manifest (no ads SDKs).
- **targetSdk 36 / minSdk 24** — ahead of Play's target-API requirement.
- **Scoped storage**: exports go through `FileProvider` + share intents /
  Capacitor Filesystem app-scoped dirs; no external-storage permissions.

## 2) User accounts & identity — applies (account creation exists)

- Sign in with Google is optional. An account is created implicitly on first
  sign-in (Google `sub` keys a points account, R2 prefix, forum profile).
- Play's account-deletion requirement therefore **applies**. In the app:
  Settings, signed in, **Delete account**. On the web: the same screen at
  `homedesignerapp.com/app/`, or the public page `homedesignerapp.com/delete-account`
  (use this URL in the Console "Delete account" field). Email fallback is on that page.
- What deletion keeps is listed on that page and in `public/privacy.html`.

## 3) Data safety & privacy

Everything that leaves the device, summarised (full evidence and the form
answers are in the Data safety notes for 1.22.43):

1. **Google Sign-In ID token** to our Worker (sub stored; email read in memory
   only; name not read).
2. **Synced designs** (R2), **community posts and images** (D1/R2, web forum).
3. **Play purchases** verified server-side (token, order id, product stored);
   RevenueCat is queried with `google:<sub>`; Stripe is used for web points.
4. **AI features**: Cloudflare Workers AI, Anthropic, ElevenLabs, fal.ai.
5. **Anonymous usage events** (random install id, six fixed events, install
   referrer source), kept 13 months. This is app-interaction and device-id data.
6. **Cloud model catalog** (Cloudflare R2): plain GET downloads, no user data.
7. **Crash/feedback**: `mailto:` links the user sends themselves.

- No ads SDK, no crash SDK, no third-party analytics SDK (verified: no Firebase,
  Crashlytics, Sentry, Mixpanel, Amplitude, AdMob, Meta SDKs). The app does send
  its own first-party anonymous events, so "no analytics" is no longer true.
- Projects persist on-device in `localStorage`; signed-in users also sync to R2.
- **Privacy policy** is live at `https://homedesignerapp.com/privacy.html`.

## Action items (Play Console — cannot be fixed from the repo)

1. **Data safety form**: fill it from the Data safety notes. Declare purchase
   history, user IDs, photos, files, app interactions, other user content and
   device or other IDs as collected, and answer "users can request deletion: yes".
2. **Delete account URL**: `https://homedesignerapp.com/delete-account` (after deploy).
3. **Privacy policy URL**: `https://homedesignerapp.com/privacy.html`.
