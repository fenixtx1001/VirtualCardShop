# 1990 Score Baseball — Set Factory QA

## Sources

- https://www.tcdb.com/Checklist.cfm/sid/144/1990-Score (all eight pages)
- https://www.tcdb.com/Inserts.cfm/sid/144/1990-Score
- https://www.tcdb.com/Checklist.cfm/sid/48378/1990-Score-Magic-Motion-The-MVPs
- https://www.tcdb.com/Checklist.cfm/sid/10172/1990-Score-Young-Superstars-Set-1-
- https://baseballcardpedia.com/index.php/1990_Score
- https://shopbck.com/1990-score-baseball-rack-pack/

## Scope and formatting

802 cards across three complete Product Sets: 704 Base, 56 Magic Motion: The MVPs,
42 Young Superstars Set 1. Independent BaseballCardPedia coverage matches every
number in all three checklists. Keep the complete 704-card base intact; Rookies
580-657, Draft Picks 661-682, Dream Team 683-695, selected Highlights and World
Series cards are subsets, not separate pull pools. #697 BO is normal base supply.

722 TCDB base rows collapse to 704 canonical positions by preferring corrected/
later b states. Preserve notes in variant; do not add extra completion positions.
Explicit RC labels only. Key assertions: Sammy Sosa #558, John Olerud #589,
Larry Walker #631, Dave Justice #650, Frank Thomas #663. No rookie inference
from Draft Picks, Dream Team or Magic Motion membership alone.

TCDB labels #697 BO with blank team. Canonical display is Bo Jackson, subset BO.
Its baseball affiliation Kansas City Royals is derived from the same-set Bo cards
#280, #566 and #687, all agreeing. This is an explicit metadata normalization,
not a claim that a Royals logo appears on the two-sport portrait. Portrait details
and the normal-production decision are corroborated by BaseballCardPedia.

World Series #700-703 subjects are independently sourced player/team/venue names;
event titles remain metadata. Magic Motion award league/year is metadata and
historical team affiliations come from TCDB. No trivia rookie suffixes.

## Exclusions and pack abstraction

Rookie Dream Team (10 cards) was a Hobby factory-set bonus, not a pack insert.
Young Superstars Set 2 was a separate mail-in boxed product. Promos, Rookie/Traded,
McDonalds and other separately distributed products are excluded.

Wax: 16 baseball cards plus 1 Magic Motion card, 36 packs/box. Racks: 48 base
cards + 1 Young Superstars + 3 trivia cards (49 baseball cards total).
VCS inserts replace base slots, so cardsPerPack=17 with Magic Motion at 1:1
provides 16 base + 1 trivia normally. Rack-exclusive Young Superstars Set 1 uses
1:3 VCS odds from 48/16=3 wax equivalents, replacing one base slot on a hit.
This is a deliberate universal-pack approximation, not historical wax odds.

## Checks

- Generator/self-test PASS: 802 unique set/number pairs, all teams populated.
- Independent positions: 704 Base + 56 Magic Motion + 42 Young Superstars.
- Strict trailing-token tests preserve suffix-looking surnames. Metadata tags,
  error notes and award details do not leak into subject names.
- Reviewed secondary-source differences are nicknames/full names, such as
  Joey/Albert Belle, Goose/Mauro Gozzo, Dave/David Justice, Maurice/Mo Vaughn,
  Frank/Frankie Frisch and Henry/Hank Aaron. TCDB Atlee Hammaker #231 retained
  over secondary Charlie Haag error. Multi-player event subjects checked separately.
- Importer passed bundle/CSV/team validation, then failed its first DB read because
  DATABASE_URL is absent here. Database dry run/apply have not completed.

teamData COMPLETE. Product unreleased; images/pricing pending, release blocked.

```bash
npm run import:set-bundle -- data/set-factory/1990-score-baseball.bundle.json
npm run import:set-bundle -- data/set-factory/1990-score-baseball.bundle.json --apply
```
