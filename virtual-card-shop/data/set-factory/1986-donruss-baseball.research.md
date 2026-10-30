# 1986 Donruss Baseball — Set Factory intake

Status: RESEARCH / NOT IMPORTABLE / UNRELEASED

## Scope
- Product: `1986_Donruss_Baseball`
- Year: 1986; brand: Donruss; sport: Baseball.
- Model the complete collector-facing base checklist, verified inserts and parallels, and any distinct pack-distributed subsets as separate Product Sets only when supported by sources.
- Follow `docs/set-factory.md` and `docs/set-factory-generator-conventions.md`.

## Required research before creating an importable bundle
1. Verify the base checklist count, exact numbering, all player/team names, checklists, variations, and true rookie designations using primary collector sources. Do not guess missing rows.
2. Verify actual pack/box format and insertion odds. Distinguish standard Donruss from Leaf or other releases and from non-pack promotional material.
3. Verify team assignments and preserve checklist-card exceptions; never fabricate `MLB` or `Checklist` as a team.
4. Produce a deterministic generator and complete `.cards.csv`; enforce expected counts, uniqueness, clean subject names, rookie labels verified player-by-player, and no missing team except checklist cards.
5. Create schemaVersion 2 `.bundle.json` using the repository's existing bundle schema; leave product `released: false`, prices and images pending, and release blocked until QA.
6. Dry-run generation/import and report exact results before requesting merge or release.

## Safety
This research intake deliberately does not contain a guessed checklist or importable manifest. No database, shop, images, or release state has been changed.

## Completed checklist and validation

The bundle now contains 660 cards in one complete Base Product Set: numbered 1-653,
plus CL-DK and CL1-CL6. Unique CL identifiers preserve the printed checklist numbering
in metadata. Diamond Kings, Rated Rookies and King of Kings remain base subsets.

Sources: TCDB checklist pages 1-7 (sid 105), including teams and explicit RC flags;
BaseballCardPedia 1986 Donruss for checklist structure and wax distribution
(15 cards plus a puzzle panel, 36 packs per box). The normalized source snapshot is
checked in for reproducible offline generation. Secondary-source errors are not
copied: notably Bill Buckner #151 is not marked RC. Multi-subject cards #645 and
#651 use clean player names; #651 does not mark either player as an RC.

Eight extra error/variation rows in TCDB are collapsed into the canonical 660-card
checklist, preferring corrected or later b states. Checklist source notes are metadata.
Seven checklist cards intentionally have blank teams. All other 653 cards have teams.

Oversized wrapper-redemption Super Diamond Kings, box-bottom packaging cards and
non-card puzzle panels are excluded from this wax-card checklist. Separate Leaf,
All-Stars, Highlights and The Rookies releases are outside this product.

Validation: generator and --self-test pass; importer passed bundle/CSV/team checks,
then stopped at the first database read because this terminal lacks DATABASE_URL.
No database import or release has occurred. Images and pricing remain pending.

## Import in the configured VCS terminal

From virtual-card-shop on this branch:

```bash
python3 scripts/generate-1986-donruss-baseball.py --self-test
npm run import:set-bundle -- data/set-factory/1986-donruss-baseball.bundle.json
npm run import:set-bundle -- data/set-factory/1986-donruss-baseball.bundle.json --apply
```
