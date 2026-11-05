# 1998 Fleer Tradition Baseball — draft audit

Audit date: November 4, 2026 (America/Chicago); source timestamps use UTC, November 5. This is an unreleased Set Factory import for pricing and image harvesting. It is **not a claim that every possible pack issue is verified**. The rare Flashback exchange inventory remains a scope blocker; pack collation and some odds also require review. No production database was accessed or changed.

## Delivered inventory

| Collector family | Cards | Treatment |
|---|---:|---|
| Base | 600 | Unified #1–600; 25 true RCs |
| Vintage '63 | 128 | #1–126 plus two unnumbered checklists |
| Classic '63 | 128 | #1C–126C plus NNO1C/NNO2C, all /63 |
| Decade of Excellence | 12 | Insert |
| Decade of Excellence Rare Traditions | 12 | Foil parallel; not serial numbered |
| Diamond Ink 1 Point | 10 | Unsigned points tokens |
| Diamond Ink 5 Points | 10 | Unsigned points tokens |
| Diamond Ink 10 Points | 10 | Unsigned points tokens |
| Diamond Ink 25 Points | 10 | Unsigned points tokens |
| Diamond Standouts | 20 | Insert |
| Diamond Tribute | 10 | Insert |
| In the Clutch | 15 | Insert |
| Lumber Company | 15 | Retail-only insert |
| Mickey Mantle Monumental Moments | 10 | Insert |
| Mickey Mantle Monumental Moments Gold | 10 | /51 parallel |
| Promising Forecasts | 20 | Insert |
| Rookie Sensations | 20 | Insert; title does not establish true RC |
| The Power Game | 20 | Insert |
| Zone | 15 | Insert |
| Million Dollar Moments | 50 | Original shared 1997–98 game cards |
| **Total** | **1,125** | **20 complete catalogued families** |

## Evidence and corrections

Canonical [TCDB checklist](https://www.tcdb.com/Checklist.cfm/sid/1149/1998-Fleer-Tradition), separately fetched [rookie index](https://www.tcdb.com/Rookies.cfm/sid/1149/1998-Fleer-Tradition), [insert index](https://www.tcdb.com/Inserts.cfm/sid/1149/1998-Fleer-Tradition), and [BaseballCardPedia](https://baseballcardpedia.com/index.php/1998_Fleer_Tradition) were reviewed. Source snapshot contains full parsed records, namespace-specific URLs, retrieval date and original-response SHA-256 hashes. Each parallel and insert has its own source namespace, not an extrapolated checklist. TCDB team affiliations are preserved, apart from explicitly documented teamless tokens. BCP independently checks base and published insert identities; parallel identities/teams also cross-check against their regular counterparts. BCP nickname and Jr. punctuation differences are narrowly normalized in the generator.

- The source parser initially omitted Classic unnumbered headers. It now rejects any linked card row it cannot parse; both NNO1C and NNO2C are present, producing **128**, not 126, Classic cards. Vintage unnumbered checklist ranges get stable VCS IDs NNO-A/NNO-B. These are identifiers, not invented printed numbers.
- Preserve suffix-bearing collector numbers such as `1 DE`, `1 MM`, `1C`, and `1 MMG`. Diamond Ink cards are genuinely unnumbered; stable alphabetical NNO-01..NNO-10 identifiers are local to each denomination family.
- Both Mantle and Phil Rizzuto appear on Monumental Moments #3, as independently listed by BCP and confirmed on the actual card scan. Correct regular 3 MM and its Gold counterpart 3 MMG to `Mickey Mantle / Phil Rizzuto` despite TCDB's Mantle-only label.
- Base #63 Darrin Fletcher has no 1997 Debut badge on the reviewed card scan; discard TCDB's erroneous MLD annotation. Base #36 Curtis King does have that badge. Do not convert debut/subset labels into true rookies.
- Mike Piazza appears as a Dodger (#200), Marlin (#391) and Met (#503). Preserve the actual source affiliations, including Marlins on In the Clutch/Diamond Tribute and Mets on Vintage #97.
- Source RC marks agree exactly across TCDB base, separate rookie index and BCP: **25**. Base numbers: 36, 88, 92, 95, 123, 147, 149, 151, 159, 186, 212, 235, 269, 273, 294, 295, 400, 402, 425, 480, 499, 506, 513, 554, 558. No inferred RC suffixes on parallels or inserts.
- Complete base subsets remain within one base collector family: Smoke 'n Heat 301–310; Golden Memories 311–320; Tale of the Tape 321–340; player checklist cards 341–350 and 571–575; Unforgettable Moments 576–600. Golden Memories has **10** cards; BCP's odds-table total of 20 is erroneous. Golden/Tale/Unforgettable SP notes are retained, but availability is flattened per existing Set Factory convention. Smoke SP classification conflicts between descriptions; no invented rate or definitive rarity note.
- The dead Fleer-specific Million Dollar Moments namespace was replaced with [the actual shared 50-card original issue](https://www.tcdb.com/Checklist.cfm/sid/59564/1997-98-Fleer-Million-Dollar-Moments). All 50 names independently match BCP. Cards 46–50 are scarce, but remain within the full collector list. Returned Exchange backs marked as not official game cards are separate and excluded.

## Diamond Ink and blank teams

[Program description](https://baseballcardpedia.com/index.php/1998_Fleer_Diamond_Ink) establishes ten players, four denominations, a 500-point player-specific exchange and the Maddux Series 1 restriction. TCDB has four independently retrieved ten-card denomination lists; all four rosters agree. The program page does not publish a separate full roster, so player enumeration relies on those catalogued lists. Reviewed front/back token scans show player names with no franchise. These are **unsigned redemption tokens for autographed baseballs**, not autograph trading cards. Prize baseballs are excluded.

Exactly 45 blank teams are intentional: forty points tokens and five generic checklist cards (two Vintage, two Classic, Million Dollar Moments #1). No inferred current or historical franchise is inserted on points tokens. `review.teamData=PENDING` and `--allow-pending-teams` stage these real teamless objects for Admin review. The importer still rejects an unflagged apply.

## Scope exclusions and unresolved blocker

BCP and indexed Beckett descriptions mention **50 hand-numbered Fleer Flashback Exchange cards**, redeemable for framed uncut sheets from 1981–1993. No reliable individual number/subject inventory or readable scan was located. A print quantity of 50 does not prove fifty unique subjects. Do not invent fifty rows, thirteen year-specific rows or a generic single card. This issue is **excluded from the 1,125-card payload** and explicitly blocks any assertion of exhaustive pack-issued scope. `review.checklistScope=PENDING_FLASHBACK_INVENTORY`.

Other exclusions are substantiated separate issues: Tradition Update; sample Alex Rodriguez cards and the 750 signed samples inserted in **Ultra Series 2**, rather than Tradition; Mantle dealer postcards and SportsFest/NSCC promos; 23KT McGwire; Diamond Skills giveaway sheets, hand-cut singles and competition cards; redeemed autographed baseballs; Million Dollar Moments Exchange backs. No verified pack-issued autograph trading-card family is added to this product.

## Pack configuration and odds limitations

Draft product has 12 slots and 36 packs/box. BCP and indexed Beckett descriptions say 12-card Hobby packs, but the [reviewed Series 2 Hobby wrapper](https://www.tcdb.com/Images/Packaging/Baseball/1149Pack92047Large.jpg) says **10 Major League Baseball cards**. Whether extras explain the difference is unverified. The wrapper also confirms Classic /63 and Mantle Gold /51. Retail blasters have a separately described 10-card/14-pack format. Exact physical total and collation remain pending.

This single combined-series product explicitly assumes an equal 50/50 series design mix, not measured historical supply. Known series-specific Hobby denominators are doubled; this is a simulation design choice. Vintage is one per Hobby pack in both series. Known physical rates are: S1 Decade 1:72, Rare Traditions 1:720, Standouts 1:12, Clutch 1:20, Rookie Sensations 1:18, Zone 1:288, Million Dollar Moments one per pack; S2 Tribute 1:300, Mantle 1:68, Promising Forecasts 1:12, Power Game 1:36. Lumber Company is S1 retail 1:36 and is inactive under the Hobby default. Exact Classic and Mantle Gold odds are unknown and remain null.

Diamond Ink is documented as one points card per pack **in aggregate**, but denomination and player frequencies are unknown. All four family odds remain null until an aggregate-pool model is reviewed. No fabricated equal shares or four guaranteed token pulls. ProductSet-only odds, independent replacement rolls, flattened within-family rarity and lack of series correlations follow existing implementation limits; this draft does not claim physical-pack fidelity. Review states for pack collation, aggregate/rare odds, Flashback scope, teamless tokens, pricing and images remain pending. Release is false and blocked pending QA.

## Validation

The standalone generator checks every row's number, player, historical team, subset, variant and true RC against the captured source records; exact identity sets, expected totals, unique keys, blank-team whitelist, serial runs and parallel correspondence are enforced. Source refresh reparses entire retrieved card rows, validates set namespaces, checks independent listings and requires unchanged reviewed scan hashes. Errors fail closed before any output replacement. Twelve deliberately corrupted source cases must fail; parser tests cover unnumbered/suffix IDs, invalid namespaces, unknown linked rows and whole-token names.

The actual VCS Prisma importer was exercised against an empty disposable local PostgreSQL-compatible database: dry run writes nothing; pending-team apply rejects; flagged apply imports all 1,125 cards/20 sets; all four metadata fields of every persisted card equal the CSV; true rookies, team blanks, serial headers and multi-player cards are checked; rerun adds no duplicates and preserves sentinel prices and images; released stays false; a released manifest rejects. All 30 existing unit tests passed, along with pack metadata, checklist grade and import smoke checks. Integration test lint passed. Production database and deployment were untouched.

Reproduce offline validation: `python scripts/generate-1998-fleer-tradition-baseball.py --check`. Full live retrieval: add `--refresh-sources`. Disposable integration test: `SET_FACTORY_TEST_DATABASE_URL=postgresql://.../ft98_set_factory_test node scripts/test-1998-fleer-tradition-baseball.mjs` (localhost only, schema already applied, empty database required).
