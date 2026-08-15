# HomeDesigner plan sync

This Worker keeps signed-in users' projects in the private
`homedesigner-user-data` R2 bucket. It accepts only Google ID tokens issued for
HomeDesigner's web OAuth client, then namespaces every object by the verified
Google `sub`. ID tokens are never written to storage.

Deploy from this directory with `npm ci`, `npx wrangler r2 bucket create
homedesigner-user-data`, then `npm run deploy`. The resulting `workers.dev` URL
must match `VITE_CLOUD_SYNC_URL` in the app's production environment.

## Billing entitlement setup

Android uses Google Play Billing directly. Web checkout remains RevenueCat Web
Billing backed by Stripe. Both sources resolve through `GET /v1/entitlement`.

Before deploying the billing cutover:

1. Apply D1 migrations: `npx wrangler d1 migrations apply homedesigner-community --remote`.
2. In Google Play Console, give a service account access to the HomeDesigner app
   and permission to view orders/subscriptions and manage orders.
3. Save that service account's complete JSON key as an encrypted Worker secret:
   `npx wrangler secret put GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`.
4. Keep `REVENUECAT_SECRET_KEY` and `REVENUECAT_PROJECT_ID`; they remain the
   source of truth for Stripe-backed web purchases.

Never add the service-account JSON file to this repository or to the client
bundle. The Worker verifies Play purchase tokens with `purchases.productsv2`,
acknowledges unacknowledged purchases, and stores only the verified receipt
metadata in D1.
