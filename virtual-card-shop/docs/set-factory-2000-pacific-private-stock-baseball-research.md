# 2000 Pacific Private Stock Baseball — unreleased draft

Completed inventory: **800 cards across 12 collector families**, ready for Admin pricing and image harvesting. Release is blocked by unresolved Hobby pack configuration, unsupported mini/fractional rates, pricing and images. No production database access or deployment.

| Family | Cards | Serial run | Draft Hobby odds |
|---|---:|---:|---|
| Base | 150 | — | Base pool |
| Gold Portraits | 150 | /99 | Unknown; null |
| Premiere Date | 150 | /34 | 1:24 |
| Silver Portraits | 150 | /199 | Retail only; null |
| Artist's Canvas | 20 | — | 1:49 |
| Artist's Canvas Proofs | 20 | /1 | Unknown; null |
| Extreme Action | 20 | — | Physical 2:25 unsupported; null |
| PS-2000 Action | 60 | — | Physical two per pack unsupported; null |
| PS-2000 New Wave | 20 | /199 | Unknown; null |
| PS-2000 Rookies | 20 | /99 | Unknown; null |
| PS-2000 Stars | 20 | /299 | Unknown; null |
| Reserve | 20 | — | 1:25 |
| **Total** | **800** | | |

## Evidence and verification

[TCDB base](https://www.tcdb.com/Checklist.cfm/sid/1401/2000-Pacific-Private-Stock?PageIndex=1) and [related family index](https://www.tcdb.com/Inserts.cfm/sid/1401/2000-Pacific-Private-Stock) establish the catalogued scope. Both base pages and all individual parallel pages were fetched separately; no full parallel roster was extrapolated. Individual namespace URLs, raw subject strings, normalized rows and SHA256 source hashes are retained in `.source.json`.

[BaseballCardPedia](https://baseballcardpedia.com/index.php/2000_Private_Stock) provides independently compared full base/seven insert subject lists, parallel descriptions and 14-row physical odds table. [MyCardBatch's complete tables](https://mycardbatch.com/checklists/pacific-private-stock-2000-baseball) provide 350 base/insert number-name-team tuples and 20 excluded samples. Its 370 headline is not the product total: it omits 450 base parallel cards and includes 20 promos. Its broad RC labels are not accepted as true rookie evidence.

Every full parallel subject/team is compared against base after the one correction below. Canvas Proofs match their own complete supplementary table and the independently checked parent Canvas roster. Insert team affiliations also match corresponding base subjects. Limited aliases handle punctuation and Bob/Bobby Abreu, Tony Armas/Jr., David/Dave Nilsson only. All 800 cards have historical teams. No physical-card audit of all 800 images is claimed.

**Gold Portraits #44 source error:** TCDB says Dante Bichette SN99. [Original card front/back](https://www.ebay.com/itm/332516665092), visually inspected, identify **Pedro Astacio, Colorado Rockies, #44, serial 27/99**. Output corrects the subject to Pedro Astacio, preserving the original erroneous record and exact image URLs/hashes/observations. The generator recognizes only this exact source exception and fails if it changes. The printed facsimile signature is not a certified autograph.

Only **base #48 Juan Sosa** receives true RC. The [separate rookie index](https://www.tcdb.com/Rookies.cfm/sid/1401/2000-Pacific-Private-Stock) agrees with [Beckett's #48 Juan Sosa SP RC listing](https://marketplace.beckett.com/search_new?set_id=2000+Private+Stock&year_start=2000). Twenty-five scattered prospect slots use `Rookies/Prospects` subset on base and matching full parallels:

`23,27,38,47,48,53,55,58,67,70,73,85,86,93,95,100,102,113,116,118,122,133,138,143,150`.

Marketing Rookies does not confer true RC designation on minis or parallels. #67 retains documented card name **Dermal Brown**. Source tags are stripped only as whole trailing tokens; serial runs belong in variant, not player. All family numbers are plain 1–N.

## Exclusions

Exclude all 20 PS-2000 Rookies Embossed Samples, promotional SAM issues without regular /99 stamping. Their full roster is independently compared and matched to the Rookies mini subjects. [TCDB trivia](https://www.tcdb.com/Trivia.cfm/sid/1401/2000-Pacific-Private-Stock) describes Chicago SportsFest 2000 booth embossing of purchased/opened cards; this does not establish a bounded regular pack-issued family. No fabricated 150-card show parallel. No additional verified pack-issued autograph, memorabilia or hologram family; do not mix football or later years.

Premiere Date has a documented small number of missing serial stamps. Preserve the standard 150-card /34 family with this qualification; no unverified 150-card unstamped family is invented.

## Pack limitations and release blockers

BCP lists **24 packs per box, seven cards per pack**, MSRP $4.49. Five [original packaging scans](https://www.tcdb.com/Packaging.cfm/sid/1401/2000-Pacific-Private-Stock) were inspected and hashed. Retail wrapper and blaster explicitly say **five cards per pack**; wrapper prints Extreme Action **2:25**. The small Hobby box scan does not resolve Hobby count. Seven remains a provisional catalogue Hobby value, not visually verified. Do not assume five plus two minis explains the discrepancy. Blaster seven-plus-one packs are not the 24-pack Hobby configuration.

The importer accepts positive integer one-in-N denominators or null. Two minis per pack and Extreme Action 2:25 require multiple slots/fractional denominators, so both stay null. Do not round to 1:12/13, substitute 1:1, or split collector families artificially. Physical unknown rates remain unknown; retail-only Silver remains null in Hobby. Base 125 regular/25 prospects collation (Hobby 1:4, retail 1:6) is flattened into one 150-card base family under existing conventions and needs pack QA.

Release requires actual Hobby pack-size resolution, mini/fractional hit-model work, prospect collation/remaining odds review, pricing and image harvesting. `status: DRAFT`, `product.released: false`, `review.release: BLOCKED_PENDING_QA` remain. Review metadata does not replace the actual unreleased flag.

## Validation

- Executed generator; byte-for-byte CSV regeneration; complete live source revalidation.
- Fail-closed bounded retrieval, 14 corrupt-source cases, three unsupported-odds cases, strict whole-token cleanup and checklist-team exception.
- Actual importer tested against an empty disposable local PGlite PostgreSQL-compatible server: dry-run writes nothing; missing team rejected before writes; apply creates one unreleased product/12 sets/800 cards; every stored CSV field compared; rerun inserts zero duplicates and preserves sentinel prices/images; released manifest rejected.
- All 30 repository tests, open-pack metadata, best-grade checklist, importer smoke and targeted ESLint passed.

Reproduce without a database:

```bash
python3 scripts/generate-2000-pacific-private-stock-baseball.py --check
python3 scripts/generate-2000-pacific-private-stock-baseball.py --refresh-sources --check
```

Integration requires an **empty local** PostgreSQL database named `ps00_set_factory_test`. It never falls back to shell `DATABASE_URL`:

```bash
SET_FACTORY_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/ps00_set_factory_test' node scripts/test-2000-pacific-private-stock-baseball.mjs
```

Run `npm run import:set-bundle -- <bundle>` for dry-run; append `--apply` for the unreleased draft. The completed CSV, bundle, source snapshot, generator, test and this research note are committed together. Existing prices/images are preserved on rerun.
