# 1997 Score Baseball

The draft contains 2,333 cards in 14 retail Score checklists. The distinct
Premium Stock and Hobby Reserve products and their exclusive inserts are
outside this draft. The retail Hobby Reserve by Score parallel is included.

| Checklist | Cards | Combined VCS odds |
| --- | ---: | --- |
| Base | 551 | Base pool |
| Showcase Series | 551 | 1:7 |
| Artist's Proofs Holofoil | 551 | 1:35 |
| Artist's Proofs White Border | 330 | 1:58 |
| Hobby Reserve by Score | 220 | Pending |
| Andruw Jones | 1 | Pending |
| Blast Masters | 18 | 1:87 |
| Heart of the Order | 18 | 1:57 |
| Pitcher Perfect | 15 | 1:38 |
| Stand & Deliver | 24 | 1:177 |
| Stellar Season | 18 | 1:58 |
| The Franchise | 9 | 1:120 |
| The Franchise Glowing | 9 | 1:401 |
| Titanic Taters | 18 | 1:58 |

## Checklist verification

All 14 TCDB checklists are frozen in the source snapshot. Each of the
four parallels matches the retail Base subjects and teams across its
numbered range. BaseballCardPedia corroborates the base numbering,
parallel structure, and seven numbered insert checklists. Its Pitcher
Perfect #3 lists Alex Rodriguez first. VCS retains TCDB's order with
Cal Ripken Jr. first and keeps the teams in the same order as the players.

Both Jim Thome and Gary Sheffield have printed #515. VCS uses
`515-Thome` and `515` across the relevant checklists, with no separate
#514. The corrected Chili Davis #338 represents both base printings.
#551 Hideki Irabu is the English retail short print. BaseballCardPedia
labels it RC, while the dedicated TCDB rookie index omits it. VCS uses
the ten TCDB rookie labels and keeps Irabu in the Rookies subset.

The retail Heart of the Order checklist ends at #18. The separate
Hobby Reserve product contains #19–36. FanFest, the 5x7 blaster
box toppers, samples and the framed mail-in Gold set are excluded.

## Pack model

The combined VCS product uses four cards per pack and 36 packs per box,
following the prior Score draft. Physical retail packs held 10 cards in
Series One and 12 in Series Two. For series-specific families, the
published denominator is divided by the series share of 330/551 or
221/551 and rounded. Stellar Season uses its Series One jumbo rate.
The Holofoil pool uses TCDB's retail 1:35 listing. BaseballCardPedia
leaves the Series One retail Holofoil rate unspecified.

Andruw Jones was one per Series Two blister. The fraction of blister
packs in a mixed VCS product is undefined, so its combined odds are
unset. The retail Hobby Reserve by Score insertion rate is unverified.
Those two checklists are staged without pack hits. The model records
short prints as card metadata and uses equal availability within Base.

The generator, offline importer checks and import script syntax passed.
Artwork and pricing are pending. The import creates the product unreleased.

[TCDB base](https://www.tcdb.com/Checklist.cfm/sid/1001/1997-Score) ·
[TCDB related sets](https://www.tcdb.com/Inserts.cfm/sid/1001/1997-Score) ·
[TCDB rookies](https://www.tcdb.com/Rookies.cfm/sid/1001/1997-Score) ·
[BaseballCardPedia](https://baseballcardpedia.com/index.php/1997_Score) ·
[Beckett](https://www.beckett.com/baseball/1997/score)

## Import from GitHub

Run from the configured VCS Codespace. The helper verifies the bundle
and runs a database dry run before applying. Omit `--apply` for dry run only.

```bash
git fetch origin codex/set-factory-1997-score-baseball &&
bash <(git show FETCH_HEAD:virtual-card-shop/scripts/import-1997-score-baseball.sh) --apply
```
