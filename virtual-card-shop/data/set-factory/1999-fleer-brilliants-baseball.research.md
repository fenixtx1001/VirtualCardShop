# 1999 Fleer Brilliants Baseball — Set Factory audit

Source retrieval: November 5, 2026 UTC (November 4 in America/Chicago). Product remains an unreleased draft for Admin pricing and image harvesting. No production database changes or deployment were performed.

## Complete catalogued inventory

| VCS collector family | Cards | Numbers | Kind |
|---|---:|---|---|
| Base | 175 | 1–175 | Base |
| Blue | 175 | 1B–175B | Parallel |
| Gold | 175 | 1G–175G, /99 | Parallel |
| 24KT Gold | 175 | 1TG–175TG, /24 | Parallel |
| Illuminators | 15 | 1 I–15 I | Insert |
| Shining Stars | 15 | 1 SS–15 SS | Insert |
| Shining Stars Pulsars | 15 | 1 P–15 P | Parallel |
| Checklists | 2 | NNO-A / NNO-B | Insert |
| **Total** | **747** | **Eight complete families** | |

The full [TCDB base](https://www.tcdb.com/Checklist.cfm/sid/1309/1999-Fleer-Brilliants) and [related-set index](https://www.tcdb.com/Inserts.cfm/sid/1309/1999-Fleer-Brilliants) establish the scope. Each parallel was independently retrieved in its own namespace, including both 100-card and 75-card pages. No parallel list was invented by copying base rows. All 175 numbers, names, teams and subset affiliations cross-check against base after the one explicit Rob/Robert Fick normalization. All fifteen Pulsars match Shining Stars identities and teams, with their actual P-suffix collector identifiers retained.

[BaseballCardPedia](https://baseballcardpedia.com/index.php/1999_Fleer_Brilliants) independently checks all 175 base and thirty regular insert identities, full parallel inventory/print runs, and published insertion rates. Canonical TCDB historical teams are present for all player cards and agree across each parallel and insert/base counterpart. Names are cleaned with whitespace-delimited trailing-token rules. BCP nickname differences Bob Abreu/Bobby Abreu, Bob Higginson/Bobby Higginson and Dave Justice/David Justice are explicitly reconciled. BCP's Mark Johnson #153 is TCDB's Mark L. Johnson, the White Sox catcher; preserve that unambiguous canonical identity. TCDB's three parallel lists call #132 Rob Fick while canonical base and BCP say Robert Fick. Normalize those three rows to Robert Fick with team and number guards.

[Beckett's indexed catalog](https://www.beckett.com/baseball/1999/fleer-brilliants) independently reports 12 RCs, no autograph/memorabilia cards, five-card packs and 175 numbered base cards in its description. Its summary total displays 176, while its description also documents a separate J.D. Drew promotional sample. We do not assume a numbered #176 or import the sample as a pack card. The explicit complete numbered source inventory is #1–175. Full Beckett page retrieval was unavailable; indexed catalog descriptions provide supporting evidence, not an invented second full checklist.

## True rookie designations and subsets

Exactly twelve base RCs match the canonical base labels, the [separately retrieved rookie index](https://www.tcdb.com/Rookies.cfm/sid/1309/1999-Fleer-Brilliants) and all twelve BCP RC marks. Beckett's catalog count independently agrees.

| Number | Verified true RC | Team |
|---|---|---|
| 140 | Pat Burrell | Philadelphia Phillies |
| 141 | Freddy Garcia | Seattle Mariners |
| 151 | A.J. Burnett | Florida Marlins |
| 152 | Scott Hunter | New York Mets |
| 156 | Chad Allen | Minnesota Twins |
| 159 | Gary Bennett | Philadelphia Phillies |
| 160 | Micah Bowie | Atlanta Braves |
| 161 | Doug Mientkiewicz | Minnesota Twins |
| 170 | Masao Kida | Detroit Tigers |
| 172 | Luis Saturria | St. Louis Cardinals |
| 174 | Mario Encarnacion | Oakland Athletics |
| 175 | Roosevelt Brown | Chicago Cubs |

Scott Hunter is marked RC* by BCP; that denotes a player who did not reach MLB, not an additional card or a reason to discard the recognized RC. The full **50-card Rookie subset #126–175** remains within each complete base/parallel checklist. J.D. Drew, Carlos Beltran, Roy Halladay, Mike Lowell and the other non-RC members do not receive false true-rookie tags merely because their cards say Rookie. Parallels and inserts do not get inferred RC suffixes. All 200 Rookie-subset affiliations across base/Blue/Gold/24KT Gold are validated separately from the twelve base true RCs.

## Physical checklist cards, numbering and errors

TCDB catalogs two unnumbered checklist cards in [their own family](https://www.tcdb.com/Checklist.cfm/sid/437446/1999-Fleer-Brilliants-Checklists). Both front/back scans were independently inspected. One covers #1–106; the other covers #107–175 plus all fifteen Illuminators and fifteen Shining Stars. They are two distinct two-sided cards, not two sides miscounted as two cards. Use stable VCS identities NNO-A and NNO-B, clean player `Checklist`, subset `Checklist`, and printed ranges in `variant`. Their blank teams are intentional under the standard checklist exception. All other 745 rows have valid historical franchises, so `review.teamData=COMPLETE` requires no pending-team override.

The Pulsars back scan explicitly shows the Pulsars label and P collector designation. Preserve TCDB collector IDs such as `1 P`, `1 SS` and `1 I`; do not renumber Pulsars as SS or drop base parallel B/G/TG suffixes.

[Source trivia](https://www.tcdb.com/Trivia.cfm/sid/1309/1999-Fleer-Brilliants) identifies an uncorrected Gabe Kapler birth-date error. The actual base #128 back prints 8/31/75; the [official MiLB profile](https://www.milb.com/player/gabe-kapler-137002) gives 7/31/1975. Put the verified UER detail in base #128's variant, keeping player clean. Do not extrapolate the note to parallel backs that were not inspected. The catalog's Errors page itself lists no separate corrected variations; none is invented.

## Pack configuration, odds and release limits

Original [pack/box images](https://www.tcdb.com/Packaging.cfm/sid/1309/1999-Fleer-Brilliants) confirm **five cards per pack / 24 packs per box**, Hobby exclusive, single series. BCP independently agrees. Original box labeling confirms Gold and 24-Karat Gold sequential numbering and Pulsars 1:400 packs.

| Family | Historical evidence | VCS oddsPerPack |
|---|---|---:|
| Base | Rookie range #126–175 inserted 1:2 packs | null (base pool) |
| Blue | Veterans 1:3; Rookie subset 1:6 | 2 (aggregate expectation approximation) |
| Gold | /99; no verified insertion denominator | null |
| 24KT Gold | /24; no verified insertion denominator | null |
| Illuminators | 1:10 packs | 10 |
| Shining Stars | 1:20 packs | 20 |
| Pulsars | 1:400 packs | 400 |
| Checklists | No verified insertion denominator | null |

Blue's two physical range rates imply expected frequency 1/3 + 1/6 = 1/2 card per pack. Denominator 2 preserves that expectation for one complete collector pool. It does **not** assert exact physical range probabilities, card positions or co-occurrence. VCS uses one independent hit roll and uniform card selection within each complete family; collector checklists stay unified rather than splitting ranges to emulate scarcity. Base Rookie range scarcity is flattened too, with a short-print note retained. Odds live only on ProductSets, never in card variants.

Gold, 24KT Gold and Checklists remain present for pricing/images but **inactive in pack pulls until verified odds are configured**. A serial print run alone cannot establish insertion odds. No fabricated Gold or checklist rates. `review.insertOdds` and `review.packCollation` remain pending, alongside prices and images. Product starts `released:false`; it must undergo those reviews before release. The initial $0 pack field is an unpriced draft, not a researched retail valuation.

The J.D. Drew dealer/media SAMPLE promo is explicitly excluded from the pack-issued product. No autograph, memorabilia, additional hologram or other family was verified in the complete related-set index. This product is not 1998–99 Fleer Brilliants Basketball; do not mix those checklists.

## Generator and validation

Delivered files: actual 747-row cards CSV, DRAFT bundle, source snapshot with complete retrieved records and response hashes, this audit, standalone Python generator and importer integration test. Source refresh retrieves all canonical pages, separately parsed independent lists, family index and trivia; requires correct namespaces, complete row parsing and unchanged hashes for ten reviewed original scans. Retrieval failures and validation errors stop before atomic output replacement.

Validation enforces exact card-ID inventories, unique numbers, clean names, all historical teams, subset ranges, twelve true rookies, /99 and /24 print runs, complete parallel correspondence, Pulsars identity/suffixes, two allowed blank checklist teams and all set-level odds. Parser tests reject wrong namespaces and unrecognized linked rows, separate captions from names, preserve suffix-looking surnames and handle suffix/unnumbered IDs. Thirteen corruption cases cover missing/duplicate base, wrong player/team/subset/RC, rookie-index mismatch, wrong serial runs, wrong Pulsars number, missing checklist and wrong parallel namespace.

The actual VCS Prisma importer passed against an empty disposable local PostgreSQL-compatible database: dry run writes nothing; a missing non-checklist team is rejected; all 747 cards/eight ProductSets import with correct flags/odds; every card's player/team/subset/variant matches the CSV; metadata anchors and twelve RCs/two intentional null teams pass; rerun inserts zero duplicates, updates all 747 cards and preserves sentinel prices and images; released remains false; a released manifest is rejected. No production database was used. All 30 current unit tests, pack metadata tests, checklist grade tests and CSV import smoke test passed; the integration test passed ESLint.

Offline reproduction: `python scripts/generate-1999-fleer-brilliants-baseball.py --check`. Live verification: add `--refresh-sources`. Disposable integration test: `SET_FACTORY_TEST_DATABASE_URL=postgresql://.../fb99_set_factory_test node scripts/test-1999-fleer-brilliants-baseball.mjs` (localhost only; apply the existing Prisma schema to an empty disposable database first).
