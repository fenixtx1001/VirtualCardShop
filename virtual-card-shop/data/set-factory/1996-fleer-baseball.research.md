# 1996 Fleer Baseball — Set Factory checklist and QA

Unreleased draft: **1,333 explicit card rows across 14 ProductSets**, including 600 Base and 600 Tiffany. Number/name/team inventories are complete. One true-RC designation is disputed and remains explicitly pending: base #120 Clint Sodowsky. Pricing, images and pack QA are not complete and the product must remain unreleased.

## Inventory

| ProductSet | Cards | IDs | Draft odds per pack |
| --- | ---: | --- | ---: |
| Base | 600 | 1–600 | Base pool |
| Tiffany | 600 | 1–600 | 1 |
| Checklists | 10 | 1–10 | 6 |
| Golden Memories | 10 | 1–10 | 10 |
| Lumber Company | 12 | 1–12 | null, Retail-exclusive |
| Post-Season Glory | 5 | 1–5 | 5 |
| Prospects | 10 | 1–10 | 6 |
| Road Warriors | 10 | 1–10 | 13 |
| Rookie Sensations | 15 | 1–15 | 11 |
| Smoke 'N Heat | 10 | 1–10 | 9 |
| Team Leaders | 28 | 1–28 | 9, Hobby-only |
| Thanks a Million Game Card | 1 | NNO | 1 |
| Tomorrow's Legends | 10 | 1–10 | 13 |
| Zone | 12 | 1–12 | 90 |
| **Total** | **1,333** | | |

Default product configuration uses published **Hobby** odds. Hobby and Retail are not blended using an invented market share. Lumber Company was Retail-only at 1:9 and therefore remains null in this Hobby model; its full checklist is available for Admin pricing/images. Team Leaders is Hobby-only at 1:9 and enabled. Admin can choose a different channel model before release.

## Sources and retrieval

Primary checklist source: [TCDB 1996 Fleer, sid 677](https://www.tcdb.com/Checklist.cfm/sid/677/1996-Fleer), [rookie index](https://www.tcdb.com/Rookies.cfm/sid/677/1996-Fleer), [insert/parallel index](https://www.tcdb.com/Inserts.cfm/sid/677/1996-Fleer). Independent checklist: [BaseballCardPedia](https://baseballcardpedia.com/index.php/1996_Fleer). Additional references: [Beckett's published Hobby box break](https://www.beckett.com/news/cheap-wax-wednesday-box-breaks-1996-fleer-baseball/), [Beckett Tiffany issue description](https://www.beckett.com/baseball/1996/fleer-tiffany), [Keyman set description](https://keymancollectibles.com/baseballcards/fleer/1996fleerbaseballcards.htm), [Keyman checklist](https://keymancollectibles.com/baseballcards/fleer/1996fleerbaseballcardchecklist.htm).

The source snapshot preserves normalized retrieved rows, full URLs and SHA-256 hashes of retrieved HTML. Base has 600 rows across six pages and an empty seventh page; the separate rookie index has 18 rows and an empty second page. Tiffany has 601 source records across seven pages, including one individually cataloged gold-foil printing variant. Each parsed source row's linked card-set namespace is checked against the requested sid during refresh. BasicID filters from other sets are not reused.

Every base number and player identity is independently compared with BCP, and every regular numbered insert identity is matched. All 600 canonical Tiffany entries are retrieved from their own namespace and compared by number/name/team with the entire Base checklist. Tiffany is explicit CSV data, not an assumed full parallel generated from count alone. The single generic game card is directly verified at TCDB and its existence/pack inclusion independently described by BCP and Beckett. No scans are being claimed as harvested in this stage.

TCDB issue IDs: 10763 Tiffany; 678 Checklists; 679 Golden Memories; 680 Lumber Company; 681 Post-Season Glory; 682 Prospects; 683 Road Warriors; 684 Rookie Sensations; 685 Smoke 'N Heat; 686 Team Leaders; 222696 Thanks a Million; 687 Tomorrow's Legends; 694 Zone.

### Scope corrections

- **Zone has 12 cards.** BCP's insertion table says 10, but its enumerated checklist and issue prose, and the complete TCDB checklist, all establish 12. Do not omit Mo Vaughn #11 or Matt Williams #12.
- **Tiffany is glossy with silver holographic foil**, verified one per pack. It is distinct from glossy non-holographic silver-foil Team Sets and occasional matte silver-foil/gold-foil printing variants. TCDB's Tiffany source includes #267B Roberto Alomar, Gold Foil; explicitly exclude that exact variation and require canonical numbers 1–600 exactly once. Do not fabricate additional 600-card gold/silver parallel sets.
- Separate Fleer Update, the separately numbered nine Team Sets, Cal Ripken P20 promotional sample, and unverified full printing-error checklists are excluded. No pack-issued autograph family was established for this product.
- Keep the single documented Thanks a Million physical game card. Six scratch-off letters do not establish six different collector card entries. Do not invent letter variants, current prizes or automatic redemption.
- All Base cards are ordinary numbered player cards; the separate ten-card Checklists insert receives subset `Checklist`. Checklist ranges are metadata, not part of player names. Actual checklist subjects retain their verified teams.
- Golden Memories #2 includes Barry Bonds / Sammy Sosa and both San Francisco / Chicago Cubs teams; #10 includes Alan Trammell / Lou Whitaker. No multi-person source is shortened to one player.
- Review aliases are explicit: Javy/Javier Lopez, Curt/Curtis Leskanic, Brian/Brian L. Hunter, Dave/David Nilsson, Wil/Wilfredo Cordero, Bob/Bobby Higginson, and William VanLandingham / Van Landingham. Preserve actual source labels in output; aliases are only comparison rules, not fuzzy matching. Tiffany #298 uses Javy Lopez while Base #298 uses Javier Lopez; both refer to the same player/team.

## Rookie audit and explicit unresolved label

**18 Base cards are source-confirmed RCs**, with number/name/team agreement between the canonical TCDB checklist and its separately retrieved rookie index:

62 Luis Andujar; 69 Matt Karchner; 76 Mike Sirotka; 138 Mike Sweeney; 167 Matt Lawton; 212 Doug Johns; 223 George Williams; 279 Paul Menhart; 282 Ken Robinson; 317 Matt Franco; 409 Dean Hartgraves; 423 Donne Wall; 429 Juan Castro; 467 F.P. Santangelo; 519 Angelo Encarnacion; 531 Steve Parris; 582 Marvin Benard; 584 Jamie Brewington.

BCP explicitly marks 14 of these and omits RC on #62, #282, #317 and #409. Those four retain their explicit TCDB-confirmed RC designations. Mike Sweeney and Matt Lawton are also independently identified as key rookies in product descriptions.

**Base #120 Clint Sodowsky is a genuine unresolved designation discrepancy.** BCP labels it RC; TCDB's canonical record and rookie index do not, and Keyman does not label it RC. Other listings identify a recognized 1996 Topps #429 rookie, but a rookie in a different issue does not by itself resolve the specific Fleer card's designation. Beckett's full live lookup could not provide a usable resolving card record. Do not claim that omission of a source tag proves non-rookie status. The CSV conservatively leaves #120 without an RC suffix and carries a card-specific disputed-status note. The bundle has `review.rookieDesignation=PENDING_120_SOURCE_DISAGREEMENT`. Resolve this before release; the card's number, subject and Detroit team are verified and it is not omitted from the draft.

References for that disagreement: [BCP checklist](https://baseballcardpedia.com/index.php/1996_Fleer), [TCDB page two](https://www.tcdb.com/Checklist.cfm/sid/677/1996-Fleer?PageIndex=2), [Keyman checklist](https://keymancollectibles.com/baseballcards/fleer/1996fleerbaseballcardchecklist.htm), [Baseball Almanac's Sodowsky card list](https://www.baseball-almanac.com/players/cards.php?p=sodowcl01).

Tiffany source rows have no true-RC tags, so parallel cards do not inherit a true-RC suffix from a different issue. Rookie Sensations, Prospects and Tomorrow's Legends titles alone do not confer RC status. There are 18 RC-suffixed CSV rows, all in Base; this count does not conceal the unresolved #120 label.

## Teams and pack model

All player and composite teams are populated from source rows and checked against the 28 historical franchises. Only the NNO Thanks a Million token has no franchise. It stays blank rather than receiving invented MLB/Multiple data. `review.teamData=PENDING` and `--allow-pending-teams` stage this known generic token; any ordinary player missing a team fails generation. There are no other missing-team lookups.

Reviewed `docs/set-factory.md`, `docs/set-factory-generator-conventions.md`, importer/wrapper, pack-opening route and pack-pricing implementation.

- Published packs contain 11 trading cards; the VCS item model adds the documented separate game token, totaling **12 items**, 36 packs/box. This item-count choice is explicit in the bundle rather than silently treating the game token as an additional baseball player card.
- Tiffany uses `kind=PARALLEL`, neither Base nor Insert in legacy boolean flags. The existing pack engine rolls all non-base families with positive odds; Tiffany is therefore pullable and its odds 1 guarantees one from the populated pool. Game-card odds 1 similarly guarantees its token. These two hits leave ten slots before other insert replacements.
- Original nine-base/one-Tiffany/one-insert collation cannot be guaranteed by independent family rolls. Zero or several other inserts can occur. Keep original collector checklists intact and published Hobby ratios, record this engine limitation, and keep pack/release QA pending. No app engine or pricing changes are included.
- Set-wide odds stay exclusively in ProductSet fields, not individual variants. This is an unreleased draft with pricing and all art still pending. Reimport preserves existing pricing, images and release state. No production import, release or deployment was performed here.

## Tests

Executed successfully:

```bash
python3 scripts/generate-1996-fleer-baseball.py --refresh-sources
python3 scripts/generate-1996-fleer-baseball.py --self-test
python3 scripts/generate-1996-fleer-baseball.py --check
node --import tsx --test tests/*.test.ts src/lib/reward-snapshot.test.ts
node --import tsx scripts/test-open-pack-meta.ts
node --import tsx scripts/test-checklist-best-grade.ts
node --import tsx scripts/test-import-smoke.mjs
node node_modules/eslint/bin/eslint.js scripts/test-1996-fleer-baseball.mjs
git diff --check
```

The generator checks the complete explicit 1,333-row inventory, every numeric/collector ID, all Base and Tiffany identities/teams, all numbered inserts against the independent checklist, confirmed and disputed rookie status, subset/metadata cleanup, correct parallel kind/odds and pack settings. Parser tests enforce linked-source set identity and whole trailing-token boundaries (Boswell/Marshall/Hall remain intact). Nine corruption tests reject missing Base, wrong subject, wrong known team, missing team, unverified RC, missing Zone card, wrong Tiffany identity, missing Tiffany and an unreviewed extra foil variation. `--check` compares the committed CSV byte-for-byte with validated generation. Existing unit suite: **30 passed, zero failed**; additional regression/smoke scripts passed.

The **actual Prisma importer** was tested against isolated in-memory PostgreSQL (PGlite 0.5.13 + pglite-socket 0.2.16), initialized from SQL generated from the repository's full Prisma schema. Temporary test dependencies remain outside the repository; application dependencies are unchanged. No production connection or mocked Prisma client was used.

`scripts/test-1996-fleer-baseball.mjs` requires explicit localhost `SET_FACTORY_TEST_DATABASE_URL`, database name `fleer96_set_factory_test` and empty Product/Card tables. Passed: no-write dry-run, missing-team override gate, one unreleased Product, 14 ProductSets, 1,333 cards, all counts/flags/odds, 18 confirmed RCs, the disputed #120 note, all 600 Tiffany cards without inferred RC flags, correct composite teams and one intentional blank; rerun inserts zero and updates 1,333 without duplicates; Product/ProductSet prices, book values and front/back/pack images preserved; product remains unreleased; released=true input rejected.

Run only on a disposable local database initialized from the Prisma schema:

```bash
SET_FACTORY_TEST_DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:PORT/fleer96_set_factory_test?connection_limit=1' \
  node scripts/test-1996-fleer-baseball.mjs
```

This execution environment blocks tsx CLI's IPC socket, so tests use equivalent `node --import tsx scripts/import-set-bundle.ts`. Normal Codespaces can use the npm wrapper, which invokes that same importer and flags.
