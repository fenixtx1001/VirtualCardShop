# 1992 Score Baseball — Set Factory QA

## Sources

- https://www.tcdb.com/Checklist.cfm/sid/200/1992-Score (all ten pages)
- https://www.tcdb.com/Inserts.cfm/sid/200/1992-Score
- Individual TCDB insert checklist URLs are preserved in bundle productSets[].sourceUrl.
- https://baseballcardpedia.com/index.php/1992_Score
- https://keymancollectibles.com/baseballcards/score/1992scorebaseballcardchecklist.htm
- https://www.beckett.com/baseball/1992/score-dimaggio/

## Complete checklist scope

1012 cards in eight complete Product Sets:
893 Base; 90 90's Impact Players; 10 Hot Rookies; 5 Joe DiMaggio Yankee Clipper;
5 DiMaggio Autographs; 4 The Franchise; 4 Franchise Autographs; 1 Chuck Knoblauch
1991 Rookie of the Year Autograph (signed 1990 Score #672).

Keep both physical series together: 1-442 and 443-893. All base subsets remain in
one collector checklist. All 941 TCDB base source rows collapse to 893 positions;
48 extra error/variation rows do not become extra completion requirements.
Prefer explicit pack states over factory-set print states, otherwise corrected/
later b states. Dream Team pack versions have no copyright info below card number.
Rookie Prospect variants are metadata, not separate Product Sets.

Independent BaseballCardPedia positional coverage: 892 named base rows, 90 Impact,
10 Hot Rookies, 5 unsigned DiMaggio and 4 unsigned Franchise. Its base #223 entry
is missing/malformed; Ray Lankford #223 is corroborated by Keyman Collectibles.
It describes the autograph distributions without complete numbered autograph
checklists. TCDB supplies all signed rows, including all five DiMaggio subjects.
Do not incorrectly collapse DiMaggio autographs to one checklist entry.

Reviewed secondary-source subject discrepancies: TCDB Atlee Hammaker #233 instead
of Charlie Haag; Jarvis Brown #870 instead of Jarvis Gardner; Lou Gehrig #881
instead of Lou Wagner. No-Hit Club #427 correctly includes Gregg Olson as the
fourth pitcher; the secondary source omits him. Other differences are nickname/
full-name forms, middle initials and multi-player ordering.

Key RC checks: Manny Ramirez #800, Vinny Castilla #860. RC suffixes follow explicit
source designations rather than Rookie Prospect/Draft Pick status alone. No RC
suffix is inferred for insert cards or Knoblauch's later signed buyback.

## Autograph metadata

DiMaggio signed 2500 cards across five subjects; 2495 entered packs and five were
promotion prizes. SN2500 is aggregate-series metadata, not 2500 copies of each.
Knoblauch SN3000 is signed in gold ink, 2989 pack cards and 11 promotion prizes.
Franchise #1-3 are single autographs SN2000 in blue ink; #4 is a triple autograph
SN500 in gold ink. Keep all four Franchise autograph cards in one collector set.
Unsigned DiMaggio PR30000 and Franchise PR150000 are not serial numbered.

Factory Bonus Cards, promo panels/samples and separate Rookie/Traded, Pinnacle,
Procter & Gamble and other releases are excluded.

## Pack format and pending odds

Wax: 16 cards, 36 packs/box. No Magic Motion cards in this release.
Blisters: 100 base cards + 1 Hot Rookie. Convert 100/16=6.25 wax equivalents to
rounded 1:6 VCS Hot Rookie odds; this is an intentional channel approximation.
Superpacks: 45 total cards with five Impact Players. Current VCS inserts can pull
only one card per family in a pack. Impact odds remain null pending a deliberate
multiplicity/abstraction decision, rather than pretending to reproduce five hits.

Rare insert pack odds are not established by the research. Verified print runs do
not determine per-pack odds without a reliable total pack count. Thus DiMaggio,
DiMaggio Autographs, Franchise, Franchise Autographs and Knoblauch Autograph odds
remain null. Their checklist rows will exist in Admin but these families will not
be pulled until odds are configured. InsertOdds review is PENDING, release BLOCKED.
No invented rarity ratios or silent estimates are included.

## Validation

- Generator and --self-test PASS: 1012 unique set/number pairs; exact expected
  ranges, all teams populated, clean names, RC flags and pack-state assertions.
- Strict token-boundary tests preserve names ending in marker-like letters.
- Importer passed schema/CSV/team validation then stopped at first DB read because
  DATABASE_URL is absent here. Database dry run/apply have not completed.

Product unreleased; odds, pricing and images require review before release.

```bash
npm run import:set-bundle -- data/set-factory/1992-score-baseball.bundle.json
npm run import:set-bundle -- data/set-factory/1992-score-baseball.bundle.json --apply
```
