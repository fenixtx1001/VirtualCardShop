# 1989 Score Baseball — Set Factory QA

## Sources

- https://www.tcdb.com/Checklist.cfm/sid/132/1989-Score (all seven pages)
- https://www.tcdb.com/Inserts.cfm/sid/132/1989-Score
- https://www.tcdb.com/Checklist.cfm/sid/76821/1989-Score-Magic-Motion-A-Year-to-Remember
- https://www.tcdb.com/Checklist.cfm/sid/10161/1989-Score-Young-Superstars-Set-1-
- https://baseballcardpedia.com/index.php/1989_Score
- https://keymancollectibles.com/baseballcards/score/1989scorebaseballcardchecklist.htm (#75 corrected Brett corroboration)

## Checklist and formatting

758 cards: 660 Base, 56 Magic Motion: A Year to Remember and 42 Young Superstars
Set 1. BaseballCardPedia independently confirms all 660 base numeric positions, but its
malformed #75 rows omit the player name; George Brett #75 is verified separately.
Both insert checklists independently match in full. Teams and explicit RC labels are TCDB
source data. Seven additional base error/variation rows collapse into corrected
or later b states: 75,135,350,507,552,595,654. Preserve useful notes as metadata.

Rookie Prospects 621-651 and 1988 Season Highlights 652-660 remain base subsets.
#582 World Series has four clean subject names from the independent checklist,
with the title in subset. Magic Motion subjects can be player, team, location or
event; annual dates/captions remain metadata. No inferred RC labels on trivia.

Key RC assertions: Craig Biggio #237, John Smoltz #616, Gary Sheffield #625,
Randy Johnson #645. Edgar Martinez #637 is a Rookie Prospect but not a true RC.
Ken Griffey Jr. is absent from flagship; he belongs to the separate Rookie/Traded
release. Promos, Scoremasters, Hottest 100 and Young Superstars Set 2 are excluded.

## Pack format

Physical wax: 16 baseball cards plus 1 Magic Motion card; 36 packs/box.
Physical rack: 48 baseball cards, Young Superstars Set 1 seeded one per rack.
VCS uses 17 total slots with guaranteed Magic Motion at 1:1. Young Superstars
uses a 1:3 VCS approximation based on 48/16=3 wax-equivalent packs per rack,
and replaces a base slot on a hit. This is not historical wax insertion odds.
All pack odds are Product Set metadata, not repeated on individual cards.

## Intentional team exception

Magic Motion #50 covers the 1981 players' strike and has no team affiliation.
Its blank team is verified by both sources. All other 757 cards have teams.
Do not invent MLB or a club to fill the field. teamData remains PENDING because
the importer only exempts checklist cards; apply requires --allow-pending-teams.
Generator allows exactly magic #50 as the sole team exception.

## Validation

- Generator and --self-test pass: exact counts, numbering, clean names, key RCs,
  and strict whole-token preservation tests for suffix-looking surnames.
- Independent numeric coverage: 660 Base + 56 Magic Motion + 42 Young Superstars.
  Base subject coverage from BaseballCardPedia is 659; #75 is checked separately.
- Reviewed name differences are nicknames/full names, event versus team captions,
  and clean metadata removal. TCDB Atlee Hammaker #422 retained over secondary
  Charlie Haag error; Jim Pankovits spelling retained over Pankowits typo.
- Importer passed bundle/CSV validation, then stopped at first database read
  because DATABASE_URL is absent here. Database dry run/apply not completed.

Product unreleased; images/pricing pending and release blocked.

```bash
npm run import:set-bundle -- data/set-factory/1989-score-baseball.bundle.json
npm run import:set-bundle -- data/set-factory/1989-score-baseball.bundle.json --apply --allow-pending-teams
```
