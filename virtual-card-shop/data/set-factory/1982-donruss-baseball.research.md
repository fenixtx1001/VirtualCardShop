# 1982 Donruss Baseball — Set Factory QA

Sources:
- https://www.tcdb.com/Checklist.cfm/sid/87/1982-Donruss (all seven pages)
- https://baseballcardpedia.com/index.php/1982_Donruss
- https://www.cardboardconnection.com/1982-donruss-baseball-cards
- https://www.psacard.com/cardfacts/baseball-cards/1982-donruss/304

## Scope

660 cards: numbered 1-653 plus seven physically unnumbered checklists, represented
by stable CL-DK and CL1-CL6 VCS identifiers. Checklist ranges are 27-130, 131-234,
235-338, 339-442, 443-544 and 545-653. Do not copy later years' 443-546 range.
The first Diamond Kings (1-26) remain in base. No Rated Rookies subset exists here.
Wax format: 15 cards plus one three-piece Babe Ruth puzzle panel, 36 packs/box.
Puzzle panels, autographed Chicken mail-in redemptions and promotional posters
are not added as pack-distributed baseball cards.

## Canonicalization

668 TCDB rows collapse to 660 positions by choosing corrected/later b states:
Trammell #5/#76 and DK checklist, Rawley #352, Eichelberger #422, Chicken #531,
Garner #544 and Lerch #595. Use TM Chicken version without claiming scarcity.
Player names are clean, with explicit RC/MGR/CO markers where sourced. Source
error/correction details remain metadata. Four combo cards have clean names:
#558 Ron Guidry / Tommy John; #575 Reggie Jackson / Dave Winfield;
#585 Pete Rose / Mike Schmidt; #628 Tom Seaver / Johnny Bench.
Their original titles are subset metadata. No multi-player rookie inference.

## Verification

- Generator/self-test pass: exactly 660 unique expected positions.
- All 653 numeric positions independently matched BaseballCardPedia.
- Card subjects, teams and RC labels checked from TCDB. Secondary differences
  reviewed: DK prefixes/tags, nicknames/full names, George/Jorge Bell, Al/Alvis
  Woods, Tito/Terry Landrum, Mike A. Marshall/Mike Marshall, and corrected
  Keith Drumright #616 versus secondary-source Drumwright typo.
- Key RC assertions: Dave Righetti #73, Lee Smith #252, Cal Ripken Jr. #405,
  Dave Stewart #410, Kent Hrbek #557 and Terry Francona #627.
- Cal Ripken Sr. #579 remains a coach, not a rookie. Token-boundary tests
  preserve surnames such as Hall and Boswell.
- All player/coach/manager cards have teams. Seven checklists and independent
  mascot The Chicken #531 intentionally have blank teams.
- Importer passed bundle/CSV validation then stopped at first database read:
  DATABASE_URL is absent here. Database dry run/apply have not completed.

The importer only exempts checklists, so teamData remains PENDING for the single
known mascot exception. Apply with --allow-pending-teams; do not fabricate Padres
affiliation. Product unreleased, pricing/images pending, release blocked.

```bash
npm run import:set-bundle -- data/set-factory/1982-donruss-baseball.bundle.json
npm run import:set-bundle -- data/set-factory/1982-donruss-baseball.bundle.json --apply --allow-pending-teams
```
