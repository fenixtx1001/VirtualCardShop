# 2000 Metal Baseball draft audit

Research and validation date: 2026-11-05. Product ID: `2000_Metal_Baseball`.
The product is an unreleased draft for pricing and image harvesting. This is a
completed 674-row catalogue file, not merely a generator or count estimate.
Two Purple Foil team affiliations remain provisional; do not treat the product
as fully cleared for release.

## Delivered inventory

| Collector family | Cards | Hobby denominator stored |
| --- | ---: | ---: |
| Base | 250 | Base |
| Emerald | 250 | Pending model decision |
| Fusion | 15 | 4 |
| Heavy Metal | 10 | 20 |
| Hit Machines | 10 | 20 |
| Platinum Portraits | 10 | 8 |
| Talent Show | 15 | 4 |
| Autographics, Metal-issued | 47 | 96 |
| Autographics Purple Foil, Metal-issued | 47 | Unknown |
| Base Shredders | 18 | 288 |
| Physical Checklists | 2 | Unknown |
| **Total** | **674** | |

One base family and two parallel families remain intact collector checklists.
No separate completion lists were invented for Prospects or range-specific odds.

## Evidence and independent checks

The source JSON preserves 30 normalized source sections, their exact URLs and
SHA-256 hashes, plus 24 selected original card/package image URLs and hashes.
The images are research references; they are not imported card assets. Scans
were reviewed for selected design, team, memorabilia, checklist and packaging
questions, not for every one of the 674 cards.

- [TCDB base](https://www.tcdb.com/Checklist.cfm/sid/1386/2000-Metal?PageIndex=1),
  [Emerald](https://www.tcdb.com/Checklist.cfm/sid/12085/2000-Metal-Emerald?PageIndex=1),
  and every insert namespace were retrieved separately. Three pages each for
  base/Emerald; two each for the shared regular/Purple autograph catalogues.
- [BaseballCardPedia product checklist](https://baseballcardpedia.com/index.php/2000_Metal)
  independently matches all 250 base and 60 numbered-insert identities and the
  18 unnumbered Base Shredders subjects. Fusion subject order can differ between
  sources; comparison uses unordered player pairs while retaining canonical
  collector numbering. BCP omits “Jr.” from base #220 Tony Armas; the explicit,
  number-specific exception retains the canonical junior designation.
- [Supplementary full base listing](https://mycardbatch.com/checklists/fleer-metal-2000-baseball)
  matches all 250 base names and franchises after limited, documented spelling
  normalization (e.g. Bob/Bobby Higginson and David/Dave Nilsson).
- [Separate TCDB rookie index](https://www.tcdb.com/Rookies.cfm/sid/1386/2000-Metal)
  matches exactly four true base RCs: #223 Danys Baez, #228 Jeff DaVanon,
  #245 Juan Sosa and #248 Trace Coquillette. BCP's additional #249 Rob Ramsay RC
  is rejected because [1999 Fleer Tradition Update](https://baseballcardpedia.com/index.php/1999_Fleer_Tradition_Update)
  already lists his U92 RC. That earlier evidence is captured and rechecked.
  “Prospects” means #201–250; it does not imply rookie status. No RC labels are
  extrapolated onto parallels or inserts.

## Shared Autographics scope

[The independent 132-player program matrix](https://baseballcardpedia.com/index.php/2000_Skybox_Autographics)
identifies which cards were issued in Metal (MT), E-X, Impact, Skybox and
Dominion. Its **47 MT subjects** agree exactly with the current per-card “Issued
in Metal” / “all five brands” captions in both TCDB global autograph lists.
Both Metal families therefore have 47 members. BCP's older Metal summary count
of 54 regular autographs is inconsistent with the detailed brand matrix and
current row-level distribution evidence; it is not used as an import target.

Metal's insert index legacy aliases 266579/273437 redirect into the global
[12241 regular](https://www.tcdb.com/Checklist.cfm/sid/12241/2000-SkyBox-Autographics?PageIndex=1)
and [12242 Purple Foil](https://www.tcdb.com/Checklist.cfm/sid/12242/2000-SkyBox-Autographics-Purple-Foil?PageIndex=1)
namespaces. The source snapshot retains all 132 regular and 123 Purple rows
before filtering. Importing the complete shared lists into Metal would include
cards from other products and replacement-only cards. The generator verifies
both namespace and exact cross-source product membership, not just counts.

Purple Foil is /50; Chad Allen front/back scans confirm the purple treatment
and serial number. No regular autograph serial run is invented. Metal regular
odds are 1:96; the global Skybox-branded product's 1:72 is inapplicable.

## Team corrections and remaining blockers

- Base/Emerald #88 Kenny Rogers shows a Mets uniform but identifies the Texas
  Rangers on the front and back logo. Emerald's source Mets team is corrected
  to Rangers with an exact source-value guard; both card sides support this.
- Base/Emerald #76 Ken Griffey Jr. identifies Cincinnati despite the Seattle
  uniform. Fusion #1 F, Heavy Metal #3 HM and Hit Machines #1 H retain Seattle;
  copying the base franchise onto every insert would be wrong.
- All five numbered insert families and Base Shredders have source franchises
  checked against base subjects where applicable. Fusion-only Ugueth Urbina
  is Montreal (paired with Vladimir Guerrero); Shredders-only Miguel Tejada
  is Oakland. Shared-program autograph teams are not forced to equal base teams.
- Regular Gabe Kapler Autographics has a Detroit logo on its reviewed front
  and back; that card remains Detroit.

**Unresolved rare-variant affiliations:**

| Purple Foil subject | TCDB Purple team retained provisionally | Regular team | Remaining evidence needed |
| --- | --- | --- | --- |
| Roger Cedeno | Houston Astros | New York Mets | Purple front/back scan; Beckett's Purple catalogue instead lists Mets |
| Gabe Kapler | Texas Rangers | Detroit Tigers | Purple front/back scan; regular scans alone cannot prove Purple affiliation |

No Purple scan for either subject was available in the inspected catalogues.
The CSV flags both cards explicitly; the manifest retains
`teamAffiliation: PENDING_TWO_PURPLE_AUTOGRAPH_SCANS` and blocked release.
`teamData: COMPLETE` means every player row has a populated franchise, which is
the importer's missing-team gate; it is not a claim that these two affiliations
have been independently resolved. Autograph franchises beyond these comparisons
remain catalogue-based, not a claim of 94 individual scan reviews.

## Physical attributes, numbering and exclusions

Base Shredders contains game-used **base** pieces, not bats or jerseys. The
reviewed Tony Gwynn back explicitly describes a base used in a 1999 game at
Qualcomm Stadium. Both sides of both physical unnumbered checklist cards were
reviewed: #1–192 and #193–250 plus inserts. These are the only intentionally
blank teams, allowed by the generic-checklist exception.

Printed insert suffixes are retained: `1 F`, `1 HM`, `1 H`, `1 PP`, `1 TS`.
Actual unnumbered player cards receive stable `NNO-NAME-SLUG` VCS identifiers;
the checklist cards use `NNO-A/B`. These local IDs are not asserted to be
printed on the cards. Display names stay clean; attributes and ranges belong
in subset/variant. Source captions are retained separately in provenance.

Exclude the unsigned Alex Rodriguez #100 dealer/media Promotional Sample.
[A TCDB forum discussion](https://www.tcdb.com/Forum.cfm/Page/S/ID/1386/?MODE=VIEW&ThreadID=6008&C=1)
and sales listings also mention a signed /750 sample, but pack-issued origin
could not be verified. It is not added as a pack autograph. No unsupported
hologram, jersey, bat, basketball or 1999 Metal Universe family was invented.

## Pack model and release status

Original Hobby box and wrapper photographs confirm **28 packs of 10 cards**.
Retail photographs show 20 packs of nine; do not mix those configurations.
Base Prospects historically appears 1:2, but VCS chooses uniformly within the
full base family, as required by the collector-checklist convention.

Emerald #1–200 historically appears 1:4 and #201–250 1:8. Keeping the full
250-card parallel gives 3/8 expected insert hits per pack, or an 8/3 denominator.
The importer accepts only positive integer denominators. Emerald odds remain
null pending a pack-model decision; do not round to three or split the family.
Purple/checklist odds remain unknown and null. All other stored Hobby rates
are documented above. Odds appear only at ProductSet level. Independent VCS
hit rolls replace base slots and do not reproduce original physical collation.

Prices start unset/zero with auto pack pricing, images start null, and
`released: false` is enforced. Release remains blocked pending the two team
scans, odds/model review, pricing, image harvesting and pack QA. No production
database was read or modified; no deployment was performed.

## Validation completed

- Generated the actual 674-card CSV and compared exact committed bytes with
  regeneration. Every row has a unique family/collector ID and valid format;
  exact family identities, names, subset ranges, franchises and RC inventory
  are audited with the stated exceptions.
- Retrieved every checklist/reference again with `--refresh-sources --check`;
  verified all 24 reviewed image hashes. Strict linked-row parsing rejects
  skipped rows and incorrect source namespaces. Retrieval retries only bounded
  transient failures and never writes a partial checklist.
- Whole-token cleanup and caption-boundary tests; 19 source corruption cases
  and three manifest safety cases covering missing/duplicate cards, wrong
  subjects/teams/RCs, changed membership, wrong serial runs, namespaces and odds.
- Actual `import-set-bundle.ts` dry run and apply against a disposable local
  PGlite PostgreSQL-compatible database using the repository's real Prisma
  schema. All 674 imported rows checked field-by-field; 11 families and four
  RCs verified; only two generic-checklist team blanks; rerun adds no duplicates
  and preserves sentinel prices/images and unreleased state. Malformed team
  data and released manifests are rejected. No external database credentials.
- All 30 repository unit tests passed, plus pack metadata, checklist best-grade
  and import smoke checks; ESLint passed for the new integration test.

Reproduce the offline checklist audit:

```bash
python3 scripts/generate-2000-metal-baseball.py --check
```

Recheck live listings and scan hashes without changing committed files:

```bash
python3 scripts/generate-2000-metal-baseball.py --refresh-sources --check
```

The integration test requires an **empty local** PostgreSQL-compatible database
named `m00_set_factory_test` via `SET_FACTORY_TEST_DATABASE_URL`. It refuses a
remote host, another database name or a nonempty database. It intentionally
disconnects its assertion client before launching each importer subprocess so
single-connection local test servers can run the same checks.
