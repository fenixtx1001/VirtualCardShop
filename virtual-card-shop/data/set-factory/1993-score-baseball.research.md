# 1993 Score Baseball — Set Factory QA

## Sources

- https://www.tcdb.com/Checklist.cfm/sid/265/1993-Score (all seven pages)
- https://www.tcdb.com/Inserts.cfm/sid/265/1993-Score
- https://www.tcdb.com/Checklist.cfm/sid/266/1993-Score-Boys-of-Summer
- https://www.tcdb.com/Checklist.cfm/sid/276/1993-Score-Select-Stat-Leaders
- https://www.tcdb.com/Checklist.cfm/sid/268/1993-Score-The-Franchise
- https://baseballcardpedia.com/index.php/1993_Score
- https://www.beckett.com/baseball/1993/select-stat-leaders
- https://www.midwestcards.com/products/1993-score-baseball-wax-box-pack

## Scope and verification

808 cards in four complete Product Sets: 660 Base, 90 Select Stat Leaders,
28 The Franchise, 30 Boys of Summer. Every numeric position in all four sets
independently matches BaseballCardPedia. TCDB supplies subjects, teams and explicit
RC designations. All teams are populated; no invented team placeholders.

Base subsets remain in the full collector checklist: Award Winners 481-486,
Draft Picks 487-501, AL/NL All-Star Caricatures, Highlights, World Series Highlights
and Dream Team. Award types remain metadata. Source annotations and error notes
are not part of display names. No error/parallel expansion is needed for base.
Gold Dream Team is a wrapper mail-in product, not a pack parallel; excluded.
Promos and separate Select/Select Rookie-Traded products are excluded.

Derek Jeter #489 is explicitly RC. Mike Piazza #286 is a Rookie Prospect but
not a true RC, so no RC suffix is inferred. Other RC markers follow card-specific
source flags, not Draft Pick status. Select Stat Leaders #17 correctly includes
Mariano Duncan / Will Clark / Ray Lankford; the independent source incompletely
lists Will Clark alone. Other reviewed differences are nickname/full-name forms,
Greg Harris middle initials, Jeff Grotewold spelling versus Grotewald typo, and
award/Draft Pick abbreviations moved to metadata.

## Pack format and insert ratios

Canonical format: 16 total cards per foil pack, 36 packs per box. One Select Stat
Leader is included in every pack (1:1), leaving 15 base cards normally under VCS's
replacement-slot model. Franchise is 1:24 foil packs. Boys of Summer is 1:4 jumbo
packs and is included in the universal VCS pack at that published per-pack ratio.
This is an intentional channel abstraction, not a claim that Boys of Summer was
in historical foil packs. Other hits replace additional base slots.

Jumbo-size discrepancy: BaseballCardPedia says 27-card Superpacks, Beckett says
35-card jumbo packs. No disputed card-count conversion is used. Published 1:4
jumbo insertion rate is supported by TCDB and BaseballCardPedia. The complete
Select Stat Leaders insert checklist belongs to Score packs even though its design
promotes the separate Select brand; do not confuse it with Select base cards.

## Checks

- Generator and --self-test PASS: 808 unique set/number pairs, exact ranges,
  all teams, clean names, Jeter/Piazza rookie checks and 15 Draft Pick positions.
- Whole-token parsing tests preserve suffix-looking surnames such as Hall/Boswell.
- Independent numeric coverage: Base 660, Stat Leaders 90, Franchise 28, Boys 30.
- Importer passed schema/CSV/team validation and reached its first DB query, then
  stopped because DATABASE_URL is absent. Database dry run/apply not completed.

teamData COMPLETE. Product unreleased; images/pricing pending, release blocked.

```bash
npm run import:set-bundle -- data/set-factory/1993-score-baseball.bundle.json
npm run import:set-bundle -- data/set-factory/1993-score-baseball.bundle.json --apply
```
