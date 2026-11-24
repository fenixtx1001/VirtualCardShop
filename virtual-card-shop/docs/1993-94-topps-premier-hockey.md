# 1993–94 Topps Premier Hockey

| Checklist | Cards | Physical distribution | VCS odds |
| --- | ---: | --- | --- |
| Base | 528 | #1–264 Series One, #265–528 Series Two | Base pool |
| Gold | 528 | One guaranteed, second Gold in 1:4 regular packs. Four per jumbo pack | 1:1 |
| Black Gold | 24 | #1–12 Series One, #13–24 Series Two, 1:72 packs | 1:72 |
| Finest | 12 | Topps and O-Pee-Chee Series Two | Pending |
| Team USA | 23 | Topps Series Two, 1:12 | 1:24 |
| Black Gold Redemptions | 3 | Original Winner Group A, B and A/B cards | Pending |
| Finest Redemptions | 2 | Instant Winner cards for a full set or a single card | Pending |
| Total | 1,120 | | |

VCS uses 12 cards per pack and 36 packs per box. Beckett's pack description
and sealed-box listings support this standard hobby configuration. The two
equal series share one VCS pack, so Team USA's Series Two rate is halved.
VCS guarantees one Gold per pack. Its rip engine awards up to one hit per
checklist per pack, so the physical chance of a second Gold is omitted.
Pending odds leave Finest and the redemption cards in the checklist
without adding them to the pack draw.

## Verification

- Both complete 528-card sequences were retrieved from TCDB and compared
  by number, subject and team. Gold replaces base checklists #263, #264,
  #527 and #528 with Martin Lapointe, Kevin Miehm, Myles O'Connor and
  Jamie Leach, respectively. Beckett and Puck Junk corroborate the four
  substitutions.
- All 24 RC entries match TCDB's dedicated rookie index. The ten Super
  Rookies have their own subset label. Rookie suffixes appear only on Base.
- All 23 Team USA numbers and names match Puck Junk's independent checklist.
  The 24 numbered Black Gold cards and 12 Finest cards agree with the
  checklist sizes reported by Beckett and Puck Junk.
- Black Gold's three original exchange cards are separate from the
  numbered player checklist. The three Certified Winners were replacement
  cards sent after redemption and are excluded. The two unnumbered Finest
  redemptions use distinct VCS identifiers, NNO-FULL-SET and NNO-SINGLE-CARD.
- Pre-production samples, the promo sheet and the separate O-Pee-Chee
  product are excluded.
- Reproducibility checks and offline VCS importer validation passed.
  Artwork, pricing and pending odds remain open. The product imports
  unreleased.

[TCDB base](https://www.tcdb.com/Checklist.cfm/sid/4988/1993-94-Topps-Premier) ·
[TCDB rookies](https://www.tcdb.com/Rookies.cfm/sid/4988/1993-94-Topps-Premier) ·
[TCDB related issues](https://www.tcdb.com/Inserts.cfm/sid/4988/1993-94-Topps-Premier---Black-Gold) ·
[Beckett Gold](https://www.beckett.com/hockey/1993-94/topps-premier-gold/) ·
[Beckett Black Gold](https://www.beckett.com/hockey/1993-94/topps-premier-black-gold/) ·
[Beckett Finest](https://marketplace.beckett.com/item/817/1993-94-topps-premier-finest-1-alexandre-daigle_69376662) ·
[Puck Junk Team USA](https://puckjunk.com/2018/02/19/review-1993-94-topps-team-usa/) ·
[Sealed Series Two configuration](https://www.dacardworld.com/sports-cards/1993-94-topps-premier-series-2-hockey-hobby-box)

## Import from GitHub

Run from the configured VCS Codespaces checkout. The helper uses a
temporary worktree and runs a database dry run before applying. Omit
`--apply` to stop after the dry run.

```bash
git fetch origin codex/set-factory-1993-94-topps-premier-hockey &&
bash <(git show FETCH_HEAD:virtual-card-shop/scripts/import-1993-94-topps-premier-hockey.sh) --apply
```
