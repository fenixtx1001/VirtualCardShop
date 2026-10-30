# 1994 Score Baseball — Set Factory QA

## Sources

- https://www.tcdb.com/Checklist.cfm/sid/389/1994-Score (all seven pages)
- https://www.tcdb.com/Inserts.cfm/sid/389/1994-Score
- https://www.tcdb.com/Checklist.cfm/sid/390/1994-Score-Boys-of-Summer
- https://www.tcdb.com/Checklist.cfm/sid/391/1994-Score-Dream-Team
- https://www.tcdb.com/Checklist.cfm/sid/393/1994-Score-Gold-Stars
- https://www.tcdb.com/Checklist.cfm/sid/397/1994-Score-The-Cycle
- https://baseballcardpedia.com/index.php/1994_Score

## Scope and checks

1470 cards in six full Product Sets: 660 Base, 660 Gold Rush, 60 Boys of Summer,
10 Dream Team, 60 Gold Stars and 20 The Cycle. CSV has 810 explicit rows; importer
derives Gold Rush from the full 660-card base, preserving player/team/RC/subset/
variant metadata. Gold Rush is a foilboard base parallel with logos front/back;
it is not a separate shortened checklist. Both physical series are combined.

Independent BaseballCardPedia numbering matches all 660 base, 60 Boys, 10 Dream,
60 Gold Stars and 20 Cycle positions. Cycle printed numbers TC1-TC20 are retained.
Dream Team TCDB positions are 1-10. TCDB provides clean subjects, explicit RC tags
and teams. Stadium/team checklist cards (317-330 and 647-660) have team subjects
and retain historically sourced stadium names in metadata. Base subsets remain
in the complete base checklist; no range-based splitting.

RC checks: Trot Nixon #486, Billy Wagner #536. Mike Piazza #636 ROY is not a true
RC. Rookie/Prospect/Draft Pick status alone never creates a rookie suffix. Reviewed
independent differences are nicknames/full names, middle initials and multi-player
ordering on Cycle TC5. Stadium-name versus team-name subject differences are
resolved by retaining both concepts. Source UER notes stay in variant metadata.
Gold Stars PR6500 is not serial numbered and is metadata, not a pack ratio.

Sample base/Gold Rush/Dream Team cards, promo header cards and separate
Rookie/Traded and other products are excluded.

## Pack format and odds

Standard Hobby/Retail pack: 14 total cards including one Gold Rush; 36 packs/box.
Superpacks physically contained 29 cards with two Gold Rush. VCS uses the standard
14-card format and one guaranteed Gold Rush (1:1), normally leaving 13 base slots.
Other inserts replace additional base slots.

- Dream Team: Series One 1:72 Hobby/Retail -> combined-series 1:144.
- Cycle: Series Two 1:72 Hobby/Retail -> combined-series 1:144.
- Gold Stars: 1:18 Hobby in both series -> 1:18 universal VCS pack.
- Boys of Summer: 1:4 Superpacks in both series -> 1:4 universal VCS pack.

Both series have 330 base cards, so series weighting is exactly one half. Complete
60-card Boys/Gold Stars checklists remain intact despite their physical series
ranges. Channel-exclusive sets remain available in the universal pack at their
published per-pack ratio; no speculative channel sales weighting is applied.
This is an explicit channel abstraction, not a claim that Boys was in Hobby wax
or Gold Stars was in retail. Gold Stars has 6500 copies per subject according
to the reference source; no print-run inference is used to determine odds.

## Validation

- Generator/self-test PASS: 810 explicit unique positions + 660 derived Gold Rush.
- Exact per-set expected ranges/counts; all teams populated; token-boundary tests
  preserve suffix-looking surnames; key RC and 28 stadium-checklist assertions.
- Importer passed bundle/CSV/derived-count/team validation then failed first DB
  read because DATABASE_URL is absent. Database dry run/apply not completed.
- Current pack engine includes all non-base sets with positive odds, so the
  PARALLEL kind Gold Rush participates at its configured 1:1 ratio.

teamData COMPLETE. Product unreleased; images/pricing pending, release blocked.

```bash
npm run import:set-bundle -- data/set-factory/1994-score-baseball.bundle.json
npm run import:set-bundle -- data/set-factory/1994-score-baseball.bundle.json --apply
```
