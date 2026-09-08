# Set Factory pilot

The Set Factory manifest workflow turns researched set data into an idempotent,
reviewable VCS draft.

## Safety rules

- Every new Product is created with `released: false`.
- A dry run is the default.
- Re-running a manifest preserves existing release state, pricing, and card images.
- Existing card prices and images are never reset by the manifest importer.
- Card numbers must be unique within the Product Set.

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

## Planned image stage

A later Set Factory stage will accept an authorized image bundle or direct-image
manifest, match each front/back pair to Product Set plus card number, validate the
files, upload immutable objects to R2, and queue only missing or ambiguous matches.
It will not automate extraction from a source whose terms prohibit scraping.
