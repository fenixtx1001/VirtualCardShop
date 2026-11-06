# 1991 Upper Deck Baseball — completed Set Factory audit

Status: complete checklist, unreleased draft; pricing, images and pack QA remain pending.

## Inventory and scope

| Product Set | Cards | Printed IDs | VCS odds per pack |
| --- | ---: | --- | ---: |
| Base | 800 | 1–800 | Base pool |
| Special Prints | 2 | SP1, SP2 | 72 |
| Hank Aaron Hologram | 1 | HH1 | Unknown / null |
| Nolan Ryan Baseball Heroes | 10 | 10–18, NNO header | 12* |
| Hank Aaron Baseball Heroes | 10 | 19–27, NNO header | 12* |
| Silver Sluggers | 18 | SS1–SS18 | Jumbo-only / null |
| Team Logo Holograms | 28 | NNO; VCS IDs NNO-01–28 | 1 |
| Heroes of Baseball (Event) | 4 | H1–H4 | Event-only / null |
| Nolan Ryan Autograph | 1 | 18 | Unknown / null |
| Hank Aaron Autograph | 1 | 27 | Unknown / null |
| Heroes of Baseball Autographs (Event) | 3 | H1–H3 | Event-only / null |
| **Total** | **878** | **11 collector checklists** | |

*The equal low/high channel mix is an explicit VCS design assumption retained from the original draft, not a measured historical sales ratio. Each Heroes family was 1:6 in its own series, so each becomes 1:12 in this combined abstraction. SP1/SP2 each had 1:72 in its own series; the combined two-card family remains 1:72. These assumptions require Admin pack QA before release.

The complete base checklist stays unified: low 1–700, high 701–800. Physical high-series packs mixed low and high cards; VCS uniformly samples the complete checklist. No split checklist is introduced to simulate collation.

Reviewed and excluded: 100-card Final Edition boxed release (a separate product), magazine insert, factory packaging, unrelated promos. Back-hologram types and individual printing errors are recorded as manufacturing variations, not fabricated complete parallel sets. TCDB catalogs 1990 baseball/Comic Ball and 1990–91 hockey backs; BCP also describes 1992-style backs. Neither source establishes an additional complete 800-card commercially issued parallel checklist. The separate 28-card team-logo hologram issue is included in full.

The two Heroes autographs are the checklist cards #18 and #27, each hand-numbered /2500; do not invent nine autograph subjects for either player. The three event autographs are H1 Killebrew, H2 Perry and H3 Jenkins, each /3000.

## Sources and independent checks

The committed `.source.json` contains normalized source rows, original source URLs and SHA-256 hashes of the retrieved HTML for traceability. It is evidence used by generation, not a file assembled from the output CSV. Full live refresh was executed successfully; no blocked page was silently skipped. Retrieval date is stored in UTC in the snapshot.

- [TCDB base](https://www.tcdb.com/Checklist.cfm/sid/171/1991-Upper-Deck?BasicID=17): nine pages, 802 canonical source rows including two pairs of error/correction versions; all number/name/team labels retained before normalization.
- [TCDB rookie index](https://www.tcdb.com/Rookies.cfm/sid/171/1991-Upper-Deck): 190 variation-inclusive rows across two pages; empty third page confirms termination; 70 unique numbers before the documented Chuck Carr exclusion.
- [TCDB inserts and related sets](https://www.tcdb.com/Inserts.cfm/sid/171/1991-Upper-Deck): verified all three singles and all eight linked insert checklists, including individual autograph issues and 28 logo subjects.
- [BaseballCardPedia](https://baseballcardpedia.com/index.php/1991_Upper_Deck): independently matched every base number/identity and all numbered insert/autograph subjects; reviewed distribution, event exclusivity, print differences and autographs.
- [Cardboard Connection](https://www.cardboardconnection.com/1991-upper-deck-baseball-cards): independently matched every base number/identity; RC labels provide an additional check on 67 of the 69 true RCs.
- [TCDB 1990 Fleer Update](https://www.tcdb.com/Checklist.cfm/sid/142/1990-Fleer-Update) and [Beckett Chuck Carr RC listing](https://marketplace.beckett.com/search_new/?player=Carr%2C+Chuck&set_id=1990+Fleer+Update&sport=Baseball&vintage=212): establish Carr's 1990 U-34 RC, resolving the erroneous later variation RC flags.
- [Keyman issue notes](https://keymancollectibles.com/baseballcards/upperdeck/1991upperdeckbaseballcards.htm): confirms random high-series Aaron hologram insertion and the #231/#309/#636 printing differences.

Source checklists use nicknames and punctuation differently. The comparison explicitly recognizes Maurice/Mo Vaughn, Wilfredo/Wil Cordero, Manny/Manuel Lee, Ted/Teddy Higuera, Dave/David Justice and West, Dennis/Oil Can Boyd, and Mike/Mike A. Marshall. Output follows TCDB's collector labels. Names are not fuzzy-matched: an unexpected discrepancy fails generation.

### Resolved source and parser issues

- The original parser rejected `231a/b` and `636a/b`, producing only 798 rows. The source actually supplies 802 rows. Select corrected #231b with DH and dated #636a; normalize to printed numbers 231/636. Require every number 1–800 exactly once.
- Preserve `<figcaption>` separately; the old parser joined tags and descriptions (e.g. `CLStar Rookie Checklist`) and lost notes.
- Cardboard Connection changes HTML columns after #400 without a `<br>`; parse the `</div>` boundary too. Independent comparison now covers #401 rather than silently dropping it.
- #93, #656 and #677 are titled by caption at TCDB. Output independently verified subjects Bobby Thigpen, Mark McGwire, and Carlton Fisk / Robin Ventura; captions go in variant. #636, #702 and #725 similarly separate subjects from thematic titles.
- BCP's actual checklist correctly identifies #309 Milt Thompson and #311 Luis Salazar; its prose under Other Variations transposes them. Use the checklist identities corroborated by TCDB and Cardboard Connection.
- BCP has 62 explicit RC labels; it omits RC on 538, 629, 761, 767, 771, 777 and 797. CCC confirms the five high-series omissions. #538 Chris Nabholz and #629 John Barfield are explicitly RC in both canonical TCDB checklist and its separate rookie index. Total: 69 true base RCs.
- TCDB's rookie index includes #514 Chuck Carr only through two printing variations. Exclude that RC designation: the base entry and both independent 1991 checklists omit RC, and his recognized 1990 Fleer Update RC is established separately.
- Star Rookies, Top Prospects, Michael Jordan SP1, Rookie Threats and historical Heroes captions do not automatically receive RC. Composite highlights retain only their source-confirmed card status; no RC is indiscriminately appended to every person.
- All 26 team checklist cards (28–34, 43–49, 77–82, 94–99) receive subset `Team Checklist`; the original draft recognized almost none because it looked for TC rather than source CL.
- H4 depicts Killebrew / Perry / Jenkins, with TCDB's three historical teams. It is not assigned a generic MLB team.

## Team audit and deliberate blanks

All player/team affiliations are supplied by source rows and checked against the historical franchise vocabulary, including Milwaukee Braves. League holograms use their actual AL/NL subjects. There are **12 blank-team cards**:

- Ten generic base checklists: 1, 50, 100, 200, 300, 400, 500, 600, 700, 800. Allowed by the importer checklist exception.
- The unnumbered Ryan and Aaron Heroes headers have no team affiliation. Their blanks are intentional; no franchise is invented. The importer has no non-team-header exception, so `review.teamData=PENDING` and explicit `--allow-pending-teams` are required to stage the draft.

No unresolved player/team lookup is concealed by that flag. Known teams remain populated; a blank ordinary player team fails generation. The header exception is limited to those two exact identities.

## Pack and importer review

Reviewed `docs/set-factory.md`, `docs/set-factory-generator-conventions.md`, `scripts/import-set-bundle.ts`, `scripts/import-set-bundle-entry.ts`, `src/app/api/rip/open/route.ts` and `src/lib/pack-pricing.ts`.

- Standard foil has 15 regular cards plus one logo sticker, modeled as 16 total items; 36 packs/box.
- Pack engine checks each non-base family independently; odds 1 guarantees one logo when the imported 28-card pool is populated. Other hits replace regular/base slots. There is no separate physical-series switch, no card-specific header weighting, and no mutually exclusive low/high channel logic.
- Silver Sluggers were one per 27-card jumbo, not 1:2 standard packs. The draft's unsupported conversion is removed. Combined-channel odds stay null until Admin explicitly chooses a model.
- HH1 was random in high-series packs; BCP's “all Hi-Series packs” language describes channel availability and does not establish a numeric guarantee. TCDB/Keyman describe random insertion. Odds remain null, not a fabricated 1:1 or 1:2.
- Event cards were one per specially marked event box, not ordinary foil hits. Event families and all autograph families retain null standard-product odds. They are imported into Admin and collectible checklists, but cannot be pulled until odds are configured.
- Set-wide odds stay on ProductSet, never repeated in each card's variant. Heroes SP headers stay within complete collector checklists; their flattened per-card availability is a release QA item.
- Schema version 2, DRAFT, exactly one BASE, unique stable IDs, integer/null odds, clean names and source-backed serial numbering are validated. No global importer or pack-engine change is needed.
- `released=false`, pack/card art and pricing remain pending. Reimport preserves existing prices, images and release state. This task never imported into a production database or ran a deployment.
- Existing PR has a Vercel preview integration. `virtual-card-shop/vercel.json` disables automatic Git deployment **only for this exact Set Factory branch**, following [Vercel's documented branch configuration](https://vercel.com/docs/project-configuration/git-configuration). Other branches retain default behavior.

## Validation performed

Successful:

```bash
python3 scripts/generate-1991-upper-deck-baseball.py --refresh-sources
python3 scripts/generate-1991-upper-deck-baseball.py --self-test
python3 scripts/generate-1991-upper-deck-baseball.py --check
node --import tsx --test tests/*.test.ts src/lib/reward-snapshot.test.ts
node --import tsx scripts/test-open-pack-meta.ts
node --import tsx scripts/test-checklist-best-grade.ts
node --import tsx scripts/test-import-smoke.mjs
node node_modules/eslint/bin/eslint.js scripts/test-1991-upper-deck-baseball.mjs
git diff --check
```

The Python checks audit complete source identities, source clubs, all card IDs, 69 RCs, subset assignments, serial-number source tags, pack settings and six corruption cases. The committed CSV is checked byte-for-byte against validated regeneration. Existing Node suite: **30 passed, zero failures**; additional smoke/regression scripts passed.

### Actual importer integration

The real Prisma importer was run against an isolated, in-memory PostgreSQL instance (PGlite 0.5.13 with pglite-socket 0.2.16), initialized from SQL generated by the repository's full Prisma schema. This was not a mocked Prisma client and did not use a production database URL. Temporary test dependencies were installed outside the repository; no application dependency changes were made.

`scripts/test-1991-upper-deck-baseball.mjs` requires an explicit `SET_FACTORY_TEST_DATABASE_URL`, localhost, dedicated database name `ud91_set_factory_test`, and an initially empty database. It does not consume the shell's production `DATABASE_URL`.

Verified:

1. Default dry-run resolves 878 cards / 11 sets and writes nothing.
2. Apply without the deliberate pending-header override fails before writes.
3. Apply with the override creates one unreleased Product, 11 ProductSets, 878 cards, all set counts/kinds/odds, 69 RCs, exact metadata anchors and exactly 12 intentional blank teams.
4. Repeat apply inserts zero and updates 878, creating no duplicates.
5. Sentinel Product pricing/art, ProductSet pricing and Card book values/front/back URLs survive rerun; released remains false.
6. A manifest requesting released=true is rejected; the test Product stays unreleased.

Run the integration harness only with a disposable local database initialized from `prisma/schema.prisma`:

```bash
SET_FACTORY_TEST_DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:PORT/ud91_set_factory_test?connection_limit=1' \
  node scripts/test-1991-upper-deck-baseball.mjs
```

This execution environment blocks tsx CLI's Unix IPC socket (`EPERM`), so runtime tests use the equivalent `node --import tsx scripts/import-set-bundle.ts` entry. The normal npm entry was inspected and passes through the same bundle and flags. Codespaces can use the normal `npm run import:set-bundle` command.

## Remaining Admin work

The actual checklist is complete and ready for pricing and image harvesting. Before release: price the sets, supply/verify card and pack images, review the documented combined-series model and header scarcity, and decide odds for null/jumbo/event/autograph families. Unknown historic insertion frequencies are explicitly unknown; checklist completion is not being claimed as historical collation reconstruction.
