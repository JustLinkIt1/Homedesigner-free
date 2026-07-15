# 3D model library strategy

Last reviewed: 2026-07-14

## Goal

Grow from a bundled starter library to thousands of searchable objects without
turning the Android bundle into a multi-gigabyte download. Catalog metadata and
small thumbnails should ship/cache cheaply; optimized GLB files should download
on demand and remain available offline after first use.

## Approved starting sources

Only ingest assets whose license permits commercial use and redistribution.
Store the source URL, asset author, license, download date, and original file
hash for every imported model even when attribution is not required.

| Source | Best use | License / integration note |
| --- | --- | --- |
| [Poly Haven](https://polyhaven.com/license) | Realistic furniture and props | Assets are CC0 and may be redistributed. Do not scrape the site or copy protected thumbnails/metadata. A live product integration or bulk snapshot should use Poly Haven's [commercial API/bulk arrangement](https://polyhaven.com/corporate). Existing checked-in models came from this source. |
| [ambientCG](https://ambientcg.com/) | PBR materials, surfaces, and a smaller set of models | Assets are CC0, including commercial use. Particularly valuable for material variety rather than reaching thousands of furniture silhouettes. |
| [Quaternius](https://quaternius.com/) | Lightweight, mobile-friendly interior packs | Packs are individually marked CC0. The [Furniture Pack](https://quaternius.com/packs/furniture.html) contains 23 essentials; the site also lists larger Furniture and House Interior packs. Convert the source FBX/OBJ files to optimized GLB. |
| [Kenney](https://kenney.nl/support) | Lightweight props and themed packs | Asset pages are CC0 and commercial use is allowed. Visual style is more game-like, so use as a clearly labelled “stylized” collection rather than mixing it into photorealistic results. |

## Sources requiring extra caution

- Do not bulk-import from Sketchfab, CGTrader, TurboSquid, BlenderKit, or
  Objaverse based only on a search result. Licenses vary per asset and some
  platforms restrict redistribution even when rendered use is allowed.
- Do not ingest brand replicas or identifiable designer furniture without a
  separate trademark/design-right review.
- Do not depend on a third-party hotlink as the production model URL. Import an
  approved asset into our own storage and preserve its provenance record.

## Recommended architecture

1. Keep 30–50 common objects bundled so first-run furnishing works offline.
2. Add a versioned catalog manifest containing dimensions, categories, style,
   source/license provenance, thumbnail URL, GLB URL, byte size, and SHA-256.
3. Host optimized assets behind object storage/CDN. Download GLBs only when the
   preview opens or an item is placed; cache them with an LRU budget on device.
4. Generate thumbnails and normalize scale/origin/front direction during
   ingestion. Target Draco or Meshopt geometry plus KTX2/WebP textures, with
   mobile tiers around 1–3 MB per typical object.
5. Review each source batch before publishing, then expose catalog updates
   independently of app releases.

## Practical next milestone

Ingest the Quaternius Furniture and House Interior packs as the first
mobile-friendly batch, while continuing selective photorealistic imports from
Poly Haven. This adds breadth quickly, validates the ingestion/caching pipeline,
and avoids claiming that a few thousand assets can safely live inside the AAB.

Cloudflare R2 is now provisioned for this pipeline. See
`docs/CLOUDFLARE_R2.md` for the bucket endpoints, read-only CORS policy, proposed
object layout, and production-domain requirement.
