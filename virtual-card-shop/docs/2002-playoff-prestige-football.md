# 2002 Playoff Prestige Football

Unreleased Set Factory draft, researched November 6, 2026. 998 cards in 16
collector checklists. No production database changes were made during preparation.

| Checklist | Cards | Pack odds encoded |
| --- | ---: | --- |
| Base | 216 | Base pool |
| Banner Season | 40 | Pending |
| Banner Season Ink Autographs | 40 | Pending |
| Connections Jerseys | 30 | Pending |
| Draft Picks | 25 | 1:18, contemporary report |
| Draft Picks Autographs | 25 | Pending; fulfilled redemptions |
| Gridiron Heritage Helmets | 20 | Pending |
| Inside the Numbers | 30 | 1:18, Beckett description |
| Inside the Numbers Gold | 30 | Pending |
| League Leader Tandems | 20 | 1:18, contemporary reports |
| League Leader Tandems Materials | 20 | Pending |
| Sophomore Signatures | 40 | Pending |
| Stars of the NFL Autographs | 10 | Pending |
| Stars of the NFL Jerseys | 20 | Pending |
| Xtra Points Green | 216 | Pending |
| Xtra Points Purple | 216 | Pending |
| Total | 998 | |

## Evidence

- [TCDB base checklist](https://www.tcdb.com/Checklist.cfm/sid/4562/2002-Playoff-Prestige),
  pages 1–3: all 216 card numbers, names and teams.
- [TCDB rookie index](https://www.tcdb.com/Rookies.cfm/sid/4562/2002-Playoff-Prestige):
  exactly 66 true RCs, #151–216. Only Base and its direct parallels carry RC suffixes.
- [TCDB inserts and related sets](https://www.tcdb.com/Inserts.cfm/sid/4562/2002-Playoff-Prestige):
  13 insert families, two parallels and four excluded promotional families.
  Each included checklist was retrieved in full, including three pages for each
  parallel. Exact source URLs and original row labels are in the frozen source JSON.
- [Beckett product information](https://www.beckett.com/football/2002/playoff-prestige/):
  216-card base set, 66 short-printed RCs; 5 cards/pack, 20 packs/box;
  released early May 2002, original SRP $4/pack. Historical SRP is not VCS pricing.
- [Beckett Inside the Numbers description](https://marketplace.beckett.com/item/764/2002-playoff-prestige-inside-the-numbers-in7-donovan-mcnabb_35684386):
  1:18 insertion rate.
- [Contemporary hobby break, May 11, 2002](https://forums.collectors.com/discussion/91062/2002-playoff-prestige-fb-good-product):
  reports Draft Picks, Inside the Numbers and League Leader Tandems at 1:18.
  Draft Picks odds have contemporary collector-report evidence rather than a
  manufacturer wrapper confirmation; retain that distinction during release review.
- [Contemporary retail break, August 8, 2002](https://forums.collectors.com/discussion/115435/box-break-2002-playoff-prestige-fb):
  also reports Inside the Numbers and League Leader Tandems at 1:18.
- [Beckett Banner Season description](https://marketplace.beckett.com/item/672/2002-playoff-prestige-banner-season-bs21-joe-greene1972_38346076):
  40 cards numbered to the featured season; Ink autographs numbered to 25.
- [Beckett Inside the Numbers Gold](https://www.beckett.com/football/2002/playoff-prestige-inside-the-numbers-gold/):
  gold foil, numbered to each player's jersey number.
- [Beckett Connections C7](https://marketplace.beckett.com/search_new?print_run=500&team=Carolina+Panthers):
  corroborates Panthers for Chris Weinke / Muhsin Muhammad; TCDB incorrectly lists Miami.

## Checklist decisions and exceptions

- Preserve one complete Base checklist and two complete Xtra Points parallels.
  Base SP rookie availability is flattened within the set under the existing
  Set Factory convention; do not claim physical rookie collation is replicated.
- Both Xtra Points colors: #1–150 SN150 and #151–216 SN25. Preserve actual
  card-specific numbering rather than treating every card as /150 or /25.
- Base #150 displays `Houston Texans`; its inaugural-season/schedule description
  is retained in variant metadata, not the subject name. It is not a player RC.
- Draft Picks uses the college teams printed/catalogued for those cards.
  Base #209 Damien Anderson retains Northwestern Wildcats per the checklist.
- Draft Picks Autographs are fulfilled redemption cards (AU, SN50). The signed
  cards were not directly inserted in packs. VCS has no redemption-claim flow.
- Sophomore Signatures SS26 Marvin Minnis, SS30 Nate Clements, SS39 Travis Henry
  are unsigned SN100. Preserve five AU/SP designations on other cards without
  inventing unknown print runs. These are not 40 uniformly signed cards.
- Stars of the NFL Autographs is a partial ten-card checklist; numbering is
  SN-4, 7, 8, 11, 13, 14, 15, 16, 17 and 19. Preserve individual jersey-number
  print runs and AU/MEM attributes. Jerseys is the separate 20-card SN300 family.
- Connections C-7 corrected from Miami Dolphins to Carolina Panthers.
- League Leader Tandems Materials LL16 lists Troy Brown / Keyshawn Johnson;
  team order corrected to New England Patriots / Tampa Bay Buccaneers.
  LL5's reversed player order relative to the non-materials card is preserved.
- Retain other TCDB team labels, including Indianapolis Colts franchise labeling
  for Raymond Berry. Historical-franchise city normalization is not introduced.
- Exclude 2002 National Embossed, National Embossed Banner Season, Beckett Samples
  Gold and Beckett Samples Silver. They are promotional issues, not pack content.

## Verification and remaining gates

`python3 scripts/generate-2002-playoff-prestige-football.py --check` validates
all counts, duplicate numbers, full numeric sequences, teams, clean subject names,
66 verified base RCs, parallel identities and serial tiers, unsigned exceptions,
and byte-for-byte reproducibility. The generator uses a frozen source snapshot,
so importing does not depend on TCDB availability or live scraping.

The existing VCS importer's actual `validateBundle`, `loadCsvCards` and
`resolveProductSetCards` functions were exercised offline: 16 sets / 998 cards.
No database connection or apply operation was used. Database-backed dry run must
be completed in Codespaces with the user's existing environment.

Unknown hit odds are null and do not participate in pack hit selection. Do not
release this draft until those odds are reviewed/configured. Pricing, pack art,
box art and card images remain pending. New card values start at zero using the
existing importer. Re-imports preserve existing prices/images and release state.
No schema migration or application-code change is required.

## Import from GitHub

From the existing Codespaces checkout, fetch the branch and run its helper.
The helper uses a temporary worktree, runs checklist verification and a database
read-only dry run, then applies only when passed `--apply`. It preserves existing
development files and cleans up the temporary worktree on exit.

```bash
git fetch origin codex/set-factory-2002-playoff-prestige-football
bash <(git show FETCH_HEAD:virtual-card-shop/scripts/import-2002-playoff-prestige-football.sh) --apply
```

Omit `--apply` to run only verification and the database dry run. Review the new
unreleased Product in Admin before configuring missing odds, pricing and artwork.
