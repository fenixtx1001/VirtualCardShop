# 1968 Topps Baseball

| Checklist | Cards | VCS odds |
| --- | ---: | --- |
| Base | 598 | Base pool |
| Game | 33 | 1:7, modeled |
| Total | 631 | |

Base combines the seven physical series: #1–109, #110–196, #197–283,
#284–370, #371–457, #458–533 and #534–598. All 598 numbers match
BaseballCardPedia's independent checklist. The TCDB snapshot records
612 physical entries, which reduce to 598 printed numbers across 12
variant groups. VCS selects one printing per number and prefers known
corrections, including #10, #208, #247 and #518. The snapshot retains
the alternatives and source notes. Proofs, separately sold Posters and
Milton Bradley board-game printings are outside the standard wax product.

The 47 unique TCDB rookie-index numbers were reconciled with the base
checklist. #177 marks both Jerry Koosman and Nolan Ryan as RC. #247 marks
Johnny Bench only, following the card-specific note. #16 Lou Piniella /
Richie Scheinblum is in the Rookie Stars subset without an RC label.
The generator preserves the other single-player exceptions from TCDB
on shared cards. League Leaders, World Series, Sporting News All-Stars,
All-Star Rookie, team, manager, combo and checklist subsets are retained.

All 33 Game card numbers and subjects match KeyMan Collectibles after
resolving eight familiar-name differences, such as Henry Aaron and Hank
Aaron. TCDB names and period team labels are retained.

## Pack model

VCS uses five cards per pack and 24 packs per box. One Game insert per
eligible third-series wax pack is the documented baseline. The combined
VCS odds use the third-series share of the base checklist, 87/598,
rounded to one hit per seven packs. This is a VCS modeling choice.
Reports describe occasional doubles and Game cards in later cello packs.
The VCS model uses one Game hit at most, occupying a slot within the
five-card pack.

Generator reproducibility and offline VCS importer validation passed.
Artwork and pricing are pending. The import creates the product unreleased.

[TCDB base](https://www.tcdb.com/Checklist.cfm/sid/68/1968-Topps) ·
[TCDB rookies](https://www.tcdb.com/Rookies.cfm/sid/68/1968-Topps) ·
[TCDB Game](https://www.tcdb.com/Checklist.cfm/sid/9503/1968-Topps---Game) ·
[BaseballCardPedia](https://baseballcardpedia.com/index.php/1968_Topps) ·
[KeyMan Game checklist](https://www.keymancollectibles.com/baseballcards/1968toppsgamecardinsert.htm) ·
[Beckett set profile](https://www.beckett.com/baseball/1968/topps/) ·
[Vintage pack configuration](https://www.sportscollectorsdaily.com/vintage-pack-facts-1968-topps-baseball/)

## Import from GitHub

Run from the configured Codespace. The helper verifies the checklist and
runs the database dry run before applying. Omit `--apply` to run only
the checks and dry run.

```bash
git fetch origin codex/set-factory-1968-topps-baseball &&
bash <(git show FETCH_HEAD:virtual-card-shop/scripts/import-1968-topps-baseball.sh) --apply
```
