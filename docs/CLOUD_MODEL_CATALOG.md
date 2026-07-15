# Cloud model catalog

Last reviewed: 2026-07-15

The catalog can grow independently of the Android app. Bundled objects remain
available offline, while additional GLBs and a small JSON manifest are fetched
from Cloudflare R2 only when needed.

## Runtime behavior

- Default manifest: `https://pub-6583adc5c7ee4926ae2b8037175a5dfc.r2.dev/catalog/v1/catalog.json`
- Override for staging or a future custom domain with
  `VITE_MODEL_CATALOG_URL` at build time.
- A validated manifest is cached in local storage and retained when a later
  request is offline.
- Cloud entries cannot replace bundled types or openings.
- Model URLs must be HTTPS, use the same origin as the manifest, end in `.glb`,
  and include CC0 provenance.
- The manifest is limited to 2 MB and 5,000 entries. Individual declared model
  sizes are limited to 100 MB.
- Models load lazily for the preview or 3D scene. A failed remote model falls
  back to its procedural shape instead of taking down the scene.

## Manifest shape

```json
{
  "version": 1,
  "entries": [
    {
      "type": "bunk_bed",
      "name": "Bunk Bed",
      "category": "Bedroom",
      "width": 105,
      "depth": 210,
      "height": 175,
      "color": "#b79b78",
      "shape": "bed",
      "icon": "B",
      "pro": false,
      "model": {
        "url": "https://pub-...r2.dev/models/quaternius/ultimate-home-interior/bunk-bed.glb",
        "bytes": 10968,
        "sha256": "64 lowercase hex characters",
        "source": {
          "name": "Ultimate Home Interior Pack",
          "url": "https://quaternius.com/packs/ultimatehomeinterior.html",
          "author": "Quaternius",
          "license": "CC0"
        }
      }
    }
  ]
}
```

Cloud entries are Pro by default. Set `"pro": false` explicitly for an item
that should be placeable on the free tier.

## First Quaternius batch

The reviewed batch spec is
`scripts/model-catalog/quaternius-ultimate-home-batch.json`. It currently names
32 objects from the CC0 Ultimate Home Interior Pack. It includes beds,
bathroom fixtures, chairs, sofas, rugs, curtains, storage, a fireplace, and
plants. Six representative objects are free-tier.

Export the source `.blend` files with a Python environment containing `bpy`:

```powershell
python scripts/model-catalog/export_blend_batch.py `
  --spec scripts/model-catalog/quaternius-ultimate-home-batch.json `
  --source-dir <download>\Blends `
  --output-dir <work>\raw
```

Optimize each GLB with the checked-in glTF Transform CLI. Meshopt is supported
by the app's `useGLTF` loader:

```powershell
Get-ChildItem <work>\raw -Filter *.glb | ForEach-Object {
  npx gltf-transform optimize $_.FullName (<publish-dir> + '\\' + $_.Name) --compress meshopt
}
```

Generate the versioned manifest, including byte sizes and SHA-256 hashes:

```powershell
node scripts/model-catalog/build_manifest.mjs `
  scripts/model-catalog/quaternius-ultimate-home-batch.json `
  <publish-dir> `
  <publish-dir>\catalog\v1\catalog.json
```

Upload the GLBs below
`models/quaternius/ultimate-home-interior/`, then upload the manifest last to
`catalog/v1/catalog.json`. Publishing the manifest last prevents clients from
seeing entries whose model objects are not available yet.

### Current development publication

The first Quaternius batch was published to the R2 development endpoint on
2026-07-15. It contains 32 optimized GLBs and the versioned manifest at:

`https://pub-6583adc5c7ee4926ae2b8037175a5dfc.r2.dev/catalog/v1/catalog.json`

Publication verification fetched every model and confirmed its byte count
against the manifest. The public manifest is `application/json`, has 32 entries,
and is byte-for-byte identical to the generated local release file.

## Publishing checks

1. Run `gltf-transform inspect` for every GLB.
2. Confirm every manifest hash and byte count was generated from the exact
   optimized upload file.
3. Upload all models before the manifest.
4. Verify the public manifest and at least one free and one Pro model URL.
5. Open a catalog preview and place both models in 3D on desktop and Android.
6. Move production delivery from the rate-limited `r2.dev` endpoint to a
   custom domain before a large public rollout.
