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

### Obsolete ProductSet cleanup

When an already-applied unreleased draft is restructured, removing a Product Set from
the bundle does not by itself delete the existing database rows. List intentionally
superseded IDs in `obsoleteProductSetIds` and run the guarded cleanup before applying
the revised bundle:

```bash
npx tsx scripts/cleanup-obsolete-product-sets.ts path/to/bundle.json
npx tsx scripts/cleanup-obsolete-product-sets.ts path/to/bundle.json --apply
```

The cleanup refuses deletion when the Product is released or when the obsolete
Product Set/cards contain pricing, prestige, ownership, images, values, overrides,
shop activity, grading, rip-box activity, auctions, favorites, or sale history. This
prevents a structural Set Factory correction from silently deleting user data.

## Card data conventions

### Collector checklist integrity

VCS Product Sets should follow the collector-facing checklist whenever practical so
set-completion percentages remain intuitive and true to how collectors define a set.
Do not split one numbered base checklist or one complete parallel checklist into
multiple VCS Product Sets solely to reproduce range-specific pack odds.

When physical odds differ across ranges inside one checklist, prefer keeping the
checklist intact and flattening card availability within that Product Set. Preserve
the historical scarcity information in `subset`, `variant`, bundle decisions, or
notes. Split a checklist only when the user explicitly wants separate VCS sets or
when the source issues are genuinely distinct collector checklists.

This convention applies to all new Set Factory datasets moving forward.

### Pack odds belong to the Product Set

Pack insertion odds are Product Set-level data in VCS. Store verified insert or
parallel odds in the Product Set's `oddsPerPack` field and do not repeat those odds
on individual cards.

Do not put text such as `Inserted 1:17 packs`, `1:36 packs`, or other set-wide pack
odds in a card's `variant` field. `variant` should contain card-specific collector
metadata only, such as serial numbering, autograph/memorabilia attributes,
error/correction status, print variations, or other details that actually vary by
card.

When odds genuinely differ card-by-card and cannot be represented by the Product Set
model, preserve that historical information in bundle decisions or notes rather than
cluttering every card's display metadata unless the user explicitly asks otherwise.

This convention applies to all new Set Factory datasets moving forward. Existing
sets are not retroactively rewritten unless explicitly requested.

### Clean player/subject names

The `player` field is display-facing and must stay clean. Store only the canonical
player/card-subject name, plus the verified ` RC` suffix described below when
applicable.

Do not include checklist annotations or error/variation details in `player`. Examples
that must be removed from the display name include `UER: Photo actually ...`, `ERR`,
`COR`, print/color variations, serial-number notes, autograph/memorabilia notes, and
other collector metadata. Preserve useful information of that kind in `variant`,
`subset`, or other metadata instead.

For example, source text such as `Dave Collins UER: Photo actually Bobby Jones`
must display as `Dave Collins` in `player`, with the UER/photo detail retained only
as metadata when the dataset models it.

This convention applies to all new Set Factory datasets moving forward.

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
