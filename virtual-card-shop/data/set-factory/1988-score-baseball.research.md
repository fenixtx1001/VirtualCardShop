# 1988 Score Baseball — Set Factory QA

## Sources

- https://www.tcdb.com/Checklist.cfm/sid/123/1988-Score (all seven pages)
- https://www.tcdb.com/Inserts.cfm/sid/123/1988-Score
- https://www.tcdb.com/Checklist.cfm/sid/75713/1988-Score-Magic-Motion-Great-Moments-in-Baseball
- https://www.tcdb.com/Checklist.cfm/sid/10150/1988-Score-Young-Superstars-Series-I-
- https://baseballcardpedia.com/index.php/1988_Score
- https://www.steelcitycollectibles.com/i/1988-score-baseball-box

## Checklist scope

756 cards in three complete Product Sets: 660 Base, 56 Magic Motion: Great Moments
in Baseball, and 40 Young Superstars Series I. All card positions, names and teams
come from the checked-in TCDB snapshot. Independent BaseballCardPedia positional
coverage matches all three checklists exactly. Dates and event captions on trivia
cards are metadata; subjects and historical teams remain clean. No trivia RC labels.

Base subsets stay together: Reggie Jackson Tribute 500-504, Rookie Prospects
623-647, All-Stars 648-651, 1987 Season Highlights 652-660. Reggie Jackson #501
correctly depicts Baltimore. Some secondary sources incorrectly extend highlights
to 648; TCDB identifies 648-651 as All-Stars/combo cards.

Eight additional base error rows collapse to corrected versions at 93,126,133,
134,158,261,297,419. Print errors are not extra completion requirements.

Glossy is a factory-only 660-card parallel from 5000 serial-numbered factory sets,
not a wax/rack parallel; excluded from packs. Promo samples and box-bottom panels
and singles are excluded. Rookie/Traded and Young Superstars Series II are separate
products. Series I is included because it was also inserted in regular rack packs.

## Pack abstraction

Physical wax: 17 baseball cards + 1 Magic Motion card, 36 packs per box. Rack packs
contained 54 baseball cards + 3 Magic Motion cards, plus 1 Young Superstars Series I.
VCS has one universal pack and inserts replace base slots. Thus cardsPerPack=18
and Magic Motion oddsPerPack=1 provide 17 base + 1 trivia card normally.
Rack-exclusive Young Superstars is available at 1:3 VCS packs by treating the
three-trivia-card rack as three wax equivalents. This is a deliberate approximation,
not published historical wax odds. A Young Superstars hit replaces one base slot.
No pack-engine changes are included.

## Verification

- Generator and --self-test: PASS, 756 unique set/number pairs; all teams populated.
- Exact independent coverage: 660 Base, 56 trivia, 40 Young Superstars.
- Base RC assertions: Matt Williams #118, Ken Caminiti #164, Tom Glavine #638.
  RC flags follow explicit source tags, not Rookie Prospects subset membership.
- Strict trailing-token tests preserve names such as Hall and Boswell. Descriptive
  source notes and error flags are metadata, not part of display names.
- Secondary-source differences reviewed: nickname/full-name forms (Benny/Benito
  Santiago, Len/Lenny Dykstra, Tom/Tommy Herr, Dennis/Denny Walling, Stan/Stanley
  Jefferson), Jeff Robinson pitcher/outfielder disambiguated by team/card number,
  and Mike-style descriptive notes stripped. TCDB Atlee Hammaker #528 retained
  over secondary-source Charlie Haag error. All 56 trivia subjects match.
- Importer passed bundle/CSV/team validation and reached its first DB query;
  DATABASE_URL is absent, so database dry run and apply have not completed.

teamData COMPLETE. Product unreleased; images/pricing pending and release blocked.

```bash
npm run import:set-bundle -- data/set-factory/1988-score-baseball.bundle.json
npm run import:set-bundle -- data/set-factory/1988-score-baseball.bundle.json --apply
```
