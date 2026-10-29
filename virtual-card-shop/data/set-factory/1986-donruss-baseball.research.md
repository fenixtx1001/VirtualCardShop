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
