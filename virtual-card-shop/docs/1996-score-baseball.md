# 1996 Score Baseball

The draft includes 1,169 cards across 16 checklists. The Base checklist
combines #1–275 from Series One and #276–517 from Series Two. The four Dugout
and Artist's Proof checklists each retain their own printed #1–110 numbering.
The two dealer Samples checklists are outside the sealed-pack product.

| Checklist | Cards | Physical packs | Physical odds | Combined VCS odds |
| --- | ---: | --- | ---: | ---: |
| Base | 517 | Both series | Base pool | Base pool |
| Dugout Collection Series One | 110 | S1 Hobby/Retail | 1:3 | 1:6 |
| Dugout Collection Series Two | 110 | S2 Hobby/Retail | 1:3 | 1:6 |
| Artist's Proofs Series One | 110 | S1 Hobby/Retail | 1:36 | 1:68 |
| Artist's Proofs Series Two | 110 | S2 Hobby/Retail | 1:36 | 1:77 |
| All Stars | 20 | S2 Jumbo | 1:9 | 1:19 |
| Big Bats | 20 | S1 Retail | 1:31 | 1:58 |
| Diamond Aces | 30 | S1 Jumbo | 1:8 | 1:15 |
| Dream Team | 9 | S1 Hobby/Retail | 1:72 | 1:135 |
| Future Franchise | 16 | S2 Hobby/Retail | 1:72 | 1:154 |
| Gold Stars | 30 | S2 Hobby/Retail | 1:15 | 1:32 |
| Numbers Game | 30 | S1 Hobby/Retail | 1:15 | 1:28 |
| Power Pace | 18 | S2 Retail | 1:31 | 1:66 |
| Reflextions | 20 | S1 Hobby | 1:15 | 1:28 |
| Titanic Taters | 18 | S2 Hobby | 1:31 | 1:66 |
| Cal Ripken 2131 | 1 | S1 Hobby/Retail, Jumbo | 1:300, 1:150 | 1:564 |

VCS uses four cards per pack and 36 packs per box. Physical hobby packs
had ten cards. The combined VCS pack includes all channels and approximates
series frequency by weighting each channel's published per-series rate by
275/517 or 242/517, then rounding to an integer denominator. The Ripken
commemorative uses the standard hobby denominator for that calculation.

## Verification

- Every numbered checklist was checked against the TCDB rows and the
  BaseballCardPedia checklist. Source URLs and original labels are in
  the frozen source snapshot. The two Artist's Proofs lists also match
  their corresponding Dugout subjects and teams.
- Reflextions has 20 numbered entries in both checklists. BaseballCardPedia's
  odds table shows 18. Its checklist and catalog entries for #19 and #20
  support 20. Reflextions #9 team order follows Andre Dawson / Larry Walker.
- Base #30 is Rusty Greer, as cataloged by TCDB and SportsCardsPro.
  BaseballCardPedia lists Tim Salmon at #30 and #328. Salmon is #328 in VCS.
- The 14 base checklist cards retain their league or chase checklist
  subjects and coverage ranges. BaseballCardPedia lists the cover players
  for these entries. Team is blank for those checklist subjects.
- The TCDB rookie index identifies eight base RCs (#239, #256, #258, #264,
  #492, #495, #502, #503). BaseballCardPedia marks five of these as RC.
  VCS follows TCDB's dedicated rookie index for the three extra labels.
  The printed Rookies subset is tracked separately.
- Generator reproducibility, numbering, team coverage, rookie counts and
  the VCS importer's offline bundle validation passed. The import helper
  runs the database-backed dry run in the configured Codespace.
  Artwork and pricing remain pending and the product imports unreleased.

[TCDB base](https://www.tcdb.com/Checklist.cfm/sid/749/1996-Score) ·
[TCDB related sets and odds](https://www.tcdb.com/Inserts.cfm/sid/749/1996-Score) ·
[TCDB rookie index](https://www.tcdb.com/Rookies.cfm/sid/749/1996-Score) ·
[BaseballCardPedia](https://baseballcardpedia.com/index.php/1996_Score) ·
[SportsCardsPro #30](https://www.sportscardspro.com/game/baseball-cards-1996-score/rusty-greer-30)

## Import from GitHub

Run from the existing VCS Codespaces checkout. The helper verifies the
frozen checklist, runs a dry run and imports the draft when passed
`--apply`. Omit that flag for a dry run only.

```bash
git fetch origin codex/set-factory-1996-score-baseball
bash <(git show FETCH_HEAD:virtual-card-shop/scripts/import-1996-score-baseball.sh) --apply
```
