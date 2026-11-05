# 1998 Circa Thunder Baseball draft audit

Research date: 2026-11-05. Product ID: `1998_Circa_Thunder_Baseball`.
The delivered CSV contains 976 explicit cards across nine complete collector
families. Product remains an unreleased draft for pricing and image harvesting.
No production database was accessed and no deployment was performed.

## Inventory and Hobby configuration

| Family | Cards | Serial run | Hobby denominator |
| --- | ---: | --- | ---: |
| Base | 300 | — | Base |
| Rave | 296 | /150 | 36 |
| Super Rave | 296 | /25 | 216 |
| Boss | 20 | — | 6 |
| Fast Track | 10 | — | 24 |
| Limited Access | 15 | — | Null: retail-only |
| Quick Strike | 12 | — | 36 |
| Rave Reviews | 15 | — | 288 |
| Thunder Boomers | 12 | — | 96 |
| **Total** | **976** | | |

Hobby default: 36 packs per box, eight cards per pack. Limited Access was
retail-only at 1:18; retain its full collector checklist with null Hobby odds
for pricing and image harvesting. Do not mix a retail-only insert into Hobby
packs. Other stored denominators are verified against the source ratio table
and TCDB related-set descriptions. VCS independent insert rolls replace base
slots; they do not reproduce physical pack positions or guarantee box hits.

## Sources and scope

The source JSON preserves 28 normalized source sections with exact URLs,
retrieval date and SHA-256 hashes. All three pages of each base/parallel family
and all six insert lists were independently retrieved. No parallel was created
by blindly copying base rows.

- [TCDB base checklist](https://www.tcdb.com/Checklist.cfm/sid/1122/1998-Circa-Thunder?PageIndex=1)
  and [related-set index](https://www.tcdb.com/Inserts.cfm/sid/1122/1998-Circa-Thunder).
- Independent [BaseballCardPedia checklist and odds](https://baseballcardpedia.com/index.php/1998_Circa_Thunder):
  all 300 base identities, all 84 named insert identities, parallel sizes/runs,
  Hobby/retail distinction, pack configuration and promotional exclusions.
- [Complete supplementary tables](https://mycardbatch.com/checklists/circa-thunder-1998-baseball):
  all 384 base/insert number-name-team tuples, not one-row insert previews.
- [Separate rookie index](https://www.tcdb.com/Rookies.cfm/sid/1122/1998-Circa-Thunder)
  checked against base and BCP.
- [Beckett base description](https://www.beckett.com/baseball/1998/circa-thunder/)
  independently explains Grissom's erroneous #8, the regular 300-card issue,
  eight-card packs and pre-release Ripken promotional sample.
- [Beckett Super Rave description](https://www.beckett.com/baseball/1998/circa-thunder-super-rave/)
  confirms 296 cards, absence of all four checklists, /25 sparkling gold foil,
  and approximate 1:216 insertion. The
  [Rave set description](https://marketplace.beckett.com/item/1082/1998-circa-thunder-rave-110-wilson-alvarez_68044859)
  confirms 296, /150 sparkling silver foil, no checklists and about 1:36.
- [BBC Exchange Hobby box listing](https://bbcexchange.com/products/1998-skybox-circa-thunder-baseball-box-h)
  corroborates 36 packs of eight cards.

## Numbering and checklist cards

The Grissom base card occupies intended collector slot #280 but erroneously
prints #8, also used by Cal Ripken Jr. TCDB uses `8b`; generation normalizes
that local identifier to **8B**, distinct from Ripken's **8**. The CSV variant
records printed #8, intended slot #280 and the reason for the disambiguator.
The letter B is not claimed to be printed. No corrected base #280 is invented.
BCP lists the same Grissom card under intended slot 280 with its error note.
The two parallel catalogues identify Grissom as 280; each is compared against
base 8B for player and team. These parallel catalogue IDs are not a claim that
their physical backs were individually inspected.

The four featured-player checklist cards stay in the base family:

| Number | Player | Team | Catalogue checklist range |
| --- | --- | --- | --- |
| 297 | Frank Thomas | Chicago White Sox | 1–99 |
| 298 | Alex Rodriguez | Seattle Mariners | 100–198 |
| 299 | Ken Griffey, Jr. | Seattle Mariners | 199–296 |
| 300 | Jose Cruz, Jr. | Toronto Blue Jays | 297–300 and inserts |

Names remain clean; `Checklist` is subset metadata and the range is variant
metadata. All four have meaningful player franchises and keep them. They are
not separate generic inserts and do not require blank-team exceptions.
Neither Rave nor Super Rave contains #297–300; each is exactly 296 cards.

Printed insert identifiers are retained: `1B`, `1 FT`, `1LA`, `1 QS`, `1RR`,
`1TB`. BCP omits the Fast Track suffix and spaces some other suffixes differently;
comparison explicitly maps those catalogue formats rather than inventing rows.

## Players, teams and rookies

Exactly four true base RCs agree across base, rookie index and independent BCP:
#48 Rich Butler, #133 Mike Lowell, #175 Magglio Ordonez, #198 Rolando Arrojo.
No RC tags are inferred from retailer marketing lists, player age, an insert
theme or a parallel of a rookie-year card. Parallels/inserts have no RC suffix.

Every one of the 384 base/insert tuples matches the supplementary team tables.
Each of the 592 parallel tuples matches the corresponding base identity/team,
including the Grissom mapping. All insert teams also match their base subjects.
Historical affiliations include Piazza Dodgers, Clemens Toronto, Randy Johnson
Seattle, Lowell Yankees, Galarraga Atlanta and McGriff Tampa Bay. No modern
franchises, generic league labels or blank teams were substituted.

Limited name reconciliation handles David/Dave Justice, Bobby/Bob Higginson,
Bobby/Bob Abreu, Rod/Roderick Myers, Javy/Javier Lopez, Sandy Alomar's junior
suffix, and punctuation around Jr. The displayed subject is consistent across
families for the latter variants. Rod Myers is the Royals outfielder, not
Rodney Myers, the Cubs pitcher. Whole-token cleanup preserves surnames such as
Boswell, Marshall and Hall; source UER/CL/SN/PR/SAM tags are never removed by
trimming arbitrary trailing letters.

## Exclusions and verification limits

Exclude Ripken's pre-release promotional sample and Scott Rolen SF1, distributed
at SportsFest '98 with a published quantity of 5000. BCP's `P8` is a promotional
catalogue prefix; it does not create another pack-issued base card. The regular
Ripken #8 and Rolen #144 remain. No unsupported autograph, memorabilia, separate
hologram family or other-year Thunder issue was added.

This is a complete **catalogue-based checklist/metadata audit**, not a physical
scan-by-scan audit. Attempts to retrieve additional card/package scans were
interrupted by workspace/network failures. No completed visual review is
claimed and no scan hashes are presented as reviewed evidence. Raw scan assets
are not included in this import. Card/pack images and physical collation QA
remain pending. Prices start unset/zero with automatic pack pricing enabled,
images null, `released: false`; release remains blocked until Admin QA.

## Validation

- Actual 976-card CSV generated and compared byte-for-byte with regeneration.
  Exact family inventories, unique collector IDs, names, historical teams,
  featured checklist ranges, four RCs, parallel serial runs and set odds audited.
- Strict linked-row/namespace parser and bounded retrieval retries fail closed;
  invalid or missing sources do not produce a partial CSV. `--refresh-sources
  --check` re-fetches the listing evidence and checks exact generated card bytes.
- Whole-token/caption/suffix tests, 17 source corruption cases and three manifest
  safety cases. Includes Grissom identity, checklist teams/ranges, incomplete
  parallels, wrong subjects/teams/RCs/runs/odds and retail-only odds rejection.
- Real repository importer dry run, apply and rerun in an empty disposable local
  PGlite PostgreSQL-compatible database using the repository Prisma schema.
  All 976 imported rows checked field-by-field; nine families, four RCs, zero
  blank teams, Grissom and checklist metadata verified. Rerun adds no duplicates
  and preserves sentinel prices/images and unreleased state. Released manifests
  and missing-team data reject. No production credentials used.
- Thirty repository unit tests, pack metadata, checklist best-grade and import
  smoke checks passed. ESLint passed for the new integration test.

Reproduce the checklist audit:

```bash
python3 scripts/generate-1998-circa-thunder-baseball.py --check
python3 scripts/generate-1998-circa-thunder-baseball.py --refresh-sources --check
```

Integration: `node scripts/test-1998-circa-thunder-baseball.mjs`, with an empty
local PostgreSQL-compatible database named `ct98_set_factory_test` supplied as
`SET_FACTORY_TEST_DATABASE_URL`. The harness rejects remote hosts, another
database name or pre-existing products/cards, and disconnects its assertion
client before each importer subprocess to support single-connection servers.
