# Cloudflare R2 model storage

Last configured: 2026-07-15

## Current bucket

- Bucket: `homedesigner-models`
- Location: Western Europe (`WEUR`)
- Public development base URL:
  `https://pub-6583adc5c7ee4926ae2b8037175a5dfc.r2.dev`
- S3 endpoint:
  `https://930da8447adf9d8f156a6ef91ca37daf.r2.cloudflarestorage.com/homedesigner-models`

The public development URL is enabled so model assets can be tested without
packaging them in the Android bundle. It is Cloudflare rate-limited and is not
the production endpoint. Attach a custom domain before a public production
rollout so normal Cloudflare caching and delivery controls are available.

## Browser access

The bucket CORS policy is intentionally read-only:

```json
[
  {
    "AllowedOrigins": ["*"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 86400
  }
]
```

Wildcard origins are appropriate for these public, immutable catalog assets
and allow web, Capacitor, and local development clients to fetch them. Uploads
must never be permitted through public CORS.

## Proposed object layout

```text
catalog/v1/catalog.json
models/<source>/<asset-id>/<content-hash>.glb
thumbnails/<source>/<asset-id>/<content-hash>.webp
licenses/<source>/<asset-id>.json
```

The app now implements this versioned manifest and lazy model-loading path.
See `docs/CLOUD_MODEL_CATALOG.md` for the validated schema and the first
32-object Quaternius batch pipeline.

The first development batch is live as of 2026-07-15:

```text
catalog/v1/catalog.json
models/quaternius/ultimate-home-interior/*.glb  (32 objects)
```

The manifest and every referenced GLB were fetched from the public endpoint
after upload. All model byte counts matched, and the manifest matched the local
release file exactly.

Use content-hashed object names with long-lived immutable cache headers. Keep
the catalog manifest short-lived and versioned so it can be updated without an
app release.

## Credentials and cost safety

- The account and bucket are active on Cloudflare's usage-based R2 plan. The
  included free allowance is not a hard spending cap.
- A `$1` monthly early-warning alert named `R2 $1 early warning` emails
  `nathanjoppich@gmail.com`. It is an alert only; Cloudflare does not stop usage
  or charges automatically when the threshold is reached.
- No R2 access key, secret key, API token, or billing information belongs in
  Git. Use local environment variables or CI secrets for upload tooling.
- The account ID and public/S3 endpoints above are identifiers, not secrets.
- Do not expose write credentials in the mobile or web app. The client should
  receive public model URLs only.
