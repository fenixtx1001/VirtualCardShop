# 2001 Topps Stars Baseball — unreleased Set Factory draft

Completed inventory: **817 actual cards in eleven collector families**, ready for Admin pricing and image harvesting. The product remains **unreleased**. No production database access or deployment.

## Inventory and HTA Hobby rates

| Family | Cards | Serial/run attribute | Draft denominator |
|---|---:|---|---:|
| Base | 200 | None | Base pool |
| Gold | 200 | Serial /499 | 9 |
| Onyx | 200 | Serial /99 | 48 |
| Elimination | 134 | Reported 100 copies, not serial numbered | 72 |
| Progression | 9 | None | 8 |
| Player's Choice Awards | 10 | None | 12 |
| Player's Choice Awards Relics | 10 | Ticket pieces | 530 |
| Game Gear Jerseys | 15 | Player-worn | 61 |
| Game Gear Bats | 21 | Game-used | 187 |
| Autographs | 13 | Certified signatures | 353 |
| Game Gear Autographed Relics | 5 | Serial /25 | null: mixed material rates |
| **Total** | **817** | | |

The signed relics remain one complete five-card checklist. No artificial split into separate bat and jersey ProductSets solely to reproduce their odds.

## Source coverage and full comparisons

- [TCDB base checklist](https://www.tcdb.com/Checklist.cfm/sid/1501/2001-Topps-Stars?PageIndex=1): both 100-card pages. All full [Gold](https://www.tcdb.com/Checklist.cfm/sid/13136/2001-Topps-Stars-Gold?PageIndex=1), [Onyx](https://www.tcdb.com/Checklist.cfm/sid/13137/2001-Topps-Stars-Onyx?PageIndex=1) and [Elimination](https://www.tcdb.com/Checklist.cfm/sid/13132/2001-Topps-Stars-Elimination?PageIndex=1) pages separately retrieved, not extrapolated. Every other family fetched from its own namespace.
- [Complete related-set index](https://www.tcdb.com/Inserts.cfm/sid/1501/2001-Topps-Stars): ten related families, base separate. No extra verified promo, hologram or other parallel family is present in the reviewed scope.
- [BaseballCardPedia](https://baseballcardpedia.com/index.php/2001_Topps_Stars): all nine independent base/insert/Elimination subject rosters compared by number and subject, including every person on multi-player cards; serial/print-run attributes, physical insertion table and material descriptions checked. Full Gold/Onyx identities and teams also compared against independently verified base slots.
- [MyCardBatch full tables](https://mycardbatch.com/checklists/topps-stars-2001-baseball): all **417** explicit number-name-team tuples checked, not just its headline. Adding the two full 200-card parallel rosters gives 817. Shared-team multi-player cards list distinct franchises rather than duplicating the same team for each pictured person.
- [Separate rookie index](https://www.tcdb.com/Rookies.cfm/sid/1501/2001-Topps-Stars): every rookie number/name/team compared to base and the full independent numbered roster.
- [Distributor listing](https://www.dacardworld.com/sports-cards/2001-topps-stars-baseball-hobby-box): independently corroborates **24 packs per box, six nominal cards per pack**. [Beckett](https://www.beckett.com/baseball/2001/topps-stars/) also describes the six-card product and broad 1–150 veteran/151–200 prospect division.
- Nine original card/packaging images inspected and hashed: awards ticket front/back, Elimination front/back, Bonds signed jersey front/back, Progression P7 front/back and box front. Exact URLs, SHA256 hashes and observations retained. No full 817-card physical scan audit is claimed.

Raw source records, notes and hashes remain intact in `.source.json`; corrections are applied to output explicitly. Live revalidation compares complete records and reviewed image hashes. Missing pages, unexpected attributes or changed scope fail closed before a CSV write.

## True rookie and subset audit

The BCP prose says 22 rookies, but **both detailed numbered rosters support 21**:

`179,180,181,182,183,185,186,187,188,189,190,191,192,193,194,195,196,197,198,199,200`.

Do not manufacture a twenty-second RC for #184 Derek Thompson or #178 Scott Heard. The verified headliners include #196 Jose Reyes, #198 Albert Pujols and #200 Jake Peavy. Only these 21 base subjects receive ` RC`; no RC inheritance to parallels, inserts or signatures.

Keep one 200-card base collector checklist. Metadata distinguishes Veterans #1–141, the nine retired Hall of Famers #142–150, and Rookies/Prospects #151–200. The retired players remain base, not a new short-print pool. There is no verified base SP range.

Base #180 is catalogued as **Odanis Ayala** with an error caption giving **Odannys**; both full parallels use **Odannis Ayala**. Preserve clean source-specific subjects and the original base printing-error note; use explicit comparison aliases without asserting a newly discovered corrected printing or adding variants.

## Elimination integrity

The full partial-parallel inventory is **#1–141 except 24,53,54,59,60,81,96,110, plus #198 Albert Pujols**. It is not a 200-card parallel and is not renumbered 1–134. Each full row was fetched independently and matched to its corresponding base subject/team.

Reported production is 100 copies per card, **not stamped /100**. The original back contains Star Stats Elimination contest rules and an entry form. The historical contest is expired; no present-day prize or redemption service is implied. These remain genuine collector cards in the draft, not deleted as obsolete tickets.

## Materials, numbering and team corrections

**Player's Choice Awards Relics are ticket stubs.** Original PCAR-1 shows a Paris Las Vegas ticket printed **2000 Players Choice Awards**. Its reverse explicitly identifies authentic ticket material but refers to **2001** awards. Preserve the observed year discrepancy on that card; do not turn the material into a jersey/bat relic. The printed reverse code **PCAR-1** confirms the hyphen; BCP's PCAR1 style is normalized for comparison.

Game Gear Jerseys are **player-worn**, as documented by the source and the Bonds signed-jersey original. Do not upgrade that provenance to game-worn. Game Gear Bats are game-used. All five signed relics have /25 metadata, with jerseys TSRA-BB/TH and bats TSRA-CP/RF/TL. Plain Autographs remain a separate 13-card family; some originally packed as exchanges expiring April 30, 2003. Actual catalogue signature subjects remain, without duplicate paper redemption entries. These thirteen were verified by complete catalogues, not all individually scanned.

Multi-player cards retain all subjects and historical franchises. Source order can differ for PCA1/PCA5; independent subject comparison uses full multisets while output preserves ordered TCDB player/team strings. Unique team lists are intentional on shared-team cards such as PCA7 and PCA8. Preserve award-season affiliations: PCA3 Alex Rodriguez is Seattle, and PCAR-10 Andres Galarraga is Atlanta, even where 2001 current-team base cards differ.

Explicit corrections:

- **PCA6:** `Seatle Mariners` becomes **Seattle Mariners**; raw typo retained in source.
- **Progression P7:** source says Los Angeles for Duke Snider. Original front/back show him in a **Brooklyn B cap**. Use Brooklyn Dodgers as the era affiliation, matching his base/autograph club; retain the raw source city and image-based decision for review. The other subjects remain Jim Edmonds/St. Louis and Vernon Wells/Toronto.
- **Progression P8:** BCP's Rich Anderson is a subject typo; complete TCDB/team tables identify **Ryan Anderson**, matching the relevant Seattle prospect.

Limited name aliases handle punctuation, Jr. forms, Bob/Bobby, Dave/David, Ron/Ronnie and Ben/Bengie Molina. Display fields never contain UER, serial-run captions, material descriptions or odds. All 817 cards have real historical teams; no generic league placeholders or blank teams.

## Pack model and release gates

This was an HTA Hobby-only product, modeled as **24 packs × six nominal cards**. The reviewed packaging image is a **box front**, not a legible wrapper odds panel; pack counts are corroborated by catalogue/distributor evidence rather than falsely attributed to the box-front scan.

Aggregate jersey 1:61 and bat 1:187 rates are published. Their internal groups are jerseys 1:71/1:472 and bats 1:216/1:1368. Preserve each collector family and flatten internal card scarcity under existing VCS conventions. Group odds belong in source/bundle notes, not per-card variants.

Signed relics differ by material: **jerseys 1:19,288; bats 1:12,240**. A single verified integer denominator for the whole five-card family is unavailable. Its odds remain **null**, with the exact physical rates documented; no arbitrary averaging, rounding or collector-family split. Release requires pack/collation QA or an approved treatment for that mixed family, plus pricing and reviewed images.

`status: DRAFT`, `product.released: false`, `review.release: BLOCKED_PENDING_QA` remain. Review metadata does not replace the actual unreleased flag. No production database changes or deployment occurred.

## Validation and reproduction

Executed generator, actual 817-row CSV and byte-for-byte regeneration; live full-source revalidation. Whole-token surname cleanup/checklist-team exception tested; eighteen source-corruption cases and three unsafe manifest cases rejected. Bounded source failures fail closed.

The **actual importer** passed against an empty disposable local PGlite PostgreSQL-compatible server: dry-run writes nothing; missing-team gate rejects before writes; apply creates one unreleased product/eleven sets/817 cards; every stored CSV field compared; rerun inserts no duplicates and preserves sentinel prices/images; released manifest rejected. All 30 repository tests, open-pack metadata, best-grade checklist, importer smoke and targeted ESLint passed.

```bash
python3 scripts/generate-2001-topps-stars-baseball.py --check
python3 scripts/generate-2001-topps-stars-baseball.py --refresh-sources --check
```

Integration requires an empty **local** database named `ts01_set_factory_test`; it never falls back to shell `DATABASE_URL`:

```bash
SET_FACTORY_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/ts01_set_factory_test' node scripts/test-2001-topps-stars-baseball.mjs
```

Use `npm run import:set-bundle -- <bundle>` for dry-run; append `--apply` for the unreleased Admin draft. The completed CSV, bundle, source snapshot, generator, integration test and this research note are committed together.
