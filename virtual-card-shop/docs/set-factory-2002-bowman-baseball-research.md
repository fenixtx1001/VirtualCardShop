# 2002 Bowman Baseball — unreleased Set Factory draft

Product `2002_Bowman_Baseball`. Completed 1,070 card rows in six collector families. This is regular paper Bowman, not Bowman Chrome, Draft Picks & Prospects, Heritage, Best, or a modern reprint. No production database access or deployment.

| Family | Cards | Draft Hobby odds |
| --- | ---: | --- |
| Base | 440 | Base pool |
| Gold | 440 | 1:1 |
| Autographs | 45 | 1:40 |
| Relics | 26 | 1:74 |
| Futures Game Relics Autographs | 9 | Null: mixed format eligibility, QA required |
| Uncirculated Exchange | 110 | Null: fulfilled mail-in cards, not pack inserts |

One complete base checklist remains intact: Veterans #1–110 and Rookies/Prospects #111–440 are subset metadata. Gold was retrieved independently in all five pages. Uncirculated is the actual sparse 110-card checklist, not an extrapolated 440-card parallel. All 1,070 numbers, subject identities, teams, subsets and attributes pass the generator audit. Verification is against catalogues plus selected original scans, not a claim that every physical card was visually examined.

## Evidence and reconciliation

The committed `.source.json` preserves 28 parsed source entries, URLs, retrieval date and SHA-256 hashes of captured HTML, plus 19 SHA-256-addressed original images. Refresh downloads each URL, reparses all rows and checks the reviewed image bytes; retrieval failures stop generation. Dynamic page hashes can change without checklist changes. Revalidation compares actual parsed data and the regenerated CSV, not a stale HTML hash alone.

- [TCDB base](https://www.tcdb.com/Checklist.cfm/sid/1522/2002-Bowman?PageIndex=1), five pages; [Gold](https://www.tcdb.com/Checklist.cfm/sid/13371/2002-Bowman-Gold?PageIndex=1), five pages; [rookie index](https://www.tcdb.com/Rookies.cfm/sid/1522/2002-Bowman?PageIndex=1), two pages, 167 rows.
- [Complete related-set index](https://www.tcdb.com/Inserts.cfm/sid/1522/2002-Bowman) reconciles all namespaces: Autographs 13368, Futures signed relics 13369, Relics 13370, Gold 13371, Uncirculated Exchange 13372 and generic redemption ticket 404728.
- [BaseballCardPedia](https://baseballcardpedia.com/index.php/2002_Bowman) supplies full independent base, autograph, relic and sparse Uncirculated rosters, all nine Futures subjects, materials, physical format/tier odds and historical redemption details.
- [MyCardBatch](https://mycardbatch.com/checklists/bowman-2002-baseball) supplies 630 tuples, including the generic ticket, but omits Gold and one autograph. Its Autographs table has **44**, omitting **Ryan Franklin**, while Randy Flores is present. The complete 45-subject BCP list, TCDB and both original BA-RF backs resolve this omission. No 44-card family was silently accepted as complete.
- [Keyman full checklist](https://keymancollectibles.com/baseballcards/bowman/2002bowmanbaseballcardchecklist.htm) independently covers all 440 base subjects. Its extra introductory feature link for #173 is excluded from checklist parsing; all 440 actual numbered rows are required.

### True RC decisions

Exactly **167 base cards** receive ` RC`; parallels and inserts do not inherit it. Base tags and the complete separate TCDB rookie index agree, including number, identity and team. Independent roster discrepancies are explicit:

| Card | Source conflict | Resolution |
| --- | --- | --- |
| 332 Ramon Moreta | BCP omits RC; Keyman and TCDB mark it | RC |
| 291 Nate Espy | Keyman omits RC; BCP and TCDB mark it | RC |
| 318 Bobby Crosby | Keyman marks RC; BCP and TCDB do not | No RC: earlier 2001 Bowman Draft BDP88 |

The generator asserts these exact source differences instead of skipping the conflicting rows. [Beckett Espy RC listing](https://marketplace.beckett.com/search_new/?condition_id=NM-MT&set_type=201&team=Philadelphia+Phillies&year_start=2002) and [Beckett Crosby listings](https://marketplace.beckett.com/pastimesportsgames_964/search_new/?manufacturer=Topps+Co.&player=Crosby%2C+Bobby&result_type=59&sort=condition_id) independently corroborate those resolutions. Some pre-2006 RC subjects never reached MLB; no debut-year filter or modern rookie-logo assumption is imposed.

### Identity, team and numbering corrections

- #173 prints **James Harden**, the baseball player Rich Harden. Original front/back verifies James Richard Harden; clean display is `Rich Harden RC` with printed-name note. [Beckett](https://www.beckett.com/baseball/2002/bowman/173-rich-harden-rc-4576640) also identifies Rich James Harden. Never confuse with the basketball player.
- #206 is **Ronald Acuna Sr.**, not his son. Original back gives the adult Mets prospect identity. #420 prints **Carlos Cabrera**, the recognized Alfredo Simon identity alias; preserve the printed-name note while displaying Alfredo Simon.
- Gold #50's TCDB team is wrongly Philadelphia. Correct to **Cleveland Indians**, consistent with base, 2002 card and [independent Beckett Gold entry](https://marketplace.beckett.com/search_new/?set_id=2002+Bowman+Gold&year_start=2002). TCDB has no Gold scan for that entry; do not claim it was visually inspected. Other Gold spelling/capitalization differences are narrowly enumerated and checked against base, not applied by fuzzy matching.
- Original autograph backs resolve BCP code errors: Brandon Claussen **BA-BAC**, Boof Bonser **BA-BB**, Brian Cardwell **BA-BDC**, Brian Specht **BA-BJS**, Bud Smith **BA-BS**. BCP's alternate codes are accepted only as explicit comparison mappings.
- **Both Randy Flores and Ryan Franklin actually print BA-RF.** Local CSV identifiers `BA-RF-FLORES` and `BA-RF-FRANKLIN` preserve both cards without duplicate keys. Each variant explicitly records the shared printed number and local suffix. Original backs verify Yankees and Mariners respectively. Flores' base card is Rangers; do not copy that affiliation onto his autograph.
- Original relic backs actually print **BR-AF1 / BR-AF2** and **BR-JA1 / BR-JA2**. These are not invented suffixes: bat and jersey are distinct cards with printed identifiers. BCP's unsuffixed duplicate listings are reconciled by material.
- Original Futures backs print **FGAB-TH** Toby Hall and **FGAJ-JRH** J.R. House. Supplementary shorthand B-TH/J-JRH and BCP FGAJ-TH/FGAJ-JH are comparison aliases, not output identifiers. Hall's relic is a **game-used base**, not a bat; the eight others are game-worn jerseys from the 2001 Futures Game.
- Preserve reviewed Bautista facsimile-signature UER and Calzado's printed Napolean misspelling in variant, keeping display names clean. Whole-token name cleanup tests preserve Boswell, Hall and Marshall.

## Packs, odds and unreleased limitations

Hobby is 24 packs × 10 nominal cards; Retail is also 24 × 10. HTA Jumbo is 12 × 21 with an additional autograph box topper. Gold is one per pack and uses thicker cardstock with a gold-foil **facsimile** signature, not a certified autograph or serial number.

| Physical family | Hobby | Retail | HTA Jumbo |
| --- | --- | --- | --- |
| Plain autographs | 1:40 | 1:53 | 1:24, plus box topper |
| Relics | 1:74 | 1:99 | 1:43 |
| Futures jersey autographs | 1:196 | 1:259 | 1:113 |
| Futures used-base autograph FGAB-TH | Ineligible | Ineligible | 1:126 |

Card-specific scarcity tiers and format eligibility remain in the source index details. Set-wide odds live only on ProductSets. Existing conventions flatten within-family scarcity and keep full collector checklists intact. [Midwest's box listing](https://www.midwestcards.com/shop/baseball-cards/2002-bowman-baseball-hobby-box/) has an ambiguous 1:33 autograph claim; it is not substituted for the corroborated 1:40 plain-autograph rate. Packaging quantities are corroborated by catalogue/distributor text, not claimed to be a legible wrapper audit.

The complete nine-card Futures family stays at **null odds** until mixed eligibility is resolved in Admin/pack QA. This avoids making the HTA-only base relic a Hobby hit or arbitrarily splitting a collector family. Null non-base odds are excluded by `src/app/api/rip/open/route.ts` and `src/lib/pack-pricing.ts`.

Uncirculated comprises 110 fulfilled, encased cards. A generic scratch-off topper granted one random card through thepit.com; the generic ticket is excluded as the access mechanism, not duplicated as a teamless collector card. Reported announced maximum **672** and **574 claimed** per subject are not serial numbers. Redemption expired December 31, 2002; no present-day fulfillment is implied. Mail-in odds stay null.

The existing pack engine cannot reproduce guaranteed Hobby box hits, HTA autograph toppers or mail-in fulfillment. Product remains **released=false**, with pricing, images and these collation/eligibility decisions pending QA. This draft is ready for Admin pricing and image harvesting, not release.

## Reproduction and validation

From `virtual-card-shop`:

```bash
python3 scripts/generate-2002-bowman-baseball.py --check
python3 scripts/generate-2002-bowman-baseball.py --refresh-sources --check
```

The generator runs full validation even without flags. It rejects missing pages/rows, duplicate identities, wrong namespaces, unexpected notes/materials, missing non-checklist teams, incorrect RC flags, serial-number invention, unsupported odds and released manifests. It tests 18 corrupt-source cases, four manifest rejection cases, whole-token names and bounded network failure handling. No partial checklist is written on retrieval/validation failure.

The actual importer integration test is `scripts/test-2002-bowman-baseball.mjs`. It requires an **empty local disposable** PostgreSQL database named `bm02_set_factory_test` via `SET_FACTORY_TEST_DATABASE_URL`, never an ambient production DATABASE_URL. Executed successfully with Prisma against a fresh PGlite PostgreSQL socket loaded from `prisma/schema.prisma`:

- Dry run leaves database empty; missing-team and released-manifest rejection gates pass.
- Actual apply creates one unreleased Product, six ProductSets and 1,070 cards.
- Every imported player, team, subset and variant matches the generated CSV; all counts, odds, 167 RCs and selected difficult identities/materials are asserted.
- Rerun inserts zero duplicates and preserves sentinel card/product/set pricing and images, with release still false.
- All 30 repository unit tests, pack-metadata and checklist-best-grade checks, importer smoke test and targeted ESLint pass.

Use the pinned GitHub import command supplied with delivery to stage only the completed manifest and CSV, dry-run, then apply. No checkout or replacement of the user's working tree is required.
