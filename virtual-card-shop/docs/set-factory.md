# Set Factory pilot

The Set Factory manifest workflow turns researched set data into an idempotent,
reviewable VCS draft.

## Safety rules

- Every new Product is created with `released: false`.
- A dry run is the default.
- Re-running a manifest preserves existing release state, pricing, and card images.
- Existing card prices and images are never reset by the manifest importer.
- Card numbers must be unique within the Product Set.
- Batch image ingestion is also dry-run by default.
- Existing card images are preserved unless `--overwrite` is explicitly supplied.
- Image apply mode requires R2; it does not silently fall back to another provider.
- Front/back pairs with identical image bytes are rejected.

## Card data conventions

### True rookie-card naming

When a specific card is a recognized true rookie card for a player, append ` RC` to
that player's name in the `player` field (for example, `Bruce Sutter RC`). Do not
infer rookie-card status from card design, subset name, the word `Rookie`, or an
All-Star Rookie designation alone. Rookie status must be independently verified as
a true RC for that player.

For multi-player rookie cards, apply ` RC` player-by-player. A card may be a rookie
card for only some of the players pictured because another player may already have
an earlier recognized rookie card. Never append one card-level `RC` marker blindly
to every name on a multi-player rookie card.

This convention applies to all new Set Factory datasets moving forward.

## Pilot: 1990 Topps Big Baseball

The pilot intentionally combines all three physical series into one VCS Product:

- Product: `1990_Topps_Big_Baseball`
- Base Product Set: `1990_Topps_Big_Baseball_Base`
- Checklist: 330 equally available base cards
- Pack: 8 cards
- Box: 36 packs
- Printer-code variations: not modeled separately
- Product status: unreleased

The physical series number is retained in the manifest for reference only. It does
not affect pull odds.

## Run the pilot

From `virtual-card-shop`:

```bash
npm run import:set -- data/set-factory/1990-topps-big.json
```

Review the dry-run counts. To create or update the draft:

```bash
npm run import:set -- data/set-factory/1990-topps-big.json --apply
```

Then review the Product and Product Set in Admin. Team data, pack art, card images,
and pricing remain explicitly pending in the pilot manifest. Do not release the
Product until those review gates are complete.

## Image ingestion

Set Factory now supports a separate image manifest. This intentionally decouples
image discovery from image storage: an authorized source adapter, a local image
bundle, or another permitted workflow can produce the manifest, while one reusable
importer validates and stores the images in VCS.

Example:

```json
{
  "schemaVersion": 1,
  "productSetId": "1990_Topps_Big_Baseball_Base",
  "storagePrefix": "virtual-card-shop/cards",
  "cards": [
    {
      "cardNumber": "1",
      "frontSource": "./images/1-front.jpg",
      "backSource": "./images/1-back.jpg"
    },
    {
      "cardNumber": "2",
      "frontSource": "https://permitted-source.example/cards/2-front.jpg",
      "backSource": "https://permitted-source.example/cards/2-back.jpg"
    }
  ]
}
```

Each source may be either:

- a local file path relative to the image-manifest file, or
- a direct `http://` or `https://` image URL from a source whose use permits the
  retrieval.

Dry-run the image stage:

```bash
npm run import:set-images -- path/to/images.json
```

Apply validated images to R2 and the Card rows:

```bash
npm run import:set-images -- path/to/images.json --apply
```

Useful recovery options:

```bash
# Retry or test just one card
npm run import:set-images -- path/to/images.json --card=241

# Explicitly replace already-populated Card image URLs
npm run import:set-images -- path/to/images.json --apply --overwrite
```

The importer:

1. Matches targets by Product Set plus card number.
2. Accepts local files or direct image URLs.
3. Validates actual image bytes rather than trusting filename extensions or HTTP
   content-type headers.
4. Accepts JPEG, PNG, WebP, and GIF up to 5 MB each.
5. Computes a SHA-256 hash for every image.
6. Rejects a card when newly supplied front and back images are byte-identical.
7. Creates deterministic, immutable R2 keys containing the image hash.
8. Updates only the image sides successfully uploaded.
9. Preserves existing image URLs unless `--overwrite` is explicitly requested.
10. Can be rerun safely or narrowed to one card with `--card=<number>`.

During a dry run, target Card rows are allowed to be absent because the draft set
may not have been applied yet. In apply mode, the target Card must already exist.

## Source adapters

Image discovery should remain pluggable. The ingestion layer does not automate
screen scraping or extraction from a source whose terms prohibit it. A future
source adapter only needs to produce the image-manifest format above; the R2,
validation, matching, retry, and database behavior remains the same.
