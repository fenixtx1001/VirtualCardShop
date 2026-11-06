# 2000 Donruss Football — unreleased Set Factory draft

**Status: partial master inventory, not fully verified for release.** The actual importable CSV has 1,278 cards in 22 collector families, including all 250 base cards and 100 true base RCs. Another 53 entries in the catalogued Signature Series Red Authentic Stamp namespace are retained in `source.json` but deliberately withheld from the CSV. No production database was accessed or deployment performed.

## Inventory

| Collector family | Imported cards |
|---|---:|
| Base | 250 |
| All-Time Gridiron Kings | 10 |
| All-Time Gridiron Kings Studio Autographs | 9 |
| Dominators | 60 |
| Elite Series | 40 |
| Gridiron Kings | 10 |
| Gridiron Kings Studio unsigned | 10 |
| Gridiron Kings Studio Autographs | 10 |
| Jersey King Autographs | 10 |
| Rated Rookies | 40 |
| Rated Rookies Medalist | 40 |
| Rookie Gridiron Kings | 10 |
| Rookie Gridiron Kings Studio unsigned | 10 |
| Rookie Gridiron Kings Studio Autographs | 10 |
| Signature Series Blue | 31 |
| Signature Series Gold | 53 |
| Signature Series Red | 53 |
| Zoning Commission | 60 |
| Zoning Commission Red | 60 |
| Stat Line Career | 250 |
| Stat Line Season | 250 |
| Kurt Warner promotional cards | 2 |
| **Imported total** | **1,278** |
| Signature Series Red Authentic Stamp — withheld | 53 |
| Total primary catalogue inventory, including withheld | 1,331 |

Separate Elite, Preferred and Quantum Leaf products are outside scope. Nine All-Time autographs are issued, not ten: TCDB says the Dan Fouts exchange was fulfilled with a 1997 Leaf autograph. That earlier card is not manufactured as an extra 2000 Donruss item.

## Sources and audit coverage

- [TCDB complete related-set index](https://www.tcdb.com/Inserts.cfm/sid/4374/2000-Donruss): 21 linked related namespaces plus the base and two inline Warner promotional cards. All 28 paginated checklist pages are retained, including the withheld namespace. Each source row includes number, subject label, team, caption, direct ViewCard URL and CID. The generator checks the source namespace, row counts and CID uniqueness.
- [Complete TCDB true rookie index](https://www.tcdb.com/Rookies.cfm/sid/4374/2000-Donruss): 100 base RCs, exactly #151–250. All numbers, subjects and teams are matched with the full base and independent base rosters. Veterans are #1–150. Brady #230 is a Patriots RC /1325. Inserts and parallels receive no inferred RC suffix.
- [MyCardBatch](https://mycardbatch.com/checklists/donruss-2000-football): the captured page actually contains 521 tuples in 14 tables despite its 581 headline. All actual number/name/team tuples are audited. Its Blue and Gold tables contain only one subject each. It is not evidence for a complete master checklist.
- [LastSticker](https://www.laststicker.com/br/cards/donruss_nfl_2000/): 574 actual rows, including complete base, Gold signatures and several insert rosters. All subjects and teams are compared; base numbering and rookie serial status are independently checked. LastSticker uses its own artificial codes/order for some inserts (for example ATGK/SS prefixes), so these do not silently replace primary catalogue numbers. Neither independent source covers the entire 1,331-card primary inventory.
- [Dave & Adam's Hobby description](https://www.dacardworld.com/sports-cards/2000-donruss-football-hobby-box): Hobby 18 packs ×16 cards, Studio signed allocation, signature colours, Jersey Kings materials and historical rates. The dealer's Zoning /100 assertion is contradicted by an original back /1000. Its Career 1:24 disagrees with TCDB 1:25; retain this conflict.
- [COMC Thomas Jones original-card listing](https://www.ebay.com/itm/336805504178) and [COMC Chris Redman listing](https://www.ebay.com/itm/237098432968): signed Rookie Studio examples specifically identified as 31/250 and 29/250, corroborating the dealer's first-50-of-/250 allocation. These are external listing observations, not a claim that the generator downloaded original back images from those listings; the direct listing request returned an interstitial. Their observed titles and URLs are preserved separately.
- Original TCDB scans and packaging, with exact URLs and SHA-256 hashes, are recorded in `reviewedImageEvidence`. Selected physical fronts/backs were inspected: Brady base, Career and Season; gold and ordinary Red signatures; Farmer and Faulk Blue; Chapman Blue; signed and unsigned Marino Studio; unsigned Dayne Studio; Zoning /1000. An independent COMC-watermarked signed Morris Studio front is also retained as URL/hash evidence. Images are evidence only, not assigned as VCS production card art.
- Beckett requests returned an HTTP 404 or service-status page. Such responses were not accepted as checklist evidence. The generator checks extracted source records and fails closed on live retrieval errors, changed data or truncated sources; it does not accept a page merely because HTTP succeeded.

This is a catalogue-level audit with independent overlap and selected original scans. It is not independent physical verification of every card or every individual Stat Line denominator. Both full 250-card Stat Line rosters were actually retrieved, not cloned from base; every subject, team and subset is compared against base and every captured serial limit retained. Selected Brady originals independently confirm Career /214 and Season /20.

## Corrections and distinctions

- Remove metadata tokens only at whitespace-delimited suffix boundaries, including ROO on Kevin McDougal #245. Preserve real surnames such as Marshall and Hall. Harmonize `R.Jay Soward` to `R. Jay Soward` across base and Stat Line.
- Correct Signature Blue Doug Chapman from Atlanta to Minnesota. His original Blue back explicitly prints Minnesota Vikings. Correct the swapped ordinary Red teams for Danny Farmer (Pittsburgh) and Kevin Faulk (New England) using the complete independent Gold roster plus original Blue/Red images. The withheld namespace has the same two errors, retained unaltered as raw evidence rather than imported as truth.
- Veteran Studio unsigned and signed cards both print /250. Unsigned serials are 051–250; first 50 were allocated to signatures. Randy Moss has reported signed production 19 but still printed /250. Do not generate /19.
- Rookie Studio autograph source `SN50` conflates the signed allocation with the printed denominator. The CSV says printed /250 and separately records 50 signed allocation, based on the original-card listings and dealer programme. It does not infer a /50 stamp. Morris is tagged EXCH in the primary list, but an actual signed Morris front independently exists; the obsolete exchange ticket is not separately duplicated.
- Red signatures have announced per-subject print runs, not serial numbers. Ordinary Red backs already show an AUTHENTIC stamp in the serial-panel location. Gold /25 and Blue /100 have actual serial stamps. Unnumbered cards use stable `NNO-CID` local identifiers, explicitly described as not printed card numbers. This prevents all unnumbered subjects collapsing into one card.
- Retain historical clubs from the cards/catalogues, including Los Angeles Rams for Eric Dickerson. No conversion to current franchises.
- Promotional cards represent the actual two Warner collector cards; their expired competitions do not confer current rights. Their pack odds remain null.

## Blocking uncertainty: separate Authentic Stamp namespace

[TCDB namespace 35798](https://www.tcdb.com/Checklist.cfm/sid/35798/2000-Donruss-Signature-Series-Red-Authentic-Stamp) lists 53 Red Authentic Stamp cards as AU /25. No queried selected card had an original image. The ordinary Red images already carry AUTHENTIC stamps; the independently retrieved dealer programme describes only Red, Blue /100 and Gold /25. I could not independently establish that namespace 35798 is a distinct issued parallel rather than duplicated or misclassified ordinary Red inventory. Absence of an image does not prove nonexistence.

**Resolution needed:** a manufacturer description or original front/back evidence distinguishing this variant from ordinary Red, with its actual production/serial attributes. The entire 53-row namespace is saved so the decision is reviewable. It is not imported or advertised as verified. No guessed replacement checklist is generated. Release stays blocked. This draft therefore does not represent a completed, fully verified master set.

## Pack configuration and conventions

The draft uses Hobby 18 ×16, not the photographed seven-card Retail wrapper. Base remains one 250-card family even though the 100 rookies are short printed. No new pack-engine behaviour or unsupported scarcity buckets are introduced. Prices are zero pending Admin pricing; all art URLs are null.

Season Hobby 1:192 is corroborated by the two catalogue/programme descriptions and placed on ProductSet only. Career is null because 1:24 and 1:25 conflict. Other undocumented rates, promos and autograph tiers remain null; serial denominators are never substituted for odds. These null rates are intentional QA blockers, not a claim of historically accurate live pack collation. Full printed prefix/back-image harvesting also remains pending, particularly the Jersey King and Zoning Red catalogue codes. The existing importer missing-team apply gate is baseball-specific; this football generator independently requires a valid historical team for every row, and the integration test verifies every imported team.

## Reproduce and validate

From `virtual-card-shop`:

```bash
python3 scripts/generate-2000-donruss-football.py --check
python3 scripts/generate-2000-donruss-football.py --refresh-sources --check
node --import tsx --test tests/*.test.ts src/lib/reward-snapshot.test.ts
node --import tsx scripts/test-open-pack-meta.ts
node --import tsx scripts/test-checklist-best-grade.ts
node scripts/test-import-smoke.mjs
node node_modules/eslint/bin/eslint.js scripts/test-2000-donruss-football.mjs
```

`--refresh-sources` retrieves every distinct source again, compares every extracted record and checks all saved image hashes before writing anything. `--check` does not change the source or CSV. Default offline generation validates the saved evidence; it is not represented as a live fetch.

The actual importer integration test requires an **empty local disposable PostgreSQL database** named `dr00_set_factory_test`, explicitly supplied as `SET_FACTORY_TEST_DATABASE_URL`. It rejects remote URLs and never uses ambient `DATABASE_URL`. Run `node scripts/test-2000-donruss-football.mjs`. It exercises dry-run/no writes, unknown-set rejection, actual 1,278-card/22-set apply, every CSV field, Brady/Studio/Red signature/numbering anchors, excluded disputed namespace, idempotent rerun, preserved sentinel prices/images and released=false. A released manifest is rejected.

Validation performed here: generator source corruption/truncation/unsafe-manifest tests; live source refresh; all 30 repository tests; pack metadata, best-grade and import smoke scripts; integration against an isolated in-memory PostgreSQL-compatible PGlite instance using the current Prisma schema; targeted ESLint. No production database credentials were used.

## Codespaces import

Use the immutable published commit and extract only its manifest and CSV into a temporary directory. Run the existing importer's default dry-run before `--apply`. No merge, checkout, reset, environment-variable replacement or deployment is required. The importer creates an unreleased Admin draft and preserves existing prices/images/release state on reruns. Importing the draft does not resolve the blocked evidence or make it eligible for release.
