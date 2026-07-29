# Fal TRELLIS model pipeline

Last reviewed: 2026-07-29

This is an internal content-production workflow. It does not expose the Fal API
key to Android or browser clients, upload generated models to Cloudflare R2, or
alter the live catalogue automatically.

## Account and key

1. Create or sign in to a Fal account and create an API key from the Fal
   dashboard.
2. Start with a small prepaid credit balance. TRELLIS 2 currently costs about
   $0.25 for 512 resolution, $0.30 for 1024, and $0.35 for 1536.
3. Never paste the key into chat, source code, a command argument, or a tracked
   `.env` file. The generator reads `FAL_KEY` from the process environment or
   the ignored local-only `.env.local` file.

For this workstation, the simplest setup is a single local-only line:

```dotenv
FAL_KEY=replace-with-the-key-from-your-fal-dashboard
```

The repository ignores `.env.local`; verify that before generating with
`git check-ignore .env.local`. Never move the key into `.env.production`, which
is tracked because it contains the web app's public build configuration.

To enter the key without putting its plaintext value into PowerShell history:

```powershell
$secret = Read-Host 'Fal API key' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
try {
  $env:FAL_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
}
```

Remove it from the terminal session when model generation is finished:

```powershell
Remove-Item Env:FAL_KEY
```

## Generate a review model

Use an isolated single object on a plain background. A front three-quarter view
with the legs/base visible gives TRELLIS better depth and grounding cues than a
room photograph or cropped ecommerce image.

Validate a request without spending credits:

```powershell
npm run models:trellis -- `
  --image C:\path\to\chair.png `
  --type ai_modern_chair `
  --seed 101 `
  --dry-run
```

Generate with the mobile-safe defaults (512 generation resolution, 30,000
vertices, 1024px texture):

```powershell
npm run models:trellis -- `
  --image C:\path\to\chair.png `
  --type ai_modern_chair `
  --seed 101
```

The review package is written below `outputs/trellis/` and contains:

- an optimized, Meshopt-compressed GLB;
- `inspection.md` with glTF geometry/material/texture statistics;
- `review.json` with the Fal request ID, reproducibility settings, SHA-256 and
  an explicit approval checklist.

The raw Fal GLB is deleted after successful optimization unless `--keep-raw` is
specified. Local input images are uploaded by the official Fal client. HTTPS
image URLs are sent directly, with query parameters omitted from the local
review record in case they contain signed credentials.

## Approval and publication boundary

Every result needs visual inspection from multiple angles and placement tests
on desktop plus a physical Android device. Reject models with hidden rear
geometry, baked floor shadows, floating bases, holes, severe UV seams, excessive
file size, or silhouettes that do not match the catalogue dimensions.

The current cloud manifest deliberately accepts only reviewed CC0 provenance.
Fal-generated models must not be labelled CC0. Before publishing any generated
asset, add and release a truthful generated-asset provenance schema, confirm the
input image rights, review Fal's current terms, and test the new schema on
existing Android clients. Upload the GLB first and the merged manifest last.
