# 1991 Score Baseball — Set Factory QA

## Sources

- https://www.tcdb.com/Checklist.cfm/sid/160/1991-Score (all ten pages)
- https://www.tcdb.com/Inserts.cfm/sid/160/1991-Score
- https://www.tcdb.com/Checklist.cfm/sid/75494/1991-Score-Magic-Motion-World-Series-Trivia
- https://www.tcdb.com/Checklist.cfm/sid/162/1991-Score-Hot-Rookies
- https://www.tcdb.com/Checklist.cfm/sid/163/1991-Score-Mickey-Mantle
- https://www.tcdb.com/Checklist.cfm/sid/204835/1991-Score-Mickey-Mantle-Autographs
- https://baseballcardpedia.com/index.php/1991_Score
- https://www.beckett.com/baseball/1991/score/
- https://www.dacardworld.com/sports-cards/1991-score-series-1-baseball-wax-box

## Scope

989 cards: 893 Base, 72 Magic Motion World Series Trivia, 10 Hot Rookies,
7 Mickey Mantle, 7 Mickey Mantle Autographs. Keep the full base checklist intact,
with original named subsets in metadata. Four extra TCDB rows collapse to canonical
b states at 224,258,293,737. Original notes are preserved as variant metadata.

Base and insert subjects/teams come from checked-in TCDB snapshots. Independent
BaseballCardPedia numeric coverage matches all 893 base, 72 trivia, 10 Hot Rookies
and 7 unsigned Mantle positions. Its autograph section explicitly describes seven
signed versions of the Mantle set but does not enumerate seven rows. TCDB provides
the signed checklist; the generator verifies its seven titles exactly match the
unsigned checklist. Mantle display names are Mickey Mantle; career titles are
subset metadata, PR/AU/SN details are variant metadata, never RC labels.

Key RC checks: Mike Mussina #383 and Chipper Jones #671. Rookie/First Draft Pick
membership alone does not imply RC. #841 has clean Ken Griffey Jr./Sr. names with
The Griffeys as subset, neither marked rookie. Reviewed independent name differences
are nickname/full-name forms, middle initials and metadata captions. Same-name
players such as Greg Harris/Jeff Robinson remain distinguished by card/team data.

Cooperstown seven-card factory-set bonus and Mantle Glossy dealer/media promo
(serial numbered to 5000) are excluded. Base promos and separately distributed
Rookie/Traded/boxed products are excluded. Do not confuse unsigned pack Mantles
(PR5500, not serial numbered) with the serial-numbered Glossy promo.

## Series and pack abstraction

Use Series One 1-441 and Series Two 442-893 (441/452 cards), supported by TCDB,
Beckett set info and DA Card World. BaseballCardPedia's prose says 442/451;
that source discrepancy is documented rather than silently accepted.

Physical wax: 16 baseball cards + 1 trivia, 36 packs per box. VCS has 17 total
slots, with Magic Motion at 1:1. Other insert hits replace another base slot.
Hot Rookies was one per 100-base-card blister. 100/16=6.25 wax equivalents is
rounded to 1:6 VCS packs. This is an intentional channel approximation.

BaseballCardPedia publishes estimated Series Two ratios 1:1942 unsigned Mantle,
1:30000 autograph. Combined-series odds weighted by 452/893 become 1:3837 and
1:59270 (rounded integer denominators). Treat these as derived estimates, not
manufacturer-guaranteed box odds. Autographs are a 2500 aggregate-numbered series
with 356 copies per subject as reported by sources, not 2500 copies per subject.

## Intentional non-team subjects

American Flag #737 and Magic Motion Q&A #57-72 have no team affiliation. Preserve
17 blank teams rather than inventing a club or MLB placeholder. All other cards
have teams. teamData remains PENDING because importer currently exempts only
checklist cards; apply with --allow-pending-teams. Generator permits exactly
these non-team positions and rejects other missing affiliations.

## Validation

- Generator and --self-test PASS: 989 unique set/number pairs, expected ranges,
  clean subject names, key RC flags, exact 17 non-team exceptions.
- Whole-token parsing tests preserve suffix-looking surnames.
- Importer passed bundle/CSV validation, then stopped on its first database read
  because DATABASE_URL is absent here. Database dry run/apply not completed.

Product unreleased; images/pricing pending and release blocked.

```bash
npm run import:set-bundle -- data/set-factory/1991-score-baseball.bundle.json
npm run import:set-bundle -- data/set-factory/1991-score-baseball.bundle.json --apply --allow-pending-teams
```
