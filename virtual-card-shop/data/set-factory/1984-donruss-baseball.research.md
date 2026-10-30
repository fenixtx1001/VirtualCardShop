# 1984 Donruss Baseball — Set Factory QA

## Sources and checklist scope

- https://www.tcdb.com/Checklist.cfm/sid/95/1984-Donruss (all seven pages): numbers, players, teams, RC flags, variants.
- https://www.tcdb.com/Inserts.cfm/sid/95/1984-Donruss : Living Legends subjects and team affiliations.
- https://baseballcardpedia.com/index.php/1984_Donruss : independent checklist, wax format, distribution and factory-set differences.
- https://www.beckett.com/news/1984-donruss-baseball-cards/ : 660-card collector checklist and pack format.

One 660-card wax collector checklist: 651 numbered cards, seven checklists and
Living Legends A/B. TCDB classifies 658 as base and A/B as bonus inserts; other
collector references count 660. A/B were printed at the same rate as base cards
according to BaseballCardPedia, so VCS keeps the full wax checklist together with
equal availability instead of inventing insert odds. Factory sets omit A/B.
Diamond Kings 1-26 and Rated Rookies 27-46 remain base subsets. Wax format is
15 cards per pack and 36 packs per box. Non-card puzzle panels and mail-order
oversized Super Diamond Kings are excluded. Duke Snider #648 is retained.

## Variations and metadata

687 TCDB source rows collapse to 658 canonical base positions: corrected Diamond
Kings backs, corrected numbered Stenhouse #29 / Darling #30, and one DK checklist.
The two numberless error versions are not extra completion requirements. Add the
two sourced Living Legends cards for 660 total. Corrected factory-set print states
represent the same cards; this is a deliberate canonicalization, not a claim that
corrected cards came from wax packs. No scarcity multipliers are invented.

CL-DK and CL1-CL6 disambiguate overlapping printed checklist numbers. Printed
numbers, ranges and error notes stay in variant metadata. #625 has clean player
names with Runnin' Reds in subset. Living Legends A/B have player-specific team
lists and no rookie labels. All source RC tags are explicit; key checks are Joe
Carter #41, Darryl Strawberry #68, Andy Van Slyke #83 and Don Mattingly #248.

## Intentional team exception

#651 Famous Chicken is an independent mascot and has no team in TCDB. Do not
invent Padres affiliation. Seven checklist cards also have no team. The current
importer exempts only checklist cards; review.teamData is therefore PENDING solely
for this known non-player exception. Apply this bundle with --allow-pending-teams.
All player cards have teams. Generator validation permits exactly this mascot
exception and otherwise rejects missing non-checklist teams.

## Checks

- Generator and --self-test pass: 660 unique cards and expected exact identifiers.
- Strict token tests preserve suffix-looking surnames and remove whole tags only.
- All 651 numbered positions independently matched BaseballCardPedia; reviewed
  differences are nickname/full-name forms and thematic multi-player descriptions.
  Source names are retained; no inferred rookie labels on multi-player cards.
- Importer passed schema/CSV validation and reached its first database read, then
  stopped because DATABASE_URL is absent. Database dry run/apply did not complete.
- Images/pricing pending; product unreleased and release blocked.

## Import

From virtual-card-shop with the bundle and adjacent CSV present:

```bash
npm run import:set-bundle -- data/set-factory/1984-donruss-baseball.bundle.json
npm run import:set-bundle -- data/set-factory/1984-donruss-baseball.bundle.json --apply --allow-pending-teams
```
