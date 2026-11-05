# 1999 Metal Universe Baseball — draft audit

Sources retrieved November 5, 2026 UTC (November 4 in America/Chicago). This is an unreleased draft for Admin pricing and image harvesting. It is **not an assertion that all possible PMG cards are fully verified**: three checklist cards are disputed between catalogs. No production database changes or deployment were performed.

## Delivered card inventory

| Collector family | Imported rows | Collector numbers | Treatment |
|---|---:|---|---|
| Base | 300 | 1–300 | Full base checklist |
| Precious Metal Gems | 297 | 1–297 | Directly catalogued /50; three disputed checklist cards excluded |
| Gem Masters | 300 | 1–300 | Full source-catalogued 1/1 parallel |
| Neophytes | 15 | 1 NP–15 NP | Insert |
| Boyz With the Wood | 15 | 1 BW–15 BW | Foldable insert; not two versions of each card |
| Planet Metal | 15 | 1 PM–15 PM | Holographic die-cut insert |
| Diamond Soul | 15 | 1DS–15DS | Lenticular insert |
| Linchpins | 10 | 1LP–10LP | Die-cut insert |
| J.D. Drew Autograph | 1 | SAMPLE | Pack-issued autograph, hand numbered /35 |
| **Total** | **968** | **Nine collector families** | **Unreleased** |

[TCDB base](https://www.tcdb.com/Checklist.cfm/sid/1314/1999-Metal-Universe), [related-set index](https://www.tcdb.com/Inserts.cfm/sid/1314/1999-Metal-Universe), [BaseballCardPedia](https://baseballcardpedia.com/index.php/1999_Metal_Universe), and [Cardboard Connection's PMG checklist guide](https://www.cardboardconnection.com/comprehensive-precious-metal-gems-card-guide) were independently retrieved. The committed source snapshot retains full parsed rows, source-specific URLs, retrieval date and original-response SHA-256 hashes. All base/parallel pages and all five regular insert namespaces were retrieved directly, rather than building unverified rare-card rows by copying base. Validation checks each delivered card number, clean subject, historical team, subset and variant.

BCP independently checks all 300 base identities and all seventy regular insert identities, plus the SAMPLE autograph and its print run. CC independently enumerates all 300 base-equivalent names and historical teams, including named subsets; these cross-check against all 300 canonical base rows. Every retrieved PMG/Gem Masters row cross-checks against the same-number base subject, team and subset. The parallel namespaces have minor Jr. punctuation differences; normalized identity comparison preserves each clean catalogued display name. Explicit BCP aliases reconcile Dave Justice/David Justice, Bob Higginson/Bobby Higginson, Bob Abreu/Bobby Abreu and Dennis Reyes/Dennys Reyes.

[Beckett's indexed catalog description](https://www.beckett.com/baseball/1999/metal-universe/) independently confirms 300 base cards, eight-card packs, the subset ranges and the pack-issued Drew /35. Its [indexed checklist article](https://www.beckett.com/news/1999-metal-universe-baseball-cards/) supports insert odds and teams but the full article currently returns 404. Supporting indexed evidence is documented as such; it is not represented as a successfully downloaded second full article. TCDB's PMG change log returned 403; public comments contained no explanation for the discrepancy below.

## Unresolved PMG checklist discrepancy

The actual current [TCDB Precious Metal Gems namespace](https://www.tcdb.com/Checklist.cfm/sid/11533/1999-Metal-Universe-Precious-Metal-Gems) explicitly reports **297 cards**, with page counts 100 + 100 + 97 and complete consecutive IDs #1–297. This is not a retrieval failure or an unparsed-row shortcut. BCP, CC and indexed Beckett describe a 300-card PMG parallel including checklists, and CC explicitly lists these three:

| Disputed PMG number | Alternate catalog subject | Team | Import status |
|---|---|---|---|
| 298 | Ken Griffey Jr. | Seattle Mariners | Excluded pending evidence |
| 299 | Kerry Wood | Chicago Cubs | Excluded pending evidence |
| 300 | Alex Rodriguez | Seattle Mariners | Excluded pending evidence |

No physical scan or authoritative explanation resolved this conflict. An alternate catalog entry establishes a claim, not certainty of physical existence. Do not silently extrapolate these three /50 rows from base, and do not claim that TCDB omission proves they never existed. The snapshot retains the alternate full 300-card CC inventory and the exact three disputed subjects/teams. The import includes only the 297 directly retrieved current PMG records. `review.checklistScope=PENDING_THREE_DISPUTED_PMG_CHECKLIST_CARDS` and release review remains blocked. A future correction can add these three to the same ProductSet if verified; no collector split or duplicate family is necessary.

Gem Masters is separately catalogued as 300 cards by its actual TCDB namespace, and BCP explicitly includes its checklists. All 300 Gem Masters rows are delivered and independently compared against base. The PMG conflict is not used to truncate a different checklist without evidence.

## Subsets, true rookies and team validation

Base and parallel subset ranges are:

- Caught on the Fly: #233–247 (15).
- Building Blocks: #248–272 (25).
- MLPD: #273–297 (25).
- Player checklist cards: #298–300 (three, present in base and Gem Masters; disputed/excluded for PMG).

These remain inside their full numbered collector families. MLPD's gold foil is part of the base design, not proof of a PMG parallel. Beckett groups #273–300 under MLPD in prose; the more specific final-three checklist designation follows the catalog rows and actual checklist scan. No duplicated subset ProductSets.

No true RC is marked in canonical base, the [separately fetched rookie index](https://www.tcdb.com/Rookies.cfm/sid/1314/1999-Metal-Universe), or the complete BCP and CC lists. The rookie page explicitly reports zero records, rather than merely failing to return rows. Building Blocks and Neophytes labels do not confer true rookie status. The generated CSV has **zero RC suffixes**, including J.D. Drew, and no inferred insert/parallel RCs.

All 968 delivered rows have historical teams, including the three player-specific base checklists and their Gem Masters versions. No blank teams or invented League/MLB placeholders. Preserve the actual card-era affiliations: base Randy Johnson is Houston, Roger Clemens Toronto, Mo Vaughn Boston and Albert Belle Chicago White Sox. Do not replace them with later 1999 teams.

Paul Konerko requires an intentional card-specific distinction: base #111 and its parallels identify Cincinnati Reds, while Neophytes #7 NP identifies **Chicago White Sox**. The actual insert back shows the White Sox logo despite a Reds-uniform photo. Preserve White Sox on the insert and put the pictured-uniform detail in variant. Three Neophytes subjects absent from base—Scott Elarton, Ricky Ledee and Richard Hidalgo—retain their separately retrieved insert teams (Houston, New York Yankees and Houston respectively), with explicit anchors rather than an invented base match.

Clean player names exclude FLY/BB/MLPD/CL/AU/SN source tags. Descriptive subset names, one-of-one/serial run, autograph authentication, die-cut/lenticular attributes and relevant uniform notes belong in subset or variant. Collector numbers preserve actual source spacing: NP/BW/PM have a space; DS/LP do not. SAMPLE is the actual Drew identifier. No set odds appear in card variants.

## Autograph versus promotional issues

The TCDB index has one separately identified packed-out card: **SAMPLE J.D. Drew AU, SN35**, St. Louis Cardinals. BCP's autograph section and indexed Beckett independently identify 35 hand-numbered sample cards randomly inserted in packs, with an embossed SkyBox authentication seal. Include that one-card autograph family, with its /35 metadata and unknown pack denominator. No direct scan of this scarce /35 was available in the reviewed sources; the identity, pack origin and run rely on concordant catalog descriptions, not a misidentified promo image.

The unsigned six-card dealer/media sample sheet and the **325 signed sheets** from the Hawaii Trade Conference are different issues. Only Drew signed those sheets; some were later cut into singles. The catalogued /325 Drew single and signed/unsigned panels are retained in the source snapshot as exclusion evidence, **not imported into the pack product**. They must not be substituted for the /35 autograph or turned into six autograph-card families. Samples and Samples Panels source namespaces were both retrieved and validated.

Boyz With the Wood can be folded into another display form; this is one physical card, not a second printed parallel. Planet Metal's holographic design and the holographic PMG/Gem Masters finishes do not establish any additional standalone hologram set. No unrelated 1999 SkyBox Molten Metal or non-baseball cards are mixed into this product.

## Pack configuration and odds limits

Original pack/box scans verify **eight cards per pack / 24 Hobby packs per box**, single series. Pack text confirms PMG /50 and one-of-one Gem Masters; inspected PMG #1 back shows 12 OF 50, and Gem Masters #35 back has the one-of-one stamp. The inspected retail blaster says eight packs plus one bonus pack; it is not the 24-pack Hobby configuration. BCP separately describes a twenty-pack retail box format. The default VCS product uses Hobby.

| Family | Verified historical denominator | VCS oddsPerPack |
|---|---:|---:|
| Neophytes | 1:6 | 6 |
| Boyz With the Wood | 1:18 | 18 |
| Planet Metal | 1:36 | 36 |
| Diamond Soul | 1:72 | 72 |
| Linchpins | 1:360 | 360 |
| Precious Metal Gems | Unknown; Hobby exclusive, /50 | null |
| Gem Masters | Unknown; 1/1 | null |
| J.D. Drew Autograph | Unknown; /35 | null |

Unknown denominators are **not invented from print runs**. Those three rare families remain in Admin for pricing and image work but are inactive in pack pulls until verified odds are configured. Existing VCS uses independent ProductSet hit rolls replacing base slots and uniform card availability within a family; physical hit positions and exact collation are not reproduced. Prices and images remain pending; initial pack price zero is the standard unpriced draft field, not a retail valuation. Product stays `released:false`; scope conflict, rare odds and release QA remain pending.

## Validation performed

The standalone generator enforces exact number inventories, unique rows, clean subjects, every historical team, subset ranges, no unverified RCs, /50 versus 1/1 versus /35 metadata, parallel correspondence, all independent name/team listings and source namespaces. Every linked source card row must parse; source failures stop before atomic output replacement. Live refresh retrieves all required sources, checks the explicitly empty rookie list and validates the hashes of eleven reviewed original scans. The PMG 297/300 conflict cannot silently clear or backfill.

Whole-token and parser tests preserve suffix-looking names, separate captions, handle mixed suffix IDs and SAMPLE, and reject wrong namespaces/unrecognized linked rows. Fifteen deliberately corrupted cases must fail: missing/duplicate base, wrong name/team, missing team, wrong subset, false RC/index, wrong PMG/Gem print run, missing Gem checklist, fabricated disputed PMG, substituted /325 autograph, incorrect Konerko affiliation and wrong parallel namespace.

The actual VCS Prisma importer passed against an empty disposable local PostgreSQL-compatible database. Dry run writes nothing; a non-checklist missing team rejects before mutation; all 968 cards/nine sets import with correct kind flags/odds; every persisted player/team/subset/variant equals the CSV; no disputed PMG #298–300 is inserted; /35 autograph and distinct Konerko teams are checked. Rerun creates no duplicates and preserves sentinel prices, book values and images. Released remains false, and a released manifest is rejected. All 30 current unit tests, pack metadata tests, checklist grade tests and CSV smoke test passed; integration-test ESLint passed. No production database or deployment was used.

Offline reproduction: `python scripts/generate-1999-metal-universe-baseball.py --check`. Live revalidation: add `--refresh-sources`. Importer integration: `SET_FACTORY_TEST_DATABASE_URL=postgresql://.../mu99_set_factory_test node scripts/test-1999-metal-universe-baseball.mjs` (localhost only; schema already applied to an empty disposable database).
