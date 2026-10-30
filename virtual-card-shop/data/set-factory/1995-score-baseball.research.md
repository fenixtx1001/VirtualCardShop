# 1995 Score Baseball — Set Factory QA

## Sources and scope

- https://www.tcdb.com/Checklist.cfm/sid/541/1995-Score (all seven pages)
- https://www.tcdb.com/Inserts.cfm/sid/541/1995-Score
- Each individual insert checklist URL is preserved in bundle productSets[].sourceUrl.
- https://baseballcardpedia.com/index.php/1995_Score
- https://www.beckett.com/baseball/1995/score/

1427 cards across 14 full Product Sets: 605 Base, 605 Gold Rush, 18 Draft Picks,
18 Airmail, 12 Double Gold Champs, 12 Dream Team Gold, 110 Hall of Gold,
12 Rookie Dream Team, 30 Score Rules, Rookie Greatness, Signed Greatness and
three distinct physical redemption cards. CSV has 822 explicit rows; Gold Rush
is derived from all 605 Base positions with metadata preserved.

BaseballCardPedia independently matches all 605 base positions, plus numbered
checklist coverage of all nine player-card insert families (Draft 18, Airmail 18,
Double 12, Dream 12, Hall 110, Rookie Dream 12, Rookie Greatness 1, Rules 30,
Signed 1). Airmail IDs AM01-AM18 preserve the printed zero padding supported by
TCDB. Its AM1 formatting in the secondary source is normalized for comparison.
TCDB supplies the three physical NNO redemption token checklists.

All Base and Gold Rush remain complete collector checklists across Series One
1-330 and Series Two 331-605. Hall of Gold is HG1-HG110, with HG1-55 S1 and
HG56-110 S2, not 110 distinct cards per series as one reference table implies.
Keep the full Hall checklist together. Source namespaces and prefixes preserved.

## Names, teams and exceptions

Display names are clean and RC labels follow explicit source flags. Armando
Benitez #299 and Jim Bowie #598 retain source RC designations. Insert rookie/
draft/award titles do not imply true RC status. Signed Greatness is Ryan Klesko
AU/SN6100, preserved in metadata without a new rookie suffix.

Team checklist subject descriptions/ranges are metadata; player displays Checklist.
Four unassigned checklist cards #602-605 intentionally have blank teams. Three
redemption tokens also have blank teams because they do not represent a club.
All other explicit cards have team affiliations. Gold Rush inherits the same
four checklist exceptions. teamData PENDING is solely due to the three tokens,
since the importer already exempts checklist cards. Use --allow-pending-teams.

Reviewed independent name differences are nicknames/full names, middle initials
and team order on combined checklists. Preserve TCDB Pedro J. Martinez #444 to
distinguish the player. Retain all useful source UER notes as metadata.

## Redemption scope

Only actual in-pack redemption tokens are imported: Platinum Team Set Redemption,
You Trade 'em base Redemption, You Trade 'em Hall of Gold Redemption.
This does not implement a redemption feature or grant exchanged cards.
Platinum Team Sets, stamped/punched Gold Rush returned cards, certificates,
print-ad contest rewards and You Trade 'em exchanged base/Hall cards are excluded
from direct pack distribution. Oversize 7x10 Score Rules from Collector Kits,
samples/title cards, separate Summit and Rookie/Traded products are also excluded.

## Pack format and odds

12 total cards per standard pack, 36 packs/box, guaranteed 1 Gold Rush leaves
11 base slots normally. Other inserts replace base slots. Physical jumbos have
24 cards including two Gold Rush; VCS uses the standard format with one.

S1 base share 330/605=6/11, S2 share 275/605=5/11. Published physical odds are
converted for combined-series availability; each bundle Product Set records the
formula. Draft Picks 1:66, Airmail 1:53, Double Gold 1:79, Dream Gold 1:132,
Hall Gold 1:6, Platinum Redemption 1:36, Rookie Dream 1:158, Rookie Greatness
1:1320, Score Rules 1:15, Signed Greatness 1:1320. Rounded denominators are
explicit approximations. Channel-exclusive inserts are available universally
at source ratios before series weighting; no channel market-share estimates.

Both You Trade 'em redemption tokens have unverified pack ratios and null odds.
Their checklist rows exist in Admin but they will not pull until odds are set.
InsertOdds PENDING; release blocked pending deliberate review of these two tokens.

## Validation

- Generator/self-test PASS: 822 explicit positions + 605 derived Gold Rush = 1427.
- Exact expected numbers/prefixes/zero padding; clean names; RC and team checks.
- Seven explicit blank teams are exactly four checklists plus three tokens.
- Whole-token parsing tests preserve suffix-looking surnames.
- Importer passed bundle/CSV/derived-count validation, then first DB query failed
  because DATABASE_URL is absent here. DB dry run/apply have not completed.

Product unreleased; odds review, pricing and images pending before release.

```bash
npm run import:set-bundle -- data/set-factory/1995-score-baseball.bundle.json
npm run import:set-bundle -- data/set-factory/1995-score-baseball.bundle.json --apply --allow-pending-teams
```
