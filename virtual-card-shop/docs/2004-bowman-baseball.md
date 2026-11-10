# 2004 Bowman Baseball

| Checklist | Cards | Standard hobby VCS odds |
| --- | ---: | --- |
| Base | 330 | Base pool |
| Gold | 330 | 1:1 |
| 1st Edition | 330 | Separate packs |
| Uncirculated Silver | 330 | Box loader or set redemption |
| Uncirculated Gold | 165 | Fulfilled redemption |
| Autographs | 15 | 1:72 |
| Autographs Red Ink | 15 | 1:1466 |
| Base of the Future Autograph | 1 | HTA only, 1:110 HTA |
| Base of the Future Autograph Red Ink | 1 | HTA only, 1:5112 HTA |
| Futures Game Gear Jerseys | 28 | 1:26, modeled |
| Relics | 10 | 1:96, modeled |
| Signs of the Future | 19 | 1:52, modeled |
| Signs of the Future Red Ink | 19 | 1:1466 |
| 2003 ROY Dual Relic | 1 | 1:829 |
| Total | 1,594 | |

## Checklist verification

TCDB checklists, including all pages of the Base, Gold, 1st Edition
and Uncirculated families, are frozen in the source snapshot. The
330 base numbers and subjects match BaseballCardPedia after accounting
for familiar names and aliases. Each numbered parallel matches the
Base card's subject and team. Standard and Red Ink autograph checklists
match by card number and subject. The Red Ink cards retain SN25.
TCDB's identifiers are used for the two HTA Sizemore cards.

The full TCDB rookie index contains 164 base cards. The 165 First Year
cards include Bobby Madritsch #197, which the index omits. VCS keeps his
First Year subset label. Félix Hernández #224 and Yadier Molina #301
carry RC. Rookie suffixes apply only to Base. The original checklist
notes preserve the photo errors on Joe Mauer #152 and Don Sutton #218.

Uncirculated Gold contains 165 numbered player cards, #166–330, with a
print run of 210 each. TCDB's 166th checklist entry is an unnumbered
exchange card. The 330 numbered Uncirculated Silver cards have SN245.
TCDB's additional Silver entry is the unnumbered complete-set claim
ticket. Both tickets are in the source snapshot, outside the player
checklists. Bowman Chrome and Bowman Draft are separate products.

## Pack model

The VCS draft uses 10 cards per pack and 24 packs per box with a
guaranteed Gold slot. The 1st Edition, Uncirculated and HTA-only cards
have null odds in this standard hobby pack. Their checklist rows remain
available for catalog work.

Three insert families have published rates for multiple physical
groups. VCS sums the per-group hit probabilities and rounds the
reciprocal to a whole-pack denominator. The bundle records the
published group rates and the card rows carry group labels. The
current rip engine draws equally within a family, so the model
approximates the family hit rate and flattens card-level scarcity.

Generator reproducibility and offline validation with the VCS
importer passed. The database dry run occurs in Codespaces.
Artwork and pricing remain pending. The product imports unreleased.

[TCDB Base](https://www.tcdb.com/Checklist.cfm/sid/1681/2004-Bowman) ·
[TCDB rookie index](https://www.tcdb.com/Rookies.cfm/sid/1681/2004-Bowman) ·
[TCDB inserts and related sets](https://www.tcdb.com/Inserts.cfm/sid/1681/2004-Bowman) ·
[BaseballCardPedia checklist and odds](https://baseballcardpedia.com/index.php/2004_Bowman) ·
[Beckett configuration](https://www.beckett.com/baseball/2004/bowman/)

## Import from GitHub

Run from the configured VCS Codespace. The helper verifies the frozen
checklists and runs a database dry run before applying the draft.
Omit `--apply` to stop after the dry run.

```bash
git fetch origin codex/set-factory-2004-bowman-baseball &&
bash <(git show FETCH_HEAD:virtual-card-shop/scripts/import-2004-bowman-baseball.sh) --apply
```
